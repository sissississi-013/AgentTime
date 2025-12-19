import React, { useState } from 'react';
import { Integration } from '../types';
import { X, ShieldCheck, Lock, Check, ArrowRight, AlertTriangle } from 'lucide-react';
import { startGoogleOAuth, disconnectGoogle } from '../services/api';

interface IntegrationModalProps {
  integration: Integration;
  isOpen: boolean;
  onClose: () => void;
  onConnect: (id: string, credentials: Record<string, string>) => void;
  onDisconnect: (id: string) => void;
  googleUser?: { email: string; name: string; picture?: string } | null;
}

const IntegrationModal: React.FC<IntegrationModalProps> = ({
  integration,
  isOpen,
  onClose,
  onConnect,
  onDisconnect,
  googleUser
}) => {
  const [credentials, setCredentials] = useState<Record<string, string>>(integration.credentials || {});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleChange = (key: string, value: string) => {
    setCredentials(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      onConnect(integration.id, credentials);
      setIsSubmitting(false);
      onClose();
    }, 1500);
  };

  const handleOAuthConnect = () => {
    if (integration.id === 'google') {
      startGoogleOAuth();
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      onConnect(integration.id, { token: 'mock-oauth-token-123' });
      setIsSubmitting(false);
      onClose();
    }, 2000);
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect? Agents will lose access to this tool.')) {
      return;
    }
    if (integration.id === 'google' && googleUser?.email) {
      await disconnectGoogle(googleUser.email);
    }
    onDisconnect(integration.id);
    onClose();
  };

  const isGoogleConnected = integration.id === 'google' && googleUser?.email;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 transition-all duration-300">
      <div className="bg-white/90 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
        <div className="px-8 py-6 border-b border-gray-100/50 flex justify-between items-center bg-white/40">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-slate-900/20">
              {integration.icon}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xl tracking-tight">{integration.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isGoogleConnected || integration.connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-300'}`} />
                <p className={`text-xs font-medium ${isGoogleConnected || integration.connected ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {isGoogleConnected ? `Connected as ${googleUser.name}` : integration.connected ? 'Securely Connected' : 'Not Connected'}
                </p>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8">
          <p className="text-sm text-slate-600 mb-8 leading-relaxed font-medium">
            {integration.description}
          </p>

          {isGoogleConnected || integration.connected ? (
            <div className="bg-gradient-to-br from-emerald-50/80 to-teal-50/80 border border-emerald-100 rounded-2xl p-8 flex flex-col items-center text-center space-y-4 shadow-sm">
              {isGoogleConnected && googleUser.picture && (
                <img src={googleUser.picture} alt={googleUser.name} className="w-16 h-16 rounded-full border-4 border-white shadow-lg" />
              )}
              {!isGoogleConnected && (
                <div className="w-20 h-20 bg-white text-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-100">
                  <Check className="w-10 h-10 stroke-[3]" />
                </div>
              )}
              <div>
                <h4 className="font-bold text-emerald-900 text-lg">
                  {isGoogleConnected ? googleUser.name : 'Active Link Established'}
                </h4>
                <p className="text-sm text-emerald-700 mt-2 max-w-[240px] mx-auto leading-relaxed">
                  {isGoogleConnected
                    ? `Signed in as ${googleUser.email}. Agents can now access Gmail.`
                    : 'Your agents currently have full authorized access to this integration.'
                  }
                </p>
              </div>
            </div>
          ) : (
            <>
              {integration.authType === 'oauth' ? (
                <div className="space-y-4">
                  {integration.id === 'google' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p className="font-semibold">Setup Required</p>
                        <p className="mt-1 text-amber-700">Make sure the backend server is running and Google OAuth credentials are configured in .env</p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleOAuthConnect}
                    disabled={isSubmitting}
                    className="w-full group relative flex items-center justify-center gap-3 px-6 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold transition-all shadow-xl shadow-slate-900/20 hover:shadow-slate-900/30 active:scale-[0.98] disabled:opacity-80 disabled:cursor-not-allowed overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000 ease-in-out" />
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      <>
                        <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-slate-900 font-bold text-xs">
                          {integration.icon}
                        </div>
                        <span>Sign in with {integration.name}</span>
                        <ArrowRight className="w-4 h-4 opacity-50 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                  <p className="text-center text-xs text-slate-400">
                    {integration.id === 'google'
                      ? 'You will be redirected to Google to sign in securely.'
                      : 'You will be redirected to complete authorization.'
                    }
                  </p>
                </div>
              ) : (
                <form id="auth-form" onSubmit={handleSubmit} className="space-y-5">
                  {integration.authFields.map(field => (
                    <div key={field.key}>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                        {field.label}
                      </label>
                      <div className="relative group">
                        <input
                          type={field.type}
                          value={credentials[field.key] || ''}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full pl-4 pr-10 py-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white text-sm transition-all outline-none"
                          required
                        />
                        {field.type === 'password' && (
                          <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
                        )}
                      </div>
                    </div>
                  ))}
                </form>
              )}
            </>
          )}
        </div>

        <div className="px-8 py-5 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3 backdrop-blur-sm">
          {isGoogleConnected || integration.connected ? (
            <button
              onClick={handleDisconnect}
              className="px-6 py-2.5 bg-white text-red-600 border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-700 rounded-xl text-sm font-semibold transition-all shadow-sm"
            >
              Disconnect Account
            </button>
          ) : (
            <div className="flex gap-3 w-full justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              {integration.authType !== 'oauth' && (
                <button
                  type="submit"
                  form="auth-form"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-8 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 text-sm font-semibold transition-all shadow-lg shadow-slate-900/20 disabled:opacity-70 disabled:cursor-not-allowed hover:translate-y-[-1px]"
                >
                  {isSubmitting ? 'Verifying...' : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Connect
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntegrationModal;
