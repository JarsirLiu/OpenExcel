import { type ComponentProps, memo, useCallback, useEffect, useMemo, useState } from "react";
import type { WorkbookMeta } from "@/api/workbooks";
import type { Workspace } from "@/api/workspaces";
import workbenchStyles from "@/app/Workbench.module.css";
import { SheetActivationProvider } from "@/features/workbook/editor/SheetActivationContext";
import { WorkspaceSidebar } from "@/features/workspace/WorkspaceSidebar";
import { WorkspaceView } from "@/features/workspace/WorkspaceView";
import type { DemoDefinition, DemoReplayFocus, DemoWorkbook } from "../runtime/replayTypes";
import { toWorkbook } from "../runtime/replayWorkbookProjection";

type Props = {
  onNavigateHome: () => void;
  scenario: DemoDefinition;
  workbooks: DemoWorkbook[];
  workbookRevision: number;
  focus: DemoReplayFocus | null;
};

const DemoWorkspaceView = memo(function DemoWorkspaceView(
  props: ComponentProps<typeof WorkspaceView>,
) {
  return (
    <SheetActivationProvider>
      <WorkspaceView {...props} />
    </SheetActivationProvider>
  );
});

export const DemoWorkspacePane = memo(function DemoWorkspacePane({
  onNavigateHome,
  scenario,
  workbooks,
  workbookRevision,
  focus,
}: Props) {
  const [currentWorkbookIndex, setCurrentWorkbookIndex] = useState(0);
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const workbookMetas = useMemo<WorkbookMeta[]>(
    () =>
      workbooks.map((workbook, index) => ({
        id: -101 - index,
        publicId: workbook.publicId,
        name: workbook.name,
        order: index,
      })),
    [workbooks],
  );
  const currentWorkbook = useMemo(() => {
    const workbook = workbooks[currentWorkbookIndex];
    return workbook ? toWorkbook(workbook, currentWorkbookIndex) : null;
  }, [currentWorkbookIndex, workbooks]);
  const currentMeta = workbookMetas[currentWorkbookIndex];
  const handleWorkbookSwitch = useCallback(
    (index: number) => {
      if (index < 0 || index >= workbooks.length) return;
      setCurrentWorkbookIndex(index);
      setCurrentSheetIndex(0);
    },
    [workbooks.length],
  );
  const handleWorkbookSelect = useCallback(
    (_workspaceId: number, workbookId: number) => {
      const index = workbookMetas.findIndex((workbook) => workbook.id === workbookId);
      if (index >= 0) handleWorkbookSwitch(index);
    },
    [handleWorkbookSwitch, workbookMetas],
  );
  const handleWorkbookImportNoop = useCallback(async () => false, []);
  const handleWorkbookDeleteNoop = useCallback(() => undefined, []);
  const handleWorkbookNoop = useCallback(async () => undefined, []);
  const handleStructureNoop = useCallback(() => undefined, []);
  const demoWorkspace = scenario.workspace as Workspace;
  const gridFocus = useMemo(() => {
    if (!focus) return undefined;
    const workbookIndex = workbooks.findIndex((workbook) => workbook.name === focus.workbookName);
    const workbook = workbooks[workbookIndex];
    const sheetIndex = workbook?.sheets.findIndex((sheet) => sheet.name === focus.sheetName) ?? -1;
    if (workbookIndex < 0 || sheetIndex < 0 || workbookIndex !== currentWorkbookIndex) {
      return undefined;
    }
    return { sheetIndex, range: focus.range, sequence: focus.sequence };
  }, [currentWorkbookIndex, focus, workbooks]);

  useEffect(() => {
    if (!focus) return;
    const workbookIndex = workbooks.findIndex((workbook) => workbook.name === focus.workbookName);
    const workbook = workbooks[workbookIndex];
    const sheetIndex = workbook?.sheets.findIndex((sheet) => sheet.name === focus.sheetName) ?? -1;
    if (workbookIndex < 0 || sheetIndex < 0) return;
    setCurrentWorkbookIndex(workbookIndex);
    setCurrentSheetIndex(sheetIndex);
  }, [focus, workbooks]);

  return (
    <>
      <WorkspaceSidebar
        onNavigateHome={onNavigateHome}
        homeLabel="返回案例库"
        activeWorkspaceId={demoWorkspace.id}
        onWorkspaceSelect={() => undefined}
        workspaces={[demoWorkspace]}
        onRefresh={() => undefined}
        workbooksMap={new Map([[demoWorkspace.id, workbookMetas]])}
        activeWorkbookId={currentMeta?.id ?? workbookMetas[0]?.id ?? null}
        onWorkbookSelect={handleWorkbookSelect}
        onWorkbookDelete={async () => undefined}
        onWorkbookCreate={async () => undefined}
        readOnly
        storageNamespace={`demo-${scenario.id}`}
      />
      <div className={workbenchStyles.main}>
        <DemoWorkspaceView
          workspaceId={null}
          workbooks={workbookMetas}
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
          presentationMode
          demoGridFocus={gridFocus}
        />
        <div className={workbenchStyles.resizeHandle} />
      </div>
    </>
  );
});
