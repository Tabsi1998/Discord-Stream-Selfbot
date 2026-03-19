import React, { useState } from 'react';
import { Calendar, Plus, Pencil, Trash2, X, Play, Ban, Clock } from 'lucide-react';
import { toast } from 'sonner';

function formatDT(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('de-AT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

function toLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function fromLocal(val) {
  if (!val) return undefined;
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

const STATUS_STYLES = {
  scheduled: 'bg-warning/15 text-warning',
  running: 'bg-primary/15 text-primary animate-pulse',
  completed: 'bg-[#72767d]/15 text-[#72767d]',
  canceled: 'bg-danger/15 text-danger',
  failed: 'bg-danger/15 text-danger',
};

const STATUS_LABELS = {
  scheduled: 'geplant',
  running: 'laeuft',
  completed: 'abgeschlossen',
  canceled: 'abgebrochen',
  failed: 'fehlgeschlagen',
};

const WEEKDAYS = [
  { val: 1, label: 'Mo' }, { val: 2, label: 'Di' }, { val: 3, label: 'Mi' },
  { val: 4, label: 'Do' }, { val: 5, label: 'Fr' }, { val: 6, label: 'Sa' }, { val: 0, label: 'So' },
];

const defaultForm = {
  name: '', channelId: '', presetId: '', startAt: '', endAt: '', description: '',
  recurrenceKind: 'once', recurrenceInterval: 1, recurrenceUntil: '', daysOfWeek: [],
};

export default function Events({ state, api, refresh }) {
  const events = state?.events || [];
  const channels = state?.channels || [];
  const presets = state?.presets || [];
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({...defaultForm});

  const resetForm = () => { setForm({...defaultForm}); setEditing(null); };

  const startEdit = (ev) => {
    setEditing(ev.id);
    setForm({
      name: ev.name, channelId: ev.channelId, presetId: ev.presetId,
      startAt: toLocal(ev.startAt), endAt: toLocal(ev.endAt), description: ev.description || '',
      recurrenceKind: ev.recurrence?.kind || 'once',
      recurrenceInterval: ev.recurrence?.interval || 1,
      recurrenceUntil: toLocal(ev.recurrence?.until),
      daysOfWeek: ev.recurrence?.daysOfWeek || [],
    });
  };

  const toggleDay = (day) => {
    setForm(f => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day) ? f.daysOfWeek.filter(d => d !== day) : [...f.daysOfWeek, day].sort((a, b) => a - b),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name, channelId: form.channelId, presetId: form.presetId,
      startAt: fromLocal(form.startAt), endAt: fromLocal(form.endAt), description: form.description,
      recurrence: form.recurrenceKind === 'once' ? { kind: 'once' } : {
        kind: form.recurrenceKind,
        interval: parseInt(form.recurrenceInterval) || 1,
        until: fromLocal(form.recurrenceUntil),
        daysOfWeek: form.recurrenceKind === 'weekly' ? form.daysOfWeek : undefined,
      },
    };
    try {
      if (editing) {
        const r = await api(`/api/events/${editing}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast.success(`${r?.updatedCount || 1} Event(s) aktualisiert`);
      } else {
        const r = await api('/api/events', { method: 'POST', body: JSON.stringify(payload) });
        toast.success(`${r?.createdCount || 1} Event(s) gespeichert`);
      }
      resetForm();
      await refresh();
    } catch (err) { toast.error(err.message); }
  };

  const handleAction = async (action, id) => {
    try {
      if (action === 'start') {
        await api(`/api/events/${id}/start`, { method: 'POST' });
        toast.success('Event wird gestartet');
      } else if (action === 'cancel') {
        await api(`/api/events/${id}/cancel`, { method: 'POST' });
        toast.success('Event abgebrochen');
      } else if (action === 'delete') {
        await api(`/api/events/${id}`, { method: 'DELETE' });
        toast.success('Event geloescht');
      }
      await refresh();
    } catch (err) { toast.error(err.message); }
  };

  const upd = (key, val) => setForm(p => ({...p, [key]: val}));
  const inputCls = "w-full bg-bg border border-border-dark text-txt rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none";
  const labelCls = "block text-xs font-bold text-txt-muted uppercase tracking-wide mb-1.5";
  const isRecurring = form.recurrenceKind !== 'once';

  const sorted = [...events].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const chMap = Object.fromEntries(channels.map(c => [c.id, c.name]));
  const prMap = Object.fromEntries(presets.map(p => [p.id, p.name]));

  return (
    <div data-testid="events-page">
      <div className="mb-8">
        <p className="text-xs font-bold text-primary uppercase tracking-widest font-heading mb-1">Planung</p>
        <h1 className="font-heading font-extrabold text-3xl text-txt-bright tracking-tight">Events</h1>
        <p className="text-sm text-txt-muted mt-1">Streams zeitgesteuert planen und verwalten</p>
      </div>

      <div className="bg-surface rounded-xl p-5 border border-border-dark mb-6" data-testid="event-form-card">
        <h2 className="font-heading font-bold text-txt-bright mb-4 flex items-center gap-2">
          {editing ? <><Pencil className="w-4 h-4 text-primary" /> Event bearbeiten</> : <><Plus className="w-4 h-4 text-success" /> Neues Event</>}
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="event-form">
          <div>
            <label className={labelCls}>Name</label>
            <input value={form.name} onChange={e => upd('name', e.target.value)} required className={inputCls} data-testid="event-name-input" placeholder="z.B. Abend-Stream" />
          </div>
          <div>
            <label className={labelCls}>Kanal</label>
            <select value={form.channelId} onChange={e => upd('channelId', e.target.value)} required className={inputCls} data-testid="event-channel-select">
              <option value="">Waehlen...</option>
              {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Preset</label>
            <select value={form.presetId} onChange={e => upd('presetId', e.target.value)} required className={inputCls} data-testid="event-preset-select">
              <option value="">Waehlen...</option>
              {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Start</label>
            <input type="datetime-local" value={form.startAt} onChange={e => upd('startAt', e.target.value)} required className={inputCls} data-testid="event-start-input" />
          </div>
          <div>
            <label className={labelCls}>Ende</label>
            <input type="datetime-local" value={form.endAt} onChange={e => upd('endAt', e.target.value)} required className={inputCls} data-testid="event-end-input" />
          </div>
          <div>
            <label className={labelCls}>Wiederholung</label>
            <select value={form.recurrenceKind} onChange={e => upd('recurrenceKind', e.target.value)} className={inputCls} data-testid="event-recurrence-select">
              <option value="once">Einmalig</option>
              <option value="daily">Taeglich</option>
              <option value="weekly">Woechentlich</option>
            </select>
          </div>
          {isRecurring && (
            <>
              <div>
                <label className={labelCls}>Intervall</label>
                <input type="number" min="1" value={form.recurrenceInterval} onChange={e => upd('recurrenceInterval', e.target.value)} className={`${inputCls} font-mono`} data-testid="event-interval-input" />
              </div>
              <div>
                <label className={labelCls}>Wiederholen bis</label>
                <input type="datetime-local" value={form.recurrenceUntil} onChange={e => upd('recurrenceUntil', e.target.value)} required className={inputCls} data-testid="event-until-input" />
              </div>
            </>
          )}
          {form.recurrenceKind === 'weekly' && (
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>Wochentage</label>
              <div className="flex gap-2 flex-wrap">
                {WEEKDAYS.map(d => (
                  <button key={d.val} type="button" onClick={() => toggleDay(d.val)} data-testid={`weekday-${d.val}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      form.daysOfWeek.includes(d.val) ? 'bg-primary text-white' : 'bg-bg text-txt-muted border border-border-dark hover:bg-surface-hover'
                    }`}>{d.label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls}>Beschreibung</label>
            <input value={form.description} onChange={e => upd('description', e.target.value)} className={inputCls} data-testid="event-desc-input" placeholder="Optional" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
            <button type="submit" data-testid="event-save-btn"
              className="bg-primary hover:bg-primary-hover text-white font-bold px-5 py-2.5 rounded-lg transition-all hover:-translate-y-0.5">{editing ? 'Aktualisieren' : 'Speichern'}</button>
            {editing && <button type="button" onClick={resetForm} data-testid="event-cancel-btn"
              className="bg-surface-hover text-txt px-5 py-2.5 rounded-lg font-medium hover:bg-surface-light transition-colors flex items-center gap-1"><X className="w-4 h-4" /> Abbrechen</button>}
          </div>
        </form>
      </div>

      <div className="space-y-3" data-testid="events-list">
        {sorted.length === 0 && <p className="text-sm text-txt-muted py-8 text-center">Noch keine Events gespeichert.</p>}
        {sorted.map(ev => (
          <div key={ev.id} className="bg-surface rounded-xl p-4 border border-border-dark hover:bg-surface-hover transition-colors group" data-testid={`event-item-${ev.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  ev.status === 'running' ? 'bg-primary/15' : ev.status === 'scheduled' ? 'bg-warning/15' : 'bg-surface-light'
                }`}>
                  <Calendar className={`w-4 h-4 ${
                    ev.status === 'running' ? 'text-primary' : ev.status === 'scheduled' ? 'text-warning' : 'text-txt-muted'
                  }`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-heading font-bold text-txt-bright text-sm">{ev.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_STYLES[ev.status] || ''}`}>
                      {STATUS_LABELS[ev.status] || ev.status}
                    </span>
                    {ev.discordEventId && (
                      <span className="px-2 py-0.5 bg-primary/15 text-primary rounded-full text-[10px] font-bold tracking-wide" data-testid={`discord-badge-${ev.id}`} title={`Discord Event: ${ev.discordEventId}`}>
                        DISCORD
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-txt-muted">
                    <Clock className="w-3 h-3" />
                    <span>{formatDT(ev.startAt)} → {formatDT(ev.endAt)}</span>
                  </div>
                  <p className="text-xs text-txt-muted mt-0.5">
                    {chMap[ev.channelId] || '?'} | {prMap[ev.presetId] || '?'}
                    {ev.seriesId && <span className="ml-2 font-mono">Serie #{ev.occurrenceIndex}</span>}
                  </p>
                  {ev.lastError && <p className="text-xs text-danger mt-1">{ev.lastError}</p>}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {ev.status === 'scheduled' && (
                  <button onClick={() => handleAction('start', ev.id)} data-testid={`start-event-${ev.id}`}
                    className="p-2 hover:bg-success/15 rounded-lg transition-colors"><Play className="w-3.5 h-3.5 text-success" /></button>
                )}
                {(ev.status === 'scheduled' || ev.status === 'running') && (
                  <button onClick={() => handleAction('cancel', ev.id)} data-testid={`cancel-event-${ev.id}`}
                    className="p-2 hover:bg-warning/15 rounded-lg transition-colors"><Ban className="w-3.5 h-3.5 text-warning" /></button>
                )}
                <button onClick={() => startEdit(ev)} data-testid={`edit-event-${ev.id}`}
                  className="p-2 hover:bg-surface-light rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5 text-txt-muted" /></button>
                <button onClick={() => handleAction('delete', ev.id)} data-testid={`delete-event-${ev.id}`}
                  className="p-2 hover:bg-danger/15 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5 text-danger" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
