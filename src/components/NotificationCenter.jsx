import { useMemo, useState } from "react";
import {
  getNotificationCategory,
  NOTIFICATION_CATEGORIES
} from "../lib/notificationRouting.js";

function isToday(dateValue) {
  const date = new Date(dateValue);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function groupNotifications(notifications, filter) {
  const active = notifications.filter((notification) => {
    if (filter === "archive") {
      return Boolean(notification.archived_at);
    }

    if (notification.archived_at) {
      return false;
    }

    if (filter === "unread") {
      return !notification.read_at;
    }

    return true;
  });

  const unread = [];
  const today = [];
  const earlier = [];

  for (const notification of active) {
    if (!notification.read_at) {
      unread.push(notification);
      continue;
    }

    if (isToday(notification.created_at)) {
      today.push(notification);
      continue;
    }

    earlier.push(notification);
  }

  return { unread, today, earlier, active };
}

export function NotificationCenter({
  notifications,
  isOpen,
  onClose,
  onOpenNotification,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  onArchive,
  formatDateTime
}) {
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNotifications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return notifications.filter((notification) => {
      const category = getNotificationCategory(notification.notification_type);

      if (categoryFilter !== "all" && category !== categoryFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        notification.title?.toLowerCase().includes(query) ||
        notification.body?.toLowerCase().includes(query)
      );
    });
  }, [notifications, categoryFilter, searchQuery]);

  const grouped = useMemo(
    () => groupNotifications(filteredNotifications, filter),
    [filteredNotifications, filter]
  );

  const unreadCount = notifications.filter(
    (notification) => !notification.read_at && !notification.archived_at
  ).length;

  if (!isOpen) {
    return null;
  }

  function renderNotificationItem(notification) {
    return (
      <article
        key={notification.id}
        className={`nc-item${notification.read_at ? "" : " unread"}${
          notification.archived_at ? " archived" : ""
        }`}
        role="button"
        tabIndex={0}
        onClick={() => onOpenNotification(notification)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenNotification(notification);
          }
        }}
      >
        <div className="nc-item-main">
          <div className="nc-item-top">
            <strong>{notification.title}</strong>
            <span className="nc-item-time">{formatDateTime(notification.created_at)}</span>
          </div>
          <p>{notification.body}</p>
          <span className="nc-item-category">
            {NOTIFICATION_CATEGORIES.find(
              (category) => category.id === getNotificationCategory(notification.notification_type)
            )?.label || "Update"}
          </span>
        </div>
        <div className="nc-item-actions">
          {!notification.archived_at ? (
            <button
              type="button"
              className="ghost-button compact"
              onClick={(event) => {
                event.stopPropagation();
                onMarkRead(notification.id, !notification.read_at);
              }}
            >
              {notification.read_at ? "Unread" : "Read"}
            </button>
          ) : null}
          {!notification.archived_at ? (
            <button
              type="button"
              className="ghost-button compact"
              onClick={(event) => {
                event.stopPropagation();
                onArchive(notification.id, true);
              }}
            >
              Archive
            </button>
          ) : (
            <button
              type="button"
              className="ghost-button compact"
              onClick={(event) => {
                event.stopPropagation();
                onArchive(notification.id, false);
              }}
            >
              Restore
            </button>
          )}
          <button
            type="button"
            className="ghost-button compact danger"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(notification.id);
            }}
          >
            Delete
          </button>
        </div>
      </article>
    );
  }

  function renderSection(title, items) {
    if (!items.length) {
      return null;
    }

    return (
      <section className="nc-section">
        <h3>{title}</h3>
        <div className="nc-list">{items.map(renderNotificationItem)}</div>
      </section>
    );
  }

  return (
    <div className="nc-overlay" role="presentation" onClick={onClose}>
      <div
        className="nc-panel"
        role="dialog"
        aria-label="Notification center"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="nc-header">
          <div>
            <h2>Notifications</h2>
            <p>{unreadCount} unread</p>
          </div>
          <div className="nc-header-actions">
            {unreadCount > 0 ? (
              <button type="button" className="text-button" onClick={onMarkAllRead}>
                Mark all read
              </button>
            ) : null}
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="nc-controls">
          <input
            type="search"
            className="nc-search"
            placeholder="Search notifications"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="Search notifications"
          />

          <div className="nc-filters">
            {[
              { id: "all", label: "All" },
              { id: "unread", label: "Unread" },
              { id: "archive", label: "Archive" }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nc-filter-chip${filter === item.id ? " active" : ""}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="nc-category-filter">
            <span className="sr-only">Filter by category</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">All categories</option>
              {NOTIFICATION_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="nc-body">
          {filter === "archive" ? (
            grouped.active.length ? (
              <div className="nc-list">{grouped.active.map(renderNotificationItem)}</div>
            ) : (
              <div className="nc-empty">No archived notifications.</div>
            )
          ) : (
            <>
              {renderSection("Unread", grouped.unread)}
              {renderSection("Today", grouped.today)}
              {renderSection("Earlier", grouped.earlier)}
              {!grouped.unread.length && !grouped.today.length && !grouped.earlier.length ? (
                <div className="nc-empty">No notifications match your filters.</div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
