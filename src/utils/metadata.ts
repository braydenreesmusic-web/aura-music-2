// @ts-ignore
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';

export async function parseMetadata(file: File): Promise<{ title: string; artist: string; album: string; coverUrl?: string }> {
  return new Promise((resolve) => {
    if (file.type.startsWith('video/')) {
      resolve({
        title: file.name.replace(/\.[^/.]+$/, ''),
        artist: 'Unknown Artist',
        album: 'Video',
      });
      return;
    }

    jsmediatags.read(file, {
      onSuccess: async (tag) => {
        const tags = tag.tags;
        let coverUrl: string | undefined;
        if (tags.picture) {
          try {
            const data = tags.picture.data;
            const format = tags.picture.format || 'image/jpeg';
            const blob = new Blob([new Uint8Array(data)], { type: format });
            coverUrl = await blobToDataUrl(blob);
          } catch {
            // Ignore cover art extraction failures
          }
        }
        resolve({
          title: tags.title || file.name.replace(/\.[^/.]+$/, ''),
          artist: tags.artist || 'Unknown Artist',
          album: tags.album || 'Unknown Album',
          coverUrl,
        });
      },
      onError: () => {
        resolve({
          title: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Unknown Artist',
          album: 'Unknown Album',
        });
      },
    });
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      resolve(audio.duration);
      URL.revokeObjectURL(url);
    });
    audio.addEventListener('error', () => {
      resolve(0);
      URL.revokeObjectURL(url);
    });
  });
}

/**
 * Migrates tracks with stale blob: coverUrls to data: URLs by re-extracting
 * cover art from the stored File. Only runs once per stale track.
 */
export async function fixStaleBlobCovers(tracks: any[]): Promise<any[]> {
  const { addTrack } = await import('../db');
  let changed = false;
  for (const track of tracks) {
    if (track.coverUrl && track.coverUrl.startsWith('blob:')) {
      // Re-extract from file
      try {
        const meta = await parseMetadata(track.file);
        track.coverUrl = meta.coverUrl || undefined;
        await addTrack(track); // persist the fix
        changed = true;
      } catch {
        track.coverUrl = undefined;
      }
    }
  }
  return tracks;
}
