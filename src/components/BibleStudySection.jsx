import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { BIBLE_BOOKS, BIBLE_BOOK_CHAPTERS } from "../lib/bibleBooks.js";
import { BibleStudyPartnerStreaks } from "./BibleStudyPartnerStreaks";
import { FullBibleReader } from "./FullBibleReader.jsx";

const fileFor = (book) => `${import.meta.env.BASE_URL}bible/web/${book.toLowerCase().replace(/\s/g, "")}.json`;
const Book = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>
</svg>;
const stamp = (date) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
const avatar = (person) => person?.avatar_url ? <img src={person.avatar_url} alt=""/> : (person?.full_name || "Member").split(" ").map((word) => word[0]).slice(0,2).join("").toUpperCase();
const REACTIONS = [
  ["praying_hands", "🙏", "Praying hands"], ["smile", "😊", "Smile"], ["bowing", "🙇", "Bow"],
  ["thumbs_up", "👍", "Thumbs up"], ["crying", "😢", "Crying"], ["amazed", "😮", "Amazed"],
  ["love", "❤️", "Love"], ["clapping", "👏", "Clapping"], ["shy", "🫣", "Shy"]
];
const REACTION_META = Object.fromEntries([
  ...REACTIONS,
  ["fire", "🔥", "Fire"], ["laugh", "😄", "Laugh"], ["folded_hands", "🙏", "Praying hands"]
].map(([value, emoji, label]) => [value, { emoji, label }]));

function MentionComposer({ value, onChange, profiles, placeholder, label }) {
  const [open, setOpen] = useState(false); const match = value.match(/(?:^|\s)@([^\s@]*)$/); const query = match?.[1]?.toLowerCase() || "";
  const matches = open && match ? profiles.filter((person) => person.is_active && (person.full_name || "").toLowerCase().includes(query)).slice(0,6) : [];
  const choose = (person) => { const at = value.lastIndexOf("@"); onChange(`${value.slice(0, at)}@${person.full_name} `); setOpen(false); };
  return <div className="bible-mention-wrap">
<textarea value={value} onChange={(event) => { onChange(event.target.value); setOpen(event.target.value.includes("@")); }} onFocus={() => setOpen(value.includes("@"))} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder={placeholder} aria-label={label} maxLength="2000"/>{matches.length ? <div className="bible-mention-menu" role="listbox">{matches.map((person) => <button key={person.id} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(person)}>
<span className="bible-avatar">{avatar(person)}</span>{person.full_name}</button>)}</div> : null}</div>;
}

export function BibleStudySection({ user, profile, profiles, isAdmin }) {
  const [activeTab, setActiveTab] = useState("read");
  const [state, setState] = useState({ readings:[], completions:[], takeaways:[], reactions:[], replies:[], questions:[], answers:[] });
  const [takeawayAudio, setTakeawayAudio] = useState(null), [audioDuration, setAudioDuration] = useState(null), [audioError, setAudioError] = useState(""), [recording, setRecording] = useState(false), [audioUrls, setAudioUrls] = useState({}), [audioPreviewUrl, setAudioPreviewUrl] = useState("");
  const recorderRef = useRef(null), recorderStartedAtRef = useRef(0), audioChunksRef = useRef([]);
  const [readingDraft, setReadingDraft] = useState({ book: "", chapter: "", reading_date: "" });
  const [editingReadingId, setEditingReadingId] = useState("");
  const [readingAdminError, setReadingAdminError] = useState("");
  const [reader, setReader] = useState(null), [chapter, setChapter] = useState([]), [selected, setSelected] = useState(""), [takeaway, setTakeaway] = useState(""), [question, setQuestion] = useState(""), [replyDrafts, setReplyDrafts] = useState({}), [answerDrafts, setAnswerDrafts] = useState({}), [editing, setEditing] = useState(null), [editDraft, setEditDraft] = useState(""), [actionMenu, setActionMenu] = useState(""), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const load = useCallback(async (withLoader=true) => { if (!supabase) return; if (withLoader) setLoading(true); const result = await Promise.all([supabase.from("bible_study_readings").select("*").order("sort_order"),supabase.from("bible_study_completions").select("*"),supabase.from("bible_study_takeaways").select("*").order("created_at",{ascending:false}),supabase.from("bible_study_takeaway_reactions").select("*"),supabase.from("bible_study_takeaway_replies").select("*").order("created_at"),supabase.from("bible_study_questions").select("*").order("created_at",{ascending:false}),supabase.from("bible_study_question_answers").select("*").order("created_at")]); if (!result.some((item)=>item.error)) setState({readings:result[0].data||[],completions:result[1].data||[],takeaways:result[2].data||[],reactions:result[3].data||[],replies:result[4].data||[],questions:result[5].data||[],answers:result[6].data||[]}); if (withLoader) setLoading(false); }, []);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!supabase)return;const channel=supabase.channel("bible-study-community");["bible_study_takeaways","bible_study_takeaway_reactions","bible_study_takeaway_replies","bible_study_questions","bible_study_question_answers"].forEach((table)=>channel.on("postgres_changes",{event:"*",schema:"public",table},()=>void load(false)));channel.subscribe();return()=>{void supabase.removeChannel(channel);};},[load]);
  useEffect(()=>{let cancelled=false;const audioPosts=state.takeaways.filter((item)=>item.audio_path);Promise.all(audioPosts.map(async(item)=>{const {data}=await supabase.storage.from("bible-study-audio").createSignedUrl(item.audio_path,3600);return [item.id,data?.signedUrl||""];})).then((items)=>{if(!cancelled)setAudioUrls(Object.fromEntries(items));});return()=>{cancelled=true;};},[state.takeaways]);
  useEffect(()=>{if(!takeawayAudio){setAudioPreviewUrl("");return;}const url=URL.createObjectURL(takeawayAudio);setAudioPreviewUrl(url);return()=>URL.revokeObjectURL(url);},[takeawayAudio]);
  useEffect(()=>()=>{recorderRef.current?.stream?.getTracks?.().forEach((track)=>track.stop());},[]);
  useEffect(()=>{ if(!actionMenu) return undefined; const close=(event)=>{ if(!event.target.closest?.(".bible-actions")) setActionMenu(""); }; document.addEventListener("click",close); return()=>document.removeEventListener("click",close); },[actionMenu]);
  const today=new Date().toISOString().slice(0,10), todayReading=state.readings.find((item)=>item.reading_date===today), current=todayReading||state.readings.filter((item)=>item.reading_date<=today).at(-1)||state.readings[0], discussion=state.readings.find((item)=>item.id===selected)||current;
  const person=(id)=>profiles.find((item)=>item.id===id), done=(reading)=>state.completions.some((item)=>item.reading_id===reading?.id&&item.user_id===user.id), edited=(item)=>item.updated_at&&new Date(item.updated_at)-new Date(item.created_at)>1000;
  const missed=state.readings.filter((item)=>item.reading_date<today&&!done(item)).reverse(); const streak=useMemo(()=>{let total=0;for(const item of [...state.readings].filter((item)=>item.reading_date<=today).reverse()){if(done(item))total++;else break;}return total;},[state.readings,state.completions,today,user.id]);
  const openReader=async(reading)=>{setReader(reading);setChapter([]);try{const source=await fetch(fileFor(reading.book)).then((response)=>response.json());setChapter(source.filter((verse)=>verse.chapterNumber===reading.chapter&&/text$/.test(verse.type)));}catch{setChapter([]);}};
  const mentions=async(type,id,content)=>{const names=[...content.matchAll(/@([^@\n]+?)(?=\s|$|[.,!?])/g)].map((item)=>item[1].trim().toLowerCase());const targets=profiles.filter((item)=>item.is_active&&item.id!==user.id&&names.includes((item.full_name||"").toLowerCase()));if(targets.length)await supabase.from("bible_study_mentions").insert(targets.map((item)=>({content_type:type,content_id:id,mentioned_user_id:item.id,mentioned_by:user.id})));};
  const insert=async(table,payload,callback)=>{setSaving(true);const {data,error}=await supabase.from(table).insert(payload).select().single();if(!error)await callback?.(data);await load(false);setSaving(false);};
  const attachAudio=(file)=>{setAudioError("");if(!file)return;const mime=file.type.split(";")[0].toLowerCase();if(!["audio/webm","audio/ogg","audio/mp4","audio/mpeg","audio/wav","audio/x-wav","audio/aac"].includes(mime)||file.size>25*1024*1024){setAudioError("Choose a supported audio file under 25 MB.");return;}setTakeawayAudio(file);setAudioDuration(null);};
  const beginRecording=async()=>{setAudioError("");if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setAudioError("Audio recording is not supported in this browser. You can attach an audio file instead.");return;}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const types=["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/mp4"];const mimeType=types.find((type)=>MediaRecorder.isTypeSupported(type));const recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);audioChunksRef.current=[];recorder.ondataavailable=(event)=>{if(event.data.size)audioChunksRef.current.push(event.data);};recorder.onstop=()=>{const blob=new Blob(audioChunksRef.current,{type:recorder.mimeType||"audio/webm"});if(blob.size>25*1024*1024){setAudioError("That recording is larger than 25 MB. Please record a shorter takeaway.");setTakeawayAudio(null);}else{setTakeawayAudio(new File([blob],`takeaway-${Date.now()}.${(recorder.mimeType||"").includes("mp4")?"m4a":(recorder.mimeType||"").includes("ogg")?"ogg":"webm"}`,{type:recorder.mimeType||"audio/webm"}));setAudioDuration(Math.max(1,Math.round((Date.now()-recorderStartedAtRef.current)/1000)));}stream.getTracks().forEach((track)=>track.stop());};recorderRef.current=recorder;recorderStartedAtRef.current=Date.now();recorder.start();setRecording(true);}catch{setAudioError("Microphone access was not available. Check your browser permission and try again.");}};
  const stopRecording=()=>{if(recorderRef.current?.state==="recording"){recorderRef.current.stop();setRecording(false);}};
  const publishTakeaway=async(event)=>{event.preventDefault();const content=takeaway.trim();if(!discussion||(!content&&!takeawayAudio))return;setSaving(true);setAudioError("");let audioPath=null;try{if(takeawayAudio){const mime=takeawayAudio.type.split(";")[0].toLowerCase();const extension={"audio/webm":"webm","audio/ogg":"ogg","audio/mp4":"m4a","audio/mpeg":"mp3","audio/wav":"wav","audio/x-wav":"wav","audio/aac":"aac"}[mime];audioPath=`${user.id}/${crypto.randomUUID()}.${extension}`;const {error:uploadError}=await supabase.storage.from("bible-study-audio").upload(audioPath,takeawayAudio,{contentType:mime,upsert:false});if(uploadError)throw uploadError;}const {error}=await supabase.from("bible_study_takeaways").insert({reading_id:discussion.id,user_id:user.id,content:content||null,audio_path:audioPath,audio_mime_type:takeawayAudio?.type.split(";")[0]||null,audio_duration_seconds:audioDuration}).select().single();if(error)throw error;setTakeaway("");setTakeawayAudio(null);setAudioDuration(null);await load(false);}catch(error){if(audioPath)await supabase.storage.from("bible-study-audio").remove([audioPath]);setAudioError(error.message||"Your takeaway could not be shared. Please try again.");}finally{setSaving(false);}};
  const saveReading=async(event)=>{event.preventDefault();const book=readingDraft.book,chapterNumber=Number(readingDraft.chapter),date=readingDraft.reading_date;if(!BIBLE_BOOK_CHAPTERS[book]||!Number.isInteger(chapterNumber)||chapterNumber<1||chapterNumber>BIBLE_BOOK_CHAPTERS[book]||!date||date<today){setReadingAdminError("Choose a valid book, chapter, and today or future date.");return;}setReadingAdminError("");setSaving(true);const existing=state.readings.find((item)=>item.id===editingReadingId);const payload={book,chapter:chapterNumber,reading_date:date};const result=existing?await supabase.from("bible_study_readings").update(payload).eq("id",existing.id).gt("reading_date",today):await supabase.from("bible_study_readings").insert({...payload,sort_order:Math.max(0,...state.readings.map((item)=>item.sort_order))+1,status:"scheduled",created_by:user.id});if(result.error)setReadingAdminError(result.error.message);else{setReadingDraft({book:"",chapter:"",reading_date:""});setEditingReadingId("");await load(false);}setSaving(false);};
  const edit=async()=>{if(!editing||(!editDraft.trim()&&!editing.item.audio_path))return;setSaving(true);let query=supabase.from(editing.table).update({content:editDraft.trim()||null,updated_at:new Date().toISOString()}).eq("id",editing.item.id);if(!isAdmin)query=query.eq("user_id",user.id);const {error}=await query;if(!error)setEditing(null);await load(false);setSaving(false);};
  const reactionsFor=(target)=>state.reactions.filter((item)=>(item.content_type ? item.content_type===target.type&&item.content_id===target.id : target.type==="takeaway"&&item.takeaway_id===target.id));
  const toggleReaction=async(target,reaction)=>{const existing=reactionsFor(target).find((item)=>item.user_id===user.id&&item.reaction===reaction);setSaving(true);if(existing)await supabase.from("bible_study_takeaway_reactions").delete().eq("id",existing.id);else await supabase.from("bible_study_takeaway_reactions").insert({takeaway_id:target.type==="takeaway"?target.id:null,content_type:target.type,content_id:target.id,user_id:user.id,reaction});await load(false);setSaving(false);};
  const remove=async(table,item,noun)=>{if(!window.confirm(`Delete this ${noun}? This action cannot be undone.`))return;setSaving(true);let query=supabase.from(table).delete().eq("id",item.id);if(!isAdmin)query=query.eq("user_id",user.id);const {error}=await query;if(!error&&table==="bible_study_takeaways"&&item.audio_path)await supabase.storage.from("bible-study-audio").remove([item.audio_path]);await load(false);setSaving(false);};
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
  const ReactedMembers=({target})=>{const groups=Object.entries(reactionsFor(target).reduce((all,item)=>{(all[item.reaction]??=[]).push(item);return all;},{}));if(!groups.length)return null;return <div className="bible-reacted-members" aria-label="Members who reacted">{groups.map(([reaction,items])=>{const meta=REACTION_META[reaction]||{emoji:"•",label:reaction};const names=items.map((item)=>person(item.user_id)?.full_name||"Member");return <div key={reaction}><span aria-label={meta.label}>{meta.emoji}</span><span className="bible-reactor-stack">{items.slice(0,3).map((item)=><span className="bible-reactor" key={item.id} title={person(item.user_id)?.full_name||"Member"}>{avatar(person(item.user_id))}</span>)}</span><small>{names.join(", ")}</small></div>;})}</div>;};
  const ReactionBar=({target})=>{const reactions=reactionsFor(target);const groups=Object.entries(reactions.reduce((all,item)=>{(all[item.reaction]??=[]).push(item);return all;},{}));return <div className="bible-reaction-row">
    {groups.length?<div className="bible-reaction-summary" aria-label="Reaction totals">{groups.map(([value,items])=><span key={value} title={(REACTION_META[value]?.label||value)+": "+items.length}><span aria-hidden="true">{REACTION_META[value]?.emoji||"•"}</span><b>{items.length}</b></span>)}</div>:null}
    <details className="bible-reaction-picker"><summary aria-label="Add a reaction">React</summary><div className="bible-text-reactions" aria-label="Choose a reaction">{REACTIONS.map(([value,emoji,label])=>{const count=reactions.filter((item)=>item.reaction===value).length;const selected=reactions.some((item)=>item.user_id===user.id&&item.reaction===value);return <button key={value} type="button" className={selected?"selected":""} aria-label={`${label}${count?`: ${count}`:""}`} aria-pressed={selected} title={label} disabled={saving} onClick={(event)=>{event.currentTarget.closest("details").open=false;void toggleReaction(target,value);}}><span aria-hidden="true">{emoji}</span>{count?<b>{count}</b>:null}</button>;})}</div></details>
    <ReactedMembers target={target}/>
  </div>;};
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
</header>{editing?.item.id===item.id?<Editor kind="reply"/>:<p>{item.content}</p>}<ReactionBar target={{type:table==="bible_study_takeaway_replies"?"takeaway_reply":"question_answer",id:item.id}}/></div>
</article>;

  if (loading) return <div className="bible-study bible-loading" role="status">Preparing Bible Study…</div>;

  const tabs = [["read", "Read Bible"], ["group", "Group Study"], ["takeaways", "Takeaways"], ["progress", "My Progress"]];
  const todayTakeaways = state.takeaways.filter((item) => item.reading_id === discussion?.id);
  const groupCompletionCount = todayReading ? new Set(state.completions.filter((item) => item.reading_id === todayReading.id).map((item) => item.user_id)).size : 0;

  return <div className="bible-study">
    <header className="bible-page-header">
      <div>
        <p className="bible-page-eyebrow">Scripture and reflection</p>
        <h1>Bible Study</h1>
        <p>Welcome back, {profile?.full_name?.split(" ")[0] || "friend"}. Read at your pace and grow together.</p>
      </div>
    </header>

    {todayReading ? <section className="bible-today-strip" aria-label="Today's assigned reading">
      <div className="bible-today-copy">
        <span className="bible-today-label">TODAY'S READING</span>
        <h2>{todayReading.book} {todayReading.chapter}</h2>
        <p>{done(todayReading) ? "Today's reading is complete." : "Read today's chapter and mark it complete when you finish."}</p>
      </div>
      <div className="bible-today-actions">
        {done(todayReading) ? <span className="bible-completed-label"><span aria-hidden="true">✓</span> Completed</span> : null}
        <button className="bible-btn primary" type="button" onClick={() => void openReader(todayReading)}><Book/> {done(todayReading) ? "Read again" : "Read today's chapter"}</button>
      </div>
    </section> : <div className="bible-no-reading"><strong>No reading is scheduled for today.</strong><span>Open Read Bible to choose a passage, or check the group plan for upcoming readings.</span></div>}

    <nav className="bible-section-tabs" role="tablist" aria-label="Bible Study sections">
      {tabs.map(([id, label], index) => <button key={id} type="button" role="tab" tabIndex={activeTab === id ? 0 : -1} id={"bible-tab-" + id} aria-controls={"bible-panel-" + id} aria-selected={activeTab === id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)} onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        setActiveTab(tabs[nextIndex][0]);
        document.getElementById("bible-tab-" + tabs[nextIndex][0])?.focus();
      }}>
        {label}{id === "takeaways" && todayTakeaways.length ? <span>{todayTakeaways.length}</span> : null}
      </button>)}
    </nav>

    <section id="bible-panel-read" className="bible-tab-panel" role="tabpanel" aria-labelledby="bible-tab-read" hidden={activeTab !== "read"}>
      <FullBibleReader embedded initialBook={current?.book} initialChapter={current?.chapter}/>
      <p className="bible-reader-note">Browsing Scripture does not change your assigned-reading progress. Mark today's reading complete from the prompt above.</p>
    </section>

    <section id="bible-panel-group" className="bible-tab-panel" role="tabpanel" aria-labelledby="bible-tab-group" hidden={activeTab !== "group"}>
      <div className="bible-section-heading"><div><p className="bible-page-eyebrow">Read together</p><h2>Group Study</h2></div><p>Follow the shared plan and join the conversation.</p></div>
      <section className="bible-panel bible-plan-panel">
        <header><div><small>OUR JOURNEY</small><h2>Reading plan</h2></div></header>
        {todayReading ? <div className="bible-group-progress"><span>Today's group reading</span><strong>{groupCompletionCount} {groupCompletionCount === 1 ? "member" : "members"} completed</strong></div> : null}
        {isAdmin ? <details className="bible-admin-details" open={Boolean(editingReadingId)}>
          <summary>Manage Reading Plan</summary>
          <form className="bible-reading-admin" onSubmit={saveReading}>
            <strong>{editingReadingId ? "Edit future reading" : "Schedule a reading"}</strong>
            <div className="bible-reading-admin-fields">
              <label>Book<select required value={readingDraft.book} onChange={(event) => setReadingDraft((value) => ({ ...value, book: event.target.value, chapter: "" }))}><option value="">Choose a book</option>{BIBLE_BOOKS.map((book) => <option key={book.name} value={book.name}>{book.name}</option>)}</select></label>
              <label>Chapter<input required type="number" min="1" max={BIBLE_BOOK_CHAPTERS[readingDraft.book] || 150} value={readingDraft.chapter} onChange={(event) => setReadingDraft((value) => ({ ...value, chapter: event.target.value }))}/></label>
              <label>Scheduled date<input required type="date" min={today} value={readingDraft.reading_date} onChange={(event) => setReadingDraft((value) => ({ ...value, reading_date: event.target.value }))}/></label>
            </div>
            {readingAdminError ? <p className="bible-reading-admin-error" role="alert">{readingAdminError}</p> : null}
            <div className="bible-reading-admin-actions"><button type="submit" className="bible-btn primary" disabled={saving}>{saving ? "Saving…" : editingReadingId ? "Save reading" : "Add to plan"}</button>
              {editingReadingId ? <button type="button" onClick={() => { setEditingReadingId(""); setReadingDraft({ book: "", chapter: "", reading_date: "" }); setReadingAdminError(""); }}>Cancel</button> : null}
            </div>
          </form>
        </details> : null}
        {state.readings.length ? <div className="bible-plan">{state.readings.map((item) => <div className="bible-plan-row" key={item.id}>
          <button type="button" onClick={() => void openReader(item)} className={item.id === current?.id ? "current" : done(item) ? "done" : ""}>
            <span>{done(item) ? "✓" : "○"}</span><div><strong>{item.book} {item.chapter}</strong><small>{item.reading_date}</small></div>
          </button>
          {isAdmin && item.reading_date > today ? <button type="button" className="bible-plan-edit" onClick={() => { setEditingReadingId(item.id); setReadingDraft({ book: item.book, chapter: String(item.chapter), reading_date: item.reading_date }); setReadingAdminError(""); }}>Edit</button> : null}
        </div>)}</div> : <p className="bible-muted">No readings have been added to the plan yet.</p>}
      </section>

      <section className="bible-panel bible-community">
        <header><div><small>COMMUNITY DISCUSSION</small><h2>Questions and conversations</h2><p className="bible-muted">Ask freely and learn from one another.</p></div></header>
        <form onSubmit={(event) => { event.preventDefault(); if (question.trim()) void insert("bible_study_questions", { user_id: user.id, content: question.trim() }, async (item) => { await mentions("question", item.id, question); setQuestion(""); }); }}>
          <MentionComposer value={question} onChange={setQuestion} profiles={profiles} label="Community chat message" placeholder="Start a conversation. Type @ to mention a member."/>
          <button className="bible-btn primary" disabled={saving || !question.trim()}>Post question</button>
        </form>
        {state.questions.map((post) => <article className="bible-question-card" key={post.id}>
          <header><span className="bible-avatar">{avatar(person(post.user_id))}</span><span><strong>{person(post.user_id)?.full_name || "Member"}</strong><small>{stamp(post.created_at)}{edited(post) ? " · Edited" : ""}</small></span><Actions table="bible_study_questions" item={post} noun="message"/></header>
          {editing?.item.id === post.id ? <Editor kind="message"/> : <p>{post.content}</p>}
          <ReactionBar target={{ type: "question", id: post.id }}/><section className="bible-answers">{state.answers.filter((item) => item.question_id === post.id).map((item) => <Reply key={item.id} item={item} table="bible_study_question_answers"/>)}</section>
          <form onSubmit={(event) => { event.preventDefault(); const content = answerDrafts[post.id]?.trim(); if (content) void insert("bible_study_question_answers", { question_id: post.id, user_id: user.id, content }, async (item) => { await mentions("question_answer", item.id, content); setAnswerDrafts((value) => ({ ...value, [post.id]: "" })); }); }}>
            <MentionComposer value={answerDrafts[post.id] || ""} onChange={(value) => setAnswerDrafts((drafts) => ({ ...drafts, [post.id]: value }))} profiles={profiles} label="Reply to message" placeholder="Write a reply. Type @ to mention a member."/><button className="bible-btn secondary" disabled={saving || !answerDrafts[post.id]?.trim()}>Reply</button>
          </form>
        </article>)}
        {!state.questions.length ? <p className="bible-muted bible-empty-conversation">Start the conversation.</p> : null}
      </section>
    </section>

    <section id="bible-panel-takeaways" className="bible-tab-panel" role="tabpanel" aria-labelledby="bible-tab-takeaways" hidden={activeTab !== "takeaways"}>
      <div className="bible-section-heading">
        <div><p className="bible-page-eyebrow">Reflect together</p><h2>Takeaways</h2></div>
        <label className="bible-select"><span>Reading</span><select value={discussion?.id || ""} onChange={(event) => setSelected(event.target.value)} disabled={!state.readings.length}>{state.readings.map((item) => <option key={item.id} value={item.id}>{item.book} {item.chapter} · {item.reading_date}</option>)}</select></label>
      </div>
      <section className="bible-panel bible-takeaways-panel">
        {discussion ? <form className="bible-takeaway-composer" onSubmit={publishTakeaway}>
          <textarea value={takeaway} onChange={(event) => setTakeaway(event.target.value)} placeholder={"What stood out to you in " + discussion.book + " " + discussion.chapter + "?"} maxLength="3000" aria-label="Your Bible Study takeaway"/>
          <div className="bible-audio-tools">
            <label className="bible-audio-attach">Attach audio<input type="file" accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,audio/aac" onChange={(event) => attachAudio(event.target.files?.[0])}/></label>
            {recording ? <button type="button" className="bible-btn secondary" onClick={stopRecording}>Stop recording</button> : <button type="button" className="bible-btn secondary" onClick={() => void beginRecording()}>Record voice note</button>}
            {takeawayAudio ? <button type="button" className="bible-audio-remove" onClick={() => { setTakeawayAudio(null); setAudioDuration(null); }}>Remove audio</button> : null}
          </div>
          {recording ? <p className="bible-audio-status" role="status">Recording… select Stop recording when you are finished.</p> : null}
          {audioPreviewUrl ? <audio className="bible-audio-player" controls src={audioPreviewUrl}>Audio preview</audio> : null}
          {audioError ? <p className="bible-audio-error" role="alert">{audioError}</p> : null}
          <button className="bible-btn primary" disabled={saving || recording || (!takeaway.trim() && !takeawayAudio)}>{saving ? "Sharing…" : "Share takeaway"}</button>
        </form> : <p className="bible-muted">Takeaways will appear here when a reading is added to the plan.</p>}
        <div className="bible-feed">{todayTakeaways.map((post) => <article className="bible-takeaway" key={post.id}>
          <span className="bible-avatar">{avatar(person(post.user_id))}</span>
          <div className="bible-takeaway-content">
            <header><span><strong>{person(post.user_id)?.full_name || "Member"}</strong><small>{stamp(post.created_at)}{edited(post) ? " · Edited" : ""}</small></span><Actions table="bible_study_takeaways" item={post} noun="takeaway"/></header>
            {editing?.item.id === post.id ? <Editor kind="takeaway"/> : <>{post.content ? <p>{post.content}</p> : null}{post.audio_path ? <audio className="bible-audio-player" controls preload="none" src={audioUrls[post.id] || undefined}>Your browser does not support audio playback.</audio> : null}{post.audio_duration_seconds ? <small className="bible-audio-caption">Voice note · {Math.floor(post.audio_duration_seconds / 60)}:{String(post.audio_duration_seconds % 60).padStart(2, "0")}</small> : null}</>}
            <ReactionBar target={{ type: "takeaway", id: post.id }}/><section className="bible-thread"><strong>{state.replies.some((item) => item.takeaway_id === post.id) ? "Conversation" : "Be the first to respond to this takeaway."}</strong>
              {state.replies.filter((item) => item.takeaway_id === post.id).slice(-8).map((item) => <Reply key={item.id} item={item}/>)}
              <form onSubmit={(event) => { event.preventDefault(); const content = replyDrafts[post.id]?.trim(); if (content) void insert("bible_study_takeaway_replies", { takeaway_id: post.id, user_id: user.id, content }, async (item) => { await mentions("takeaway_reply", item.id, content); setReplyDrafts((drafts) => ({ ...drafts, [post.id]: "" })); }); }}>
                <MentionComposer value={replyDrafts[post.id] || ""} onChange={(value) => setReplyDrafts((drafts) => ({ ...drafts, [post.id]: value }))} profiles={profiles} label="Reply to takeaway" placeholder="Write a reply. Type @ to mention a member."/><button className="bible-btn secondary" disabled={saving || !replyDrafts[post.id]?.trim()}>Reply</button>
              </form>
            </section>
          </div>
        </article>)}</div>
        {discussion && !todayTakeaways.length ? <p className="bible-muted bible-empty-conversation">No takeaways for this reading yet. Share the first reflection.</p> : null}
      </section>
    </section>

    <section id="bible-panel-progress" className="bible-tab-panel" role="tabpanel" aria-labelledby="bible-tab-progress" hidden={activeTab !== "progress"}>
      <div className="bible-section-heading"><div><p className="bible-page-eyebrow">Your reading rhythm</p><h2>My Progress</h2></div><p>A steady practice, one reading at a time.</p></div>
      <section className="bible-progress-summary"><div><span className="bible-progress-mark" aria-hidden="true">↗</span><div><strong>{streak} {streak === 1 ? "day" : "days"}</strong><span>current reading streak</span></div></div><p>{todayReading ? done(todayReading) ? "Today's group reading is complete." : "Complete today's assigned reading to keep your rhythm going." : "A reading plan will appear here when one is scheduled."}</p></section>
      <section className="bible-panel bible-catchup"><header><div><small>READING HISTORY</small><h2>{missed.length ? missed.length + " earlier " + (missed.length === 1 ? "reading" : "readings") : "You're caught up"}</h2></div></header>
        <p className="bible-muted">Past readings remain available whenever you are ready.</p>
        {missed.length ? <div className="bible-catchup-list">{missed.map((item) => <button type="button" key={item.id} onClick={() => void openReader(item)}><Book/><span><strong>{item.book} {item.chapter}</strong><small>{item.reading_date}</small></span><b>Read</b></button>)}</div> : null}
      </section>
      <BibleStudyPartnerStreaks user={user} profiles={profiles} readings={state.readings} completions={state.completions}/>
    </section>

    {reader ? <div className="bible-reader-overlay"><section className="bible-reader" role="dialog" aria-modal="true" aria-labelledby="assigned-reading-title">
      <header><div><small>WORLD ENGLISH BIBLE</small><h2 id="assigned-reading-title">{reader.book} {reader.chapter}</h2></div><button type="button" onClick={() => setReader(null)}>Close</button></header>
      <main>{chapter.length ? chapter.map((verse, index) => <p key={String(verse.verseNumber) + "-" + index}><sup>{verse.verseNumber}</sup>{verse.value}</p>) : <p className="bible-muted">Loading this chapter…</p>}</main>
      <footer><button className="bible-btn primary" disabled={done(reader) || saving} onClick={() => void insert("bible_study_completions", { reading_id: reader.id, user_id: user.id })}>{done(reader) ? "Chapter completed" : "Mark as completed"}</button></footer>
    </section></div> : null}
  </div>;
}
