import React, { useState, useEffect, useRef } from 'react';
import { CalendarEvent, Agent, LogEntry, EventStatus, EventCategory } from '../types';
import { X, Play, Clock, CheckCircle, Terminal, Wand2, Wifi, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { classifyTask } from '../services/geminiService';
import { executeAgentTask, checkServerHealth } from '../services/api';

const CATEGORY_STYLES: Record<string, string> = {
  communication: 'bg-gradient-to-br from-indigo-500 to-violet-600 border-indigo-400/30',
  engineering: 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400/30',
  research: 'bg-gradient-to-br from-amber-500 to-orange-600 border-amber-400/30',
  design: 'bg-gradient-to-br from-pink-500 to-rose-600 border-pink-400/30',
  marketing: 'bg-gradient-to-br from-cyan-500 to-blue-600 border-cyan-400/30',
  admin: 'bg-gradient-to-br from-slate-500 to-gray-600 border-slate-400/30',
  other: 'bg-gradient-to-br from-purple-500 to-fuchsia-600 border-purple-400/30',
};

interface EventModalProps {
  event: CalendarEvent;
  agents: Agent[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedEvent: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  googleUserEmail?: string | null;
}

const EventModal: React.FC<EventModalProps> = ({
  event,
  agents,
  isOpen,
  onClose,
  onSave,
  onDelete,
  googleUserEmail
}) => {
  const [title, setTitle] = useState(event.title);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(event.agentId || '');
  const [status, setStatus] = useState<EventStatus>(event.status);
  const [logs, setLogs] = useState<LogEntry[]>(event.logs);
  const [category, setCategory] = useState<EventCategory>(event.category);
  const [isProcessing, setIsProcessing] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(event.title);
      setSelectedAgentId(event.agentId || '');
      setStatus(event.status);
      setLogs(event.logs);
      setCategory(event.category || 'other');
      checkServerHealth().then(health => {
        setServerOnline(health !== null && health.anthropicConfigured);
      });
    }
  }, [event, isOpen]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!isOpen || !title || title === event.title) return;
    const timeoutId = setTimeout(async () => {
      const newCategory = await classifyTask(title);
      setCategory(newCategory);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [title, isOpen]);

  if (!isOpen) return null;

  const handleRunAgent = async () => {
    if (!selectedAgentId) return;

    const agent = agents.find(a => a.id === selectedAgentId);
    if (!agent) return;

    setIsProcessing(true);
    setStatus(EventStatus.IN_PROGRESS);
    setLogs([]);

    const health = await checkServerHealth();

    if (health && health.anthropicConfigured) {
      await executeAgentTask(
        title,
        agent.name,
        agent.role,
        googleUserEmail || null,
        (log) => {
          setLogs(prev => [...prev, log]);
        },
        (success) => {
          const finalStatus = success ? EventStatus.COMPLETED : EventStatus.FAILED;
          setStatus(finalStatus);
          setIsProcessing(false);
          onSave({
            ...event,
            title,
            agentId: selectedAgentId,
            status: finalStatus,
            logs: logs,
            category
          });
        }
      );
    } else {
      setLogs([{
        id: '1',
        timestamp: new Date().toISOString(),
        message: 'Backend server not available. Please start the server with: cd server && npm install && npm run dev',
        type: 'error'
      }]);
      setStatus(EventStatus.FAILED);
      setIsProcessing(false);
    }
  };

  const handleSave = () => {
    onSave({
      ...event,
      title,
      agentId: selectedAgentId,
      status,
      logs,
      category
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 transition-all">
      <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200/50 flex justify-between items-center bg-white/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium bg-slate-100/50 px-3 py-1 rounded-full">
              <Clock className="w-4 h-4" />
              {format(event.start, 'MMM d, h:mm a')} - {format(event.end, 'h:mm a')}
            </div>
            {category && (
              <span className={`text-xs font-semibold px-2 py-1 rounded-full uppercase tracking-wide text-white ${CATEGORY_STYLES[category]}`}>
                {category}
              </span>
            )}
            {serverOnline !== null && (
              <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                serverOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {serverOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {serverOnline ? 'Server Online' : 'Server Offline'}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row h-full overflow-hidden">
          <div className="p-6 flex-1 flex flex-col gap-6 overflow-y-auto">
            <div className="group">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Task Directive</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xl font-semibold text-slate-900 bg-transparent border-none p-0 focus:ring-0 placeholder-slate-300 transition-colors"
                placeholder="Describe the task for the agent..."
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Assign Agent</label>
              <div className="space-y-2">
                {agents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 group ${
                      selectedAgentId === agent.id
                        ? 'border-indigo-500 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500/20'
                        : 'border-slate-200 hover:border-indigo-300 hover:bg-white/60 bg-white/40'
                    }`}
                  >
                    <img src={agent.avatar} alt={agent.name} className="w-10 h-10 rounded-full shadow-sm" />
                    <div>
                      <div className={`text-sm font-semibold transition-colors ${selectedAgentId === agent.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                        {agent.name}
                      </div>
                      <div className="text-xs text-slate-500">{agent.role}</div>
                    </div>
                    {selectedAgentId === agent.id && (
                      <div className="ml-auto text-indigo-600">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {!googleUserEmail && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <p className="font-semibold">Gmail not connected</p>
                <p className="mt-1 text-amber-700">Connect your Google account to enable email tasks.</p>
              </div>
            )}

            <div className="mt-auto flex gap-3 pt-6 border-t border-slate-200/60">
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 active:scale-95"
              >
                Save Configuration
              </button>
              <button
                onClick={() => onDelete(event.id)}
                className="px-4 py-2.5 text-red-600 bg-red-50 hover:bg-red-100 text-sm font-semibold rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="w-full md:w-80 bg-slate-50/50 border-l border-slate-200/60 flex flex-col h-full backdrop-blur-sm">
            <div className="p-4 border-b border-slate-200/60 bg-white/40">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Live Output</h3>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  status === EventStatus.COMPLETED ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  status === EventStatus.IN_PROGRESS ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' :
                  status === EventStatus.FAILED ? 'bg-red-50 text-red-700 border-red-200' :
                  'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {status.replace('_', ' ')}
                </span>
              </div>

              <button
                onClick={handleRunAgent}
                disabled={!selectedAgentId || isProcessing}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md ${
                  !selectedAgentId || isProcessing
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 hover:shadow-lg hover:shadow-indigo-500/25 active:scale-95'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Wand2 className="w-4 h-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    Execute with Claude
                  </>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-3">
                    <Terminal className="w-8 h-8 opacity-40" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">Awaiting Execution</p>
                  <p className="text-xs mt-1 opacity-70">Run the agent to see real-time logs.</p>
                </div>
              ) : (
                <div className="space-y-4 relative">
                  <div className="absolute left-2.5 top-2 bottom-2 w-px bg-slate-200" />
                  {logs.map((log) => (
                    <div key={log.id} className="relative pl-7 group">
                      <div className="absolute left-0.5 top-1.5 w-4 h-4 rounded-full bg-white border border-slate-200 flex items-center justify-center z-10 shadow-sm group-hover:scale-110 transition-transform">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          log.type === 'success' ? 'bg-emerald-500' :
                          log.type === 'error' ? 'bg-red-500' :
                          log.type === 'warning' ? 'bg-amber-500' :
                          'bg-indigo-500'
                        }`} />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 rounded">
                            {format(new Date(log.timestamp), 'HH:mm:ss')}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed font-medium">{log.message}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventModal;
