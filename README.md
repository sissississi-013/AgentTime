# AgentTime

A calendar interface for scheduling and orchestrating AI agents. Instead of creating events for yourself, you create time blocks for AI agents to execute tasks on your behalf.

## What is this?

AgentTime is built around a simple idea: what if you could schedule AI agents the same way you schedule meetings?

You drag a time block on a calendar, describe what you want done ("reply to all unread emails from yesterday", "summarize the GitHub issues in my repo"), assign an AI agent to the task, and watch it execute with real-time activity logs.

The interface should feel familiar if you've used Google Calendar or Notion Calendar. The difference is that instead of blocking time for yourself, you're delegating work to AI agents that can actually do things - read your emails, interact with your tools, and report back what they accomplished.

## Current State

This is a working prototype. The calendar UI is solid - drag-and-drop time block creation, week view navigation, visual feedback. Events persist in localStorage so they survive page refreshes.

The agent execution is real. When you click "Execute with Claude", it actually calls the Claude API, which can use tools to interact with Gmail (if you've connected your Google account). You get streaming logs showing what the agent is thinking and doing.

What's not built yet: more integrations (Slack, GitHub, Notion are UI-only placeholders), custom agent creation, recurring tasks, and proper database storage.

## Running Locally

You need Node.js installed.

### 1. Clone and install

```bash
git clone https://github.com/sissississi-013/AgentTime.git
cd AgentTime
npm install
cd server && npm install && cd ..
```

### 2. Set up environment variables

Copy the example env file and add your Anthropic API key:

```bash
cp .env.example .env
```

Edit `.env`:
```
ANTHROPIC_API_KEY=your_key_here
```

### 3. Start both servers

Terminal 1 (backend):
```bash
cd server
npm run dev
```

Terminal 2 (frontend):
```bash
npm run dev
```

Frontend runs on http://localhost:3000, backend on http://localhost:3001.

## Setting up Gmail Integration

For agents to actually read and send emails, you need to set up Google OAuth:

1. Go to Google Cloud Console (console.cloud.google.com)
2. Create a project and enable the Gmail API
3. Create OAuth 2.0 credentials (Web application type)
4. Add `http://localhost:3001/auth/google/callback` as an authorized redirect URI
5. Add the client ID and secret to your `.env` file:

```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

Then click "Google Workspace" in the sidebar and sign in. Once connected, agents can access your Gmail.

## How it works

1. Drag on the calendar to create a time block
2. Name your task in natural language
3. Select an agent to assign it to
4. Click "Execute with Claude"
5. Watch the real-time activity log as the agent works

The agent uses Claude's tool use capability to interact with connected services. If Gmail is connected, it can read messages, search by query, and send replies. The logs show exactly what the agent is doing at each step.

## Project Structure

```
AgentTime/
├── App.tsx                 # Main calendar UI
├── components/
│   ├── EventModal.tsx      # Task configuration and execution
│   └── IntegrationModal.tsx # OAuth connection flow
├── services/
│   ├── api.ts              # Frontend API client
│   └── geminiService.ts    # Task classification (optional)
├── server/
│   └── index.js            # Backend: OAuth, agent execution, Gmail API
├── types.ts                # TypeScript definitions
└── constants.ts            # Mock data and styling
```

## What's next

- Agent creation UI: define new agents with natural language descriptions of their capabilities
- More integrations: Slack, GitHub, Notion with real OAuth flows
- Scheduled execution: agents run automatically at their scheduled times
- Persistent storage: move from localStorage to a real database

## License

MIT
