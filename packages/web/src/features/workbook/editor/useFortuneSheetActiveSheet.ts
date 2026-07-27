import type { WorkbookInstance } from "@fortune-sheet/react";
import { useEffect } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import { findSheetIndexById } from "../sheetIdentity";

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  workbookRef: React.RefObject<WorkbookInstance | null>;
  workbook: WorkbookFull | null;
  currentSheetIndex: number;
  onSheetIndexChange?: (sheetIndex: number) => void;
};

function findActiveSheetIndex(
  root: HTMLElement,
  workbookRef: React.RefObject<WorkbookInstance | null>,
  workbook: WorkbookFull,
): number {
  const tabRoot = root.querySelector<HTMLElement>("#fortune-sheettab-container");
  const activeTab = tabRoot?.querySelector<HTMLElement>(".luckysheet-sheets-item-active");
  const activeTabName = activeTab
    ?.querySelector<HTMLElement>(".luckysheet-sheets-item-name")
    ?.textContent?.trim();
  if (activeTabName) {
    const index = workbook.sheets.findIndex((sheet) => sheet.name === activeTabName);
    if (index >= 0) return index;
  }

  const activeSheet = workbookRef.current?.getSheet();
  if (activeSheet?.id != null) {
    const index = findSheetIndexById(workbook.sheets, activeSheet.id);
    if (index >= 0) return index;
  }

  if (!tabRoot || !activeTab) return -1;

  const tabs = Array.from(tabRoot.querySelectorAll<HTMLElement>(".luckysheet-sheets-item"));
  return tabs.indexOf(activeTab);
}

export function useFortuneSheetActiveSheet({
  containerRef,
  workbookRef,
  workbook,
  currentSheetIndex,
  onSheetIndexChange,
}: Props) {
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !workbook || !onSheetIndexChange) return;

    let frame: number | null = null;
    const syncActiveSheet = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        const nextIndex = findActiveSheetIndex(root, workbookRef, workbook);
        if (nextIndex >= 0 && nextIndex !== currentSheetIndex) {
          onSheetIndexChange(nextIndex);
        }
      });
    };

    const observer = new MutationObserver(syncActiveSheet);
    observer.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    root.addEventListener("click", syncActiveSheet, true);
    syncActiveSheet();

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("click", syncActiveSheet, true);
    };
  }, [containerRef, currentSheetIndex, onSheetIndexChange, workbook, workbookRef]);
}
