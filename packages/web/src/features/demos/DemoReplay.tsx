import { useNavigate } from "react-router-dom";
import workbenchStyles from "@/app/Workbench.module.css";
import { Button } from "@/components/ui/Button/Button";
import chatStyles from "@/features/chat/ChatSidebar.module.css";
import { ChatComposer } from "@/features/chat/composer/ChatComposer";
import chatPanelStyles from "@/features/chat/conversation/ChatPanel.module.css";
import { MessageList } from "@/features/chat/message/MessageList";
import { SessionHeader } from "@/features/session/components/SessionHeader";
import sessionStyles from "@/features/session/SessionShell.module.css";
import { DemoWorkspacePane } from "./DemoWorkspacePane";
import type { buildDemoMessages } from "./demoReplayModel";
import type { DemoScenario } from "./demoTypes";
import { useDemoReplay } from "./useDemoReplay";

export { buildDemoMessages } from "./demoReplayModel";

function DemoChatSidebar({
  scenario,
  messages,
  isStreaming,
  onStart,
  onStop,
  onReset,
  onLogout,
}: {
  scenario: DemoScenario;
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

export function DemoReplay({ scenario }: { scenario: DemoScenario }) {
  const navigate = useNavigate();
  const replay = useDemoReplay(scenario);

  return (
    <div className={workbenchStyles.layout}>
      <DemoWorkspacePane
        scenario={scenario}
        workbooks={replay.workbooks}
        workbookRevision={replay.workbookRevision}
      />
      <DemoChatSidebar
        scenario={scenario}
        messages={replay.messages}
        isStreaming={replay.isPlaying}
        onStart={replay.start}
        onStop={replay.stop}
        onReset={replay.reset}
        onLogout={() => navigate("/login")}
      />
    </div>
  );
}
