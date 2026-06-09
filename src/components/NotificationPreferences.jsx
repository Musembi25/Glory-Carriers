import { NOTIFICATION_CATEGORIES } from "../lib/notificationRouting.js";

const PREFERENCE_FIELDS = [
  { key: "push_enabled", label: "Push notifications", description: "Receive alerts when the app is closed." },
  ...NOTIFICATION_CATEGORIES.map((category) => ({
    key: `${category.id}_enabled`,
    label: category.label,
    description: `Alerts for ${category.label.toLowerCase()} updates.`
  })),
  {
    key: "quiet_hours_enabled",
    label: "Quiet hours",
    description: "Mute push alerts during selected hours."
  }
];

export function NotificationPreferences({
  preferences,
  pushSupported,
  pushPermission,
  deviceCount,
  onChange,
  onEnablePush,
  onDisablePush,
  saving
}) {
  if (!preferences) {
    return <div className="np-loading">Loading notification settings...</div>;
  }

  return (
    <div className="np-panel">
      <div className="np-header">
        <div>
          <h3>Notification settings</h3>
          <p>
            {deviceCount} registered {deviceCount === 1 ? "device" : "devices"}
            {pushPermission === "granted" ? " • Push enabled" : ""}
          </p>
        </div>
        {pushSupported ? (
          pushPermission === "granted" ? (
            <button type="button" className="ghost-button" onClick={onDisablePush} disabled={saving}>
              Turn off push
            </button>
          ) : (
            <button type="button" className="accent-button" onClick={onEnablePush} disabled={saving}>
              Enable push
            </button>
          )
        ) : (
          <span className="np-hint">Push not supported on this browser.</span>
        )}
      </div>

      <div className="np-grid">
        {PREFERENCE_FIELDS.map((field) => {
          if (field.key === "quiet_hours_enabled") {
            return (
              <div key={field.key} className="np-quiet-hours">
                <label className="np-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(preferences.quiet_hours_enabled)}
                    onChange={(event) => onChange(field.key, event.target.checked)}
                  />
                  <span>
                    <strong>{field.label}</strong>
                    <small>{field.description}</small>
                  </span>
                </label>
                {preferences.quiet_hours_enabled ? (
                  <div className="np-quiet-range">
                    <label className="field">
                      <span>Start</span>
                      <input
                        type="time"
                        value={preferences.quiet_hours_start?.slice(0, 5) || "22:00"}
                        onChange={(event) => onChange("quiet_hours_start", `${event.target.value}:00`)}
                      />
                    </label>
                    <label className="field">
                      <span>End</span>
                      <input
                        type="time"
                        value={preferences.quiet_hours_end?.slice(0, 5) || "07:00"}
                        onChange={(event) => onChange("quiet_hours_end", `${event.target.value}:00`)}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <label key={field.key} className="np-toggle">
              <input
                type="checkbox"
                checked={Boolean(preferences[field.key])}
                onChange={(event) => onChange(field.key, event.target.checked)}
              />
              <span>
                <strong>{field.label}</strong>
                <small>{field.description}</small>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
