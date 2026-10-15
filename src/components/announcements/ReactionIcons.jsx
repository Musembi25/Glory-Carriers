export const announcementReactionMeta = [
  { reaction: "love", label: "Love", emoji: "❤️" },
  { reaction: "pray", label: "Pray", emoji: "🙏" },
  { reaction: "great", label: "Great", emoji: "✨" },
  { reaction: "excited", label: "Excited", emoji: "🤩" },
  { reaction: "amen", label: "Amen", emoji: "🙌" },
  { reaction: "like", label: "Like", emoji: "👍" },
  { reaction: "celebrating", label: "Celebrate", emoji: "🎉" },
  { reaction: "helpful", label: "Helpful", emoji: "💡" }
];

export function getReactionMeta(reaction) {
  return announcementReactionMeta.find((item) => item.reaction === reaction);
}

export function getReactionEmoji(reaction) { return getReactionMeta(reaction)?.emoji ?? "❤️"; }
