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
    <div className="announcement-reactions pulse-reaction-row" role="group" aria-label="Post reactions">
      <button
        type="button"
        className={`pulse-like-button${userReaction === "like" ? " active" : ""}`}
        onClick={() => handleToggle("like")}
        disabled={disabled}
        aria-pressed={userReaction === "like"}
        aria-label={userReaction === "like" ? "Unlike this post" : "Like this post"}
      >
        <svg viewBox="0 0 24 24" fill={userReaction === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M20.8 8.2c0 5-8.8 10.2-8.8 10.2S3.2 13.2 3.2 8.2A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.8 1.9Z" /></svg>
        <span>Like</span>
      </button>
      {totalReactions > 0 ? <span className="pulse-reaction-total" aria-live="polite"><span aria-hidden="true">{topReactions.slice(0, 2).map((item) => item.emoji).join("")}</span>{totalReactions}</span> : null}
      <details className="pulse-reaction-menu">
        <summary aria-label="More reactions"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg></summary>
        <div className="pulse-reaction-popover" role="group" aria-label="More reactions">
          {announcementReactionMeta.filter((item) => item.reaction !== "like").map((item) => <button key={item.reaction} type="button" className={userReaction === item.reaction ? "active" : ""} onClick={() => handleToggle(item.reaction)} disabled={disabled} aria-pressed={userReaction === item.reaction} aria-label={`${item.label}${reactionCounts[item.reaction] ? `, ${reactionCounts[item.reaction]} reactions` : ""}`}><span aria-hidden="true">{item.emoji}</span><small>{item.label}</small></button>)}
        </div>
      </details>
      {feedback ? <span className="pulse-reaction-feedback" role="status">{feedback}</span> : null}
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
