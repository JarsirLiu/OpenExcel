import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshWorkbooks: vi.fn(),
  refreshSessions: vi.fn(),
  handleNewWorkbookFileChange: vi.fn(),
  workspaceViewProps: null as Record<string, unknown> | null,
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/" }),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/features/workspace/useWorkspaceState", () => ({
  useWorkspaceState: () => ({
    workspaces: [{ id: 1, publicId: "workspace-1", name: "Workspace", order: 0 }],
    activeWorkspaceId: 1,
    loading: false,
    refresh: vi.fn(),
    workbooksMap: new Map(),
    refreshWorkbooks: mocks.refreshWorkbooks,
  }),
}));

vi.mock("@/features/workspace/useWorkspaceView", () => ({
  useWorkspaceView: () => ({
    workbooks: [],
    workbookIdx: 0,
    currentWorkbook: null,
    workbookRevision: 0,
    loading: false,
    currentSheetIndex: 0,
    setCurrentSheetIndex: vi.fn(),
    handleSwitchWorkbook: vi.fn(),
    handleNewWorkbookFileChange: mocks.handleNewWorkbookFileChange,
    handleWorkbookDelete: vi.fn(),
    handleWorkbookRename: vi.fn(),
    handleWorkbookStructureChanged: vi.fn(),
    handleWorkbookRefresh: vi.fn(),
    handleWorkspaceRefresh: vi.fn(),
    referenceCacheRevision: 0,
  }),
}));

vi.mock("@/features/session/useSessionWorkspace", () => ({
  useSessionWorkspace: () => ({ refreshSessions: mocks.refreshSessions }),
}));

vi.mock("@/features/workbook/editor/SheetActivationContext", () => ({
  useSheetActivation: () => ({ activateSheetByIndex: vi.fn() }),
}));

vi.mock("@/features/workspace/WorkspaceSidebar", () => ({
  WorkspaceSidebar: () => <div data-testid="workspace-sidebar" />,
}));

vi.mock("@/features/workspace/WorkspaceView", () => ({
  WorkspaceView: (props: Record<string, unknown>) => {
    mocks.workspaceViewProps = props;
    return <div data-testid="workspace-view" />;
  },
}));

vi.mock("@/features/chat/ChatSidebar", () => ({
  ChatSidebar: () => <div data-testid="chat-sidebar" />,
}));

import { Workbench } from "./Workbench";

describe("Workbench", () => {
  beforeEach(() => {
    mocks.refreshWorkbooks.mockReset();
    mocks.refreshSessions.mockReset();
    mocks.handleNewWorkbookFileChange.mockReset();
    mocks.handleNewWorkbookFileChange.mockResolvedValue(true);
    mocks.workspaceViewProps = null;
  });

  it("refreshes the sidebar catalog after an editor upload changes workbooks", async () => {
    render(
      <Workbench
        currentUser={{ email: "user@example.com", displayName: "User" }}
        onLogout={vi.fn()}
      />,
    );

    const upload = mocks.workspaceViewProps?.handleNewWorkbookFileChange;
    expect(upload).toEqual(expect.any(Function));

    await act(async () => {
      await (upload as (files: File[]) => Promise<void>)([new File(["data"], "book.xlsx")]);
    });

    expect(mocks.handleNewWorkbookFileChange).toHaveBeenCalledOnce();
    expect(mocks.refreshWorkbooks).toHaveBeenCalledWith([
      { id: 1, publicId: "workspace-1", name: "Workspace", order: 0 },
    ]);
  });
});
