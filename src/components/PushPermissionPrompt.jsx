export function PushPermissionPrompt({ isOpen, onEnable, onDismiss }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="push-prompt-overlay" role="presentation" onClick={onDismiss}>
      <div
        className="push-prompt-card"
        role="dialog"
        aria-labelledby="push-prompt-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="push-prompt-icon" aria-hidden="true">
          🔔
        </span>
        <h2 id="push-prompt-title">Stay updated anywhere</h2>
        <p>
          Get instant alerts for messages, assignments, meetings, and announcements — even when
          Glory Carriers is closed or your screen is locked.
        </p>
        <ul className="push-prompt-list">
          <li>Works on phone, tablet, and desktop</li>
          <li>Syncs across your signed-in devices</li>
          <li>You control categories and quiet hours</li>
        </ul>
        <div className="push-prompt-actions">
          <button type="button" className="accent-button" onClick={onEnable}>
            Enable notifications
          </button>
          <button type="button" className="ghost-button" onClick={onDismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
