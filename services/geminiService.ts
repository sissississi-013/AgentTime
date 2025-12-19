import { EventCategory, LogEntry } from '../types';

const GEMINI_API_KEY = '';

export async function classifyTask(taskDescription: string): Promise<EventCategory> {
  const categories: EventCategory[] = ['communication', 'engineering', 'research', 'design', 'marketing', 'admin', 'other'];

  const keywords: Record<EventCategory, string[]> = {
    communication: ['email', 'message', 'slack', 'reply', 'send', 'notify', 'meeting', 'call'],
    engineering: ['code', 'deploy', 'github', 'bug', 'fix', 'build', 'test', 'review', 'pr'],
    research: ['research', 'analyze', 'find', 'search', 'investigate', 'report', 'data'],
    design: ['design', 'ui', 'ux', 'figma', 'mockup', 'prototype', 'layout'],
    marketing: ['marketing', 'campaign', 'social', 'post', 'content', 'seo', 'ads'],
    admin: ['schedule', 'organize', 'plan', 'book', 'admin', 'manage', 'update'],
    other: [],
  };

  const lowerTask = taskDescription.toLowerCase();

  for (const [category, words] of Object.entries(keywords)) {
    if (words.some(word => lowerTask.includes(word))) {
      return category as EventCategory;
    }
  }

  return 'other';
}

export async function generateAgentLogs(
  taskDescription: string,
  agentRole: string,
  durationMinutes: number
): Promise<LogEntry[]> {
  // Generate mock logs based on task description
  const logs: LogEntry[] = [];
  const now = new Date();

  logs.push({
    id: '1',
    timestamp: new Date(now.getTime()).toISOString(),
    message: `Starting task: ${taskDescription}`,
    type: 'info',
  });

  logs.push({
    id: '2',
    timestamp: new Date(now.getTime() + 5000).toISOString(),
    message: 'Analyzing task requirements...',
    type: 'info',
  });

  logs.push({
    id: '3',
    timestamp: new Date(now.getTime() + 10000).toISOString(),
    message: 'Task analysis complete',
    type: 'success',
  });

  logs.push({
    id: '4',
    timestamp: new Date(now.getTime() + 15000).toISOString(),
    message: 'Executing task...',
    type: 'info',
  });

  logs.push({
    id: '5',
    timestamp: new Date(now.getTime() + 20000).toISOString(),
    message: 'Task completed successfully',
    type: 'success',
  });

  return logs;
}
