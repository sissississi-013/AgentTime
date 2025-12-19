import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;
const TOKEN_FILE = join(__dirname, '.tokens.json');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `http://localhost:${PORT}/auth/google/callback`
);

// Persist tokens to file so they survive server restarts
const loadTokens = () => {
  try {
    if (existsSync(TOKEN_FILE)) {
      const data = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
      return new Map(Object.entries(data));
    }
  } catch (e) {
    console.error('Failed to load tokens:', e.message);
  }
  return new Map();
};

const saveTokens = (store) => {
  try {
    const obj = Object.fromEntries(store);
    writeFileSync(TOKEN_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('Failed to save tokens:', e.message);
  }
};

const tokenStore = loadTokens();

app.get('/auth/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
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
    saveTokens(tokenStore);

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
    saveTokens(tokenStore);
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
  {
    name: 'get_calendar_events',
    description: 'Retrieve events from Google Calendar. Can specify time range and calendar.',
    input_schema: {
      type: 'object',
      properties: {
        timeMin: {
          type: 'string',
          description: 'Start time for events (ISO 8601 format, e.g., "2024-01-15T00:00:00Z"). Defaults to now.',
        },
        timeMax: {
          type: 'string',
          description: 'End time for events (ISO 8601 format). Defaults to 7 days from now.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of events to retrieve (default 10)',
        },
        calendarId: {
          type: 'string',
          description: 'Calendar ID to query (default "primary")',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new event on Google Calendar',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title/summary' },
        description: { type: 'string', description: 'Event description' },
        startTime: { type: 'string', description: 'Start time (ISO 8601 format, e.g., "2024-01-15T10:00:00-08:00")' },
        endTime: { type: 'string', description: 'End time (ISO 8601 format)' },
        location: { type: 'string', description: 'Event location (optional)' },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of attendee email addresses (optional)',
        },
      },
      required: ['summary', 'startTime', 'endTime'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for information on a topic. Use this for research tasks to find current news, articles, and information.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find information about',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_webpage',
    description: 'Fetch and read the content of a webpage. Use this to get detailed information from a specific URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the webpage to fetch',
        },
      },
      required: ['url'],
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

    case 'get_calendar_events': {
      if (!userEmail || !tokenStore.has(userEmail)) {
        return { error: 'Google Calendar not connected. Please connect your Google account first.' };
      }
      const { tokens } = tokenStore.get(userEmail);
      oauth2Client.setCredentials(tokens);

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const response = await calendar.events.list({
        calendarId: toolInput.calendarId || 'primary',
        timeMin: toolInput.timeMin || now.toISOString(),
        timeMax: toolInput.timeMax || weekFromNow.toISOString(),
        maxResults: toolInput.maxResults || 10,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = (response.data.items || []).map(event => ({
        id: event.id,
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        attendees: event.attendees?.map(a => ({ email: a.email, name: a.displayName, status: a.responseStatus })),
        htmlLink: event.htmlLink,
      }));

      return { events, count: events.length };
    }

    case 'create_calendar_event': {
      if (!userEmail || !tokenStore.has(userEmail)) {
        return { error: 'Google Calendar not connected. Please connect your Google account first.' };
      }
      const { tokens } = tokenStore.get(userEmail);
      oauth2Client.setCredentials(tokens);

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const event = {
        summary: toolInput.summary,
        description: toolInput.description,
        location: toolInput.location,
        start: {
          dateTime: toolInput.startTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: toolInput.endTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };

      if (toolInput.attendees && toolInput.attendees.length > 0) {
        event.attendees = toolInput.attendees.map(email => ({ email }));
      }

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
        sendUpdates: toolInput.attendees ? 'all' : 'none',
      });

      return {
        success: true,
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
        summary: response.data.summary,
        start: response.data.start?.dateTime,
        end: response.data.end?.dateTime,
      };
    }

    case 'web_search': {
      const query = encodeURIComponent(toolInput.query);
      const maxResults = toolInput.maxResults || 5;

      try {
        // Use DuckDuckGo HTML search
        const searchUrl = `https://html.duckduckgo.com/html/?q=${query}`;
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        const html = await response.text();

        // Parse results from HTML
        const results = [];
        const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let match;

        while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
          const url = match[1];
          const title = match[2].replace(/<[^>]+>/g, '').trim();
          const snippet = match[3].replace(/<[^>]+>/g, '').trim();

          if (url && title) {
            results.push({ title, url, snippet });
          }
        }

        // Fallback: try alternative parsing if no results
        if (results.length === 0) {
          const altRegex = /<a rel="nofollow" class="result__url" href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
          while ((match = altRegex.exec(html)) !== null && results.length < maxResults) {
            results.push({
              title: match[2].trim(),
              url: match[1],
              snippet: 'No snippet available',
            });
          }
        }

        return {
          query: toolInput.query,
          results,
          count: results.length,
        };
      } catch (error) {
        return { error: `Web search failed: ${error.message}` };
      }
    }

    case 'fetch_webpage': {
      try {
        const response = await fetch(toolInput.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          timeout: 10000,
        });

        if (!response.ok) {
          return { error: `Failed to fetch: HTTP ${response.status}` };
        }

        const html = await response.text();

        // Extract text content from HTML
        let text = html
          // Remove scripts and styles
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          // Remove HTML tags
          .replace(/<[^>]+>/g, ' ')
          // Decode HTML entities
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          // Clean up whitespace
          .replace(/\s+/g, ' ')
          .trim();

        // Limit content length
        if (text.length > 8000) {
          text = text.substring(0, 8000) + '... [content truncated]';
        }

        // Try to extract title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : 'Unknown';

        return {
          url: toolInput.url,
          title,
          content: text,
          contentLength: text.length,
        };
      } catch (error) {
        return { error: `Failed to fetch webpage: ${error.message}` };
      }
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

  const sendEvent = (eventType, data) => {
    res.write(`data: ${JSON.stringify({ eventType, ...data })}\n\n`);
  };

  try {
    sendEvent('log', { message: `Starting task execution...`, type: 'info', timestamp: new Date().toISOString() });
    sendEvent('log', { message: `Agent "${agentName}" (${agentRole}) is analyzing the task...`, type: 'info', timestamp: new Date().toISOString() });

    // Role-specific instructions
    const isResearchRole = agentRole.toLowerCase().includes('research') || agentName.toLowerCase().includes('research');
    const isEmailRole = agentRole.toLowerCase().includes('email') || agentRole.toLowerCase().includes('communication') || agentRole.toLowerCase().includes('assistant');
    const isCalendarRole = agentRole.toLowerCase().includes('calendar') || agentRole.toLowerCase().includes('schedule');

    let roleInstructions = '';
    if (isResearchRole) {
      roleInstructions = `
As a Research Analyst, your primary tools are:
- web_search: Search the internet for current information, news, and articles
- fetch_webpage: Read full content from specific URLs you find

DO NOT use email or calendar tools. Focus on web research to gather information and provide comprehensive reports.
When researching, search for multiple sources and synthesize the information into a clear summary.`;
    } else if (isEmailRole) {
      roleInstructions = `
Your primary tools for communication tasks are:
- get_emails: Read emails from the inbox
- send_email: Send emails to recipients

Available integrations:
- Gmail: ${userEmail ? 'Connected as ' + userEmail : 'Not connected'}`;
    } else if (isCalendarRole) {
      roleInstructions = `
Your primary tools for scheduling tasks are:
- get_calendar_events: View upcoming calendar events
- create_calendar_event: Create new calendar events

Available integrations:
- Google Calendar: ${userEmail ? 'Connected as ' + userEmail : 'Not connected'}`;
    } else {
      roleInstructions = `
Available integrations:
- Gmail: ${userEmail ? 'Connected as ' + userEmail : 'Not connected'}
- Google Calendar: ${userEmail ? 'Connected as ' + userEmail : 'Not connected'}
- Web Research: Always available (web_search, fetch_webpage)`;
    }

    const systemPrompt = `You are ${agentName}, an AI agent with the role of ${agentRole}.
You are executing a task scheduled by your user on their AgentTime calendar.

Your job is to:
1. Understand the task thoroughly
2. Use the appropriate tools for your role to complete it
3. Log your progress using the log_progress tool
4. Be thorough but efficient
${roleInstructions}

Always start by logging what you're about to do, then execute, then log the result.
If an integration is not connected but needed, inform the user via a log message.

When presenting results, use markdown formatting for better readability:
- Use **bold** for important items
- Use bullet points for lists
- Use \`code\` for technical terms
- Use headers (##) to organize sections`;

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
            } else if (block.name === 'get_calendar_events' && result.events) {
              sendEvent('log', { message: `Retrieved ${result.events.length} calendar events`, type: 'success', timestamp: new Date().toISOString() });
            } else if (block.name === 'create_calendar_event' && result.success) {
              sendEvent('log', { message: `Calendar event created: "${result.summary}"`, type: 'success', timestamp: new Date().toISOString() });
            } else if (block.name === 'web_search' && result.results) {
              sendEvent('log', { message: `Found ${result.count} search results for "${result.query}"`, type: 'success', timestamp: new Date().toISOString() });
            } else if (block.name === 'fetch_webpage' && result.content) {
              sendEvent('log', { message: `Fetched webpage: "${result.title}" (${result.contentLength} chars)`, type: 'success', timestamp: new Date().toISOString() });
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
