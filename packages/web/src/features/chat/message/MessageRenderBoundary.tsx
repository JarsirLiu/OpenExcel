import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class MessageRenderBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    console.error("[chat] Failed to render message:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "8px 12px", color: "var(--hint-foreground)", fontSize: 12 }}>
          此条结果暂时无法展示
        </div>
      );
    }

    return this.props.children;
  }
}
