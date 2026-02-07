/**
 * URL and host validation for web tools.
 * - Blocks private/loopback/localhost by default.
 * - Validates protocol (http/https only).
 * - Provides allowlist/denylist hooks via config.
 * - Normalizes and re-checks redirects.
 */
