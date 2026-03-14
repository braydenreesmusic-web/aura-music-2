#!/usr/bin/env bash
# install-server-deps.sh — installs yt-dlp + ffmpeg for the backend.
# Called automatically by npm postinstall in production (NODE_ENV=production)
# or manually via `npm run render:build`.
#
# Safe to run on any OS — skips gracefully when tools already exist.
set -uo pipefail  # no -e so individual failures don't abort the whole script

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# ── yt-dlp ──────────────────────────────────────────────────────
if command -v yt-dlp &>/dev/null; then
  echo "[setup] yt-dlp already installed: $(yt-dlp --version)"
else
  echo "[setup] Installing yt-dlp…"
  INSTALLED=false

  # Attempt 1: pip (Render has python3 on its native Node runtime)
  if command -v python3 &>/dev/null; then
    echo "[setup]  → trying pip install --user…"
    python3 -m pip install --user --quiet yt-dlp 2>/dev/null && INSTALLED=true || true
  fi

  # Attempt 2: standalone binary from GitHub releases
  if [ "$INSTALLED" = false ]; then
    echo "[setup]  → trying standalone binary download…"
    mkdir -p "$HOME/.local/bin"
    curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
      -o "$HOME/.local/bin/yt-dlp" 2>/dev/null && \
      chmod +x "$HOME/.local/bin/yt-dlp" && \
      INSTALLED=true || true
  fi

  if [ "$INSTALLED" = true ]; then
    echo "[setup] yt-dlp installed: $(yt-dlp --version 2>/dev/null || echo 'unknown version')"
  else
    echo "[setup] ⚠ yt-dlp could not be installed — downloads will use ytdl-core fallback"
  fi
fi

# ── ffmpeg ──────────────────────────────────────────────────────
if command -v ffmpeg &>/dev/null; then
  echo "[setup] ffmpeg already installed"
else
  echo "[setup] Installing ffmpeg static build…"
  mkdir -p "$HOME/.local/bin"
  if curl -fsSL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" \
       -o /tmp/ffmpeg.tar.xz 2>/dev/null; then
    tar xf /tmp/ffmpeg.tar.xz -C /tmp 2>/dev/null
    cp /tmp/ffmpeg-*-amd64-static/ffmpeg  "$HOME/.local/bin/ffmpeg"  2>/dev/null || true
    cp /tmp/ffmpeg-*-amd64-static/ffprobe "$HOME/.local/bin/ffprobe" 2>/dev/null || true
    chmod +x "$HOME/.local/bin/ffmpeg" "$HOME/.local/bin/ffprobe" 2>/dev/null || true
    rm -rf /tmp/ffmpeg*
    echo "[setup] ffmpeg installed"
  else
    echo "[setup] ⚠ ffmpeg download failed — audio extraction may not work"
  fi
fi

echo "[setup] Done ✅"
