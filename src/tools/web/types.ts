export type ExtractMode = 'markdown' | 'text';

export type WebFetchInput = {
  url: string;
  timeoutMs?: number;
  maxChars?: number;
  maxRedirects?: number;
  extractMode?: ExtractMode;
};

export type WebFetchOutput = {
  url: string;
  title?: string;
  content: string;
  length: number;
  truncated: boolean;
  status: number;
  contentType?: string;
};

export type FetchResult = {
  url: string;
  status: number;
  contentType?: string;
  body: string;
};

export type SecurityOptions = {
  allowPrivate?: boolean;
  allowlist?: string[];
  denylist?: string[];
};

export type WebSearchInput = {
  query: string;
  maxResults?: number;
  timeoutMs?: number;
  country?: string;
  searchLang?: string;
};

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
};

export type WebSearchOutput = {
  query: string;
  results: WebSearchResult[];
};
