import type { ChartSpec } from "@openexcel/core";
import { Component, type ErrorInfo, lazy, type ReactNode, useState } from "react";
import type { SheetSchema } from "@/api/workbooks";
import styles from "./ChartOverlay.module.css";

type RendererProps = {
  chart: ChartSpec;
  sheets: readonly SheetSchema[];
};

type BoundaryProps = {
  children: ReactNode;
  onRetry: () => void;
};

type BoundaryState = {
  hasError: boolean;
};

class ChartRendererErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    console.error("[workbook] Failed to load chart renderer:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className={styles.loading} role="alert">
        <span>图表加载失败</span>
        <button
          type="button"
          className={styles.retry}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={this.props.onRetry}
        >
          重试
        </button>
      </div>
    );
  }
}

function loadChartRenderer() {
  return import("./ChartRenderer").then(({ ChartRenderer }) => ({ default: ChartRenderer }));
}

const InitialChartRenderer = lazy(loadChartRenderer);

export function ChartRendererBoundary({ chart, sheets }: RendererProps) {
  const [attempt, setAttempt] = useState(0);
  const [ChartRenderer, setChartRenderer] = useState(() => InitialChartRenderer);
  const retry = () => {
    setChartRenderer(() => lazy(loadChartRenderer));
    setAttempt((value) => value + 1);
  };

  return (
    <ChartRendererErrorBoundary key={attempt} onRetry={retry}>
      <ChartRenderer chart={chart} sheets={sheets} />
    </ChartRendererErrorBoundary>
  );
}
