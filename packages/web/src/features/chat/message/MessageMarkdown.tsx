import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MessageMarkdown({ content }: { content: string }) {
  return (
    <div className="md-content" style={{
      fontSize: 15,
      lineHeight: 1.7,
      color: "#1f1f1f",
      maxWidth: "100%",
      minWidth: 0,
      overflowX: "auto",
    }}>
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
}
