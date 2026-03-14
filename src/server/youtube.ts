import ytdl from '@distube/ytdl-core';

export interface SearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration: string;
  viewCount: string;
  publishedText: string;
  url: string;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  thumbnail: string;
  channel: string;
  duration: number;
  description: string;
  formats: { quality: string; type: string; hasAudio: boolean; hasVideo: boolean }[];
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Lightweight YouTube search using the Invidious API (public, no key required).
 * Falls back to a second instance if the first fails.
 */
const INVIDIOUS_INSTANCES = [
  'https://vid.puffyan.us',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.privacyredirect.com',
];

async function fetchJSON(url: string, timeout = 10000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function searchYouTube(query: string, maxResults = 20): Promise<SearchResult[]> {
  // Try Invidious instances
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const data = await fetchJSON(
        `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance&page=1`
      );
      if (!Array.isArray(data)) continue;
      return data
        .filter((item: any) => item.type === 'video')
        .slice(0, maxResults)
        .map((item: any) => ({
          videoId: item.videoId,
          title: item.title,
          thumbnail: item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
          channel: item.author || 'Unknown',
          duration: formatDuration(item.lengthSeconds || 0),
          viewCount: String(item.viewCount || ''),
          publishedText: item.publishedText || '',
          url: `https://www.youtube.com/watch?v=${item.videoId}`,
        }));
    } catch {
      continue;
    }
  }

  // Final fallback: scrape ytInitialData from YouTube search page
  try {
    return await scrapeYouTubeSearch(query, maxResults);
  } catch {
    throw new Error('All search methods failed. Please try again later.');
  }
}

async function scrapeYouTubeSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA },
  });
  const html = await res.text();
  const match = html.match(/var ytInitialData = ({.*?});<\/script>/s);
  if (!match) throw new Error('Could not parse YouTube search results');
  const data = JSON.parse(match[1]);
  const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
  
  const results: SearchResult[] = [];
  for (const item of contents) {
    const vr = item.videoRenderer;
    if (!vr) continue;
    results.push({
      videoId: vr.videoId,
      title: vr.title?.runs?.[0]?.text || 'Unknown',
      thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`,
      channel: vr.ownerText?.runs?.[0]?.text || 'Unknown',
      duration: vr.lengthText?.simpleText || '0:00',
      viewCount: vr.viewCountText?.simpleText || '',
      publishedText: vr.publishedTimeText?.simpleText || '',
      url: `https://www.youtube.com/watch?v=${vr.videoId}`,
    });
    if (results.length >= maxResults) break;
  }
  return results;
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const info = await ytdl.getInfo(url);
  return {
    videoId: info.videoDetails.videoId,
    title: info.videoDetails.title,
    thumbnail: info.videoDetails.thumbnails?.pop()?.url || '',
    channel: info.videoDetails.author?.name || 'Unknown',
    duration: parseInt(info.videoDetails.lengthSeconds || '0', 10),
    description: (info.videoDetails.description || '').slice(0, 500),
    formats: info.formats.map((f) => ({
      quality: f.qualityLabel || f.audioBitrate + 'kbps' || 'unknown',
      type: f.mimeType?.split(';')[0] || 'unknown',
      hasAudio: f.hasAudio ?? false,
      hasVideo: f.hasVideo ?? false,
    })),
  };
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
