import { Component } from "react";

// Optional analysis must never replace the diary or navigation with a fatal screen.
export default class HomeInsightBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <section className="home-insight-card" role="status">
        <p>Osobní rozbor teď není dostupný. Deník a ukládání úlovků můžeš dál používat.</p>
      </section>;
    }
    return this.props.children;
  }
}
