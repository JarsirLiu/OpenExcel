import { useState, useRef, useEffect } from "react";

type CurrentUser = {
  email: string;
  displayName: string;
};

type Props = {
  sessionName: string;
  currentSessionId: number | null;
  undoState: "idle" | "loading" | "success" | "error";
  undoError: string;
  isStreaming: boolean;
  onUndoLatestRun: () => void;
  onToggleHistory: () => void;
  onNewSession: () => void;
  currentUser: CurrentUser;
  onLogout: () => void;
};

const UserMenu = ({ currentUser, onLogout }: { currentUser: CurrentUser; onLogout: () => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: 30,
          height: 30,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          background: "var(--background)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--foreground)",
          padding: 0,
          flexShrink: 0,
        }}
        title="账号"
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          width: 200,
          background: "var(--background)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          boxShadow: "0 4px 16px rgba(15,23,42,0.12), 0 1px 3px rgba(15,23,42,0.08)",
          padding: "6px",
          zIndex: 200,
        }}>
          {/* User info */}
          <div style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            marginBottom: 4,
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #3b82f6 0%, #10b981 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {(currentUser.displayName || currentUser.email)[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--foreground)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {currentUser.displayName}
                </div>
                <div style={{
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {currentUser.email}
                </div>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding: "4px 0" }}>
            <button
              type="button"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                border: "none",
                background: "transparent",
                color: "var(--foreground)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                borderRadius: "var(--radius-sm)",
                transition: "background 0.15s",
              }}
              onClick={() => { setOpen(false); onLogout(); }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export function SessionHeader({
  sessionName,
  currentSessionId,
  undoState,
  undoError,
  isStreaming,
  onUndoLatestRun,
  onToggleHistory,
  onNewSession,
  currentUser,
  onLogout,
}: Props) {
  return (
    <>
      <div style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{
          fontWeight: 600,
          fontSize: 14,
          color: "var(--foreground)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          marginRight: 8,
        }}>
          {sessionName}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div
            onClick={onUndoLatestRun}
            style={{
              padding: "4px 8px",
              cursor: currentSessionId && undoState !== "loading" && !isStreaming ? "pointer" : "not-allowed",
              color: currentSessionId && !isStreaming ? "var(--muted-foreground)" : "var(--hint-foreground)",
              fontSize: 12,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-pill)",
              background: "var(--background)",
              opacity: undoState === "loading" || isStreaming ? 0.7 : 1,
            }}
            title={isStreaming ? "对话进行中，无法撤销" : undoState === "loading" ? "撤销中..." : "撤销本轮修改"}
          >
            {isStreaming ? "撤销" : (undoState === "loading" ? "撤销中" : "撤销")}
          </div>
          <div
            onClick={onToggleHistory}
            style={{
              padding: "4px 8px",
              cursor: "pointer",
              color: "var(--muted-foreground)",
              fontSize: 12,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-pill)",
              background: "var(--background)",
            }}
            title="历史记录"
          >
            历史
          </div>
          <div
            onClick={onNewSession}
            style={{
              padding: "4px 8px",
              cursor: "pointer",
              color: "var(--muted-foreground)",
              fontSize: 16,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-pill)",
              background: "var(--background)",
              lineHeight: 1,
            }}
            title="新建对话"
          >
            +
          </div>
          <UserMenu currentUser={currentUser} onLogout={onLogout} />
        </div>
      </div>
      {undoError && (
        <div style={{ padding: "10px 14px 0" }}>
          <div style={{
            border: "1px solid var(--border)",
            background: "var(--muted)",
            color: "var(--muted-foreground)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            撤销失败：{undoError}
          </div>
        </div>
      )}
      {undoState === "success" && (
        <div style={{ padding: "10px 14px 0" }}>
          <div style={{
            border: "1px solid var(--border)",
            background: "var(--muted)",
            color: "var(--muted-foreground)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            已撤销本轮修改
          </div>
        </div>
      )}
    </>
  );
}
