import React, { useEffect, useRef, useState } from 'react';
import './App.css';

function App() {
  const [state, setState] = useState({ app: null, voiceChannels: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Redirect to the control panel served by the Node.js backend
    // The control panel serves its own HTML, CSS, JS
    const checkBackend = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/state`);
        if (res.ok) {
          const data = await res.json();
          if (mountedRef.current) {
            setState({ app: data, voiceChannels: [] });
            setLoading(false);
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          if (mountedRef.current) {
            // Still show the panel even with errors (e.g., missing Discord token)
            if (errData.channels || errData.runtime) {
              setState({ app: errData, voiceChannels: [] });
              setLoading(false);
            } else {
              setError(errData.error || 'Control Panel API nicht erreichbar');
              setLoading(false);
            }
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          setError('Control Panel wird gestartet...');
          setLoading(false);
          setTimeout(() => window.location.reload(), 3000);
        }
      }
    };
    checkBackend();
  }, [BACKEND_URL]);

  if (loading) {
    return (
      <div data-testid="loading-screen" className="cp-loading">
        <div className="cp-spinner"></div>
        <h2>Discord Stream Selfbot</h2>
        <p>Control Panel wird geladen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="error-screen" className="cp-loading">
        <h2>Discord Stream Selfbot</h2>
        <p>{error}</p>
        <button data-testid="retry-button" onClick={() => window.location.reload()}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  // Show the control panel in an embedded view
  return (
    <div data-testid="control-panel-wrapper" className="cp-wrapper">
      <ControlPanel state={state} backendUrl={BACKEND_URL} />
    </div>
  );
}

function ControlPanel({ state: initialState, backendUrl }) {
  const [appState, setAppState] = useState(initialState.app);
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [notice, setNotice] = useState(null);

  const api = async (path, options = {}) => {
    const response = await fetch(`${backendUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  };

  const refresh = async () => {
    try {
      const data = await api('/api/bootstrap');
      setAppState(data.state);
      setVoiceChannels(data.voiceChannels || []);
      setNotice(null);
    } catch (err) {
      // Bootstrap requires Discord connection - fall back to state endpoint
      try {
        const stateData = await api('/api/state');
        setAppState(stateData);
        setNotice(null);
      } catch (stateErr) {
        setNotice({ message: stateErr.message, tone: 'danger' });
      }
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, appState?.runtime?.activeRun ? 3000 : 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line
  }, []);

  if (!appState) return null;

  const runtime = appState.runtime || {};
  const channels = appState.channels || [];
  const presets = appState.presets || [];
  const events = appState.events || [];
  const logs = appState.logs || [];
  const activeRun = runtime.activeRun;

  const formatDateTime = (iso) => {
    if (!iso) return '';
    return new Intl.DateTimeFormat('de-AT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  };

  const formatUptime = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const stopActive = async () => {
    try {
      const result = await api('/api/stop', { method: 'POST' });
      setNotice({ message: result?.stopped ? 'Stream wird gestoppt.' : 'Kein aktiver Stream.', tone: result?.stopped ? 'success' : 'info' });
      await refresh();
    } catch (err) {
      setNotice({ message: err.message, tone: 'danger' });
    }
  };

  const statusBadge = (status) => {
    if (status === 'ready') return 'badge-ready';
    if (status === 'error') return 'badge-error';
    return 'badge-neutral';
  };

  const eventStatusLabel = (s) => {
    const map = { scheduled: 'geplant', running: 'laeuft', completed: 'abgeschlossen', canceled: 'abgebrochen', failed: 'fehlgeschlagen' };
    return map[s] || s;
  };

  const scheduledEvents = events.filter(e => e.status === 'scheduled');
  const nextEvent = [...scheduledEvents].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Discord Video Stream Selfbot</p>
          <h1 data-testid="main-title">Stream Control Panel</h1>
          <p className="subtitle">
            Kanaele, Presets, Serien, Discord-Kommandos und manuelle Starts auf einer Oberflaeche.
          </p>
        </div>
        <div className="hero-actions">
          <span data-testid="discord-status-badge" className={`badge ${statusBadge(runtime.discordStatus)}`}>
            {runtime.discordStatus || 'laedt'}
          </span>
          <button data-testid="refresh-button" className="ghost-button" onClick={refresh}>Aktualisieren</button>
          <button data-testid="stop-button" className="danger-button" onClick={stopActive}>Aktiven Stream stoppen</button>
        </div>
      </header>

      {notice && (
        <div data-testid="notice-bar" className="notice" data-tone={notice.tone}>
          {notice.message}
        </div>
      )}

      <section className="overview-grid" data-testid="overview-section">
        <article className="overview-card">
          <h2>Discord</h2>
          <p data-testid="discord-user">{runtime.discordUserTag ? `${runtime.discordUserTag} (${runtime.discordUserId || '?'})` : runtime.lastError || 'nicht verbunden'}</p>
          <p className="muted" data-testid="ffmpeg-info">
            {runtime.ffmpegPath ? 'ffmpeg erkannt' : 'ffmpeg fehlt'} | {runtime.ffprobePath ? 'ffprobe erkannt' : 'ffprobe fehlt'} | {runtime.ytDlpAvailable ? 'yt-dlp erkannt' : 'yt-dlp nicht erkannt'}
          </p>
          <p className="muted" data-testid="command-info">
            {runtime.commandPrefix ? `Discord-Commands: ${runtime.commandPrefix}` : 'Discord-Commands deaktiviert'}
          </p>
        </article>
        <article className="overview-card">
          <h2>Aktiver Lauf</h2>
          <p data-testid="active-run-primary">
            {activeRun ? `${activeRun.channelName} -> ${activeRun.presetName}` : 'kein aktiver Stream'}
          </p>
          <p className="muted" data-testid="active-run-secondary">
            {activeRun ? `Status: ${activeRun.status} | Seit: ${formatDateTime(activeRun.startedAt)}` : runtime.lastEndedAt ? `Letztes Ende: ${formatDateTime(runtime.lastEndedAt)}` : 'kein letzter Lauf'}
          </p>
          {activeRun?.status === 'running' && (
            <div className="stream-health" data-testid="stream-health">
              <span className="health-dot"></span>
              <span className="health-uptime">{formatUptime(Date.now() - Date.parse(activeRun.startedAt))}</span>
            </div>
          )}
        </article>
        <article className="overview-card">
          <h2>Geplante Events</h2>
          <p data-testid="scheduled-summary">{scheduledEvents.length} Events geplant</p>
          <p className="muted" data-testid="next-event-summary">
            {nextEvent ? `${nextEvent.name}: ${formatDateTime(nextEvent.startAt)}` : 'kein naechstes Event'}
          </p>
        </article>
      </section>

      <main className="layout">
        <ManualStartSection channels={channels} presets={presets} api={api} refresh={refresh} setNotice={setNotice} />
        <ChannelsSection channels={channels} api={api} refresh={refresh} setNotice={setNotice} voiceChannels={voiceChannels} />
        <PresetsSection presets={presets} api={api} refresh={refresh} setNotice={setNotice} />
        <EventsSection events={events} channels={channels} presets={presets} api={api} refresh={refresh} setNotice={setNotice} formatDateTime={formatDateTime} eventStatusLabel={eventStatusLabel} />
        <LogsSection logs={logs} formatDateTime={formatDateTime} />
      </main>
    </div>
  );
}

function ManualStartSection({ channels, presets, api, refresh, setNotice }) {
  const [channelId, setChannelId] = useState('');
  const [presetId, setPresetId] = useState('');
  const [stopAt, setStopAt] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/manual/start', {
        method: 'POST',
        body: JSON.stringify({ channelId, presetId, stopAt: stopAt ? new Date(stopAt).toISOString() : undefined }),
      });
      setNotice({ message: 'Manueller Stream wird gestartet.', tone: 'success' });
      setStopAt('');
      await refresh();
    } catch (err) {
      setNotice({ message: err.message, tone: 'danger' });
    }
  };

  return (
    <section className="panel" data-testid="manual-start-section">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Sofortaktion</p>
          <h2>Manueller Start</h2>
        </div>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Kanal
          <select data-testid="manual-channel-select" value={channelId} onChange={e => setChannelId(e.target.value)} required>
            <option value="">Kanal waehlen</option>
            {channels.map(c => <option key={c.id} value={c.id}>{c.name} ({c.streamMode})</option>)}
          </select>
        </label>
        <label>
          Preset
          <select data-testid="manual-preset-select" value={presetId} onChange={e => setPresetId(e.target.value)} required>
            <option value="">Preset waehlen</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sourceMode})</option>)}
          </select>
        </label>
        <label>
          Optional stoppen um
          <input data-testid="manual-stop-at" type="datetime-local" value={stopAt} onChange={e => setStopAt(e.target.value)} />
        </label>
        <div className="form-actions">
          <button data-testid="manual-start-button" className="primary-button" type="submit">Jetzt starten</button>
        </div>
      </form>
    </section>
  );
}

function ChannelsSection({ channels, api, refresh, setNotice, voiceChannels }) {
  const [form, setForm] = useState({ id: '', name: '', guildId: '', channelId: '', streamMode: 'go-live', description: '' });

  const reset = () => setForm({ id: '', name: '', guildId: '', channelId: '', streamMode: 'go-live', description: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { name: form.name, guildId: form.guildId, channelId: form.channelId, streamMode: form.streamMode, description: form.description };
      if (form.id) {
        await api(`/api/channels/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setNotice({ message: 'Kanal aktualisiert.', tone: 'success' });
      } else {
        await api('/api/channels', { method: 'POST', body: JSON.stringify(payload) });
        setNotice({ message: 'Kanal gespeichert.', tone: 'success' });
      }
      reset();
      await refresh();
    } catch (err) {
      setNotice({ message: err.message, tone: 'danger' });
    }
  };

  const edit = (c) => setForm({ id: c.id, name: c.name, guildId: c.guildId, channelId: c.channelId, streamMode: c.streamMode, description: c.description });

  const del = async (id) => {
    try {
      await api(`/api/channels/${id}`, { method: 'DELETE' });
      setNotice({ message: 'Kanal geloescht.', tone: 'success' });
      await refresh();
    } catch (err) {
      setNotice({ message: err.message, tone: 'danger' });
    }
  };

  return (
    <section className="panel" data-testid="channels-section">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Konfiguration</p>
          <h2>Kanaele</h2>
        </div>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>Name <input data-testid="channel-name-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></label>
        <label>Guild ID <input data-testid="channel-guild-input" value={form.guildId} onChange={e => setForm({...form, guildId: e.target.value})} required /></label>
        <label>Voice Channel ID <input data-testid="channel-id-input" value={form.channelId} onChange={e => setForm({...form, channelId: e.target.value})} required /></label>
        <label>Stream-Modus
          <select data-testid="channel-mode-select" value={form.streamMode} onChange={e => setForm({...form, streamMode: e.target.value})}>
            <option value="go-live">Go Live</option>
            <option value="camera">Camera</option>
          </select>
        </label>
        <label className="full-width">Beschreibung <input data-testid="channel-desc-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></label>
        <div className="form-actions">
          <button data-testid="channel-save-button" className="primary-button" type="submit">Kanal speichern</button>
          <button data-testid="channel-reset-button" className="ghost-button" type="button" onClick={reset}>Zuruecksetzen</button>
        </div>
      </form>
      <div className="stack-list" data-testid="channels-list">
        {channels.length === 0 ? <p className="muted">Noch keine Kanaele gespeichert.</p> : channels.map(c => (
          <article key={c.id} className="item-card">
            <div className="item-topline">
              <div>
                <h3 className="item-title">{c.name}</h3>
                <p className="item-meta">{c.guildId} / {c.channelId}</p>
                <p className="item-meta">{c.streamMode}{c.description ? ` | ${c.description}` : ''}</p>
              </div>
            </div>
            <div className="item-actions">
              <button data-testid={`edit-channel-${c.id}`} onClick={() => edit(c)}>Bearbeiten</button>
              <button data-testid={`delete-channel-${c.id}`} onClick={() => del(c.id)}>Loeschen</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PresetsSection({ presets, api, refresh, setNotice }) {
  const defaultForm = {
    id: '', name: '', sourceMode: 'direct', qualityProfile: '1080p60', bufferProfile: 'auto',
    sourceUrl: '', width: 1920, height: 1080, fps: 60, bitrateVideoKbps: 7500,
    maxBitrateVideoKbps: 10000, bitrateAudioKbps: 160, videoCodec: 'H264',
    includeAudio: true, hardwareAcceleration: false, minimizeLatency: false, description: ''
  };
  const [form, setForm] = useState(defaultForm);

  const reset = () => setForm(defaultForm);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      delete payload.id;
      if (form.id) {
        await api(`/api/presets/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setNotice({ message: 'Preset aktualisiert.', tone: 'success' });
      } else {
        await api('/api/presets', { method: 'POST', body: JSON.stringify(payload) });
        setNotice({ message: 'Preset gespeichert.', tone: 'success' });
      }
      reset();
      await refresh();
    } catch (err) {
      setNotice({ message: err.message, tone: 'danger' });
    }
  };

  const edit = (p) => setForm({
    id: p.id, name: p.name, sourceMode: p.sourceMode, qualityProfile: p.qualityProfile || 'custom',
    bufferProfile: p.bufferProfile || 'auto', sourceUrl: p.sourceUrl, width: p.width, height: p.height,
    fps: p.fps, bitrateVideoKbps: p.bitrateVideoKbps, maxBitrateVideoKbps: p.maxBitrateVideoKbps,
    bitrateAudioKbps: p.bitrateAudioKbps, videoCodec: p.videoCodec, includeAudio: p.includeAudio,
    hardwareAcceleration: p.hardwareAcceleration, minimizeLatency: p.minimizeLatency, description: p.description || ''
  });

  const del = async (id) => {
    try {
      await api(`/api/presets/${id}`, { method: 'DELETE' });
      setNotice({ message: 'Preset geloescht.', tone: 'success' });
      await refresh();
    } catch (err) {
      setNotice({ message: err.message, tone: 'danger' });
    }
  };

  const testUrl = async () => {
    if (!form.sourceUrl) return;
    try {
      const result = await api('/api/presets/test-url', { method: 'POST', body: JSON.stringify({ url: form.sourceUrl }) });
      setNotice({
        message: result.reachable ? `Erreichbar (${result.status}) | Typ: ${result.contentType}` : `Nicht erreichbar: ${result.error || 'Status ' + result.status}`,
        tone: result.reachable ? 'success' : 'danger'
      });
    } catch (err) {
      setNotice({ message: `Test fehlgeschlagen: ${err.message}`, tone: 'danger' });
    }
  };

  return (
    <section className="panel" data-testid="presets-section">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Vorlagen</p>
          <h2>Stream Presets</h2>
        </div>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>Name <input data-testid="preset-name-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></label>
        <label>Quelltyp
          <select data-testid="preset-source-mode" value={form.sourceMode} onChange={e => setForm({...form, sourceMode: e.target.value})}>
            <option value="direct">Direkte Media-URL</option>
            <option value="yt-dlp">yt-dlp (YouTube / Livestream)</option>
          </select>
        </label>
        <label>Qualitaetsprofil
          <select data-testid="preset-quality-profile" value={form.qualityProfile} onChange={e => setForm({...form, qualityProfile: e.target.value})}>
            <option value="720p30">720p / 30 FPS</option>
            <option value="720p60">720p / 60 FPS</option>
            <option value="1080p30">1080p / 30 FPS</option>
            <option value="1080p60">1080p / 60 FPS</option>
            <option value="1440p30">1440p / 30 FPS</option>
            <option value="1440p60">1440p / 60 FPS</option>
            <option value="2160p30">4K / 30 FPS</option>
            <option value="2160p60">4K / 60 FPS</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>Buffer-Profil
          <select data-testid="preset-buffer-profile" value={form.bufferProfile} onChange={e => setForm({...form, bufferProfile: e.target.value})}>
            <option value="auto">Auto</option>
            <option value="stable">Maximale Stabilitaet</option>
            <option value="balanced">Ausgewogen</option>
            <option value="low-latency">Minimale Latenz</option>
          </select>
        </label>
        <label className="full-width">
          URL / Quelle
          <div className="url-field-row">
            <input data-testid="preset-source-url" value={form.sourceUrl} onChange={e => setForm({...form, sourceUrl: e.target.value})} required />
            <button data-testid="preset-test-url-button" className="ghost-button" type="button" onClick={testUrl}>Testen</button>
          </div>
        </label>
        <label>Breite <input data-testid="preset-width" type="number" min="1" value={form.width} onChange={e => setForm({...form, width: parseInt(e.target.value) || 1280})} required /></label>
        <label>Hoehe <input data-testid="preset-height" type="number" min="1" value={form.height} onChange={e => setForm({...form, height: parseInt(e.target.value) || 720})} required /></label>
        <label>FPS <input data-testid="preset-fps" type="number" min="1" value={form.fps} onChange={e => setForm({...form, fps: parseInt(e.target.value) || 30})} required /></label>
        <label>Video kbps <input data-testid="preset-bitrate-video" type="number" min="1" value={form.bitrateVideoKbps} onChange={e => setForm({...form, bitrateVideoKbps: parseInt(e.target.value) || 4500})} required /></label>
        <label>Max Video kbps <input data-testid="preset-bitrate-max" type="number" min="1" value={form.maxBitrateVideoKbps} onChange={e => setForm({...form, maxBitrateVideoKbps: parseInt(e.target.value) || 6500})} required /></label>
        <label>Audio kbps <input data-testid="preset-bitrate-audio" type="number" min="1" value={form.bitrateAudioKbps} onChange={e => setForm({...form, bitrateAudioKbps: parseInt(e.target.value) || 160})} required /></label>
        <label>Codec
          <select data-testid="preset-codec" value={form.videoCodec} onChange={e => setForm({...form, videoCodec: e.target.value})}>
            <option value="H264">H264</option>
            <option value="H265">H265</option>
          </select>
        </label>
        <label className="checkbox-field">
          <input data-testid="preset-audio-checkbox" type="checkbox" checked={form.includeAudio} onChange={e => setForm({...form, includeAudio: e.target.checked})} />
          Audio mitsenden
        </label>
        <label className="checkbox-field">
          <input data-testid="preset-hw-checkbox" type="checkbox" checked={form.hardwareAcceleration} onChange={e => setForm({...form, hardwareAcceleration: e.target.checked})} />
          Hardware-Decoding
        </label>
        <label className="full-width">Beschreibung <input data-testid="preset-desc-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></label>
        <div className="form-actions">
          <button data-testid="preset-save-button" className="primary-button" type="submit">Preset speichern</button>
          <button data-testid="preset-reset-button" className="ghost-button" type="button" onClick={reset}>Zuruecksetzen</button>
        </div>
      </form>
      <div className="stack-list" data-testid="presets-list">
        {presets.length === 0 ? <p className="muted">Noch keine Presets gespeichert.</p> : presets.map(p => (
          <article key={p.id} className="item-card">
            <div className="item-topline">
              <div>
                <h3 className="item-title">{p.name}</h3>
                <p className="item-meta">{p.sourceMode} | {p.width}x{p.height} @ {p.fps}fps | {p.videoCodec}</p>
                <p className="item-meta">{p.bitrateVideoKbps}/{p.maxBitrateVideoKbps} kbps Video | {p.bitrateAudioKbps} kbps Audio</p>
                <p className="item-meta">{p.sourceUrl}</p>
              </div>
            </div>
            <div className="item-actions">
              <button data-testid={`edit-preset-${p.id}`} onClick={() => edit(p)}>Bearbeiten</button>
              <button data-testid={`delete-preset-${p.id}`} onClick={() => del(p.id)}>Loeschen</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EventsSection({ events, channels, presets, api, refresh, setNotice, formatDateTime, eventStatusLabel }) {
  const defaultForm = { id: '', name: '', channelId: '', presetId: '', startAt: '', endAt: '', description: '', recurrenceKind: 'once', recurrenceInterval: 1, recurrenceUntil: '', daysOfWeek: [] };
  const [form, setForm] = useState(defaultForm);
  const reset = () => setForm(defaultForm);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const recurrence = form.recurrenceKind === 'once' ? { kind: 'once' } : {
        kind: form.recurrenceKind,
        interval: form.recurrenceInterval,
        until: form.recurrenceUntil ? new Date(form.recurrenceUntil).toISOString() : undefined,
        daysOfWeek: form.recurrenceKind === 'weekly' ? form.daysOfWeek : undefined,
      };
      const payload = {
        name: form.name, channelId: form.channelId, presetId: form.presetId,
        startAt: form.startAt ? new Date(form.startAt).toISOString() : undefined,
        endAt: form.endAt ? new Date(form.endAt).toISOString() : undefined,
        description: form.description, recurrence,
      };

      if (form.id) {
        await api(`/api/events/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setNotice({ message: 'Event aktualisiert.', tone: 'success' });
      } else {
        await api('/api/events', { method: 'POST', body: JSON.stringify(payload) });
        setNotice({ message: 'Event gespeichert.', tone: 'success' });
      }
      reset();
      await refresh();
    } catch (err) {
      setNotice({ message: err.message, tone: 'danger' });
    }
  };

  return (
    <section className="panel panel-wide" data-testid="events-section">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Planung</p>
          <h2>Events</h2>
        </div>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>Name <input data-testid="event-name-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></label>
        <label>Kanal
          <select data-testid="event-channel-select" value={form.channelId} onChange={e => setForm({...form, channelId: e.target.value})} required>
            <option value="">Kanal waehlen</option>
            {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Preset
          <select data-testid="event-preset-select" value={form.presetId} onChange={e => setForm({...form, presetId: e.target.value})} required>
            <option value="">Preset waehlen</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Start <input data-testid="event-start-input" type="datetime-local" value={form.startAt} onChange={e => setForm({...form, startAt: e.target.value})} required /></label>
        <label>Ende <input data-testid="event-end-input" type="datetime-local" value={form.endAt} onChange={e => setForm({...form, endAt: e.target.value})} required /></label>
        <label>Wiederholung
          <select data-testid="event-recurrence-kind" value={form.recurrenceKind} onChange={e => setForm({...form, recurrenceKind: e.target.value})}>
            <option value="once">Einmalig</option>
            <option value="daily">Taeglich</option>
            <option value="weekly">Woechentlich</option>
          </select>
        </label>
        {form.recurrenceKind !== 'once' && (
          <>
            <label>Intervall <input data-testid="event-interval-input" type="number" min="1" value={form.recurrenceInterval} onChange={e => setForm({...form, recurrenceInterval: parseInt(e.target.value) || 1})} /></label>
            <label>Wiederholen bis <input data-testid="event-until-input" type="datetime-local" value={form.recurrenceUntil} onChange={e => setForm({...form, recurrenceUntil: e.target.value})} /></label>
          </>
        )}
        <label className="full-width">Beschreibung <input data-testid="event-desc-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></label>
        <div className="form-actions">
          <button data-testid="event-save-button" className="primary-button" type="submit">Event speichern</button>
          <button data-testid="event-reset-button" className="ghost-button" type="button" onClick={reset}>Zuruecksetzen</button>
        </div>
      </form>
      <div className="stack-list" data-testid="events-list">
        {events.length === 0 ? <p className="muted">Noch keine Events gespeichert.</p> : [...events].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)).map(ev => (
          <article key={ev.id} className="item-card">
            <div className="item-topline">
              <div>
                <h3 className="item-title">{ev.name} {ev.discordEventId && <span className="discord-badge">Discord</span>}</h3>
                <p className="item-meta">{formatDateTime(ev.startAt)} -> {formatDateTime(ev.endAt)}</p>
                <p className="item-meta"><span className={`event-status event-status-${ev.status}`}>{eventStatusLabel(ev.status)}</span></p>
                {ev.lastError && <p className="item-meta">Fehler: {ev.lastError}</p>}
              </div>
            </div>
            <div className="item-actions">
              <button data-testid={`start-event-${ev.id}`} onClick={async () => { try { await api(`/api/events/${ev.id}/start`, { method: 'POST' }); setNotice({ message: 'Event wird gestartet.', tone: 'success' }); await refresh(); } catch(err) { setNotice({ message: err.message, tone: 'danger' }); }}}>Start</button>
              <button data-testid={`cancel-event-${ev.id}`} onClick={async () => { try { await api(`/api/events/${ev.id}/cancel`, { method: 'POST' }); setNotice({ message: 'Event abgebrochen.', tone: 'success' }); await refresh(); } catch(err) { setNotice({ message: err.message, tone: 'danger' }); }}}>Abbrechen</button>
              <button data-testid={`delete-event-${ev.id}`} onClick={async () => { try { await api(`/api/events/${ev.id}`, { method: 'DELETE' }); setNotice({ message: 'Event geloescht.', tone: 'success' }); await refresh(); } catch(err) { setNotice({ message: err.message, tone: 'danger' }); }}}>Loeschen</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LogsSection({ logs, formatDateTime }) {
  return (
    <section className="panel panel-wide" data-testid="logs-section">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Verlauf</p>
          <h2>Letzte Logs</h2>
        </div>
      </div>
      <div className="log-list" data-testid="logs-list">
        {logs.length === 0 ? <p className="muted">Noch keine Logs.</p> : logs.slice(0, 60).map(log => (
          <article key={log.id} className="log-entry" data-level={log.level}>
            <p><strong>{log.level.toUpperCase()}</strong> {log.message}</p>
            <p className="muted">
              {formatDateTime(log.createdAt)}
              {log.context && Object.entries(log.context).filter(([,v]) => v).map(([k,v]) => ` | ${k}: ${v}`).join('')}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default App;
