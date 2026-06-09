export const announcementReactionMeta = [
  { reaction: "love", emoji: "❤️" },
  { reaction: "pray", emoji: "🙏" },
  { reaction: "great", emoji: "👏" },
  { reaction: "excited", emoji: "🔥" },
  { reaction: "amen", emoji: "🙌" },
  { reaction: "like", emoji: "👍" },
  { reaction: "celebrating", emoji: "🎉" },
  { reaction: "helpful", emoji: "💡" }
];

export function getReactionMeta(reaction) {
  return announcementReactionMeta.find((item) => item.reaction === reaction);
}

export function getReactionEmoji(reaction) {
  return getReactionMeta(reaction)?.emoji ?? "❤️";
}
