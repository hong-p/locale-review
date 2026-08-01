import { beforeEach, describe, expect, it } from "vitest";

import {
  LEGACY_DRAFTS_KEY,
  LEGACY_SETTINGS_KEY,
  removeLegacyPrototypeToken,
  runStorageMigrations,
} from "./legacyMigration";

beforeEach(() => {
  window.localStorage.clear();
});

describe("removeLegacyPrototypeToken", () => {
  it("removes the prototype entry when it carries a token", () => {
    window.localStorage.setItem(
      LEGACY_SETTINGS_KEY,
      JSON.stringify({ locale: "ko-KR", sync: true, token: "ghp_example" }),
    );

    removeLegacyPrototypeToken(window.localStorage);

    expect(window.localStorage.getItem(LEGACY_SETTINGS_KEY)).toBeNull();
  });

  it("leaves a token-free prototype entry alone", () => {
    const payload = JSON.stringify({ locale: "ko-KR", sync: true });
    window.localStorage.setItem(LEGACY_SETTINGS_KEY, payload);

    removeLegacyPrototypeToken(window.localStorage);

    expect(window.localStorage.getItem(LEGACY_SETTINGS_KEY)).toBe(payload);
  });

  it("removes unparseable prototype data, which may hold the token as text", () => {
    window.localStorage.setItem(LEGACY_SETTINGS_KEY, '{"token":"ghp_example"');

    removeLegacyPrototypeToken(window.localStorage);

    expect(window.localStorage.getItem(LEGACY_SETTINGS_KEY)).toBeNull();
  });

  it("removes a non-object prototype entry", () => {
    window.localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify("ghp_example"));

    removeLegacyPrototypeToken(window.localStorage);

    expect(window.localStorage.getItem(LEGACY_SETTINGS_KEY)).toBeNull();
  });

  it("does nothing when the prototype never ran in this browser", () => {
    expect(() => removeLegacyPrototypeToken(window.localStorage)).not.toThrow();
    expect(window.localStorage.getItem(LEGACY_SETTINGS_KEY)).toBeNull();
  });
});

describe("runStorageMigrations", () => {
  it("clears both prototype keys", () => {
    window.localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify({ token: "ghp_example" }));
    window.localStorage.setItem(LEGACY_DRAFTS_KEY, JSON.stringify([{ id: 1, body: "draft" }]));

    runStorageMigrations();

    expect(window.localStorage.getItem(LEGACY_SETTINGS_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_DRAFTS_KEY)).toBeNull();
  });
});
