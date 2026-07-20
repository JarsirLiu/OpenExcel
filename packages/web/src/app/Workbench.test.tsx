import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it("does not dispatch workbook resize while dragging the chat sidebar", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    const { container } = render(
      <Workbench
        currentUser={{ email: "user@example.com", displayName: "User" }}
        onLogout={vi.fn()}
      />,
    );
    const handle = container.querySelector("[class*='resizeHandle']");
    expect(handle).not.toBeNull();

    act(() => {
      handle?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 500 }));
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 440 }));
    });

    expect(dispatchEvent).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(animationFrames).toHaveLength(1);

    act(() => {
      animationFrames[0](0);
    });

    const resizeEvents = dispatchEvent.mock.calls.filter(([event]) => event.type === "resize");
    expect(resizeEvents).toHaveLength(1);
  });
});
