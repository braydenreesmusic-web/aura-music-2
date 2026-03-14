import { spawn, execFileSync, type SpawnOptionsWithoutStdio } from 'child_process';
import fs from 'fs';
import path from 'path';
import ytdl from '@distube/ytdl-core';

type YtDlpCommand = {
  command: string;
  prefixArgs: string[];
};

// Ensure Homebrew & common binary dirs are on PATH for child processes (ffmpeg, etc.).
const HOME = process.env.HOME || '/root';
const PROJECT_BIN = path.join(process.cwd(), 'node_modules', '.bin');
const CHILD_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  PATH: [
    PROJECT_BIN,                    // project-local (Render deploy artifact)
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
  console.log(`[downloader] yt-dlp found: ${YT_DLP.command} ${YT_DLP.prefixArgs.join(' ')}`.trim());
} else {
  console.warn('[downloader] yt-dlp NOT available — falling back to ytdl-core (may be blocked by YouTube)');
}

function spawnYtDlp(args: string[], options?: SpawnOptionsWithoutStdio) {
  return spawn(YT_DLP.command, [...YT_DLP.prefixArgs, ...args], {
    ...options,
    env: CHILD_ENV,
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
  const ext = format === 'video' ? 'mp4' : 'mp3';
  const filename = `${safeTitle}.${ext}`;
  const filePath = path.join(downloadDir, filename);

  // Build yt-dlp args
  const args: string[] = [];

  if (format === 'audio') {
    args.push(
      '-x',                          // extract audio
      '--audio-format', 'mp3',       // convert to mp3
      '--audio-quality', '0',        // best quality
    );
  } else {
    args.push(
      '-f', 'bv*+ba/b',             // best video+audio, fallback to best single
      '--merge-output-format', 'mp4',
    );
  }

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
        reject(new Error(normalizeDownloadErrorMessage(stderr.trim() || `yt-dlp exited with code ${code}`)));
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
    const proc = spawnYtDlp(['--dump-json', '--no-playlist', '--no-warnings', url]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp metadata failed (code ${code})`));
        return;
      }
      try {
        const data = JSON.parse(stdout);
        resolve({
          title: data.title || 'Unknown',
          artist: data.uploader || data.channel || 'Unknown Artist',
          thumbnail: data.thumbnail || '',
          duration: data.duration || 0,
        });
      } catch (e) {
        reject(new Error('Failed to parse yt-dlp metadata'));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`yt-dlp command unavailable (${YT_DLP.command} ${YT_DLP.prefixArgs.join(' ')}): ${err.message}`));
    });
  });
}
