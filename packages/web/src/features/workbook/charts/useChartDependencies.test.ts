import type { ChartSpec } from "@openexcel/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { describe, expect, it } from "vitest";
import type { SheetSchema } from "@/api/workbooks";
import { useChartDependencies } from "./useChartDependencies";

const chart: ChartSpec = {
  id: "chart-1",
  workbookId: "workbook-1",
  sheetId: "1",
  type: "line",
  anchor: { kind: "absolute", xEmu: 0, yEmu: 0, widthEmu: 1, heightEmu: 1 },
  series: [
    {
      id: "series-1",
      valueRef: { sheetId: "2", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    },
  ],
};
const charts = [chart];

function sheet(id: number, loaded: boolean): SheetSchema {
  return {
    id,
    sheetNo: id - 1,
    name: `Sheet${id}`,
    order: id - 1,
    columns: [],
    merges: [],
    uploadedData: loaded ? [] : null,
    config: null,
    revision: 1,
    loaded,
  };
}

describe("useChartDependencies", () => {
  it("retries a failed dependency load and clears the error after success", async () => {
    let attempts = 0;
    const { result } = renderHook(() => {
      const [sheets, setSheets] = useState([sheet(1, true), sheet(2, false)]);
      const onSheetLoad = useCallback(async (sheetId: number) => {
        attempts += 1;
        if (attempts === 1) throw new Error("network failure");
        setSheets((current) =>
          current.map((item) => (item.id === sheetId ? { ...item, loaded: true } : item)),
        );
      }, []);
      return useChartDependencies({
        charts,
        sheets,
        enabled: true,
        onSheetLoad,
      });
    });

    await waitFor(() => expect(result.current.dependencyError).toBe("network failure"));
    expect(attempts).toBe(1);

    act(() => result.current.retryDependencies());

    await waitFor(() => {
      expect(result.current.missingDependencyIds).toEqual([]);
      expect(result.current.dependencyError).toBeNull();
    });
    expect(attempts).toBe(2);
  });
});
