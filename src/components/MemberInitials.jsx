import { useState } from "react";
import { supabase } from "../lib/supabase";

function getInitials(label) {
  const parts = String(label || "Member").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase() || "M";
}

function getPhotoSource(identity, photoUrl) {
  if (photoUrl !== undefined) return photoUrl || "";
  if (!supabase || !identity.profile_photo_path) return "";
  return supabase.storage.from("profile-photos").getPublicUrl(identity.profile_photo_path).data?.publicUrl || "";
}

export function MemberInitials({ member, person, name, className = "", title, photoUrl }) {
  const identity = member || person || {};
  const label = name || identity.full_name || identity.name || identity.email?.split("@")[0] || "Community member";
  const source = getPhotoSource(identity, photoUrl);
  const [failedSource, setFailedSource] = useState("");
  const showPhoto = source && failedSource !== source;
  return <span className={`member-initials ${className}`.trim()} title={title || label} aria-hidden="true">
    {showPhoto ? <img src={source} alt="" draggable="false" onError={() => setFailedSource(source)} /> : getInitials(label)}
  </span>;
}
