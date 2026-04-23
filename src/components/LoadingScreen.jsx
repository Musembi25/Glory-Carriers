export function LoadingScreen() {
  return (
    <main className="fullscreen-shell">
      <div className="floating-card loading-card">
        <div className="spinner" aria-hidden="true" />
        <p className="eyebrow">Glory Carriers</p>
        <h1>Syncing your planning space...</h1>
        <p className="muted-text">
          Connecting authentication, realtime updates, and your shared event
          data.
        </p>
      </div>
    </main>
  );
}
