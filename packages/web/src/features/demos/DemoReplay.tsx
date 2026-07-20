import {
  type ComponentProps,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import type { WorkbookFull } from "@/api/workbooks";
import type { Workspace } from "@/api/workspaces";
import workbenchStyles from "@/app/Workbench.module.css";
import { Button } from "@/components/ui/Button/Button";
import chatStyles from "@/features/chat/ChatSidebar.module.css";
import { ChatComposer } from "@/features/chat/composer/ChatComposer";
import chatPanelStyles from "@/features/chat/conversation/ChatPanel.module.css";
import { MessageList } from "@/features/chat/message/MessageList";
import { SessionHeader } from "@/features/session/components/SessionHeader";
import sessionStyles from "@/features/session/SessionShell.module.css";
import { SheetActivationProvider } from "@/features/workbook/editor/SheetActivationContext";
import { WorkspaceSidebar } from "@/features/workspace/WorkspaceSidebar";
import { WorkspaceView } from "@/features/workspace/WorkspaceView";
import { commitDemoWorkbook, stageDemoWorkbookStep } from "./demoWorkbookReplay";
import {
  type DemoCell,
  type DemoSheet,
  type DemoStep,
  type DemoWorkbook,
  inventoryInitialWorkbooks,
  inventoryReconciliationPrompt,
  inventorySteps,
} from "./inventoryReconciliation";

const DemoWorkspaceView = memo(function DemoWorkspaceView(
  props: ComponentProps<typeof WorkspaceView>,
) {
  return (
    <SheetActivationProvider>
      <WorkspaceView {...props} />
    </SheetActivationProvider>
  );
});

type PlaybackPhase = "idle" | "text" | "tool" | "result" | "done";

type DemoTextPart = {
  type: "text";
  stepId: string;
  text: string;
};

type DemoToolPart = ReturnType<typeof buildToolPart>;
type DemoAssistantPart = DemoTextPart | DemoToolPart;

const demoWorkspace: Workspace = {
  id: -100,
  publicId: "demo-supermarket-finance",
  name: "超市财务演示",
  order: 0,
};

const demoWorkbookMetas = inventoryInitialWorkbooks.map((workbook, index) => ({
  id: -101 - index,
  publicId: workbook.publicId,
  name: workbook.name,
  order: index,
}));

function cloneWorkbooks(): DemoWorkbook[] {
  return inventoryInitialWorkbooks.map((workbook) => ({
    ...workbook,
    sheets: workbook.sheets.map((sheet) => ({
      ...sheet,
      columns: [...sheet.columns],
      rows: sheet.rows.map((row) => row.map((item) => ({ ...item }))),
    })),
  }));
}

function toWorkbook(workbook: DemoWorkbook, workbookIndex: number): WorkbookFull {
  return {
    id: -101 - workbookIndex,
    publicId: workbook.publicId,
    name: workbook.name,
    charts: [],
    sheets: workbook.sheets.map((sheet, sheetIndex) => ({
      id: -200 - workbookIndex * 10 - sheetIndex,
      sheetNo: sheetIndex + 1,
      name: sheet.name,
      order: sheetIndex,
      columns: sheet.columns.map((label) => ({ label, width: 120 })),
      merges: [],
      uploadedData: sheet.rows.flatMap((row, rowIndex) =>
        row.map((value, colIndex) => ({
          r: rowIndex,
          c: colIndex,
          v: {
            v: value.value,
            m: String(value.value),
            ...(value.formula ? { f: value.formula.replace(/^=/, "") } : {}),
            ...(value.background ? { bg: value.background } : {}),
          },
        })),
      ),
      config: null,
    })),
  };
}

function columnNumber(value: string): number {
  return value.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function parseRange(value: string | undefined, sheet: DemoSheet | undefined) {
  const fallback = {
    startRow: 1,
    endRow: Math.min(sheet?.rows.length ?? 1, 8),
    startCol: 1,
    endCol: Math.min(sheet?.columns.length ?? 1, 8),
  };
  if (!value) return fallback;

  const match = value.toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return fallback;
  return {
    startRow: Number(match[2]),
    endRow: Number(match[4]),
    startCol: columnNumber(match[1]),
    endCol: columnNumber(match[3]),
  };
}

function buildPreview(
  workbook: DemoWorkbook | undefined,
  sheet: DemoSheet | undefined,
  rangeValue?: string,
) {
  if (!workbook || !sheet) return undefined;

  const range = parseRange(rangeValue, sheet);
  const rows = sheet.rows
    .slice(range.startRow - 1, range.endRow)
    .map((row) => row.slice(range.startCol - 1, range.endCol));
  const workbookIndex = inventoryInitialWorkbooks.findIndex((item) => item.name === workbook.name);
  const sheetIndex = workbook.sheets.findIndex((item) => item.name === sheet.name);
  return {
    sheetId: -200 - workbookIndex * 10 - sheetIndex,
    sheetName: sheet.name,
    range,
    rows: rows.map((values, index) => ({
      row: range.startRow + index,
      values: values.map((item: DemoCell) => String(item.value)),
    })),
    merges: [],
  };
}

function buildToolPart(
  step: DemoStep,
  toolState: "input-streaming" | "output-available",
  workbooks: DemoWorkbook[],
) {
  const workbookName = step.activeWorkbook ?? workbooks[0]?.name ?? "当前文件";
  const workbook = workbooks.find((item) => item.name === workbookName);
  const sheetName = step.activeSheet ?? workbook?.sheets[0]?.name ?? "当前 Sheet";
  const sheet = workbook?.sheets.find((item) => item.name === sheetName);
  const patches = step.patch ? (Array.isArray(step.patch) ? step.patch : [step.patch]) : [];
  const workbookIndex = inventoryInitialWorkbooks.findIndex((item) => item.name === workbookName);
  const sheetIndex = workbook?.sheets.findIndex((item) => item.name === sheetName) ?? 0;
  const changedCellCount = patches.reduce((total, patch) => total + patch.values.length, 0);

  return {
    type: `tool-${step.toolName}`,
    toolCallId: `demo-${step.id}`,
    state: toolState,
    input: {
      workbookName,
      sheetName,
      range: step.highlight ?? "A1:F20",
      instruction: step.toolInput,
    },
    output:
      toolState === "output-available"
        ? {
            sheetInfo: {
              sheetId: -200 - workbookIndex * 10 - sheetIndex,
              sheetName,
              sheetNo: sheetIndex + 1,
              workbookName,
            },
            message: step.toolOutput,
            previewLabel: step.toolName === "readSheetData" ? "读取区域" : "变更区域",
            preview: buildPreview(workbook, sheet, step.highlight),
            delta:
              patches.length > 0
                ? {
                    type: "write",
                    cells: patches.flatMap((patch) =>
                      patch.values.map((value, index) => ({
                        row: patch.row,
                        col: patch.startCol + index,
                        value: value.value,
                        ...(value.formula ? { formula: value.formula } : {}),
                      })),
                    ),
                  }
                : undefined,
            changeSummary:
              changedCellCount > 0 ? { changedCellCount, rangeOperationCount: 0 } : undefined,
          }
        : undefined,
  };
}

export function buildDemoMessages(assistantParts: readonly DemoAssistantPart[]) {
  const messages: any[] = [
    {
      id: "demo-user",
      role: "user",
      parts: [{ type: "text", text: inventoryReconciliationPrompt }],
    },
  ];

  if (assistantParts.length > 0) {
    messages.push({ id: "demo-assistant", role: "assistant", parts: assistantParts });
  }

  return messages;
}

function DemoChatSidebar({
  messages,
  isStreaming,
  onStart,
  onStop,
  onReset,
  onLogout,
}: {
  messages: any[];
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
          sessionName="进销存核对 Demo"
          currentSessionId={-300}
          onToggleHistory={() => undefined}
          onNewSession={onReset}
          currentUser={{ email: "demo@openexcel.local", displayName: "超市财务" }}
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
            workspaceId={-100}
          />
        </div>
      </div>
    </div>
  );
}

export function DemoReplay() {
  const navigate = useNavigate();
  const [workbooks, setWorkbooks] = useState<DemoWorkbook[]>(cloneWorkbooks);
  const [workbookRevision, setWorkbookRevision] = useState(0);
  const stagedWorkbooksRef = useRef<DemoWorkbook[] | null>(null);
  const hasStagedWorkbookChangesRef = useRef(false);
  const [currentWorkbookIndex, setCurrentWorkbookIndex] = useState(2);
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(-1);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [textOffset, setTextOffset] = useState(0);
  const [currentTool, setCurrentTool] = useState<"input" | "output" | null>(null);
  const [assistantParts, setAssistantParts] = useState<DemoAssistantPart[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const currentStep = stepIndex >= 0 ? inventorySteps[stepIndex] : null;
  const currentWorkbook = useMemo(() => {
    const workbook = workbooks[currentWorkbookIndex];
    return workbook ? toWorkbook(workbook, currentWorkbookIndex) : null;
  }, [currentWorkbookIndex, workbooks]);

  const reset = useCallback(() => {
    stagedWorkbooksRef.current = null;
    hasStagedWorkbookChangesRef.current = false;
    setWorkbooks(cloneWorkbooks());
    setWorkbookRevision((revision) => revision + 1);
    setCurrentWorkbookIndex(2);
    setCurrentSheetIndex(0);
    setStepIndex(-1);
    setPhase("idle");
    setTextOffset(0);
    setCurrentTool(null);
    setAssistantParts([]);
    setIsPlaying(false);
  }, []);

  const commitStagedWorkbook = useCallback(() => {
    const replayState = commitDemoWorkbook({
      visible: workbooks,
      staged: stagedWorkbooksRef.current,
      hasChanges: hasStagedWorkbookChangesRef.current,
    });
    if (replayState.visible === workbooks) return;

    setWorkbooks(replayState.visible);
    setWorkbookRevision((revision) => revision + 1);
    stagedWorkbooksRef.current = replayState.staged;
    hasStagedWorkbookChangesRef.current = replayState.hasChanges;
  }, [workbooks]);

  const beginStep = useCallback((index: number, clearParts = false) => {
    const step = inventorySteps[index];
    setStepIndex(index);
    setTextOffset(0);
    setCurrentTool(null);
    setPhase("text");
    setAssistantParts((parts) => [
      ...(clearParts ? [] : parts),
      { type: "text", stepId: step.id, text: "" },
    ]);
    setIsPlaying(true);
  }, []);

  const start = useCallback(() => {
    if (stepIndex === inventorySteps.length - 1 && phase === "done") {
      reset();
      window.setTimeout(() => beginStep(0, true), 20);
      return;
    }
    if (stepIndex < 0) {
      beginStep(0, true);
      return;
    }
    setIsPlaying(true);
  }, [beginStep, phase, reset, stepIndex]);

  const moveToNextStep = useCallback(() => {
    if (stepIndex >= inventorySteps.length - 1) {
      setIsPlaying(false);
      return;
    }
    beginStep(stepIndex + 1);
  }, [beginStep, stepIndex]);

  useEffect(() => {
    if (!isPlaying || !currentStep) return;

    if (phase === "text") {
      if (textOffset < currentStep.assistantText.length) {
        const timer = window.setTimeout(() => setTextOffset((value) => value + 1), 24);
        return () => window.clearTimeout(timer);
      }
      const timer = window.setTimeout(() => setPhase(currentStep.toolName ? "tool" : "done"), 220);
      return () => window.clearTimeout(timer);
    }

    if (phase === "tool") {
      const timer = window.setTimeout(() => {
        setAssistantParts((parts) => [
          ...parts,
          buildToolPart(currentStep, "input-streaming", workbooks),
        ]);
        setCurrentTool("input");
        setPhase("done");
      }, 380);
      return () => window.clearTimeout(timer);
    }

    if (phase === "result") {
      const timer = window.setTimeout(() => {
        const replayState = stageDemoWorkbookStep(
          {
            visible: workbooks,
            staged: stagedWorkbooksRef.current,
            hasChanges: hasStagedWorkbookChangesRef.current,
          },
          currentStep,
        );
        stagedWorkbooksRef.current = replayState.staged;
        hasStagedWorkbookChangesRef.current = replayState.hasChanges;
        const nextWorkbooks = replayState.staged ?? replayState.visible;
        const toolCallId = `demo-${currentStep.id}`;
        setAssistantParts((parts) =>
          parts.map((part) =>
            "toolCallId" in part && part.toolCallId === toolCallId
              ? buildToolPart(currentStep, "output-available", nextWorkbooks)
              : part,
          ),
        );
        setCurrentTool("output");
        setPhase("done");
      }, 520);
      return () => window.clearTimeout(timer);
    }

    if (phase === "done") {
      const timer = window.setTimeout(
        () => {
          if (currentStep.toolName && currentTool === "input") {
            setPhase("result");
            return;
          }
          if (stepIndex >= inventorySteps.length - 1) {
            commitStagedWorkbook();
            setIsPlaying(false);
            return;
          }
          moveToNextStep();
        },
        currentStep.toolName && currentTool === "output" ? 420 : 260,
      );
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [
    currentStep,
    currentTool,
    commitStagedWorkbook,
    isPlaying,
    moveToNextStep,
    phase,
    stepIndex,
    textOffset,
    workbooks,
  ]);

  useEffect(() => {
    if (!currentStep || phase !== "text") return;
    const text = currentStep.assistantText.slice(0, textOffset);
    setAssistantParts((parts) =>
      parts.map((part) =>
        part.type === "text" && "stepId" in part && part.stepId === currentStep.id
          ? { ...part, text }
          : part,
      ),
    );
  }, [currentStep, phase, textOffset]);

  const messages = useMemo(() => buildDemoMessages(assistantParts), [assistantParts]);
  const currentMeta = demoWorkbookMetas[currentWorkbookIndex];
  const handleWorkbookSwitch = useCallback((index: number) => setCurrentWorkbookIndex(index), []);
  const handleWorkbookImportNoop = useCallback(async () => false, []);
  const handleWorkbookDeleteNoop = useCallback(() => undefined, []);
  const handleWorkbookNoop = useCallback(async () => undefined, []);
  const handleStructureNoop = useCallback(() => undefined, []);

  return (
    <div className={workbenchStyles.layout}>
      <WorkspaceSidebar
        activeWorkspaceId={demoWorkspace.id}
        onWorkspaceSelect={() => undefined}
        workspaces={[demoWorkspace]}
        onRefresh={() => undefined}
        workbooksMap={new Map([[demoWorkspace.id, demoWorkbookMetas]])}
        activeWorkbookId={currentMeta?.id ?? demoWorkbookMetas[0].id}
        onWorkbookSelect={handleWorkbookSwitch}
        onWorkbookDelete={async () => undefined}
        onWorkbookCreate={async () => undefined}
        readOnly
        storageNamespace="demo"
      />
      <div className={workbenchStyles.main}>
        <DemoWorkspaceView
          workspaceId={null}
          workbooks={demoWorkbookMetas}
          workbookIdx={currentWorkbookIndex}
          currentWorkbook={currentWorkbook}
          workbookRevision={workbookRevision}
          loading={false}
          currentSheetIndex={currentSheetIndex}
          setCurrentSheetIndex={setCurrentSheetIndex}
          handleSwitchWorkbook={handleWorkbookSwitch}
          handleNewWorkbookFileChange={handleWorkbookImportNoop}
          handleWorkbookDelete={handleWorkbookDeleteNoop}
          handleWorkbookRename={handleWorkbookNoop}
          handleWorkbookStructureChanged={handleStructureNoop}
          handleWorkbookRefresh={handleWorkbookNoop}
          onWorkbookMutation={handleWorkbookNoop}
        />
        <div className={workbenchStyles.resizeHandle} />
      </div>
      <DemoChatSidebar
        messages={messages}
        isStreaming={isPlaying}
        onStart={start}
        onStop={() => setIsPlaying(false)}
        onReset={reset}
        onLogout={() => navigate("/login")}
      />
    </div>
  );
}
