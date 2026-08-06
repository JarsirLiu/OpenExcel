import { Workbook, type WorkbookInstance } from "@fortune-sheet/react";
import { type ComponentProps, memo, type RefObject, useCallback, useEffect, useRef } from "react";

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
  const eventsReadyRef = useRef(false);
  const sessionKeyRef = useRef(sessionKey);
  if (sessionKeyRef.current !== sessionKey) {
    sessionKeyRef.current = sessionKey;
    eventsReadyRef.current = false;
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      eventsReadyRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [sessionKey]);

  const onChange = useCallback<NonNullable<WorkbookProps["onChange"]>>(
    (...args) => {
      if (eventsReadyRef.current) props.onChange?.(...args);
    },
    [props.onChange],
  );
  const onOp = useCallback<NonNullable<WorkbookProps["onOp"]>>(
    (...args) => {
      if (eventsReadyRef.current) props.onOp?.(...args);
    },
    [props.onOp],
  );

  return <Workbook key={sessionKey} ref={workbookRef} {...props} onChange={onChange} onOp={onOp} />;
});
