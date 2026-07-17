import { useEffect, useRef, useState } from "react";
import styles from "./ReasoningCard.module.css";

type Props = {
  reasoning: string;
  isStreaming?: boolean;
};

export function ReasoningCard({ reasoning, isStreaming }: Props) {
  const [open, setOpen] = useState(isStreaming ?? false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 思考结束（流式结束）或历史消息加载时默认收起卡片。
  useEffect(() => {
    if (!isStreaming) {
      setOpen(false);
    }
  }, [isStreaming]);

  // 流式生成时保持滚动到底部，便于看到最新的思考 token。
  useEffect(() => {
    if (!open || !isStreaming) return;
    const el = contentRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [reasoning, open, isStreaming]);

  return (
    <div className={`${styles.reasoning} ${open ? styles.open : ""}`}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className={styles.chevron} aria-hidden="true" />
        思考过程
      </button>
      {open && (
        <div ref={contentRef} className={styles.content}>
          {reasoning}
        </div>
      )}
    </div>
  );
}
