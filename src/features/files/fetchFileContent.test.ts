import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../../api/client";
import { server } from "../../test/msw/server";
import {
  decodeBase64Utf8,
  fetchFileContent,
  fetchFileContentViaJson,
  fetchWithFallback,
} from "./fetchFileContent";
import type { FileVersionRef } from "./translationFileModel";

const ORIGIN = "https://api.github.com";
const client = () => createGitHubClient({ token: "ghp_test" });

const ref = (overrides: Partial<FileVersionRef> = {}): FileVersionRef => ({
  repositoryFullName: "example-org/docs-site",
  ref: "merge-base",
  path: "content/ko/guide.md",
  ...overrides,
});

/** Encodes as UTF-8 the way GitHub does, rather than one byte per character. */
const toBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

describe("decodeBase64Utf8", () => {
  it("decodes non-ASCII text, which atob alone mangles", () => {
    // Translation content is non-ASCII by definition, so this is the normal
    // path rather than an edge case.
    const samples = [
      "# 설치 안내\n볼륨을 만듭니다.",
      "インストール手順",
      "安装指南",
      "دليل التثبيت",
      "Übersicht — café, naïve",
      "emoji: 🎉🇰🇷",
    ];

    for (const sample of samples) {
      expect(decodeBase64Utf8(toBase64(sample))).toBe(sample);
    }
  });

  it("tolerates the line wrapping GitHub applies to long payloads", () => {
    const text = "한국어 ".repeat(200);
    const wrapped = toBase64(text).replace(/(.{60})/g, "$1\n");

    expect(decodeBase64Utf8(wrapped)).toBe(text);
  });

  it("decodes an empty payload to an empty string", () => {
    expect(decodeBase64Utf8("")).toBe("");
  });
});

describe("fetchFileContent", () => {
  it("requests the raw media type at the given commit", async () => {
    let seenRef = "";
    let seenAccept = "";
    server.use(
      http.get(
        `${ORIGIN}/repos/example-org/docs-site/contents/content/ko/guide.md`,
        ({ request }) => {
          const url = new URL(request.url);
          seenRef = url.searchParams.get("ref") ?? "";
          seenAccept = request.headers.get("accept") ?? "";
          return HttpResponse.text("# 설치 안내");
        },
      ),
    );

    const result = await fetchFileContent(client(), ref());

    expect(result).toEqual({ state: "loaded", text: "# 설치 안내" });
    expect(seenRef).toBe("merge-base");
    expect(seenAccept).toBe("application/vnd.github.raw");
  });

  it("reports a missing file as absent rather than failing", async () => {
    // plan.md 4.5: a missing source must not break the translation diff.
    server.use(
      http.get(`${ORIGIN}/repos/example-org/docs-site/contents/*`, () =>
        HttpResponse.json({}, { status: 404 }),
      ),
    );

    expect(await fetchFileContent(client(), ref())).toEqual({ state: "absent" });
  });

  it("propagates a permission failure instead of reporting an empty file", async () => {
    // plan.md 10 forbids presenting a failure as a successful empty result.
    server.use(
      http.get(`${ORIGIN}/repos/example-org/docs-site/contents/*`, () =>
        HttpResponse.json({}, { status: 403 }),
      ),
    );

    await expect(fetchFileContent(client(), ref())).rejects.toThrow();
  });

  it("escapes each path segment while keeping the separators", async () => {
    let path = "";
    server.use(
      http.get(`${ORIGIN}/repos/example-org/docs-site/contents/*`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.text("ok");
      }),
    );

    await fetchFileContent(client(), ref({ path: "content/ko/a b/c#d.md" }));

    expect(path).toContain("/contents/content/ko/a%20b/c%23d.md");
  });
});

describe("fetchFileContentViaJson", () => {
  const mockContents = (body: Record<string, unknown>) => {
    server.use(
      http.get(`${ORIGIN}/repos/example-org/docs-site/contents/*`, () => HttpResponse.json(body)),
    );
  };

  it("decodes a base64 payload as UTF-8", async () => {
    mockContents({ encoding: "base64", content: toBase64("# 설치"), size: 12, type: "file" });

    expect(await fetchFileContentViaJson(client(), ref())).toEqual({
      state: "loaded",
      text: "# 설치",
    });
  });

  it("follows the blob path when GitHub declines to embed the content", async () => {
    // Above 1 MB the Contents API returns an empty body with encoding "none".
    let calls = 0;
    server.use(
      http.get(`${ORIGIN}/repos/example-org/docs-site/contents/*`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json({ encoding: "none", content: "", size: 2_000_000 });
        }
        return HttpResponse.json({ encoding: "base64", content: toBase64("big 파일") });
      }),
    );

    expect(await fetchFileContentViaJson(client(), ref())).toEqual({
      state: "loaded",
      text: "big 파일",
    });
  });

  it("marks a file the blob API will not serve as unsupported", async () => {
    server.use(
      http.get(`${ORIGIN}/repos/example-org/docs-site/contents/*`, () =>
        HttpResponse.json({ encoding: "none", content: "", size: 200_000_000 }),
      ),
    );

    expect(await fetchFileContentViaJson(client(), ref())).toEqual({
      state: "unsupported",
      reason: "too-large",
    });
  });

  it("marks a submodule or symlink as unsupported", async () => {
    for (const type of ["submodule", "symlink"]) {
      mockContents({ type });
      expect(await fetchFileContentViaJson(client(), ref())).toEqual({
        state: "unsupported",
        reason: "binary",
      });
    }
  });
});

describe("fetchWithFallback", () => {
  it("returns the first candidate that resolves", async () => {
    server.use(
      http.get(`${ORIGIN}/repos/gone/docs-site/contents/*`, () =>
        HttpResponse.json({}, { status: 404 }),
      ),
      http.get(`${ORIGIN}/repos/example-org/docs-site/contents/*`, () =>
        HttpResponse.text("recovered 번역"),
      ),
    );

    // plan.md 4.5: a deleted fork still resolves through the base repository.
    const result = await fetchWithFallback(client(), [
      ref({ repositoryFullName: "gone/docs-site" }),
      ref({ repositoryFullName: "example-org/docs-site" }),
    ]);

    expect(result).toEqual({ state: "loaded", text: "recovered 번역" });
  });

  it("stops at the first candidate rather than trying the rest", async () => {
    let baseCalls = 0;
    server.use(
      http.get(`${ORIGIN}/repos/example-org/docs-site/contents/*`, () => {
        baseCalls += 1;
        return HttpResponse.text("first");
      }),
    );

    await fetchWithFallback(client(), [ref(), ref()]);

    expect(baseCalls).toBe(1);
  });

  it("reports absent when every candidate is missing", async () => {
    server.use(
      http.get(`${ORIGIN}/repos/*/contents/*`, () => HttpResponse.json({}, { status: 404 })),
    );

    expect(await fetchWithFallback(client(), [ref(), ref()])).toEqual({ state: "absent" });
  });
});
