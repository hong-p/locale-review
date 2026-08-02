import type { RefObject } from "react";

import { messages } from "../../messages/en";
import styles from "./MarkdownToolbar.module.css";

/**
 * Markdown shortcuts for a comment box (plan.md 4.9).
 *
 * Text manipulation only: it wraps or prefixes the selection and hands focus
 * back. GitHub's editor also previews the rendered result, which would need a
 * Markdown renderer this release does not ship (plan.md 11), so there is no
 * preview here.
 */

export type MarkdownToolbarProps = {
  textarea: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

type Action = {
  key: string;
  label: string;
  title: string;
  /** Wraps the selection, e.g. `**` for bold. */
  wrap?: string;
  /** Prefixes each selected line, e.g. `> ` for a quote. */
  linePrefix?: string;
  /** Used when the selection is empty, so the button still does something. */
  placeholder: string;
};

const ACTIONS: Action[] = [
  { key: "bold", label: "B", title: messages.markdown.bold, wrap: "**", placeholder: "text" },
  { key: "italic", label: "I", title: messages.markdown.italic, wrap: "_", placeholder: "text" },
  { key: "code", label: "<>", title: messages.markdown.code, wrap: "`", placeholder: "code" },
  {
    key: "quote",
    label: "❝",
    title: messages.markdown.quote,
    linePrefix: "> ",
    placeholder: "quote",
  },
  {
    key: "list",
    label: "•",
    title: messages.markdown.list,
    linePrefix: "- ",
    placeholder: "item",
  },
  { key: "link", label: "🔗", title: messages.markdown.link, placeholder: "title" },
];

/** Returns the new text and where the selection should end up. */
export function applyMarkdown(
  action: Action,
  value: string,
  start: number,
  end: number,
): { text: string; selectionStart: number; selectionEnd: number } {
  const selected = value.slice(start, end);
  const body = selected === "" ? action.placeholder : selected;

  if (action.linePrefix) {
    // Prefix every line of the selection, which is what a quote or a list
    // means when more than one line is selected.
    const prefixed = body
      .split("\n")
      .map((line) => `${action.linePrefix}${line}`)
      .join("\n");
    return {
      text: value.slice(0, start) + prefixed + value.slice(end),
      selectionStart: start + action.linePrefix.length,
      selectionEnd: start + prefixed.length,
    };
  }

  if (action.wrap) {
    const wrapped = `${action.wrap}${body}${action.wrap}`;
    return {
      text: value.slice(0, start) + wrapped + value.slice(end),
      selectionStart: start + action.wrap.length,
      selectionEnd: start + action.wrap.length + body.length,
    };
  }

  // The link case: the selection becomes the title, and the cursor lands on
  // the URL, which is what still needs typing.
  const inserted = `[${body}](url)`;
  const urlStart = start + body.length + 3;
  return {
    text: value.slice(0, start) + inserted + value.slice(end),
    selectionStart: urlStart,
    selectionEnd: urlStart + 3,
  };
}

export function MarkdownToolbar({ textarea, value, onChange, disabled }: MarkdownToolbarProps) {
  const run = (action: Action) => {
    const element = textarea.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;

    const result = applyMarkdown(action, value, start, end);
    onChange(result.text);

    // Restoring the selection has to wait for React to write the new value.
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label={messages.markdown.label}>
      {ACTIONS.map((action) => (
        <button
          key={action.key}
          type="button"
          className={styles.button}
          title={action.title}
          aria-label={action.title}
          disabled={disabled}
          onClick={() => run(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
