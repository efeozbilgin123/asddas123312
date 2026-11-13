export function parseMusicUrl(rawUrl, customTitle = '') {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Lütfen bir YouTube, Spotify, SoundCloud veya ses bağlantısı girin.' };
  }

  let normalized = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return { ok: false, error: 'Geçerli bir web bağlantısı girin.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Yalnızca HTTP veya HTTPS bağlantıları desteklenir.' };
  }

  const host = parsed.hostname.toLowerCase();
  const cleanTitle = String(customTitle || '').trim().slice(0, 64);

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
      const params = new URLSearchParams({
        autoplay: '1',
        enablejsapi: '1',
        rel: '0'
      });
      if (listId && /^[A-Za-z0-9_-]+$/.test(listId)) {
        params.set('list', listId);
      }
      return {
        ok: true,
        provider: 'youtube',
        kind: 'iframe',
        title: cleanTitle || 'YouTube',
        originalUrl: parsed.toString(),
        embedUrl: `https://www.youtube.com/embed/${videoId}?${params.toString()}`
      };
    }

    if (listId && /^[A-Za-z0-9_-]+$/.test(listId)) {
      return {
        ok: true,
        provider: 'youtube',
        kind: 'iframe',
        title: cleanTitle || 'YouTube Çalma Listesi',
        originalUrl: parsed.toString(),
        embedUrl: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}&autoplay=1&enablejsapi=1`
      };
    }
  }

  // Spotify
  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    const m = parsed.pathname.match(
      /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|playlist|album|episode|show|artist)\/([A-Za-z0-9]+)/
    );
    if (m) {
      return {
        ok: true,
        provider: 'spotify',
        kind: 'iframe',
        title: cleanTitle || 'Spotify',
        originalUrl: parsed.toString(),
        embedUrl: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0`
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
  if (/\.(mp3|ogg|oga|wav|m4a|aac|opus|flac|weba)(\?.*)?$/i.test(parsed.pathname)) {
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
