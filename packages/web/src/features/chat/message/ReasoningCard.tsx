type Props = {
  reasoning: string;
  open: boolean;
  onToggle: () => void;
};

export function ReasoningCard({ reasoning, open, onToggle }: Props) {
  return (
    <div
      onClick={onToggle}
      style={{
        background: "#f6f8fa",
        border: "1px solid #e8ecf0",
        borderRadius: 8,
        marginBottom: 12,
        overflow: "hidden",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#555" }}>
        <span style={{ fontSize: 11 }}>{open ? "▼" : "▶"}</span>
        思考过程
      </div>
      {open && (
        <div style={{ padding: "0 12px 10px", fontSize: 13, lineHeight: 1.6, color: "#666", whiteSpace: "pre-wrap" }}>
          {reasoning}
        </div>
      )}
    </div>
  );
}
