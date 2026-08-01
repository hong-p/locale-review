import { describe, expect, it } from "vitest";

import type { PullRequestDiffBase } from "../../api/types";
import { DEFAULT_LAYOUT } from "../settings/translationLayout";
import type { ChangedFile } from "./fetchChangedFiles";
import { buildTranslationFileModel } from "./translationFileModel";

const SAME_REPO: PullRequestDiffBase = {
  baseRepositoryFullName: "example-org/docs-site",
  headRepositoryFullName: "example-org/docs-site",
  mergeBaseSha: "merge-base",
  headSha: "head",
};

const FORK: PullRequestDiffBase = {
  ...SAME_REPO,
  headRepositoryFullName: "example-contributor/docs-site",
};

const DELETED_FORK: PullRequestDiffBase = { ...SAME_REPO, headRepositoryFullName: null };

const changed = (overrides: Partial<ChangedFile> = {}): ChangedFile => ({
  path: "content/ko/guide.md",
  previousPath: null,
  status: "modified",
  additions: 3,
  deletions: 1,
  patch: "@@ -1 +1 @@",
  blobSha: "blob-sha",
  ...overrides,
});

const build = (files: ChangedFile[], diffBase = SAME_REPO, extra = {}) =>
  buildTranslationFileModel(files, { settings: DEFAULT_LAYOUT, diffBase, ...extra });

describe("version refs", () => {
  it("reads source and before from the merge base, after from head", () => {
    // plan.md 4.5: the before side is the merge base so unrelated commits on
    // the base branch do not read as part of the existing translation.
    const { files } = build([changed()]);

    expect(files[0].source).toEqual({
      repositoryFullName: "example-org/docs-site",
      ref: "merge-base",
      path: "content/en/guide.md",
    });
    expect(files[0].before?.ref).toBe("merge-base");
    expect(files[0].after?.ref).toBe("head");
  });

  it("reads the after version from the fork", () => {
    const { files } = build([changed()], FORK);

    expect(files[0].after?.repositoryFullName).toBe("example-contributor/docs-site");
    // Source and before still come from the base repository.
    expect(files[0].source?.repositoryFullName).toBe("example-org/docs-site");
    expect(files[0].before?.repositoryFullName).toBe("example-org/docs-site");
  });

  it("falls back to the base repository when the fork is gone", () => {
    // plan.md 4.5: the commit stays reachable through the base repository.
    const { files } = build([changed()], DELETED_FORK);

    expect(files[0].after?.repositoryFullName).toBe("example-org/docs-site");
    expect(files[0].after?.ref).toBe("head");
  });
});

describe("file states", () => {
  it("models a modification with all three versions", () => {
    const { files } = build([changed({ status: "modified" })]);

    expect(files[0].state).toBe("modified");
    expect(files[0].before).not.toBeNull();
    expect(files[0].after).not.toBeNull();
    expect(files[0].source).not.toBeNull();
  });

  it("models an addition with no before version", () => {
    const { files } = build([changed({ status: "added" })]);

    expect(files[0].state).toBe("added");
    expect(files[0].before).toBeNull();
    expect(files[0].after).not.toBeNull();
  });

  it("models a deletion with no after version", () => {
    const { files } = build([changed({ status: "removed" })]);

    expect(files[0].state).toBe("deleted");
    expect(files[0].before).not.toBeNull();
    expect(files[0].after).toBeNull();
  });

  it("compares a rename across its two paths", () => {
    const { files } = build([
      changed({
        status: "renamed",
        path: "content/ko/install.md",
        previousPath: "content/ko/guide.md",
      }),
    ]);

    expect(files[0].state).toBe("renamed");
    expect(files[0].previousPath).toBe("content/ko/guide.md");
    // The before side has to read the old path, or it would 404.
    expect(files[0].before?.path).toBe("content/ko/guide.md");
    expect(files[0].after?.path).toBe("content/ko/install.md");
    // The locale comes from the new path, which is what the reviewer sees.
    expect(files[0].locale).toBe("ko");
  });

  it("reports a missing source without dropping the translation diff", () => {
    // plan.md 4.5: the translation comparison stays usable.
    const { files } = build([changed()], SAME_REPO, {
      sourceExists: () => false,
    });

    expect(files[0].source).toBeNull();
    expect(files[0].before).not.toBeNull();
    expect(files[0].after).not.toBeNull();
  });
});

describe("commentability", () => {
  it("allows comments when GitHub supplied a patch", () => {
    expect(build([changed({ patch: "@@ -1 +1 @@" })]).files[0].canComment).toBe(true);
  });

  it("disables comments when the patch is missing", () => {
    // plan.md 4.9: without a patch there are no positions GitHub accepts.
    expect(build([changed({ patch: null })]).files[0].canComment).toBe(false);
  });
});

describe("selection of translation files", () => {
  it("ignores files that are not translations", () => {
    const model = build([
      changed({ path: "content/ko/guide.md" }),
      changed({ path: "README.md" }),
      changed({ path: "src/index.ts" }),
      changed({ path: "content/ko/image.png" }),
    ]);

    expect(model.files).toHaveLength(1);
    expect(model.ignoredCount).toBe(3);
  });

  it("ignores a source-locale file rather than treating it as a target", () => {
    const model = build([changed({ path: "content/en/guide.md" })]);

    expect(model.files).toHaveLength(0);
    expect(model.ignoredCount).toBe(1);
  });

  it("reports a path both layouts claim instead of choosing one", () => {
    const model = build([changed({ path: "content/ko/guide.ja.md" })], SAME_REPO, {
      activeLayouts: ["locale-directory", "filename-suffix"],
    });

    expect(model.files).toHaveLength(0);
    expect(model.ambiguous).toEqual(["content/ko/guide.ja.md"]);
  });
});

describe("locale summary", () => {
  it("counts files per locale, most changed first", () => {
    const model = build([
      changed({ path: "content/ko/a.md" }),
      changed({ path: "content/ko/b.md" }),
      changed({ path: "content/ja/a.md" }),
      changed({ path: "content/zh-CN/a.md" }),
    ]);

    expect(model.locales).toEqual([
      { locale: "ko", fileCount: 2 },
      { locale: "ja", fileCount: 1 },
      { locale: "zh-CN", fileCount: 1 },
    ]);
  });

  it("orders ties alphabetically so the list is stable between loads", () => {
    // GitHub returns changed files in its own order, which must not leak into
    // how the locale chips are arranged.
    const model = build([
      changed({ path: "content/zh-CN/a.md" }),
      changed({ path: "content/ja/a.md" }),
      changed({ path: "content/ko/a.md" }),
    ]);

    expect(model.locales.map((entry) => entry.locale)).toEqual(["ja", "ko", "zh-CN"]);
  });

  it("is empty when nothing matched", () => {
    expect(build([changed({ path: "README.md" })]).locales).toEqual([]);
  });
});
