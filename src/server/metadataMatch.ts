/**
 * Cleans YouTube titles and matches them to proper music metadata
 * using MusicBrainz recordings search.
 */

const MB_BASE = 'https://musicbrainz.org/ws/2';
const UA = 'reesr/1.0.0 (local-music-player)';

export interface CleanMetadata {
  title: string;
  artist: string;
  album: string;
  year?: number;
  trackNumber?: number;
  genre?: string;
  coverUrl?: string;
}

/**
 * Takes a raw YouTube title + channel and returns clean music metadata.
 * 1. Parses the YT title to extract likely artist/title
 * 2. Searches MusicBrainz for a match
 * 3. Falls back to cleaned YT title if no match
 */
export async function matchMetadata(
  ytTitle: string,
  ytChannel: string,
  durationSecs?: number,
): Promise<CleanMetadata> {
  // Step 1: Parse the YouTube title
  const parsed = parseYouTubeTitle(ytTitle, ytChannel);

  // Step 2: Try MusicBrainz lookup
  try {
    const mbResult = await searchMusicBrainz(parsed.artist, parsed.title, durationSecs);
    if (mbResult) {
      // Try to get cover art
      let coverUrl: string | undefined;
      if (mbResult.releaseId) {
        coverUrl = await fetchCoverArt(mbResult.releaseId);
      }
      return {
        title: mbResult.title,
        artist: mbResult.artist,
        album: mbResult.album || parsed.title,
        year: mbResult.year,
        trackNumber: mbResult.trackNumber,
        coverUrl,
      };
    }
  } catch (e) {
    // MusicBrainz lookup failed, fall through to cleaned title
  }

  // Step 3: Fallback — use parsed YouTube title
  return {
    title: parsed.title,
    artist: parsed.artist,
    album: 'Unknown Album',
  };
}

/** Common junk suffixes in YouTube music video titles */
const JUNK_PATTERNS = [
  /\s*\(?\s*official\s*(music\s*)?video\s*\)?\s*/gi,
  /\s*\(?\s*official\s*audio\s*\)?\s*/gi,
  /\s*\(?\s*official\s*lyric\s*video\s*\)?\s*/gi,
  /\s*\(?\s*official\s*visualizer\s*\)?\s*/gi,
  /\s*\(?\s*lyrics?\s*video\s*\)?\s*/gi,
  /\s*\(?\s*lyrics?\s*\)?\s*/gi,
  /\s*\(?\s*audio\s*(only)?\s*\)?\s*/gi,
  /\s*\(?\s*visualizer\s*\)?\s*/gi,
  /\s*\(?\s*hd\s*\)?\s*/gi,
  /\s*\(?\s*hq\s*\)?\s*/gi,
  /\s*\(?\s*4k\s*(remaster(ed)?)?\s*\)?\s*/gi,
  /\s*\(?\s*remaster(ed)?\s*\)?\s*/gi,
  /\s*\[.*?\]\s*/g,   // Remove bracketed content like [Official Video]
  /\s*\|\s*.*/g,       // Remove everything after |
];

interface ParsedTitle {
  artist: string;
  title: string;
}

function parseYouTubeTitle(ytTitle: string, ytChannel: string): ParsedTitle {
  let cleaned = ytTitle.trim();

  // Remove junk suffixes
  for (const pattern of JUNK_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned.trim().replace(/\s+/g, ' ');

  // Try to split "Artist - Title" or "Artist — Title" or "Artist – Title"
  const separators = [' - ', ' — ', ' – ', ' ~ '];
  for (const sep of separators) {
    const idx = cleaned.indexOf(sep);
    if (idx > 0) {
      const artist = cleaned.slice(0, idx).trim();
      const title = cleaned.slice(idx + sep.length).trim();
      if (artist && title) {
        return { artist: cleanName(artist), title: cleanName(title) };
      }
    }
  }

  // Try "Title by Artist" pattern
  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    return { artist: cleanName(byMatch[2]), title: cleanName(byMatch[1]) };
  }

  // No separator found — use channel as artist, cleaned title as title
  return {
    artist: cleanName(ytChannel) || 'Unknown Artist',
    title: cleanName(cleaned) || ytTitle,
  };
}

function cleanName(s: string): string {
  return s
    .replace(/^["']|["']$/g, '')  // Remove surrounding quotes
    .replace(/\s*\(feat\.?.*?\)/gi, '')  // Remove feat. in parens (keep it simpler)
    .replace(/\s*ft\.?\s+.*/gi, '')  // Remove "ft. ..." at end
    .trim();
}

// ── MusicBrainz search ──

interface MBMatch {
  title: string;
  artist: string;
  album?: string;
  year?: number;
  trackNumber?: number;
  releaseId?: string;
}

async function fetchMB(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function searchMusicBrainz(
  artist: string,
  title: string,
  durationSecs?: number,
): Promise<MBMatch | null> {
  // Search recordings
  const query = `recording:"${encodeURIComponent(title)}" AND artist:"${encodeURIComponent(artist)}"`;
  const data = await fetchMB(`${MB_BASE}/recording/?query=${query}&limit=5&fmt=json`);
  if (!data?.recordings?.length) {
    // Try a looser search without quoting
    const looseQuery = `${encodeURIComponent(title)}+${encodeURIComponent(artist)}`;
    const looseData = await fetchMB(`${MB_BASE}/recording/?query=${looseQuery}&limit=5&fmt=json`);
    if (!looseData?.recordings?.length) return null;
    return pickBestRecording(looseData.recordings, title, artist, durationSecs);
  }
  return pickBestRecording(data.recordings, title, artist, durationSecs);
}

function pickBestRecording(
  recordings: any[],
  queryTitle: string,
  queryArtist: string,
  durationSecs?: number,
): MBMatch | null {
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normTitle = normalise(queryTitle);
  const normArtist = normalise(queryArtist);

  let bestScore = -1;
  let best: MBMatch | null = null;

  for (const rec of recordings) {
    let score = 0;
    const recTitle = normalise(rec.title || '');
    const recArtist = normalise(
      rec['artist-credit']?.map((ac: any) => ac.name || ac.artist?.name).join(' ') || ''
    );

    // Title similarity
    if (recTitle === normTitle) score += 50;
    else if (recTitle.includes(normTitle) || normTitle.includes(recTitle)) score += 30;

    // Artist similarity
    if (recArtist.includes(normArtist) || normArtist.includes(recArtist)) score += 40;

    // Duration match (within 5 seconds)
    if (durationSecs && rec.length) {
      const recDur = rec.length / 1000;
      if (Math.abs(recDur - durationSecs) < 5) score += 20;
      else if (Math.abs(recDur - durationSecs) < 15) score += 10;
    }

    // Prefer recordings with releases
    if (rec.releases?.length) score += 5;

    if (score > bestScore) {
      bestScore = score;
      const release = rec.releases?.[0];
      const artistCredit = rec['artist-credit']?.map((ac: any) => ac.name || ac.artist?.name).join(', ') || queryArtist;

      best = {
        title: rec.title || queryTitle,
        artist: artistCredit,
        album: release?.title,
        year: release?.date ? parseInt(release.date.slice(0, 4), 10) || undefined : undefined,
        trackNumber: release?.['track-count'] ? undefined : undefined, // MusicBrainz doesn't return this in recording search
        releaseId: release?.id,
      };
    }
  }

  // Only return if we had a reasonable match
  return bestScore >= 40 ? best : null;
}

// ── Cover Art Archive ──

async function fetchCoverArt(releaseId: string): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://coverartarchive.org/release/${releaseId}`, {
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return undefined;
    const data = await res.json();
    const front = data.images?.find((img: any) => img.front) || data.images?.[0];
    return front?.thumbnails?.['500'] || front?.thumbnails?.large || front?.image;
  } catch {
    return undefined;
  }
}
