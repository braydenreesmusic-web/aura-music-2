import { Track } from '../db';

/**
 * Enrich track metadata by intelligently parsing the filename.
 * Handles common patterns like:
 *   "01 - Artist - Title.mp3"
 *   "Artist - Title.mp3"
 *   "01. Title.mp3"
 *   "Title (feat. Artist).mp3"
 */
export async function enrichMetadata(track: Track): Promise<Partial<Track>> {
  const filename = track.file.name;

  // Strip extension
  const name = filename.replace(/\.\w{2,4}$/, '');

  // If metadata already looks good, nothing to do
  const hasGoodTitle = track.title && track.title !== filename && track.title !== name;
  const hasGoodArtist = track.artist && track.artist !== 'Unknown Artist';
  if (hasGoodTitle && hasGoodArtist) return {};

  let title = track.title;
  let artist = track.artist;

  // Strip leading track numbers: "01 - ", "01. ", "1 ", "01 "
  const stripped = name.replace(/^\d{1,3}[\s.\-_]+/, '').trim();

  // Try "Artist - Title" pattern (most common)
  const dashMatch = stripped.match(/^(.+?)\s*[-–—]\s*(.+)$/);

  if (dashMatch) {
    const [, part1, part2] = dashMatch;
    // If current artist is unknown, use part1 as artist
    if (!hasGoodArtist) artist = part1.trim();
    if (!hasGoodTitle) title = part2.trim();
  } else if (!hasGoodTitle) {
    // No dash separator — use the cleaned name as title
    title = stripped;
  }

  // Clean up common artifacts
  if (title) {
    title = title
      .replace(/\s*\(official\s*(music\s*)?video\)/i, '')
      .replace(/\s*\[official\s*(music\s*)?video\]/i, '')
      .replace(/\s*\(lyrics?\)/i, '')
      .replace(/\s*\[lyrics?\]/i, '')
      .replace(/\s*\(audio\)/i, '')
      .replace(/\s*\[audio\]/i, '')
      .replace(/\s*\(HD\)/i, '')
      .replace(/\s*\[HQ\]/i, '')
      .trim();
  }

  if (artist) {
    artist = artist
      .replace(/\s*ft\.?\s*/i, ' feat. ')
      .replace(/\s*feat\.?\s*/i, ' feat. ')
      .trim();
  }

  const updates: Partial<Track> = {};
  if (title && title !== track.title) updates.title = title;
  if (artist && artist !== track.artist && artist !== 'Unknown Artist') updates.artist = artist;

  return updates;
}
