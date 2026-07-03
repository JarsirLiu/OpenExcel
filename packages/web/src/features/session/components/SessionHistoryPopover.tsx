import type { Session } from "../../../api/client";

type Props = {
  sessions: Session[];
  currentSessionId: number | null;
  onSelectSession: (id: number) => void;
  onDeleteSession: (id: number) => void;
};

export function SessionHistoryPopover({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
}: Props) {
  return (
    <>
      {sessions.length === 0 ? (
        <div style={{ padding: "16px", textAlign: "center", color: "#999", fontSize: 13 }}>暂无历史记录</div>
      ) : (
        sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", cursor: "pointer",
              background: session.id === currentSessionId ? "#f5f5f5" : "transparent",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <span style={{ fontSize: 13, color: "#1f1f1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {session.name}
            </span>
            <div
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(session.id);
              }}
              style={{ padding: "2px 6px", cursor: "pointer", color: "#bbb", fontSize: 14, lineHeight: 1, marginLeft: 8, flexShrink: 0 }}
              title="删除"
            >
              ✕
            </div>
          </div>
        ))
      )}
    </>
  );
}
