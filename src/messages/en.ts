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
