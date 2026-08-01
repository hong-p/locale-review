import { setupServer } from "msw/node";

import { handlers } from "./handlers";

/**
 * Shared MSW server for unit and component tests. Phase 0 ships it empty on
 * purpose: every later phase adds the GitHub handlers it needs, and any
 * request without a handler fails the test instead of reaching the network.
 */
export const server = setupServer(...handlers);
