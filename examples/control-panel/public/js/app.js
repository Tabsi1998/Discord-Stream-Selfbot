const state = {
  app: null,
  voiceChannels: [],
};

const QUALITY_PROFILES = {
  "720p30": {
    label: "720p / 30 FPS",
    description: "Solide Standardwahl fuer lange, stabile Streams.",
    width: 1280,
    height: 720,
    fps: 30,
    preserveSource: false,
  },
  "720p60": {
    label: "720p / 60 FPS",
    description: "Mehr Bewegungsglaette bei moderater Last.",
    width: 1280,
    height: 720,
    fps: 60,
    preserveSource: false,
  },
  "1080p30": {
    label: "1080p / 30 FPS",
    description: "Schaerferes Bild bei noch gut beherrschbarer Last.",
    width: 1920,
    height: 1080,
    fps: 30,
    preserveSource: false,
  },
  "1080p60": {
    label: "1080p / 60 FPS",
    description: "Hohe Bildqualitaet, braucht deutlich mehr Reserven.",
    width: 1920,
    height: 1080,
    fps: 60,
    preserveSource: false,
  },
  "1440p30": {
    label: "1440p / 30 FPS",
    description: "Sehr schaerf, aber schon klar schwerer fuer Encoder und Discord.",
    width: 2560,
    height: 1440,
    fps: 30,
    preserveSource: false,
  },
  "1440p60": {
    label: "1440p / 60 FPS",
    description: "Sehr hohe Last, nur fuer starke Systeme sinnvoll.",
    width: 2560,
    height: 1440,
    fps: 60,
    preserveSource: false,
  },
  "2160p30": {
    label: "4K / 30 FPS",
    description: "Ultra HD, braucht sehr viel Bandbreite und CPU-Power.",
    width: 3840,
    height: 2160,
    fps: 30,
    preserveSource: false,
  },
  "2160p60": {
    label: "4K / 60 FPS",
    description: "Maximale Qualitaet, nur fuer sehr starke Systeme.",
    width: 3840,
    height: 2160,
    fps: 60,
    preserveSource: false,
  },
  custom: {
    label: "Custom",
    description: "Freie Aufloesung, FPS und Bitraten.",
    width: 1280,
    height: 720,
    fps: 30,
    preserveSource: false,
  },
};

const BUFFER_STRATEGIES = {
  auto: {
    label: "Auto",
    description: "Waehlt das Verhalten passend zu Quelle und Profil.",
  },
  stable: {
    label: "Maximale Stabilitaet",
    description: "Mehr Burst und Queue fuer moeglichst ruhige Wiedergabe.",
    minimizeLatency: false,
  },
  balanced: {
    label: "Ausgewogen",
    description: "Der beste Standard fuer die meisten Streams.",
    minimizeLatency: false,
  },
  "low-latency": {
    label: "Minimale Latenz",
    description: "Schneller Start, aber empfindlicher bei Spikes.",
    minimizeLatency: true,
  },
};

const els = {
  notice: document.querySelector("#notice"),
  refreshButton: document.querySelector("#refreshButton"),
  stopButton: document.querySelector("#stopButton"),
  refreshVoiceChannelsButton: document.querySelector("#refreshVoiceChannelsButton"),
  applyDiscoveredChannelButton: document.querySelector(
    "#applyDiscoveredChannelButton",
  ),
  discoveredChannelSelect: document.querySelector("#discoveredChannelSelect"),
  voiceChannelDiscoveryInfo: document.querySelector(
    "#voiceChannelDiscoveryInfo",
  ),
  discordStatusBadge: document.querySelector("#discordStatusBadge"),
  discordUser: document.querySelector("#discordUser"),
  ffmpegInfo: document.querySelector("#ffmpegInfo"),
  commandInfo: document.querySelector("#commandInfo"),
  activeRunPrimary: document.querySelector("#activeRunPrimary"),
  activeRunSecondary: document.querySelector("#activeRunSecondary"),
  scheduledSummary: document.querySelector("#scheduledSummary"),
  nextEventSummary: document.querySelector("#nextEventSummary"),
  channelForm: document.querySelector("#channelForm"),
  channelIdField: document.querySelector("#channelIdField"),
  channelName: document.querySelector("#channelName"),
  channelGuildId: document.querySelector("#channelGuildId"),
  channelDiscordId: document.querySelector("#channelDiscordId"),
  channelStreamMode: document.querySelector("#channelStreamMode"),
  channelDescription: document.querySelector("#channelDescription"),
  channelResetButton: document.querySelector("#channelResetButton"),
  channelsList: document.querySelector("#channelsList"),
  presetForm: document.querySelector("#presetForm"),
  presetIdField: document.querySelector("#presetIdField"),
  presetName: document.querySelector("#presetName"),
  presetSourceMode: document.querySelector("#presetSourceMode"),
  presetQualityProfile: document.querySelector("#presetQualityProfile"),
  presetBufferProfile: document.querySelector("#presetBufferProfile"),
  presetSourceUrl: document.querySelector("#presetSourceUrl"),
  presetProfileHint: document.querySelector("#presetProfileHint"),
  presetWidth: document.querySelector("#presetWidth"),
  presetHeight: document.querySelector("#presetHeight"),
  presetFps: document.querySelector("#presetFps"),
  presetBitrateVideo: document.querySelector("#presetBitrateVideo"),
  presetBitrateVideoMax: document.querySelector("#presetBitrateVideoMax"),
  presetBitrateAudio: document.querySelector("#presetBitrateAudio"),
  presetVideoCodec: document.querySelector("#presetVideoCodec"),
  presetRecommendButton: document.querySelector("#presetRecommendButton"),
  presetQualityHint: document.querySelector("#presetQualityHint"),
  presetIncludeAudio: document.querySelector("#presetIncludeAudio"),
  presetHardwareAcceleration: document.querySelector(
    "#presetHardwareAcceleration",
  ),
  presetDescription: document.querySelector("#presetDescription"),
  presetResetButton: document.querySelector("#presetResetButton"),
  presetsList: document.querySelector("#presetsList"),
  manualStartForm: document.querySelector("#manualStartForm"),
  manualChannelId: document.querySelector("#manualChannelId"),
  manualPresetId: document.querySelector("#manualPresetId"),
  manualStopAt: document.querySelector("#manualStopAt"),
  eventForm: document.querySelector("#eventForm"),
  eventIdField: document.querySelector("#eventIdField"),
  eventName: document.querySelector("#eventName"),
  eventChannelId: document.querySelector("#eventChannelId"),
  eventPresetId: document.querySelector("#eventPresetId"),
  eventStartAt: document.querySelector("#eventStartAt"),
  eventEndAt: document.querySelector("#eventEndAt"),
  eventRecurrenceKind: document.querySelector("#eventRecurrenceKind"),
  eventRecurrenceInterval: document.querySelector("#eventRecurrenceInterval"),
  eventRecurrenceUntil: document.querySelector("#eventRecurrenceUntil"),
  eventWeekdaysField: document.querySelector("#eventWeekdaysField"),
  eventDescription: document.querySelector("#eventDescription"),
  eventResetButton: document.querySelector("#eventResetButton"),
  eventsList: document.querySelector("#eventsList"),
  logsList: document.querySelector("#logsList"),
  eventWeekdayInputs: [
    ...document.querySelectorAll("#eventWeekdaysField input[data-weekday]"),
  ],
};

function showNotice(message, tone = "info") {
  els.notice.textContent = message;
  els.notice.dataset.tone = tone;
  els.notice.classList.remove("hidden");
}

function clearNotice() {
  els.notice.textContent = "";
  els.notice.dataset.tone = "";
  els.notice.classList.add("hidden");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

function formatDateTime(iso) {
  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function toLocalInputValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function fromLocalInputValue(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function roundToNearest(value, step = 50) {
  return Math.max(step, Math.round(value / step) * step);
}

function getQualityProfileConfig(profile) {
  return QUALITY_PROFILES[profile] || QUALITY_PROFILES.custom;
}

function getBufferStrategy(profile) {
  return BUFFER_STRATEGIES[profile] || BUFFER_STRATEGIES.auto;
}

function getRecommendedBitrates(width, height, fps, codec, qualityProfile = "custom") {
  const pixels = width * height;
  const highFrameRate = fps >= 50;
  let video = 2500;
  let videoMax = 3500;

  if (pixels >= 3840 * 2160) {
    video = highFrameRate ? 14000 : 10000;
    videoMax = highFrameRate ? 18000 : 14000;
  } else if (pixels >= 2560 * 1440) {
    video = highFrameRate ? 9000 : 8000;
    videoMax = 10000;
  } else if (pixels >= 1920 * 1080) {
    video = highFrameRate ? 8500 : 7000;
    videoMax = highFrameRate ? 10000 : 9500;
  } else if (pixels >= 1280 * 720) {
    video = highFrameRate ? 6500 : 4500;
    videoMax = highFrameRate ? 9000 : 6500;
  } else if (pixels >= 854 * 480) {
    video = highFrameRate ? 3500 : 2500;
    videoMax = highFrameRate ? 5000 : 3600;
  } else {
    video = highFrameRate ? 2200 : 1600;
    videoMax = highFrameRate ? 3200 : 2400;
  }

  if (codec === "H265") {
    video = Math.round(video * 0.8);
    videoMax = Math.round(videoMax * 0.82);
  }

  return {
    video: roundToNearest(video),
    videoMax: roundToNearest(videoMax),
    audio: 160,
  };
}

function getEffectiveBufferProfile(sourceMode, qualityProfile, width, height, fps, selectedProfile) {
  if (selectedProfile && selectedProfile !== "auto") {
    return selectedProfile;
  }
  if (sourceMode === "yt-dlp" && fps >= 60) return "stable";
  if (fps >= 60) return "stable";
  if (height >= 1080 || width >= 1920) return "stable";
  return "balanced";
}

function getResolvedPresetFormSettings() {
  const qualityProfile = els.presetQualityProfile.value || "720p30";
  const sourceMode = els.presetSourceMode.value || "direct";
  const bufferProfile = els.presetBufferProfile.value || "auto";
  const codec = els.presetVideoCodec.value || "H264";
  const quality = getQualityProfileConfig(qualityProfile);
  const manualWidth = parsePositiveNumber(els.presetWidth.value, quality.width);
  const manualHeight = parsePositiveNumber(els.presetHeight.value, quality.height);
  const manualFps = parsePositiveNumber(els.presetFps.value, quality.fps);
  const width = qualityProfile === "custom" ? manualWidth : quality.width;
  const height = qualityProfile === "custom" ? manualHeight : quality.height;
  const fps = qualityProfile === "custom" ? manualFps : quality.fps;
  const bitrateRecommendation = getRecommendedBitrates(
    width,
    height,
    fps,
    codec,
    qualityProfile,
  );
  const bitrateVideoKbps =
    qualityProfile === "custom"
      ? parsePositiveNumber(els.presetBitrateVideo.value, bitrateRecommendation.video)
      : bitrateRecommendation.video;
  const maxBitrateVideoKbps =
    qualityProfile === "custom"
      ? parsePositiveNumber(
          els.presetBitrateVideoMax.value,
          bitrateRecommendation.videoMax,
        )
      : bitrateRecommendation.videoMax;
  const bitrateAudioKbps =
    qualityProfile === "custom"
      ? parsePositiveNumber(els.presetBitrateAudio.value, bitrateRecommendation.audio)
      : bitrateRecommendation.audio;
  const effectiveBufferProfile = getEffectiveBufferProfile(
    sourceMode,
    qualityProfile,
    width,
    height,
    fps,
    bufferProfile,
  );
  const bufferStrategy = getBufferStrategy(effectiveBufferProfile);

  return {
    qualityProfile,
    sourceMode,
    bufferProfile,
    effectiveBufferProfile,
    quality,
    width,
    height,
    fps,
    bitrateVideoKbps,
    maxBitrateVideoKbps,
    bitrateAudioKbps,
    codec,
    minimizeLatency: !!bufferStrategy.minimizeLatency,
  };
}

function getCurrentPresetRecommendation() {
  const resolved = getResolvedPresetFormSettings();
  return {
    width: resolved.width,
    height: resolved.height,
    fps: resolved.fps,
    codec: resolved.codec,
    qualityProfile: resolved.qualityProfile,
    effectiveBufferProfile: resolved.effectiveBufferProfile,
    quality: resolved.quality,
    video: resolved.bitrateVideoKbps,
    videoMax: resolved.maxBitrateVideoKbps,
    audio: resolved.bitrateAudioKbps,
  };
}

function syncPresetFieldsFromProfiles() {
  const resolved = getResolvedPresetFormSettings();
  const autoManaged = resolved.qualityProfile !== "custom";

  if (autoManaged) {
    els.presetWidth.value = String(resolved.width);
    els.presetHeight.value = String(resolved.height);
    els.presetFps.value = String(resolved.fps);
    els.presetBitrateVideo.value = String(resolved.bitrateVideoKbps);
    els.presetBitrateVideoMax.value = String(resolved.maxBitrateVideoKbps);
    els.presetBitrateAudio.value = String(resolved.bitrateAudioKbps);
  }

  [
    els.presetWidth,
    els.presetHeight,
    els.presetFps,
    els.presetBitrateVideo,
    els.presetBitrateVideoMax,
    els.presetBitrateAudio,
  ].forEach((element) => {
    element.disabled = autoManaged;
  });

  const bufferLabel =
    resolved.bufferProfile === "auto"
      ? `${BUFFER_STRATEGIES.auto.label} -> ${getBufferStrategy(
          resolved.effectiveBufferProfile,
        ).label}`
      : getBufferStrategy(resolved.effectiveBufferProfile).label;
  const profileText = resolved.quality.preserveSource
    ? `${resolved.quality.label}: Quelle bestimmt Aufloesung und FPS, Buffering laeuft auf ${bufferLabel}.`
    : `${resolved.quality.label}: ${resolved.width}x${resolved.height} @ ${resolved.fps} FPS, Buffering auf ${bufferLabel}.`;
  els.presetProfileHint.dataset.tone =
    resolved.effectiveBufferProfile === "low-latency" ? "warn" : "info";
  els.presetProfileHint.textContent = `${profileText} ${resolved.quality.description}`;
}

function updatePresetQualityHint() {
  const recommendation = getCurrentPresetRecommendation();
  const currentVideo = parsePositiveNumber(els.presetBitrateVideo.value, 0);
  const currentVideoMax = parsePositiveNumber(els.presetBitrateVideoMax.value, 0);
  const currentAudio = parsePositiveNumber(els.presetBitrateAudio.value, 0);
  const includeAudio = els.presetIncludeAudio.checked;

  const belowRecommendation =
    currentVideo < recommendation.video
    || currentVideoMax < recommendation.videoMax
    || (includeAudio && currentAudio < recommendation.audio);

  els.presetQualityHint.dataset.tone = belowRecommendation ? "warn" : "success";
  els.presetQualityHint.textContent = belowRecommendation
    ? `Empfohlen fuer ${recommendation.quality.label} (${recommendation.codec}): ${recommendation.video}/${recommendation.videoMax} kbps Video${includeAudio ? `, ${recommendation.audio} kbps Audio` : ""}. Das aktuelle Preset liegt darunter und fuehrt oft zu matschigem Bild oder FPS-Drops.`
    : `Empfohlen fuer ${recommendation.quality.label} (${recommendation.codec}): ${recommendation.video}/${recommendation.videoMax} kbps Video${includeAudio ? `, ${recommendation.audio} kbps Audio` : ""}. Die aktuellen Werte liegen im sauberen Bereich.`;
}

function applyRecommendedPresetSettings() {
  const recommendation = getCurrentPresetRecommendation();
  els.presetWidth.value = String(recommendation.width);
  els.presetHeight.value = String(recommendation.height);
  els.presetFps.value = String(recommendation.fps);
  els.presetBitrateVideo.value = String(recommendation.video);
  els.presetBitrateVideoMax.value = String(recommendation.videoMax);
  els.presetBitrateAudio.value = String(recommendation.audio);
  syncPresetFieldsFromProfiles();
  updatePresetQualityHint();
}

function recurrenceSummary(rule) {
  if (!rule || rule.kind === "once") {
    return "einmalig";
  }

  if (rule.kind === "daily") {
    const cadence = rule.interval === 1 ? "taeglich" : `alle ${rule.interval} Tage`;
    return rule.until
      ? `${cadence} bis ${formatDateTime(rule.until)}`
      : cadence;
  }

  const weekdayLabels = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const days = (rule.daysOfWeek || [])
    .map((day) => weekdayLabels[day] || String(day))
    .join(", ");
  const cadence =
    rule.interval === 1 ? "woechentlich" : `alle ${rule.interval} Wochen`;
  return rule.until
    ? `${cadence} (${days}) bis ${formatDateTime(rule.until)}`
    : `${cadence} (${days})`;
}

function eventStatusLabel(status) {
  switch (status) {
    case "scheduled":
      return "geplant";
    case "running":
      return "laeuft";
    case "completed":
      return "abgeschlossen";
    case "canceled":
      return "abgebrochen";
    case "failed":
      return "fehlgeschlagen";
    default:
      return status;
  }
}

function getSelectedWeekdays() {
  return els.eventWeekdayInputs
    .filter((input) => input.checked)
    .map((input) => Number.parseInt(input.dataset.weekday || "", 10))
    .filter((day) => Number.isInteger(day))
    .sort((a, b) => a - b);
}

function setSelectedWeekdays(days) {
  const selected = new Set(days || []);
  for (const input of els.eventWeekdayInputs) {
    input.checked = selected.has(Number.parseInt(input.dataset.weekday || "", 10));
  }
}

function deriveStartWeekday() {
  if (!els.eventStartAt.value) return null;
  const start = new Date(els.eventStartAt.value);
  if (Number.isNaN(start.getTime())) return null;
  return start.getDay();
}

function updateRecurrenceVisibility() {
  const kind = els.eventRecurrenceKind.value;
  const recurring = kind !== "once";
  els.eventRecurrenceInterval.required = recurring;
  els.eventRecurrenceUntil.required = recurring;
  els.eventWeekdaysField.classList.toggle("hidden", kind !== "weekly");

  if (kind === "weekly" && !getSelectedWeekdays().length) {
    const weekday = deriveStartWeekday();
    if (weekday !== null) {
      setSelectedWeekdays([weekday]);
    }
  }
}

function channelLabel(item) {
  return `${item.name} (${item.streamMode})`;
}

function presetLabel(item) {
  return `${item.name} (${item.sourceMode})`;
}

function describePresetQuality(item) {
  const profile = getQualityProfileConfig(item.qualityProfile || "custom");
  const buffer = getBufferStrategy(
    getEffectiveBufferProfile(
      item.sourceMode,
      item.qualityProfile || "custom",
      item.width,
      item.height,
      item.fps,
      item.bufferProfile || "auto",
    ),
  );

  if (profile.preserveSource) {
    return `${profile.label} | ${buffer.label}`;
  }

  return `${profile.label} | ${item.videoCodec} | ${item.width}x${item.height} @ ${item.fps} fps | ${buffer.label}`;
}

function fillSelect(select, items, placeholder, mapper) {
  const current = select.value;
  const options = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...items.map((item) => {
      const label = mapper(item);
      return `<option value="${escapeHtml(item.id)}">${escapeHtml(label)}</option>`;
    }),
  ];
  select.innerHTML = options.join("");
  if (items.some((item) => item.id === current)) {
    select.value = current;
  }
}

function fillDiscoveredChannelSelect() {
  const options = [
    `<option value="">Discord-Voice-Channel wählen</option>`,
    ...state.voiceChannels.map((item, index) => {
      const value = String(index);
      const label = `${item.guildName} / ${item.channelName}`;
      return `<option value="${value}">${escapeHtml(label)}</option>`;
    }),
  ];
  els.discoveredChannelSelect.innerHTML = options.join("");
  els.voiceChannelDiscoveryInfo.textContent = state.voiceChannels.length
    ? `${state.voiceChannels.length} Voice-Channels geladen`
    : "Noch keine Voice-Channels geladen";
}

function renderOverview() {
  const runtime = state.app.runtime;
  const activeRun = runtime.activeRun;
  const scheduled = state.app.events.filter((event) => event.status === "scheduled");
  const nextEvent = [...scheduled].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  )[0];

  els.discordStatusBadge.textContent = runtime.discordStatus;
  els.discordStatusBadge.className = `badge ${badgeClass(runtime.discordStatus)}`;
  els.discordUser.textContent = runtime.discordUserTag
    ? `${runtime.discordUserTag} (${runtime.discordUserId || "?"})`
    : runtime.lastError || "nicht verbunden";

  const ffmpegParts = [];
  ffmpegParts.push(runtime.ffmpegPath ? "ffmpeg erkannt" : "ffmpeg fehlt");
  ffmpegParts.push(runtime.ffprobePath ? "ffprobe erkannt" : "ffprobe fehlt");
  ffmpegParts.push(
    runtime.ytDlpAvailable ? "yt-dlp erkannt" : "yt-dlp nicht erkannt",
  );
  els.ffmpegInfo.textContent = ffmpegParts.join(" | ");

  if (runtime.commandPrefix) {
    const ids = runtime.commandAuthorIds?.length
      ? runtime.commandAuthorIds.join(", ")
      : "nur Self-Account";
    els.commandInfo.textContent = `Discord-Commands: ${runtime.commandPrefix} | erlaubt: ${ids}`;
  } else {
    els.commandInfo.textContent = "Discord-Commands deaktiviert";
  }

  if (!activeRun) {
    els.activeRunPrimary.textContent = "kein aktiver Stream";
    els.activeRunSecondary.textContent = runtime.lastEndedAt
      ? `Letztes Ende: ${formatDateTime(runtime.lastEndedAt)}`
      : "kein letzter Lauf";
  } else {
    els.activeRunPrimary.textContent = `${activeRun.channelName} -> ${activeRun.presetName}`;
    els.activeRunSecondary.textContent = [
      `Status: ${activeRun.status}`,
      `Seit: ${formatDateTime(activeRun.startedAt)}`,
      activeRun.plannedStopAt
        ? `Stop: ${formatDateTime(activeRun.plannedStopAt)}`
        : "Stop: offen",
    ].join(" | ");
  }

  els.scheduledSummary.textContent = `${scheduled.length} Events geplant`;
  els.nextEventSummary.textContent = nextEvent
    ? `${nextEvent.name}: ${formatDateTime(nextEvent.startAt)}`
    : "kein naechstes Event";
}

function badgeClass(status) {
  if (status === "ready") return "badge-ready";
  if (status === "error") return "badge-error";
  return "badge-neutral";
}

function renderChannels() {
  if (!state.app.channels.length) {
    els.channelsList.innerHTML = '<p class="muted">Noch keine Kanaele gespeichert.</p>';
    return;
  }

  els.channelsList.innerHTML = state.app.channels
    .map(
      (item) => `
        <article class="item-card">
          <div class="item-topline">
            <div>
              <h3 class="item-title">${escapeHtml(item.name)}</h3>
              <p class="item-meta">${escapeHtml(item.guildId)} / ${escapeHtml(item.channelId)}</p>
              <p class="item-meta">${escapeHtml(item.streamMode)}${item.description ? ` | ${escapeHtml(item.description)}` : ""}</p>
            </div>
          </div>
          <div class="item-actions">
            <button type="button" data-action="edit-channel" data-id="${escapeHtml(item.id)}">Bearbeiten</button>
            <button type="button" data-action="delete-channel" data-id="${escapeHtml(item.id)}">Loeschen</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPresets() {
  if (!state.app.presets.length) {
    els.presetsList.innerHTML = '<p class="muted">Noch keine Presets gespeichert.</p>';
    return;
  }

  els.presetsList.innerHTML = state.app.presets
    .map(
      (item) => `
        <article class="item-card">
          <div class="item-topline">
            <div>
              <h3 class="item-title">${escapeHtml(item.name)}</h3>
              <p class="item-meta">${escapeHtml(item.sourceMode)} | ${escapeHtml(describePresetQuality(item))}</p>
              <p class="item-meta">${item.bitrateVideoKbps}/${item.maxBitrateVideoKbps} kbps Video | ${item.bitrateAudioKbps} kbps Audio | ${item.includeAudio ? "Audio an" : "Audio aus"}</p>
              <p class="item-meta">${escapeHtml(item.sourceUrl)}</p>
              <p class="item-meta">${item.description ? escapeHtml(item.description) : "keine Beschreibung"}</p>
            </div>
          </div>
          <div class="item-actions">
            <button type="button" data-action="edit-preset" data-id="${escapeHtml(item.id)}">Bearbeiten</button>
            <button type="button" data-action="delete-preset" data-id="${escapeHtml(item.id)}">Loeschen</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderEvents() {
  if (!state.app.events.length) {
    els.eventsList.innerHTML = '<p class="muted">Noch keine Events gespeichert.</p>';
    return;
  }

  const items = [...state.app.events].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );
  els.eventsList.innerHTML = items
    .map((item) => {
      const recurrence = recurrenceSummary(item.recurrence);
      const seriesInfo = item.seriesId
        ? `Serie ${escapeHtml(item.seriesId.slice(0, 8))} | Folge ${item.occurrenceIndex}`
        : "Einzeltermin";
      const errorInfo = item.lastError
        ? `<p class="item-meta">Fehler: ${escapeHtml(item.lastError)}</p>`
        : "";
      return `
        <article class="item-card">
          <div class="item-topline">
            <div>
              <h3 class="item-title">${escapeHtml(item.name)}</h3>
              <p class="item-meta">${formatDateTime(item.startAt)} -> ${formatDateTime(item.endAt)}</p>
              <p class="item-meta">${eventStatusLabel(item.status)} | ${escapeHtml(recurrence)}</p>
              <p class="item-meta">${seriesInfo}</p>
              <p class="item-meta">${item.description ? escapeHtml(item.description) : "keine Beschreibung"}</p>
              ${errorInfo}
            </div>
          </div>
          <div class="item-actions">
            <button type="button" data-action="start-event" data-id="${escapeHtml(item.id)}">Start</button>
            <button type="button" data-action="cancel-event" data-id="${escapeHtml(item.id)}">Abbrechen</button>
            <button type="button" data-action="edit-event" data-id="${escapeHtml(item.id)}">Bearbeiten</button>
            <button type="button" data-action="delete-event" data-id="${escapeHtml(item.id)}">Loeschen</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderLogs() {
  if (!state.app.logs.length) {
    els.logsList.innerHTML = '<p class="muted">Noch keine Logs.</p>';
    return;
  }

  els.logsList.innerHTML = state.app.logs
    .slice(0, 60)
    .map((item) => {
      const context = item.context
        ? Object.entries(item.context)
            .filter(([, value]) => value)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" | ")
        : "";
      return `
        <article class="log-entry" data-level="${escapeHtml(item.level)}">
          <p><strong>${escapeHtml(item.level.toUpperCase())}</strong> ${escapeHtml(item.message)}</p>
          <p class="muted">${formatDateTime(item.createdAt)}${context ? ` | ${escapeHtml(context)}` : ""}</p>
        </article>
      `;
    })
    .join("");
}

function renderSelects() {
  fillSelect(els.manualChannelId, state.app.channels, "Kanal waehlen", channelLabel);
  fillSelect(els.eventChannelId, state.app.channels, "Kanal waehlen", channelLabel);
  fillSelect(els.manualPresetId, state.app.presets, "Preset waehlen", presetLabel);
  fillSelect(els.eventPresetId, state.app.presets, "Preset waehlen", presetLabel);
}

function renderAll() {
  renderOverview();
  renderSelects();
  fillDiscoveredChannelSelect();
  renderChannels();
  renderPresets();
  renderEvents();
  renderLogs();
}

function resetChannelForm() {
  els.channelForm.reset();
  els.channelIdField.value = "";
  els.channelStreamMode.value = "go-live";
}

function resetPresetForm() {
  els.presetForm.reset();
  els.presetIdField.value = "";
  els.presetSourceMode.value = "direct";
  els.presetQualityProfile.value = "720p30";
  els.presetBufferProfile.value = "auto";
  els.presetWidth.value = "1280";
  els.presetHeight.value = "720";
  els.presetFps.value = "30";
  els.presetBitrateVideo.value = "4500";
  els.presetBitrateVideoMax.value = "6500";
  els.presetBitrateAudio.value = "160";
  els.presetVideoCodec.value = "H264";
  els.presetIncludeAudio.checked = true;
  els.presetHardwareAcceleration.checked = false;
  syncPresetFieldsFromProfiles();
  updatePresetQualityHint();
}

function resetEventForm() {
  els.eventForm.reset();
  els.eventIdField.value = "";
  els.eventRecurrenceKind.value = "once";
  els.eventRecurrenceInterval.value = "1";
  els.eventRecurrenceUntil.value = "";
  setSelectedWeekdays([]);
  updateRecurrenceVisibility();
}

async function refresh(forceChannels = false) {
  clearNotice();
  const query = forceChannels ? "?refresh=1" : "";
  const data = await api(`/api/bootstrap${query}`);
  state.app = data.state;
  state.voiceChannels = data.voiceChannels;
  renderAll();
}

function buildChannelPayload() {
  return {
    name: els.channelName.value.trim(),
    guildId: els.channelGuildId.value.trim(),
    channelId: els.channelDiscordId.value.trim(),
    streamMode: els.channelStreamMode.value,
    description: els.channelDescription.value.trim(),
  };
}

function buildPresetPayload() {
  const resolved = getResolvedPresetFormSettings();
  return {
    name: els.presetName.value.trim(),
    sourceMode: els.presetSourceMode.value,
    qualityProfile: resolved.qualityProfile,
    bufferProfile: resolved.bufferProfile,
    sourceUrl: els.presetSourceUrl.value.trim(),
    width: resolved.width,
    height: resolved.height,
    fps: resolved.fps,
    bitrateVideoKbps: resolved.bitrateVideoKbps,
    maxBitrateVideoKbps: resolved.maxBitrateVideoKbps,
    bitrateAudioKbps: resolved.bitrateAudioKbps,
    videoCodec: els.presetVideoCodec.value,
    includeAudio: els.presetIncludeAudio.checked,
    hardwareAcceleration: els.presetHardwareAcceleration.checked,
    minimizeLatency: resolved.minimizeLatency,
    description: els.presetDescription.value.trim(),
  };
}

function buildEventPayload() {
  const recurrenceKind = els.eventRecurrenceKind.value;
  const recurrence =
    recurrenceKind === "once"
      ? { kind: "once" }
      : {
          kind: recurrenceKind,
          interval: Number.parseInt(els.eventRecurrenceInterval.value, 10) || 1,
          until: fromLocalInputValue(els.eventRecurrenceUntil.value),
          daysOfWeek:
            recurrenceKind === "weekly" ? getSelectedWeekdays() : undefined,
        };

  return {
    name: els.eventName.value.trim(),
    channelId: els.eventChannelId.value,
    presetId: els.eventPresetId.value,
    startAt: fromLocalInputValue(els.eventStartAt.value),
    endAt: fromLocalInputValue(els.eventEndAt.value),
    description: els.eventDescription.value.trim(),
    recurrence,
  };
}

function editChannel(id) {
  const item = state.app.channels.find((entry) => entry.id === id);
  if (!item) return;
  els.channelIdField.value = item.id;
  els.channelName.value = item.name;
  els.channelGuildId.value = item.guildId;
  els.channelDiscordId.value = item.channelId;
  els.channelStreamMode.value = item.streamMode;
  els.channelDescription.value = item.description;
  els.channelName.focus();
}

function editPreset(id) {
  const item = state.app.presets.find((entry) => entry.id === id);
  if (!item) return;
  els.presetIdField.value = item.id;
  els.presetName.value = item.name;
  els.presetSourceMode.value = item.sourceMode || "direct";
  els.presetQualityProfile.value = item.qualityProfile || "custom";
  els.presetBufferProfile.value = item.bufferProfile || "auto";
  els.presetSourceUrl.value = item.sourceUrl;
  els.presetWidth.value = String(item.width);
  els.presetHeight.value = String(item.height);
  els.presetFps.value = String(item.fps);
  els.presetBitrateVideo.value = String(item.bitrateVideoKbps);
  els.presetBitrateVideoMax.value = String(item.maxBitrateVideoKbps);
  els.presetBitrateAudio.value = String(item.bitrateAudioKbps);
  els.presetVideoCodec.value = item.videoCodec;
  els.presetIncludeAudio.checked = item.includeAudio;
  els.presetHardwareAcceleration.checked = item.hardwareAcceleration;
  els.presetDescription.value = item.description;
  syncPresetFieldsFromProfiles();
  updatePresetQualityHint();
  els.presetName.focus();
}

function editEvent(id) {
  const item = state.app.events.find((entry) => entry.id === id);
  if (!item) return;
  els.eventIdField.value = item.id;
  els.eventName.value = item.name;
  els.eventChannelId.value = item.channelId;
  els.eventPresetId.value = item.presetId;
  els.eventStartAt.value = toLocalInputValue(item.startAt);
  els.eventEndAt.value = toLocalInputValue(item.endAt);
  els.eventDescription.value = item.description;
  els.eventRecurrenceKind.value = item.recurrence?.kind || "once";
  els.eventRecurrenceInterval.value = String(item.recurrence?.interval || 1);
  els.eventRecurrenceUntil.value = toLocalInputValue(item.recurrence?.until);
  setSelectedWeekdays(item.recurrence?.daysOfWeek || []);
  updateRecurrenceVisibility();
  els.eventName.focus();
}

async function handleChannelSubmit(event) {
  event.preventDefault();
  const payload = buildChannelPayload();
  const id = els.channelIdField.value;
  if (id) {
    await api(`/api/channels/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    showNotice("Kanal aktualisiert.", "success");
  } else {
    await api("/api/channels", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showNotice("Kanal gespeichert.", "success");
  }
  resetChannelForm();
  await refresh();
}

async function handlePresetSubmit(event) {
  event.preventDefault();
  const payload = buildPresetPayload();
  const id = els.presetIdField.value;
  if (id) {
    await api(`/api/presets/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    showNotice("Preset aktualisiert.", "success");
  } else {
    await api("/api/presets", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showNotice("Preset gespeichert.", "success");
  }
  resetPresetForm();
  await refresh();
}

async function handleEventSubmit(event) {
  event.preventDefault();
  const payload = buildEventPayload();
  const id = els.eventIdField.value;
  if (id) {
    const result = await api(`/api/events/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    const count = result?.updatedCount || 1;
    showNotice(
      count > 1
        ? `${count} Events in der Serie aktualisiert.`
        : "Event aktualisiert.",
      "success",
    );
  } else {
    const result = await api("/api/events", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const count = result?.createdCount || 1;
    showNotice(
      count > 1 ? `${count} Events gespeichert.` : "Event gespeichert.",
      "success",
    );
  }
  resetEventForm();
  await refresh();
}

async function handleManualStart(event) {
  event.preventDefault();
  await api("/api/manual/start", {
    method: "POST",
    body: JSON.stringify({
      channelId: els.manualChannelId.value,
      presetId: els.manualPresetId.value,
      stopAt: fromLocalInputValue(els.manualStopAt.value),
    }),
  });
  showNotice("Manueller Stream wird gestartet.", "success");
  els.manualStopAt.value = "";
  await refresh();
}

async function handleListAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!action || !id) return;

  if (action === "edit-channel") {
    editChannel(id);
    return;
  }

  if (action === "delete-channel") {
    await api(`/api/channels/${id}`, { method: "DELETE" });
    showNotice("Kanal geloescht.", "success");
    await refresh();
    return;
  }

  if (action === "edit-preset") {
    editPreset(id);
    return;
  }

  if (action === "delete-preset") {
    await api(`/api/presets/${id}`, { method: "DELETE" });
    showNotice("Preset geloescht.", "success");
    await refresh();
    return;
  }

  if (action === "edit-event") {
    editEvent(id);
    return;
  }

  if (action === "delete-event") {
    await api(`/api/events/${id}`, { method: "DELETE" });
    showNotice("Event geloescht.", "success");
    await refresh();
    return;
  }

  if (action === "start-event") {
    await api(`/api/events/${id}/start`, { method: "POST" });
    showNotice("Event wird gestartet.", "success");
    await refresh();
    return;
  }

  if (action === "cancel-event") {
    await api(`/api/events/${id}/cancel`, { method: "POST" });
    showNotice("Event wurde abgebrochen.", "success");
    await refresh();
  }
}

async function refreshVoiceChannels() {
  const items = await api("/api/voice-channels?refresh=1");
  state.voiceChannels = items;
  fillDiscoveredChannelSelect();
  showNotice("Voice-Channels aktualisiert.", "success");
}

function applyDiscoveredChannel() {
  const index = Number.parseInt(els.discoveredChannelSelect.value, 10);
  if (!Number.isInteger(index) || !state.voiceChannels[index]) {
    showNotice("Bitte zuerst einen Discord-Voice-Channel waehlen.", "warn");
    return;
  }

  const channel = state.voiceChannels[index];
  els.channelName.value = `${channel.guildName} / ${channel.channelName}`;
  els.channelGuildId.value = channel.guildId;
  els.channelDiscordId.value = channel.channelId;
  els.channelStreamMode.value = channel.streamMode;
  showNotice("Discord-Channel in das Kanal-Formular uebernommen.", "success");
}

async function stopActiveRun() {
  const result = await api("/api/stop", { method: "POST" });
  showNotice(
    result?.stopped ? "Aktiver Stream wird gestoppt." : "Kein aktiver Stream.",
    result?.stopped ? "success" : "info",
  );
  await refresh();
}

function bindPresetQualityEvents() {
  [
    els.presetSourceMode,
    els.presetQualityProfile,
    els.presetBufferProfile,
    els.presetWidth,
    els.presetHeight,
    els.presetFps,
    els.presetBitrateVideo,
    els.presetBitrateVideoMax,
    els.presetBitrateAudio,
    els.presetVideoCodec,
    els.presetIncludeAudio,
  ].forEach((element) => {
    element.addEventListener("input", () => {
      syncPresetFieldsFromProfiles();
      updatePresetQualityHint();
    });
    element.addEventListener("change", () => {
      syncPresetFieldsFromProfiles();
      updatePresetQualityHint();
    });
  });

  els.presetRecommendButton.addEventListener("click", applyRecommendedPresetSettings);
}

function bindEvents() {
  els.refreshButton.addEventListener("click", () => {
    void refresh();
  });
  els.stopButton.addEventListener("click", () => {
    void stopActiveRun().catch(handleError);
  });
  els.refreshVoiceChannelsButton.addEventListener("click", () => {
    void refreshVoiceChannels().catch(handleError);
  });
  els.applyDiscoveredChannelButton.addEventListener("click", applyDiscoveredChannel);
  els.channelForm.addEventListener("submit", (event) => {
    void handleChannelSubmit(event).catch(handleError);
  });
  els.presetForm.addEventListener("submit", (event) => {
    void handlePresetSubmit(event).catch(handleError);
  });
  bindPresetQualityEvents();
  els.eventForm.addEventListener("submit", (event) => {
    void handleEventSubmit(event).catch(handleError);
  });
  els.manualStartForm.addEventListener("submit", (event) => {
    void handleManualStart(event).catch(handleError);
  });
  els.channelResetButton.addEventListener("click", resetChannelForm);
  els.presetResetButton.addEventListener("click", resetPresetForm);
  els.eventResetButton.addEventListener("click", resetEventForm);
  els.channelsList.addEventListener("click", (event) => {
    void handleListAction(event).catch(handleError);
  });
  els.presetsList.addEventListener("click", (event) => {
    void handleListAction(event).catch(handleError);
  });
  els.eventsList.addEventListener("click", (event) => {
    void handleListAction(event).catch(handleError);
  });
  els.eventRecurrenceKind.addEventListener("change", updateRecurrenceVisibility);
  els.eventStartAt.addEventListener("change", updateRecurrenceVisibility);
}

function handleError(error) {
  const message = error instanceof Error ? error.message : "Unbekannter Fehler";
  showNotice(message, "danger");
}

async function init() {
  bindEvents();
  resetChannelForm();
  resetPresetForm();
  resetEventForm();
  await refresh();
}

void init().catch(handleError);
