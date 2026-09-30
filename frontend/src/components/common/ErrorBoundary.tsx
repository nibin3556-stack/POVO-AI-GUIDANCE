import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LABELS } from '../../constants/labels';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Changing this key resets the boundary (e.g. on route change). */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey?: string;
}

/** Last line of defence around a page: shows a message and a reload button instead of a blank screen. */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="m-6 flex flex-col items-center gap-3 rounded-[13px] border border-line bg-white p-8 text-center shadow-e1">
        <b className="text-base font-bold text-ink">{LABELS.app.crashTitle}</b>
        <span className="text-sm text-ink3">{this.state.error.message}</span>
        <button type="button" onClick={this.handleReload} className="rounded-[9px] bg-blue px-5 py-2 text-sm font-semibold text-white">
          {LABELS.app.reload}
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
