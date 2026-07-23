import type { WorkbookInstance } from "@fortune-sheet/react";
import { type RefObject, useEffect, useState } from "react";

export type DemoGridFocus = {
  sheetIndex: number;
  range?: string;
  sequence: number;
};

export type DemoGridRange = {
  row: [number, number];
  column: [number, number];
};

const CELL_REFERENCE = /^([A-Z]+)([1-9]\d*)$/i;

function columnIndex(label: string): number {
  return (
    [...label.toUpperCase()].reduce(
      (value, character) => value * 26 + character.charCodeAt(0) - 64,
      0,
    ) - 1
  );
}

export function parseDemoGridRange(value: string): DemoGridRange | null {
  const [startValue, endValue = startValue] = value.replace(/\$/g, "").split(":");
  const start = startValue?.match(CELL_REFERENCE);
  const end = endValue?.match(CELL_REFERENCE);
  if (!start || !end) return null;

  const startRow = Number(start[2]) - 1;
  const endRow = Number(end[2]) - 1;
  const startColumn = columnIndex(start[1]);
  const endColumn = columnIndex(end[1]);

  return {
    row: [Math.min(startRow, endRow), Math.max(startRow, endRow)],
    column: [Math.min(startColumn, endColumn), Math.max(startColumn, endColumn)],
  };
}

type UseDemoGridFocusInput = {
  workbookRef: RefObject<WorkbookInstance | null>;
  focus?: DemoGridFocus;
  sessionKey: number;
};

export function useDemoGridFocus({
  workbookRef,
  focus,
  sessionKey,
}: UseDemoGridFocusInput): boolean {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!focus) {
      setIsActive(false);
      return;
    }

    const range = focus.range ? parseDemoGridRange(focus.range) : null;
    let scanTimer: number | undefined;
    const applyTimer = window.setTimeout(() => {
      const instance = workbookRef.current;
      if (!instance) return;

      instance.activateSheet({ index: focus.sheetIndex });
      if (range) {
        instance.scroll({
          targetRow: range.row[0],
          targetColumn: range.column[0],
        });

        if (range.row[1] - range.row[0] > 12) {
          scanTimer = window.setTimeout(() => {
            instance.scroll({
              targetRow: Math.min(range.row[1], range.row[0] + 12),
              targetColumn: range.column[0],
            });
          }, 280);
        }
      }
      setIsActive(true);
    }, 80);
    const pulseTimer = window.setTimeout(() => setIsActive(false), 980);

    return () => {
      window.clearTimeout(applyTimer);
      window.clearTimeout(pulseTimer);
      if (scanTimer !== undefined) window.clearTimeout(scanTimer);
    };
  }, [focus, sessionKey, workbookRef]);

  return isActive;
}
