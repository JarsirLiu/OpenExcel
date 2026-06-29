import { useState, useRef } from "react";

interface UploadedFile {
  name: string;
  size: number;
  status: "parsing" | "done" | "error";
  message?: string;
}

interface Props {
  fileList: UploadedFile[];
  onUpload: (file: File) => void;
  onClearData: () => void;
}

function DataPanel({ fileList, onUpload, onClearData }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ padding: 12, fontSize: 13 }}>
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => inputRef.current?.click()}
          style={{ width: "100%", padding: "8px 0", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}
        >
          + 上传 Excel 文件
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = ""; } }} />
      </div>

      {fileList.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: "#333" }}>已上传文件</div>
          {fileList.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid #eee" }}>
              <span style={{ fontSize: 14 }}>{f.status === "done" ? "✅" : f.status === "parsing" ? "⏳" : "❌"}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <span style={{ color: "#999", fontSize: 11 }}>{(f.size / 1024).toFixed(1)}KB</span>
            </div>
          ))}
        </div>
      )}

      {fileList.length > 0 && (
        <button onClick={onClearData} style={{ width: "100%", padding: "6px 0", background: "#fff", color: "#d32f2f", border: "1px solid #d32f2f", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
          清除数据
        </button>
      )}
    </div>
  );
}

function ChatPanel() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: input.trim() }]);
    setInput("");
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", text: "功能开发中，即将支持 AI 数据分析。" }]);
    }, 500);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflow: "auto", padding: 12, fontSize: 13 }}>
        {messages.length === 0 && <div style={{ color: "#999", textAlign: "center", marginTop: 40 }}>输入问题，AI 将帮你分析数据</div>}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 10, textAlign: m.role === "user" ? "right" : "left" }}>
            <div style={{
              display: "inline-block",
              padding: "6px 12px",
              borderRadius: 12,
              background: m.role === "user" ? "#1a73e8" : "#f0f0f0",
              color: m.role === "user" ? "#fff" : "#333",
              maxWidth: "80%",
              lineHeight: 1.5,
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #e0e0e0", padding: 8, display: "flex", gap: 6 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="输入问题..."
          style={{ flex: 1, padding: "6px 10px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, outline: "none" }}
        />
        <button onClick={send} style={{ padding: "6px 14px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>发送</button>
      </div>
    </div>
  );
}

type TabKey = "data" | "chat";

export function Sidebar({ fileList, onUpload, onClearData }: Props) {
  const [tab, setTab] = useState<TabKey>("data");
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div style={{ width: 32, borderLeft: "1px solid #d0d0d0", background: "#f5f5f5", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, cursor: "pointer" }} onClick={() => setCollapsed(false)}>
        <span style={{ writingMode: "vertical-rl", fontSize: 12, color: "#666", letterSpacing: 2 }}>侧边栏</span>
      </div>
    );
  }

  return (
    <div style={{ width: 320, borderLeft: "1px solid #d0d0d0", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <div style={{ display: "flex", borderBottom: "1px solid #d0d0d0" }}>
        {[
          { key: "data" as const, label: "数据" },
          { key: "chat" as const, label: "对话" },
        ].map((t) => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: "8px 0", textAlign: "center", cursor: "pointer", fontSize: 13,
              background: tab === t.key ? "#fff" : "#e8e8e8",
              fontWeight: tab === t.key ? 600 : 400,
              borderBottom: tab === t.key ? "2px solid #1a73e8" : "2px solid transparent",
            }}
          >
            {t.label}
          </div>
        ))}
        <div
          onClick={() => setCollapsed(true)}
          style={{ padding: "6px 10px", cursor: "pointer", color: "#888", fontSize: 16, borderLeft: "1px solid #d0d0d0" }}
          title="收起"
        >
          ▶
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "data" ? <DataPanel fileList={fileList} onUpload={onUpload} onClearData={onClearData} /> : <ChatPanel />}
      </div>
    </div>
  );
}
