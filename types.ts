export enum EventStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum AgentStatus {
  IDLE = 'IDLE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

export type EventCategory = 'communication' | 'engineering' | 'research' | 'design' | 'marketing' | 'admin' | 'other';

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  agentId?: string;
  status: EventStatus;
  category: EventCategory;
  logs: LogEntry[];
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  color: string;
  status: AgentStatus;
  capabilities: string[];
}

export interface AuthField {
  key: string;
  label: string;
  type: string;
  placeholder: string;
}

export interface Integration {
  id: string;
  name: string;
  icon: string;
  description: string;
  connected: boolean;
  authType: 'oauth' | 'form';
  authFields: AuthField[];
  credentials?: Record<string, string>;
}
