import React, { useState } from 'react';
import { Radio, Plus, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

export default function Channels({ state, api, refresh }) {
  const channels = state?.channels || [];
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', guildId: '', channelId: '', streamMode: 'go-live', description: '' });

  const resetForm = () => { setForm({ name: '', guildId: '', channelId: '', streamMode: 'go-live', description: '' }); setEditing(null); };

  const startEdit = (ch) => {
    setEditing(ch.id);
    setForm({ name: ch.name, guildId: ch.guildId, channelId: ch.channelId, streamMode: ch.streamMode, description: ch.description || '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api(`/api/channels/${editing}`, { method: 'PUT', body: JSON.stringify(form) });
        toast.success('Kanal aktualisiert');
      } else {
        await api('/api/channels', { method: 'POST', body: JSON.stringify(form) });
        toast.success('Kanal gespeichert');
      }
      resetForm();
      await refresh();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    try {
      await api(`/api/channels/${id}`, { method: 'DELETE' });
      toast.success('Kanal geloescht');
      await refresh();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div data-testid="channels-page">
      <div className="mb-8">
        <p className="text-xs font-bold text-primary uppercase tracking-widest font-heading mb-1">Konfiguration</p>
        <h1 className="font-heading font-extrabold text-3xl text-txt-bright tracking-tight">Kanaele</h1>
        <p className="text-sm text-txt-muted mt-1">Discord Voice Channels fuer Streams konfigurieren</p>
      </div>

      <div className="bg-surface rounded-xl p-5 border border-border-dark mb-6" data-testid="channel-form-card">
        <h2 className="font-heading font-bold text-txt-bright mb-4 flex items-center gap-2">
          {editing ? <><Pencil className="w-4 h-4 text-primary" /> Kanal bearbeiten</> : <><Plus className="w-4 h-4 text-success" /> Neuer Kanal</>}
        </h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="channel-form">
          <div>
            <label className="block text-xs font-bold text-txt-muted uppercase tracking-wide mb-1.5">Name</label>
            <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required data-testid="channel-name-input"
              className="w-full bg-bg border border-border-dark text-txt rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none" placeholder="z.B. Gaming Kanal" />
          </div>
          <div>
            <label className="block text-xs font-bold text-txt-muted uppercase tracking-wide mb-1.5">Guild ID</label>
            <input value={form.guildId} onChange={e => setForm(p => ({...p, guildId: e.target.value}))} required data-testid="channel-guild-input"
              className="w-full bg-bg border border-border-dark text-txt rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-primary focus:outline-none" placeholder="123456789" />
          </div>
          <div>
            <label className="block text-xs font-bold text-txt-muted uppercase tracking-wide mb-1.5">Voice Channel ID</label>
            <input value={form.channelId} onChange={e => setForm(p => ({...p, channelId: e.target.value}))} required data-testid="channel-id-input"
              className="w-full bg-bg border border-border-dark text-txt rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-primary focus:outline-none" placeholder="987654321" />
          </div>
          <div>
            <label className="block text-xs font-bold text-txt-muted uppercase tracking-wide mb-1.5">Stream-Modus</label>
            <select value={form.streamMode} onChange={e => setForm(p => ({...p, streamMode: e.target.value}))} data-testid="channel-mode-select"
              className="w-full bg-bg border border-border-dark text-txt rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none">
              <option value="go-live">Go Live</option>
              <option value="camera">Camera</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-txt-muted uppercase tracking-wide mb-1.5">Beschreibung</label>
            <input value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} data-testid="channel-desc-input"
              className="w-full bg-bg border border-border-dark text-txt rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none" placeholder="Optional" />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" data-testid="channel-save-btn"
              className="bg-primary hover:bg-primary-hover text-white font-bold px-5 py-2.5 rounded-lg transition-all hover:-translate-y-0.5">{editing ? 'Aktualisieren' : 'Speichern'}</button>
            {editing && <button type="button" onClick={resetForm} data-testid="channel-cancel-btn"
              className="bg-surface-hover text-txt px-5 py-2.5 rounded-lg font-medium hover:bg-surface-light transition-colors flex items-center gap-1"><X className="w-4 h-4" /> Abbrechen</button>}
          </div>
        </form>
      </div>

      <div className="space-y-3" data-testid="channels-list">
        {channels.length === 0 && <p className="text-sm text-txt-muted py-8 text-center">Noch keine Kanaele gespeichert.</p>}
        {channels.map(ch => (
          <div key={ch.id} className="bg-surface rounded-xl p-4 border border-border-dark hover:bg-surface-hover transition-colors group" data-testid={`channel-item-${ch.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <Radio className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-txt-bright text-sm">{ch.name}</h3>
                  <p className="text-xs text-txt-muted font-mono mt-0.5">{ch.guildId} / {ch.channelId}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="px-2 py-0.5 bg-primary/15 text-primary rounded-full text-[11px] font-bold">{ch.streamMode}</span>
                    {ch.description && <span className="text-[11px] text-txt-muted">{ch.description}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(ch)} data-testid={`edit-channel-${ch.id}`}
                  className="p-2 hover:bg-surface-light rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5 text-txt-muted" /></button>
                <button onClick={() => handleDelete(ch.id)} data-testid={`delete-channel-${ch.id}`}
                  className="p-2 hover:bg-danger/15 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5 text-danger" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
