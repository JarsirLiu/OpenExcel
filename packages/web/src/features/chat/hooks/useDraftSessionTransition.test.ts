import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDraftSessionTransition } from "./useDraftSessionTransition";

describe("useDraftSessionTransition", () => {
  it("records a persisted draft without activating it during the stream", async () => {
    let resolveActivation: (() => void) | undefined;
    const onDraftSessionCreated = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveActivation = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ isDraft }) => useDraftSessionTransition({ isDraft, onDraftSessionCreated }),
      { initialProps: { isDraft: true } },
    );

    act(() => {
      result.current.captureDraftResponse(
        new Response(null, { headers: { "X-OpenExcel-Session-Id": "17" } }),
      );
    });

    expect(onDraftSessionCreated).not.toHaveBeenCalled();
    expect(result.current.isSendLocked()).toBe(false);
    expect(result.current.isTransitioning).toBe(false);

    act(() => {
      result.current.beginTransition();
    });
    expect(onDraftSessionCreated).toHaveBeenCalledWith(17);
    expect(result.current.isSendLocked()).toBe(true);
    expect(result.current.isTransitioning).toBe(true);

    await act(async () => {
      resolveActivation?.();
    });

    rerender({ isDraft: false });
    expect(result.current.isSendLocked()).toBe(false);
    expect(result.current.isTransitioning).toBe(false);
  });

  it("activates the existing session when a duplicate Draft request returns 409", () => {
    const onDraftSessionCreated = vi.fn();
    const { result } = renderHook(() =>
      useDraftSessionTransition({ isDraft: true, onDraftSessionCreated }),
    );

    act(() => {
      result.current.captureDraftResponse(
        new Response(null, {
          status: 409,
          headers: { "X-OpenExcel-Session-Id": "23" },
        }),
      );
    });

    expect(onDraftSessionCreated).toHaveBeenCalledWith(23);
    expect(result.current.isSendLocked()).toBe(true);
  });

  it("keeps the draft locked while retrying a failed session activation", async () => {
    const onDraftSessionCreated = vi.fn().mockRejectedValue(new Error("offline"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderHook(() =>
      useDraftSessionTransition({ isDraft: true, onDraftSessionCreated }),
    );

    act(() => {
      result.current.captureDraftResponse(
        new Response(null, { headers: { "X-OpenExcel-Session-Id": "41" } }),
      );
      result.current.beginTransition();
    });

    await waitFor(() => {
      expect(result.current.isSendLocked()).toBe(true);
      expect(result.current.isTransitioning).toBe(true);
    });

    errorSpy.mockRestore();
  });

  it("identifies the session created by the draft response", () => {
    const { result } = renderHook(() =>
      useDraftSessionTransition({ isDraft: true, onDraftSessionCreated: vi.fn() }),
    );

    act(() => {
      result.current.captureDraftResponse(
        new Response(null, { headers: { "X-OpenExcel-Session-Id": "51" } }),
      );
    });

    expect(result.current.consumeCreatedSessionTransition(51)).toBe(true);
    expect(result.current.consumeCreatedSessionTransition(51)).toBe(false);
    expect(result.current.consumeCreatedSessionTransition(52)).toBe(false);
  });
});
