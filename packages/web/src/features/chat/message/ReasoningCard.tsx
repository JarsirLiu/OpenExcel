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
        background: "var(--muted)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        marginBottom: 12,
        overflow: "hidden",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "var(--muted-foreground)" }}>
        <span style={{ fontSize: 11 }}>{open ? "▼" : "▶"}</span>
        思考过程
      </div>
      {open && (
        <div style={{ padding: "0 12px 10px", fontSize: 13, lineHeight: 1.6, color: "var(--muted-foreground)", whiteSpace: "pre-wrap" }}>
          {reasoning}
        </div>
      )}
    </div>
  );
}
