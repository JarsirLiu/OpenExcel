import type { JSX } from "react";
import { getMessageText } from "@/features/shared/messageUtils";
import styles from "./MessageItem.module.css";
import { MessageMarkdown } from "./MessageMarkdown";
import { ReasoningCard } from "./ReasoningCard";
import { SheetChangeSummary } from "./SheetChangeSummary";
import { ToolCallCard } from "./ToolCallCard";

const UserAvatar = () => <div className={`${styles.avatar} ${styles.avatarUser}`}>Y</div>;

const AIAvatar = () => <div className={`${styles.avatar} ${styles.avatarAi}`}>AI</div>;

const CopyIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const RefreshIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

const ThumbUpIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);

const ThumbDownIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H6.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
  </svg>
);

const DownloadIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const UndoIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 7 4 12l5 5" />
    <path d="M20 19a8 8 0 0 0-8-8H4" />
  </svg>
);

function renderAssistantParts(msg: any, isMessageStreaming: boolean) {
  if (!msg.parts || msg.parts.length === 0) {
    return <MessageMarkdown content={msg.content || ""} isStreaming={isMessageStreaming} />;
  }

  const result: JSX.Element[] = [];
  let textParts: string[] = [];
  const flushText = (key: string) => {
    if (textParts.length > 0) {
      result.push(
        <MessageMarkdown key={key} content={textParts.join("")} isStreaming={isMessageStreaming} />,
      );
      textParts = [];
    }
  };

  for (let i = 0; i < msg.parts.length; i++) {
    const part = msg.parts[i];
    switch (part.type) {
      case "text":
        textParts.push(part.text);
        break;
      case "reasoning": {
        flushText(`reasoning-${i}-flush`);
        result.push(
          <div key={`reasoning-${i}`}>
            <ReasoningCard
              reasoning={typeof part.text === "string" ? part.text : ""}
              isStreaming={isMessageStreaming}
            />
          </div>,
        );
        break;
      }
      case "step-start":
        flushText(`step-${i}-flush`);
        result.push(<div key={`step-${i}`} className={styles.stepDivider} />);
        break;
      default:
        if (part.type.startsWith("tool-")) {
          flushText(`tool-${i}-flush`);
          result.push(
            <div key={`tool-${i}`} className={styles.toolWrap}>
              <ToolCallCard part={part} />
            </div>,
          );
        }
        break;
    }
  }
  flushText("final-flush");

  return <>{result}</>;
}

export function MessageItem({
  msg,
  isMessageStreaming,
  isLastAssistantMessage,
  onRegenerate,
  onUndo,
  isUndoing,
  onNavigateSheet,
}: {
  msg: any;
  isMessageStreaming: boolean;
  isLastAssistantMessage: boolean;
  onRegenerate?: () => void;
  onUndo?: () => void;
  isUndoing?: boolean;
  onNavigateSheet?: (sheetId: number) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className={styles.userMsg}>
        <div className={styles.msgHeader}>
          <UserAvatar />
          <span className={styles.roleName}>You</span>
        </div>
        <div className={styles.msgBody}>
          <div className={styles.userText}>{getMessageText(msg)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.assistantMsg}>
      <div className={styles.msgHeader}>
        <AIAvatar />
        <span className={styles.roleName}>AI 助手</span>
      </div>
      <div className={styles.msgBody}>
        {renderAssistantParts(msg, isMessageStreaming)}
        {!isMessageStreaming && msg.role === "assistant" && msg.parts && (
          <SheetChangeSummary parts={msg.parts} onNavigateSheet={onNavigateSheet} />
        )}
        {!isMessageStreaming && isLastAssistantMessage && (
          <div className={styles.actions}>
            {onUndo && (
              <button
                type="button"
                onClick={isUndoing ? undefined : onUndo}
                className={`${styles.actionBtn} ${isUndoing ? styles.actionBtnDisabled : ""}`}
                disabled={isUndoing}
                title="撤销本轮修改"
              >
                <UndoIcon size={14} />
                {isUndoing ? "撤销中..." : "撤销"}
              </button>
            )}
            {onRegenerate && (
              <button onClick={onRegenerate} className={styles.actionBtn} title="重新生成">
                <RefreshIcon size={14} />
                重新生成
              </button>
            )}
            <button className={styles.actionBtn} title="赞">
              <ThumbUpIcon size={14} />
            </button>
            <button className={styles.actionBtn} title="踩">
              <ThumbDownIcon size={14} />
            </button>
            <button className={styles.actionBtn} title="下载">
              <DownloadIcon size={14} />
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => navigator.clipboard.writeText(getMessageText(msg) || "")}
              title="复制"
            >
              <CopyIcon size={12} />
              复制
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
