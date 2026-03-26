FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

ARG YT_DLP_PACKAGE=yt-dlp[default]

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
 && yt-dlp --version \
 && rm -rf /var/lib/apt/lists/*

COPY . .

RUN npm install \
 && npm run build \
 && npm --prefix examples/control-panel install \
 && npm --prefix examples/control-panel run build \
 && mkdir -p /app/examples/control-panel/data \
 && npm cache clean --force

ENV NODE_ENV=production
ENV PORT=3099
ENV DATA_FILE=/app/examples/control-panel/data/control-panel-state.json

WORKDIR /app/examples/control-panel

EXPOSE 3099

ENTRYPOINT ["tini", "--"]
CMD ["node", "./dist/index.js"]
