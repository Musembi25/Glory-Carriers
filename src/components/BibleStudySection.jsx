import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { BibleStudyPartnerStreaks } from "./BibleStudyPartnerStreaks";

const fileFor = (book) => `${import.meta.env.BASE_URL}bible/web/${book.toLowerCase().replace(/\s/g, "")}.json`;
const Book = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>
</svg>;
const stamp = (date) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
const avatar = (person) => person?.avatar_url ? <img src={person.avatar_url} alt=""/> : (person?.full_name || "Member").split(" ").map((word) => word[0]).slice(0,2).join("").toUpperCase();

function MentionComposer({ value, onChange, profiles, placeholder, label }) {
  const [open, setOpen] = useState(false); const match = value.match(/(?:^|\s)@([^\s@]*)$/); const query = match?.[1]?.toLowerCase() || "";
  const matches = open && match ? profiles.filter((person) => person.is_active && (person.full_name || "").toLowerCase().includes(query)).slice(0,6) : [];
  const choose = (person) => { const at = value.lastIndexOf("@"); onChange(`${value.slice(0, at)}@${person.full_name} `); setOpen(false); };
  return <div className="bible-mention-wrap">
<textarea value={value} onChange={(event) => { onChange(event.target.value); setOpen(event.target.value.includes("@")); }} onFocus={() => setOpen(value.includes("@"))} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder={placeholder} aria-label={label} maxLength="2000"/>{matches.length ? <div className="bible-mention-menu" role="listbox">{matches.map((person) => <button key={person.id} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(person)}>
<span className="bible-avatar">{avatar(person)}</span>{person.full_name}</button>)}</div> : null}</div>;
}

export function BibleStudySection({ user, profile, profiles, isAdmin }) {
  const [state, setState] = useState({ readings:[], completions:[], takeaways:[], reactions:[], replies:[], questions:[], answers:[] });
  const [reader, setReader] = useState(null), [chapter, setChapter] = useState([]), [selected, setSelected] = useState(""), [takeaway, setTakeaway] = useState(""), [question, setQuestion] = useState(""), [replyDrafts, setReplyDrafts] = useState({}), [answerDrafts, setAnswerDrafts] = useState({}), [editing, setEditing] = useState(null), [editDraft, setEditDraft] = useState(""), [actionMenu, setActionMenu] = useState(""), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const load = useCallback(async (withLoader=true) => { if (!supabase) return; if (withLoader) setLoading(true); const result = await Promise.all([supabase.from("bible_study_readings").select("*").order("sort_order"),supabase.from("bible_study_completions").select("*"),supabase.from("bible_study_takeaways").select("*").order("created_at",{ascending:false}),supabase.from("bible_study_takeaway_reactions").select("*"),supabase.from("bible_study_takeaway_replies").select("*").order("created_at"),supabase.from("bible_study_questions").select("*").order("created_at",{ascending:false}),supabase.from("bible_study_question_answers").select("*").order("created_at")]); if (!result.some((item)=>item.error)) setState({readings:result[0].data||[],completions:result[1].data||[],takeaways:result[2].data||[],reactions:result[3].data||[],replies:result[4].data||[],questions:result[5].data||[],answers:result[6].data||[]}); if (withLoader) setLoading(false); }, []);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!supabase)return;const channel=supabase.channel("bible-study-community");["bible_study_takeaways","bible_study_takeaway_replies","bible_study_questions","bible_study_question_answers"].forEach((table)=>channel.on("postgres_changes",{event:"*",schema:"public",table},()=>void load(false)));channel.subscribe();return()=>{void supabase.removeChannel(channel);};},[load]);
  useEffect(()=>{ if(!actionMenu) return undefined; const close=(event)=>{ if(!event.target.closest?.(".bible-actions")) setActionMenu(""); }; document.addEventListener("click",close); return()=>document.removeEventListener("click",close); },[actionMenu]);
  const today=new Date().toISOString().slice(0,10), current=state.readings.find((item)=>item.reading_date===today)||state.readings.filter((item)=>item.reading_date<=today).at(-1)||state.readings[0], discussion=state.readings.find((item)=>item.id===selected)||current;
  const person=(id)=>profiles.find((item)=>item.id===id), done=(reading)=>state.completions.some((item)=>item.reading_id===reading?.id&&item.user_id===user.id), edited=(item)=>item.updated_at&&new Date(item.updated_at)-new Date(item.created_at)>1000;
  const missed=state.readings.filter((item)=>item.reading_date<today&&!done(item)).reverse(); const streak=useMemo(()=>{let total=0;for(const item of [...state.readings].filter((item)=>item.reading_date<=today).reverse()){if(done(item))total++;else break;}return total;},[state.readings,state.completions,today,user.id]);
  const openReader=async(reading)=>{setReader(reading);setChapter([]);try{const source=await fetch(fileFor(reading.book)).then((response)=>response.json());setChapter(source.filter((verse)=>verse.chapterNumber===reading.chapter&&/text$/.test(verse.type)));}catch{setChapter([]);}};
  const mentions=async(type,id,content)=>{const names=[...content.matchAll(/@([^@\n]+?)(?=\s|$|[.,!?])/g)].map((item)=>item[1].trim().toLowerCase());const targets=profiles.filter((item)=>item.is_active&&item.id!==user.id&&names.includes((item.full_name||"").toLowerCase()));if(targets.length)await supabase.from("bible_study_mentions").insert(targets.map((item)=>({content_type:type,content_id:id,mentioned_user_id:item.id,mentioned_by:user.id})));};
  const insert=async(table,payload,callback)=>{setSaving(true);const {data,error}=await supabase.from(table).insert(payload).select().single();if(!error)await callback?.(data);await load(false);setSaving(false);};
  const edit=async()=>{if(!editing||!editDraft.trim())return;setSaving(true);await supabase.from(editing.table).update({content:editDraft.trim(),updated_at:new Date().toISOString()}).eq("id",editing.item.id).eq("user_id",user.id);setEditing(null);await load(false);setSaving(false);};
  const toggleReaction=async(takeawayId,reaction)=>{const existing=state.reactions.find((item)=>item.takeaway_id===takeawayId&&item.user_id===user.id&&item.reaction===reaction);setSaving(true);if(existing)await supabase.from("bible_study_takeaway_reactions").delete().eq("id",existing.id);else await supabase.from("bible_study_takeaway_reactions").insert({takeaway_id:takeawayId,user_id:user.id,reaction});await load(false);setSaving(false);};
  const remove=async(table,item,noun)=>{if(!window.confirm(`Delete this ${noun}? This action cannot be undone.`))return;setSaving(true);await supabase.from(table).delete().eq("id",item.id).eq("user_id",user.id);await load(false);setSaving(false);};
  const Actions=({table,item,noun})=>{const id=`${table}-${item.id}`,open=actionMenu===id;return (item.user_id===user.id||isAdmin)?<div className="bible-actions">
<button type="button" className="bible-actions-trigger" aria-label={`Actions for this ${noun}`} aria-haspopup="menu" aria-expanded={open} onClick={(event)=>{event.stopPropagation();setActionMenu(open?"":id);}}>•••</button>{open?<div className="bible-actions-menu" role="menu" aria-label={`${noun} actions`}>
<button type="button" role="menuitem" onClick={(event)=>{event.stopPropagation();setActionMenu("");setEditing({table,item,noun});setEditDraft(item.content);}}>Edit</button>
<button type="button" role="menuitem" className="danger" onClick={(event)=>{event.stopPropagation();setActionMenu("");void remove(table,item,noun);}}>Delete</button>
</div>:null}</div>:null;};
  const Editor=({kind})=>
<div className="bible-editor">
<strong>Editing {kind}</strong>
<MentionComposer value={editDraft} onChange={setEditDraft} profiles={profiles} label={`Editing ${kind}`} placeholder="Update your message"/>
<div>
<button type="button" onClick={()=>setEditing(null)}>Cancel</button>
<button type="button" className="bible-btn primary" onClick={()=>void edit()} disabled={saving}>Save changes</button>
</div>
</div>;
  const Reply=({item,table="bible_study_takeaway_replies"})=>
<article className="bible-thread-reply">
<span className="bible-avatar">{avatar(person(item.user_id))}</span>
<div>
<header>
<span>
<strong>{person(item.user_id)?.full_name||"Member"}</strong>
<small>{stamp(item.created_at)}{edited(item)?" · Edited":""}</small>
</span>
<Actions table={table} item={item} noun="reply"/>
</header>{editing?.item.id===item.id?<Editor kind="reply"/>:<p>{item.content}</p>}</div>
</article>;
  if(loading)return <div className="bible-study bible-loading">Preparing Bible Study…</div>;
  return <div className="bible-study">
<section className="bible-hero">
<div>
<p>Welcome back, {profile?.full_name?.split(" ")[0]||"friend"}.</p>
<h1>Bible Study</h1>
<span>Read together. Grow together.</span>
</div>
<div className="bible-hero-reading">
<small>TODAY'S READING</small>
<strong>{current?.book} {current?.chapter}</strong>
<span>{current?.reading_date} · Day {current?.sort_order}</span>
</div>
</section>{current?<>
<section className="bible-overview">
<article className="bible-current">
<small>TODAY</small>
<h2>{current.book} {current.chapter}</h2>
<p>{done(current)?"Completed for today.":"Read today's chapter and share your takeaway."}</p>
<button className="bible-btn primary" onClick={()=>void openReader(current)}>
<Book/> Read chapter</button>
</article>
<article className={`bible-stat bible-streak-card ${streak?"is-active":""}`}>
<small>YOUR RHYTHM</small>
<div className="bible-streak-display">
<span className="bible-streak-fire">◆</span>
<strong>{streak}</strong>
<span className="bible-streak-smile">◡</span>
</div>
<span>DAY STREAK</span>
<p>{streak?"Your reading rhythm is active.":"Complete a chapter to begin your rhythm."}</p>
</article>
</section>
<section className="bible-layout">
<main className="bible-main">
<section className="bible-panel">
<header>
<div>
<small>SHARED TAKEAWAYS</small>
<h2>What stood out to us?</h2>
</div>
</header>
<label className="bible-select">
<span>Chapter</span>
<select value={discussion?.id||""} onChange={(event)=>setSelected(event.target.value)}>{state.readings.map((item)=>
<option key={item.id} value={item.id}>{item.book} {item.chapter} · {item.reading_date}</option>)}</select>
</label>
<form onSubmit={(event)=>{event.preventDefault();if(takeaway.trim())void insert("bible_study_takeaways",{reading_id:discussion.id,user_id:user.id,content:takeaway.trim()},()=>setTakeaway(""));}}>
<textarea value={takeaway} onChange={(event)=>setTakeaway(event.target.value)} placeholder="Share your takeaway" maxLength="3000"/>
<button className="bible-btn primary" disabled={saving||!takeaway.trim()}>Share takeaway</button>
</form>
<div className="bible-feed">{state.takeaways.filter((item)=>item.reading_id===discussion?.id).map((post)=>
<article className="bible-takeaway" key={post.id}>
<span className="bible-avatar">{avatar(person(post.user_id))}</span>
<div className="bible-takeaway-content">
<header>
<span>
<strong>{person(post.user_id)?.full_name||"Member"}</strong>
<small>{stamp(post.created_at)}{edited(post)?" · Edited":""}</small>
</span>
<Actions table="bible_study_takeaways" item={post} noun="takeaway"/>
</header>{editing?.item.id===post.id?<Editor kind="takeaway"/>:<p>{post.content}</p>}<section className="bible-thread">
<strong>{state.replies.some((item)=>item.takeaway_id===post.id)?"Conversation":"Be the first to respond to this takeaway."}</strong>{state.replies.filter((item)=>item.takeaway_id===post.id).slice(-8).map((item)=>
<Reply key={item.id} item={item}/>) }<form onSubmit={(event)=>{event.preventDefault();const content=replyDrafts[post.id]?.trim();if(content)void insert("bible_study_takeaway_replies",{takeaway_id:post.id,user_id:user.id,content},async(item)=>{await mentions("takeaway_reply",item.id,content);setReplyDrafts((state)=>({...state,[post.id]:""}));});}}>
<MentionComposer value={replyDrafts[post.id]||""} onChange={(value)=>setReplyDrafts((state)=>({...state,[post.id]:value}))} profiles={profiles} label="Reply to takeaway" placeholder="Write a reply. Type @ to mention a member."/>
<button className="bible-btn secondary" disabled={saving||!replyDrafts[post.id]?.trim()}>Reply</button>
</form>
</section>
</div>
</article>)}</div>
</section>
<section className="bible-panel bible-community">
<header>
<div>
<small>COMMUNITY LIVE CHAT</small>
<h2>Questions and conversations</h2>
<p className="bible-muted">Ask freely and learn from one another.</p>
</div>
</header>
<form onSubmit={(event)=>{event.preventDefault();if(question.trim())void insert("bible_study_questions",{user_id:user.id,content:question.trim()},async(item)=>{await mentions("question",item.id,question);setQuestion("");});}}>
<MentionComposer value={question} onChange={setQuestion} profiles={profiles} label="Community chat message" placeholder="Start the conversation. Type @ to mention a member."/>
<button className="bible-btn primary" disabled={saving||!question.trim()}>Post question</button>
</form>{state.questions.map((post)=>
<article className="bible-question-card" key={post.id}>
<header>
<span className="bible-avatar">{avatar(person(post.user_id))}</span>
<span>
<strong>{person(post.user_id)?.full_name||"Member"}</strong>
<small>{stamp(post.created_at)}{edited(post)?" · Edited":""}</small>
</span>
<Actions table="bible_study_questions" item={post} noun="message"/>
</header>{editing?.item.id===post.id?<Editor kind="message"/>:<p>{post.content}</p>}<section className="bible-answers">{state.answers.filter((item)=>item.question_id===post.id).map((item)=>
<Reply key={item.id} item={item} table="bible_study_question_answers"/>)}</section>
<form onSubmit={(event)=>{event.preventDefault();const content=answerDrafts[post.id]?.trim();if(content)void insert("bible_study_question_answers",{question_id:post.id,user_id:user.id,content},async(item)=>{await mentions("question_answer",item.id,content);setAnswerDrafts((state)=>({...state,[post.id]:""}));});}}>
<MentionComposer value={answerDrafts[post.id]||""} onChange={(value)=>setAnswerDrafts((state)=>({...state,[post.id]:value}))} profiles={profiles} label="Reply to message" placeholder="Write a reply. Type @ to mention a member."/>
<button className="bible-btn secondary" disabled={saving||!answerDrafts[post.id]?.trim()}>Reply</button>
</form>
</article>)}{!state.questions.length?<p className="bible-muted bible-empty-conversation">Start the conversation.</p>:null}</section>
<BibleStudyPartnerStreaks user={user} profiles={profiles} readings={state.readings} completions={state.completions}/>
</main>
<aside className="bible-side">
<section className="bible-panel bible-catchup">
<small>YOUR CATCH-UP PATH</small>
<h2>{missed.length?`${missed.length} chapter${missed.length===1?"":"s"} waiting`:"You are caught up"}</h2>
<p className="bible-muted">Every past chapter remains open.</p>
<div className="bible-catchup-list">{missed.map((item)=>
<button key={item.id} onClick={()=>void openReader(item)}>
<Book/>
<span>
<strong>{item.book} {item.chapter}</strong>
<small>{item.reading_date}</small>
</span>
<b>Read</b>
</button>)}</div>
</section>
<section className="bible-panel">
<small>READING PLAN</small>
<h2>Our journey</h2>
<div className="bible-plan">{state.readings.map((item)=>
<button key={item.id} onClick={()=>void openReader(item)} className={item.id===current.id?"current":done(item)?"done":""}>
<span>{done(item)?"✓":"○"}</span>
<div>
<strong>{item.book} {item.chapter}</strong>
<small>{item.reading_date}</small>
</div>
</button>)}</div>
</section>
</aside>
</section>
</>:null}{reader?<div className="bible-reader-overlay">
<section className="bible-reader">
<header>
<div>
<small>WORLD ENGLISH BIBLE</small>
<h2>{reader.book} {reader.chapter}</h2>
</div>
<button onClick={()=>setReader(null)}>Close</button>
</header>
<main>{chapter.map((verse,index)=>
<p key={`${verse.verseNumber}-${index}`}>
<sup>{verse.verseNumber}</sup>{verse.value}</p>)}</main>
<footer>
<button className="bible-btn primary" disabled={done(reader)||saving} onClick={()=>void insert("bible_study_completions",{reading_id:reader.id,user_id:user.id})}>{done(reader)?"Chapter completed":"Mark as completed"}</button>
</footer>
</section>
</div>:null}</div>;
}
