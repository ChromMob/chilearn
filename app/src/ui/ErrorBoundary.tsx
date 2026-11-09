/** Keeps one broken screen or exercise from taking down the whole app. */
import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ fallback: (reset: () => void, err: Error) => ReactNode; children: ReactNode; onError?: (e: Error) => void }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error('UI error', err); this.props.onError?.(err); }
  render() { return this.state.err ? this.props.fallback(() => this.setState({ err: null }), this.state.err) : this.props.children; }
}
