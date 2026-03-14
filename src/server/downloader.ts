import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface DownloadResult {
  filename: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  format: 'audio' | 'video';
  fileUrl: string;
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
    const proc = spawn('yt-dlp', args, { cwd: downloadDir });
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
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
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
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}. Is yt-dlp installed?`));
    });
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
    const proc = spawn('yt-dlp', ['--dump-json', '--no-playlist', '--no-warnings', url]);
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
      reject(new Error(`yt-dlp not found: ${err.message}`));
    });
  });
}
