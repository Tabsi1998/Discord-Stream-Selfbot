import React, { useState } from 'react';
import { ScrollText, AlertTriangle, AlertCircle, Info } from 'lucide-react';

function formatDT(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('de-AT', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso));
}

const LEVEL_CONFIG = {
  error: { icon: AlertTriangle, cls: 'border-danger/20 bg-danger/5', textCls: 'text-danger', label: 'ERROR' },
  warn: { icon: AlertCircle, cls: 'border-warning/20 bg-warning/5', textCls: 'text-warning', label: 'WARN' },
  info: { icon: Info, cls: 'border-border-dark bg-bg/30', textCls: 'text-txt-muted', label: 'INFO' },
};

export default function Logs({ state }) {
  const logs = state?.logs || [];
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? logs : logs.filter(l => l.level === filter);

  return (
    <div data-testid="logs-page">
      <div className="mb-8">
        <p className="text-xs font-bold text-primary uppercase tracking-widest font-heading mb-1">Verlauf</p>
        <h1 className="font-heading font-extrabold text-3xl text-txt-bright tracking-tight">Logs</h1>
        <p className="text-sm text-txt-muted mt-1">Systemereignisse und Fehlerprotokoll</p>
      </div>

      <div className="flex gap-2 mb-4" data-testid="log-filters">
        {['all', 'info', 'warn', 'error'].map(f => (
          <button key={f} onClick={() => setFilter(f)} data-testid={`log-filter-${f}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filter === f ? 'bg-primary text-white' : 'bg-surface text-txt-muted border border-border-dark hover:bg-surface-hover'
            }`}>
            {f === 'all' ? 'Alle' : f.toUpperCase()} {f !== 'all' && `(${logs.filter(l => l.level === f).length})`}
          </button>
        ))}
      </div>

      <div className="space-y-2" data-testid="logs-list">
        {filtered.length === 0 && <p className="text-sm text-txt-muted py-8 text-center">Keine Logs vorhanden.</p>}
        {filtered.map(log => {
          const config = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
          const Icon = config.icon;
          const ctx = log.context ? Object.entries(log.context).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' | ') : '';
          return (
            <div key={log.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${config.cls}`} data-testid={`log-entry-${log.id}`}>
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.textCls}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-mono font-bold text-xs ${config.textCls}`}>{config.label}</span>
                  <span className="text-sm text-txt">{log.message}</span>
                </div>
                {ctx && <p className="text-[11px] text-txt-muted mt-0.5 font-mono truncate">{ctx}</p>}
              </div>
              <span className="text-[11px] text-txt-muted shrink-0 font-mono">{formatDT(log.createdAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
