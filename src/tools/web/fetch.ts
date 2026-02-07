import { validateRedirect, validateUrl } from './security.js';
import type { FetchResult, SecurityOptions } from './types.js';

export type FetchOptions = {
  timeoutMs: number;
  maxRedirects: number;
  maxBytes: number;
  security?: SecurityOptions;
};

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'hare-web-fetch/1.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function createError(code: string, message: string): Error {
  const err: any = new Error(message);
  err.code = code;
  return err;
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > maxBytes) throw createError('too_large', 'Response body exceeded size limit.');
    return text;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body as any) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw createError('too_large', 'Response body exceeded size limit.');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchUrl(inputUrl: string, options: FetchOptions): Promise<FetchResult> {
  const security = options.security ?? {};
  let current = validateUrl(inputUrl, security).normalized;

  for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount += 1) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), options.timeoutMs);

    try {
      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers: DEFAULT_HEADERS,
        signal: abortController.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw createError('fetch_failed', 'Redirect response missing Location header.');
        }
        if (redirectCount >= options.maxRedirects) {
          throw createError('redirect_limit', 'Too many redirects.');
        }
        current = validateRedirect(current, location, security);
        continue;
      }

      const contentType = response.headers.get('content-type') || undefined;
      const body = await readBodyWithLimit(response, options.maxBytes);

      return {
        url: current,
        status: response.status,
        contentType,
        body,
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw createError('timeout', 'Request timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw createError('redirect_limit', 'Too many redirects.');
}
