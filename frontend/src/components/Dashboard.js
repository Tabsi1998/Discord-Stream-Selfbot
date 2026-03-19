import React, { useState, useEffect } from 'react';
import { Activity, Radio, Settings, Calendar, Clock, AlertTriangle, Wifi, WifiOff, Play, Zap, Timer } from 'lucide-react';
import { toast } from 'sonner';

function formatDT(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('de-AT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function Dashboard({ state, api, refresh }) {
  const runtime = state?.runtime || {};
  const activeRun = runtime.activeRun;
  const channels = state?.channels || [];
  const presets = state?.presets || [];
  const events = state?.events || [];
  const logs = state?.logs || [];
  const scheduled = events.filter(e => e.status === 'scheduled');
  const nextEvent = [...scheduled].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];

  const [uptimeMs, setUptimeMs] = useState(0);

  useEffect(() => {
    if (!activeRun?.startedAt) { setUptimeMs(0); return; }
    const calc = () => setUptimeMs(Date.now() - Date.parse(activeRun.startedAt));
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [activeRun?.startedAt]);

  const handleManualStart = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const chId = fd.get('channelId');
    const prId = fd.get('presetId');
    const stopAt = fd.get('stopAt');
    if (!chId || !prId) { toast.error('Kanal und Preset auswaehlen'); return; }
    try {
      await api('/api/manual/start', {
        method: 'POST',
        body: JSON.stringify({
          channelId: chId,
          presetId: prId,
          stopAt: stopAt ? new Date(stopAt).toISOString() : undefined,
        }),
      });
      toast.success('Stream wird gestartet');
      await refresh();
    } catch (err) { toast.error(err.message); }
  };

  const statusColor = runtime.discordStatus === 'ready' ? 'text-success' : runtime.discordStatus === 'error' ? 'text-danger' : 'text-warning';
  const StatusIcon = runtime.discordStatus === 'ready' ? Wifi : runtime.discordStatus === 'error' ? WifiOff : Activity;

  return (
    <div data-testid="dashboard-page">
      <div className="mb-8">
        <p className="text-xs font-bold text-primary uppercase tracking-widest font-heading mb-1">Uebersicht</p>
        <h1 className="font-heading font-extrabold text-3xl text-txt-bright tracking-tight">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface rounded-xl p-5 border border-border-dark" data-testid="discord-status-card">
          <div className="flex items-center gap-3 mb-3">
            <StatusIcon className={`w-5 h-5 ${statusColor}`} />
            <span className="text-xs font-bold uppercase tracking-wide text-txt-muted">Discord</span>
          </div>
          <p className={`text-lg font-heading font-bold ${statusColor}`}>{runtime.discordStatus || 'offline'}</p>
          <p className="text-xs text-txt-muted mt-1 truncate">{runtime.discordUserTag || 'Nicht verbunden'}</p>
        </div>

        <div className={`bg-surface rounded-xl p-5 border ${activeRun ? 'border-primary/30' : 'border-border-dark'} col-span-1 md:col-span-2`} data-testid="active-run-card">
          <div className="flex items-center gap-3 mb-3">
            {activeRun ? <Zap className="w-5 h-5 text-primary animate-pulse" /> : <Play className="w-5 h-5 text-txt-muted" />}
            <span className="text-xs font-bold uppercase tracking-wide text-txt-muted">Aktiver Stream</span>
          </div>
          {activeRun ? (
            <>
              <p className="text-lg font-heading font-bold text-txt-bright">{activeRun.channelName} → {activeRun.presetName}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-txt-muted flex-wrap">
                <span className="px-2 py-0.5 bg-primary/20 text-primary rounded-full font-bold text-[11px]">{activeRun.status}</span>
                <span>Seit {formatDT(activeRun.startedAt)}</span>
                {activeRun.plannedStopAt && <span>Stop: {formatDT(activeRun.plannedStopAt)}</span>}
              </div>
              {activeRun.status === 'running' && (
                <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-primary/5 rounded-lg border border-primary/15" data-testid="stream-health-bar">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
                  </span>
                  <Timer className="w-3.5 h-3.5 text-txt-muted" />
                  <span className="font-mono font-bold text-sm text-txt-bright tracking-wider" data-testid="stream-uptime">{formatUptime(uptimeMs)}</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-txt-muted">Kein aktiver Stream</p>
          )}
        </div>

        <div className="bg-surface rounded-xl p-5 border border-border-dark" data-testid="events-summary-card">
          <div className="flex items-center gap-3 mb-3">
            <Calendar className="w-5 h-5 text-warning" />
            <span className="text-xs font-bold uppercase tracking-wide text-txt-muted">Events</span>
          </div>
          <p className="text-lg font-heading font-bold text-txt-bright">{scheduled.length} geplant</p>
          <p className="text-xs text-txt-muted mt-1 truncate">
            {nextEvent ? `${nextEvent.name}: ${formatDT(nextEvent.startAt)}` : 'Kein naechstes Event'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface rounded-xl p-5 border border-border-dark" data-testid="manual-start-card">
          <div className="flex items-center gap-3 mb-4">
            <Play className="w-5 h-5 text-success" />
            <h2 className="font-heading font-bold text-txt-bright">Manueller Start</h2>
          </div>
          <form onSubmit={handleManualStart} className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="manual-start-form">
            <div>
              <label className="block text-xs font-bold text-txt-muted uppercase tracking-wide mb-1.5">Kanal</label>
              <select name="channelId" required data-testid="manual-channel-select"
                className="w-full bg-bg border border-border-dark text-txt rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
                <option value="">Waehlen...</option>
                {channels.map(c => <option key={c.id} value={c.id}>{c.name} ({c.streamMode})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-txt-muted uppercase tracking-wide mb-1.5">Preset</label>
              <select name="presetId" required data-testid="manual-preset-select"
                className="w-full bg-bg border border-border-dark text-txt rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
                <option value="">Waehlen...</option>
                {presets.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sourceMode})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-txt-muted uppercase tracking-wide mb-1.5">Stop um (optional)</label>
              <input type="datetime-local" name="stopAt" data-testid="manual-stop-input"
                className="w-full bg-bg border border-border-dark text-txt rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" data-testid="manual-start-btn"
                className="bg-primary hover:bg-primary-hover text-white font-bold px-6 py-2.5 rounded-lg transition-all hover:-translate-y-0.5 shadow-md hover:shadow-lg">
                Jetzt starten
              </button>
            </div>
          </form>
        </div>

        <div className="bg-surface rounded-xl p-5 border border-border-dark" data-testid="system-info-card">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="w-5 h-5 text-txt-muted" />
            <h2 className="font-heading font-bold text-txt-bright">System</h2>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-txt-muted">Kanaele</span>
              <span className="font-mono text-txt font-bold">{channels.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-txt-muted">Presets</span>
              <span className="font-mono text-txt font-bold">{presets.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-txt-muted">Events gesamt</span>
              <span className="font-mono text-txt font-bold">{events.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-txt-muted">Letztes Ende</span>
              <span className="font-mono text-txt">{formatDT(runtime.lastEndedAt)}</span>
            </div>
            {runtime.lastError && (
              <div className="flex items-start gap-2 p-2 bg-danger/10 rounded-lg border border-danger/20">
                <AlertTriangle className="w-3.5 h-3.5 text-danger mt-0.5 shrink-0" />
                <span className="text-danger text-[11px]">{runtime.lastError}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="mt-4 bg-surface rounded-xl p-5 border border-border-dark" data-testid="recent-logs-card">
          <h2 className="font-heading font-bold text-txt-bright mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-txt-muted" /> Letzte Logs
          </h2>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {logs.slice(0, 10).map(log => (
              <div key={log.id} className={`flex items-start gap-3 px-3 py-2 rounded-lg text-xs ${
                log.level === 'error' ? 'bg-danger/5 border border-danger/15' :
                log.level === 'warn' ? 'bg-warning/5 border border-warning/15' :
                'bg-bg/50'
              }`}>
                <span className={`font-mono font-bold uppercase shrink-0 ${
                  log.level === 'error' ? 'text-danger' : log.level === 'warn' ? 'text-warning' : 'text-txt-muted'
                }`}>{log.level}</span>
                <span className="text-txt flex-1">{log.message}</span>
                <span className="text-txt-muted shrink-0 font-mono text-[11px]">{formatDT(log.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
