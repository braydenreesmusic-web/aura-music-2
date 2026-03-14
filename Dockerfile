# ── Render / Railway / Docker deploy ──────────────────────────────
# Installs yt-dlp + ffmpeg so downloads actually work (ytdl-core is
# blocked by YouTube anti-bot on most cloud IPs).

FROM node:22-slim

# Install system deps: ffmpeg, python3, pip → yt-dlp
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      python3-pip \
      python3-venv \
      ca-certificates \
      curl && \
    # Install yt-dlp via pip (always latest, bypasses distro lag)
    python3 -m pip install --break-system-packages --no-cache-dir yt-dlp && \
    # Verify
    yt-dlp --version && ffmpeg -version | head -1 && \
    # Cleanup
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install node deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Writable dirs for downloads and DB
RUN mkdir -p /app/downloads /tmp/aura-data

# Environment defaults (Render overrides PORT automatically)
ENV NODE_ENV=production
ENV DOWNLOAD_DIR=/app/downloads
ENV DB_PATH=/tmp/aura-data/server-data.sqlite
ENV YTDL_NO_UPDATE=1

EXPOSE 10000

CMD ["npx", "tsx", "src/server/index.ts"]
