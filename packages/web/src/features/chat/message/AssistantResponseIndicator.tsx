import styles from "./AssistantResponseIndicator.module.css";

function Dots() {
  return (
    <span className={styles.inline} aria-label="AI 正在响应" role="status">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </span>
  );
}

export function AssistantResponseIndicator({
  inline = false,
  showPulse = true,
}: {
  inline?: boolean;
  showPulse?: boolean;
}) {
  if (inline) return showPulse ? <Dots /> : null;

  return (
    <div className={styles.row}>
      <div className={styles.header}>
        <div className={styles.avatar}>AI</div>
        <span className={styles.roleName}>AI 助手</span>
      </div>
      <div className={styles.body}>{showPulse && <Dots />}</div>
    </div>
  );
}
