import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type {
  ManagedSelfbotState,
  PresenceActivityType,
  PresenceStatus,
} from "../domain/types.js";
import { DEFAULT_SELFBOT_ID } from "../domain/types.js";

type RawSelfbotProfile = {
  id?: string;
  name?: string;
  token?: string;
  enabled?: boolean | string;
  commandEnabled?: boolean | string;
  idlePresenceStatus?: string;
  idleActivityType?: string;
  idleActivityText?: string;
  streamPresenceStatus?: string;
  streamActivityType?: string;
  streamActivityText?: string;
  voiceStatusTemplate?: string;
};

export type SelfbotProfileConfig = Omit<
  ManagedSelfbotState,
  | "status"
  | "userTag"
  | "userId"
  | "lastError"
  | "lastPresenceText"
  | "lastVoiceStatus"
> & {
  token: string;
};

function normalizeOptionalEnv(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseBooleanEnv(value: string | undefined, fallback = false) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePresenceStatus(
  value: string | undefined,
  fallback: PresenceStatus,
): PresenceStatus {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "online":
    case "idle":
    case "dnd":
    case "invisible":
      return normalized;
    default:
      return fallback;
  }
}

function parsePresenceActivityType(
  value: string | undefined,
  fallback: PresenceActivityType,
): PresenceActivityType {
  const normalized = value?.trim().toUpperCase();
  switch (normalized) {
    case "PLAYING":
    case "STREAMING":
    case "LISTENING":
    case "WATCHING":
    case "COMPETING":
      return normalized;
    default:
      return fallback;
  }
}

function sanitizeProfileId(value: string | undefined, fallback: string) {
  const normalized = (value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function createProfileConfig(
  input: RawSelfbotProfile,
  fallbackId: string,
  defaults: {
    name: string;
    commandEnabled: boolean;
    idlePresenceStatus: PresenceStatus;
    idleActivityType: PresenceActivityType;
    idleActivityText?: string;
    streamPresenceStatus: PresenceStatus;
    streamActivityType: PresenceActivityType;
    streamActivityText?: string;
    voiceStatusTemplate?: string;
  },
): SelfbotProfileConfig | undefined {
  const enabled =
    typeof input.enabled === "boolean"
      ? input.enabled
      : typeof input.enabled === "string"
        ? parseBooleanEnv(input.enabled, true)
        : true;
  if (!enabled) {
    return undefined;
  }

  const token = normalizeOptionalEnv(input.token);
  if (!token) {
    return undefined;
  }

  return {
    id: sanitizeProfileId(input.id, fallbackId),
    name: normalizeOptionalEnv(input.name) ?? defaults.name,
    token,
    commandEnabled:
      typeof input.commandEnabled === "boolean"
        ? input.commandEnabled
        : typeof input.commandEnabled === "string"
          ? parseBooleanEnv(input.commandEnabled, defaults.commandEnabled)
          : defaults.commandEnabled,
    idlePresenceStatus: parsePresenceStatus(
      input.idlePresenceStatus,
      defaults.idlePresenceStatus,
    ),
    idleActivityType: parsePresenceActivityType(
      input.idleActivityType,
      defaults.idleActivityType,
    ),
    idleActivityText:
      normalizeOptionalEnv(input.idleActivityText) ?? defaults.idleActivityText,
    streamPresenceStatus: parsePresenceStatus(
      input.streamPresenceStatus,
      defaults.streamPresenceStatus,
    ),
    streamActivityType: parsePresenceActivityType(
      input.streamActivityType,
      defaults.streamActivityType,
    ),
    streamActivityText:
      normalizeOptionalEnv(input.streamActivityText) ??
      defaults.streamActivityText,
    voiceStatusTemplate:
      normalizeOptionalEnv(input.voiceStatusTemplate) ??
      defaults.voiceStatusTemplate,
  };
}

function loadAdditionalProfiles(
  configFile: string,
  primary: SelfbotProfileConfig,
) {
  if (!existsSync(configFile)) {
    return [] as SelfbotProfileConfig[];
  }

  const defaults = {
    name: "Selfbot",
    commandEnabled: false,
    idlePresenceStatus: primary.idlePresenceStatus,
    idleActivityType: primary.idleActivityType,
    idleActivityText: primary.idleActivityText,
    streamPresenceStatus: primary.streamPresenceStatus,
    streamActivityType: primary.streamActivityType,
    streamActivityText: primary.streamActivityText,
    voiceStatusTemplate: primary.voiceStatusTemplate,
  };
  const rawContent = readFileSync(configFile, "utf-8");
  const usedIds = new Set<string>([primary.id]);
  const result: SelfbotProfileConfig[] = [];

  try {
    const raw = JSON.parse(rawContent) as unknown;
    if (!Array.isArray(raw)) {
      return [];
    }

    for (const [index, entry] of raw.entries()) {
      if (!entry || typeof entry !== "object") continue;

      const profile = createProfileConfig(
        entry as RawSelfbotProfile,
        `bot-${index + 1}`,
        { ...defaults, name: `Selfbot ${index + 1}` },
      );

      if (!profile) continue;
      if (usedIds.has(profile.id)) continue;
      usedIds.add(profile.id);
      result.push(profile);
    }

    return result;
  } catch {
    const lines = rawContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    for (const [index, line] of lines.entries()) {
      const [
        id,
        name,
        token,
        idleActivityText,
        streamActivityText,
        voiceStatusTemplate,
        enabled,
        commandEnabled,
      ] = line.split("\t");

      const profile = createProfileConfig(
        {
          id,
          name,
          token,
          idleActivityText,
          streamActivityText,
          voiceStatusTemplate,
          enabled,
          commandEnabled,
        },
        `bot-${index + 1}`,
        { ...defaults, name: name?.trim() || `Selfbot ${index + 1}` },
      );

      if (!profile) continue;
      if (usedIds.has(profile.id)) continue;
      usedIds.add(profile.id);
      result.push(profile);
    }

    return result;
  }
}

export function loadSelfbotProfiles(baseDir: string) {
  const configFileEnv =
    normalizeOptionalEnv(process.env.SELFBOT_CONFIG_FILE) ??
    "./data/selfbot-profiles.tsv";
  const configFile = isAbsolute(configFileEnv)
    ? configFileEnv
    : resolve(baseDir, configFileEnv);

  const primary = createProfileConfig(
    {
      id: DEFAULT_SELFBOT_ID,
      name: normalizeOptionalEnv(process.env.PRIMARY_SELFBOT_NAME),
      token: process.env.DISCORD_TOKEN,
      commandEnabled: process.env.DISCORD_COMMANDS_ENABLED !== "0",
      idlePresenceStatus: normalizeOptionalEnv(
        process.env.IDLE_PRESENCE_STATUS,
      ),
      idleActivityType: normalizeOptionalEnv(process.env.IDLE_ACTIVITY_TYPE),
      idleActivityText: normalizeOptionalEnv(process.env.IDLE_ACTIVITY_TEXT),
      streamPresenceStatus: normalizeOptionalEnv(
        process.env.STREAM_PRESENCE_STATUS,
      ),
      streamActivityType: normalizeOptionalEnv(
        process.env.STREAM_ACTIVITY_TYPE,
      ),
      streamActivityText: normalizeOptionalEnv(
        process.env.STREAM_ACTIVITY_TEXT,
      ),
      voiceStatusTemplate: normalizeOptionalEnv(
        process.env.VOICE_STATUS_TEMPLATE,
      ),
    },
    DEFAULT_SELFBOT_ID,
    {
      name: "Primary Selfbot",
      commandEnabled: true,
      idlePresenceStatus: "online",
      idleActivityType: "WATCHING",
      idleActivityText: "THE LION SQUAD - eSPORTS",
      streamPresenceStatus: "online",
      streamActivityType: "PLAYING",
      streamActivityText: "{{title}}",
      voiceStatusTemplate: "Now streaming: {{title}}",
    },
  ) ?? {
    id: DEFAULT_SELFBOT_ID,
    name: "Primary Selfbot",
    token: "",
    commandEnabled: true,
    idlePresenceStatus: "online",
    idleActivityType: "WATCHING",
    idleActivityText: "THE LION SQUAD - eSPORTS",
    streamPresenceStatus: "online",
    streamActivityType: "PLAYING",
    streamActivityText: "{{title}}",
    voiceStatusTemplate: "Now streaming: {{title}}",
  };

  const profiles = [primary, ...loadAdditionalProfiles(configFile, primary)];

  return {
    configFile,
    primaryBotId: primary.id,
    profiles,
    hasMultipleBots: profiles.length > 1,
  };
}

export function buildManagedSelfbotState(
  profile: SelfbotProfileConfig,
): ManagedSelfbotState {
  return {
    id: profile.id,
    name: profile.name,
    status: "starting",
    commandEnabled: profile.commandEnabled,
    idlePresenceStatus: profile.idlePresenceStatus,
    idleActivityType: profile.idleActivityType,
    idleActivityText: profile.idleActivityText,
    streamPresenceStatus: profile.streamPresenceStatus,
    streamActivityType: profile.streamActivityType,
    streamActivityText: profile.streamActivityText,
    voiceStatusTemplate: profile.voiceStatusTemplate,
  };
}
