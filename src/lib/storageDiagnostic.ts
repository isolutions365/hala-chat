/**
 * Diagnostic utility for inspecting Firebase Storage URLs, paths, tokens, and fetch status.
 */
export async function diagnoseStorageUrl(url: string): Promise<{
  path: string;
  bucket: string;
  token: string;
  reachable: boolean;
  status?: number;
  error?: string;
}> {
  try {
    if (!url || !url.startsWith('http')) {
      return { path: '', bucket: '', token: '', reachable: false, error: 'Invalid URL format' };
    }

    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split('/o/');
    const bucket = parsed.pathname.includes('/v0/b/') ? parsed.pathname.split('/v0/b/')[1]?.split('/')[0] || '' : '';
    const encodedPath = pathSegments[1] || '';
    const path = decodeURIComponent(encodedPath.split('?')[0]);
    const token = parsed.searchParams.get('token') || '';

    console.log('[Storage Diagnostic]:', {
      url: url.slice(0, 60) + '...',
      bucket,
      path,
      hasToken: Boolean(token),
    });

    try {
      const res = await fetch(url, { method: 'HEAD', mode: 'cors' });
      return {
        path,
        bucket,
        token,
        reachable: res.ok,
        status: res.status,
      };
    } catch (fetchErr: any) {
      console.warn('[Storage Diagnostic Fetch Error]:', fetchErr?.message || fetchErr);
      return {
        path,
        bucket,
        token,
        reachable: false,
        error: fetchErr?.message || 'Network fetch failed',
      };
    }
  } catch (err: any) {
    return { path: '', bucket: '', token: '', reachable: false, error: err?.message || 'Parse error' };
  }
}
