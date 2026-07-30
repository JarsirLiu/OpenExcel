import type { AutomaticContextCompactionState } from "../conversation/automaticContextCompactionStatus";
import styles from "./AutomaticContextCompactionStatus.module.css";

export function AutomaticContextCompactionStatus({
  status,
}: {
  status: AutomaticContextCompactionState;
}) {
  const isRunning = status === "running";
  const isFailed = status === "failed";
  const label = isRunning
    ? "正在压缩上下文..."
    : status === "completed"
      ? "上下文已压缩"
      : "上下文压缩失败";

  return (
    <div
      className={`${styles.status} ${isRunning ? styles.running : isFailed ? styles.failed : styles.completed}`}
      role="status"
    >
      <span className={styles.line} aria-hidden="true" />
      <span className={styles.icon} aria-hidden="true">
        {isRunning ? <span className={styles.spinner} /> : isFailed ? "!" : "✓"}
      </span>
      <span>{label}</span>
      <span className={styles.line} aria-hidden="true" />
    </div>
  );
}
