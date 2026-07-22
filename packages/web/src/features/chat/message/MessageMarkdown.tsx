import { lazy, memo, Suspense } from "react";
import styles from "./MessageMarkdown.module.css";

const MessageMarkdownRenderer = lazy(() =>
  import("./MessageMarkdownRenderer").then(({ MessageMarkdownRenderer: renderer }) => ({
    default: renderer,
  })),
);

export const MessageMarkdown = memo(function MessageMarkdown({
  content,
  isStreaming = false,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  return (
    <div className={styles.markdown}>
      <Suspense fallback={<span>{content}</span>}>
        <MessageMarkdownRenderer content={content} isStreaming={isStreaming} />
      </Suspense>
    </div>
  );
});
