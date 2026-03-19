import React, { useState, useEffect, useCallback } from 'react';
import { Toaster, toast } from 'sonner';
import { Radio, Settings, Calendar, ScrollText, LayoutDashboard, Play, Square, RefreshCw, Zap } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Channels from './components/Channels';
import Presets from './components/Presets';
import Events from './components/Events';
import Logs from './components/Logs';

const API = process.env.REACT_APP_BACKEND_URL || '';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'channels', label: 'Kanaele', icon: Radio },
  { key: 'presets', label: 'Presets', icon: Settings },
  { key: 'events', label: 'Events', icon: Calendar },
  { key: 'logs', label: 'Logs', icon: ScrollText },
];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/bootstrap`);
      const data = await res.json();
      setState(data.state);
    } catch (e) {
      toast.error('Verbindung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 8000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const api = async (path, options = {}) => {
    const res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || `Fehler ${res.status}`);
    return data;
  };

  const stopActive = async () => {
    try {
      const r = await api('/api/stop', { method: 'POST' });
      toast[r?.stopped ? 'success' : 'info'](r?.stopped ? 'Stream wird gestoppt' : 'Kein aktiver Stream');
      await fetchState();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="flex flex-col items-center gap-4">
          <Zap className="w-12 h-12 text-primary animate-pulse" />
          <p className="text-txt-muted font-heading text-lg">Lade Control Panel...</p>
        </div>
      </div>
    );
  }

  const activeRun = state?.runtime?.activeRun;

  return (
    <div className="flex h-screen bg-bg" data-testid="app-shell">
      <Toaster theme="dark" position="top-right" richColors />
      <aside className="w-64 bg-surface flex flex-col border-r border-border-dark shrink-0" data-testid="sidebar">
        <div className="p-5 border-b border-border-dark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <Play className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-sm text-txt-bright leading-tight">Stream Panel</h1>
              <p className="text-xs text-txt-muted">Discord Selfbot</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1" data-testid="nav-menu">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <button
                key={item.key}
                data-testid={`nav-${item.key}`}
                onClick={() => setPage(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-primary/15 text-txt-bright'
                    : 'text-txt-muted hover:bg-surface-hover hover:text-txt'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] ${active ? 'text-primary' : ''}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border-dark space-y-2">
          {activeRun && (
            <div className="px-3 py-2 bg-primary/10 rounded-lg border border-primary/20">
              <p className="text-xs text-primary font-semibold truncate">{activeRun.channelName}</p>
              <p className="text-[11px] text-txt-muted truncate">{activeRun.presetName}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              data-testid="refresh-btn"
              onClick={fetchState}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-surface-hover rounded-lg text-xs text-txt hover:bg-surface-light transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
            </button>
            <button
              data-testid="stop-btn"
              onClick={stopActive}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-danger/15 rounded-lg text-xs text-danger hover:bg-danger/25 transition-colors"
            >
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8" data-testid="main-content">
        {page === 'dashboard' && <Dashboard state={state} api={api} refresh={fetchState} />}
        {page === 'channels' && <Channels state={state} api={api} refresh={fetchState} />}
        {page === 'presets' && <Presets state={state} api={api} refresh={fetchState} />}
        {page === 'events' && <Events state={state} api={api} refresh={fetchState} />}
        {page === 'logs' && <Logs state={state} />}
      </main>
    </div>
  );
}
