# Self-hosting

Dieses Repo kann als persistenter Docker-Dienst betrieben werden.

## Voraussetzungen

- Docker mit `docker compose`
- Git
- auf Windows: Git Bash oder WSL fuer die `.sh`-Skripte

## Schnellstart

1. Repo klonen
2. `./install.sh`
3. im Browser `http://localhost:3099` oder deinen gewaehlten Port aufrufen

`install.sh` fragt interaktiv alles ab, was fuer den ersten Start noetig ist:

- Discord-Token
- Web-Panel-Port
- Zeitzone
- Discord-Commands an/aus
- Command-Prefix
- erlaubte Discord-User-IDs

Die Konfiguration wird in `deploy/.env` gespeichert. Persistente Daten liegen unter `deploy/data/`.

## Bestehende Konfiguration aendern

```sh
./config.sh
```

Danach wird der Container mit der neuen Konfiguration neu gebaut und neu gestartet.

## Updates einspielen

```sh
./update.sh
```

`update.sh` fuehrt ein `git pull --ff-only` aus und startet danach den Container mit einem frischen Build neu.

## Wichtige Dateien

- `deploy/.env.example`: Vorlage fuer alle Runtime-Variablen
- `deploy/docker-compose.yml`: Container-Definition
- `docker/control-panel.Dockerfile`: Build fuer den produktiven Dienst

## Hinweise

- Der Dienst speichert seinen Zustand in `deploy/data/control-panel-state.json`.
- YouTube-Quellen laufen ueber `yt-dlp`, das im Docker-Image bereits installiert ist.
- Fuer Aenderungen an Code oder Abhaengigkeiten solltest du danach `./update.sh` ausfuehren.
