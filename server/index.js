import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `http://localhost:${PORT}/auth/google/callback`
);

const tokenStore = new Map();

app.get('/auth/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });

  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    const userId = userInfo.data.email;
    tokenStore.set(userId, {
      tokens,
      userInfo: userInfo.data,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}?auth=success&email=${encodeURIComponent(userId)}&name=${encodeURIComponent(userInfo.data.name || '')}`);
  } catch (error) {
    console.error('OAuth error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}?auth=error&message=${encodeURIComponent(error.message)}`);
  }
});

app.get('/auth/status', (req, res) => {
  const email = req.query.email;
  if (email && tokenStore.has(email)) {
    const data = tokenStore.get(email);
    res.json({
      authenticated: true,
      email: data.userInfo.email,
      name: data.userInfo.name,
      picture: data.userInfo.picture,
    });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/auth/google/disconnect', (req, res) => {
  const { email } = req.body;
  if (email && tokenStore.has(email)) {
    tokenStore.delete(email);
    res.json({ success: true });
  } else {
    res.json({ success: false, error: 'Not connected' });
  }
});

const tools = [
  {
    name: 'get_emails',
    description: 'Retrieve emails from Gmail inbox. Can filter by query.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Gmail search query (e.g., "is:unread", "from:someone@email.com")',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of emails to retrieve (default 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email via Gmail',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body content' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'log_progress',
    description: 'Log progress or status update for the current task',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Progress message to log' },
        type: { type: 'string', enum: ['info', 'success', 'warning', 'error'], description: 'Type of log message' },
      },
      required: ['message'],
    },
  },
];

async function executeTool(toolName, toolInput, userEmail) {
  switch (toolName) {
    case 'get_emails': {
      if (!userEmail || !tokenStore.has(userEmail)) {
        return { error: 'Gmail not connected. Please connect your Google account first.' };
      }
      const { tokens } = tokenStore.get(userEmail);
      oauth2Client.setCredentials(tokens);

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        maxResults: toolInput.maxResults || 10,
        q: toolInput.query || 'is:unread',
      });

      const messages = listResponse.data.messages || [];
      const fullMessages = await Promise.all(
        messages.slice(0, 5).map(async (msg) => {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          });

          const headers = detail.data.payload?.headers || [];
          const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

          let body = '';
          if (detail.data.payload?.body?.data) {
            body = Buffer.from(detail.data.payload.body.data, 'base64').toString('utf-8');
          } else if (detail.data.payload?.parts) {
            const textPart = detail.data.payload.parts.find(p => p.mimeType === 'text/plain');
            if (textPart?.body?.data) {
              body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
            }
          }

          return {
            id: msg.id,
            subject: getHeader('Subject'),
            from: getHeader('From'),
            date: getHeader('Date'),
            snippet: detail.data.snippet,
            body: body.substring(0, 500),
          };
        })
      );

      return { emails: fullMessages, count: messages.length };
    }

    case 'send_email': {
      if (!userEmail || !tokenStore.has(userEmail)) {
        return { error: 'Gmail not connected. Please connect your Google account first.' };
      }
      const { tokens } = tokenStore.get(userEmail);
      oauth2Client.setCredentials(tokens);

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      const emailContent = [
        `To: ${toolInput.to}`,
        `Subject: ${toolInput.subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        toolInput.body,
      ].join('\n');

      const encodedEmail = Buffer.from(emailContent).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedEmail },
      });

      return { success: true, messageId: response.data.id };
    }

    case 'log_progress': {
      return { logged: true, message: toolInput.message, type: toolInput.type || 'info' };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

app.post('/agent/execute', async (req, res) => {
  const { task, agentName, agentRole, userEmail } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    sendEvent('log', { message: `Starting task execution...`, type: 'info', timestamp: new Date().toISOString() });
    sendEvent('log', { message: `Agent "${agentName}" (${agentRole}) is analyzing the task...`, type: 'info', timestamp: new Date().toISOString() });

    const systemPrompt = `You are ${agentName}, an AI agent with the role of ${agentRole}.
You are executing a task scheduled by your user on their AgentTime calendar.

Your job is to:
1. Understand the task thoroughly
2. Use the available tools to complete it
3. Log your progress using the log_progress tool
4. Be thorough but efficient

Available integrations:
- Gmail: ${userEmail ? 'Connected as ' + userEmail : 'Not connected'}

Always start by logging what you're about to do, then execute, then log the result.
If Gmail is not connected but needed, inform the user via a log message.`;

    let messages = [{ role: 'user', content: `Execute this task: ${task}` }];
    let continueLoop = true;
    let iterations = 0;
    const maxIterations = 10;

    while (continueLoop && iterations < maxIterations) {
      iterations++;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: tools,
        messages: messages,
      });

      let hasToolUse = false;
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          sendEvent('log', { message: block.text, type: 'info', timestamp: new Date().toISOString() });
        } else if (block.type === 'tool_use') {
          hasToolUse = true;
          sendEvent('log', { message: `Using tool: ${block.name}`, type: 'info', timestamp: new Date().toISOString() });

          try {
            const result = await executeTool(block.name, block.input, userEmail);

            if (block.name === 'log_progress') {
              sendEvent('log', { message: block.input.message, type: block.input.type || 'info', timestamp: new Date().toISOString() });
            } else if (block.name === 'get_emails' && result.emails) {
              sendEvent('log', { message: `Retrieved ${result.emails.length} emails (${result.count} total matching)`, type: 'success', timestamp: new Date().toISOString() });
            } else if (block.name === 'send_email' && result.success) {
              sendEvent('log', { message: `Email sent successfully`, type: 'success', timestamp: new Date().toISOString() });
            } else if (result.error) {
              sendEvent('log', { message: `Tool error: ${result.error}`, type: 'error', timestamp: new Date().toISOString() });
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            sendEvent('log', { message: `Tool execution failed: ${error.message}`, type: 'error', timestamp: new Date().toISOString() });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({ error: error.message }),
              is_error: true,
            });
          }
        }
      }

      if (hasToolUse) {
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
      }

      if (response.stop_reason === 'end_turn' && !hasToolUse) {
        continueLoop = false;
      } else if (!hasToolUse) {
        continueLoop = false;
      }
    }

    sendEvent('log', { message: 'Task execution completed', type: 'success', timestamp: new Date().toISOString() });
    sendEvent('complete', { success: true });
    res.end();

  } catch (error) {
    console.error('Agent execution error:', error);
    sendEvent('log', { message: `Execution failed: ${error.message}`, type: 'error', timestamp: new Date().toISOString() });
    sendEvent('complete', { success: false, error: error.message });
    res.end();
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
  });
});

app.listen(PORT, () => {
  console.log(`\nAgentTime Server running on http://localhost:${PORT}`);
  console.log(`\nStatus:`);
  console.log(`   - Anthropic API: ${process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`   - Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Not configured (add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env)'}`);
});
