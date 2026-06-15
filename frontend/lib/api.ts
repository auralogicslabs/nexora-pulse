declare const NexoraPulse: {
  apiUrl: string;
  nonce: string;
  adminUrl: string;
  siteUrl: string;
  pluginUrl: string;
  version: string;
  user: { id: number; name: string; email: string };
  license: string;
  proFeatures: string[];
};

class ApiClient {
  private get baseUrl(): string {
    return (window as any).NexoraPulse?.apiUrl ?? '/wp-json/nexora-pulse/v1/';
  }

  private get nonce(): string {
    return (window as any).NexoraPulse?.nonce ?? '';
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let url = this.baseUrl + path.replace(/^\//, '');

    const method = (options.method ?? 'GET').toUpperCase();

    // GET responses (connection status, scan progress, settings) must never be
    // served from a stale cache — page caches like LiteSpeed/Cloudflare and the
    // browser's own HTTP cache otherwise make a just-connected integration still
    // read as "Not connected". Append a unique param and force no-store so every
    // read hits the live server. POSTs are never cached, so leave them alone.
    if (method === 'GET') {
      url += (url.includes('?') ? '&' : '?') + '_=' + Date.now();
    }

    const response = await fetch(url, {
      cache: method === 'GET' ? 'no-store' : 'default',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': this.nonce,
        ...(method === 'GET' ? { 'Cache-Control': 'no-cache' } : {}),
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message ?? `API error ${response.status}`);
    }

    return data?.data ?? data;
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /**
   * Authenticated file download. Fetches with the REST nonce, reads the
   * response as a Blob, and triggers a browser "Save as" using the filename
   * from Content-Disposition (falling back to the supplied default).
   */
  async download(path: string, fallbackName: string): Promise<void> {
    const url = this.baseUrl + path.replace(/^\//, '');
    const response = await fetch(url, { headers: { 'X-WP-Nonce': this.nonce } });

    if (!response.ok) {
      let msg = `Download failed (${response.status})`;
      try { msg = (await response.json())?.message ?? msg; } catch { /* not JSON */ }
      throw new Error(msg);
    }

    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const name = match?.[1] ?? fallbackName;

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

export const api = new ApiClient();

export function wpContext() {
  return (window as any).NexoraPulse ?? {};
}
