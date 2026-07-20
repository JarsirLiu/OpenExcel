import { useNavigate } from "react-router-dom";
import { routePaths } from "@/app/routePaths";
import workbenchStyles from "@/app/Workbench.module.css";
import type { DemoDefinition } from "../runtime/replayTypes";
import { useDemoReplay } from "../runtime/useDemoReplay";
import { DemoChatSidebar } from "./DemoChatSidebar";
import { DemoWorkspacePane } from "./DemoWorkspacePane";

export { buildDemoMessages } from "../runtime/replayChat";

export function DemoPage({ scenario }: { scenario: DemoDefinition }) {
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
        onLogout={() => navigate(routePaths.login)}
      />
    </div>
  );
}
