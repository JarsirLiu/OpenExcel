import { type ComponentProps, memo, useCallback, useMemo, useState } from "react";
import type { WorkbookMeta } from "@/api/workbooks";
import type { Workspace } from "@/api/workspaces";
import workbenchStyles from "@/app/Workbench.module.css";
import { SheetActivationProvider } from "@/features/workbook/editor/SheetActivationContext";
import { WorkspaceSidebar } from "@/features/workspace/WorkspaceSidebar";
import { WorkspaceView } from "@/features/workspace/WorkspaceView";
import type { DemoDefinition, DemoWorkbook } from "../runtime/replayTypes";
import { toWorkbook } from "../runtime/replayWorkbookProjection";

type Props = {
  scenario: DemoDefinition;
  workbooks: DemoWorkbook[];
  workbookRevision: number;
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
  scenario,
  workbooks,
  workbookRevision,
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

  return (
    <>
      <WorkspaceSidebar
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
        />
        <div className={workbenchStyles.resizeHandle} />
      </div>
    </>
  );
});
