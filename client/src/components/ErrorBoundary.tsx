import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level React error boundary.
 *
 * One render error in any descendant currently white-screens the
 * whole React95 desktop, leaving the user with no recourse other
 * than a hard refresh.  This catches the throw, surfaces the message
 * (in dev) or a generic apology (in prod), and offers a reload
 * button so the session-cookie/session-store state survives.
 *
 * Add per-route boundaries inside individual microapps if you want
 * finer-grained recovery.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== "undefined") {
      console.error("[ErrorBoundary] caught", error, info);
    }
  }

  private handleReload = (): void => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const isDev =
      typeof process !== "undefined" && process.env?.NODE_ENV !== "production";

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          fontFamily: "monospace",
          background: "#0c0c0c",
          color: "#f4f4f4",
        }}
      >
        <div
          style={{
            maxWidth: 540,
            border: "1px solid #444",
            background: "#161616",
            padding: "24px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          <h1 style={{ marginTop: 0, fontSize: 20 }}>
            Something broke in the desktop.
          </h1>
          <p style={{ marginBottom: 16 }}>
            The page hit an unrecoverable error. Reload to start fresh — your
            session should still be intact.
          </p>
          {isDev && this.state.error ? (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 12,
                background: "#000",
                padding: "8px",
                marginBottom: 16,
                maxHeight: 240,
                overflow: "auto",
              }}
            >
              {this.state.error.stack || String(this.state.error)}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: "8px 16px",
              background: "#fff",
              color: "#000",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
