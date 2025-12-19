const API_BASE = 'http://localhost:3001';

export interface GoogleUser {
  email: string;
  name: string;
  picture?: string;
}

export async function checkGoogleAuth(email: string): Promise<GoogleUser | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/status?email=${encodeURIComponent(email)}`);
    const data = await response.json();
    if (data.authenticated) {
      return {
        email: data.email,
        name: data.name,
        picture: data.picture,
      };
    }
    return null;
  } catch (error) {
    console.error('Failed to check auth status:', error);
    return null;
  }
}

export function startGoogleOAuth() {
  window.location.href = `${API_BASE}/auth/google`;
}

export async function disconnectGoogle(email: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/google/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Failed to disconnect:', error);
    return false;
  }
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export async function executeAgentTask(
  task: string,
  agentName: string,
  agentRole: string,
  userEmail: string | null,
  onLog: (log: LogEntry) => void,
  onComplete: (success: boolean) => void
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/agent/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task,
        agentName,
        agentRole,
        userEmail,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body');
    }

    let buffer = '';
    let logCounter = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'log') {
              onLog({
                id: `log-${++logCounter}`,
                timestamp: data.timestamp,
                message: data.message,
                type: data.type === 'log' ? (data.type as any) : data.type,
              });
            } else if (data.type === 'complete') {
              onComplete(data.success);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  } catch (error) {
    console.error('Agent execution error:', error);
    onLog({
      id: 'error',
      timestamp: new Date().toISOString(),
      message: `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      type: 'error',
    });
    onComplete(false);
  }
}

export async function checkServerHealth(): Promise<{
  status: string;
  googleConfigured: boolean;
  anthropicConfigured: boolean;
} | null> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return await response.json();
  } catch (error) {
    console.error('Server health check failed:', error);
    return null;
  }
}
