#!/usr/bin/env bash
# install-server-deps.sh — installs yt-dlp + ffmpeg for the backend.
# Called automatically by npm postinstall in production (NODE_ENV=production)
# or manually via `npm run render:build`.
#
# IMPORTANT: Binaries are placed in ./node_modules/.bin/ so they survive
# Render's build→deploy upload (only the project directory is kept).
set -uo pipefail  # no -e so individual failures don't abort the whole script

# Where to place binaries — inside the project so they ship with the deploy
BIN_DIR="$(pwd)/node_modules/.bin"
mkdir -p "$BIN_DIR"
export PATH="$BIN_DIR:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

echo "[setup] BIN_DIR=$BIN_DIR"

# ── yt-dlp ──────────────────────────────────────────────────────
# Always (re-)download the latest binary to stay ahead of YouTube API changes.
# yt-dlp is a fast-moving target; stale binaries cause "format not available" errors.
EXISTING_VER="$($BIN_DIR/yt-dlp --version 2>/dev/null || echo 'none')"
echo "[setup] Current yt-dlp version: $EXISTING_VER — updating to latest…"
INSTALLED=false

# Attempt 1: download standalone binary (fastest, no python needed)
echo "[setup]  → downloading standalone binary…"
if curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
     -o "$BIN_DIR/yt-dlp" 2>/dev/null; then
  chmod +x "$BIN_DIR/yt-dlp"
  INSTALLED=true
fi

# Attempt 2: pip install then copy binary into BIN_DIR
if [ "$INSTALLED" = false ] && command -v python3 &>/dev/null; then
  echo "[setup]  → trying pip install --user + copy…"
  python3 -m pip install --user --quiet yt-dlp 2>/dev/null || true
  PIP_BIN="$HOME/.local/bin/yt-dlp"
  if [ -x "$PIP_BIN" ]; then
    cp "$PIP_BIN" "$BIN_DIR/yt-dlp"
    chmod +x "$BIN_DIR/yt-dlp"
    INSTALLED=true
  fi
fi

if [ "$INSTALLED" = true ]; then
  echo "[setup] yt-dlp installed: $($BIN_DIR/yt-dlp --version 2>/dev/null || echo 'ok')"
else
  echo "[setup] ⚠ yt-dlp could not be installed — downloads will use ytdl-core fallback"
fi

# ── ffmpeg ──────────────────────────────────────────────────────
if [ -x "$BIN_DIR/ffmpeg" ] || command -v ffmpeg &>/dev/null; then
  echo "[setup] ffmpeg already available"
else
  echo "[setup] Installing ffmpeg static build…"
  if curl -fsSL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" \
       -o /tmp/ffmpeg.tar.xz 2>/dev/null; then
    tar xf /tmp/ffmpeg.tar.xz -C /tmp 2>/dev/null
    cp /tmp/ffmpeg-*-amd64-static/ffmpeg  "$BIN_DIR/ffmpeg"  2>/dev/null || true
    cp /tmp/ffmpeg-*-amd64-static/ffprobe "$BIN_DIR/ffprobe" 2>/dev/null || true
    chmod +x "$BIN_DIR/ffmpeg" "$BIN_DIR/ffprobe" 2>/dev/null || true
    rm -rf /tmp/ffmpeg*
    echo "[setup] ffmpeg installed into project"
  else
    echo "[setup] ⚠ ffmpeg download failed — audio extraction may not work"
  fi
fi

# ── node symlink for yt-dlp JS challenge solving ────────────────
# yt-dlp needs a JS runtime (node/deno/bun/quickjs) on PATH to solve
# YouTube's signature challenges. Create a symlink so yt-dlp finds node.
NODE_PATH="$(which node 2>/dev/null || echo '')"
if [ -n "$NODE_PATH" ] && [ ! -e "$BIN_DIR/node" ]; then
  ln -sf "$NODE_PATH" "$BIN_DIR/node"
  echo "[setup] Created node symlink: $BIN_DIR/node -> $NODE_PATH"
elif [ -e "$BIN_DIR/node" ]; then
  echo "[setup] node symlink already exists in $BIN_DIR"
else
  echo "[setup] ⚠ node not found — yt-dlp JS challenges will fail"
fi

echo "[setup] Contents of $BIN_DIR (yt-dlp/ffmpeg/node):"
ls -la "$BIN_DIR/yt-dlp" "$BIN_DIR/ffmpeg" "$BIN_DIR/ffprobe" "$BIN_DIR/node" 2>/dev/null || true
echo "[setup] Done ✅"
