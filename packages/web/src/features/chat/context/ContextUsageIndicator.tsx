import { type CSSProperties, useId } from "react";
import styles from "./ContextUsageIndicator.module.css";
import type { ContextUsageSnapshot } from "./contextUsage";

export function ContextUsageIndicator({ usage }: { usage: ContextUsageSnapshot | null }) {
  const tooltipId = useId();
  const percentage = usage?.percentage ?? 0;
  const ringPercentage = Math.min(100, Math.max(0, percentage));
  const percentLabel = usage ? `${percentage.toFixed(1)}%` : "--";
  const usedLabel = usage ? formatTokens(usage.usedTokens) : "--";
  const windowLabel = usage ? formatTokens(usage.contextWindowTokens) : "--";

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        aria-label={usage ? `上下文已使用 ${percentLabel}` : "上下文 token 使用情况"}
        aria-describedby={tooltipId}
      >
        <span
          className={styles.ring}
          style={{ "--usage-percent": `${ringPercentage}%` } as CSSProperties}
        >
          <span className={styles.percent}>{percentLabel}</span>
        </span>
      </button>
      <div id={tooltipId} role="tooltip" className={styles.tooltip}>
        <div className={styles.tooltipValue}>
          {percentLabel} · {usedLabel} / {windowLabel}
        </div>
        {usage?.estimatedContextTokens != null && (
          <div className={styles.tooltipMeta}>
            估算上下文 {formatTokens(usage.estimatedContextTokens)}
          </div>
        )}
        {!usage || usage.source === "none" ? (
          <div className={styles.tooltipMeta}>尚未产生模型调用</div>
        ) : null}
      </div>
    </div>
  );
}

function formatTokens(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString("zh-CN");
}
