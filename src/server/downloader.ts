import { spawn, execFileSync, type SpawnOptionsWithoutStdio } from 'child_process';
import fs from 'fs';
import path from 'path';
import ytdl from '@distube/ytdl-core';

type YtDlpCommand = {
  command: string;
  prefixArgs: string[];
};

// YouTube client strategy for datacenter IPs:
// - "web" client uses cookies for authentication (primary)
// - "mweb" (mobile-web) sometimes bypasses datacenter blocks
// - Do NOT skip webpage — cookies require the normal web flow
// - Do NOT use ios/android — they can't use Netscape cookie jars
const DEFAULT_YT_DLP_ARGS = [
  '--extractor-args', 'youtube:player_client=web,mweb',
];

// Ensure Homebrew & common binary dirs are on PATH for child processes (ffmpeg, etc.).
const HOME = process.env.HOME || '/root';
const PROJECT_BIN = path.join(process.cwd(), 'node_modules', '.bin');
// Include the directory of the running Node.js binary so yt-dlp can find
// a JS runtime for signature/challenge solving (required since 2026+).
const NODE_BIN_DIR = path.dirname(process.execPath);
const CHILD_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  PATH: [
    PROJECT_BIN,                    // project-local (Render deploy artifact)
    NODE_BIN_DIR,                   // current Node.js binary (for yt-dlp JS challenges)
    `${HOME}/.local/bin`,           // pip install --user
    '/opt/homebrew/bin',            // macOS Homebrew
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/root/.local/bin',             // Docker root user
    process.env.PATH ?? '',
  ].join(':'),
  // Suppress ytdl-core update-check 403 noise
  YTDL_NO_UPDATE: '1',
};

// ── YouTube cookie authentication ───────────────────────────────
// Bypass YouTube's anti-bot checks on cloud server IPs.
//
// Option A (easiest): base64-encode your cookies.txt and set YOUTUBE_COOKIES_B64
// Option B: paste raw Netscape cookie-jar text into YOUTUBE_COOKIES
// Option C: place a cookies.txt file in the project root
//
// Export instructions (one-time, ~2 minutes):
//   1. Open a NEW Incognito/Private window → log into youtube.com
//   2. In the SAME tab, go to https://www.youtube.com/robots.txt
//   3. Use "Get cookies.txt LOCALLY" extension → export youtube.com cookies
//   4. Run:  base64 -w0 < cookies.txt   (Linux/Mac)
//   5. Paste the output as YOUTUBE_COOKIES_B64 env var on Render
//   6. Close the incognito window (never reopen that session)
const COOKIES_PATH = path.join(process.cwd(), '.yt-cookies.txt');
let HAS_COOKIES = false;

function initCookies(): void {
  // Priority 1: base64-encoded cookies (safest for env vars — no newline issues)
  const b64 = process.env.YOUTUBE_COOKIES_B64?.trim();
  if (b64) {
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      if (decoded.includes('.youtube.com') || decoded.includes('#HttpOnly_')) {
        fs.writeFileSync(COOKIES_PATH, decoded, 'utf8');
        HAS_COOKIES = true;
        console.log('[downloader] YouTube cookies loaded from YOUTUBE_COOKIES_B64 env var');
        return;
      }
      console.warn('[downloader] YOUTUBE_COOKIES_B64 decoded but doesn\'t look like a cookie file — skipping');
    } catch (err) {
      console.warn('[downloader] Failed to decode YOUTUBE_COOKIES_B64:', err);
    }
  }

  // Priority 2: raw cookie text in env var
  const envCookies = process.env.YOUTUBE_COOKIES?.trim();
  if (envCookies && (envCookies.includes('.youtube.com') || envCookies.includes('#HttpOnly_'))) {
    try {
      fs.writeFileSync(COOKIES_PATH, envCookies, 'utf8');
      HAS_COOKIES = true;
      console.log('[downloader] YouTube cookies loaded from YOUTUBE_COOKIES env var');
      return;
    } catch (err) {
      console.warn('[downloader] Failed to write cookies file:', err);
    }
  }

  // Priority 3: cookies file already on disk (e.g. mounted volume)
  const envPath = process.env.YOUTUBE_COOKIES_FILE?.trim();
  const candidates = [envPath, COOKIES_PATH, path.join(process.cwd(), 'cookies.txt')].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 50) {
        if (p !== COOKIES_PATH) fs.copyFileSync(p, COOKIES_PATH);
        HAS_COOKIES = true;
        console.log(`[downloader] YouTube cookies loaded from ${p}`);
        return;
      }
    } catch { /* skip unreadable */ }
  }

  console.warn('[downloader] No YouTube cookies configured — downloads may be blocked on cloud IPs.');
  console.warn('[downloader] Set YOUTUBE_COOKIES_B64 env var (base64 of cookies.txt) to fix this.');
  console.warn('[downloader] See README → "YouTube Cookie Setup" for a 2-minute walkthrough.');
}

initCookies();

/** Args to inject into every yt-dlp call for authentication */
function cookieArgs(): string[] {
  return HAS_COOKIES ? ['--cookies', COOKIES_PATH] : [];
}

export { HAS_COOKIES as hasCookies };

function canExecute(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, {
      encoding: 'utf8',
      stdio: 'ignore',
      env: CHILD_ENV,
    });
    return true;
  } catch {
    return false;
  }
}

// Resolve the best available yt-dlp invocation at startup.
function resolveYtDlpCommand(): YtDlpCommand {
  const explicit = process.env.YT_DLP_BIN?.trim();
  if (explicit && canExecute(explicit, ['--version'])) {
    return { command: explicit, prefixArgs: [] };
  }

  const candidates = [
    path.join(PROJECT_BIN, 'yt-dlp'),  // project-local (Render deploy)
    `${HOME}/.local/bin/yt-dlp`,
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/bin/yt-dlp',
    '/root/.local/bin/yt-dlp',
  ];

  for (const c of candidates) {
    if (fs.existsSync(c) && canExecute(c, ['--version'])) {
      return { command: c, prefixArgs: [] };
    }
  }

  try {
    const detected = execFileSync('which', ['yt-dlp'], { encoding: 'utf8', env: CHILD_ENV }).trim();
    if (detected && canExecute(detected, ['--version'])) {
      return { command: detected, prefixArgs: [] };
    }
  } catch {
    // Keep checking fallbacks.
  }

  if (canExecute('python3', ['-m', 'yt_dlp', '--version'])) {
    return { command: 'python3', prefixArgs: ['-m', 'yt_dlp'] };
  }

  return { command: 'yt-dlp', prefixArgs: [] };
}

const YT_DLP = resolveYtDlpCommand();
const HAS_YT_DLP = canExecute(YT_DLP.command, [...YT_DLP.prefixArgs, '--version']);

if (HAS_YT_DLP) {
  try {
    const ver = execFileSync(YT_DLP.command, [...YT_DLP.prefixArgs, '--version'], { encoding: 'utf8', env: CHILD_ENV }).trim();
    console.log(`[downloader] yt-dlp found: ${YT_DLP.command} ${YT_DLP.prefixArgs.join(' ')} (version ${ver})`.trim());
  } catch {
    console.log(`[downloader] yt-dlp found: ${YT_DLP.command} ${YT_DLP.prefixArgs.join(' ')}`.trim());
  }
} else {
  console.warn('[downloader] yt-dlp NOT available — falling back to ytdl-core (may be blocked by YouTube)');
}

// Check ffmpeg availability once at startup
const HAS_FFMPEG = (() => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', env: CHILD_ENV }); return true; }
  catch { return false; }
})();
console.log(`[downloader] ffmpeg: ${HAS_FFMPEG ? 'available' : 'NOT available (no format conversion)'}`);
console.log(`[downloader] node for yt-dlp JS challenges: ${NODE_BIN_DIR}/node (${process.version})`);

// Ensure yt-dlp can find a `node` binary in PROJECT_BIN for JS challenge solving.
// The standalone yt-dlp binary searches PATH for node/deno/bun/quickjs.
// On Render, node may be in a NVM-managed path that yt-dlp doesn't see.
try {
  const nodeLinkPath = path.join(PROJECT_BIN, 'node');
  if (!fs.existsSync(nodeLinkPath)) {
    fs.symlinkSync(process.execPath, nodeLinkPath);
    console.log(`[downloader] Created node symlink: ${nodeLinkPath} -> ${process.execPath}`);
  } else {
    console.log(`[downloader] node symlink exists: ${nodeLinkPath}`);
  }
} catch (err) {
  console.warn(`[downloader] Could not create node symlink in ${PROJECT_BIN}:`, err);
}
function spawnYtDlp(args: string[], options?: SpawnOptionsWithoutStdio) {
  return spawn(YT_DLP.command, [...YT_DLP.prefixArgs, ...DEFAULT_YT_DLP_ARGS, ...cookieArgs(), ...args], {
    ...options,
    env: CHILD_ENV,
  });
}

export async function debugListFormats(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use -v (verbose) so we can see which clients are tried, cookie status, etc.
    const proc = spawnYtDlp(['-v', '--list-formats', '--no-playlist', url]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      // Verbose info goes to stderr, format list to stdout
      const header = [
        `=== yt-dlp debug (code ${code}) ===`,
        `cookies: ${HAS_COOKIES ? 'YES' : 'NO'}`,
        `command: ${YT_DLP.command}`,
        `default_args: ${DEFAULT_YT_DLP_ARGS.join(' ')}`,
        ``,
      ].join('\n');
      const output = `${header}${stderr}\n\n--- STDOUT ---\n${stdout}`.trim();
      if (code !== 0) {
        // Still resolve (don't reject) so we can see the full debug info
        resolve(output);
        return;
      }
      resolve(output);
    });

    proc.on('error', (err) => reject(new Error(`Failed to spawn yt-dlp: ${err.message}`)));
  });
}

export interface DownloadResult {
  filename: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  format: 'audio' | 'video';
  fileUrl: string;
}

function normalizeDownloadErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  const botCheckHints = [
    'sign in to confirm',
    "you\'re not a bot",
    'you are not a bot',
    'bot',
    '429',
    'too many requests',
    'captcha',
  ];

  if (botCheckHints.some((hint) => lower.includes(hint))) {
    return 'YouTube is blocking this download with an anti-bot check. This is separate from your Aura account login. Try another video, wait a few minutes, or retry after backend redeploy.';
  }

  return message;
}

/**
 * Download using yt-dlp (system binary) — far more reliable than ytdl-core.
 */
export async function downloadMedia(
  url: string,
  format: 'audio' | 'video',
  downloadDir: string,
  onProgress: (percent: number) => void,
): Promise<DownloadResult> {
  if (!HAS_YT_DLP) {
    return downloadWithYtdlCore(url, format, downloadDir, onProgress);
  }

  // First get video metadata via yt-dlp --dump-json
  const meta = await getMetadata(url);
  const safeTitle = meta.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 200);
  // Build yt-dlp args
  const args: string[] = [];
  let ext: string;

  if (format === 'audio') {
    if (HAS_FFMPEG) {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
      ext = 'mp3';
    } else {
      ext = 'm4a';
    }
  } else {
    if (HAS_FFMPEG) {
      args.push('--merge-output-format', 'mp4');
    }
    ext = 'mp4';
  }
  // NOTE: no -f flag — let yt-dlp auto-select the best available format.
  // Explicit format selectors like "bestvideo+bestaudio" can fail on the
  // standalone binary depending on version / available streams.
  //
  // --no-check-formats: don't try to HEAD-request each format URL to verify
  // it's reachable — this fails on datacenter IPs where YouTube throttles.
  args.push('--no-check-formats');

  const filename = `${safeTitle}.${ext}`;
  const filePath = path.join(downloadDir, filename);

  args.push(
    '--no-playlist',
    '--no-warnings',
    '--progress',
    '--newline',
    '--retries', '3',
    '--fragment-retries', '3',
    '--extractor-retries', '3',
    '-o', filePath,
    url,
  );

  return new Promise((resolve, reject) => {
    const fullCmd = [YT_DLP.command, ...YT_DLP.prefixArgs, ...cookieArgs().map(a => a.includes('cookie') ? a : '***'), ...args].join(' ');
    console.log(`[downloader] running: ${fullCmd}`);
    const proc = spawnYtDlp(args, { cwd: downloadDir });
    let lastProgress = 0;
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      const line = data.toString();
      // Parse progress: "[download]  45.2% of ..."
      const match = line.match(/\[download\]\s+([\d.]+)%/);
      if (match) {
        const pct = Math.round(parseFloat(match[1]));
        if (pct > lastProgress) {
          lastProgress = pct;
          onProgress(pct);
        }
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      // yt-dlp may add extensions — find the actual file
      const actualFile = findOutputFile(downloadDir, safeTitle, ext);
      if (code !== 0 || !actualFile) {
        const errMsg = stderr.trim() || `yt-dlp exited with code ${code}`;
        console.error(`[downloader] DOWNLOAD FAILED (code ${code}):`, errMsg);
        console.error(`[downloader] command was: ${fullCmd}`);
        reject(new Error(normalizeDownloadErrorMessage(errMsg)));
        return;
      }

      // Rename to expected filename if different
      const actualPath = path.join(downloadDir, actualFile);
      if (actualFile !== filename) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          fs.renameSync(actualPath, filePath);
        } catch {
          // Use whatever file we got
          resolve({
            filename: actualFile,
            title: meta.title,
            artist: meta.artist,
            thumbnail: meta.thumbnail,
            duration: meta.duration,
            format,
            fileUrl: `/api/file/${encodeURIComponent(actualFile)}`,
          });
          return;
        }
      }

      onProgress(100);
      resolve({
        filename,
        title: meta.title,
        artist: meta.artist,
        thumbnail: meta.thumbnail,
        duration: meta.duration,
        format,
        fileUrl: `/api/file/${encodeURIComponent(filename)}`,
      });
    });

    proc.on('error', (err) => {
      reject(new Error(normalizeDownloadErrorMessage(`Failed to spawn yt-dlp command (${YT_DLP.command} ${YT_DLP.prefixArgs.join(' ')}): ${err.message}`)));
    });
  });
}

async function downloadWithYtdlCore(
  url: string,
  format: 'audio' | 'video',
  downloadDir: string,
  onProgress: (percent: number) => void,
): Promise<DownloadResult> {
  let info: ytdl.videoInfo;
  try {
    info = await ytdl.getInfo(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(normalizeDownloadErrorMessage(`ytdl-core metadata failed: ${message}`));
  }
  const meta = getMetadataFromYtdlInfo(info);
  const safeTitle = meta.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 200);

  const selectedFormat = selectYtdlFormat(info, format);
  const ext = selectedFormat.container || (format === 'video' ? 'mp4' : 'm4a');
  const filename = `${safeTitle}.${ext}`;
  const filePath = path.join(downloadDir, filename);

  return new Promise((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(info, {
      format: selectedFormat,
      highWaterMark: 1 << 25,
    });
    const out = fs.createWriteStream(filePath);
    let lastProgress = 0;

    stream.on('progress', (_chunkLength: number, downloaded: number, total: number) => {
      if (!total) return;
      const pct = Math.round((downloaded / total) * 100);
      if (pct > lastProgress) {
        lastProgress = pct;
        onProgress(pct);
      }
    });

    stream.on('error', (err) => {
      out.destroy();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      reject(new Error(normalizeDownloadErrorMessage(`ytdl-core download failed: ${err.message}`)));
    });

    out.on('error', (err) => {
      stream.destroy();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      reject(new Error(`Failed writing download file: ${err.message}`));
    });

    out.on('finish', () => {
      onProgress(100);
      resolve({
        filename,
        title: meta.title,
        artist: meta.artist,
        thumbnail: meta.thumbnail,
        duration: meta.duration,
        format,
        fileUrl: `/api/file/${encodeURIComponent(filename)}`,
      });
    });

    stream.pipe(out);
  });
}

function getMetadataFromYtdlInfo(info: ytdl.videoInfo): VideoMeta {
  const details = info.videoDetails;
  return {
    title: details.title || 'Unknown',
    artist: details.author?.name || details.ownerChannelName || 'Unknown Artist',
    thumbnail: details.thumbnails?.[details.thumbnails.length - 1]?.url || '',
    duration: parseInt(details.lengthSeconds || '0', 10) || 0,
  };
}

function selectYtdlFormat(info: ytdl.videoInfo, format: 'audio' | 'video'): ytdl.videoFormat {
  if (format === 'audio') {
    return ytdl.chooseFormat(info.formats, {
      filter: 'audioonly',
      quality: 'highestaudio',
    });
  }

  const mp4Muxed = info.formats
    .filter((f) => f.hasVideo && f.hasAudio && f.container === 'mp4')
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  if (mp4Muxed.length > 0) {
    return mp4Muxed[0];
  }

  return ytdl.chooseFormat(info.formats, {
    filter: 'audioandvideo',
    quality: 'highest',
  });
}

/** Find the output file yt-dlp actually created (it may append .webm, .m4a, etc before converting) */
function findOutputFile(dir: string, baseName: string, preferredExt: string): string | null {
  const exact = `${baseName}.${preferredExt}`;
  if (fs.existsSync(path.join(dir, exact))) return exact;

  // Look for any file starting with the base name
  const files = fs.readdirSync(dir);
  return files.find((f) => f.startsWith(baseName)) || null;
}

interface VideoMeta {
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
}

function getMetadata(url: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    // Use --print instead of --dump-json to avoid format selection entirely.
    // --dump-json triggers yt-dlp's format resolver internally (to populate
    // the "requested_formats" field) which fails with "Requested format is
    // not available" on datacenter IPs where YouTube restricts certain streams.
    const SEP = '|||';
    const template = ['%(title)s', '%(uploader)s', '%(thumbnail)s', '%(duration)s'].join(SEP);
    const metaArgs = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-formats',
      '--skip-download',
      '--print', template,
      url,
    ];
    console.log(`[downloader] fetching metadata for: ${url}`);
    const proc = spawnYtDlp(metaArgs);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        const errMsg = stderr.trim() || `yt-dlp metadata failed (code ${code})`;
        console.error(`[downloader] METADATA FAILED (code ${code}):`, errMsg);

        // Fallback: try --dump-json with -f b (single best muxed format)
        // in case --print isn't supported on this yt-dlp version
        console.log('[downloader] retrying metadata with --dump-json -f b ...');
        const fallback = spawnYtDlp(['--dump-json', '--no-playlist', '--no-warnings', '--no-check-formats', '-f', 'b', url]);
        let fbOut = '';
        let fbErr = '';
        fallback.stdout.on('data', (d: Buffer) => { fbOut += d.toString(); });
        fallback.stderr.on('data', (d: Buffer) => { fbErr += d.toString(); });
        fallback.on('close', (fbCode) => {
          if (fbCode !== 0) {
            console.error(`[downloader] METADATA FALLBACK also failed (code ${fbCode}):`, fbErr.trim());
            reject(new Error(errMsg));
            return;
          }
          try {
            const data = JSON.parse(fbOut);
            resolve({
              title: data.title || 'Unknown',
              artist: data.uploader || data.channel || 'Unknown Artist',
              thumbnail: data.thumbnail || '',
              duration: data.duration || 0,
            });
          } catch {
            reject(new Error('Failed to parse yt-dlp metadata (fallback)'));
          }
        });
        fallback.on('error', () => reject(new Error(errMsg)));
        return;
      }

      const line = stdout.trim().split('\n')[0] || '';
      const parts = line.split(SEP);
      if (parts.length >= 4) {
        resolve({
          title: parts[0] || 'Unknown',
          artist: parts[1] || 'Unknown Artist',
          thumbnail: parts[2] || '',
          duration: parseInt(parts[3], 10) || 0,
        });
      } else {
        // Shouldn't happen, but handle gracefully
        resolve({
          title: parts[0] || 'Unknown',
          artist: parts[1] || 'Unknown Artist',
          thumbnail: '',
          duration: 0,
        });
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`yt-dlp command unavailable (${YT_DLP.command} ${YT_DLP.prefixArgs.join(' ')}): ${err.message}`));
    });
  });
}
