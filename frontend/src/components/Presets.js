import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Plus, Pencil, Trash2, X, Film, MonitorPlay } from 'lucide-react';
import { toast } from 'sonner';

const QUALITY_PROFILES = {
  original: { label: 'Original', w: 1920, h: 1080, fps: 60 },
  '720p30': { label: '720p / 30 FPS', w: 1280, h: 720, fps: 30 },
  '720p60': { label: '720p / 60 FPS', w: 1280, h: 720, fps: 60 },
  '1080p30': { label: '1080p / 30 FPS', w: 1920, h: 1080, fps: 30 },
  '1080p60': { label: '1080p / 60 FPS', w: 1920, h: 1080, fps: 60 },
  '1440p30': { label: '1440p / 30 FPS', w: 2560, h: 1440, fps: 30 },
  '1440p60': { label: '1440p / 60 FPS', w: 2560, h: 1440, fps: 60 },
  custom: { label: 'Custom', w: 1280, h: 720, fps: 30 },
};

const defaultForm = {
  name: '', sourceUrl: '', sourceMode: 'direct', qualityProfile: '720p30', bufferProfile: 'auto',
  description: '', includeAudio: true, width: 1280, height: 720, fps: 30,
  bitrateVideoKbps: 4500, maxBitrateVideoKbps: 6500, bitrateAudioKbps: 160,
  videoCodec: 'H264', hardwareAcceleration: false, minimizeLatency: false,
};

export default function Presets({ state, api, refresh }) {
  const presets = state?.presets || [];
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({...defaultForm});
  const [tab, setTab] = useState('general');

  const isCustom = form.qualityProfile === 'custom';

  const syncFromProfile = useCallback(() => {
    const qp = form.qualityProfile;
    if (qp !== 'custom' && QUALITY_PROFILES[qp]) {
      const p = QUALITY_PROFILES[qp];
      setForm(f => ({...f, width: p.w, height: p.h, fps: p.fps}));
    }
  }, [form.qualityProfile]);

  useEffect(() => { syncFromProfile(); }, [syncFromProfile]);

  const resetForm = () => { setForm({...defaultForm}); setEditing(null); setTab('general'); };

  const startEdit = (pr) => {
    setEditing(pr.id);
    setForm({
      name: pr.name, sourceUrl: pr.sourceUrl, sourceMode: pr.sourceMode || 'direct',
      qualityProfile: pr.qualityProfile || 'custom', bufferProfile: pr.bufferProfile || 'auto',
      description: pr.description || '', includeAudio: pr.includeAudio, width: pr.width,
      height: pr.height, fps: pr.fps, bitrateVideoKbps: pr.bitrateVideoKbps,
      maxBitrateVideoKbps: pr.maxBitrateVideoKbps, bitrateAudioKbps: pr.bitrateAudioKbps,
      videoCodec: pr.videoCodec, hardwareAcceleration: pr.hardwareAcceleration, minimizeLatency: pr.minimizeLatency,
    });
    setTab('general');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api(`/api/presets/${editing}`, { method: 'PUT', body: JSON.stringify(form) });
        toast.success('Preset aktualisiert');
      } else {
        await api('/api/presets', { method: 'POST', body: JSON.stringify(form) });
        toast.success('Preset gespeichert');
      }
      resetForm();
      await refresh();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    try {
      await api(`/api/presets/${id}`, { method: 'DELETE' });
      toast.success('Preset geloescht');
      await refresh();
    } catch (err) { toast.error(err.message); }
  };

  const upd = (key, val) => setForm(p => ({...p, [key]: val}));

  const TABS = [
    { key: 'general', label: 'Allgemein' },
    { key: 'video', label: 'Video' },
    { key: 'audio', label: 'Audio' },
    { key: 'advanced', label: 'Erweitert' },
  ];

  const inputCls = "w-full bg-bg border border-border-dark text-txt rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none";
  const labelCls = "block text-xs font-bold text-txt-muted uppercase tracking-wide mb-1.5";
  const disabledCls = "opacity-60 cursor-not-allowed";

  return (
    <div data-testid="presets-page">
      <div className="mb-8">
        <p className="text-xs font-bold text-primary uppercase tracking-widest font-heading mb-1">Vorlagen</p>
        <h1 className="font-heading font-extrabold text-3xl text-txt-bright tracking-tight">Stream Presets</h1>
        <p className="text-sm text-txt-muted mt-1">Quellen, Qualitaetsprofile und Encoder-Einstellungen</p>
      </div>

      <div className="bg-surface rounded-xl border border-border-dark mb-6" data-testid="preset-form-card">
        <div className="p-5 pb-0">
          <h2 className="font-heading font-bold text-txt-bright mb-4 flex items-center gap-2">
            {editing ? <><Pencil className="w-4 h-4 text-primary" /> Preset bearbeiten</> : <><Plus className="w-4 h-4 text-success" /> Neues Preset</>}
          </h2>
          <div className="flex gap-1 border-b border-border-dark -mx-5 px-5">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} data-testid={`preset-tab-${t.key}`}
                className={`px-4 py-2.5 text-xs font-bold transition-colors border-b-2 -mb-[1px] ${tab === t.key ? 'text-primary border-primary' : 'text-txt-muted border-transparent hover:text-txt'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-5" data-testid="preset-form">
          {tab === 'general' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Name</label>
                <input value={form.name} onChange={e => upd('name', e.target.value)} required className={inputCls} data-testid="preset-name-input" placeholder="z.B. YouTube HD" />
              </div>
              <div>
                <label className={labelCls}>Quelltyp</label>
                <select value={form.sourceMode} onChange={e => upd('sourceMode', e.target.value)} className={inputCls} data-testid="preset-source-mode">
                  <option value="direct">Direkte Media-URL</option>
                  <option value="yt-dlp">yt-dlp (YouTube/Livestream)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>URL / Quelle</label>
                <input value={form.sourceUrl} onChange={e => upd('sourceUrl', e.target.value)} required className={inputCls} data-testid="preset-url-input" placeholder="https://..." />
              </div>
              <div>
                <label className={labelCls}>Qualitaetsprofil</label>
                <select value={form.qualityProfile} onChange={e => upd('qualityProfile', e.target.value)} className={inputCls} data-testid="preset-quality-select">
                  {Object.entries(QUALITY_PROFILES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Stream-Verhalten</label>
                <select value={form.bufferProfile} onChange={e => upd('bufferProfile', e.target.value)} className={inputCls} data-testid="preset-buffer-select">
                  <option value="auto">Auto</option>
                  <option value="stable">Maximale Stabilitaet</option>
                  <option value="balanced">Ausgewogen</option>
                  <option value="low-latency">Minimale Latenz</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Beschreibung</label>
                <input value={form.description} onChange={e => upd('description', e.target.value)} className={inputCls} data-testid="preset-desc-input" placeholder="Optional" />
              </div>
            </div>
          )}
          {tab === 'video' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Breite</label>
                <input type="number" value={form.width} onChange={e => upd('width', parseInt(e.target.value) || 0)} className={`${inputCls} font-mono ${!isCustom ? disabledCls : ''}`} disabled={!isCustom} data-testid="preset-width-input" />
              </div>
              <div>
                <label className={labelCls}>Hoehe</label>
                <input type="number" value={form.height} onChange={e => upd('height', parseInt(e.target.value) || 0)} className={`${inputCls} font-mono ${!isCustom ? disabledCls : ''}`} disabled={!isCustom} data-testid="preset-height-input" />
              </div>
              <div>
                <label className={labelCls}>FPS</label>
                <input type="number" value={form.fps} onChange={e => upd('fps', parseInt(e.target.value) || 0)} className={`${inputCls} font-mono ${!isCustom ? disabledCls : ''}`} disabled={!isCustom} data-testid="preset-fps-input" />
              </div>
              <div>
                <label className={labelCls}>Video kbps</label>
                <input type="number" value={form.bitrateVideoKbps} onChange={e => upd('bitrateVideoKbps', parseInt(e.target.value) || 0)} className={`${inputCls} font-mono ${!isCustom ? disabledCls : ''}`} disabled={!isCustom} data-testid="preset-bitrate-input" />
              </div>
              <div>
                <label className={labelCls}>Max Video kbps</label>
                <input type="number" value={form.maxBitrateVideoKbps} onChange={e => upd('maxBitrateVideoKbps', parseInt(e.target.value) || 0)} className={`${inputCls} font-mono ${!isCustom ? disabledCls : ''}`} disabled={!isCustom} data-testid="preset-max-bitrate-input" />
              </div>
              <div>
                <label className={labelCls}>Codec</label>
                <select value={form.videoCodec} onChange={e => upd('videoCodec', e.target.value)} className={inputCls} data-testid="preset-codec-select">
                  <option value="H264">H264</option>
                  <option value="H265">H265</option>
                </select>
              </div>
              {!isCustom && (
                <div className="sm:col-span-3 p-3 bg-primary/5 rounded-lg border border-primary/15 text-xs text-primary">
                  Werte werden automatisch vom Profil "{QUALITY_PROFILES[form.qualityProfile]?.label}" gesetzt. "Custom" waehlen fuer manuelle Einstellung.
                </div>
              )}
            </div>
          )}
          {tab === 'audio' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Audio kbps</label>
                <input type="number" value={form.bitrateAudioKbps} onChange={e => upd('bitrateAudioKbps', parseInt(e.target.value) || 0)} className={`${inputCls} font-mono ${!isCustom ? disabledCls : ''}`} disabled={!isCustom} data-testid="preset-audio-bitrate-input" />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-3 px-4 py-3 bg-bg rounded-lg border border-border-dark cursor-pointer w-full" data-testid="preset-audio-toggle">
                  <input type="checkbox" checked={form.includeAudio} onChange={e => upd('includeAudio', e.target.checked)} className="w-4 h-4 accent-primary" />
                  <span className="text-sm text-txt">Audio mitsenden</span>
                </label>
              </div>
            </div>
          )}
          {tab === 'advanced' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-3 px-4 py-3 bg-bg rounded-lg border border-border-dark cursor-pointer" data-testid="preset-hw-accel-toggle">
                <input type="checkbox" checked={form.hardwareAcceleration} onChange={e => upd('hardwareAcceleration', e.target.checked)} className="w-4 h-4 accent-primary" />
                <span className="text-sm text-txt">Hardware-Decoding</span>
              </label>
              <label className="flex items-center gap-3 px-4 py-3 bg-bg rounded-lg border border-border-dark cursor-pointer" data-testid="preset-low-latency-toggle">
                <input type="checkbox" checked={form.minimizeLatency} onChange={e => upd('minimizeLatency', e.target.checked)} className="w-4 h-4 accent-primary" />
                <span className="text-sm text-txt">Minimale Latenz</span>
              </label>
            </div>
          )}
          <div className="flex gap-2 mt-4 pt-4 border-t border-border-dark">
            <button type="submit" data-testid="preset-save-btn"
              className="bg-primary hover:bg-primary-hover text-white font-bold px-5 py-2.5 rounded-lg transition-all hover:-translate-y-0.5">{editing ? 'Aktualisieren' : 'Speichern'}</button>
            {editing && <button type="button" onClick={resetForm} data-testid="preset-cancel-btn"
              className="bg-surface-hover text-txt px-5 py-2.5 rounded-lg font-medium hover:bg-surface-light transition-colors flex items-center gap-1"><X className="w-4 h-4" /> Abbrechen</button>}
          </div>
        </form>
      </div>

      <div className="space-y-3" data-testid="presets-list">
        {presets.length === 0 && <p className="text-sm text-txt-muted py-8 text-center">Noch keine Presets gespeichert.</p>}
        {presets.map(pr => (
          <div key={pr.id} className="bg-surface rounded-xl p-4 border border-border-dark hover:bg-surface-hover transition-colors group" data-testid={`preset-item-${pr.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  {pr.sourceMode === 'yt-dlp' ? <MonitorPlay className="w-4 h-4 text-primary" /> : <Film className="w-4 h-4 text-primary" />}
                </div>
                <div>
                  <h3 className="font-heading font-bold text-txt-bright text-sm">{pr.name}</h3>
                  <p className="text-xs text-txt-muted mt-0.5">{pr.sourceMode} | {QUALITY_PROFILES[pr.qualityProfile]?.label || 'Custom'} | {pr.videoCodec}</p>
                  <p className="text-xs text-txt-muted font-mono">{pr.width}x{pr.height} @ {pr.fps}fps | {pr.bitrateVideoKbps}/{pr.maxBitrateVideoKbps} kbps</p>
                  <p className="text-xs text-txt-muted truncate max-w-md mt-0.5">{pr.sourceUrl}</p>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(pr)} data-testid={`edit-preset-${pr.id}`}
                  className="p-2 hover:bg-surface-light rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5 text-txt-muted" /></button>
                <button onClick={() => handleDelete(pr.id)} data-testid={`delete-preset-${pr.id}`}
                  className="p-2 hover:bg-danger/15 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5 text-danger" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
