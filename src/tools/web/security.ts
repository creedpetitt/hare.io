import net from 'net';
import type { SecurityOptions } from './types.js';

export type ValidatedUrl = {
  url: URL;
  normalized: string;
};

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function normalizeList(entries: string[] | undefined): string[] {
  if (!entries) return [];
  return entries.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

function hostMatchesEntry(host: string, entry: string): boolean {
  if (!entry) return false;
  if (entry.startsWith('.')) {
    const suffix = entry.slice(1);
    return host === suffix || host.endsWith(entry);
  }
  return host === entry || host.endsWith(`.${entry}`);
}

function hostMatchesList(host: string, list: string[]): boolean {
  for (const entry of list) {
    if (hostMatchesEntry(host, entry)) return true;
  }
  return false;
}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fe80:')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  return false;
}

function isPrivateHost(host: string): boolean {
  const normalized = normalizeHost(host);
  if (normalized === 'localhost') return true;
  if (normalized.endsWith('.localhost')) return true;
  if (normalized.endsWith('.local')) return true;

  const ipType = net.isIP(normalized);
  if (ipType === 4) return isPrivateIPv4(normalized);
  if (ipType === 6) return isPrivateIPv6(normalized);
  return false;
}

function assertHostAllowed(host: string, options: SecurityOptions) {
  const denylist = normalizeList(options.denylist);
  if (denylist.length > 0 && hostMatchesList(host, denylist)) {
    const err: any = new Error('Host is blocked by denylist.');
    err.code = 'blocked_url';
    throw err;
  }

  const allowlist = normalizeList(options.allowlist);
  if (allowlist.length > 0 && !hostMatchesList(host, allowlist)) {
    const err: any = new Error('Host is not in allowlist.');
    err.code = 'blocked_url';
    throw err;
  }
}

export function validateUrl(input: string, options: SecurityOptions = {}): ValidatedUrl {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    const err: any = new Error('Invalid URL.');
    err.code = 'invalid_url';
    throw err;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    const err: any = new Error('Only http/https URLs are allowed.');
    err.code = 'invalid_url';
    throw err;
  }

  const host = normalizeHost(url.hostname);
  if (!options.allowPrivate && isPrivateHost(host)) {
    const err: any = new Error('Private or loopback addresses are not allowed.');
    err.code = 'blocked_url';
    throw err;
  }

  assertHostAllowed(host, options);

  const normalized = url.toString();
  return { url, normalized };
}

export function validateRedirect(from: string, location: string, options: SecurityOptions = {}) {
  let resolved: URL;
  try {
    resolved = new URL(location, from);
  } catch {
    const err: any = new Error('Invalid redirect URL.');
    err.code = 'invalid_url';
    throw err;
  }

  const result = validateUrl(resolved.toString(), options);
  return result.normalized;
}
