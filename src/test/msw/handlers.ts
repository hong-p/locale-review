import { HttpResponse, http } from "msw";
import type { RequestHandler } from "msw";

export const GITHUB_API_ORIGIN = "https://api.github.com";

/**
 * Default handlers applied to every test run.
 *
 * Only requests the app makes on its own belong here. Everything a specific
 * feature needs is registered per test with `server.use(...)`, so the shared
 * baseline stays small and a missing handler still fails loudly.
 */
export const handlers: RequestHandler[] = [
  // Once a token exists the app resolves who it belongs to, without waiting for
  // the Test connection button, because the review flow needs the login to find
  // this user's pending review (plan.md 4.9). A test that overrides this to
  // assert on connection failures can still do so with server.use.
  http.get(`${GITHUB_API_ORIGIN}/user`, () =>
    HttpResponse.json({ login: "translator", avatar_url: null, html_url: null }),
  ),

  // The review surface always asks for the conversation and the Viewed state,
  // so an empty answer is the baseline rather than something each test repeats.
  http.get(`${GITHUB_API_ORIGIN}/repos/:owner/:repo/pulls/:number/comments`, () =>
    HttpResponse.json([]),
  ),
  http.get(`${GITHUB_API_ORIGIN}/repos/:owner/:repo/issues/:number/comments`, () =>
    HttpResponse.json([]),
  ),
  // Submitted review bodies are part of the conversation the surface reads
  // (plan.md 4.8), so an empty list is the baseline here too.
  http.get(`${GITHUB_API_ORIGIN}/repos/:owner/:repo/pulls/:number/reviews`, () =>
    HttpResponse.json([]),
  ),
  http.post(`${GITHUB_API_ORIGIN}/graphql`, () =>
    HttpResponse.json({
      data: {
        repository: {
          pullRequest: {
            id: "PR_node",
            files: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
          },
        },
      },
    }),
  ),
];
