/**
 * browser tool entrypoint.
 * - Exposes a minimal, typed interface for browser automation:
 *   status/start/stop/tabs/open/focus/close/snapshot/screenshot/act/navigate.
 * - Validates action parameters and routes to browser subsystem.
 * - Uses Playwright-backed controller where available.
 * - Enforces tool-level timeouts and returns ToolResult with outputs.
 */
