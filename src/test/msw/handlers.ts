import type { RequestHandler } from "msw";

export const GITHUB_API_ORIGIN = "https://api.github.com";

/**
 * Default handlers applied to every test run. Phase 2 onwards appends the
 * GitHub REST and GraphQL handlers each feature needs; tests that require a
 * one-off response should call `server.use(...)` instead of adding to this
 * list, so the shared baseline stays small.
 */
export const handlers: RequestHandler[] = [];
