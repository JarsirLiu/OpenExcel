import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildDemoMessages, buildToolPart, type DemoAssistantPart } from "./replayChat";
import { resolveDemoPlayback } from "./replayPlayback";
import type { DemoDefinition, DemoWorkbook, PlaybackPhase } from "./replayTypes";
import { commitDemoWorkbook, stageDemoWorkbookStep } from "./replayWorkbook";
import { cloneWorkbooks } from "./replayWorkbookProjection";

export function useDemoReplay(scenario: DemoDefinition) {
  const [workbooks, setWorkbooks] = useState<DemoWorkbook[]>(() =>
    cloneWorkbooks(scenario.initialWorkbooks),
  );
  const [workbookRevision, setWorkbookRevision] = useState(0);
  const stagedWorkbooksRef = useRef<DemoWorkbook[] | null>(null);
  const hasStagedWorkbookChangesRef = useRef(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [textOffset, setTextOffset] = useState(0);
  const [currentTool, setCurrentTool] = useState<"input" | "output" | null>(null);
  const [assistantParts, setAssistantParts] = useState<DemoAssistantPart[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [focusSequence, setFocusSequence] = useState(0);
  const steps = scenario.timeline;
  const playback = useMemo(() => resolveDemoPlayback(scenario.playback), [scenario.playback]);
  const currentStep = stepIndex >= 0 ? steps[stepIndex] : null;

  const reset = useCallback(() => {
    stagedWorkbooksRef.current = null;
    hasStagedWorkbookChangesRef.current = false;
    setWorkbooks(cloneWorkbooks(scenario.initialWorkbooks));
    setWorkbookRevision((revision) => revision + 1);
    setStepIndex(-1);
    setPhase("idle");
    setTextOffset(0);
    setCurrentTool(null);
    setAssistantParts([]);
    setIsPlaying(false);
  }, [scenario.initialWorkbooks]);

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

  const beginStep = useCallback(
    (index: number, clearParts = false) => {
      const step = steps[index];
      if (!step) return;
      setStepIndex(index);
      setTextOffset(0);
      setCurrentTool(null);
      setPhase("text");
      setFocusSequence((sequence) => sequence + 1);
      setAssistantParts((parts) => [
        ...(clearParts ? [] : parts),
        { type: "text", partId: `demo-text-${step.id}`, stepId: step.id, text: "" },
      ]);
      setIsPlaying(true);
    },
    [steps],
  );

  const start = useCallback(() => {
    if (stepIndex === steps.length - 1 && phase === "done") {
      reset();
      window.setTimeout(() => beginStep(0, true), playback.restartDelay);
      return;
    }
    if (stepIndex < 0) {
      beginStep(0, true);
      return;
    }
    setIsPlaying(true);
  }, [beginStep, phase, playback, reset, stepIndex, steps.length]);

  const moveToNextStep = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      setIsPlaying(false);
      return;
    }
    beginStep(stepIndex + 1);
  }, [beginStep, stepIndex, steps.length]);

  useEffect(() => {
    if (!isPlaying || !currentStep) return;

    if (phase === "text") {
      if (textOffset < currentStep.assistantText.length) {
        const timer = window.setTimeout(
          () => setTextOffset((value) => value + 1),
          playback.textTokenDelay,
        );
        return () => window.clearTimeout(timer);
      }
      const timer = window.setTimeout(
        () => setPhase(currentStep.toolName ? "tool" : "done"),
        playback.textCompletionDelay,
      );
      return () => window.clearTimeout(timer);
    }

    if (phase === "tool") {
      const timer = window.setTimeout(() => {
        setAssistantParts((parts) => [
          ...parts,
          buildToolPart(currentStep, "input-streaming", workbooks),
        ]);
        setCurrentTool("input");
        setPhase("result");
      }, playback.toolStartDelay);
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
      }, currentStep.toolExecutionDuration ?? playback.toolExecutionDuration);
      return () => window.clearTimeout(timer);
    }

    if (phase === "done") {
      const timer = window.setTimeout(
        () => {
          if (currentStep.toolName && currentTool === "input") {
            setPhase("result");
            return;
          }
          if (stepIndex >= steps.length - 1) {
            commitStagedWorkbook();
            setIsPlaying(false);
            return;
          }
          moveToNextStep();
        },
        currentStep.toolName && currentTool === "output"
          ? playback.toolStepDelay
          : playback.stepDelay,
      );
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [
    commitStagedWorkbook,
    currentStep,
    currentTool,
    isPlaying,
    moveToNextStep,
    phase,
    playback,
    stepIndex,
    steps.length,
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

  const focus = useMemo(
    () =>
      currentStep && (currentStep.activeWorkbook || currentStep.activeSheet)
        ? {
            workbookName:
              currentStep.activeWorkbook ?? scenario.initialWorkbooks[0]?.name ?? "当前文件",
            sheetName:
              currentStep.activeSheet ?? scenario.initialWorkbooks[0]?.sheets[0]?.name ?? "Sheet1",
            ...(currentStep.highlight ? { range: currentStep.highlight } : {}),
            sequence: focusSequence,
          }
        : null,
    [currentStep, focusSequence, scenario.initialWorkbooks],
  );

  return {
    workbooks,
    workbookRevision,
    messages: useMemo(
      () => buildDemoMessages(assistantParts, scenario.prompt),
      [assistantParts, scenario.prompt],
    ),
    isPlaying,
    focus,
    start,
    stop: useCallback(() => setIsPlaying(false), []),
    reset,
  };
}
