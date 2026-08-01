import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStorageSlot } from "./safeStorage";

type Theme = "light" | "dark" | "system";

const isTheme = (value: unknown): value is Theme =>
  value === "light" || value === "dark" || value === "system";

const makeSlot = (overrides: Partial<Parameters<typeof createStorageSlot<Theme>>[0]> = {}) =>
  createStorageSlot<Theme>({
    key: "theme",
    kind: "local",
    version: 2,
    fallback: "system",
    parse: isTheme,
    ...overrides,
  });

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("createStorageSlot", () => {
  it("round-trips a value through an envelope carrying the schema version", () => {
    const slot = makeSlot();
    slot.write("dark");

    expect(slot.read()).toBe("dark");
    expect(JSON.parse(window.localStorage.getItem("theme") ?? "")).toEqual({
      version: 2,
      value: "dark",
    });
  });

  it("returns the fallback when nothing is stored", () => {
    expect(makeSlot().read()).toBe("system");
  });

  it("discards corrupt JSON so the next read starts clean", () => {
    window.localStorage.setItem("theme", "{not json");
    const slot = makeSlot();

    expect(slot.read()).toBe("system");
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("discards a value that is not an envelope", () => {
    window.localStorage.setItem("theme", JSON.stringify("dark"));
    const slot = makeSlot();

    expect(slot.read()).toBe("system");
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("discards a value the parser rejects", () => {
    window.localStorage.setItem("theme", JSON.stringify({ version: 2, value: "neon" }));
    const slot = makeSlot();

    expect(slot.read()).toBe("system");
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("discards an older version when no migration is supplied", () => {
    window.localStorage.setItem("theme", JSON.stringify({ version: 1, value: "dark" }));
    const slot = makeSlot();

    expect(slot.read()).toBe("system");
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("migrates an older version and rewrites it at the current version", () => {
    window.localStorage.setItem("theme", JSON.stringify({ version: 1, value: "DARK" }));
    const slot = makeSlot({
      migrate: (value, fromVersion) =>
        fromVersion === 1 && typeof value === "string" ? value.toLowerCase() : undefined,
    });

    expect(slot.read()).toBe("dark");
    // The migration must not run again on the next read.
    expect(JSON.parse(window.localStorage.getItem("theme") ?? "")).toEqual({
      version: 2,
      value: "dark",
    });
  });

  it("discards the entry when a migration declines to convert it", () => {
    window.localStorage.setItem("theme", JSON.stringify({ version: 1, value: "dark" }));
    const slot = makeSlot({ migrate: () => undefined });

    expect(slot.read()).toBe("system");
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("falls back instead of throwing when reading throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(makeSlot().read()).toBe("system");
  });

  it("swallows a write that exceeds quota", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() => makeSlot().write("dark")).not.toThrow();
  });

  it("keeps local and session storage separate", () => {
    makeSlot().write("dark");
    const sessionSlot = makeSlot({ kind: "session" });

    expect(sessionSlot.read()).toBe("system");
    expect(window.sessionStorage.getItem("theme")).toBeNull();
  });

  it("clear removes the stored entry", () => {
    const slot = makeSlot();
    slot.write("dark");
    slot.clear();

    expect(window.localStorage.getItem("theme")).toBeNull();
    expect(slot.read()).toBe("system");
  });
});
