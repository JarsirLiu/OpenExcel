import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WorkbookFull } from "@/api/workbooks";
import type { Workspace } from "@/api/workspaces";
import workbenchStyles from "@/app/Workbench.module.css";
import chatStyles from "@/features/chat/ChatSidebar.module.css";
import { ChatComposer } from "@/features/chat/composer/ChatComposer";
import chatPanelStyles from "@/features/chat/conversation/ChatPanel.module.css";
import { MessageList } from "@/features/chat/message/MessageList";
import { SessionHeader } from "@/features/session/components/SessionHeader";
import sessionStyles from "@/features/session/SessionShell.module.css";
import { SheetActivationProvider } from "@/features/workbook/editor/SheetActivationContext";
import { WorkspaceSidebar } from "@/features/workspace/WorkspaceSidebar";
import { WorkspaceView } from "@/features/workspace/WorkspaceView";
import {
  type DemoPatch,
  type DemoSheet,
  type DemoStep,
  studentFeeInitialSheets,
  studentFeePrompt,
  studentFeeSteps,
} from "./studentFeeReconciliation";

type PlaybackPhase = "idle" | "text" | "tool" | "result" | "done";

type AssistantHistoryItem = {
  stepId: string;
  text: string;
};

const demoWorkspace: Workspace = {
  id: -100,
  publicId: "demo-university-finance",
  name: "大学财务演示",
  order: 0,
};

const demoWorkbookMeta = {
  id: -101,
  publicId: "demo-student-fee-reconciliation",
  name: "2024-2025 学年收费核对",
  order: 0,
};

function cloneSheets(): DemoSheet[] {
  return studentFeeInitialSheets.map((sheet) => ({
    ...sheet,
    columns: [...sheet.columns],
    rows: sheet.rows.map((row) => [...row]),
  }));
}

function toWorkbook(sheets: DemoSheet[]): WorkbookFull {
  return {
    id: demoWorkbookMeta.id,
    publicId: demoWorkbookMeta.publicId,
    name: demoWorkbookMeta.name,
    charts: [],
    sheets: sheets.map((sheet, sheetIndex) => ({
      id: -200 - sheetIndex,
      sheetNo: sheetIndex + 1,
      name: sheet.name,
      order: sheetIndex,
      columns: sheet.columns.map((label) => ({ label, width: 120 })),
      merges: [],
      uploadedData: sheet.rows.flatMap((row, rowIndex) =>
        row.map((value, colIndex) => ({
          r: rowIndex,
          c: colIndex,
          v: { v: value, m: value },
        })),
      ),
      config: null,
    })),
  };
}

function applyStepPatch(sheets: DemoSheet[], step: DemoStep): DemoSheet[] {
  if (!step.patch) return sheets;
  const patches: DemoPatch[] = Array.isArray(step.patch) ? step.patch : [step.patch];

  return sheets.map((sheet) => {
    const sheetPatches = patches.filter((patch) => patch.sheet === sheet.name);
    if (sheetPatches.length === 0) return sheet;

    const rows = sheet.rows.map((row) => [...row]);
    for (const patch of sheetPatches) {
      const row = rows[patch.row - 1];
      if (!row) continue;
      patch.values.forEach((value, index) => {
        row[index + 2] = value;
      });
    }
    return { ...sheet, rows };
  });
}

function buildToolPart(step: DemoStep, toolState: "input-streaming" | "output-available") {
  const sheetName = step.activeSheet ?? "当前 Sheet";
  return {
    type: `tool-${step.toolName}`,
    toolCallId: `demo-${step.id}`,
    state: toolState,
    input: { sheetName, range: step.highlight ?? "A1:F20" },
    output:
      toolState === "output-available"
        ? {
            sheetInfo: { sheetName, sheetNo: 1 },
            delta: step.patch
              ? {
                  type: "write",
                  cells: [{ row: 1, col: 1, value: "已更新" }],
                }
              : undefined,
          }
        : undefined,
  };
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
          sessionName="学生收费对账 Demo"
          currentSessionId={-300}
          onToggleHistory={() => undefined}
          onNewSession={onReset}
          currentUser={{ email: "demo@openexcel.local", displayName: "大学财务处" }}
          onLogout={onLogout}
        />
        <div className={sessionStyles.bannerWrap}>
          <div className={sessionStyles.banner}>
            <button
              type="button"
              className={`${sessionStyles.pillBtn} ${sessionStyles.plusBtnSolid}`}
              onClick={isStreaming ? onStop : onStart}
            >
              {isStreaming ? "暂停回放" : "播放 AI 回放"}
            </button>
            <button type="button" className={sessionStyles.pillBtn} onClick={onReset}>
              重新开始
            </button>
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
  const [sheets, setSheets] = useState<DemoSheet[]>(cloneSheets);
  const [workbookRevision, setWorkbookRevision] = useState(0);
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(-1);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [textOffset, setTextOffset] = useState(0);
  const [currentTool, setCurrentTool] = useState<"input" | "output" | null>(null);
  const [history, setHistory] = useState<AssistantHistoryItem[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const currentStep = stepIndex >= 0 ? studentFeeSteps[stepIndex] : null;
  const currentWorkbook = useMemo(() => toWorkbook(sheets), [sheets]);

  const reset = useCallback(() => {
    setSheets(cloneSheets());
    setWorkbookRevision((revision) => revision + 1);
    setCurrentSheetIndex(0);
    setStepIndex(-1);
    setPhase("idle");
    setTextOffset(0);
    setCurrentTool(null);
    setHistory([]);
    setCurrentText("");
    setIsPlaying(false);
  }, []);

  const start = useCallback(() => {
    if (stepIndex === studentFeeSteps.length - 1 && phase === "done") {
      reset();
      window.setTimeout(() => setIsPlaying(true), 20);
      return;
    }
    if (stepIndex < 0) {
      setStepIndex(0);
      setCurrentSheetIndex(0);
      setPhase("text");
      setTextOffset(0);
    }
    setIsPlaying(true);
  }, [phase, reset, stepIndex]);

  const moveToNextStep = useCallback(() => {
    if (stepIndex >= studentFeeSteps.length - 1) {
      setIsPlaying(false);
      return;
    }
    const nextIndex = stepIndex + 1;
    setHistory((items) =>
      currentText
        ? [...items, { stepId: studentFeeSteps[stepIndex].id, text: currentText }]
        : items,
    );
    setStepIndex(nextIndex);
    setCurrentSheetIndex(
      Math.max(
        0,
        studentFeeInitialSheets.findIndex(
          (sheet) => sheet.name === studentFeeSteps[nextIndex].activeSheet,
        ),
      ),
    );
    setCurrentText("");
    setCurrentTool(null);
    setTextOffset(0);
    setPhase("text");
  }, [currentText, stepIndex]);

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
        setCurrentTool("input");
        setPhase("done");
      }, 380);
      return () => window.clearTimeout(timer);
    }

    if (phase === "result") {
      const timer = window.setTimeout(() => {
        setCurrentTool("output");
        setSheets((value) => applyStepPatch(value, currentStep));
        setWorkbookRevision((revision) => revision + 1);
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
          if (stepIndex >= studentFeeSteps.length - 1) {
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
  }, [currentStep, currentTool, isPlaying, moveToNextStep, phase, stepIndex, textOffset]);

  useEffect(() => {
    if (currentStep) setCurrentText(currentStep.assistantText.slice(0, textOffset));
  }, [currentStep, textOffset]);

  const messages = useMemo(() => {
    const result: any[] = [
      { id: "demo-user", role: "user", parts: [{ type: "text", text: studentFeePrompt }] },
      ...history.map((item) => ({
        id: `demo-${item.stepId}`,
        role: "assistant",
        parts: [{ type: "text", text: item.text }],
      })),
    ];

    if (currentStep && currentText) {
      result.push({
        id: `demo-current-${currentStep.id}`,
        role: "assistant",
        parts: [
          { type: "text", text: currentText },
          ...(currentStep.toolName && currentTool
            ? [
                buildToolPart(
                  currentStep,
                  currentTool === "output" ? "output-available" : "input-streaming",
                ),
              ]
            : []),
        ],
      });
    }
    return result;
  }, [currentStep, currentText, currentTool, history]);

  const handleSheetIndexChange = useCallback((index: number) => setCurrentSheetIndex(index), []);
  const handleWorkbookImportNoop = useCallback(async () => false, []);
  const handleWorkbookNoop = useCallback(async () => undefined, []);
  const handleStructureNoop = useCallback(() => undefined, []);

  return (
    <SheetActivationProvider>
      <div className={workbenchStyles.layout}>
        <WorkspaceSidebar
          activeWorkspaceId={demoWorkspace.id}
          onWorkspaceSelect={() => undefined}
          workspaces={[demoWorkspace]}
          onRefresh={() => undefined}
          workbooksMap={new Map([[demoWorkspace.id, [demoWorkbookMeta]]])}
          activeWorkbookId={demoWorkbookMeta.id}
          onWorkbookSelect={() => undefined}
          onWorkbookDelete={async () => undefined}
          onWorkbookCreate={async () => undefined}
          readOnly
          storageNamespace="demo"
        />
        <div className={workbenchStyles.main}>
          <WorkspaceView
            workspaceId={null}
            workbooks={[demoWorkbookMeta]}
            workbookIdx={0}
            currentWorkbook={currentWorkbook}
            workbookRevision={workbookRevision}
            loading={false}
            currentSheetIndex={currentSheetIndex}
            setCurrentSheetIndex={handleSheetIndexChange}
            handleSwitchWorkbook={() => undefined}
            handleNewWorkbookFileChange={handleWorkbookImportNoop}
            handleWorkbookDelete={() => undefined}
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
    </SheetActivationProvider>
  );
}
