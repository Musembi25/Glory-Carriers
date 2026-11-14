import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { BIBLE_BOOKS, BIBLE_BOOK_CHAPTERS } from "../lib/bibleBooks.js";
import { addReadingDays, DEFAULT_BIBLE_TIMEZONE, getReadingDateInTimezone, getReadingWeekStart, summarizeGroupConsistency, summarizeGroupMemberActivity } from "../lib/personalBibleStudy.js";
import { BibleStudyPartnerStreaks } from "./BibleStudyPartnerStreaks";
import { FullBibleReader } from "./FullBibleReader.jsx";
import { PersonalBibleStudy } from "./PersonalBibleStudy.jsx";
import { VoiceNoteComposer, VoiceNotePlayer } from "./VoiceNoteComposer.jsx";
import { MemberInitials } from "./MemberInitials.jsx";

const fileFor = (book) => `${import.meta.env.BASE_URL}bible/web/${book.toLowerCase().replace(/\s/g, "")}.json`;
const Book = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>
</svg>;
const stamp = (date) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
function BibleMemberIdentity({ person }) {
  return <MemberInitials member={person} className="bible-member-identity-art" />;
}
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
<span className="bible-identity"><BibleMemberIdentity person={person} /></span>{person.full_name}</button>)}</div> : null}</div>;
}

export function BibleStudySection({ user, profile, profiles, isAdmin, groupId, focusPartnerStreaks = false, onPartnerStreakFocusHandled, onPersonalReadingsChange, onCarryReflectionToPrayer }) {
  const [activeTab, setActiveTab] = useState("read");
  const [activeJourney, setActiveJourney] = useState("personal");
  const [libraryReaderOpen, setLibraryReaderOpen] = useState(false);
  const [libraryReaderMounted, setLibraryReaderMounted] = useState(false);
  const [librarySelection, setLibrarySelection] = useState(null);
  const [state, setState] = useState({ readings:[], completions:[], takeaways:[], reactions:[], replies:[], questions:[], answers:[], dailyContent:[], dailyResponses:[], dailyReactions:[], sessions:[] });
  const [streakSettings, setStreakSettings] = useState(null);
  const [audioUrls, setAudioUrls] = useState({});
  const [takeawayAudioDraft, setTakeawayAudioDraft] = useState(null);
  const [questionAudioDraft, setQuestionAudioDraft] = useState(null);
  const [replyAudioDrafts, setReplyAudioDrafts] = useState({});
  const [answerAudioDrafts, setAnswerAudioDrafts] = useState({});
  const [readingDraft, setReadingDraft] = useState({ book: "", chapter: "", reading_date: "" });
  const [dailyDraft, setDailyDraft] = useState({content_date:"",verse_reference:"",verse_text:"",verse_encouragement:"",encouragement_title:"",encouragement_message:"",instructions:"",reflection_questions:""});
  const [dailyResponseDrafts, setDailyResponseDrafts] = useState({});
  const [editingDailyId, setEditingDailyId] = useState("");
  const [dailyAdminError, setDailyAdminError] = useState("");
  const [activityDate, setActivityDate] = useState("");
  const [activityMember, setActivityMember] = useState("");
  const [activityStatus, setActivityStatus] = useState("all");
  const [groupCalendarMonth, setGroupCalendarMonth] = useState("");
  const [groupCalendarDate, setGroupCalendarDate] = useState("");
  const [editingReadingId, setEditingReadingId] = useState("");
  const [readingAdminError, setReadingAdminError] = useState("");
  const [reader, setReader] = useState(null), [chapter, setChapter] = useState([]), [readerLoading, setReaderLoading] = useState(false), [readerError, setReaderError] = useState(""), [readerProgress, setReaderProgress] = useState(0), [actionError, setActionError] = useState(""), [reactionErrors, setReactionErrors] = useState({}), [selected, setSelected] = useState(""), [takeaway, setTakeaway] = useState(""), [takeawayReference, setTakeawayReference] = useState(""), [question, setQuestion] = useState(""), [replyDrafts, setReplyDrafts] = useState({}), [answerDrafts, setAnswerDrafts] = useState({}), [editing, setEditing] = useState(null), [editDraft, setEditDraft] = useState(""), [actionMenu, setActionMenu] = useState(""), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const readerCloseRef = useRef(null), readerOverlayRef = useRef(null), readerContentRef = useRef(null), readerLoadIdRef = useRef(0), activeReadingSessionRef = useRef(""), sessionHeartbeatRef = useRef(null), reactionLocksRef = useRef(new Set());
  const [reactionBusy, setReactionBusy] = useState({});
  useEffect(() => {
    if (!focusPartnerStreaks) return;
    setActiveJourney("group");
    setActiveTab("partners");
    onPartnerStreakFocusHandled?.();
  }, [focusPartnerStreaks, onPartnerStreakFocusHandled]);
  const load = useCallback(async (withLoader=true) => {
    if (!supabase || !groupId) return null;
    if (withLoader) setLoading(true);
    const result = await Promise.all([
      supabase.from("bible_study_readings").select("*").eq("group_id",groupId).is("deleted_at",null).order("reading_date").order("sort_order"),
      supabase.from("bible_study_completions").select("*").eq("group_id",groupId),
      supabase.from("bible_study_takeaways").select("*").eq("group_id",groupId).order("created_at",{ascending:false}),
      supabase.from("bible_study_takeaway_reactions").select("*").eq("group_id",groupId),
      supabase.from("bible_study_takeaway_replies").select("*").eq("group_id",groupId).order("created_at"),
      supabase.from("bible_study_questions").select("*").eq("group_id",groupId).order("created_at",{ascending:false}),
      supabase.from("bible_study_question_answers").select("*").eq("group_id",groupId).order("created_at"),
      supabase.from("bible_study_daily_content").select("*").eq("group_id",groupId).is("deleted_at",null).order("content_date",{ascending:false}),
      supabase.from("bible_study_daily_content_responses").select("*").eq("group_id",groupId).order("created_at"),
      supabase.from("bible_study_daily_content_reactions").select("*").eq("group_id",groupId),
      supabase.from("bible_study_reading_sessions").select("*").eq("group_id",groupId),
      supabase.rpc("bible_streak_get_settings")
    ]);
    setState((currentState)=>({
      readings:result[0].error?currentState.readings:(result[0].data||[]).filter((item)=>item.deleted_at==null),
      completions:result[1].error?currentState.completions:result[1].data||[],
      takeaways:result[2].error?currentState.takeaways:result[2].data||[],
      reactions:result[3].error?currentState.reactions:result[3].data||[],
      replies:result[4].error?currentState.replies:result[4].data||[],
      questions:result[5].error?currentState.questions:result[5].data||[],
      answers:result[6].error?currentState.answers:result[6].data||[],
      dailyContent:result[7].error?currentState.dailyContent:result[7].data||[],
      dailyResponses:result[8].error?currentState.dailyResponses:result[8].data||[],
      dailyReactions:result[9].error?currentState.dailyReactions:result[9].data||[],
      sessions:result[10].error?currentState.sessions:result[10].data||[]
    }));
    if(result[3].error)console.error("Bible Study reactions could not load:",result[3].error);
    setReactionErrors((currentErrors)=>({...currentErrors,global:result[3].error?`Reactions could not load: ${result[3].error.message}`:""}));
    setStreakSettings(result[11].error ? null : result[11].data);
    if (withLoader) setLoading(false);
    return result;
  }, [groupId]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!supabase||!groupId)return;const channel=supabase.channel(`bible-study-community-${groupId}`);["bible_study_readings","bible_study_completions","bible_study_takeaways","bible_study_takeaway_reactions","bible_study_takeaway_replies","bible_study_questions","bible_study_question_answers","bible_study_daily_content","bible_study_daily_content_responses","bible_study_daily_content_reactions","bible_study_reading_sessions"].forEach((table)=>channel.on("postgres_changes",{event:"*",schema:"public",table,filter:`group_id=eq.${groupId}`},()=>void load(false)));channel.on("postgres_changes",{event:"*",schema:"public",table:"bible_streak_settings"},()=>void load(false));channel.subscribe((status)=>{if(status==="SUBSCRIBED")void load(false);});return()=>{void supabase.removeChannel(channel);};},[groupId,load]);
  useEffect(()=>{if(!supabase)return;let cancelled=false;const audioPosts=[...state.takeaways,...state.replies,...state.questions,...state.answers].filter((item)=>item.audio_path);Promise.all(audioPosts.map(async(item)=>{const {data,error}=await supabase.storage.from("bible-study-audio").createSignedUrl(item.audio_path,3600);return [item.id,error?"":data?.signedUrl||""];})).then((items)=>{if(!cancelled)setAudioUrls(Object.fromEntries(items));});return()=>{cancelled=true;};},[state.takeaways,state.replies,state.questions,state.answers]);
  useEffect(()=>{ if(!actionMenu) return undefined; const close=(event)=>{ if(!event.target.closest?.(".bible-actions")) setActionMenu(""); }; document.addEventListener("click",close); return()=>document.removeEventListener("click",close); },[actionMenu]);
  const timezone=streakSettings?.application_timezone||DEFAULT_BIBLE_TIMEZONE;
  const today=getReadingDateInTimezone(new Date(),timezone), visibleReadings=state.readings.filter((item)=>isAdmin||item.status!=="draft"), todayReadings=visibleReadings.filter((item)=>item.reading_date===today&&item.status!=="archived"&&item.status!=="draft"), todayReading=todayReadings[0], current=todayReading||visibleReadings.filter((item)=>item.reading_date<=today&&item.status!=="archived"&&item.status!=="draft").at(-1)||visibleReadings[0], discussion=visibleReadings.find((item)=>item.id===selected)||current;
  const libraryPassage = librarySelection || { book: current?.book || "Genesis", chapter: current?.chapter || 1 };
  const handleLibraryChapterChange = useCallback(({ book, chapter }) => {
    setLibrarySelection((selection) => selection?.book === book && selection?.chapter === chapter ? selection : { book, chapter });
  }, []);
  const openLibraryReader = () => { setLibraryReaderMounted(true); setLibraryReaderOpen(true); };
  const dailyContentToday=state.dailyContent.find((item)=>item.content_date===today&&(item.status==="published"||item.status==="closed"))||null;
  const visibleDailyContent=state.dailyContent.filter((item)=>isAdmin||["published","closed","archived"].includes(item.status)).filter((item)=>item.deleted_at==null);
  const upcomingDailyContent=visibleDailyContent.filter((item)=>item.content_date>today&&item.status==="published").sort((left,right)=>left.content_date.localeCompare(right.content_date)).slice(0,4);
  const person=(id)=>profiles.find((item)=>item.id===id), done=(reading)=>state.completions.some((item)=>item.reading_id===reading?.id&&item.user_id===user.id), edited=(item)=>item.updated_at&&new Date(item.updated_at)-new Date(item.created_at)>1000;
  const missed=state.readings.filter((item)=>item.reading_date<today&&item.status!=="archived"&&item.status!=="draft"&&!done(item)).reverse();
  const activeMemberCount=profiles.filter((item)=>item.is_active!==false).length;
  const groupConsistency=useMemo(()=>summarizeGroupConsistency(state.readings,state.completions,activeMemberCount,today,Number(streakSettings?.group_completion_percent)||50),[state.readings,state.completions,activeMemberCount,today,streakSettings?.group_completion_percent]);
  const activityDateValue=activityDate||today;
  const activitySummary=useMemo(()=>summarizeGroupMemberActivity(state.readings,state.completions,state.sessions,profiles,activityDateValue,today),[state.readings,state.completions,state.sessions,profiles,activityDateValue,today]);
  const filteredActivityRows=activitySummary.rows.filter((item)=>(!activityMember||item.id===activityMember)&&(activityStatus==="all"||item.status===activityStatus));
  const groupWeekStart=getReadingWeekStart(today);
  const groupWeekDates=Array.from({length:7},(_,index)=>addReadingDays(groupWeekStart,index));
  const groupDayByDate=new Map(groupConsistency.days.map((day)=>[day.date,day]));
  const calendarMonthValue=groupCalendarMonth||today.slice(0,7);
  const calendarSelectedDate=groupCalendarDate||today;
  const calendarFirstDate=`${calendarMonthValue}-01`;
  const calendarOffset=(new Date(`${calendarFirstDate}T12:00:00Z`).getUTCDay()+6)%7;
  const calendarStartDate=addReadingDays(calendarFirstDate,-calendarOffset);
  const groupCalendarDays=Array.from({length:42},(_,index)=>{
    const date=addReadingDays(calendarStartDate,index);
    return {date,inMonth:date.slice(0,7)===calendarMonthValue,readings:visibleReadings.filter((reading)=>reading.reading_date===date)};
  });
  const selectedCalendarReadings=visibleReadings.filter((reading)=>reading.reading_date===calendarSelectedDate);
  const calendarMonthLabel=new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${calendarFirstDate}T12:00:00Z`));
  const moveGroupCalendarMonth=(amount)=>{
    const date=new Date(`${calendarFirstDate}T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth()+amount);
    const nextMonth=date.toISOString().slice(0,7);
    setGroupCalendarMonth(nextMonth);
    const desiredDay=Number(calendarSelectedDate.slice(-2));
    const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    setGroupCalendarDate(`${nextMonth}-${String(Math.min(desiredDay,lastDay)).padStart(2,"0")}`);
  };
  const nextGroupReading=state.readings.filter((reading)=>reading.reading_date>today&&reading.status!=="draft"&&reading.status!=="archived").sort((left,right)=>left.reading_date.localeCompare(right.reading_date))[0]||null;
  const nextGroupMilestone=[7,14,30,60,90,100,180,365].find((days)=>days>groupConsistency.currentStreak)||null;
  const recentSharedCompletions=[...state.completions].sort((left,right)=>new Date(right.completed_at)-new Date(left.completed_at)).slice(0,3);
  const groupReadingsToDate=state.readings.filter((item)=>item.reading_date<=today&&item.status!=="archived"&&item.status!=="draft");
  const groupReadingIds=new Set(groupReadingsToDate.map((item)=>item.id));
  const groupSubmissions=state.completions.filter((item)=>groupReadingIds.has(item.reading_id)).length;
  const expectedGroupSubmissions=activeMemberCount*groupReadingsToDate.length;
  const groupSubmissionRate=expectedGroupSubmissions?Math.min(100,Math.round(groupSubmissions/expectedGroupSubmissions*100)):0;
  const stopReadingSession=async(readingId=activeReadingSessionRef.current)=>{if(!readingId||!supabase)return;clearInterval(sessionHeartbeatRef.current);sessionHeartbeatRef.current=null;activeReadingSessionRef.current="";const endedAt=new Date().toISOString();const {error}=await supabase.from("bible_study_reading_sessions").update({ended_at:endedAt,last_seen_at:endedAt}).eq("reading_id",readingId).eq("user_id",user.id);if(error)console.error("Bible Study reading session could not end:",error);setState((currentState)=>({...currentState,sessions:currentState.sessions.map((item)=>item.reading_id===readingId&&item.user_id===user.id?{...item,ended_at:endedAt,last_seen_at:endedAt}:item)}));};
  const startReadingSession=async(reading)=>{if(!reading||!supabase)return;if(activeReadingSessionRef.current&&activeReadingSessionRef.current!==reading.id)await stopReadingSession();const now=new Date().toISOString();activeReadingSessionRef.current=reading.id;const {data,error}=await supabase.from("bible_study_reading_sessions").upsert({reading_id:reading.id,group_id:groupId,user_id:user.id,started_at:now,last_seen_at:now,ended_at:null},{onConflict:"reading_id,user_id"}).select().single();if(error){activeReadingSessionRef.current="";console.error("Bible Study reading session could not start:",error);return;}setState((currentState)=>({...currentState,sessions:[...currentState.sessions.filter((item)=>!(item.reading_id===reading.id&&item.user_id===user.id)),data]}));clearInterval(sessionHeartbeatRef.current);sessionHeartbeatRef.current=setInterval(async()=>{const lastSeen=new Date().toISOString();const {error:heartbeatError}=await supabase.from("bible_study_reading_sessions").update({last_seen_at:lastSeen}).eq("reading_id",reading.id).eq("user_id",user.id).is("ended_at",null);if(!heartbeatError)setState((currentState)=>({...currentState,sessions:currentState.sessions.map((item)=>item.reading_id===reading.id&&item.user_id===user.id?{...item,last_seen_at:lastSeen}:item)}));},60000);};
  useEffect(()=>()=>{clearInterval(sessionHeartbeatRef.current);const readingId=activeReadingSessionRef.current;if(readingId&&supabase)void supabase.from("bible_study_reading_sessions").update({ended_at:new Date().toISOString()}).eq("reading_id",readingId).eq("user_id",user.id);},[user.id]);
  const openReader=async(reading)=>{const requestId=++readerLoadIdRef.current;if(readerOverlayRef.current)readerOverlayRef.current.scrollTop=0;if(readerContentRef.current)readerContentRef.current.scrollTop=0;setReader(reading);setChapter([]);setReaderError("");setActionError("");setReaderLoading(true);setReaderProgress(0);if(activeReadingSessionRef.current&&activeReadingSessionRef.current!==reading.id)await stopReadingSession();try{const response=await fetch(fileFor(reading.book));if(!response.ok)throw new Error("This chapter could not be loaded. Check your connection and try again.");const source=await response.json();const verses=source.filter((verse)=>verse.chapterNumber===reading.chapter&&/text$/.test(verse.type));if(requestId===readerLoadIdRef.current){setChapter(verses);if(verses.length)await startReadingSession(reading);}}catch(error){if(requestId===readerLoadIdRef.current)setReaderError(error.message||"This chapter could not be loaded.");}finally{if(requestId===readerLoadIdRef.current)setReaderLoading(false);}};
  const closeReader=()=>{readerLoadIdRef.current+=1;void stopReadingSession();setReader(null);setReaderProgress(0);};
  const readerReadingIndex=state.readings.findIndex((item)=>item.id===reader?.id);
  const moveReader=(direction)=>{const next=state.readings[readerReadingIndex+direction];if(next)void openReader(next);};
  const updateReaderProgress=(event)=>{const element=event?.currentTarget||readerContentRef.current;if(!element)return;const available=element.scrollHeight-element.clientHeight;setReaderProgress(available>0?Math.round(element.scrollTop/available*100):100);};
  useEffect(()=>{if(!reader)return undefined;const oldOverflow=document.body.style.overflow;document.body.style.overflow="hidden";readerCloseRef.current?.focus({preventScroll:true});const closeOnEscape=(event)=>{if(event.key==="Escape"){event.preventDefault();closeReader();}};document.addEventListener("keydown",closeOnEscape);return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener("keydown",closeOnEscape);};},[Boolean(reader)]);
  const mentions=async(type,id,content)=>{const targets=profiles.filter((item)=>{if(!item.is_active||item.id===user.id||!item.full_name)return false;const escaped=item.full_name.trim().replace(/[.*+?^${}()|[\]\\]/g,"\\$&");return new RegExp(`@${escaped}(?=$|[\\s.,!?])`,"i").test(content);});if(targets.length){const {error}=await supabase.from("bible_study_mentions").insert(targets.map((item)=>({content_type:type,content_id:id,group_id:groupId,mentioned_user_id:item.id,mentioned_by:user.id})));if(error){console.error("Bible Study mentions could not be saved:",error);setActionError("Your contribution was shared, but one or more @mention notifications could not be sent.");}}};
  const completeReading=async(reading)=>{if(!reading||done(reading)||saving)return;const optimistic={id:`pending-${reading.id}`,reading_id:reading.id,user_id:user.id,completed_at:new Date().toISOString()};setActionError("");setState((currentState)=>({...currentState,completions:[...currentState.completions,optimistic]}));setSaving(true);const {data,error}=await supabase.from("bible_study_completions").insert({reading_id:reading.id,user_id:user.id}).select().single();if(error&&error.code!=="23505"){setState((currentState)=>({...currentState,completions:currentState.completions.filter((item)=>item.id!==optimistic.id)}));setActionError(error.message||"Your reading progress could not be saved.");}else if(data){setState((currentState)=>({...currentState,completions:currentState.completions.map((item)=>item.id===optimistic.id?data:item)}));}setSaving(false);if(!error){if(activeReadingSessionRef.current===reading.id)await stopReadingSession(reading.id);await load(false);}};
  const uploadVoiceNote=async(note)=>{
    if(!note?.file)return {};
    const file=note.file,mimeType=(file.type||"").split(";")[0].toLowerCase();
    const extension=mimeType.includes("ogg")?"ogg":mimeType.includes("mp4")?"m4a":mimeType.includes("mpeg")?"mp3":mimeType.includes("wav")?"wav":mimeType.includes("aac")?"aac":"webm";
    const objectId=window.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path=`${groupId}/${user.id}/${objectId}.${extension}`;
    const {error}=await supabase.storage.from("bible-study-audio").upload(path,file,{contentType:mimeType,cacheControl:"3600",upsert:false});
    if(error)throw error;
    return {audio_path:path,audio_mime_type:mimeType,audio_duration_seconds:note.duration||1};
  };
  const saveTextPost=async(table,payload,callback,audioNote=null)=>{
    if(saving)return false;
    setSaving(true);setActionError("");
    let uploadedPath="";
    try{
      const audioMetadata=await uploadVoiceNote(audioNote);
      uploadedPath=audioMetadata.audio_path||"";
      const {data,error}=await supabase.from(table).insert({...payload,...audioMetadata}).select().single();
      if(error)throw error;
      await callback?.(data);
      await load(false);
      return true;
    }catch(error){
      if(uploadedPath)await supabase.storage.from("bible-study-audio").remove([uploadedPath]);
      setActionError(error.message||"Your message could not be shared. Please try again.");
      return false;
    }finally{setSaving(false);}
  };
  const publishTakeaway=async(event)=>{event.preventDefault();const content=takeaway.trim();if(!discussion||(!content&&!takeawayAudioDraft?.file))return;await saveTextPost("bible_study_takeaways",{reading_id:discussion.id,user_id:user.id,content:content||null,reference:takeawayReference.trim()||null},async(item)=>{if(content)await mentions("takeaway",item.id,content);setTakeaway("");setTakeawayReference("");setTakeawayAudioDraft(null);},takeawayAudioDraft);};
  const publishQuestion=async(event)=>{event.preventDefault();const content=question.trim();if(!content&&!questionAudioDraft?.file)return;await saveTextPost("bible_study_questions",{group_id:groupId,user_id:user.id,content:content||null},async(item)=>{if(content)await mentions("question",item.id,content);setQuestion("");setQuestionAudioDraft(null);},questionAudioDraft);};
  const publishTakeawayReply=async(event,post,parentReplyId=null)=>{event.preventDefault();const draftKey=parentReplyId||post.id,content=replyDrafts[draftKey]?.trim(),audio=replyAudioDrafts[draftKey];if(!content&&!audio?.file)return;await saveTextPost("bible_study_takeaway_replies",{takeaway_id:post.id,parent_reply_id:parentReplyId,user_id:user.id,content:content||null},async(item)=>{if(content)await mentions("takeaway_reply",item.id,content);setReplyDrafts((drafts)=>({...drafts,[draftKey]:""}));setReplyAudioDrafts((drafts)=>({...drafts,[draftKey]:null}));},audio);};
  const publishQuestionAnswer=async(event,post)=>{event.preventDefault();const content=answerDrafts[post.id]?.trim(),audio=answerAudioDrafts[post.id];if(!content&&!audio?.file)return;await saveTextPost("bible_study_question_answers",{question_id:post.id,user_id:user.id,content:content||null},async(item)=>{if(content)await mentions("question_answer",item.id,content);setAnswerDrafts((drafts)=>({...drafts,[post.id]:""}));setAnswerAudioDrafts((drafts)=>({...drafts,[post.id]:null}));},audio);};
  const saveReading=async(event)=>{event.preventDefault();const book=readingDraft.book,chapterNumber=Number(readingDraft.chapter),date=readingDraft.reading_date;if(!BIBLE_BOOK_CHAPTERS[book]||!Number.isInteger(chapterNumber)||chapterNumber<1||chapterNumber>BIBLE_BOOK_CHAPTERS[book]||!date||(!editingReadingId&&date<today)){setReadingAdminError("Choose a valid book, chapter, and a date from today onward.");return;}setReadingAdminError("");setSaving(true);const existing=state.readings.find((item)=>item.id===editingReadingId);const payload={book,chapter:chapterNumber,reading_date:date,updated_at:new Date().toISOString()};const result=existing?await supabase.from("bible_study_readings").update(payload).eq("id",existing.id).eq("group_id",groupId).select("id").maybeSingle():await supabase.from("bible_study_readings").insert({...payload,group_id:groupId,sort_order:Math.max(0,...state.readings.map((item)=>item.sort_order))+1,status:"scheduled",created_by:user.id}).select("id").maybeSingle();if(result.error||!result.data)setReadingAdminError(result.error?.code==="23505"?"That chapter is already scheduled for this date.":result.error?.message||"This reading was not changed. Check that you still have permission to manage this group plan.");else{setReadingDraft({book:"",chapter:"",reading_date:""});setEditingReadingId("");await load(false);}setSaving(false);};
  const saveDailyContent=async(event)=>{event.preventDefault();const contentDate=dailyDraft.content_date||today;if(!contentDate||(!dailyDraft.verse_text.trim()&&!dailyDraft.encouragement_message.trim()&&!dailyDraft.instructions.trim())){setDailyAdminError("Add a date and at least a verse, encouragement, or reading instruction.");return;}if(Boolean(dailyDraft.verse_reference.trim())!==Boolean(dailyDraft.verse_text.trim())){setDailyAdminError("Add both the verse reference and its text, or leave both blank.");return;}setSaving(true);setDailyAdminError("");const payload=Object.fromEntries(Object.entries(dailyDraft).map(([key,value])=>[key,value.trim()||null]));payload.content_date=contentDate;payload.status="published";payload.updated_at=new Date().toISOString();const result=editingDailyId?await supabase.from("bible_study_daily_content").update(payload).eq("id",editingDailyId).eq("group_id",groupId).select("id").maybeSingle():await supabase.from("bible_study_daily_content").insert({...payload,group_id:groupId,created_by:user.id}).select("id").maybeSingle();if(result.error||!result.data)setDailyAdminError(result.error?.code==="23505"?"Daily content already exists for this date. Edit that post instead.":result.error?.message||"This message was not changed. Check that you still have permission to manage daily Bible Study content.");else{setDailyDraft({content_date:"",verse_reference:"",verse_text:"",verse_encouragement:"",encouragement_title:"",encouragement_message:"",instructions:"",reflection_questions:""});setEditingDailyId("");await load(false);}setSaving(false);};
  const editDailyContent=(item)=>{setEditingDailyId(item.id);setDailyDraft({content_date:item.content_date||"",verse_reference:item.verse_reference||"",verse_text:item.verse_text||"",verse_encouragement:item.verse_encouragement||"",encouragement_title:item.encouragement_title||"",encouragement_message:item.encouragement_message||"",instructions:item.instructions||"",reflection_questions:item.reflection_questions||""});setDailyAdminError("");};
  const changeDailyStatus=async(item,status)=>{setSaving(true);setDailyAdminError("");const {data,error}=await supabase.from("bible_study_daily_content").update({status,updated_at:new Date().toISOString()}).eq("id",item.id).eq("group_id",groupId).select("id").maybeSingle();if(error||!data)setDailyAdminError(error?.message||"This daily post was not changed. Check that you still have permission to manage this group.");else await load(false);setSaving(false);};
  const deleteDailyContent=async(item)=>{if(!window.confirm("Remove this daily Bible Study post from the group page? Its comments and reactions will remain archived with it."))return;setSaving(true);setDailyAdminError("");const {data,error}=await supabase.from("bible_study_daily_content").update({deleted_at:new Date().toISOString(),status:"archived"}).eq("id",item.id).eq("group_id",groupId).select("id").maybeSingle();if(error||!data)setDailyAdminError(error?.message||"This daily post was not removed. Check that you still have permission to manage this group.");else await load(false);setSaving(false);};
  const archiveReading=async(item)=>{setSaving(true);setReadingAdminError("");const nextStatus=item.status==="archived"?"scheduled":"archived";const {data,error}=await supabase.from("bible_study_readings").update({status:nextStatus,updated_at:new Date().toISOString()}).eq("id",item.id).eq("group_id",groupId).select("id").maybeSingle();if(error||!data)setReadingAdminError(error?.message||"This reading was not changed. Check that you still have permission to manage this group plan.");else await load(false);setSaving(false);};
  const deleteReading=async(item)=>{if(!window.confirm(`Remove ${item.book} ${item.chapter} from the plan? Existing member completions and reflections will be retained in history.`))return;setSaving(true);setReadingAdminError("");const {data,error}=await supabase.from("bible_study_readings").update({deleted_at:new Date().toISOString(),status:"archived",updated_at:new Date().toISOString()}).eq("id",item.id).eq("group_id",groupId).select("id").maybeSingle();if(error||!data)setReadingAdminError(error?.message||"This reading was not removed. Check that you still have permission to manage this group plan.");else await load(false);setSaving(false);};
  const publishDailyResponse=async(event,item)=>{event.preventDefault();const content=dailyResponseDrafts[item.id]?.trim();if(!content||saving)return;setSaving(true);setActionError("");try{const {data,error}=await supabase.from("bible_study_daily_content_responses").insert({content_id:item.id,group_id:groupId,user_id:user.id,content}).select().single();if(error)throw error;await mentions("daily_content_response",data.id,content);setDailyResponseDrafts((drafts)=>({...drafts,[item.id]:""}));await load(false);}catch(error){setActionError(error.message||"Your reflection could not be shared. Please try again.");}finally{setSaving(false);}};
  const toggleDailyReaction=async(item,reaction)=>{const existing=state.dailyReactions.find((row)=>row.content_id===item.id&&row.user_id===user.id&&row.reaction===reaction);setSaving(true);setActionError("");try{const result=existing?await supabase.from("bible_study_daily_content_reactions").delete().eq("id",existing.id).eq("user_id",user.id).select("id").maybeSingle():await supabase.from("bible_study_daily_content_reactions").insert({content_id:item.id,group_id:groupId,user_id:user.id,reaction}).select("id").maybeSingle();if(result.error)throw result.error;if(!result.data)throw new Error(existing?"Your reaction was not removed. Refresh and try again.":"Your reaction could not be saved. Refresh and try again.");await load(false);}catch(error){setActionError(error.message||"Your reaction could not be saved.");}finally{setSaving(false);}};
  const moderateTakeaway=async(item,key)=>{const next={is_pinned:item.is_pinned,is_highlighted:item.is_highlighted,discussion_closed:item.discussion_closed,[key]:!item[key]};setSaving(true);setActionError("");try{const {error}=await supabase.rpc("moderate_bible_study_takeaway",{target_takeaway_id:item.id,pin_value:next.is_pinned,highlight_value:next.is_highlighted,close_value:next.discussion_closed});if(error)throw error;await load(false);}catch(error){setActionError(error.message||"This contribution could not be moderated.");}finally{setSaving(false);}};
  const shareDailyVerse=async(item)=>{const text=[item.verse_text,item.verse_reference].filter(Boolean).join(" — ");try{if(navigator.share)await navigator.share({title:"Verse of the Day",text});else{await navigator.clipboard.writeText(text);setActionError("Verse copied to clipboard.");}}catch(error){if(error?.name!=="AbortError")setActionError("The verse could not be shared from this device.");}};
  const copyDailyVerse=async(item)=>{try{if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");await navigator.clipboard.writeText([item.verse_text,item.verse_reference].filter(Boolean).join(" — "));setActionError("Verse copied to clipboard.");}catch{setActionError("The verse could not be copied from this device.");}};
  const edit=async()=>{if(!editing||(!editDraft.trim()&&!editing.item.audio_path))return;setSaving(true);setActionError("");try{let query=supabase.from(editing.table).update({content:editDraft.trim()||null,updated_at:new Date().toISOString()}).eq("id",editing.item.id);if(!isAdmin)query=query.eq("user_id",user.id);const {data,error}=await query.select("id").maybeSingle();if(error)throw error;if(!data)throw new Error("Your contribution was not changed. Refresh and check your access.");setEditing(null);await load(false);}catch(error){setActionError(error.message||"Your contribution could not be updated.");}finally{setSaving(false);}};
  const reactionsFor=(target)=>state.reactions.filter((item)=>(item.content_type ? item.content_type===target.type&&item.content_id===target.id : target.type==="takeaway"&&item.takeaway_id===target.id));
  const toggleReaction=async(target,reaction)=>{const targetKey=`${target.type}:${target.id}`,reactionKey=`${targetKey}:${reaction}`;if(reactionLocksRef.current.has(reactionKey))return;reactionLocksRef.current.add(reactionKey);setReactionBusy((current)=>({...current,[reactionKey]:true}));const existing=reactionsFor(target).find((item)=>item.user_id===user.id&&item.reaction===reaction);const pendingId=`pending-${target.type}-${target.id}-${reaction}`;const optimistic={id:pendingId,takeaway_id:target.type==="takeaway"?target.id:null,content_type:target.type,content_id:target.id,group_id:groupId,user_id:user.id,reaction,created_at:new Date().toISOString()};const payload={takeaway_id:target.type==="takeaway"?target.id:null,content_type:target.type,content_id:target.id,group_id:groupId,user_id:user.id,reaction};setReactionErrors((currentErrors)=>({...currentErrors,[targetKey]:""}));if(existing)setState((currentState)=>({...currentState,reactions:currentState.reactions.filter((item)=>item.id!==existing.id)}));else setState((currentState)=>({...currentState,reactions:[...currentState.reactions,optimistic]}));try{if(existing){const {data,error}=await supabase.from("bible_study_takeaway_reactions").delete().eq("id",existing.id).eq("group_id",groupId).eq("user_id",user.id).select("id").maybeSingle();if(error)throw error;if(!data)throw new Error("Your reaction was not removed. Refresh and try again.");}else{const {data,error}=await supabase.from("bible_study_takeaway_reactions").insert(payload).select().single();if(error){if(error.code==="23505"){await load(false);return;}throw error;}setState((currentState)=>({...currentState,reactions:currentState.reactions.map((item)=>item.id===pendingId?data:item)}));}await load(false);}catch(error){console.error("Bible Study reaction could not be saved:",error);setState((currentState)=>({...currentState,reactions:existing?(currentState.reactions.some((item)=>item.id===existing.id)?currentState.reactions:[...currentState.reactions,existing]):currentState.reactions.filter((item)=>item.id!==pendingId)}));setReactionErrors((currentErrors)=>({...currentErrors,[targetKey]:error.message||"Your reaction could not be saved. Please try again."}));}finally{reactionLocksRef.current.delete(reactionKey);setReactionBusy((current)=>{const next={...current};delete next[reactionKey];return next;});}};
  const remove=async(table,item,noun)=>{if(!window.confirm(`Delete this ${noun}? This action cannot be undone.`))return;setSaving(true);setActionError("");try{let query=supabase.from(table).delete().eq("id",item.id);if(!isAdmin)query=query.eq("user_id",user.id);const {data,error}=await query.select("id").maybeSingle();if(error)throw error;if(!data)throw new Error(`This ${noun} was not deleted. Refresh and check your access.`);if(item.audio_path){const {error:storageError}=await supabase.storage.from("bible-study-audio").remove([item.audio_path]);if(storageError)console.error("Deleted Bible Study voice note could not be removed from storage:",storageError);}await load(false);}catch(error){setActionError(error.message||`This ${noun} could not be deleted.`);}finally{setSaving(false);}};
  const Actions=({table,item,noun})=>{const id=`${table}-${item.id}`,open=actionMenu===id;return (item.user_id===user.id||isAdmin)?<div className="bible-actions">
<button type="button" className="bible-actions-trigger" aria-label={`Actions for this ${noun}`} aria-haspopup="menu" aria-expanded={open} onClick={(event)=>{event.stopPropagation();setActionMenu(open?"":id);}}>•••</button>{open?<div className="bible-actions-menu" role="menu" aria-label={`${noun} actions`}>
<button type="button" role="menuitem" onClick={(event)=>{event.stopPropagation();setActionMenu("");setEditing({table,item,noun});setEditDraft(item.content||"");}}>Edit</button>
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
  const ReactionBar=({target})=>{const reactions=reactionsFor(target);const groups=Object.entries(reactions.reduce((all,item)=>{(all[item.reaction]??=[]).push(item);return all;},{}));const targetKey=`${target.type}:${target.id}`;return <div className="bible-reaction-row">
    {groups.length?<div className="bible-reaction-summary" aria-label="Reaction totals">{groups.map(([value,items])=>{const meta=REACTION_META[value]||{emoji:"•",label:value};const names=items.map((item)=>person(item.user_id)?.full_name||"Member");return <details className="bible-reaction-count" key={value}><summary aria-label={`${meta.label}: ${items.length}. View who reacted.`}><span aria-hidden="true">{meta.emoji}</span><b>{items.length}</b></summary><span className="bible-reaction-people">{names.join(", ")}</span></details>;})}</div>:null}
    <details className="bible-reaction-picker"><summary aria-label="Add a reaction">React</summary><div className="bible-text-reactions" aria-label="Choose a reaction">{REACTIONS.map(([value,emoji,label])=>{const count=reactions.filter((item)=>item.reaction===value).length;const selected=reactions.some((item)=>item.user_id===user.id&&item.reaction===value);return <button key={value} type="button" className={selected?"selected":""} aria-label={`${label}${count?`: ${count}`:""}`} aria-pressed={selected} title={label} disabled={Boolean(reactionBusy[`${targetKey}:${value}`])} onClick={(event)=>{event.currentTarget.closest("details").open=false;void toggleReaction(target,value);}}><span aria-hidden="true">{emoji}</span>{count?<b>{count}</b>:null}</button>;})}</div></details>
    {reactionErrors[targetKey]||reactionErrors.global?<small className="bible-reaction-error" role="alert">{reactionErrors[targetKey]||reactionErrors.global}</small>:null}
  </div>;};
  const VoicePlayback=({item,label="Voice note"})=>{if(!item.audio_path)return null;if(!Object.prototype.hasOwnProperty.call(audioUrls,item.id))return <small className="bible-audio-caption">Preparing voice note…</small>;return audioUrls[item.id]?<VoiceNotePlayer src={audioUrls[item.id]} duration={item.audio_duration_seconds} label={label}/>:<small className="bible-audio-error">This voice note is unavailable right now.</small>;};
  const Reply=({item,table="bible_study_takeaway_replies",rootTakeaway=null,depth=0})=>
<article className={`bible-thread-reply${depth?" is-nested":""}`}>
<span className="bible-identity"><BibleMemberIdentity person={person(item.user_id)} /></span>
<div>
<header>
<span>
<strong>{person(item.user_id)?.full_name||"Member"}</strong>
<small>{stamp(item.created_at)}{edited(item)?" · Edited":""}</small>
</span>
<Actions table={table} item={item} noun="reply"/>
</header>{editing?.item.id===item.id?<Editor kind="reply"/>:<>{item.content?<p>{item.content}</p>:null}<VoicePlayback item={item} label="Voice reply"/></>}<ReactionBar target={{type:table==="bible_study_takeaway_replies"?"takeaway_reply":"question_answer",id:item.id}}/>
{rootTakeaway&&depth===0?<><div className="bible-thread-nested">{state.replies.filter((reply)=>reply.parent_reply_id===item.id).map((reply)=><Reply key={reply.id} item={reply} rootTakeaway={rootTakeaway} depth={1}/>)}</div>{rootTakeaway.discussion_closed?<p className="bible-muted">This discussion is closed.</p>:<form className="bible-nested-reply-form" onSubmit={(event)=>void publishTakeawayReply(event,rootTakeaway,item.id)}><MentionComposer value={replyDrafts[item.id]||""} onChange={(value)=>setReplyDrafts((drafts)=>({...drafts,[item.id]:value}))} profiles={profiles} label="Reply to this comment" placeholder="Reply directly to this comment. Type @ to mention a member."/><button className="bible-btn secondary" disabled={saving||!replyDrafts[item.id]?.trim()}>Reply</button></form>}</>:null}
</div>
</article>;

  if (loading) return <div className="bible-study bible-loading" role="status">Preparing Bible Study…</div>;

  const tabs = [["read", "Read Bible"], ["group", "Group Study"], ["takeaways", "Takeaways"], ["progress", "My Progress"], ["partners", "Streak Partners"], ...(isAdmin?[["activity","Reading Activity"]]:[])];
  const todayTakeaways = state.takeaways.filter((item) => item.reading_id === discussion?.id).sort((left,right)=>Number(right.is_pinned)-Number(left.is_pinned)||Number(right.is_highlighted)-Number(left.is_highlighted)||new Date(right.created_at)-new Date(left.created_at));
  const todayReadingIds = new Set(todayReadings.map((item) => item.id));
  const groupCompletionCount = todayReadings.length ? new Set(state.completions.filter((item) => todayReadingIds.has(item.reading_id)).map((item) => item.user_id)).size : 0;
  const groupWeekItems = groupWeekDates.map((date, index) => {
    const day = groupDayByDate.get(date);
    const status = date > today ? "upcoming" : day ? day.complete ? "completed" : "pending" : "no-reading";
    const label = new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
    return { date, index, status, label };
  });
  const groupMilestoneCopy = nextGroupMilestone
    ? `${Math.max(0, nextGroupMilestone - groupConsistency.currentStreak)} more completed group reading days.`
    : "Keep building a steady shared rhythm.";
  const upcomingGroupBook = nextGroupReading ? `${nextGroupReading.book} ${nextGroupReading.chapter}` : todayReading ? `${todayReading.book} ${todayReading.chapter}` : "No reading scheduled";
  const upcomingGroupDate = nextGroupReading?.reading_date || todayReading?.reading_date || "A shared assignment will appear here when scheduled.";
  const recentGroupActivity = recentSharedCompletions.map((completion) => {
    const reading = state.readings.find((item) => item.id === completion.reading_id);
    const member = person(completion.user_id);
    const readingLabel = reading ? `${reading.book} ${reading.chapter}` : "Shared Bible reading";
    const completedLabel = completion.completed_at ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(completion.completed_at)) : "Completed";
    return { ...completion, memberLabel: member?.full_name || "A member", readingLabel, completedLabel };
  });

  return <div className="bible-study">
    <header className="bible-page-header bible-landing-hero">
      <div>
        <p className="bible-page-eyebrow">Faith. Fellowship. Purpose.</p>
        <h1>Bible Study</h1>
        <p>Grow deeper in God&apos;s Word. Individually and together.</p>
      </div>
    </header>

    <nav className="bible-journey-switcher" aria-label="Choose a Bible Study journey">
      <button type="button" className={activeJourney==="personal"?"active":""} aria-pressed={activeJourney==="personal"} onClick={()=>setActiveJourney("personal")}>
        <span className="bible-journey-icon"><Book/></span><span><strong>Personal Bible Study</strong><small>Your reading plan, progress, and private notes.</small></span><b aria-hidden="true">→</b>
      </button>
      <button type="button" className={activeJourney==="group"?"active":""} aria-pressed={activeJourney==="group"} onClick={()=>setActiveJourney("group")}>
        <span className="bible-journey-icon"><Book/></span><span><strong>Group Bible Study</strong><small>Shared readings, participation, and discussion.</small></span><b aria-hidden="true">→</b>
      </button>
    </nav>

    <div className="personal-bible-journey-panel" hidden={activeJourney!=="personal"}><PersonalBibleStudy user={user} onReadingsChange={onPersonalReadingsChange}/></div>
    {activeJourney==="group" ? <>
    <section className="bible-group-overview" aria-label="Shared group Bible Study progress">
      <article><small>SHARED READING</small><strong>{todayReadings.length?todayReadings.map((item)=>`${item.book} ${item.chapter}`).join(", "):"No reading scheduled"}</strong><span>{todayReadings.length?`${todayReadings.length} assigned ${todayReadings.length===1?"chapter":"chapters"} for ${today}.`:"The group plan will appear here when set."}</span></article>
      <article><small>GROUP SUBMISSION RATE</small><strong>{expectedGroupSubmissions?`${groupSubmissionRate}%`:"—"}</strong><span>{groupSubmissions} of {expectedGroupSubmissions} expected member readings submitted to date.</span></article>
      <article><small>PARTICIPATING TODAY</small><strong>{todayReadings.length?groupCompletionCount:0}{todayReadings.length&&activeMemberCount?` / ${activeMemberCount}`:""}</strong><span>Members recorded for today&apos;s assigned chapters.</span></article>
      <article className="bible-group-overview-streak"><small>GROUP CONSISTENCY</small><strong>{groupConsistency.currentStreak} {groupConsistency.currentStreak===1?"day":"days"}</strong><span>{groupConsistency.weeklyConsistency}% of this week&apos;s scheduled group reading days completed · separate from personal streaks.</span></article>
    </section>
    {actionError?<p className="bible-reading-admin-error bible-action-feedback" role="alert">{actionError}</p>:null}

    {todayReadings.length ? <section className="bible-today-strip" aria-label="Today's group reading">
      <div className="bible-today-copy">
        <span className="bible-today-label">TODAY'S READING</span>
        <h2>{todayReadings.map((item)=>`${item.book} ${item.chapter}`).join(" · ")}</h2>
        <p>{todayReadings.every(done) ? "Today's assigned chapters are complete." : `${todayReadings.filter(done).length} of ${todayReadings.length} chapters recorded. Read each assignment and mark it complete when finished.`}</p>
      </div>
      <div className="bible-today-actions">
        {todayReadings.every(done) ? <span className="bible-completed-label"><span aria-hidden="true">✓</span> Completed</span> : null}
        {todayReadings.map((item)=><div className="bible-today-reading-actions" key={item.id}>
          <button className="bible-btn secondary" type="button" onClick={() => void openReader(item)}><Book/> Read {item.book} {item.chapter}</button>
          {done(item)?<span className="bible-completed-label"><span aria-hidden="true">✓</span> Read</span>:<button className="bible-btn primary" type="button" onClick={()=>void completeReading(item)} disabled={saving}>{saving?"Saving…":"Mark as Read"}</button>}
        </div>)}
      </div>
    </section> : <div className="bible-no-reading"><strong>No reading is scheduled for today.</strong><span>Open Read Bible to choose a passage, or check the group plan for upcoming readings.</span></div>}

    <section className="bible-daily-content-area" aria-label="Verse of the Day and encouragement">
      {isAdmin ? <details className="bible-admin-details" open={Boolean(editingDailyId)}>
        <summary>{editingDailyId?"Edit daily message":"Manage Verse of the Day and encouragement"}</summary>
        <form className="bible-reading-admin bible-daily-content-form" onSubmit={saveDailyContent}>
          <strong>{editingDailyId?"Update group message":"Publish or schedule a daily message"}</strong>
          <label>Reading date<input type="date" required value={dailyDraft.content_date||today} onChange={(event)=>setDailyDraft((draft)=>({...draft,content_date:event.target.value}))}/></label>
          <fieldset><legend>Verse of the Day</legend>
            <label>Bible reference<input maxLength="120" value={dailyDraft.verse_reference} onChange={(event)=>setDailyDraft((draft)=>({...draft,verse_reference:event.target.value}))} placeholder="John 15:5"/></label>
            <label>Verse text<textarea rows="3" maxLength="3000" value={dailyDraft.verse_text} onChange={(event)=>setDailyDraft((draft)=>({...draft,verse_text:event.target.value}))} placeholder="Add the Scripture text"/></label>
            <label>Optional encouragement<textarea rows="2" maxLength="1200" value={dailyDraft.verse_encouragement} onChange={(event)=>setDailyDraft((draft)=>({...draft,verse_encouragement:event.target.value}))} placeholder="A short reflection on the verse"/></label>
          </fieldset>
          <fieldset><legend>Daily encouragement and reading guidance</legend>
            <label>Title<input maxLength="160" value={dailyDraft.encouragement_title} onChange={(event)=>setDailyDraft((draft)=>({...draft,encouragement_title:event.target.value}))} placeholder="A title for the group"/></label>
            <label>Message<textarea rows="3" maxLength="3000" value={dailyDraft.encouragement_message} onChange={(event)=>setDailyDraft((draft)=>({...draft,encouragement_message:event.target.value}))} placeholder="Share a devotional thought"/></label>
            <label>Instructions<textarea rows="2" maxLength="2000" value={dailyDraft.instructions} onChange={(event)=>setDailyDraft((draft)=>({...draft,instructions:event.target.value}))} placeholder="Reading instructions"/></label>
            <label>Reflection questions<textarea rows="2" maxLength="2000" value={dailyDraft.reflection_questions} onChange={(event)=>setDailyDraft((draft)=>({...draft,reflection_questions:event.target.value}))} placeholder="Questions for personal or group reflection"/></label>
          </fieldset>
          {dailyAdminError?<p className="bible-reading-admin-error" role="alert">{dailyAdminError}</p>:null}
          <div className="bible-reading-admin-actions"><button className="bible-btn primary" disabled={saving}>{saving?"Saving…":editingDailyId?"Save changes":"Publish message"}</button>{editingDailyId?<button type="button" onClick={()=>{setEditingDailyId("");setDailyDraft({content_date:"",verse_reference:"",verse_text:"",verse_encouragement:"",encouragement_title:"",encouragement_message:"",instructions:"",reflection_questions:""});}}>Cancel</button>:null}</div>
        </form>
      </details>:null}
      {isAdmin&&dailyAdminError?<p className="bible-reading-admin-error" role="alert">{dailyAdminError}</p>:null}
      {dailyContentToday ? <article className="bible-verse-feature" aria-labelledby="bible-verse-title">
        <div className="bible-verse-decoration" aria-hidden="true">“</div>
        {dailyContentToday.verse_text?<><p className="bible-page-eyebrow">Verse of the Day</p><blockquote id="bible-verse-title">{dailyContentToday.verse_text}</blockquote><cite>{dailyContentToday.verse_reference}</cite>{dailyContentToday.verse_encouragement?<p className="bible-verse-reflection">{dailyContentToday.verse_encouragement}</p>:null}<div className="bible-verse-actions"><button type="button" onClick={()=>void copyDailyVerse(dailyContentToday)}>Copy verse</button><button type="button" onClick={()=>void shareDailyVerse(dailyContentToday)}>Share verse</button></div></>:null}
        {dailyContentToday.encouragement_message?<div className="bible-daily-encouragement"><p className="bible-page-eyebrow">Daily encouragement</p>{dailyContentToday.encouragement_title?<h2>{dailyContentToday.encouragement_title}</h2>:null}<p>{dailyContentToday.encouragement_message}</p></div>:null}
        {dailyContentToday.instructions?<p><strong>Today's guidance:</strong> {dailyContentToday.instructions}</p>:null}
        {dailyContentToday.reflection_questions?<p><strong>Reflect:</strong> {dailyContentToday.reflection_questions}</p>:null}
        <div className="bible-daily-response-actions"><div className="bible-daily-reactions">{["love","praying_hands","thumbs_up","clapping","fire","smile"].map((reaction)=>{const rows=state.dailyReactions.filter((row)=>row.content_id===dailyContentToday.id&&row.reaction===reaction),selectedReaction=rows.some((row)=>row.user_id===user.id),emoji=REACTION_META[reaction]?.emoji;return <button key={reaction} type="button" className={selectedReaction?"selected":""} aria-pressed={selectedReaction} disabled={saving||dailyContentToday.status!=="published"} onClick={()=>void toggleDailyReaction(dailyContentToday,reaction)} title={REACTION_META[reaction]?.label}><span aria-hidden="true">{emoji}</span><b>{rows.length}</b></button>;})}</div><small>{state.dailyResponses.filter((row)=>row.content_id===dailyContentToday.id).length} reflections</small></div>
        <div className="bible-daily-comments">{state.dailyResponses.filter((row)=>row.content_id===dailyContentToday.id).map((row)=><article key={row.id}><span className="bible-identity"><BibleMemberIdentity person={person(row.user_id)}/></span><div><strong>{person(row.user_id)?.full_name||"Member"}</strong><p>{row.content}</p><small>{stamp(row.created_at)}</small></div><Actions table="bible_study_daily_content_responses" item={row} noun="reflection"/></article>)}{dailyContentToday.status==="published"?<form onSubmit={(event)=>void publishDailyResponse(event,dailyContentToday)}><MentionComposer value={dailyResponseDrafts[dailyContentToday.id]||""} onChange={(value)=>setDailyResponseDrafts((drafts)=>({...drafts,[dailyContentToday.id]:value}))} profiles={profiles} label="Respond to today's verse or encouragement" placeholder="Share a reflection or encouragement. Use @ to mention a member."/><button className="bible-btn secondary" disabled={saving||!dailyResponseDrafts[dailyContentToday.id]?.trim()}>Share reflection</button></form>:<p className="bible-muted">Responses to this daily post are closed.</p>}</div>
      </article>:!visibleDailyContent.some((item)=>item.content_date>=today&&item.status==="published")?<p className="bible-daily-empty">The Verse of the Day and group encouragement will appear here when published.</p>:null}
      {upcomingDailyContent.length?<div className="bible-upcoming-content"><h3>Coming up in our group</h3>{upcomingDailyContent.map((item)=><article key={item.id}><time>{new Date(`${item.content_date}T12:00:00Z`).toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric",timeZone:"UTC"})}</time><strong>{item.verse_reference||item.encouragement_title||"Daily Bible Study"}</strong><span>{item.verse_text||item.encouragement_message||item.instructions}</span></article>)}</div>:null}
      {isAdmin&&state.dailyContent.length?<div className="bible-daily-admin-list"><h3>Manage daily posts</h3>{state.dailyContent.map((item)=><article key={item.id}><div><strong>{item.content_date} · {item.verse_reference||item.encouragement_title||"Daily Bible Study"}</strong><span>{item.status}</span></div><button type="button" onClick={()=>editDailyContent(item)}>Edit</button>{item.status==="published"?<button type="button" onClick={()=>void changeDailyStatus(item,"closed")}>Close</button>:<button type="button" onClick={()=>void changeDailyStatus(item,"published")}>{item.status==="closed"?"Reopen":"Publish"}</button>}{item.status!=="archived"?<button type="button" onClick={()=>void changeDailyStatus(item,"archived")}>Archive</button>:null}<button type="button" onClick={()=>void deleteDailyContent(item)}>Delete</button></article>)}</div>:null}
      {visibleDailyContent.some((item)=>item.content_date<today||item.status==="archived")?<details className="bible-daily-archive"><summary>Previous verses and encouragement</summary>{visibleDailyContent.filter((item)=>item.content_date<today||item.status==="archived").map((item)=><article key={item.id}><small>{item.content_date}</small>{item.verse_text?<><blockquote>{item.verse_text}</blockquote><cite>{item.verse_reference}</cite></>:null}{item.encouragement_title?<h3>{item.encouragement_title}</h3>:null}{item.encouragement_message?<p>{item.encouragement_message}</p>:null}</article>)}</details>:null}
    </section>

    <nav className="bible-section-tabs" role="tablist" aria-label="Group Bible Study sections">
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
      <section className="bible-panel bible-library-launcher" aria-labelledby="group-bible-reader-title">
        <div className="bible-library-launcher-heading">
          <span className="bible-library-launcher-icon" aria-hidden="true"><Book/></span>
          <div><p className="bible-page-eyebrow">WORLD ENGLISH BIBLE · PUBLIC DOMAIN</p><h2 id="group-bible-reader-title">Bible Reading</h2><p><strong>{libraryPassage.book} {libraryPassage.chapter}</strong><span>{current ? done(current) ? "Today's group reading is complete" : "Your shared reading is ready" : "Choose any book or chapter to begin"}</span></p></div>
        </div>
        <div className="bible-library-launcher-progress">
          <span>Browsing Scripture does not change your assigned-reading progress.</span>
          <small>Mark today&apos;s assigned chapter complete from its reading prompt.</small>
        </div>
        <button type="button" className="bible-btn primary bible-library-launcher-button" onClick={openLibraryReader}>
          {libraryReaderMounted ? "Continue Reading" : current ? "Start Reading" : "Open Bible Reader"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
        </button>
      </section>
    </section>

    <section id="bible-panel-group" className="bible-tab-panel" role="tabpanel" aria-labelledby="bible-tab-group" hidden={activeTab !== "group"}>
      <div className="bible-section-heading"><div><p className="bible-page-eyebrow">Read together</p><h2>Group Study</h2></div><p>Follow the shared plan and join the conversation.</p></div>
      <section className="bible-panel bible-plan-panel">
        <header><div><small>OUR JOURNEY</small><h2>Reading plan</h2></div></header>
        {todayReading ? <div className="bible-group-progress"><span>Today's group reading</span><strong>{groupCompletionCount} {groupCompletionCount === 1 ? "member" : "members"} completed</strong></div> : null}
        {isAdmin ? <details className="bible-admin-details" open={Boolean(editingReadingId)}>
          <summary>Manage Reading Plan</summary>
          <form className="bible-reading-admin" onSubmit={saveReading}>
            <strong>{editingReadingId ? "Edit scheduled reading" : "Schedule a reading"}</strong>
            <div className="bible-reading-admin-fields">
              <label>Book<select required value={readingDraft.book} onChange={(event) => setReadingDraft((value) => ({ ...value, book: event.target.value, chapter: "" }))}><option value="">Choose a book</option>{BIBLE_BOOKS.map((book) => <option key={book.name} value={book.name}>{book.name}</option>)}</select></label>
              <label>Chapter<input required type="number" min="1" max={BIBLE_BOOK_CHAPTERS[readingDraft.book] || 150} value={readingDraft.chapter} onChange={(event) => setReadingDraft((value) => ({ ...value, chapter: event.target.value }))}/></label>
              <label>Scheduled date<input required type="date" min={editingReadingId ? undefined : today} value={readingDraft.reading_date} onChange={(event) => setReadingDraft((value) => ({ ...value, reading_date: event.target.value }))}/></label>
            </div>
            {readingAdminError ? <p className="bible-reading-admin-error" role="alert">{readingAdminError}</p> : null}
            <div className="bible-reading-admin-actions"><button type="submit" className="bible-btn primary" disabled={saving}>{saving ? "Saving…" : editingReadingId ? "Save reading" : "Add to plan"}</button>
              {editingReadingId ? <button type="button" onClick={() => { setEditingReadingId(""); setReadingDraft({ book: "", chapter: "", reading_date: "" }); setReadingAdminError(""); }}>Cancel</button> : null}
            </div>
          </form>
        </details> : null}
        {isAdmin&&readingAdminError?<p className="bible-reading-admin-error" role="alert">{readingAdminError}</p>:null}
        {visibleReadings.length ? <div className="bible-plan">{visibleReadings.map((item) => <div className={`bible-plan-row${item.status==="archived"?" is-archived":""}`} key={item.id}>
          <button type="button" onClick={() => void openReader(item)} className={item.id === current?.id ? "current" : done(item) ? "done" : ""}>
          <span>{done(item) ? "✓" : item.status==="archived"?"–":"○"}</span><div><strong>{item.book} {item.chapter}</strong><small>{item.reading_date}{item.status==="archived"?" · Archived":item.status==="draft"?" · Draft":""}</small></div>
          </button>
          {isAdmin ? <div className="bible-plan-admin-actions"><button type="button" className="bible-plan-edit" onClick={() => { setEditingReadingId(item.id); setReadingDraft({ book: item.book, chapter: String(item.chapter), reading_date: item.reading_date }); setReadingAdminError(""); }} disabled={saving}>Edit</button><button type="button" onClick={()=>void archiveReading(item)} disabled={saving}>{item.status==="archived"?"Reopen":"Archive / close"}</button><button type="button" className="danger" onClick={()=>void deleteReading(item)} disabled={saving}>Delete</button></div> : null}
        </div>)}</div> : <p className="bible-muted">No readings have been added to the plan yet.</p>}
      </section>

      <section className="bible-panel bible-group-calendar" aria-labelledby="bible-group-calendar-title">
        <header className="bible-group-calendar-header">
          <div><small>GROUP READING CALENDAR</small><h2 id="bible-group-calendar-title">Plan at a glance</h2><p className="bible-muted">Choose a date to revisit a chapter, see what is scheduled, or record your reading.</p></div>
          <div className="bible-group-calendar-nav" aria-label="Calendar month navigation">
            <button type="button" onClick={()=>moveGroupCalendarMonth(-1)} aria-label="Previous month">‹</button>
            <strong>{calendarMonthLabel}</strong>
            <button type="button" onClick={()=>moveGroupCalendarMonth(1)} aria-label="Next month">›</button>
            <button type="button" className="bible-group-calendar-today" onClick={()=>{setGroupCalendarMonth(today.slice(0,7));setGroupCalendarDate(today);}}>Today</button>
          </div>
        </header>
        <div className="bible-group-calendar-grid" aria-label={`${calendarMonthLabel} group reading calendar`}>
          {[["Mon","Monday"],["Tue","Tuesday"],["Wed","Wednesday"],["Thu","Thursday"],["Fri","Friday"],["Sat","Saturday"],["Sun","Sunday"]].map(([short,long])=><span className="bible-group-calendar-weekday" key={short} aria-label={long}>{short}</span>)}
          {groupCalendarDays.map(({date,inMonth,readings})=>{
            const activeReadings=readings.filter((item)=>item.status!=="archived"&&item.status!=="draft");
            const completed=activeReadings.filter(done).length;
            const label=new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`));
            const summary=readings.length?`${readings.length} assigned ${readings.length===1?"chapter":"chapters"}${activeReadings.length?`, ${completed} completed by you`:"; archived"}`:"No group reading scheduled";
            return <button type="button" key={date} className={`bible-group-calendar-day${inMonth?"":" outside-month"}${calendarSelectedDate===date?" is-selected":""}${date===today?" is-today":""}${activeReadings.length&&completed===activeReadings.length?" is-complete":""}${readings.length&&readings.every((item)=>item.status==="archived")?" is-archived":""}`} aria-label={`${label}. ${summary}.`} aria-pressed={calendarSelectedDate===date} onClick={()=>{setGroupCalendarDate(date);if(!inMonth)setGroupCalendarMonth(date.slice(0,7));}}>
              <span>{Number(date.slice(-2))}</span>
              {readings.length?<i aria-hidden="true">{activeReadings.length&&completed===activeReadings.length?"✓":readings.length}</i>:null}
            </button>;
          })}
        </div>
        <div className="bible-group-calendar-selection" aria-live="polite">
          <div className="bible-group-calendar-selection-heading"><strong>{new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric",timeZone:"UTC"}).format(new Date(`${calendarSelectedDate}T12:00:00Z`))}</strong>{calendarSelectedDate===today?<span>Today</span>:null}</div>
          {selectedCalendarReadings.length?<div className="bible-group-calendar-reading-list">{selectedCalendarReadings.map((item)=>{
            const isDone=done(item);
            return <article key={item.id} className={item.status==="archived"?"is-archived":""}>
              <div><strong>{item.book} {item.chapter}</strong><small>{item.status==="archived"?"Archived":item.status==="draft"?"Draft":isDone?"Completed":calendarSelectedDate>today?"Upcoming":"Not yet marked as read"}</small></div>
              <button type="button" className="bible-btn secondary" onClick={()=>void openReader(item)}>Open chapter</button>
              {item.status==="archived"||item.status==="draft"?null:isDone?<span className="bible-completed-label"><span aria-hidden="true">✓</span> Read</span>:calendarSelectedDate>today?<span className="bible-muted">Available on this date</span>:<button type="button" className="bible-btn primary" disabled={saving} onClick={()=>void completeReading(item)}>{saving?"Saving…":"Mark as Read"}</button>}
            </article>;
          })}</div>:<p className="bible-muted">No group chapters are scheduled for this date.</p>}
        </div>
      </section>

      <section className="bible-panel bible-participation-panel">
        <header><div><small>SHARED PARTICIPATION</small><h2>Recent group readings</h2><p className="bible-muted">Progress counts member submissions for each scheduled chapter.</p></div></header>
        {visibleReadings.length ? <div className="bible-participation-list">{[...visibleReadings].filter((item)=>item.reading_date<=today).reverse().slice(0,5).map((reading)=>{
          const completions=state.completions.filter((row)=>row.reading_id===reading.id);
          const mine=completions.find((row)=>row.user_id===user.id);
          const completedNames=completions.map((row)=>person(row.user_id)?.full_name).filter(Boolean);
          return <article key={reading.id}><div><strong>{reading.book} {reading.chapter}</strong><small>{reading.reading_date}</small></div><span>{completions.length} {completions.length===1?"submission":"submissions"}</span>{isAdmin?<p>{completedNames.length?completedNames.join(" · "):"No submissions recorded yet."}</p>:<p>{mine?`You submitted on ${stamp(mine.completed_at)}.`:"Your participation has not been recorded for this reading."}</p>}</article>;
        })}</div>:<p className="bible-muted">Group participation will appear after the first shared reading is scheduled.</p>}
      </section>

      <section className="bible-panel bible-community">
        <header><div><small>COMMUNITY DISCUSSION</small><h2>Questions and conversations</h2><p className="bible-muted">Ask freely and learn from one another.</p></div></header>
        <form onSubmit={publishQuestion}>
          <MentionComposer value={question} onChange={setQuestion} profiles={profiles} label="Community chat message" placeholder="Start a conversation. Type @ to mention a member."/>
          <VoiceNoteComposer label="discussion voice note" value={questionAudioDraft} onChange={(file,duration)=>setQuestionAudioDraft(file?{file,duration}:null)} disabled={saving}/>
          {actionError?<p className="bible-reading-admin-error" role="alert">{actionError}</p>:null}
          <button className="bible-btn primary" disabled={saving||(!question.trim()&&!questionAudioDraft?.file)}>{saving?"Sharing…":"Post to discussion"}</button>
        </form>
        {state.questions.map((post) => <article className="bible-question-card" key={post.id}>
          <header><span className="bible-identity"><BibleMemberIdentity person={person(post.user_id)} /></span><span><strong>{person(post.user_id)?.full_name || "Member"}</strong><small>{stamp(post.created_at)}{edited(post) ? " · Edited" : ""}</small></span><Actions table="bible_study_questions" item={post} noun="message"/></header>
          {editing?.item.id === post.id ? <Editor kind="message"/> : <>{post.content?<p>{post.content}</p>:null}<VoicePlayback item={post}/></>}
          <ReactionBar target={{ type: "question", id: post.id }}/><section className="bible-answers">{state.answers.filter((item) => item.question_id === post.id).map((item) => <Reply key={item.id} item={item} table="bible_study_question_answers"/>)}</section>
          <form onSubmit={(event)=>void publishQuestionAnswer(event,post)}>
            <MentionComposer value={answerDrafts[post.id] || ""} onChange={(value) => setAnswerDrafts((drafts) => ({ ...drafts, [post.id]: value }))} profiles={profiles} label="Reply to message" placeholder="Write a reply. Type @ to mention a member."/>
            <details className="bible-voice-reply-tools"><summary>Reply with voice</summary><VoiceNoteComposer label="discussion voice reply" value={answerAudioDrafts[post.id]} onChange={(file,duration)=>setAnswerAudioDrafts((drafts)=>({...drafts,[post.id]:file?{file,duration}:null}))} disabled={saving}/></details>
            <button className="bible-btn secondary" disabled={saving||(!answerDrafts[post.id]?.trim()&&!answerAudioDrafts[post.id]?.file)}>Reply</button>
          </form>
        </article>)}
        {!state.questions.length ? <p className="bible-muted bible-empty-conversation">Start the conversation.</p> : null}
      </section>
    </section>

    <section id="bible-panel-takeaways" className="bible-tab-panel" role="tabpanel" aria-labelledby="bible-tab-takeaways" hidden={activeTab !== "takeaways"}>
      <div className="bible-section-heading">
        <div><p className="bible-page-eyebrow">Reflect together</p><h2>Takeaways</h2></div>
        <label className="bible-select"><span>Reading</span><select value={discussion?.id || ""} onChange={(event) => setSelected(event.target.value)} disabled={!visibleReadings.length}>{visibleReadings.map((item) => <option key={item.id} value={item.id}>{item.book} {item.chapter} · {item.reading_date}</option>)}</select></label>
      </div>
      <section className="bible-panel bible-takeaways-panel">
        {discussion ? <form className="bible-takeaway-composer" onSubmit={publishTakeaway}>
          <label className="bible-reference-field"><span>Verse or chapter reference (optional)</span><input value={takeawayReference} onChange={(event)=>setTakeawayReference(event.target.value)} maxLength="120" placeholder={`${discussion.book} ${discussion.chapter}:`} aria-label="Takeaway Bible reference"/></label>
          <textarea value={takeaway} onChange={(event) => setTakeaway(event.target.value)} placeholder={"What stood out to you in " + discussion.book + " " + discussion.chapter + "?"} maxLength="3000" aria-label="Your Bible Study takeaway"/>
          <VoiceNoteComposer label="takeaway voice note" value={takeawayAudioDraft} onChange={(file,duration)=>setTakeawayAudioDraft(file?{file,duration}:null)} disabled={saving}/>
          {actionError?<p className="bible-reading-admin-error" role="alert">{actionError}</p>:null}
          <button className="bible-btn primary" disabled={saving||(!takeaway.trim()&&!takeawayAudioDraft?.file)}>{saving?"Sharing…":"Share takeaway"}</button>
        </form> : <p className="bible-muted">Takeaways will appear here when a reading is added to the plan.</p>}
        <div className="bible-feed">{todayTakeaways.map((post) => <article className={`bible-takeaway${post.is_highlighted?" is-highlighted":""}${post.is_pinned?" is-pinned":""}`} key={post.id}>
          <span className="bible-identity"><BibleMemberIdentity person={person(post.user_id)} /></span>
          <div className="bible-takeaway-content">
            <header><span><strong>{person(post.user_id)?.full_name || "Member"}</strong><small>{stamp(post.created_at)}{edited(post) ? " · Edited" : ""} · {discussion?.book} {discussion?.chapter}</small></span><Actions table="bible_study_takeaways" item={post} noun="takeaway"/></header>
            {post.reference?<p className="bible-takeaway-reference">{post.reference}</p>:null}{post.is_pinned||post.is_highlighted||post.discussion_closed?<div className="bible-takeaway-badges">{post.is_pinned?<span>Pinned</span>:null}{post.is_highlighted?<span>Highlighted</span>:null}{post.discussion_closed?<span>Discussion closed</span>:null}</div>:null}
            {isAdmin?<div className="bible-takeaway-moderation"><button type="button" disabled={saving} onClick={()=>void moderateTakeaway(post,"is_pinned")}>{post.is_pinned?"Unpin":"Pin"}</button><button type="button" disabled={saving} onClick={()=>void moderateTakeaway(post,"is_highlighted")}>{post.is_highlighted?"Remove highlight":"Highlight"}</button><button type="button" disabled={saving} onClick={()=>void moderateTakeaway(post,"discussion_closed")}>{post.discussion_closed?"Reopen discussion":"Close discussion"}</button></div>:null}
            {editing?.item.id === post.id ? <Editor kind="takeaway"/> : <>{post.content ? <p>{post.content}</p> : null}<VoicePlayback item={post}/></>}
            {post.user_id===user.id&&post.content&&onCarryReflectionToPrayer?<button type="button" className="bible-reflection-prayer-link" onClick={()=>onCarryReflectionToPrayer({content:post.content,reference:post.reference||`${discussion?.book||""} ${discussion?.chapter||""}`.trim()})}>Bring this reflection to the Prayer Wall <span aria-hidden="true">→</span></button>:null}
            <ReactionBar target={{ type: "takeaway", id: post.id }}/><section className="bible-thread"><strong>{state.replies.some((item) => item.takeaway_id === post.id) ? "Conversation" : "Be the first to respond to this takeaway."}</strong>
              {state.replies.filter((item) => item.takeaway_id === post.id&&!item.parent_reply_id).slice(-8).map((item) => <Reply key={item.id} item={item} rootTakeaway={post}/>)}
              {post.discussion_closed?<p className="bible-muted">This discussion is closed.</p>:<form onSubmit={(event)=>void publishTakeawayReply(event,post)}>
                <MentionComposer value={replyDrafts[post.id] || ""} onChange={(value) => setReplyDrafts((drafts) => ({ ...drafts, [post.id]: value }))} profiles={profiles} label="Reply to takeaway" placeholder="Write a reply. Type @ to mention a member."/>
                <details className="bible-voice-reply-tools"><summary>Reply with voice</summary><VoiceNoteComposer label="takeaway voice reply" value={replyAudioDrafts[post.id]} onChange={(file,duration)=>setReplyAudioDrafts((drafts)=>({...drafts,[post.id]:file?{file,duration}:null}))} disabled={saving}/></details>
                <button className="bible-btn secondary" disabled={saving||(!replyDrafts[post.id]?.trim()&&!replyAudioDrafts[post.id]?.file)}>Reply</button>
              </form>}
            </section>
          </div>
        </article>)}</div>
        {discussion && !todayTakeaways.length ? <p className="bible-muted bible-empty-conversation">No takeaways for this reading yet. Share the first reflection.</p> : null}
      </section>
    </section>

    <section id="bible-panel-progress" className="bible-tab-panel" role="tabpanel" aria-labelledby="bible-tab-progress" hidden={activeTab !== "progress"}>
      <div className="bible-section-heading"><div><p className="bible-page-eyebrow">Shared reading rhythm</p><h2>Group Consistency</h2></div><p>Group progress is based on scheduled shared readings and member participation.</p></div>
      <section className="bible-group-consistency bible-panel" aria-labelledby="bible-group-consistency-title">
        <header className="bible-group-consistency-header"><div><small>TOGETHER IN SCRIPTURE</small><h2 id="bible-group-consistency-title">{groupConsistency.currentStreak} shared reading {groupConsistency.currentStreak === 1 ? "day" : "days"}</h2><p>A scheduled group reading day counts when at least {groupConsistency.requiredParticipants} of {activeMemberCount} active members complete each assigned chapter. Personal reading is not included.</p></div><span className="bible-group-streak-mark" aria-hidden="true">✦</span></header>
        <div className="bible-group-consistency-metrics"><article><span>Longest run</span><strong>{groupConsistency.longestStreak} {groupConsistency.longestStreak === 1 ? "day" : "days"}</strong></article><article><span>This week</span><strong>{groupConsistency.completedThisWeek}/{groupConsistency.weeklyScheduledDays} days</strong><small>{groupConsistency.weeklyConsistency}% of due group reading days</small></article><article><span>Active members</span><strong>{activeMemberCount}</strong><small>{todayReadings.length ? `${groupCompletionCount} have joined today's readings` : "Shared participation"}</small></article><article><span>Best week</span><strong>{groupConsistency.bestWeek} days</strong><small>Shared reading days completed</small></article></div>
        <div className="bible-group-week" aria-label="This week's shared reading schedule">{groupWeekItems.map(({date,index,status,label})=><div key={date} className={`bible-group-week-day is-${status}${date===today?" is-today":""}`} aria-label={`${label}, ${date}: ${status}`}><span>{label.slice(0,3)}</span><i aria-hidden="true">{status==="completed"?"✓":status==="pending"?"·":status==="no-reading"?"—":""}</i><small>{date.slice(-2)}</small></div>)}</div>
        <div className="bible-group-consistency-footer"><div><small>{nextGroupMilestone?"NEXT GROUP MILESTONE":"GROUP JOURNEY"}</small><strong>{nextGroupMilestone?`${nextGroupMilestone} shared reading days`:`${groupConsistency.currentStreak} days of consistency`}</strong><span>{groupMilestoneCopy}</span></div><div><small>UPCOMING SHARED READING</small><strong>{upcomingGroupBook}</strong><span>{upcomingGroupDate}</span></div></div>
        <div className="bible-group-recent"><strong>Recent shared activity</strong>{recentGroupActivity.length?<ul>{recentGroupActivity.map((activity)=><li key={activity.id}><span>{activity.memberLabel}</span><small>{activity.readingLabel} · {activity.completedLabel}</small></li>)}</ul>:<p>No shared reading completions have been recorded yet. The first one starts the group&apos;s progress.</p>}</div>
      </section>
      <div className="bible-section-heading"><div><p className="bible-page-eyebrow">Your reading rhythm</p><h2>My Progress</h2></div><p>Personal reading is private and tracked separately from the group.</p></div>
      <section className="bible-panel bible-catchup"><header><div><small>READING HISTORY</small><h2>{missed.length ? missed.length + " earlier " + (missed.length === 1 ? "reading" : "readings") : "You're caught up"}</h2></div></header>
        <p className="bible-muted">Past readings remain available whenever you are ready.</p>
        {missed.length ? <div className="bible-catchup-list">{missed.map((item) => <button type="button" key={item.id} onClick={() => void openReader(item)}><Book/><span><strong>{item.book} {item.chapter}</strong><small>{item.reading_date}</small></span><b>Read</b></button>)}</div> : null}
      </section>
    </section>

    <section id="bible-panel-partners" className="bible-tab-panel" role="tabpanel" aria-labelledby="bible-tab-partners" hidden={activeTab !== "partners"}>
      <div className="bible-section-heading"><div><p className="bible-page-eyebrow">A shared rhythm in Scripture</p><h2>Bible Streak Partners</h2></div><p>Invite a reading circle, follow your shared progress, and encourage one another as you grow.</p></div>
      <BibleStudyPartnerStreaks user={user} profiles={profiles} readings={state.readings} completions={state.completions} groupId={groupId} timezone={timezone}/>
    </section>

    {isAdmin?<section id="bible-panel-activity" className="bible-tab-panel bible-admin-activity" role="tabpanel" aria-labelledby="bible-tab-activity" hidden={activeTab!=="activity"}>
      <div className="bible-section-heading"><div><p className="bible-page-eyebrow">Group accountability</p><h2>Reading Activity &amp; Accountability</h2></div><p>Member status is calculated from the published chapters scheduled for each date.</p></div>
      <div className="bible-activity-metrics"><article><small>GROUP MEMBERS</small><strong>{activitySummary.totalMembers}</strong></article><article><small>COMPLETED</small><strong>{activitySummary.completedMembers}</strong><span>{activitySummary.completionPercent}% for {activityDateValue}</span></article><article><small>CURRENTLY READING</small><strong>{activitySummary.currentlyReading}</strong><span>Live session in the last 10 minutes</span></article><article><small>PENDING TODAY</small><strong>{activitySummary.pendingMembers}</strong><span>{activitySummary.missedMembers} missed on past dates</span></article></div>
      <section className="bible-panel bible-activity-report">
        <header><div><small>PARTICIPATION REPORT</small><h2>{new Date(`${activityDateValue}T12:00:00Z`).toLocaleDateString(undefined,{dateStyle:"full",timeZone:"UTC"})}</h2></div></header>
        <div className="bible-activity-filters"><label>Date<input type="date" value={activityDateValue} onChange={(event)=>setActivityDate(event.target.value)}/></label><label>Member<select value={activityMember} onChange={(event)=>setActivityMember(event.target.value)}><option value="">All members</option>{profiles.filter((item)=>item.is_active!==false).map((item)=><option key={item.id} value={item.id}>{item.full_name||item.email}</option>)}</select></label><label>Status<select value={activityStatus} onChange={(event)=>setActivityStatus(event.target.value)}><option value="all">All statuses</option><option value="completed">Completed</option><option value="reading">Currently reading</option><option value="pending">Pending</option><option value="missed">Missed</option><option value="not-yet-available">Not yet available</option><option value="not-available">No assignment</option></select></label></div>
        <div className="bible-activity-stats"><article><span>Weekly chapters completed</span><strong>{activitySummary.weeklyCompleted} / {activitySummary.weeklyAssigned}</strong><div className="bible-activity-progress" role="progressbar" aria-label="Weekly group chapter completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={activitySummary.weeklyPercent}><i style={{width:`${activitySummary.weeklyPercent}%`}}/></div><small>{activitySummary.weeklyPercent}% of this week's scheduled chapters</small></article><article><span>Monthly chapters completed</span><strong>{activitySummary.monthlyCompleted} / {activitySummary.monthlyAssigned}</strong><div className="bible-activity-progress" role="progressbar" aria-label="Monthly group chapter completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={activitySummary.monthlyPercent}><i style={{width:`${activitySummary.monthlyPercent}%`}}/></div><small>{activitySummary.monthlyPercent}% of this month's scheduled chapters</small></article><article><span>Consistent readers</span><strong>{activitySummary.consistentMembers}</strong><small>Three or more scheduled reading days in a row</small></article><article><span>Several readings missed</span><strong>{activitySummary.severalMissedMembers}</strong><small>Three or more past chapters still uncompleted</small></article></div>
        <div className="bible-activity-table-wrap"><table className="bible-activity-table"><thead><tr><th>Member</th><th>Reading for date</th><th>Completion time</th><th>Reading streak</th><th>Status</th><th>History</th></tr></thead><tbody>{filteredActivityRows.map((row)=>{const assigned=state.readings.filter((reading)=>reading.reading_date===activityDateValue&&reading.status!=="archived"&&reading.status!=="draft");const label=row.assignedCount?assigned.map((reading)=>`${reading.book} ${reading.chapter}`).join(", "):"No reading scheduled";return <tr key={row.id}><td><span className="bible-activity-member"><span className="bible-identity"><BibleMemberIdentity person={row}/></span><strong>{row.full_name||row.email||"Member"}</strong></span></td><td>{label}{row.assignedCount?<small>{row.completedCount} of {row.assignedCount} chapters completed</small>:null}</td><td>{row.completedAt?stamp(row.completedAt):"—"}</td><td>{row.currentStreak} day{row.currentStreak===1?"":"s"}<small>Longest {row.longestStreak}</small></td><td><span className={`bible-activity-status is-${row.status}`}>{row.status==="not-available"?"No assignment":row.status==="not-yet-available"?"Not yet available":row.status==="reading"?"Currently reading":row.status[0].toUpperCase()+row.status.slice(1)}</span></td><td><details><summary>View ({row.history.length})</summary><ul>{row.history.slice(0,8).map((entry)=><li key={entry.id}>{entry.reading?.book} {entry.reading?.chapter} · {entry.reading?.reading_date}<small>{stamp(entry.completed_at)}</small></li>)}</ul></details></td></tr>;})}</tbody></table>{!filteredActivityRows.length?<p className="bible-muted">No members match these filters.</p>:null}</div>
      </section>
    </section>:null}

    {reader ? <div ref={readerOverlayRef} className="bible-reader-overlay" onScroll={updateReaderProgress} onMouseDown={(event)=>{if(event.target===event.currentTarget)closeReader();}}><section className="bible-reader" role="dialog" aria-modal="true" aria-labelledby="assigned-reading-title" aria-describedby="assigned-reading-progress">
      <header className="bible-reader-heading">
        <div><small>WORLD ENGLISH BIBLE</small><h2 id="assigned-reading-title">{reader.book} {reader.chapter}</h2></div>
        <nav className="bible-reader-navigation" aria-label="Reading plan chapters">
          <button type="button" onClick={()=>moveReader(-1)} disabled={readerReadingIndex<=0} aria-label="Previous plan reading">Previous</button>
          <button type="button" onClick={()=>moveReader(1)} disabled={readerReadingIndex<0||readerReadingIndex>=state.readings.length-1} aria-label="Next plan reading">Next</button>
        </nav>
        <button ref={readerCloseRef} className="bible-reader-close" type="button" onClick={closeReader}>Close</button>
      </header>
      <div className="bible-reading-progress" id="assigned-reading-progress" role="progressbar" aria-label="Chapter reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={readerProgress}>
        <span><i style={{width:`${readerProgress}%`}}/></span><small>{readerProgress}% read</small>
      </div>
      <main ref={readerContentRef} onScroll={updateReaderProgress}>
        {readerLoading ? <div className="bible-reader-skeleton" role="status" aria-label="Loading chapter">{Array.from({length:8},(_,index)=><i key={index}/>)}</div> : readerError ? <p className="bible-reader-error" role="alert">{readerError}</p> : chapter.length ? chapter.map((verse, index) => <p key={String(verse.verseNumber) + "-" + index}><sup>{verse.verseNumber}</sup>{verse.value}</p>) : <p className="bible-muted">No text is available for this chapter.</p>}
      </main>
      <footer>
        <div aria-live="polite">{done(reader) ? <span className="bible-completed-label"><span aria-hidden="true">✓</span> Chapter completed</span> : reader.status==="archived"?<span>This reading is archived and available for review.</span>:<span>Take your time with today's reading.</span>}</div>
        <div className="bible-reader-complete-actions">
          {actionError ? <span className="bible-reader-error" role="alert">{actionError}</span> : null}
          <button className={done(reader)?"bible-btn primary bible-complete-button is-complete":"bible-btn primary bible-complete-button"} disabled={done(reader)||reader.status==="archived"||saving||readerLoading||Boolean(readerError)} onClick={()=>void completeReading(reader)} aria-live="polite">
            <span className="bible-complete-check" aria-hidden="true">✓</span>{done(reader)?"Completed":"Mark as complete"}
          </button>
        </div>
      </footer>
    </section></div> : null}
    </> : null}
    {libraryReaderMounted && typeof document !== "undefined" ? createPortal(
      <FullBibleReader
        initialBook={libraryPassage.book}
        initialChapter={libraryPassage.chapter}
        isOpen={libraryReaderOpen}
        onClose={() => setLibraryReaderOpen(false)}
        onChapterChange={handleLibraryChapterChange}
        footerHint="Browse the World English Bible. Complete assigned readings from their group reading prompt."
      />,
      document.body
    ) : null}
  </div>;
}
