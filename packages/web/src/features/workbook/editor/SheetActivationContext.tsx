import { createContext, useContext, useRef, useCallback, type ReactNode } from "react";

type SheetActivationContextType = {
  activateSheetByIndex: (index: number) => void;
  registerActivateSheet: (fn: ((index: number) => void) | null) => void;
};

const SheetActivationContext = createContext<SheetActivationContextType | null>(null);

export function SheetActivationProvider({ children }: { children: ReactNode }) {
  const activateFnRef = useRef<((index: number) => void) | null>(null);

  const activateSheetByIndex = useCallback((index: number) => {
    activateFnRef.current?.(index);
  }, []);

  const registerActivateSheet = useCallback((fn: ((index: number) => void) | null) => {
    activateFnRef.current = fn;
  }, []);

  return (
    <SheetActivationContext.Provider value={{ activateSheetByIndex, registerActivateSheet }}>
      {children}
    </SheetActivationContext.Provider>
  );
}

export function useSheetActivation(): SheetActivationContextType {
  const ctx = useContext(SheetActivationContext);
  if (!ctx) {
    throw new Error("useSheetActivation must be used within a SheetActivationProvider");
  }
  return ctx;
}