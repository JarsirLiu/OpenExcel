import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export function useUrlSync(workspacePublicId: string | null) {
  const navigate = useNavigate();
  const location = useLocation();

  const targetPath = useMemo(() => `/workspaces/${workspacePublicId ?? ""}`, [workspacePublicId]);

  useEffect(() => {
    if (targetPath !== location.pathname) {
      navigate(targetPath, { replace: true });
    }
  }, [targetPath, location.pathname, navigate]);
}
