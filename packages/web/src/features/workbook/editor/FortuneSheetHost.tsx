import { Workbook, type WorkbookInstance } from "@fortune-sheet/react";
import { type ComponentProps, memo, type RefObject } from "react";

type WorkbookProps = ComponentProps<typeof Workbook>;

type Props = Omit<WorkbookProps, "ref"> & {
  sessionKey: string;
  workbookRef: RefObject<WorkbookInstance>;
};

/** Keeps the third-party editor mounted independently from document consumers. */
export const FortuneSheetHost = memo(function FortuneSheetHost({
  sessionKey,
  workbookRef,
  ...props
}: Props) {
  return <Workbook key={sessionKey} ref={workbookRef} {...props} />;
});
