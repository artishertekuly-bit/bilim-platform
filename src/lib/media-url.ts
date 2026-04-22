function getNormalizedHost(rawUrl?: string | null): string {
  const value = (rawUrl ?? '').trim();
  if (!value) return '';

  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isYouTubeHost(host: string): boolean {
  return (
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  );
}

function extractYouTubeVideoId(url: URL): string {
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    return url.pathname.slice(1).trim();
  }

  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    if (url.pathname === '/watch') {
      return (url.searchParams.get('v') ?? '').trim();
    }

    if (url.pathname.startsWith('/shorts/')) {
      return (url.pathname.split('/')[2] ?? '').trim();
    }

    if (url.pathname.startsWith('/embed/')) {
      return (url.pathname.split('/')[2] ?? '').trim();
    }

    if (url.pathname.startsWith('/live/')) {
      return (url.pathname.split('/')[2] ?? '').trim();
    }
  }

  return '';
}

export function normalizeMediaUrl(rawUrl?: string | null): string {
  const value = (rawUrl ?? '').trim();
  if (!value) return '';

  try {
    const url = new URL(value);
    const list = url.searchParams.get('list');
    const videoId = extractYouTubeVideoId(url);

    if (!videoId) {
      return value;
    }

    return list
      ? `https://www.youtube-nocookie.com/embed/${videoId}?list=${encodeURIComponent(list)}`
      : `https://www.youtube-nocookie.com/embed/${videoId}`;
  } catch {
    return value;
  }
}

export function isYouTubeUrl(rawUrl?: string | null): boolean {
  return isYouTubeHost(getNormalizedHost(rawUrl));
}