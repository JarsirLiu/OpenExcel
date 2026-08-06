import { useCallback, useState } from "react";

export function useWorkbookSession() {
  const [sessionRevision, setSessionRevision] = useState(0);

  const bumpSession = useCallback(() => {
    setSessionRevision((revision) => revision + 1);
  }, []);

  return {
    sessionRevision,
    bumpSession,
  };
}
