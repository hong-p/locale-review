import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../../api/client";
import { server } from "../../test/msw/server";
import { CHANGED_FILES_LIMIT, fetchChangedFiles } from "./fetchChangedFiles";

const ORIGIN = "https://api.github.com";
const FILES_URL = `${ORIGIN}/repos/example-org/docs-site/pulls/7/files`;
const REF = { owner: "example-org", repository: "docs-site", number: 7 };

const client = () => createGitHubClient({ token: "ghp_test" });

const rawFile = (overrides: Record<string, unknown> = {}) => ({
  filename: "content/ko/guide.md",
  status: "modified",
  additions: 4,
  deletions: 2,
  patch: "@@ -1,2 +1,4 @@",
  sha: "blob-sha",
  ...overrides,
});

describe("fetchChangedFiles", () => {
  it("maps the fields the model needs", async () => {
    server.use(http.get(FILES_URL, () => HttpResponse.json([rawFile()])));

    const { files } = await fetchChangedFiles(client(), REF);

    expect(files[0]).toEqual({
      path: "content/ko/guide.md",
      previousPath: null,
      status: "modified",
      additions: 4,
      deletions: 2,
      patch: "@@ -1,2 +1,4 @@",
      blobSha: "blob-sha",
    });
  });

  it("carries the previous path of a rename", async () => {
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([
          rawFile({
            status: "renamed",
            filename: "content/ko/install.md",
            previous_filename: "content/ko/guide.md",
          }),
        ]),
      ),
    );

    const { files } = await fetchChangedFiles(client(), REF);

    expect(files[0].status).toBe("renamed");
    expect(files[0].previousPath).toBe("content/ko/guide.md");
  });

  it("records a missing patch rather than inventing one", async () => {
    // GitHub omits the patch for a large or binary file, and plan.md 4.9 turns
    // that into disabled inline comments instead of guessed positions.
    server.use(http.get(FILES_URL, () => HttpResponse.json([rawFile({ patch: undefined })])));

    expect((await fetchChangedFiles(client(), REF)).files[0].patch).toBeNull();
  });

  it("collapses statuses the app does not model", async () => {
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([rawFile({ status: "copied" }), rawFile({ status: "changed" })]),
      ),
    );

    const { files } = await fetchChangedFiles(client(), REF);

    expect(files.map((f) => f.status)).toEqual(["other", "other"]);
  });

  it("follows pagination to the end", async () => {
    server.use(
      http.get(FILES_URL, ({ request }) => {
        const page = new URL(request.url).searchParams.get("page") ?? "1";
        if (page === "1") {
          return HttpResponse.json([rawFile({ filename: "content/ko/a.md" })], {
            headers: { link: `<${FILES_URL}?page=2>; rel="next"` },
          });
        }
        return HttpResponse.json([rawFile({ filename: "content/ko/b.md" })]);
      }),
    );

    const { files } = await fetchChangedFiles(client(), REF);

    expect(files.map((f) => f.path)).toEqual(["content/ko/a.md", "content/ko/b.md"]);
  });

  it("does not report truncation for an ordinary pull request", async () => {
    server.use(http.get(FILES_URL, () => HttpResponse.json([rawFile()])));

    expect((await fetchChangedFiles(client(), REF)).truncated).toBe(false);
  });

  it("reports truncation at GitHub's cap instead of looking complete", async () => {
    // plan.md 4.9 forbids presenting an incomplete list as a finished one.
    const many = Array.from({ length: CHANGED_FILES_LIMIT }, (_, index) =>
      rawFile({ filename: `content/ko/file-${index}.md` }),
    );
    server.use(http.get(FILES_URL, () => HttpResponse.json(many)));

    const result = await fetchChangedFiles(client(), REF);

    expect(result.files).toHaveLength(CHANGED_FILES_LIMIT);
    expect(result.truncated).toBe(true);
  });

  it("skips an entry with no filename rather than producing an unusable file", async () => {
    server.use(
      http.get(FILES_URL, () => HttpResponse.json([rawFile({ filename: null }), rawFile()])),
    );

    expect((await fetchChangedFiles(client(), REF)).files).toHaveLength(1);
  });

  it("defaults missing counts to zero", async () => {
    server.use(
      http.get(FILES_URL, () =>
        HttpResponse.json([rawFile({ additions: undefined, deletions: undefined })]),
      ),
    );

    const { files } = await fetchChangedFiles(client(), REF);

    expect(files[0].additions).toBe(0);
    expect(files[0].deletions).toBe(0);
  });
});
