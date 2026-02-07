/**
 * web_fetch tool entrypoint.
 * - Validates URL, blocks private/loopback by default (config override).
 * - Fetches HTML and extracts readable content (markdown/text).
 * - Enforces limits: maxChars, timeout, redirects, cache TTL.
 * - Returns ToolResult with extracted content + metadata (url, title, length).
 * - Delegates to src/tools/web/* helpers for fetch, security, and extraction.
 */
