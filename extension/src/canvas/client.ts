const BASE = "https://canvas.ubc.ca/api/v1";

export class CanvasAuthError extends Error {
  constructor(readonly status: number) {
    super(`Canvas auth error ${status}`);
  }
}

export interface CanvasOptions {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

/** Only GET is exposed: there is no method parameter, and fetch is always called with "GET". */
export function createCanvasClient(opts: CanvasOptions = {}) {
  const doFetch = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxRetries = opts.maxRetries ?? 4;

  async function request(url: string): Promise<Response> {
    if (!url.startsWith(BASE + "/")) throw new Error(`Refusing non-Canvas URL: ${url}`);
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(url, { method: "GET", credentials: "include" });
      if (res.status === 401 || res.status === 403) throw new CanvasAuthError(res.status);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) {
        if (!res.ok) throw new Error(`Canvas request failed: ${res.status}`);
        return res;
      }
      if (attempt >= maxRetries) throw new Error(`Canvas request failed: ${res.status}`);
      await sleep(500 * 2 ** attempt);
    }
  }

  /** GET a path such as "/courses?per_page=100" and return all pages concatenated. */
  async function getAll<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = BASE + path;
    while (url) {
      const res: Response = await request(url);
      out.push(...((await res.json()) as T[]));
      url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("Link") ?? "")?.[1] ?? null;
    }
    return out;
  }

  return { getAll };
}
