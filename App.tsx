import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  addDays,
  startOfWeek,
  format,
  isSameDay,
  addHours,
  startOfDay
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  Bot,
  Zap,
  Wifi,
  WifiOff,
  User
} from 'lucide-react';

import { MOCK_AGENTS, HOURS, DAYS, MOCK_INTEGRATIONS, CATEGORY_STYLES } from './constants';
import { CalendarEvent, EventStatus, Agent, Integration } from './types';
import EventModal from './components/EventModal';
import IntegrationModal from './components/IntegrationModal';
import { classifyTask } from './services/geminiService';
import { checkGoogleAuth, checkServerHealth } from './services/api';

const STORAGE_KEYS = {
  EVENTS: 'agenttime_events',
  GOOGLE_USER: 'agenttime_google_user',
};

const serializeEvents = (events: CalendarEvent[]): string => {
  return JSON.stringify(events.map(e => ({
    ...e,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
  })));
};

const deserializeEvents = (json: string): CalendarEvent[] => {
  const parsed = JSON.parse(json);
  return parsed.map((e: any) => ({
    ...e,
    start: new Date(e.start),
    end: new Date(e.end),
  }));
};

interface GoogleUser {
  email: string;
  name: string;
  picture?: string;
}

const App: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [agents] = useState<Agent[]>(MOCK_AGENTS);
  const [integrations, setIntegrations] = useState<Integration[]>(MOCK_INTEGRATIONS);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [now, setNow] = useState(new Date());
  const [isDragging, setIsDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ dayIndex: number; hour: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ dayIndex: number; hour: number } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });

  useEffect(() => {
    checkServerHealth().then(health => {
      setServerOnline(health !== null);
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get('auth');
    const email = params.get('email');
    const name = params.get('name');

    if (authStatus === 'success' && email) {
      const user: GoogleUser = { email, name: name || email };
      setGoogleUser(user);
      localStorage.setItem(STORAGE_KEYS.GOOGLE_USER, JSON.stringify(user));
      setIntegrations(prev => prev.map(i =>
        i.id === 'google' ? { ...i, connected: true } : i
      ));
      window.history.replaceState({}, '', window.location.pathname);
    } else if (authStatus === 'error') {
      console.error('OAuth error:', params.get('message'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const savedEvents = localStorage.getItem(STORAGE_KEYS.EVENTS);
    if (savedEvents) {
      try {
        const parsed = deserializeEvents(savedEvents);
        setEvents(parsed);
      } catch (e) {
        console.error('Failed to load events:', e);
      }
    } else {
      const today = new Date();
      const demoEvent: CalendarEvent = {
        id: uuidv4(),
        title: "Morning Briefing",
        start: addHours(startOfDay(today), 9),
        end: addHours(startOfDay(today), 10),
        agentId: 'agent-1',
        status: EventStatus.COMPLETED,
        category: 'communication',
        logs: [
          { id: '1', timestamp: new Date().toISOString(), message: 'Connected to Gmail API', type: 'info' },
          { id: '2', timestamp: new Date().toISOString(), message: 'Found 12 unread high-priority emails', type: 'success' },
          { id: '3', timestamp: new Date().toISOString(), message: 'Drafted summaries for user review', type: 'success' },
        ]
      };
      setEvents([demoEvent]);
    }

    const savedGoogleUser = localStorage.getItem(STORAGE_KEYS.GOOGLE_USER);
    if (savedGoogleUser) {
      try {
        const user = JSON.parse(savedGoogleUser);
        setGoogleUser(user);
        checkGoogleAuth(user.email).then(validUser => {
          if (validUser) {
            setGoogleUser(validUser);
            setIntegrations(prev => prev.map(i =>
              i.id === 'google' ? { ...i, connected: true } : i
            ));
          } else {
            localStorage.removeItem(STORAGE_KEYS.GOOGLE_USER);
            setGoogleUser(null);
          }
        });
      } catch (e) {
        console.error('Failed to load Google user:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (events.length > 0) {
      localStorage.setItem(STORAGE_KEYS.EVENTS, serializeEvents(events));
    }
  }, [events]);

  const handleMouseDown = (dayIndex: number, hour: number) => {
    setIsDragging(true);
    setSelectionStart({ dayIndex, hour });
    setSelectionEnd({ dayIndex, hour });
  };

  const handleMouseEnter = (dayIndex: number, hour: number) => {
    if (isDragging && selectionStart) {
      if (dayIndex === selectionStart.dayIndex) {
        setSelectionEnd({ dayIndex, hour });
      }
    }
  };

  const handleMouseUp = async () => {
    if (isDragging && selectionStart && selectionEnd) {
      setIsDragging(false);
      const startHour = Math.min(selectionStart.hour, selectionEnd.hour);
      const endHour = Math.max(selectionStart.hour, selectionEnd.hour) + 1;
      const dayDate = addDays(weekStart, selectionStart.dayIndex);
      const start = addHours(startOfDay(dayDate), startHour);
      const end = addHours(startOfDay(dayDate), endHour);

      const newEvent: CalendarEvent = {
        id: uuidv4(),
        title: "New Agent Task",
        start,
        end,
        status: EventStatus.SCHEDULED,
        category: 'other',
        logs: []
      };

      setEvents([...events, newEvent]);
      setSelectedEvent(newEvent);
      setIsEventModalOpen(true);
    }
    setSelectionStart(null);
    setSelectionEnd(null);
    setIsDragging(false);
  };

  const handleIntegrationClick = (integration: Integration) => {
    setSelectedIntegration(integration);
  };

  const handleConnectIntegration = (id: string, credentials: Record<string, string>) => {
    setIntegrations(prev => prev.map(i =>
      i.id === id ? { ...i, connected: true, credentials } : i
    ));
  };

  const handleDisconnectIntegration = (id: string) => {
    setIntegrations(prev => prev.map(i =>
      i.id === id ? { ...i, connected: false, credentials: undefined } : i
    ));
    if (id === 'google') {
      setGoogleUser(null);
      localStorage.removeItem(STORAGE_KEYS.GOOGLE_USER);
    }
  };

  const handleUpdateEvent = (updated: CalendarEvent) => {
    setEvents(events.map(e => e.id === updated.id ? updated : e));
  };

  const handleDeleteEvent = (id: string) => {
    setEvents(events.filter(e => e.id !== id));
    setIsEventModalOpen(false);
  };

  const getEventStyle = (event: CalendarEvent) => {
    const startHour = event.start.getHours() + (event.start.getMinutes() / 60);
    const endHour = event.end.getHours() + (event.end.getMinutes() / 60);
    const duration = endHour - startHour;
    const categoryStyle = CATEGORY_STYLES[event.category] || CATEGORY_STYLES['other'];

    return {
      top: `${startHour * 80}px`,
      height: `${duration * 80}px`,
      className: `absolute inset-x-1.5 rounded-lg px-3 py-2 text-xs border backdrop-blur-md shadow-lg transition-all z-10 overflow-hidden hover:scale-[1.02] hover:z-20 cursor-pointer ${categoryStyle}`
    };
  };

  return (
    <div className="flex h-screen w-full bg-[#f8fafc] text-slate-900 overflow-hidden font-sans">
      <div className="w-72 border-r border-slate-200/60 flex-shrink-0 flex flex-col bg-white/50 backdrop-blur-md z-30 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-2xl font-bold flex items-center gap-3 text-slate-800 tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
              <Bot className="w-5 h-5" />
            </div>
            AgentTime
          </h1>
          <p className="text-xs font-medium text-slate-400 mt-2 tracking-wide uppercase">AI Workforce Orchestration</p>
          <div className={`mt-3 flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full w-fit ${
            serverOnline === null ? 'bg-slate-100 text-slate-500' :
            serverOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {serverOnline === null ? (
              <>Checking server...</>
            ) : serverOnline ? (
              <><Wifi className="w-3 h-3" /> Backend Online</>
            ) : (
              <><WifiOff className="w-3 h-3" /> Backend Offline</>
            )}
          </div>
        </div>

        <div className="p-4 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
          {googleUser && (
            <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl p-4 border border-indigo-100">
              <div className="flex items-center gap-3">
                {googleUser.picture ? (
                  <img src={googleUser.picture} alt={googleUser.name} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                    <User className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{googleUser.name}</div>
                  <div className="text-xs text-slate-500 truncate">{googleUser.email}</div>
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Active Agents</h2>
              <button className="text-slate-400 hover:text-indigo-600 transition-colors"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              {agents.map(agent => (
                <div key={agent.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white hover:shadow-md hover:shadow-slate-200/50 transition-all border border-transparent hover:border-slate-100 group cursor-pointer">
                  <div className="relative">
                    <img src={agent.avatar} alt={agent.name} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                      agent.status === 'IDLE' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate text-slate-800 group-hover:text-indigo-900 transition-colors">{agent.name}</div>
                    <div className="text-xs text-slate-500 truncate">{agent.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Connected Tools</h2>
              <button className="text-slate-400 hover:text-indigo-600 transition-colors"><Settings className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2">
              {integrations.map(int => {
                const isGoogleConnected = int.id === 'google' && googleUser;
                return (
                  <div
                    key={int.id}
                    onClick={() => handleIntegrationClick(int)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                      isGoogleConnected || int.connected
                        ? 'bg-white border-slate-200 shadow-sm hover:shadow-md'
                        : 'bg-slate-50 border-transparent hover:bg-slate-100 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isGoogleConnected || int.connected ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {int.icon}
                      </div>
                      <div>
                        <span className={`text-sm font-medium ${isGoogleConnected || int.connected ? 'text-slate-800' : 'text-slate-500'}`}>{int.name}</span>
                        {isGoogleConnected && (
                          <div className="text-xs text-slate-400 truncate max-w-[120px]">{googleUser.email}</div>
                        )}
                      </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${isGoogleConnected || int.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-white relative">
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-white/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="flex items-center gap-6">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
              {format(currentDate, 'MMMM yyyy')}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Today
              </button>
              <div className="flex items-center rounded-lg bg-slate-50 border border-slate-200 p-0.5">
                <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-600">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-600">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex -space-x-3 hover:space-x-1 transition-all">
              {agents.map(a => (
                <img key={a.id} src={a.avatar} alt={a.name} className="w-9 h-9 rounded-full border-2 border-white shadow-sm relative z-10 hover:z-20 hover:scale-110 transition-transform cursor-pointer" />
              ))}
              <div className="w-9 h-9 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-xs text-slate-500 font-bold relative z-0">+2</div>
            </div>
            <div className="h-8 w-px bg-slate-200 mx-2" />
            <button className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl shadow-lg shadow-slate-900/20 hover:bg-slate-800 text-sm font-semibold transition-all hover:-translate-y-0.5 active:translate-y-0">
              <CalendarIcon className="w-4 h-4" />
              <span>Sync Schedules</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto relative flex flex-col no-scrollbar select-none bg-white" onMouseUp={handleMouseUp}>
          <div className="flex border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-sm z-30 shadow-sm">
            <div className="w-20 flex-shrink-0 border-r border-slate-100 bg-slate-50/50" />
            {DAYS.map((day, i) => {
              const date = addDays(weekStart, i);
              const isToday = isSameDay(date, new Date());
              return (
                <div key={day} className={`flex-1 py-4 text-center border-r border-slate-100 transition-colors ${isToday ? 'bg-slate-50/30' : ''}`}>
                  <div className={`text-xs font-bold uppercase mb-1.5 tracking-wider ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>{day}</div>
                  <div className={`text-2xl font-bold w-10 h-10 flex items-center justify-center mx-auto rounded-full transition-all ${isToday ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30' : 'text-slate-700 hover:bg-slate-100'}`}>
                    {format(date, 'd')}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex relative min-h-0">
            <div className="w-20 flex-shrink-0 border-r border-slate-100 bg-slate-50/30 select-none z-20">
              {HOURS.map(hour => (
                <div key={hour} className="h-20 text-xs font-medium text-slate-400 text-right pr-3 pt-2 border-b border-transparent relative">
                  <span className="-mt-3 block">{hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}</span>
                </div>
              ))}
            </div>

            <div className="flex-1 flex relative">
              <div className="absolute inset-0 flex flex-col pointer-events-none z-0">
                {HOURS.map(hour => (
                  <div key={hour} className="h-20 border-b border-slate-100/80 w-full" />
                ))}
              </div>
              <div className="absolute inset-0 flex pointer-events-none z-0">
                {DAYS.map((_, i) => (
                  <div key={i} className="flex-1 border-r border-slate-100/80 h-full" />
                ))}
              </div>

              {DAYS.map((_, dayIndex) => {
                const dayDate = addDays(weekStart, dayIndex);
                const dayEvents = events.filter(e => isSameDay(e.start, dayDate));
                const isToday = isSameDay(dayDate, now);

                return (
                  <div key={dayIndex} className="flex-1 relative h-[1920px]">
                    {HOURS.map(hour => (
                      <div
                        key={hour}
                        className={`h-20 z-10 hover:bg-indigo-50/30 transition-colors ${
                          isDragging && selectionStart && selectionEnd &&
                          dayIndex === selectionStart.dayIndex &&
                          hour >= Math.min(selectionStart.hour, selectionEnd.hour) &&
                          hour <= Math.max(selectionStart.hour, selectionEnd.hour)
                            ? 'bg-indigo-500/10' : ''
                        }`}
                        onMouseDown={() => handleMouseDown(dayIndex, hour)}
                        onMouseEnter={() => handleMouseEnter(dayIndex, hour)}
                      />
                    ))}

                    {dayEvents.map(event => {
                      const style = getEventStyle(event);
                      return (
                        <div
                          key={event.id}
                          style={{ top: style.top, height: style.height }}
                          className={style.className}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                            setIsEventModalOpen(true);
                          }}
                        >
                          <div className="font-bold leading-tight mb-1 truncate text-sm text-white drop-shadow-md">{event.title}</div>
                          {event.agentId && (
                            <div className="flex items-center gap-1.5 opacity-90 text-white/90">
                              <div className="p-0.5 bg-white/20 rounded">
                                <Bot className="w-3 h-3" />
                              </div>
                              <span className="font-medium drop-shadow-sm">{agents.find(a => a.id === event.agentId)?.name.split(' ')[0]}</span>
                            </div>
                          )}
                          {event.status === EventStatus.COMPLETED && (
                            <div className="absolute bottom-1.5 right-1.5 p-1 bg-white/20 backdrop-blur-sm rounded-full">
                              <Zap className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {isToday && (
                      <div
                        className="absolute z-20 w-full flex items-center pointer-events-none"
                        style={{ top: `${(now.getHours() + now.getMinutes() / 60) * 80}px` }}
                      >
                        <div className="w-3 h-3 rounded-full bg-red-500 -ml-1.5 shadow-sm ring-2 ring-white z-10 animate-pulse"></div>
                        <div className="h-[2px] bg-red-500 w-full shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          agents={agents}
          isOpen={isEventModalOpen}
          onClose={() => setIsEventModalOpen(false)}
          onSave={handleUpdateEvent}
          onDelete={handleDeleteEvent}
          googleUserEmail={googleUser?.email}
        />
      )}

      {selectedIntegration && (
        <IntegrationModal
          integration={selectedIntegration}
          isOpen={!!selectedIntegration}
          onClose={() => setSelectedIntegration(null)}
          onConnect={handleConnectIntegration}
          onDisconnect={handleDisconnectIntegration}
          googleUser={googleUser}
        />
      )}
    </div>
  );
};

export default App;
