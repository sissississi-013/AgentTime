import { Agent, AgentStatus, Integration } from './types';

export const MOCK_AGENTS: Agent[] = [
  {
    id: 'agent-1',
    name: 'Executive Assistant',
    role: 'Communication',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=assistant&backgroundColor=6366f1',
    color: 'indigo',
    status: AgentStatus.IDLE,
    capabilities: ['Email Management', 'Calendar Scheduling', 'Slack Messaging'],
  },
  {
    id: 'agent-2',
    name: 'DevOps Bot',
    role: 'Engineering',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=devops&backgroundColor=10b981',
    color: 'emerald',
    status: AgentStatus.IDLE,
    capabilities: ['GitHub Operations', 'Terminal Commands', 'AWS Management'],
  },
  {
    id: 'agent-3',
    name: 'Research Analyst',
    role: 'Research',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=research&backgroundColor=f59e0b',
    color: 'amber',
    status: AgentStatus.IDLE,
    capabilities: ['Web Search', 'Data Analysis', 'Notion Updates'],
  },
];

export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const MOCK_INTEGRATIONS: Integration[] = [
  {
    id: 'google',
    name: 'Google Workspace',
    icon: 'G',
    description: 'Connect Gmail, Calendar, and Drive to enable email management, scheduling, and document access for your agents.',
    connected: false,
    authType: 'oauth',
    authFields: [],
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: 'S',
    description: 'Enable agents to send messages, read channels, and manage notifications in your Slack workspace.',
    connected: false,
    authType: 'oauth',
    authFields: [],
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'GH',
    description: 'Allow agents to create issues, manage PRs, and interact with your repositories.',
    connected: false,
    authType: 'form',
    authFields: [
      { key: 'token', label: 'Personal Access Token', type: 'password', placeholder: 'ghp_xxxxxxxxxxxx' },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: 'N',
    description: 'Connect Notion to let agents read and update your databases and pages.',
    connected: false,
    authType: 'form',
    authFields: [
      { key: 'token', label: 'Integration Token', type: 'password', placeholder: 'secret_xxxxxxxxxxxx' },
    ],
  },
];

export const CATEGORY_STYLES: Record<string, string> = {
  communication: 'bg-gradient-to-br from-indigo-500 to-violet-600 border-indigo-400/30',
  engineering: 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400/30',
  research: 'bg-gradient-to-br from-amber-500 to-orange-600 border-amber-400/30',
  design: 'bg-gradient-to-br from-pink-500 to-rose-600 border-pink-400/30',
  marketing: 'bg-gradient-to-br from-cyan-500 to-blue-600 border-cyan-400/30',
  admin: 'bg-gradient-to-br from-slate-500 to-gray-600 border-slate-400/30',
  other: 'bg-gradient-to-br from-purple-500 to-fuchsia-600 border-purple-400/30',
};
