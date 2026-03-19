import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

# ── Config ──────────────────────────────────────────────────────────
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

# ── Quality & Buffer Profiles ───────────────────────────────────────
QUALITY_PROFILES = {
    "720p30": {"width": 1280, "height": 720, "fps": 30, "preserveSource": False},
    "720p60": {"width": 1280, "height": 720, "fps": 60, "preserveSource": False},
    "1080p30": {"width": 1920, "height": 1080, "fps": 30, "preserveSource": False},
    "1080p60": {"width": 1920, "height": 1080, "fps": 60, "preserveSource": False},
    "1440p30": {"width": 2560, "height": 1440, "fps": 30, "preserveSource": False},
    "1440p60": {"width": 2560, "height": 1440, "fps": 60, "preserveSource": False},
    "2160p30": {"width": 3840, "height": 2160, "fps": 30, "preserveSource": False},
    "2160p60": {"width": 3840, "height": 2160, "fps": 60, "preserveSource": False},
    "custom": {"width": 1280, "height": 720, "fps": 30, "preserveSource": False},
}

QUALITY_LABELS = {
    "720p30": "720p / 30 FPS",
    "720p60": "720p / 60 FPS",
    "1080p30": "1080p / 30 FPS",
    "1080p60": "1080p / 60 FPS",
    "1440p30": "1440p / 30 FPS",
    "1440p60": "1440p / 60 FPS",
    "2160p30": "4K / 30 FPS",
    "2160p60": "4K / 60 FPS",
    "custom": "Custom",
}

BUFFER_LABELS = {
    "auto": "Auto",
    "stable": "Maximale Stabilitaet",
    "balanced": "Ausgewogen",
    "low-latency": "Minimale Latenz",
}


def get_recommended_bitrates(w, h, fps, codec, qp="custom"):
    px = w * h
    hfr = fps >= 50
    if px >= 3840 * 2160:
        v, vm = (14000, 18000) if hfr else (10000, 14000)
    elif px >= 2560 * 1440:
        v, vm = (9000, 10000) if hfr else (8000, 10000)
    elif px >= 1920 * 1080:
        v, vm = (8500, 10000) if hfr else (7000, 9500)
    elif px >= 1280 * 720:
        v, vm = (6500, 9000) if hfr else (4500, 6500)
    elif px >= 854 * 480:
        v, vm = (3500, 5000) if hfr else (2500, 3600)
    else:
        v, vm = (2200, 3200) if hfr else (1600, 2400)
    if codec == "H265":
        v = round(v * 0.82)
        vm = round(vm * 0.85)
    step = 50
    v = max(500, round(v / step) * step)
    vm = max(1000, round(vm / step) * step)
    return {"video": v, "videoMax": vm, "audio": 160}


def normalize_preset(data):
    qp = data.get("qualityProfile", "custom")
    if qp not in QUALITY_PROFILES:
        qp = "custom"
    profile = QUALITY_PROFILES[qp]
    if qp != "custom":
        data["width"] = profile["width"]
        data["height"] = profile["height"]
        data["fps"] = profile["fps"]
        rec = get_recommended_bitrates(
            data["width"], data["height"], data["fps"],
            data.get("videoCodec", "H264"), qp
        )
        data["bitrateVideoKbps"] = rec["video"]
        data["maxBitrateVideoKbps"] = rec["videoMax"]
        data["bitrateAudioKbps"] = rec["audio"]
    data["qualityProfile"] = qp
    bp = data.get("bufferProfile", "auto")
    if bp not in BUFFER_LABELS:
        bp = "auto"
    data["bufferProfile"] = bp
    return data


# ── Recurrence ──────────────────────────────────────────────────────
DAY_MS = 86400000
MAX_OCCURRENCES = 260

def build_occurrences(start_iso, end_iso, recurrence):
    start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    duration = (end - start).total_seconds()
    kind = recurrence.get("kind", "once")
    if kind == "once":
        return [{"startAt": start.isoformat(), "endAt": end.isoformat(), "index": 1}]
    until_str = recurrence.get("until")
    if not until_str:
        raise ValueError("recurrence.until ist fuer wiederkehrende Events erforderlich")
    until = datetime.fromisoformat(until_str.replace("Z", "+00:00"))
    if until <= start:
        raise ValueError("recurrence.until muss nach startAt liegen")
    interval = max(1, recurrence.get("interval", 1))
    occurrences = []
    if kind == "daily":
        from datetime import timedelta
        cursor = start
        while cursor <= until:
            if len(occurrences) >= MAX_OCCURRENCES:
                raise ValueError(f"Serie wuerde mehr als {MAX_OCCURRENCES} Events erzeugen")
            occ_end = cursor + timedelta(seconds=duration)
            occurrences.append({
                "startAt": cursor.isoformat(),
                "endAt": occ_end.isoformat(),
                "index": len(occurrences) + 1
            })
            cursor += timedelta(days=interval)
    elif kind == "weekly":
        from datetime import timedelta
        days_of_week = recurrence.get("daysOfWeek", [start.weekday()])
        if not days_of_week:
            days_of_week = [start.weekday()]
        cursor = start
        while cursor <= until:
            if cursor.weekday() in [d % 7 for d in days_of_week] or cursor.isoweekday() % 7 in days_of_week:
                py_dow = cursor.isoweekday() % 7
                if py_dow in days_of_week:
                    if len(occurrences) >= MAX_OCCURRENCES:
                        raise ValueError(f"Serie wuerde mehr als {MAX_OCCURRENCES} Events erzeugen")
                    occ_end = cursor + timedelta(seconds=duration)
                    occurrences.append({
                        "startAt": cursor.isoformat(),
                        "endAt": occ_end.isoformat(),
                        "index": len(occurrences) + 1
                    })
            cursor += timedelta(days=1)
    if not occurrences:
        raise ValueError("Wiederholung hat keine Events erzeugt")
    return occurrences


# ── Pydantic Models ────────────────────────────────────────────────
class ChannelInput(BaseModel):
    name: str
    guildId: str
    channelId: str
    streamMode: str = "go-live"
    description: str = ""

class PresetInput(BaseModel):
    name: str
    sourceUrl: str
    sourceMode: str = "direct"
    qualityProfile: str = "720p30"
    bufferProfile: str = "auto"
    description: str = ""
    includeAudio: bool = True
    width: int = 1280
    height: int = 720
    fps: int = 30
    bitrateVideoKbps: int = 4500
    maxBitrateVideoKbps: int = 6500
    bitrateAudioKbps: int = 160
    videoCodec: str = "H264"
    hardwareAcceleration: bool = False
    minimizeLatency: bool = False

class RecurrenceInput(BaseModel):
    kind: str = "once"
    interval: int = 1
    daysOfWeek: list = []
    until: Optional[str] = None

class EventInput(BaseModel):
    name: str
    channelId: str
    presetId: str
    startAt: str
    endAt: str
    description: str = ""
    recurrence: Optional[RecurrenceInput] = None

class ManualRunInput(BaseModel):
    channelId: str
    presetId: str
    stopAt: Optional[str] = None


# ── App ─────────────────────────────────────────────────────────────
db_client = None
db = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_client, db
    db_client = AsyncIOMotorClient(MONGO_URL)
    db = db_client[DB_NAME]
    await db.channels.create_index("channelId")
    await db.presets.create_index("name")
    await db.events.create_index("startAt")
    await db.logs.create_index([("createdAt", -1)])
    runtime = await db.runtime.find_one({"_id": "singleton"}, {"_id": 0})
    if not runtime:
        await db.runtime.insert_one({
            "_id": "singleton",
            "discordStatus": "offline",
            "discordUserTag": None,
            "discordUserId": None,
            "ffmpegPath": None,
            "ytDlpAvailable": False,
            "activeRun": None,
            "lastError": None,
            "lastStartedAt": None,
            "lastEndedAt": None,
        })
    await append_log("info", "Control Panel gestartet")
    yield
    db_client.close()

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def make_id():
    return str(uuid.uuid4())


async def append_log(level, message, context=None):
    entry = {
        "id": make_id(),
        "level": level,
        "message": message,
        "context": context or {},
        "createdAt": now_iso(),
    }
    await db.logs.insert_one(entry)
    count = await db.logs.count_documents({})
    if count > 200:
        oldest = await db.logs.find().sort("createdAt", 1).limit(count - 200).to_list(count - 200)
        if oldest:
            ids = [d["_id"] for d in oldest]
            await db.logs.delete_many({"_id": {"$in": ids}})
    return entry


def sanitize_doc(doc):
    if doc and "_id" in doc:
        del doc["_id"]
    return doc


def sanitize_docs(docs):
    return [sanitize_doc(d) for d in docs]


# ── API Routes ──────────────────────────────────────────────────────

@app.get("/api/bootstrap")
async def bootstrap():
    channels = await db.channels.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    presets = await db.presets.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    events = await db.events.find({}, {"_id": 0}).sort("startAt", 1).to_list(5000)
    runtime = await db.runtime.find_one({"_id": "singleton"}, {"_id": 0})
    logs = await db.logs.find({}, {"_id": 0}).sort("createdAt", -1).limit(200).to_list(200)
    return {
        "state": {
            "channels": channels,
            "presets": presets,
            "events": events,
            "runtime": runtime or {},
            "logs": logs,
        },
        "voiceChannels": [],
    }


@app.get("/api/state")
async def get_state():
    channels = await db.channels.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    presets = await db.presets.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    events = await db.events.find({}, {"_id": 0}).sort("startAt", 1).to_list(5000)
    runtime = await db.runtime.find_one({"_id": "singleton"}, {"_id": 0})
    logs = await db.logs.find({}, {"_id": 0}).sort("createdAt", -1).limit(200).to_list(200)
    return {
        "channels": channels,
        "presets": presets,
        "events": events,
        "runtime": runtime or {},
        "logs": logs,
    }


@app.get("/api/profiles")
async def get_profiles():
    return {
        "qualityProfiles": {k: {**v, "label": QUALITY_LABELS[k]} for k, v in QUALITY_PROFILES.items()},
        "bufferProfiles": BUFFER_LABELS,
    }


@app.get("/api/recommend-bitrate")
async def recommend_bitrate(width: int = 1280, height: int = 720, fps: int = 30, codec: str = "H264", qualityProfile: str = "custom"):
    return get_recommended_bitrates(width, height, fps, codec, qualityProfile)


# ── Channels ──────────────────────────────────────────────────
@app.post("/api/channels", status_code=201)
async def create_channel(inp: ChannelInput):
    if not inp.name.strip():
        raise HTTPException(400, "Name ist erforderlich")
    existing = await db.channels.find_one(
        {"guildId": inp.guildId.strip(), "channelId": inp.channelId.strip()},
        {"_id": 0}
    )
    if existing:
        raise HTTPException(400, "Dieser Discord Voice Channel ist bereits konfiguriert")
    ts = now_iso()
    channel = {
        "id": make_id(),
        "name": inp.name.strip(),
        "guildId": inp.guildId.strip(),
        "channelId": inp.channelId.strip(),
        "streamMode": inp.streamMode,
        "description": inp.description.strip(),
        "createdAt": ts,
        "updatedAt": ts,
    }
    await db.channels.insert_one(channel)
    await append_log("info", f"Kanal erstellt: {channel['name']}")
    return sanitize_doc(channel)


@app.put("/api/channels/{channel_id}")
async def update_channel(channel_id: str, inp: ChannelInput):
    existing = await db.channels.find_one({"id": channel_id})
    if not existing:
        raise HTTPException(404, "Kanal nicht gefunden")
    dup = await db.channels.find_one({
        "id": {"$ne": channel_id},
        "guildId": inp.guildId.strip(),
        "channelId": inp.channelId.strip()
    })
    if dup:
        raise HTTPException(400, "Dieser Discord Voice Channel ist bereits konfiguriert")
    ts = now_iso()
    update_data = {
        "name": inp.name.strip(),
        "guildId": inp.guildId.strip(),
        "channelId": inp.channelId.strip(),
        "streamMode": inp.streamMode,
        "description": inp.description.strip(),
        "updatedAt": ts,
    }
    await db.channels.update_one({"id": channel_id}, {"$set": update_data})
    updated = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    return updated


@app.delete("/api/channels/{channel_id}", status_code=204)
async def delete_channel(channel_id: str):
    ev = await db.events.find_one({"channelId": channel_id})
    if ev:
        raise HTTPException(400, "Kanal wird von Events verwendet und kann nicht geloescht werden")
    result = await db.channels.delete_one({"id": channel_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Kanal nicht gefunden")
    await append_log("info", f"Kanal geloescht: {channel_id}")


# ── Presets ──────────────────────────────────────────────────
@app.post("/api/presets", status_code=201)
async def create_preset(inp: PresetInput):
    if not inp.name.strip():
        raise HTTPException(400, "Name ist erforderlich")
    if not inp.sourceUrl.strip():
        raise HTTPException(400, "URL ist erforderlich")
    data = inp.model_dump()
    data = normalize_preset(data)
    ts = now_iso()
    preset = {
        **data,
        "id": make_id(),
        "name": data["name"].strip(),
        "sourceUrl": data["sourceUrl"].strip(),
        "description": data.get("description", "").strip(),
        "createdAt": ts,
        "updatedAt": ts,
    }
    await db.presets.insert_one(preset)
    await append_log("info", f"Preset erstellt: {preset['name']}")
    return sanitize_doc(preset)


@app.put("/api/presets/{preset_id}")
async def update_preset(preset_id: str, inp: PresetInput):
    existing = await db.presets.find_one({"id": preset_id})
    if not existing:
        raise HTTPException(404, "Preset nicht gefunden")
    data = inp.model_dump()
    data = normalize_preset(data)
    ts = now_iso()
    update_data = {
        **data,
        "name": data["name"].strip(),
        "sourceUrl": data["sourceUrl"].strip(),
        "description": data.get("description", "").strip(),
        "updatedAt": ts,
    }
    await db.presets.update_one({"id": preset_id}, {"$set": update_data})
    updated = await db.presets.find_one({"id": preset_id}, {"_id": 0})
    return updated


@app.delete("/api/presets/{preset_id}", status_code=204)
async def delete_preset(preset_id: str):
    ev = await db.events.find_one({"presetId": preset_id})
    if ev:
        raise HTTPException(400, "Preset wird von Events verwendet und kann nicht geloescht werden")
    result = await db.presets.delete_one({"id": preset_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Preset nicht gefunden")
    await append_log("info", f"Preset geloescht: {preset_id}")


# ── Events ──────────────────────────────────────────────────
@app.post("/api/events", status_code=201)
async def create_event(inp: EventInput):
    if not inp.name.strip():
        raise HTTPException(400, "Name ist erforderlich")
    ch = await db.channels.find_one({"id": inp.channelId})
    if not ch:
        raise HTTPException(400, "Kanal nicht gefunden")
    pr = await db.presets.find_one({"id": inp.presetId})
    if not pr:
        raise HTTPException(400, "Preset nicht gefunden")
    start_dt = datetime.fromisoformat(inp.startAt.replace("Z", "+00:00"))
    end_dt = datetime.fromisoformat(inp.endAt.replace("Z", "+00:00"))
    if end_dt <= start_dt:
        raise HTTPException(400, "Ende muss nach Start liegen")
    rec = (inp.recurrence.model_dump() if inp.recurrence else {"kind": "once"})
    try:
        windows = build_occurrences(inp.startAt, inp.endAt, rec)
    except ValueError as e:
        raise HTTPException(400, str(e))
    ts = now_iso()
    series_id = make_id() if rec.get("kind", "once") != "once" else None
    events_to_insert = []
    for w in windows:
        event = {
            "id": make_id(),
            "name": inp.name.strip(),
            "channelId": inp.channelId,
            "presetId": inp.presetId,
            "startAt": w["startAt"],
            "endAt": w["endAt"],
            "status": "scheduled",
            "description": inp.description.strip(),
            "recurrence": rec,
            "seriesId": series_id,
            "occurrenceIndex": w["index"],
            "createdAt": ts,
            "updatedAt": ts,
        }
        events_to_insert.append(event)
    if events_to_insert:
        await db.events.insert_many(events_to_insert)
    await append_log("info", f"{len(events_to_insert)} Event(s) erstellt: {inp.name.strip()}")
    return {
        "createdCount": len(events_to_insert),
        "events": sanitize_docs(events_to_insert),
        "seriesId": series_id,
    }


@app.put("/api/events/{event_id}")
async def update_event(event_id: str, inp: EventInput):
    existing = await db.events.find_one({"id": event_id})
    if not existing:
        raise HTTPException(404, "Event nicht gefunden")
    if existing.get("status") == "running":
        raise HTTPException(400, "Laufendes Event kann nicht bearbeitet werden")
    ch = await db.channels.find_one({"id": inp.channelId})
    if not ch:
        raise HTTPException(400, "Kanal nicht gefunden")
    pr = await db.presets.find_one({"id": inp.presetId})
    if not pr:
        raise HTTPException(400, "Preset nicht gefunden")
    rec = (inp.recurrence.model_dump() if inp.recurrence else {"kind": "once"})
    try:
        windows = build_occurrences(inp.startAt, inp.endAt, rec)
    except ValueError as e:
        raise HTTPException(400, str(e))
    series_id = existing.get("seriesId")
    if series_id:
        await db.events.delete_many({
            "seriesId": series_id,
            "startAt": {"$gte": existing["startAt"]},
            "status": {"$ne": "running"}
        })
    else:
        await db.events.delete_one({"id": event_id})
    ts = now_iso()
    new_series_id = series_id or (make_id() if rec.get("kind", "once") != "once" else None)
    new_events = []
    for w in windows:
        event = {
            "id": make_id(),
            "name": inp.name.strip(),
            "channelId": inp.channelId,
            "presetId": inp.presetId,
            "startAt": w["startAt"],
            "endAt": w["endAt"],
            "status": "scheduled",
            "description": inp.description.strip(),
            "recurrence": rec,
            "seriesId": new_series_id,
            "occurrenceIndex": w["index"],
            "createdAt": ts,
            "updatedAt": ts,
        }
        new_events.append(event)
    if new_events:
        await db.events.insert_many(new_events)
    return {"updatedCount": len(new_events), "events": sanitize_docs(new_events)}


@app.delete("/api/events/{event_id}", status_code=204)
async def delete_event(event_id: str):
    existing = await db.events.find_one({"id": event_id})
    if not existing:
        raise HTTPException(404, "Event nicht gefunden")
    if existing.get("status") == "running":
        raise HTTPException(400, "Laufendes Event kann nicht geloescht werden")
    series_id = existing.get("seriesId")
    if series_id:
        await db.events.delete_many({
            "seriesId": series_id,
            "startAt": {"$gte": existing["startAt"]},
            "status": {"$ne": "running"}
        })
    else:
        await db.events.delete_one({"id": event_id})
    await append_log("info", f"Event geloescht: {event_id}")


@app.post("/api/events/{event_id}/start")
async def start_event(event_id: str):
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "Event nicht gefunden")
    if ev["status"] != "scheduled":
        raise HTTPException(400, "Nur geplante Events koennen gestartet werden")
    ts = now_iso()
    await db.events.update_one({"id": event_id}, {"$set": {
        "status": "running",
        "actualStartedAt": ts,
        "updatedAt": ts,
    }})
    ch = await db.channels.find_one({"id": ev["channelId"]}, {"_id": 0})
    pr = await db.presets.find_one({"id": ev["presetId"]}, {"_id": 0})
    await db.runtime.update_one({"_id": "singleton"}, {"$set": {
        "activeRun": {
            "kind": "event",
            "eventId": event_id,
            "channelId": ev["channelId"],
            "presetId": ev["presetId"],
            "channelName": ch["name"] if ch else "?",
            "presetName": pr["name"] if pr else "?",
            "startedAt": ts,
            "plannedStopAt": ev["endAt"],
            "status": "running",
        },
        "lastStartedAt": ts,
        "lastError": None,
    }})
    await append_log("info", f"Event gestartet: {ev['name']}", {
        "channel": ch["name"] if ch else "?",
        "preset": pr["name"] if pr else "?",
    })
    return {"ok": True}


@app.post("/api/events/{event_id}/cancel")
async def cancel_event(event_id: str):
    ev = await db.events.find_one({"id": event_id})
    if not ev:
        raise HTTPException(404, "Event nicht gefunden")
    ts = now_iso()
    await db.events.update_one({"id": event_id}, {"$set": {
        "status": "canceled",
        "actualEndedAt": ts,
        "updatedAt": ts,
    }})
    runtime = await db.runtime.find_one({"_id": "singleton"})
    if runtime and runtime.get("activeRun", {}).get("eventId") == event_id:
        await db.runtime.update_one({"_id": "singleton"}, {"$set": {
            "activeRun": None,
            "lastEndedAt": ts,
        }})
    await append_log("info", f"Event abgebrochen: {event_id}")
    return {"ok": True}


# ── Manual Start/Stop ────────────────────────────────────────
@app.post("/api/manual/start")
async def manual_start(inp: ManualRunInput):
    ch = await db.channels.find_one({"id": inp.channelId}, {"_id": 0})
    if not ch:
        raise HTTPException(400, "Kanal nicht gefunden")
    pr = await db.presets.find_one({"id": inp.presetId}, {"_id": 0})
    if not pr:
        raise HTTPException(400, "Preset nicht gefunden")
    runtime = await db.runtime.find_one({"_id": "singleton"})
    if runtime and runtime.get("activeRun"):
        raise HTTPException(400, "Ein Stream laeuft bereits")
    ts = now_iso()
    run = {
        "kind": "manual",
        "channelId": inp.channelId,
        "presetId": inp.presetId,
        "channelName": ch["name"],
        "presetName": pr["name"],
        "startedAt": ts,
        "plannedStopAt": inp.stopAt,
        "status": "running",
    }
    await db.runtime.update_one({"_id": "singleton"}, {"$set": {
        "activeRun": run,
        "lastStartedAt": ts,
        "lastError": None,
    }})
    await append_log("info", f"Manueller Stream gestartet: {ch['name']} -> {pr['name']}")
    return run


@app.post("/api/stop")
async def stop_active():
    runtime = await db.runtime.find_one({"_id": "singleton"})
    if not runtime or not runtime.get("activeRun"):
        return {"stopped": False}
    ts = now_iso()
    active = runtime["activeRun"]
    if active.get("kind") == "event" and active.get("eventId"):
        await db.events.update_one({"id": active["eventId"]}, {"$set": {
            "status": "completed",
            "actualEndedAt": ts,
            "updatedAt": ts,
        }})
    await db.runtime.update_one({"_id": "singleton"}, {"$set": {
        "activeRun": None,
        "lastEndedAt": ts,
    }})
    await append_log("info", "Stream gestoppt")
    return {"stopped": True}


# ── Logs ────────────────────────────────────────────────────
@app.get("/api/logs")
async def get_logs(limit: int = 100):
    logs = await db.logs.find({}, {"_id": 0}).sort("createdAt", -1).limit(limit).to_list(limit)
    return logs


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/voice-channels")
async def voice_channels():
    return []


@app.get("/api/stream/health")
async def stream_health():
    runtime = await db.runtime.find_one({"_id": "singleton"}, {"_id": 0})
    active_run = runtime.get("activeRun") if runtime else None
    if not active_run:
        return {"active": False}
    started_at = datetime.fromisoformat(active_run["startedAt"].replace("Z", "+00:00"))
    uptime_ms = int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000)
    return {
        "active": True,
        "status": active_run.get("status", "unknown"),
        "channelName": active_run.get("channelName", "?"),
        "presetName": active_run.get("presetName", "?"),
        "uptimeMs": uptime_ms,
        "startedAt": active_run["startedAt"],
        "plannedStopAt": active_run.get("plannedStopAt"),
    }


class UrlTestInput(BaseModel):
    url: str


@app.post("/api/presets/test-url")
async def test_url(inp: UrlTestInput):
    if not inp.url.strip():
        raise HTTPException(400, "URL is required")
    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            resp = await client.head(inp.url.strip(), follow_redirects=True)
        content_type = resp.headers.get("content-type", "unknown")
        return {
            "reachable": resp.is_success,
            "status": resp.status_code,
            "contentType": content_type,
        }
    except Exception as e:
        return {"reachable": False, "error": str(e)}


# ── Static files (serve control panel UI) ───────────────────
CONTROL_PANEL_PUBLIC = Path(__file__).resolve().parent.parent / "examples" / "control-panel" / "public"

if CONTROL_PANEL_PUBLIC.exists():
    app.mount("/css", StaticFiles(directory=str(CONTROL_PANEL_PUBLIC / "css")), name="css")
    app.mount("/js", StaticFiles(directory=str(CONTROL_PANEL_PUBLIC / "js")), name="js")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = CONTROL_PANEL_PUBLIC / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(CONTROL_PANEL_PUBLIC / "index.html"))
