import { Component } from "react";
import "./AppErrorBoundary.css";

export default class AppErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <main className="app-error-screen">
        <section className="app-error-card" role="alert" aria-labelledby="app-error-title">
          <span className="app-error-mark" aria-hidden="true">!</span>
          <h1 id="app-error-title">Aplikaci se nepodařilo zobrazit</h1>
          <p>Uložená data zůstávají v zařízení. Zkus aplikaci načíst znovu.</p>
          <button type="button" onClick={() => window.location.reload()}>Načíst znovu</button>
        </section>
      </main>;
    }
    return this.props.children;
  }
}
