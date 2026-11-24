// Catches render/runtime errors from the 3D scene and swaps in the 2D fallback.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  onError: (error: Error) => void;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export default class SceneErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Simulation 3D scene failed, switching to 2D', error, info.componentStack);
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
