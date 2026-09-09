import { spawn } from 'node:child_process';

export interface OnlineSearchResult {
  sourceId: string;
  title: string;
  artistName: string;
  thumbnailUrl: string | null;
  durationSec: number;
  sourceUrl: string;
}

function parseTitleAndArtist(rawTitle: string, channelName: string): { title: string; artist: string } {
  let title = rawTitle.trim();
  let artist = (channelName || 'Unknown Artist').replace(/ - Topic$/i, '').trim();

  // Strip common suffixes
  title = title
    .replace(/\s*\((Official Video|Official Audio|Lyric Video|Audio|Lyrics|Official Music Video|Music Video)\)\s*$/i, '')
    .replace(/\s*\[(Official Video|Official Audio|Lyric Video|Audio|Lyrics|Official Music Video|Music Video)\]\s*$/i, '')
    .trim();

  // Common pattern: "Artist - Title"
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
  }

  return { title: title || rawTitle, artist: artist || 'Unknown Artist' };
}

export async function search(query: string, limit = 10): Promise<OnlineSearchResult[]> {
  const cleanLimit = Math.max(1, Math.min(limit, 30));
  return new Promise((resolve) => {
    // Use yt-dlp to search YouTube with music context
    const child = spawn('yt-dlp', [
      '--js-runtimes', 'node:node',
      `ytsearch${cleanLimit}:${query}`,
      '--dump-json',
      '--flat-playlist',
      '--no-warnings'
    ]);

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0 && !output) {
        return resolve([]);
      }

      const results: OnlineSearchResult[] = [];
      const lines = output.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (!item.id) continue;

          const channel = item.channel || item.uploader || '';
          const { title, artist } = parseTitleAndArtist(item.title || 'Untitled', channel);

          let thumb: string | null = null;
          if (Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
            thumb = item.thumbnails[item.thumbnails.length - 1].url || null;
          } else if (item.thumbnail) {
            thumb = item.thumbnail;
          }

          results.push({
            sourceId: item.id,
            title,
            artistName: artist,
            thumbnailUrl: thumb,
            durationSec: Math.round(item.duration || 0),
            sourceUrl: `https://www.youtube.com/watch?v=https://www.youtube.com/watch?v=${item.id}`.replace('https://www.youtube.com/watch?v=https://www.youtube.com/watch?v=', 'https://www.youtube.com/watch?v=')
          });
        } catch {
          // ignore parse errors on malformed lines
        }
      }

      resolve(results);
    });

    child.on('error', () => {
      resolve([]);
    });
  });
}

export async function getSimilar(seedTitle: string, seedArtist: string, limit = 5): Promise<OnlineSearchResult[]> {
  const query = `${seedArtist} ${seedTitle} similar music`;
  return search(query, limit);
}
