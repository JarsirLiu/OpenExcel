import { useRef, useState } from "react";

interface Props {
  onLoad: (json: Record<string, any> | null) => void;
}

export function JsonInput({ onLoad }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        onLoad(json);
      } catch {
        setError("JSON 格式错误");
      }
    };
    reader.readAsText(file);
  };

  const handlePaste = () => {
    try {
      const json = JSON.parse(text);
      onLoad(json);
    } catch {
      setError("JSON 格式错误");
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: "80px auto", padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>OpenExcel</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>上传或粘贴你的数据 JSON，系统将自动生成多 Sheet Excel 模板</p>

      <div style={{ marginBottom: 16 }}>
        <button onClick={() => fileRef.current?.click()}>上传 JSON 文件</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleFile} />
      </div>

      <div style={{ marginBottom: 8, color: "#888", fontSize: 13 }}>或直接粘贴 JSON：</div>
      <textarea
        rows={12}
        value={text}
        onChange={(e) => { setText(e.target.value); setError(""); }}
        placeholder='{"经营概览": {"企业经营概述": {"指标1": "值1", ...}}, ...}'
        style={{ width: "100%", fontFamily: "monospace", fontSize: 13, padding: 12, border: "1px solid #ccc", borderRadius: 4, resize: "vertical" }}
      />
      {error && <div style={{ color: "#d32f2f", fontSize: 13, marginTop: 4 }}>{error}</div>}

      <div style={{ marginTop: 12 }}>
        <button onClick={handlePaste} disabled={!text.trim()}>加载</button>
      </div>

      <div style={{ marginTop: 32, padding: 16, background: "#f5f5f5", borderRadius: 4, fontSize: 13, color: "#555" }}>
        <strong>示例数据格式：</strong>
        <pre style={{ marginTop: 8, fontSize: 12 }}>{`{
  "经营概览": {
    "企业经营概述": {
      "上年度开票销售收入": "1000万元",
      "本年度开票销售收入": "200万元"
    },
    "企业开票情况": {
      "销项有效发票总金额": {
        "金额": "1000万元",
        "数量": "200份"
      }
    }
  },
  "销售情况分析": {
    "季度销售金额": [
      { "季度": "Q1", "金额": 200 },
      { "季度": "Q2", "金额": 300 }
    ]
  }
}`}</pre>
      </div>
    </div>
  );
}
