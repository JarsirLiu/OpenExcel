import { Button } from "@/components/ui/Button/Button";
import chatStyles from "@/features/chat/ChatSidebar.module.css";
import { ChatComposer } from "@/features/chat/composer/ChatComposer";
import chatPanelStyles from "@/features/chat/conversation/ChatPanel.module.css";
import { MessageList } from "@/features/chat/message/MessageList";
import { SessionHeader } from "@/features/session/components/SessionHeader";
import sessionStyles from "@/features/session/SessionShell.module.css";
import type { buildDemoMessages } from "../runtime/replayChat";
import type { DemoDefinition } from "../runtime/replayTypes";

export function DemoChatSidebar({
  scenario,
  messages,
  isStreaming,
  onStart,
  onStop,
  onReset,
  onLogout,
}: {
  scenario: DemoDefinition;
  messages: ReturnType<typeof buildDemoMessages>;
  isStreaming: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onLogout: () => void;
}) {
  return (
    <div className={chatStyles.sidebar}>
      <div className={sessionStyles.container}>
        <SessionHeader
          sessionName={scenario.sessionName}
          currentSessionId={-300}
          onToggleHistory={() => undefined}
          onNewSession={onReset}
          currentUser={{ email: "demo@openexcel.local", displayName: "演示用户" }}
          onLogout={onLogout}
        />
        <div className={sessionStyles.bannerWrap}>
          <div className={sessionStyles.banner}>
            <Button
              variant={isStreaming ? "default" : "primary"}
              onClick={isStreaming ? onStop : onStart}
            >
              {isStreaming ? "暂停回放" : "播放 AI 回放"}
            </Button>
            <Button variant="ghost" onClick={onReset}>
              重新开始
            </Button>
          </div>
        </div>
        <div className={chatPanelStyles.container}>
          <MessageList messages={messages} isStreaming={isStreaming} />
          <ChatComposer
            isStreaming={isStreaming}
            onSend={onStart}
            onStop={onStop}
            onAttachExcel={() => undefined}
            referenceCacheRevision={0}
            workspaceId={scenario.workspace.id}
          />
        </div>
      </div>
    </div>
  );
}
