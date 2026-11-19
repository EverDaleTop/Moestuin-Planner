import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Vangt renderfouten op zodat één kapot scherm niet de hele app leegmaakt. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Onverwachte fout:", error, info);
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="err-screen">
        <div className="err-card">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <h1>Er ging iets mis</h1>
          <p>
            Dit onderdeel kon niet worden geladen. Je gegevens zijn niet aangepast.
          </p>
          <button type="button" className="btn-primary" onClick={this.reload}>
            Opnieuw laden
          </button>
        </div>
      </div>
    );
  }
}
