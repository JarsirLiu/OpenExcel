import chatStyles from "@/features/chat/ChatSidebar.module.css";
import { ChatComposer } from "@/features/chat/composer/ChatComposer";
import chatPanelStyles from "@/features/chat/conversation/ChatPanel.module.css";
import { MessageList } from "@/features/chat/message/MessageList";
import { SessionHeader } from "@/features/session/components/SessionHeader";
import sessionStyles from "@/features/session/SessionShell.module.css";
import type { buildDemoMessages } from "../runtime/replayChat";
import type { DemoDefinition } from "../runtime/replayTypes";
import styles from "./DemoChatSidebar.module.css";

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
          presentationMode
        />
        <div className={sessionStyles.bannerWrap}>
          <div className={styles.replayControl}>
            <div className={styles.replayMeta}>
              <span
                className={`${styles.replayDot} ${isStreaming ? styles.replayDotActive : ""}`}
              />
              <span>
                <small>{isStreaming ? "正在执行" : "准备就绪"}</small>
                <strong>{scenario.timeline.length} 步完整流程</strong>
              </span>
            </div>
            <div className={styles.replayActions}>
              <button
                type="button"
                className={styles.playButton}
                onClick={isStreaming ? onStop : onStart}
              >
                {isStreaming ? (
                  <svg aria-hidden="true" viewBox="0 0 16 16">
                    <path d="M5 4v8M11 4v8" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 16 16">
                    <path d="m6 4 6 4-6 4V4Z" />
                  </svg>
                )}
                {isStreaming ? "暂停回放" : "播放 AI 回放"}
              </button>
              <button type="button" className={styles.resetButton} onClick={onReset}>
                <svg aria-hidden="true" viewBox="0 0 16 16">
                  <path d="M3.5 7a4.7 4.7 0 1 1 .9 3.6M3.5 7V3.8M3.5 7h3.2" />
                </svg>
                重置
              </button>
            </div>
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
