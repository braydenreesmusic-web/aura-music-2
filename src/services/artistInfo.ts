export interface ArtistInfo {
  bio: string;
  genres: string[];
  activeYears: string;
  notableWorks: string[];
  origin: string;
  imageUrl?: string;
}

const MB_BASE = 'https://musicbrainz.org/ws/2';
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const UA = 'reesr/1.0.0 (local-music-player)';

interface MBArtist {
  id: string;
  name: string;
  type?: string;
  country?: string;
  area?: { name: string };
  'begin-area'?: { name: string };
  'life-span'?: { begin?: string; end?: string; ended?: boolean };
  tags?: { name: string; count: number }[];
}

interface MBRecording {
  title: string;
  'artist-credit'?: { name: string }[];
}

interface MBRelease {
  title: string;
  date?: string;
  'release-group'?: { 'primary-type'?: string };
}

interface MBReleaseGroup {
  title: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'first-release-date'?: string;
}

interface MBRelation {
  type: string;
  url?: { resource: string };
}

async function mbFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${MB_BASE}${path}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface WikiSearchResult {
  query?: {
    search?: Array<{ title: string }>;
  };
}

interface WikiPageResponse {
  query?: {
    pages?: Record<string, {
      extract?: string;
      thumbnail?: { source?: string };
      original?: { source?: string };
    }>;
  };
}

async function fetchWikipediaSearchTitles(query: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: '5',
      format: 'json',
      origin: '*',
    });
    const res = await fetch(`${WIKI_API}?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as WikiSearchResult;
    return (data.query?.search || []).map((item) => item.title).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchWikipediaPageData(title: string): Promise<{ bio: string | null; imageUrl?: string }> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'extracts|pageimages|pageprops',
      exintro: '1',
      explaintext: '1',
      redirects: '1',
      piprop: 'thumbnail|original',
      pithumbsize: '800',
      titles: title,
      format: 'json',
      origin: '*',
    });
    const res = await fetch(`${WIKI_API}?${params.toString()}`);
    if (!res.ok) return { bio: null };
    const data = (await res.json()) as WikiPageResponse;
    const pages = Object.values(data.query?.pages || {});
    const page = pages[0];
    return {
      bio: page?.extract || null,
      imageUrl: page?.original?.source || page?.thumbnail?.source,
    };
  } catch {
    return { bio: null };
  }
}

function formatActiveYears(lifeSpan?: MBArtist['life-span']): string {
  if (!lifeSpan?.begin) return 'Unknown';
  const start = lifeSpan.begin.slice(0, 4);
  if (lifeSpan.ended && lifeSpan.end) {
    return `${start}–${lifeSpan.end.slice(0, 4)}`;
  }
  return `${start}–present`;
}

export async function fetchArtistInfo(artistName: string): Promise<ArtistInfo | null> {
  if (!artistName || artistName === 'Unknown Artist') return null;

  try {
    // 1. Search MusicBrainz for artist
    const searchData = await mbFetch<{ artists: MBArtist[] }>(
      `/artist/?query=artist:${encodeURIComponent(artistName)}&limit=1&fmt=json`
    );
    if (!searchData?.artists?.length) return null;

    const artist = searchData.artists[0];
    const mbid = artist.id;

    // 2. Get artist details with relations (for Wikipedia link) and tags
    const detailData = await mbFetch<MBArtist & { relations?: MBRelation[] }>(
      `/artist/${mbid}?inc=tags+url-rels&fmt=json`
    );

    // 3. Get release groups for cleaner notable works
    const releaseGroupsData = await mbFetch<{ 'release-groups': MBReleaseGroup[] }>(
      `/release-group/?artist=${mbid}&limit=12&fmt=json`
    );

    // Extract genres/tags
    const tags = (detailData?.tags || artist.tags || [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map((t) => t.name.replace(/\b\w/g, (c) => c.toUpperCase()));

    // Extract origin
    const beginArea = detailData?.['begin-area']?.name || artist['begin-area']?.name;
    const country = detailData?.area?.name || artist.area?.name || artist.country;
    const origin = beginArea && country && beginArea !== country
      ? `${beginArea}, ${country}`
      : beginArea || country || 'Unknown';

    const notableWorks = (releaseGroupsData?.['release-groups'] || [])
      .filter((group) => {
        const primaryType = group['primary-type'];
        const secondaryTypes = group['secondary-types'] || [];
        return (primaryType === 'Album' || primaryType === 'EP') &&
          !secondaryTypes.includes('Compilation') &&
          !secondaryTypes.includes('Live') &&
          !secondaryTypes.includes('Remix');
      })
      .sort((left, right) => {
        const leftDate = left['first-release-date'] || '';
        const rightDate = right['first-release-date'] || '';
        return leftDate.localeCompare(rightDate);
      })
      .map((group) => group.title)
      .filter(Boolean)
      .slice(0, 5);

    // Active years
    const activeYears = formatActiveYears(detailData?.['life-span'] || artist['life-span']);

    // 5. Try to get Wikipedia bio via URL relations
    let bio: string | null = null;
    let imageUrl: string | undefined;
    const wikiRel = detailData?.relations?.find(
      (r) => r.type === 'wikipedia' && r.url?.resource
    );
    const wikiCandidates: string[] = [];
    if (wikiRel?.url?.resource) {
      const wikiTitle = decodeURIComponent(
        wikiRel.url.resource.split('/wiki/').pop() || ''
      );
      if (wikiTitle) {
        wikiCandidates.push(wikiTitle);
      }
    }

    const searchTitles = await fetchWikipediaSearchTitles(`intitle:${artistName} musician`);
    wikiCandidates.push(...searchTitles);
    wikiCandidates.push(`${artistName} (musician)`, artistName);

    for (const title of [...new Set(wikiCandidates)]) {
      const summary = await fetchWikipediaPageData(title);
      if (!bio && summary.bio) {
        bio = summary.bio;
      }
      if (!imageUrl && summary.imageUrl) {
        imageUrl = summary.imageUrl;
      }
      if (bio && imageUrl) break;
    }

    return {
      bio: bio || `${artist.name} is a${artist.type === 'Group' ? ' musical group' : 'n artist'} from ${origin}.`,
      genres: tags.length > 0 ? tags : ['Unknown'],
      activeYears,
      notableWorks,
      origin,
      imageUrl,
    };
  } catch (error) {
    console.error('Failed to fetch artist info:', error);
    return null;
  }
}
