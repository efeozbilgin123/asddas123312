import { buildTvEmbedUrl, buildYouTubeEmbedUrl, parseMusicUrl } from '../shared/music.js';
import { TV_CHANNELS } from '../shared/presets.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const MAX_PLAYLIST_TRACKS = 25;

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
}

function extractBalancedJson(source, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let began = false;

  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
      began = true;
    } else if (ch === '}') {
      depth -= 1;
      if (began && depth === 0) {
        return source.slice(startIndex, i + 1);
      }
    }
  }
  return null;
}

function normalizeTrackEntry(title, artist = '') {
  const cleanTitle = decodeHtmlEntities(String(title || '').trim()).replace(/\s+/g, ' ');
  const cleanArtist = decodeHtmlEntities(String(artist || '').trim())
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ');
  if (!cleanTitle) return null;
  const query = cleanArtist ? `${cleanArtist} - ${cleanTitle}` : cleanTitle;
  return {
    title: cleanTitle,
    artist: cleanArtist,
    query
  };
}

export function extractSpotifyTracksFromHtml(html, spotifyType = 'track') {
  if (!html || typeof html !== 'string') return [];
  const tracks = [];

  // 1. Spotify embed HTML carries complete track/playlist metadata inside __NEXT_DATA__
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      const entity = json?.props?.pageProps?.state?.data?.entity;
      if (entity && typeof entity === 'object') {
        if (Array.isArray(entity.trackList) && entity.trackList.length > 0) {
          for (const item of entity.trackList.slice(0, MAX_PLAYLIST_TRACKS)) {
            const entry = normalizeTrackEntry(item?.title || item?.name, item?.subtitle || '');
            if (entry) tracks.push(entry);
          }
          if (tracks.length > 0) return tracks;
        }

        const singleName = entity.name || entity.title || '';
        const artistNames = Array.isArray(entity.artists)
          ? entity.artists.map((a) => a?.name).filter(Boolean).join(', ')
          : (entity.subtitle || '');
        const entry = normalizeTrackEntry(singleName, artistNames);
        if (entry) return [entry];
      }
    } catch {
      // Fallback to meta tags below
    }
  }

  // 2. Fallback to OpenGraph / meta / <title>
  const ogTitleMatch =
    html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const ogDescMatch =
    html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
  const musicianMatch =
    html.match(/<meta[^>]*name=["']music:musician_description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']music:musician_description["']/i);
  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  if (ogTitleMatch) {
    const rawTitle = decodeHtmlEntities(ogTitleMatch[1]).replace(/\s*\|\s*Spotify\s*$/i, '').trim();
    let artist = musicianMatch ? decodeHtmlEntities(musicianMatch[1]).trim() : '';
    if (!artist && ogDescMatch) {
      const desc = decodeHtmlEntities(ogDescMatch[1]);
      // e.g. "Artist · Song · 2020" or "Artist · Album · 2020"
      const parts = desc.split('·').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0 && !/listen to/i.test(parts[0])) {
        artist = parts[0];
      }
    }
    const entry = normalizeTrackEntry(rawTitle, artist);
    if (entry && !/^spotify$/i.test(entry.title)) {
      return [entry];
    }
  }

  if (titleTagMatch) {
    const raw = decodeHtmlEntities(titleTagMatch[1]).replace(/\s*\|\s*Spotify\s*$/i, '').trim();
    const byMatch = raw.match(/^(.*?)\s+-\s+(?:song(?: and lyrics)?|single|album|playlist|episode)\s+by\s+(.*?)$/i);
    if (byMatch) {
      const entry = normalizeTrackEntry(byMatch[1], byMatch[2]);
      if (entry) return [entry];
    }
    if (raw && !/^spotify$/i.test(raw) && spotifyType === 'track') {
      const entry = normalizeTrackEntry(raw, '');
      if (entry) return [entry];
    }
  }

  return [];
}

function parseDurationSeconds(label) {
  const parts = String(label || '').trim().split(':').map((n) => Number(n));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function pushYouTubeRenderer(vr, sourceType, out, seenIds) {
  if (!vr || typeof vr !== 'object') return;
  const videoId = typeof vr.videoId === 'string' ? vr.videoId : '';
  if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId) || seenIds.has(videoId)) return;
  seenIds.add(videoId);

  const titleRuns = vr.title?.runs?.map((r) => r.text).join('') || vr.title?.simpleText || '';
  const channelRuns =
    vr.ownerText?.runs?.map((r) => r.text).join('') ||
    vr.longBylineText?.runs?.map((r) => r.text).join('') ||
    vr.shortBylineText?.runs?.map((r) => r.text).join('') ||
    '';
  const durationLabel = vr.lengthText?.simpleText || vr.lengthText?.runs?.map((r) => r.text).join('') || '';
  out.push({
    videoId,
    sourceType,
    title: titleRuns.trim(),
    channel: channelRuns.trim(),
    durationLabel,
    durationSeconds: parseDurationSeconds(durationLabel)
  });
}

function collectYouTubeVideoRenderers(node, out = [], seenIds = new Set()) {
  if (!node || typeof node !== 'object' || out.length >= 30) return out;
  if (Array.isArray(node)) {
    for (const item of node) {
      collectYouTubeVideoRenderers(item, out, seenIds);
      if (out.length >= 30) break;
    }
    return out;
  }

  if (node.videoRenderer) {
    pushYouTubeRenderer(node.videoRenderer, 'search', out, seenIds);
  }
  if (node.playlistPanelVideoRenderer) {
    pushYouTubeRenderer(node.playlistPanelVideoRenderer, 'mix', out, seenIds);
  }
  if (node.compactVideoRenderer) {
    pushYouTubeRenderer(node.compactVideoRenderer, 'related', out, seenIds);
  }

  for (const key of Object.keys(node)) {
    collectYouTubeVideoRenderers(node[key], out, seenIds);
    if (out.length >= 30) break;
  }
  return out;
}

function parseYtInitialDataFromHtml(html) {
  const markerMatch = html.match(/(?:var\s+)?ytInitialData\s*=\s*\{/);
  if (!markerMatch) return null;
  const braceStart = markerMatch.index + markerMatch[0].length - 1;
  const rawJson = extractBalancedJson(html, braceStart);
  if (!rawJson) return null;
  try {
    return JSON.parse(rawJson);
  } catch {
    return null;
  }
}

export function extractYouTubeCandidatesFromHtml(html, query = '') {
  if (!html || typeof html !== 'string') return [];

  const data = parseYtInitialDataFromHtml(html);

  if (!data) {
    // Minimal regex fallback if ytInitialData formatting changes
    const matches = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)];
    const unique = [];
    const seen = new Set();
    for (const m of matches) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        unique.push({ videoId: m[1], title: query, channel: '', durationLabel: '', durationSeconds: null });
      }
      if (unique.length >= 5) break;
    }
    return unique;
  }

  const candidates = collectYouTubeVideoRenderers(data);
  const qLower = String(query || '').toLowerCase();
  const qTokens = qLower
    .split(/[^a-z0-9çğıöşü]+/i)
    .filter((t) => t.length >= 3);

  const wantsRemix = /\b(remix|cover|karaoke|slowed|sped|live|konser|akustik|acoustic)\b/i.test(qLower);
  const wantsLongOrLive = /\b(mix|hour|saat|playlist|set|canlı|canli|live|yayın|yayin|tv|film|sinema|4k|şömine|somine)\b/i.test(
    qLower
  );

  return candidates
    .map((c, idx) => {
      const tLower = c.title.toLowerCase();
      const chLower = c.channel.toLowerCase();
      let score = Math.max(0, 20 - idx * 2);

      // YouTube Auto-generated Topic channels are virtually always embeddable clean studio audio
      if (chLower.endsWith('- topic') || chLower.includes('topic')) score += 45;
      if (/\b(official audio|provided to youtube|audio)\b/i.test(tLower)) score += 22;
      if (/\b(lyrics|lyric video|sözleri)\b/i.test(tLower)) score += 12;
      if (wantsLongOrLive && c.durationSeconds == null) score += 28;
      if (wantsLongOrLive && /\b(canlı|canli|live|yayın|yayin)\b/i.test(tLower)) score += 18;

      for (const tok of qTokens) {
        if (tLower.includes(tok) || chLower.includes(tok)) score += 6;
      }

      if (!wantsRemix && /\b(cover|karaoke|reaction|tepki|parodi|slowed|sped up|nightcore|8d)\b/i.test(tLower)) {
        score -= 40;
      }
      if (c.durationSeconds != null) {
        if (c.durationSeconds < 45) score -= 45;
        if (!wantsLongOrLive && c.durationSeconds > 900) score -= 35;
      }

      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function extractYouTubeRelatedFromHtml(html, excludeVideoIds = []) {
  if (!html || typeof html !== 'string') return [];
  const excluded = new Set(excludeVideoIds.filter(Boolean));
  const data = parseYtInitialDataFromHtml(html);
  if (!data) return [];

  const all = collectYouTubeVideoRenderers(data).filter((c) => !excluded.has(c.videoId));
  return all
    .map((c, idx) => {
      const tLower = c.title.toLowerCase();
      const chLower = c.channel.toLowerCase();
      let score = c.sourceType === 'mix' ? 30 : 14;
      score += Math.max(0, 12 - idx);
      if (chLower.endsWith('- topic') || chLower.includes('topic')) score += 35;
      if (/\b(official audio|audio|lyrics|sözleri)\b/i.test(tLower)) score += 15;
      if (/\b(reaction|tepki|karaoke|parodi|interview|röportaj)\b/i.test(tLower)) score -= 45;
      if (c.durationSeconds != null) {
        if (c.durationSeconds < 45) score -= 45;
        if (c.durationSeconds > 900) score -= 40;
      }
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
}

async function fetchTextWithTimeout(url, fetchImpl, timeoutMs = 8000) {
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    },
    signal
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
}

export async function fetchSpotifyTracks(spotifyType, spotifyId, originalUrl, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') return [];

  // 1. Try Spotify embed endpoint (contains full tracklist JSON in __NEXT_DATA__)
  try {
    const embedHtml = await fetchTextWithTimeout(
      `https://open.spotify.com/embed/${spotifyType}/${spotifyId}`,
      fetchImpl
    );
    const tracks = extractSpotifyTracksFromHtml(embedHtml, spotifyType);
    if (tracks.length > 0) return tracks;
  } catch {
    // Continue to fallback endpoints
  }

  // 2. Try standard open.spotify.com page HTML
  try {
    const pageHtml = await fetchTextWithTimeout(
      `https://open.spotify.com/${spotifyType}/${spotifyId}`,
      fetchImpl
    );
    const tracks = extractSpotifyTracksFromHtml(pageHtml, spotifyType);
    if (tracks.length > 0) return tracks;
  } catch {
    // Continue to oEmbed fallback
  }

  // 3. Try Spotify public oEmbed API
  try {
    const oembedText = await fetchTextWithTimeout(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(originalUrl)}`,
      fetchImpl
    );
    const oembed = JSON.parse(oembedText);
    const entry = normalizeTrackEntry(oembed?.title || '', '');
    if (entry) return [entry];
  } catch {
    // All metadata attempts failed
  }

  return [];
}

export async function searchYouTubeAudio(query, { fetchImpl = globalThis.fetch, limit = 3 } = {}) {
  if (!query || typeof fetchImpl !== 'function') return null;

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
    const html = await fetchTextWithTimeout(url, fetchImpl);
    const ranked = extractYouTubeCandidatesFromHtml(html, query);
    if (ranked.length === 0) return null;

    const top = ranked.slice(0, Math.max(1, limit));
    return {
      videoIds: top.map((c) => c.videoId),
      matchedTitle: top[0].title || query,
      channel: top[0].channel || '',
      durationLabel: top[0].durationLabel || ''
    };
  } catch {
    return null;
  }
}

export async function resolveQueuedTrack(queuedItem, { fetchImpl = globalThis.fetch } = {}) {
  if (!queuedItem) return null;
  if (queuedItem.embedUrl && queuedItem.resolved !== false) {
    return queuedItem;
  }

  const yt = await searchYouTubeAudio(queuedItem.query || queuedItem.title, { fetchImpl });
  if (!yt || yt.videoIds.length === 0) return null;

  return {
    ok: true,
    provider: 'youtube',
    sourceProvider: queuedItem.sourceProvider || 'spotify',
    kind: 'bot',
    title: queuedItem.title || yt.matchedTitle,
    trackTitle: queuedItem.trackTitle || queuedItem.title || yt.matchedTitle,
    artist: queuedItem.artist || '',
    originalUrl: queuedItem.originalUrl || `https://www.youtube.com/watch?v=${yt.videoIds[0]}`,
    videoId: yt.videoIds[0],
    fallbackVideoIds: yt.videoIds.slice(1),
    embedUrl: buildYouTubeEmbedUrl(yt.videoIds[0]),
    resolved: true
  };
}

export async function resolveMusicInput(rawInput, customTitle = '', { fetchImpl = globalThis.fetch } = {}) {
  const parsed = parseMusicUrl(rawInput, customTitle);
  if (!parsed.ok) return parsed;

  if (!parsed.needsResolution) {
    return {
      ok: true,
      track: parsed,
      queue: [parsed]
    };
  }

  const cleanTitle = String(customTitle || '').trim().slice(0, 64);

  if (parsed.provider === 'spotify') {
    const tracks = await fetchSpotifyTracks(
      parsed.spotifyType,
      parsed.spotifyId,
      parsed.originalUrl,
      { fetchImpl }
    );

    if (tracks.length === 0) {
      return {
        ok: false,
        error: 'Spotify parçası çözümlenemedi. Bağlantıyı kontrol edin veya şarkı adını doğrudan yazarak çalın.'
      };
    }

    // Resolve first playable track immediately so playback begins without waiting for entire playlist
    let firstResolved = null;
    let firstIdx = 0;
    for (let i = 0; i < Math.min(tracks.length, 3); i += 1) {
      const candidate = await searchYouTubeAudio(tracks[i].query, { fetchImpl });
      if (candidate && candidate.videoIds.length > 0) {
        firstIdx = i;
        firstResolved = candidate;
        break;
      }
    }

    if (!firstResolved) {
      return {
        ok: false,
        error: `"${tracks[0].query}" için uygun ses kaynağı bulunamadı.`
      };
    }

    const queue = tracks.map((t, idx) => {
      const displayTitle = idx === firstIdx && cleanTitle ? cleanTitle : t.query;
      if (idx === firstIdx) {
        return {
          ok: true,
          provider: 'youtube',
          sourceProvider: 'spotify',
          kind: 'bot',
          title: displayTitle,
          trackTitle: t.title,
          artist: t.artist,
          spotifyType: parsed.spotifyType,
          originalUrl: parsed.originalUrl,
          videoId: firstResolved.videoIds[0],
          fallbackVideoIds: firstResolved.videoIds.slice(1),
          embedUrl: buildYouTubeEmbedUrl(firstResolved.videoIds[0]),
          resolved: true
        };
      }
      return {
        ok: true,
        provider: 'youtube',
        sourceProvider: 'spotify',
        kind: 'bot',
        title: displayTitle,
        trackTitle: t.title,
        artist: t.artist,
        spotifyType: parsed.spotifyType,
        query: t.query,
        originalUrl: parsed.originalUrl,
        embedUrl: null,
        resolved: false
      };
    });

    // Drop any skipped leading unresolvable entries so queueIndex 0 is playable
    const trimmedQueue = queue.slice(firstIdx);
    const activeTrack = {
      ...trimmedQueue[0],
      queueIndex: 0,
      queueTotal: trimmedQueue.length,
      hasNext: trimmedQueue.length > 1
    };

    return {
      ok: true,
      track: activeTrack,
      queue: trimmedQueue
    };
  }

  // Direct text song search (Serhat Canikli bot mode)
  const yt = await searchYouTubeAudio(parsed.query, { fetchImpl });
  if (!yt || yt.videoIds.length === 0) {
    return {
      ok: false,
      error: `"${parsed.query}" araması için parça bulunamadı.`
    };
  }

  const track = {
    ok: true,
    provider: 'youtube',
    sourceProvider: 'search',
    kind: 'bot',
    title: cleanTitle || yt.matchedTitle || parsed.query,
    trackTitle: yt.matchedTitle || parsed.query,
    artist: yt.channel || '',
    originalUrl: `https://www.youtube.com/watch?v=${yt.videoIds[0]}`,
    videoId: yt.videoIds[0],
    fallbackVideoIds: yt.videoIds.slice(1),
    embedUrl: buildYouTubeEmbedUrl(yt.videoIds[0]),
    queueIndex: 0,
    queueTotal: 1,
    hasNext: false,
    resolved: true
  };

  return {
    ok: true,
    track,
    queue: [track]
  };
}

export async function findAutoplayTrack(seedTrack, { excludeVideoIds = [], fetchImpl = globalThis.fetch } = {}) {
  if (!seedTrack || typeof fetchImpl !== 'function') return null;
  const excluded = new Set([...(excludeVideoIds || []), seedTrack.videoId].filter(Boolean));
  let candidates = [];

  // 1. Prefer YouTube Mix / Radio playlist (list=RD<videoId>) & related tracks from the current video
  if (seedTrack.videoId && /^[A-Za-z0-9_-]{6,}$/.test(seedTrack.videoId)) {
    try {
      const watchUrl = `https://www.youtube.com/watch?v=${seedTrack.videoId}&list=RD${seedTrack.videoId}&hl=en`;
      const html = await fetchTextWithTimeout(watchUrl, fetchImpl);
      candidates = extractYouTubeRelatedFromHtml(html, [...excluded]);
    } catch {
      candidates = [];
    }
  }

  // 2. Fallback to YouTube search based on artist or track title
  if (candidates.length === 0) {
    const querySeed = seedTrack.artist
      ? `${seedTrack.artist} mix`
      : (seedTrack.trackTitle || seedTrack.title || '');
    if (querySeed) {
      try {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(querySeed)}&hl=en`;
        const html = await fetchTextWithTimeout(searchUrl, fetchImpl);
        candidates = extractYouTubeCandidatesFromHtml(html, querySeed).filter(
          (c) => !excluded.has(c.videoId)
        );
      } catch {
        candidates = [];
      }
    }
  }

  if (candidates.length === 0) return null;

  const chosen = candidates[0];
  const fallbackIds = candidates.slice(1, 4).map((c) => c.videoId);
  const cleanChannel = String(chosen.channel || '').replace(/\s*-\s*Topic$/i, '').trim();

  return {
    ok: true,
    provider: 'youtube',
    sourceProvider: 'autoplay',
    kind: 'bot',
    autoplay: true,
    title: chosen.title || seedTrack.title || 'Otomatik Çalma',
    trackTitle: chosen.title || seedTrack.title || 'Otomatik Çalma',
    artist: cleanChannel,
    originalUrl: `https://www.youtube.com/watch?v=${chosen.videoId}`,
    videoId: chosen.videoId,
    fallbackVideoIds: fallbackIds,
    embedUrl: buildYouTubeEmbedUrl(chosen.videoId),
    resolved: true
  };
}

export async function resolveTvInput(rawInput, customTitle = '', { channelId = '', fetchImpl = globalThis.fetch } = {}) {
  const cleanChannelId = String(channelId || '').trim();
  const preset = cleanChannelId ? TV_CHANNELS.find((c) => c.id === cleanChannelId) : null;

  const queryInput = preset ? preset.query : String(rawInput || '').trim();
  const displayTitle = String(customTitle || '').trim() || preset?.title || '';

  if (!queryInput) {
    return { ok: false, error: 'Lütfen bir kanal seçin veya video bağlantısı / arama girin.' };
  }

  const parsed = parseMusicUrl(queryInput, displayTitle);
  if (!parsed.ok) return parsed;

  if (parsed.provider === 'youtube' && parsed.videoId) {
    return {
      ok: true,
      tv: {
        channelId: preset?.id || null,
        provider: 'youtube',
        kind: 'iframe',
        title: displayTitle || parsed.title || 'TV Kanalı',
        videoId: parsed.videoId,
        fallbackVideoIds: [],
        originalUrl: parsed.originalUrl || `https://www.youtube.com/watch?v=${parsed.videoId}`,
        embedUrl: buildTvEmbedUrl(parsed.videoId),
        isLive: Boolean(preset)
      }
    };
  }

  if (parsed.provider === 'youtube_channel' && typeof fetchImpl === 'function') {
    let videoId = '';
    try {
      const html = await fetchTextWithTimeout(parsed.channelUrl, fetchImpl);
      const canonMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/i);
      if (canonMatch) {
        videoId = canonMatch[1];
      } else {
        const liveMatch = html.match(/"videoId":"([A-Za-z0-9_-]{11})"[^}]{0,300}"isLive":true/i);
        if (liveMatch) {
          videoId = liveMatch[1];
        } else {
          const anyMatch = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
          if (anyMatch) videoId = anyMatch[1];
        }
      }
    } catch {
      videoId = '';
    }

    if (videoId) {
      return {
        ok: true,
        tv: {
          channelId: preset?.id || null,
          provider: 'youtube',
          kind: 'iframe',
          title: displayTitle || parsed.title || 'Canlı Yayın',
          videoId,
          fallbackVideoIds: [],
          originalUrl: `https://www.youtube.com/watch?v=${videoId}`,
          embedUrl: buildTvEmbedUrl(videoId),
          isLive: true
        }
      };
    }

    const fallbackSearch = `${parsed.query || displayTitle || 'canlı tv'} canlı yayın`;
    const yt = await searchYouTubeAudio(fallbackSearch, { fetchImpl });
    if (yt && yt.videoIds.length > 0) {
      return {
        ok: true,
        tv: {
          channelId: preset?.id || null,
          provider: 'youtube',
          kind: 'iframe',
          title: displayTitle || yt.matchedTitle || 'Canlı Yayın',
          videoId: yt.videoIds[0],
          fallbackVideoIds: yt.videoIds.slice(1),
          originalUrl: `https://www.youtube.com/watch?v=${yt.videoIds[0]}`,
          embedUrl: buildTvEmbedUrl(yt.videoIds[0]),
          isLive: true
        }
      };
    }
    return { ok: false, error: 'YouTube kanalı canlı yayını bulunamadı.' };
  }

  if (parsed.provider === 'search' || parsed.provider === 'spotify') {
    const searchQuery = parsed.query || parsed.title;
    const yt = await searchYouTubeAudio(searchQuery, { fetchImpl });
    if (!yt || yt.videoIds.length === 0) {
      return { ok: false, error: `"${searchQuery}" için TV yayını bulunamadı.` };
    }
    return {
      ok: true,
      tv: {
        channelId: preset?.id || null,
        provider: 'youtube',
        kind: 'iframe',
        title: displayTitle || yt.matchedTitle || searchQuery,
        videoId: yt.videoIds[0],
        fallbackVideoIds: yt.videoIds.slice(1),
        originalUrl: `https://www.youtube.com/watch?v=${yt.videoIds[0]}`,
        embedUrl: buildTvEmbedUrl(yt.videoIds[0]),
        isLive: Boolean(preset)
      }
    };
  }

  if (parsed.embedUrl) {
    return {
      ok: true,
      tv: {
        channelId: preset?.id || null,
        provider: parsed.provider,
        kind: parsed.kind || 'iframe',
        title: displayTitle || parsed.title || 'TV Yayını',
        videoId: null,
        fallbackVideoIds: [],
        originalUrl: parsed.originalUrl,
        embedUrl: parsed.embedUrl,
        isLive: Boolean(preset)
      }
    };
  }

  return { ok: false, error: 'Bu yayın bağlantısı TV oynatıcıda desteklenmiyor.' };
}


