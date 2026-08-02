import { messages } from "../../messages/en";
import styles from "./FileHeader.module.css";
import type { TranslationFile } from "./translationFileModel";

/**
 * The sticky header naming the file under review (plan.md 7).
 *
 * It stays put while the panels scroll, so the path a comment refers to is
 * never off screen.
 */

const STATE_LABELS: Record<TranslationFile["state"], string> = {
  modified: messages.files.stateModified,
  added: messages.files.stateAdded,
  deleted: messages.files.stateDeleted,
  renamed: messages.files.stateRenamed,
};

export function FileHeader({ file, viewed }: { file: TranslationFile; viewed?: React.ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.paths}>
        <h2 className={styles.path}>{file.id}</h2>
        {file.previousPath !== null && (
          <p className={styles.previous}>
            {messages.files.renamedFrom} {file.previousPath}
          </p>
        )}
      </div>

      <div className={styles.meta}>
        {/* plan.md 7: the state is a word, colour only reinforces it. */}
        <span className={`${styles.state} ${styles[file.state]}`}>{STATE_LABELS[file.state]}</span>
        <span className={styles.added}>+{file.additions}</span>
        <span className={styles.removed}>−{file.deletions}</span>
        {!file.canComment && <span className={styles.noPatch}>{messages.files.noPatch}</span>}
        {viewed}
      </div>
    </header>
  );
}
