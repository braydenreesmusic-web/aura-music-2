#!/usr/bin/env bash
# render-build.sh — Render custom build command
# Installs yt-dlp + ffmpeg alongside the normal npm install.
set -euo pipefail

echo "==> Installing npm dependencies…"
npm ci

# ── Install yt-dlp ──────────────────────────────────────────────
# Strategy: try pip first (if python3 exists), then fall back to
# downloading the standalone binary from GitHub.
YT_DLP_OK=false
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

# Attempt 1: pip install
if command -v python3 &>/dev/null; then
  echo "==> python3 found, installing yt-dlp via pip…"
  python3 -m pip install --user yt-dlp 2>/dev/null && YT_DLP_OK=true || true
fi

# Attempt 2: download standalone binary
if [ "$YT_DLP_OK" = false ]; then
  echo "==> pip not available, downloading yt-dlp standalone binary…"
  mkdir -p "$HOME/.local/bin"
  curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
    -o "$HOME/.local/bin/yt-dlp" && \
    chmod +x "$HOME/.local/bin/yt-dlp" && \
    YT_DLP_OK=true || true
fi

# Attempt 3: apt (unlikely to have perms, but try)
if [ "$YT_DLP_OK" = false ]; then
  echo "==> Trying apt-get…"
  (apt-get update -qq && apt-get install -y -qq yt-dlp ffmpeg) 2>/dev/null && YT_DLP_OK=true || true
fi

# ── Install ffmpeg if not present ───────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
  echo "==> ffmpeg not found, downloading static build…"
  mkdir -p "$HOME/.local/bin"
  curl -fsSL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" \
    -o /tmp/ffmpeg.tar.xz && \
    tar xf /tmp/ffmpeg.tar.xz -C /tmp && \
    cp /tmp/ffmpeg-*-amd64-static/ffmpeg "$HOME/.local/bin/ffmpeg" && \
    cp /tmp/ffmpeg-*-amd64-static/ffprobe "$HOME/.local/bin/ffprobe" && \
    chmod +x "$HOME/.local/bin/ffmpeg" "$HOME/.local/bin/ffprobe" && \
    rm -rf /tmp/ffmpeg* || echo "⚠ ffmpeg install failed (audio extraction may not work)"
fi

# ── Report ──────────────────────────────────────────────────────
echo "==> PATH=$PATH"
echo "==> yt-dlp: $(yt-dlp --version 2>/dev/null || echo 'NOT FOUND')"
echo "==> ffmpeg: $(ffmpeg -version 2>/dev/null | head -1 || echo 'NOT FOUND')"
echo "==> python3: $(python3 --version 2>/dev/null || echo 'NOT FOUND')"
echo "==> Build complete ✅"
