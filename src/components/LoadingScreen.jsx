import { BrandLogo } from "./BrandLogo.jsx";
import { CELL_GROUP_NAME } from "../lib/identity";

export function LoadingScreen() {
  return (
    <main className="fullscreen-shell">
      <div className="floating-card loading-card">
        <BrandLogo compact />
        <div className="spinner" aria-hidden="true" />
        <p className="eyebrow">{CELL_GROUP_NAME}</p>
        <h1>Syncing your planning space...</h1>
        <p className="muted-text">
          Connecting authentication, realtime updates, and your shared event
          data.
        </p>
      </div>
    </main>
  );
}
