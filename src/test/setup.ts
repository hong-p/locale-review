import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./msw/server";

// Fail a test that hits a GitHub endpoint we forgot to mock, rather than
// letting the request fall through to the network.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => server.close());

/**
 * jsdom ships `<dialog>` without `showModal` or `close`.
 *
 * The review form relies on the native element for its focus trap and Esc
 * handling, which is the right choice in a browser; the browser tests cover
 * that behaviour. Here the methods only need to move the `open` attribute so
 * the component's state and the DOM agree.
 */
if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & {
    showModal?: () => void;
    close?: () => void;
  };

  if (!proto.showModal) {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!proto.close) {
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}
