import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { announcementReactionMeta, getReactionEmoji, getReactionMeta } from "./ReactionIcons.jsx";

const ENTITY_TABLE = "announcements";

function getInitials(label) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function MemberAvatar({ member, size = "small" }) {
  const label = member?.full_name || member?.email || "Member";

  if (member?.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt=""
        className={`announcement-avatar ${size}`}
      />
    );
  }

  return (
    <span className={`announcement-avatar fallback ${size}`} aria-hidden="true">
      {getInitials(label)}
    </span>
  );
}

export function AnnouncementReactions({
  announcementId,
  entityTable = ENTITY_TABLE,
  reactions,
  profiles,
  userId,
  disabled,
  onToggle,
  onMessageShortcut
}) {
  const [showParticipants, setShowParticipants] = useState(false);
  const [feedback, setFeedback] = useState("");
  const feedbackTimerRef = useRef(null);

  const rows = useMemo(
    () =>
      reactions.filter(
        (row) => row.entity_table === entityTable && row.entity_id === announcementId
      ),
    [reactions, announcementId, entityTable]
  );

  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles]
  );

  const userReaction = useMemo(
    () => rows.find((row) => row.user_id === userId)?.reaction ?? null,
    [rows, userId]
  );

  const reactionCounts = useMemo(
    () =>
      announcementReactionMeta.reduce((acc, item) => {
        acc[item.reaction] = rows.filter((row) => row.reaction === item.reaction).length;
        return acc;
      }, {}),
    [rows]
  );

  const totalReactions = rows.length;

  const topReactions = useMemo(
    () =>
      announcementReactionMeta
        .map((item) => ({ ...item, count: reactionCounts[item.reaction] ?? 0 }))
        .filter((item) => item.count > 0)
        .sort((left, right) => right.count - left.count)
        .slice(0, 4),
    [reactionCounts]
  );

  const participants = useMemo(() => {
    const seen = new Set();
    const list = [];

    for (const row of rows) {
      if (seen.has(row.user_id)) {
        continue;
      }

      seen.add(row.user_id);
      const profile = profileById.get(row.user_id);
      list.push({
        id: row.user_id,
        profile,
        reaction: getReactionMeta(row.reaction)?.reaction ?? "love"
      });
    }

    return list;
  }, [rows, profileById]);

  const showFeedback = useCallback((text) => {
    setFeedback(text);
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = setTimeout(() => setFeedback(""), 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  async function handleToggle(reaction) {
    const wasSelected = userReaction === reaction;
    const result = await onToggle({ entityTable, entityId: announcementId, reaction });

    if (result !== false) {
      showFeedback(wasSelected ? "Removed" : "You reacted");
    }
  }

  return (
    <div className="announcement-reactions">
      {totalReactions > 0 ? (
        <div className="announcement-reaction-stats" aria-live="polite">
          <div className="announcement-reaction-stats-chips">
            {topReactions.map((item) => (
              <span key={item.reaction} className="announcement-reaction-stat">
                <span className="announcement-reaction-emoji" aria-hidden="true">
                  {item.emoji}
                </span>
                <span className="announcement-reaction-stat-count">{item.count}</span>
              </span>
            ))}
          </div>
          <span className="announcement-reaction-stat-total">
            {totalReactions} total
          </span>
        </div>
      ) : null}

      <div className="announcement-reaction-tray">
        <div className="announcement-reaction-picker" role="group" aria-label="React to announcement">
          {announcementReactionMeta.map((item) => {
            const isSelected = userReaction === item.reaction;
            const count = reactionCounts[item.reaction] ?? 0;

            return (
              <button
                key={item.reaction}
                type="button"
                className={`announcement-reaction-btn${isSelected ? " active" : ""}`}
                onClick={() => handleToggle(item.reaction)}
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={
                  isSelected
                    ? `Remove your ${item.label} reaction`
                    : count
                      ? `${item.label}, ${count} reactions`
                      : `React with ${item.label}`
                }
              >
                <span className="announcement-reaction-btn-emoji" aria-hidden="true">
                  {item.emoji}
                </span>
                {count > 0 ? (
                  <span className="announcement-reaction-btn-badge">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="announcement-reaction-toolbar">
        {participants.length > 0 ? (
          <button
            type="button"
            className="announcement-participant-trigger"
            onClick={() => setShowParticipants((value) => !value)}
            aria-expanded={showParticipants}
            aria-label={`${participants.length} members reacted`}
          >
            <span className="announcement-avatar-stack" aria-hidden="true">
              {participants.slice(0, 4).map((participant) => (
                <MemberAvatar key={participant.id} member={participant.profile} size="tiny" />
              ))}
            </span>
            <span className="announcement-participant-label">
              {participants.length}
            </span>
          </button>
        ) : (
          <span className="announcement-participant-label muted">Tap to react</span>
        )}

        {feedback ? (
          <span className="announcement-reaction-feedback" role="status">
            {feedback}
          </span>
        ) : null}

        <button
          type="button"
          className="announcement-message-shortcut"
          onClick={onMessageShortcut}
          aria-label="Open messages"
        >
          <span className="announcement-reaction-btn-emoji" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-7.5A7.5 7.5 0 0 1 10.5 6H12"/><path d="M16 3v6m-3-3h6"/></svg></span>
        </button>
      </div>

      {showParticipants && participants.length > 0 ? (
        <div className="announcement-participant-panel" role="dialog" aria-label="Members who reacted">
          <div className="announcement-participant-panel-header">
            <strong>{participants.length} reacted</strong>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setShowParticipants(false)}
            >
              Close
            </button>
          </div>
          <ul className="announcement-participant-list">
            {participants.map((participant) => {
              const name =
                participant.profile?.full_name ||
                participant.profile?.email ||
                "Member";

              return (
                <li key={participant.id}>
                  <MemberAvatar member={participant.profile} size="small" />
                  <span className="announcement-participant-name">{name}</span>
                  <span className="announcement-participant-reaction">
                    <span className="announcement-reaction-btn-emoji" aria-hidden="true">
                      {getReactionEmoji(participant.reaction)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AnnouncementReplyReactions({ replyId, reactions, userId, disabled, onToggle }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const rows = useMemo(
    () => reactions.filter((row) => row.entity_table === "announcement_replies" && row.entity_id === replyId),
    [reactions, replyId]
  );
  const counts = useMemo(
    () => rows.reduce((result, row) => {
      result[row.reaction] = (result[row.reaction] ?? 0) + 1;
      return result;
    }, {}),
    [rows]
  );
  const userReaction = rows.find((row) => row.user_id === userId)?.reaction ?? null;
  const usedReactions = announcementReactionMeta.filter((item) => counts[item.reaction]);

  async function toggle(reaction) {
    await onToggle({ entityTable: "announcement_replies", entityId: replyId, reaction });
    setPickerOpen(false);
  }

  return (
    <div className="community-reply-reactions">
      {usedReactions.map((item) => (
        <button
          key={item.reaction}
          type="button"
          className={`community-reply-reaction${userReaction === item.reaction ? " active" : ""}`}
          aria-pressed={userReaction === item.reaction}
          aria-label={`${item.label}, ${counts[item.reaction]} reactions${userReaction === item.reaction ? ", remove your reaction" : ""}`}
          title={item.label}
          disabled={disabled}
          onClick={() => void toggle(item.reaction)}
        >
          <span aria-hidden="true">{item.emoji}</span>
          <span className="community-reply-reaction-count">{counts[item.reaction]}</span>
        </button>
      ))}
      <div className="community-reply-reaction-picker-wrap">
        <button
          type="button"
          className="community-reply-react-trigger"
          aria-expanded={pickerOpen}
          aria-label={pickerOpen ? "Close reaction picker" : "React to comment"}
          disabled={disabled}
          onClick={() => setPickerOpen((open) => !open)}
        >
          <span aria-hidden="true">{userReaction ? getReactionEmoji(userReaction) : "+"}</span>
          <span>{userReaction ? "Reacted" : "React"}</span>
        </button>
        {pickerOpen ? (
          <div className="community-reply-reaction-picker" role="group" aria-label="Choose a reaction">
            {announcementReactionMeta.map((item) => (
              <button
                key={item.reaction}
                type="button"
                className={userReaction === item.reaction ? "active" : ""}
                aria-label={`${userReaction === item.reaction ? "Remove" : "React with"} ${item.label}`}
                aria-pressed={userReaction === item.reaction}
                title={item.label}
                disabled={disabled}
                onClick={() => void toggle(item.reaction)}
              >
                <span aria-hidden="true">{item.emoji}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function getAnnouncementReactionTotals(reactions, announcementIds) {
  const idSet = new Set(announcementIds);
  const rows = reactions.filter(
    (row) => row.entity_table === ENTITY_TABLE && idSet.has(row.entity_id)
  );

  return {
    total: rows.length,
    uniqueReactors: new Set(rows.map((row) => row.user_id)).size,
    byType: rows.reduce((acc, row) => {
      acc[row.reaction] = (acc[row.reaction] ?? 0) + 1;
      return acc;
    }, {})
  };
}
