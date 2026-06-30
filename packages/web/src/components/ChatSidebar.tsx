import { ChatInterface } from "./ChatInterface";

export function ChatSidebar() {
  return (
    <div style={{ width: 360, flexShrink: 0, minWidth: 0, overflow: "hidden" }}>
      <ChatInterface />
    </div>
  );
}
