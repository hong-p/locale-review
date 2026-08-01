/**
 * plan.md 2: the first release ships English only, but every user-facing
 * string lives here so a locale can be added later without touching
 * components. Terminology follows GitHub's English UI.
 */
export const messages = {
  app: {
    name: "Locale Review",
    tagline: "Review translation pull requests side by side.",
  },
  start: {
    heading: "Open a pull request",
    urlLabel: "Pull request URL",
    urlPlaceholder: "https://github.com/owner/repository/pull/123",
    submit: "Open pull request",
    tokenRequired: "A GitHub token is required before a pull request can be opened.",
    privacy: "This app runs entirely in your browser. No server stores your token or review data.",
  },
  token: {
    heading: "GitHub token",
    label: "Personal access token",
    placeholder: "github_pat_… or ghp_…",
    save: "Save token",
    clear: "Clear token",
    test: "Test connection",
    testing: "Testing…",
    remember: "Remember token on this device",
    rememberHint:
      "Off by default, the token is kept only for this browser tab. Turning this on stores it on this device — avoid it on a shared computer.",
    guidance:
      "A fine-grained token limited to the repositories you review, with Contents read-only, Pull requests read and write, and a short expiry.",
    createLink: "Create a fine-grained token on GitHub",
    signedInAs: "Signed in as",
    connectionFailed: "That token could not be used.",
    notSet: "No token set",
  },
  pullRequest: {
    openOnGitHub: "Open on GitHub",
    retry: "Retry",
    close: "Close pull request",
    loading: "Loading the pull request…",
    draft: "Draft",
    open: "Open",
    closed: "Closed",
    merged: "Merged",
    /** Rendered as `base ← head`, matching GitHub's own header. */
    branches: "Branches",
    authorUnknown: "Unknown author",
    readOnlyTitle: "Read-only",
    readOnlyBody:
      "Your token can read this repository but cannot write to it, so reviewing actions are disabled.",
  },
  files: {
    sidebarLabel: "Changed translation files",
    localeLegend: "Locales in this pull request",
    hiddenByFilter: "Files hidden by the locale filter:",
    noneSelected: "No files match the selected locales.",
    noTranslationsTitle: "No translation files found",
    noTranslationsBody:
      "None of the changed files match the active translation layout. Adjust the layout in settings and try again.",
    activeLayout: "Active layout",
    chooseLocale: "This pull request contains no preferred locale. Choose which to review.",
    truncated: "GitHub returned only the first 3,000 changed files, so this list is incomplete.",
    ambiguous: "These paths match more than one layout rule and need a choice:",
    stateModified: "Modified",
    stateAdded: "Added",
    stateDeleted: "Deleted",
    stateRenamed: "Renamed",
    renamedFrom: "Renamed from",
    noPatch: "Inline comments unavailable",
    sourceMissing: "Source file not found",
    loadingContent: "Loading file contents…",
    unsupportedTooLarge: "This file is too large for the GitHub API to return.",
    unsupportedBinary: "This file is not text the app can display.",
  },
  loadErrors: {
    invalidUrlTitle: "That is not a pull request URL",
    invalidUrlBody: "Enter a URL like https://github.com/owner/repository/pull/123.",
    notFoundTitle: "Pull request not found",
    notFoundBody:
      "It may not exist, or your token may not have access to the repository. GitHub reports both the same way.",
    permissionTitle: "Access denied",
    permissionBody: "Your token does not have access to this repository.",
    rateLimitTitle: "GitHub rate limit reached",
    rateLimitBody: "No further requests will succeed until the limit resets.",
    rateLimitResetsAt: "Resets at",
    networkTitle: "Could not reach GitHub",
    networkBody: "Check your network connection and try again.",
    unexpectedTitle: "GitHub returned an unexpected response",
    unexpectedBody: "The request failed for a reason this app does not recognise.",
  },
  settings: {
    title: "Settings",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
  },
  errors: {
    unexpectedTitle: "Something went wrong",
    unexpectedBody: "The app hit an unexpected error and stopped rendering this view.",
    reload: "Reload the app",
    notFoundTitle: "Page not found",
    notFoundBody: "That route does not exist in this app.",
    backToStart: "Back to start",
  },
} as const;

export type Messages = typeof messages;
