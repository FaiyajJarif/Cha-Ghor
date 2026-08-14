import { Component } from "react";

// Minimal error boundary. Leaflet / react-leaflet can throw at import or mount
// time if the dependency isn't installed yet (npm i leaflet react-leaflet) or
// if a browser API is missing. Instead of blanking the whole board we catch it
// here and render the `fallback` prop.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Map failed to render:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
