import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  type DemoCell,
  type DemoPatch,
  type DemoSheet,
  type DemoStep,
  studentFeeInitialSheets,
  studentFeePrompt,
  studentFeeSteps,
} from "./studentFeeReconciliation";

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
    rows: sheet.rows.map((row) => row.map((item) => ({ ...item }))),
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
          v: {
            v: value.value,
            m: String(value.value),
            ...(value.formula ? { f: value.formula.replace(/^=/, "") } : {}),
          },
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
        row[patch.startCol - 1 + index] = { ...value };
      });
    }
    return { ...sheet, rows };
  });
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

function buildPreview(sheet: DemoSheet | undefined, rangeValue?: string) {
  if (!sheet) return undefined;

  const range = parseRange(rangeValue, sheet);
  const rows = sheet.rows
    .slice(range.startRow - 1, range.endRow)
    .map((row) => row.slice(range.startCol - 1, range.endCol));
  const sheetIndex = studentFeeInitialSheets.findIndex((item) => item.name === sheet.name);
  return {
    sheetId: -200 - sheetIndex,
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
  sheets: DemoSheet[],
) {
  const sheetName = step.activeSheet ?? "当前 Sheet";
  const sheet = sheets.find((item) => item.name === sheetName);
  const patches = step.patch ? (Array.isArray(step.patch) ? step.patch : [step.patch]) : [];
  return {
    type: `tool-${step.toolName}`,
    toolCallId: `demo-${step.id}`,
    state: toolState,
    input: {
      sheetName,
      range: step.highlight ?? "A1:F20",
      instruction: step.toolInput,
    },
    output:
      toolState === "output-available"
        ? {
            sheetInfo: {
              sheetId: -200 - studentFeeInitialSheets.findIndex((item) => item.name === sheetName),
              sheetName,
              sheetNo: studentFeeInitialSheets.findIndex((item) => item.name === sheetName) + 1,
            },
            message: step.toolOutput,
            previewLabel: step.toolName === "readSheetData" ? "读取区域" : "变更区域",
            preview: buildPreview(sheet, step.highlight),
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
          }
        : undefined,
  };
}

export function buildDemoMessages(assistantParts: readonly DemoAssistantPart[]) {
  const messages: any[] = [
    { id: "demo-user", role: "user", parts: [{ type: "text", text: studentFeePrompt }] },
  ];

  if (assistantParts.length > 0) {
    messages.push({
      id: "demo-assistant",
      role: "assistant",
      parts: assistantParts,
    });
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
          sessionName="学生收费对账 Demo"
          currentSessionId={-300}
          onToggleHistory={() => undefined}
          onNewSession={onReset}
          currentUser={{ email: "demo@openexcel.local", displayName: "大学财务处" }}
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
  const [sheets, setSheets] = useState<DemoSheet[]>(cloneSheets);
  const [workbookRevision, setWorkbookRevision] = useState(0);
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(-1);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [textOffset, setTextOffset] = useState(0);
  const [currentTool, setCurrentTool] = useState<"input" | "output" | null>(null);
  const [assistantParts, setAssistantParts] = useState<DemoAssistantPart[]>([]);
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
    setAssistantParts([]);
    setIsPlaying(false);
  }, []);

  const beginStep = useCallback((index: number, clearParts = false) => {
    const step = studentFeeSteps[index];
    setStepIndex(index);
    setCurrentSheetIndex(
      Math.max(
        0,
        studentFeeInitialSheets.findIndex((sheet) => sheet.name === step.activeSheet),
      ),
    );
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
    if (stepIndex === studentFeeSteps.length - 1 && phase === "done") {
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
    if (stepIndex >= studentFeeSteps.length - 1) {
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
          buildToolPart(currentStep, "input-streaming", sheets),
        ]);
        setCurrentTool("input");
        setPhase("done");
      }, 380);
      return () => window.clearTimeout(timer);
    }

    if (phase === "result") {
      const timer = window.setTimeout(() => {
        const nextSheets = applyStepPatch(sheets, currentStep);
        const toolCallId = `demo-${currentStep.id}`;
        setAssistantParts((parts) =>
          parts.map((part) =>
            "toolCallId" in part && part.toolCallId === toolCallId
              ? buildToolPart(currentStep, "output-available", nextSheets)
              : part,
          ),
        );
        setSheets(nextSheets);
        setWorkbookRevision((revision) => revision + 1);
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
  }, [currentStep, currentTool, isPlaying, moveToNextStep, phase, sheets, stepIndex, textOffset]);

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
