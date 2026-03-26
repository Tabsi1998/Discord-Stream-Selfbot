FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

ARG YT_DLP_PACKAGE=yt-dlp[default]

# Layer 1: System packages (cached unless Dockerfile changes)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    ffmpeg \
    git \
    pkg-config \
    python3 \
    python3-dev \
    python3-pip \
    tini \
    libzmq3-dev \
 && python3 -m pip install --no-cache-dir --break-system-packages --pre -U "${YT_DLP_PACKAGE}" \
 && python3 -m pip install --no-cache-dir --break-system-packages yt-dlp-youtube-oauth2 \
 && python3 -c "\
p=__import__('importlib').import_module('yt_dlp_plugins.extractor.youtubeoauth'); \
f=__import__('pathlib').Path(p.__file__); t=f.read_text(); \
t=t.replace(\"'code': code_response['device_code']\",\"'device_code': code_response['device_code']\"); \
f.write_text(t); print('OAuth2 plugin patched: device_code fix')" \
 && yt-dlp --version \
 && rm -rf /var/lib/apt/lists/*

# Layer 2: npm dependencies (cached unless package.json changes)
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm install

COPY examples/control-panel/package.json examples/control-panel/package-lock.json* examples/control-panel/

# Layer 3: Build main library
COPY src/ src/
COPY tsconfig.json ./
RUN npm run build

# Layer 4: Install + build control panel (cached unless its deps change)
RUN npm --prefix examples/control-panel install

# Layer 5: Copy remaining code + build control panel
COPY examples/control-panel/src/ examples/control-panel/src/
COPY examples/control-panel/tsconfig.json examples/control-panel/
COPY examples/control-panel/public/ examples/control-panel/public/
RUN npm --prefix examples/control-panel run build \
 && mkdir -p /app/examples/control-panel/data \
 && npm cache clean --force

ENV NODE_ENV=production
ENV PORT=3099
ENV DATA_FILE=/app/examples/control-panel/data/control-panel-state.json

WORKDIR /app/examples/control-panel

EXPOSE 3099

ENTRYPOINT ["tini", "--"]
CMD ["node", "./dist/index.js"]
