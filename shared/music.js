export function buildYouTubeEmbedUrl(videoId, listId = '', origin = '') {
  const params = new URLSearchParams({
    autoplay: '1',
    enablejsapi: '1',
    rel: '0',
    playsinline: '1',
    iv_load_policy: '3',
    modestbranding: '1',
    vq: 'small'
  });
  if (listId && /^[A-Za-z0-9_-]+$/.test(listId)) {
    params.set('list', listId);
  }
  if (origin && /^https?:\/\//i.test(origin)) {
    params.set('origin', origin);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function buildTvEmbedUrl(videoId, origin = '') {
  const params = new URLSearchParams({
    autoplay: '1',
    enablejsapi: '1',
    rel: '0',
    playsinline: '1',
    iv_load_policy: '3',
    modestbranding: '1',
    vq: 'medium'
  });
  if (origin && /^https?:\/\//i.test(origin)) {
    params.set('origin', origin);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function buildAmbianceEmbedUrl(videoId, origin = '') {
  const params = new URLSearchParams({
    autoplay: '1',
    enablejsapi: '1',
    loop: '1',
    playlist: videoId,
    rel: '0',
    playsinline: '1',
    iv_load_policy: '3',
    modestbranding: '1',
    vq: 'small'
  });
  if (origin && /^https?:\/\//i.test(origin)) {
    params.set('origin', origin);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function parseMusicUrl(rawUrl, customTitle = '') {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Lütfen bir Spotify, YouTube, SoundCloud bağlantısı veya şarkı adı girin.' };
  }

  const cleanTitle = String(customTitle || '').trim().slice(0, 64);

  // Explicit Spotify URI (e.g. spotify:track:4cOdK2wGLETKBW3PvgPWqT)
  const spotifyUriMatch = trimmed.match(/^spotify:(track|playlist|album|episode|show|artist):([A-Za-z0-9]+)$/i);
  if (spotifyUriMatch) {
    const type = spotifyUriMatch[1].toLowerCase();
    const id = spotifyUriMatch[2];
    return {
      ok: true,
      provider: 'spotify',
      kind: 'bot',
      needsResolution: true,
      spotifyType: type,
      spotifyId: id,
      title: cleanTitle || 'Spotify',
      originalUrl: `https://open.spotify.com/${type}/${id}`,
      embedUrl: null
    };
  }

  // Plain-text song search query (e.g. "Tarkan - Kuzu Kuzu" or "Sezen Aksu")
  const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (!hasExplicitScheme && (/\s/.test(trimmed) || !trimmed.includes('.'))) {
    return {
      ok: true,
      provider: 'search',
      kind: 'bot',
      needsResolution: true,
      query: trimmed.slice(0, 120),
      title: cleanTitle || trimmed.slice(0, 64),
      originalUrl: '',
      embedUrl: null
    };
  }

  let normalized = trimmed;
  if (!hasExplicitScheme) {
    normalized = `https://${normalized}`;
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return { ok: false, error: 'Geçerli bir bağlantı veya şarkı adı girin.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Yalnızca HTTP veya HTTPS bağlantıları desteklenir.' };
  }

  const host = parsed.hostname.toLowerCase();

  // YouTube / YouTube Music
  if (
    host === 'youtu.be' ||
    host.endsWith('.youtube.com') ||
    host === 'youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    let videoId = '';
    const listId = parsed.searchParams.get('list') || '';
    if (host === 'youtu.be') {
      videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
    } else if (parsed.pathname.startsWith('/watch')) {
      videoId = parsed.searchParams.get('v') || '';
    } else {
      const m = parsed.pathname.match(/^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{6,})/);
      if (m) videoId = m[1];
    }

    if (videoId && /^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
      return {
        ok: true,
        provider: 'youtube',
        kind: 'iframe',
        title: cleanTitle || 'YouTube',
        videoId,
        originalUrl: parsed.toString(),
        embedUrl: buildYouTubeEmbedUrl(videoId, listId)
      };
    }

    if (listId && /^[A-Za-z0-9_-]+$/.test(listId)) {
      return {
        ok: true,
        provider: 'youtube',
        kind: 'iframe',
        title: cleanTitle || 'YouTube Çalma Listesi',
        originalUrl: parsed.toString(),
        embedUrl: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}&autoplay=1&enablejsapi=1&playsinline=1&iv_load_policy=3&vq=small`
      };
    }

    return {
      ok: true,
      provider: 'youtube_channel',
      kind: 'bot',
      needsResolution: true,
      channelUrl: parsed.toString(),
      query: parsed.pathname.replace(/^\/+|\/live$/gi, '').replace(/^@/, ''),
      title: cleanTitle || 'YouTube Canlı',
      originalUrl: parsed.toString(),
      embedUrl: null
    };
  }

  // Spotify (resolved server-side like a Discord music bot, never opens Spotify player)
  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    const m = parsed.pathname.match(
      /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|playlist|album|episode|show|artist)\/([A-Za-z0-9]+)/
    );
    if (m) {
      return {
        ok: true,
        provider: 'spotify',
        kind: 'bot',
        needsResolution: true,
        spotifyType: m[1],
        spotifyId: m[2],
        title: cleanTitle || 'Spotify',
        originalUrl: `https://open.spotify.com/${m[1]}/${m[2]}`,
        embedUrl: null
      };
    }
  }

  // SoundCloud
  if (host === 'soundcloud.com' || host === 'www.soundcloud.com' || host === 'm.soundcloud.com' || host === 'on.soundcloud.com') {
    return {
      ok: true,
      provider: 'soundcloud',
      kind: 'iframe',
      title: cleanTitle || 'SoundCloud',
      originalUrl: parsed.toString(),
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(parsed.toString())}&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false&color=%23f5c842`
    };
  }

  // Direct Audio File / Radio Stream
  if (/\.(mp3|ogg|oga|wav|m4a|aac|opus|flac|weba)$/i.test(parsed.pathname)) {
    return {
      ok: true,
      provider: 'audio',
      kind: 'audio',
      title: cleanTitle || parsed.pathname.split('/').pop() || 'Ses Akışı',
      originalUrl: parsed.toString(),
      embedUrl: parsed.toString()
    };
  }

  // Generic web player URL
  return {
    ok: true,
    provider: 'web',
    kind: 'iframe',
    title: cleanTitle || host.replace(/^www\./, ''),
    originalUrl: parsed.toString(),
    embedUrl: parsed.toString()
  };
}

const MUSIC_SOURCE_LABELS = {
  youtube: 'YouTube',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
  audio: 'Ses Akışı',
  web: 'Web'
};

export function formatMusicPlayerDisplay(music, isPaused = false) {
  if (!music) {
    return {
      titleText: 'Oda Müziği',
      djName: 'Serhat Canikli',
      statusText: 'Serhat Canikli bekliyor'
    };
  }

  const queueTag = music.queueTotal > 1
    ? ` [${(music.queueIndex || 0) + 1}/${music.queueTotal}]`
    : '';
  const titleText = `${music.title || 'Oda Müziği'}${queueTag}`;

  const sourceKey = music.sourceProvider || music.provider;
  const sourceLabel = MUSIC_SOURCE_LABELS[sourceKey] || '';
  const isAutoplay = music.sourceProvider === 'autoplay' || music.updatedBy === 'Serhat Canikli';
  const requester = music.updatedBy && music.updatedBy !== 'Serhat Canikli'
    ? music.updatedBy
    : '';

  const verb = isPaused
    ? 'duraklatıldı'
    : (isAutoplay ? 'otomatik çalıyor' : 'müziği çalıyor');

  const parts = [verb];
  if (sourceLabel) parts.push(sourceLabel);
  if (requester) parts.push(`İsteyen: ${requester}`);

  return {
    titleText,
    djName: 'Serhat Canikli',
    statusText: parts.join(' · ')
  };
}

export function summarizeMusicQueue(queue, currentIndex = 0) {
  if (!Array.isArray(queue) || queue.length === 0) return [];
  return queue.slice(0, 30).map((item, idx) => ({
    index: idx,
    title: item?.title || item?.trackTitle || 'Parça',
    sourceProvider: item?.sourceProvider || item?.provider || '',
    updatedBy: item?.updatedBy || 'Serhat Canikli',
    isCurrent: idx === currentIndex
  }));
}

export const KAHVE_PLAYLISTS = Object.freeze([
  {
    id: 'pop90',
    label: "90'lar Türkçe Pop",
    query: 'Tarkan Şımarık 90lar Türkçe Pop',
    title: "90'lar Türkçe Pop"
  },
  {
    id: 'akustik',
    label: 'Kahvehane Akustik',
    query: 'Barış Manço Dağlar Dağlar akustik',
    title: 'Kahvehane Akustik'
  },
  {
    id: 'oyun',
    label: 'Oyun Havası',
    query: 'Ankara Oyun Havası Misket',
    title: 'Oyun Havası'
  },
  {
    id: 'lofi',
    label: 'Gece Lo-Fi Masa',
    query: 'lofi hip hop beats chill mix',
    title: 'Gece Lo-Fi Masa'
  }
]);




