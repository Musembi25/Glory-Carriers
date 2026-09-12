(() => {
  'use strict';

  const STORAGE_KEY = 'gloryCarriersDataV1';
  const DEFAULT_START = '2026-09-07';
  const MAX_REFLECTION = 1200;

  const studyPlan = [
    { book: 'Galatians', chapters: 6 },
    { book: 'Ephesians', chapters: 6 },
    { book: 'Philippians', chapters: 4 },
    { book: 'Colossians', chapters: 4 }
  ];

  const verses = {
    'Galatians 1': [
      ['10', 'For do I now persuade men, or God? or do I seek to please men? for if I yet pleased men, I should not be the servant of Christ.'],
      ['11', 'But I certify you, brethren, that the gospel which was preached of me is not after man.']
    ],
    'Galatians 2': [['20', 'I am crucified with Christ: nevertheless I live; yet not I, but Christ liveth in me.']],
    'Galatians 3': [['26', 'For ye are all the children of God by faith in Christ Jesus.']],
    'Galatians 4': [['6', 'And because ye are sons, God hath sent forth the Spirit of his Son into your hearts, crying, Abba, Father.']],
    'Galatians 5': [['1', 'Stand fast therefore in the liberty wherewith Christ hath made us free.']],
    'Galatians 6': [['9', 'And let us not be weary in well doing: for in due season we shall reap, if we faint not.']],
    'Ephesians 1': [['3', 'Blessed be the God and Father of our Lord Jesus Christ, who hath blessed us with all spiritual blessings in heavenly places in Christ.']],
    'Ephesians 2': [['10', 'For we are his workmanship, created in Christ Jesus unto good works, which God hath before ordained that we should walk in them.']],
    'Ephesians 3': [['20', 'Now unto him that is able to do exceeding abundantly above all that we ask or think, according to the power that worketh in us.']],
    'Ephesians 4': [['1', 'I therefore, the prisoner of the Lord, beseech you that ye walk worthy of the vocation wherewith ye are called.']],
    'Ephesians 5': [['2', 'And walk in love, as Christ also hath loved us, and hath given himself for us an offering and a sacrifice to God for a sweetsmelling savour.']],
    'Ephesians 6': [['10', 'Finally, my brethren, be strong in the Lord, and in the power of his might.']],
    'Philippians 1': [['6', 'Being confident of this very thing, that he which hath begun a good work in you will perform it until the day of Jesus Christ.']],
    'Philippians 2': [['5', 'Let this mind be in you, which was also in Christ Jesus.']],
    'Philippians 3': [['14', 'I press toward the mark for the prize of the high calling of God in Christ Jesus.']],
    'Philippians 4': [['13', 'I can do all things through Christ which strengtheneth me.']],
    'Colossians 1': [['17', 'And he is before all things, and by him all things consist.']],
    'Colossians 2': [['6', 'As ye have therefore received Christ Jesus the Lord, so walk ye in him.']],
    'Colossians 3': [['16', 'Let the word of Christ dwell in you richly in all wisdom.']],
    'Colossians 4': [['2', 'Continue in prayer, and watch in the same with thanksgiving.']]
  };

  const defaultData = () => ({
    activeMemberId: null,
    members: [],
    reflections: [],
    bookmarks: [],
    notes: [],
    prayers: [],
    completed: {},
    checkins: {},
    settings: {
      startDate: DEFAULT_START,
      theme: 'light',
      fontSize: 1.05,
      notifications: false
    }
  });

  let state = load();
  let currentRoute = 'dashboard';
  let timer = { seconds: 1500, running: false, handle: null };
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      return deepMerge(defaultData(), parsed);
    } catch (error) {
      console.error('Failed to load saved data', error);
      return defaultData();
    }
  }

  function deepMerge(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    for (const [key, value] of Object.entries(extra)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
        base[key] = deepMerge(base[key], value);
      } else {
        base[key] = value;
      }
    }
    return base;
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { console.error(error); toast('Your browser could not save the latest change.', 'error'); }
  }

  function currentMember() {
    return state.members.find(m => m.id === state.activeMemberId) || null;
  }

  function ensureMember() {
    if (!state.activeMemberId || !currentMember()) {
      return false;
    }
    return true;
  }

  function uuid() { return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

  function toLocalDate(dateValue) {
    const [y,m,d] = dateValue.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function dateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function diffDays(a, b) {
    const ms = 86400000;
    const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
    const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
    return Math.round((aa - bb) / ms);
  }

  function getJourney() {
    const list = [];
    for (const group of studyPlan) {
      for (let chapter = 1; chapter <= group.chapters; chapter++) list.push({ book: group.book, chapter, label: `${group.book} ${chapter}` });
    }
    return list;
  }

  function studyState() {
    const today = new Date();
    const start = toLocalDate(state.settings.startDate);
    const day = diffDays(today, start) + 1;
    const journey = getJourney();
    let index = -1;
    if (day >= 1 && day <= journey.length) index = day - 1;
    const current = index >= 0 ? journey[index] : null;
    return { today, start, day, journey, index, current, before: day < 1, after: day > journey.length };
  }

  function completedKey(label) { return `${state.activeMemberId}|${label}`; }
  function checkinKey(label, item) { return `${state.activeMemberId}|${label}|${item}`; }
  function isCompleted(label) { return Boolean(state.completed[completedKey(label)]); }
  function completedAt(label) { return state.completed[completedKey(label)] || null; }

  function currentProgress() {
    const journey = getJourney();
    const count = journey.filter(ch => isCompleted(ch.label)).length;
    return { count, total: journey.length, percent: Math.round(count / journey.length * 100) };
  }

  function getCompletedDateKeys() {
    return Object.entries(state.completed)
      .filter(([key]) => key.startsWith(`${state.activeMemberId}|`))
      .map(([, value]) => value.slice(0,10))
      .sort();
  }

  function calculateStreaks() {
    const dates = [...new Set(getCompletedDateKeys())].map(toLocalDate).sort((a,b) => a-b);
    if (!dates.length) return { current: 0, longest: 0 };
    let longest = 1;
    let run = 1;
    for (let i = 1; i < dates.length; i++) {
      if (diffDays(dates[i], dates[i-1]) === 1) run++; else run = 1;
      longest = Math.max(longest, run);
    }
    const today = toLocalDate(dateKey());
    const latest = dates[dates.length - 1];
    if (diffDays(today, latest) > 1) return { current: 0, longest };
    run = 1;
    for (let i = dates.length - 1; i > 0; i--) {
      if (diffDays(dates[i], dates[i-1]) === 1) run++; else break;
    }
    if (diffDays(today, latest) === 1) return { current: 0, longest };
    return { current: run, longest };
  }

  function daysRemaining() {
    const s = studyState();
    return s.after ? 0 : Math.max(0, s.journey.length - Math.max(s.day, 1) + 1);
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    if (h < 22) return 'Good evening';
    return 'Good night';
  }

  function fmtDate(value, options = {}) {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric', ...options }).format(toLocalDate(value));
  }

  function escapeHTML(str='') {
    return str.replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function initials(name='GC') {
    return name.trim().split(/\s+/).slice(0,2).map(s => s[0]?.toUpperCase()).join('') || 'GC';
  }

  function verseForCurrent(label) {
    const rows = verses[label] || [];
    return rows[0] || ['',''];
  }

  function memberTodayComplete(memberId, label) {
    return Boolean(state.completed[`${memberId}|${label}`]);
  }

  function renderShell() {
    const member = currentMember();
    $('#profile-name').textContent = member?.name || 'Glory Carrier';
    $('#avatar-initials').textContent = initials(member?.name || 'GC');
    document.documentElement.classList.toggle('dark', state.settings.theme === 'dark');
    document.documentElement.style.setProperty('--reading-size', `${state.settings.fontSize || 1.05}rem`);
    const before = !member;
    $('#welcome-screen').classList.toggle('visible', before);
    $('#welcome-screen').setAttribute('aria-hidden', before ? 'false' : 'true');
  }

  function setActiveNav() {
    $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.route === currentRoute));
  }

  function render() {
    renderShell();
    if (!ensureMember()) {
      $('#main').innerHTML = '';
      return;
    }
    setActiveNav();
    const routes = { dashboard: renderDashboard, today: renderToday, journey: renderJourney, reflections: renderReflections, bible: renderBible, tools: renderTools, settings: renderSettings };
    (routes[currentRoute] || renderDashboard)();
    $('#main').focus({ preventScroll: true });
  }

  function footer() {
    return `<footer class="footer"><p><strong>GLORY CARRIERS</strong></p><p>Growing together. Rooted in the Word. Living for Christ.</p><p>© 2026 Glory Carriers. All rights reserved.</p><p>Built for the Glory of God.</p></footer>`;
  }

  function renderDashboard() {
    const s = studyState();
    const progress = currentProgress();
    const streak = calculateStreaks();
    const verse = s.current ? verseForCurrent(s.current.label) : ['',''];
    const checkItems = ['read','reflect','share'];
    const checkStatus = Object.fromEntries(checkItems.map(k => [k, Boolean(state.checkins[checkinKey(s.current?.label || 'complete', k)])]));
    const todayComplete = s.current && isCompleted(s.current.label);
    const participation = s.current ? state.members.filter(m => memberTodayComplete(m.id, s.current.label)) : [];

    let todayContent;
    if (s.before) {
      todayContent = `<div class="notice"><strong>Our Bible study journey begins on ${fmtDate(state.settings.startDate)}.</strong><br>Prepare your heart. Your first chapter will be <strong>Galatians 1</strong>.</div>`;
    } else if (s.after) {
      todayContent = `<div class="notice"><strong>You have completed the Glory Carriers Bible Study Journey.</strong><br>Twenty chapters. One Word. A journey worth carrying forward.</div>`;
    } else {
      todayContent = `<div class="hero card ${todayComplete ? 'celebrate' : ''}"><div class="hero-content"><div class="hero-meta"><span class="chapter-badge">Day ${s.day}</span><span>${escapeHTML(s.current.book)}</span></div><h2>${escapeHTML(s.current.label)}</h2><p class="hero-focus">Today's focus: Read the chapter carefully and identify what stands out to you. Slow down enough to listen.</p><div class="btn-row"><button class="btn btn-primary" data-action="go-today">${todayComplete ? 'Open Today’s Study' : 'Start Today’s Study'}</button>${todayComplete ? '<span class="complete-badge">✓ Study completed</span>' : ''}</div></div></div>`;
    }

    $('#main').innerHTML = `<div class="page">
      <section class="greeting"><p class="eyebrow">DAILY BIBLE STUDY</p><h1>${greeting()}, ${escapeHTML(currentMember().name)}.</h1><p>Welcome back to your Bible study journey.</p></section>
      <div class="dashboard-grid">
        <div class="stack">${todayContent}
          <section class="card"><div class="card-head"><div><h2>Progress</h2><small>One chapter at a time.</small></div><strong>${progress.percent}%</strong></div><div class="progress-wrap"><div class="progress-track"><div class="progress-fill" style="width:${progress.percent}%"></div></div><div class="progress-meta"><span>${progress.count} / ${progress.total} chapters complete</span><span>${daysRemaining()} day${daysRemaining()===1?'':'s'} remaining</span></div></div></section>
          <div class="grid grid-2">
            <section class="card scripture-card"><div class="card-head"><h3>Verse to Carry Today</h3><span class="chapter-badge">KJV</span></div>${verse[1] ? `<p class="scripture">“${escapeHTML(verse[1])}”</p><div class="scripture-ref">— ${escapeHTML(s.current.label)}:${escapeHTML(verse[0])}</div><div class="btn-row" style="margin-top:16px"><button class="btn btn-secondary" data-action="copy-verse" data-label="${escapeHTML(s.current.label)}">Copy verse</button></div>` : `<div class="empty">The next chapter will bring your next verse to carry.</div>`}</section>
            <section class="card"><div class="card-head"><h3>Current Streak</h3><span>✦</span></div><div style="font-size:2.5rem;font-weight:800;letter-spacing:-.06em">${streak.current} <span style="font-size:1rem;color:var(--muted);font-weight:600">day${streak.current===1?'':'s'}</span></div><p class="muted">Keep showing up in the Word.</p><div class="stats" style="margin-top:12px"><div class="stat"><div class="label">Longest</div><div class="value">${streak.longest}</div></div><div class="stat"><div class="label">Complete</div><div class="value">${progress.count}</div></div></div></section>
          </div>
        </div>
        <div class="stack">
          <section class="card"><div class="card-head"><div><h2>Today’s Check-in</h2><small>${s.current ? escapeHTML(s.current.label) : 'Study journey'}</small></div></div><div class="checklist">${checkItems.map((key,i)=>{const label=['I read today’s chapter','I reflected on what stood out','I shared my takeaway'][i]; const checked=checkStatus[key]; return `<label class="check ${checked?'checked':''}"><input type="checkbox" data-check="${key}" ${checked?'checked':''} ${!s.current?'disabled':''}><span>${label}</span></label>`}).join('')}</div>${s.current ? `<div style="margin-top:16px"><button class="btn ${todayComplete?'btn-secondary':'btn-primary'}" data-action="complete-today" ${todayComplete?'disabled':''}>${todayComplete?'Study completed':'Mark study complete'}</button></div>` : ''}</section>
          <section class="card"><div class="card-head"><h2>Journey Preview</h2><button class="btn btn-ghost" data-route="journey">View all</button></div>${renderJourneyPreview()}</section>
          <section class="card"><div class="card-head"><div><h2>Today’s Glory Carriers</h2><small>${s.current ? escapeHTML(s.current.label) : 'Journey complete'}</small></div></div>${participation.length ? participation.map(m=>`<div class="reflection-item" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>${escapeHTML(m.name)}</strong><span class="success">✓ Studied</span></div>`).join('') : `<div class="empty">No Glory Carriers have checked in yet today.</div>`}<p class="muted" style="margin:12px 0 0">${participation.length} Glory Carrier${participation.length===1?'':'s'} studied today.</p></section>
        </div>
      </div>${footer()}
    </div>`;
    bindPageEvents();
  }

  function renderJourneyPreview() {
    const s = studyState();
    const journey = s.journey;
    const idx = Math.max(0, s.index);
    const items = journey.slice(Math.max(0, idx-1), Math.min(journey.length, idx+3));
    return items.map(ch => `<div class="chapter-row ${isCompleted(ch.label)?'complete ':''}${s.current?.label===ch.label?'current':''}" style="grid-template-columns:38px 1fr"><div class="chapter-node">${isCompleted(ch.label)?'✓':''}</div><div><div class="chapter-name">${escapeHTML(ch.label)}</div><div class="chapter-status">${isCompleted(ch.label)?'Completed':s.current?.label===ch.label?'Current':'Up next'}</div></div></div>`).join('');
  }

  function renderToday() {
    const s = studyState();
    if (s.before || s.after) {
      $('#main').innerHTML = `<div class="page"><div class="page-head"><div><p class="eyebrow">TODAY'S STUDY</p><h1 class="page-title">${s.before ? 'Not quite time yet.' : 'Journey complete.'}</h1><p class="page-subtitle">${s.before ? `Our Bible study journey begins on ${fmtDate(state.settings.startDate)}.` : 'You have completed all 20 chapters in this reading journey.'}</p></div></div><section class="card">${s.before ? '<div class="notice">Galatians 1 is waiting for you on Day 1.</div>' : '<div class="notice">Celebrate what God has taught you, then keep dwelling richly in His Word.</div>'}</section>${footer()}</div>`;
      return;
    }
    const ch = s.current;
    const checkItems = [{key:'read',label:'I read today’s chapter'},{key:'reflect',label:'I reflected on what stood out'},{key:'share',label:'I shared my takeaway'}];
    const checks = Object.fromEntries(checkItems.map(x=>[x.key,Boolean(state.checkins[checkinKey(ch.label,x.key)])]));
    const reflection = state.reflections.find(r=>r.memberId===state.activeMemberId && r.label===ch.label);
    const verse = verseForCurrent(ch.label);
    $('#main').innerHTML = `<div class="page">
      <div class="page-head"><div><p class="eyebrow">DAY ${s.day}</p><h1 class="page-title">${escapeHTML(ch.label)}</h1><p class="page-subtitle">Read slowly. Notice what catches your attention. Carry it with you.</p></div><span class="chapter-badge">${isCompleted(ch.label)?'COMPLETED':'IN PROGRESS'}</span></div>
      <div class="grid grid-2">
        <section class="card reader"><div class="reader-toolbar"><strong>Today's focus</strong><span class="muted">${escapeHTML(ch.label)}</span></div><div class="reader-body"><h2>${escapeHTML(ch.label)}</h2><p class="scripture">${verse[1] ? `“${escapeHTML(verse[1])}”` : 'The Word is worthy of slow attention today.'}</p><div class="scripture-ref">— ${escapeHTML(ch.label)}:${verse[0]}</div><div class="btn-row" style="margin-top:20px"><button class="btn btn-primary" data-route="bible" data-reader-label="${escapeHTML(ch.label)}">Open Bible Reader</button><button class="btn btn-secondary" data-action="copy-verse" data-label="${escapeHTML(ch.label)}">Copy verse</button></div><div class="notice" style="margin-top:18px">Bible reader content is intentionally limited to public-domain KJV excerpts in this offline starter. The structure is ready for a licensed Bible API or additional permitted text.</div></div></section>
        <section class="card"><div class="card-head"><h2>Today's Check-in</h2><small>Small steps, faithful growth.</small></div><div class="checklist">${checkItems.map(x=>`<label class="check ${checks[x.key]?'checked':''}"><input type="checkbox" data-check="${x.key}" ${checks[x.key]?'checked':''}><span>${x.label}</span></label>`).join('')}</div><div style="margin-top:16px"><button class="btn btn-primary" data-action="complete-today" ${isCompleted(ch.label)?'disabled':''}>${isCompleted(ch.label)?'Study completed':'Complete today’s study'}</button></div></section>
      </div>
      <section class="card" style="margin-top:18px"><div class="card-head"><div><h2>What stood out to you?</h2><small>Share the verse, truth, lesson or thought that stayed with you.</small></div><span id="reflection-counter">0 / ${MAX_REFLECTION}</span></div><div class="field"><label for="reflection-text">Your reflection</label><textarea class="textarea" id="reflection-text" maxlength="${MAX_REFLECTION}" placeholder="What stood out to me from ${escapeHTML(ch.label)} was…">${escapeHTML(reflection?.text || '')}</textarea><div class="char-count" id="counter-bottom">${(reflection?.text||'').length} / ${MAX_REFLECTION}</div></div><div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" data-action="save-reflection">${reflection?'Update reflection':'Save reflection'}</button><span id="reflection-state" class="success" aria-live="polite"></span></div></section>
      ${footer()}
    </div>`;
    bindPageEvents();
    updateCounter();
  }

  function renderJourney() {
    const s = studyState();
    const progress = currentProgress();
    $('#main').innerHTML = `<div class="page"><div class="page-head"><div><p class="eyebrow">THE JOURNEY</p><h1 class="page-title">Twenty chapters. One story.</h1><p class="page-subtitle">Follow the reading plan from Galatians to Colossians.</p></div><div class="card" style="padding:13px 16px"><strong>${progress.count} / ${progress.total}</strong><div class="progress-meta"><span>${progress.percent}% complete</span></div></div></div><section class="card"><div class="progress-wrap" style="margin-top:0"><div class="progress-track"><div class="progress-fill" style="width:${progress.percent}%"></div></div></div></section><section class="card timeline" style="margin-top:18px">${studyPlan.map(group=>`<div class="book-group"><h2 class="book-title">${group.book}</h2><div class="chapter-list">${Array.from({length:group.chapters},(_,i)=>{const ch=`${group.book} ${i+1}`;const cur=s.current?.label===ch;const done=isCompleted(ch);return `<div class="chapter-row ${done?'complete ':''}${cur?'current':''}"><div class="chapter-node">${done?'✓':cur?'•':''}</div><div><div class="chapter-name">${escapeHTML(ch)}</div><div class="chapter-status">${done?`Completed${completedAt(ch)?` · ${fmtDate(completedAt(ch).slice(0,10),{year:'numeric',month:'short',day:'numeric'})}`:''}`:cur?`Current · Day ${s.day}`:'Upcoming'}</div></div><div>${cur?'<span class="chapter-badge">Now</span>':''}</div></div>`}).join('')}</div></div>`).join('')}</section>${footer()}</div>`;
    bindPageEvents();
  }

  function renderReflections() {
    const mine = state.reflections.filter(r=>r.memberId===state.activeMemberId);
    const books = [...new Set(mine.map(r=>r.book))];
    $('#main').innerHTML = `<div class="page"><div class="page-head"><div><p class="eyebrow">MY REFLECTIONS</p><h1 class="page-title">A record of what the Word revealed.</h1><p class="page-subtitle">Your private reflection journal is stored on this device.</p></div></div><section class="card"><div class="search-row"><input class="input" id="reflection-search" placeholder="Search your reflections…" aria-label="Search reflections"><select class="select" id="reflection-filter"><option value="">All books</option>${books.map(b=>`<option>${escapeHTML(b)}</option>`).join('')}</select></div><div id="reflection-list">${renderReflectionList(mine)}</div></section>${footer()}</div>`;
    bindPageEvents();
  }

  function renderReflectionList(items) {
    if (!items.length) return `<div class="empty"><strong>Nothing written yet.</strong><p>Take a moment. What did the Word reveal to you today?</p></div>`;
    return items.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(r=>`<article class="reflection-item" style="margin-bottom:10px"><div class="reflection-meta"><strong>${escapeHTML(r.label)}</strong><span>${fmtDate(r.updatedAt.slice(0,10))}</span></div><p>${escapeHTML(r.text)}</p><div class="reflection-actions"><button class="btn btn-secondary" data-action="edit-reflection" data-id="${r.id}">Edit</button><button class="btn btn-danger" data-action="delete-reflection" data-id="${r.id}">Delete</button></div></article>`).join('');
  }

  function bibleBooks() { return [...new Set(studyPlan.map(x=>x.book))]; }
  function renderBible() {
    const s = studyState();
    const defaultLabel = s.current?.label || 'Galatians 1';
    const currentBook = defaultLabel.split(' ')[0];
    const currentChapter = Number(defaultLabel.split(' ')[1]) || 1;
    const label = window.__readerLabel && verses[window.__readerLabel] ? window.__readerLabel : defaultLabel;
    window.__readerLabel = null;
    const [selectedBook, selectedNum] = [label.split(' ').slice(0,-1).join(' '), Number(label.split(' ').at(-1))];
    const rows = verses[label] || [];
    $('#main').innerHTML = `<div class="page"><div class="page-head"><div><p class="eyebrow">BIBLE</p><h1 class="page-title">Read & carry the Word.</h1><p class="page-subtitle">A focused offline reader for the current study books.</p></div></div><section class="card reader"><div class="reader-toolbar"><select class="select" id="bible-book" style="width:auto;min-width:150px">${bibleBooks().map(b=>`<option value="${escapeHTML(b)}" ${b===selectedBook?'selected':''}>${escapeHTML(b)}</option>`).join('')}</select><select class="select" id="bible-chapter" style="width:auto;min-width:90px">${Array.from({length:studyPlan.find(g=>g.book===selectedBook)?.chapters||1},(_,i)=>`<option value="${i+1}" ${i+1===selectedNum?'selected':''}>Chapter ${i+1}</option>`).join('')}</select><button class="btn btn-secondary" data-action="font-down">A−</button><button class="btn btn-secondary" data-action="font-up">A+</button><button class="btn btn-secondary" data-action="reader-theme">${state.settings.theme==='dark'?'Light':'Dark'} reading</button></div><div class="reader-body"><h2>${escapeHTML(label)}</h2>${rows.length ? rows.map(([num,text])=>`<div class="verse-line"><div class="verse-num">${num}</div><div>${escapeHTML(text)}</div><div class="verse-actions"><button class="btn btn-ghost" data-action="bookmark-verse" data-label="${escapeHTML(label)}" data-verse="${escapeHTML(num)}">Save</button><button class="btn btn-ghost" data-action="copy-text" data-text="${escapeHTML(`${text} — ${label}:${num}`)}">Copy</button></div></div>`).join('') : `<div class="empty">No local text has been supplied for this chapter yet. Add permitted public-domain or licensed Bible content to the <code>verses</code> data object in <code>app.js</code>.</div>`}<div class="notice" style="margin-top:18px">Text shown here is public-domain KJV excerpt data. The app does not include a complete modern copyrighted translation.</div></div></section>${footer()}</div>`;
    bindPageEvents();
  }

  function renderTools() {
    $('#main').innerHTML = `<div class="page"><div class="page-head"><div><p class="eyebrow">STUDY TOOLS</p><h1 class="page-title">Helpful places to pause.</h1><p class="page-subtitle">Keep prayer, notes, bookmarks and focused study close at hand.</p></div></div><div class="grid grid-3">
      <section class="card tool-card"><div class="tool-icon">P</div><h2>Prayer Journal</h2><p class="muted">Write prayer points and return to them.</p><button class="btn btn-primary" data-action="open-prayer">Open prayer journal</button></section>
      <section class="card tool-card"><div class="tool-icon">N</div><h2>Notes</h2><p class="muted">Keep general Bible-study notes separate from daily reflections.</p><button class="btn btn-primary" data-action="open-notes">Open notebook</button></section>
      <section class="card tool-card"><div class="tool-icon">B</div><h2>Bookmarks</h2><p class="muted">Save meaningful verses and study points.</p><button class="btn btn-primary" data-action="open-bookmarks">View bookmarks</button></section>
      <section class="card tool-card"><div class="tool-icon">S</div><h2>Scripture Search</h2><p class="muted">Search the public-domain text currently loaded.</p><button class="btn btn-primary" data-action="open-search">Search Scripture</button></section>
      <section class="card tool-card"><div class="tool-icon">25</div><h2>Study Timer</h2><p class="muted">Create a quiet 25-minute window for focused reading.</p><button class="btn btn-primary" data-action="open-timer">Open timer</button></section>
      <section class="card tool-card"><div class="tool-icon">→</div><h2>Quick Prayer</h2><p class="muted">Begin simply: “Lord, speak to me through Your Word today…”</p><button class="btn btn-primary" data-action="open-quick-prayer">Begin prayer</button></section>
    </div>${footer()}</div>`;
    bindPageEvents();
  }

  function renderSettings() {
    const s = state.settings;
    $('#main').innerHTML = `<div class="page"><div class="page-head"><div><p class="eyebrow">SETTINGS</p><h1 class="page-title">Shape your study space.</h1><p class="page-subtitle">Your choices are kept on this device.</p></div></div><div class="grid grid-2">
      <section class="card"><div class="card-head"><h2>Personal</h2></div><div class="stack"><div class="field"><label for="settings-name">Name</label><input class="input" id="settings-name" maxlength="40" value="${escapeHTML(currentMember().name)}"></div><button class="btn btn-primary" data-action="save-name">Save name</button><div class="field"><label for="start-date">Study start date</label><input class="input" id="start-date" type="date" value="${escapeHTML(s.startDate)}"><div class="field-help">Default: September 7, 2026.</div></div><button class="btn btn-primary" data-action="save-start">Save study date</button></div></section>
      <section class="card"><div class="card-head"><h2>Appearance</h2></div><div class="stack"><div class="field"><label for="theme-select">Theme</label><select class="select" id="theme-select"><option value="light" ${s.theme==='light'?'selected':''}>Light</option><option value="dark" ${s.theme==='dark'?'selected':''}>Dark</option></select></div><div class="field"><label for="font-size">Bible reader font size</label><input id="font-size" type="range" min="0.9" max="1.35" step="0.05" value="${s.fontSize}"><div id="font-size-value" class="field-help">${Math.round(s.fontSize/1.05*100)}%</div></div><label class="check"><input type="checkbox" id="notification-toggle" ${s.notifications?'checked':''}><span>Enable study reminder permission when supported</span></label></div></section>
      <section class="card"><div class="card-head"><h2>Backup</h2></div><p class="muted">Move your reflections, prayers, notes, bookmarks and progress to another device.</p><div class="btn-row"><button class="btn btn-primary" data-action="export-data">Export my data</button><button class="btn btn-secondary" data-action="import-data">Import data</button><input type="file" id="import-file" accept="application/json" hidden></div></section>
      <section class="card"><div class="card-head"><h2>Group members</h2></div><p class="muted">Multiple Glory Carriers can share this device. Each member gets separate progress and reflections.</p><button class="btn btn-primary" data-action="manage-members">Manage members</button></section>
      <section class="card"><div class="card-head"><h2>Notifications</h2></div><p class="muted">Browser notifications may require permission and may not display while the app is closed on every device. A service worker is included for offline app support.</p><button class="btn btn-secondary" data-action="request-notification">${s.notifications?'Notifications enabled':'Enable notifications'}</button></section>
      <section class="card"><div class="card-head"><h2>About Glory Carriers</h2></div><p>“To know Christ, grow in His Word, and carry His glory into the world.”</p><p class="muted">One chapter. One day. One Word. Growing together.</p></section>
      <section class="card"><div class="card-head"><h2 class="danger-text">Reset personal progress</h2></div><p class="muted">This clears the active member’s completed chapters, check-ins and reflections. It does not remove other members.</p><button class="btn btn-danger" data-action="reset-progress">Reset my progress</button></section>
    </div>${footer()}</div>`;
    bindPageEvents();
  }

  function updateCounter() {
    const el = $('#reflection-text');
    const n = el?.value.length || 0;
    if ($('#counter-bottom')) $('#counter-bottom').textContent = `${n} / ${MAX_REFLECTION}`;
    if ($('#reflection-counter')) $('#reflection-counter').textContent = `${n} / ${MAX_REFLECTION}`;
  }

  function bindPageEvents() {
    $$('[data-route]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.route)));
    const reflection = $('#reflection-text');
    reflection?.addEventListener('input', updateCounter);
    $('#reflection-search')?.addEventListener('input', filterReflections);
    $('#reflection-filter')?.addEventListener('change', filterReflections);
    $$('[data-check]').forEach(cb => cb.addEventListener('change', () => toggleCheckin(cb.dataset.check, cb.checked)));
    $('#bible-book')?.addEventListener('change', updateBibleChapterOptions);
    $('#bible-chapter')?.addEventListener('change', openSelectedBibleChapter);
    $('#theme-select')?.addEventListener('change', () => setTheme($('#theme-select').value));
    $('#font-size')?.addEventListener('input', e => { state.settings.fontSize = Number(e.target.value); save(); document.documentElement.style.setProperty('--reading-size', `${state.settings.fontSize}rem`); $('#font-size-value').textContent = `${Math.round(state.settings.fontSize/1.05*100)}%`; });
    $('#notification-toggle')?.addEventListener('change', e => toggleNotifications(e.target.checked));
    $('#import-file')?.addEventListener('change', importFileChanged);
    $$('[data-action]').forEach(el => el.addEventListener('click', handleAction));
  }

  function navigate(route) {
    currentRoute = route;
    window.location.hash = route;
    if (route !== 'bible') window.__readerLabel = null;
    closeMobileMenu();
    render();
  }

  function handleAction(event) {
    const el = event.currentTarget;
    const action = el.dataset.action;
    switch (action) {
      case 'go-today': navigate('today'); break;
      case 'complete-today': completeToday(); break;
      case 'save-reflection': saveReflection(); break;
      case 'edit-reflection': editReflection(el.dataset.id); break;
      case 'delete-reflection': deleteReflection(el.dataset.id); break;
      case 'copy-verse': copyVerse(el.dataset.label); break;
      case 'copy-text': copyText(el.dataset.text); break;
      case 'bookmark-verse': bookmarkVerse(el.dataset.label, el.dataset.verse); break;
      case 'font-down': adjustFont(-0.05); break;
      case 'font-up': adjustFont(0.05); break;
      case 'reader-theme': setTheme(state.settings.theme==='dark'?'light':'dark'); break;
      case 'open-prayer': openPrayerModal(); break;
      case 'open-notes': openNotesModal(); break;
      case 'open-bookmarks': openBookmarksModal(); break;
      case 'open-search': openSearchModal(); break;
      case 'open-timer': openTimerModal(); break;
      case 'open-quick-prayer': openQuickPrayerModal(); break;
      case 'save-name': saveMemberName(); break;
      case 'save-start': saveStartDate(); break;
      case 'export-data': exportData(); break;
      case 'import-data': $('#import-file')?.click(); break;
      case 'manage-members': openMembersModal(); break;
      case 'request-notification': toggleNotifications(true); break;
      case 'reset-progress': resetProgress(); break;
    }
  }

  function toggleCheckin(item, checked) {
    const s = studyState();
    if (!s.current) return;
    const key = checkinKey(s.current.label, item);
    if (checked) state.checkins[key] = new Date().toISOString(); else delete state.checkins[key];
    save();
    const all = ['read','reflect','share'].every(k => Boolean(state.checkins[checkinKey(s.current.label,k)]));
    if (all && !isCompleted(s.current.label)) {
      completeToday(true);
    } else {
      render();
    }
  }

  function completeToday(silent=false) {
    const s = studyState();
    if (!s.current) return;
    if (!['read','reflect','share'].every(k => state.checkins[checkinKey(s.current.label,k)])) {
      showConfirm('Finish today’s check-in', 'Tick all three check-in items, including your reflection and takeaway, before completing today’s study.', null, 'Okay');
      return;
    }
    state.completed[completedKey(s.current.label)] = new Date().toISOString();
    save();
    if (!silent) toast(`${s.current.label} marked complete. Keep showing up in the Word.`);
    render();
  }

  function saveReflection() {
    const s = studyState();
    const field = $('#reflection-text');
    if (!s.current || !field) return;
    const text = field.value.trim();
    if (!text) { toast('Write a reflection before saving.', 'error'); field.focus(); return; }
    const now = new Date().toISOString();
    const existing = state.reflections.find(r=>r.memberId===state.activeMemberId && r.label===s.current.label);
    if (existing) { existing.text = text; existing.updatedAt = now; }
    else state.reflections.push({ id: uuid(), memberId: state.activeMemberId, label: s.current.label, book: s.current.book, text, updatedAt: now });
    state.checkins[checkinKey(s.current.label, 'reflect')] = now;
    save();
    $('#reflection-state').textContent = 'Reflection saved successfully.';
    toast(existing ? 'Reflection updated.' : 'Reflection saved successfully.');
    render();
  }

  function editReflection(id) {
    const r = state.reflections.find(x=>x.id===id);
    if (!r) return;
    const next = prompt(`Edit your ${r.label} reflection:`, r.text);
    if (next === null) return;
    if (!next.trim()) { toast('A reflection cannot be empty.', 'error'); return; }
    r.text = next.trim().slice(0, MAX_REFLECTION);
    r.updatedAt = new Date().toISOString();
    save(); renderReflections(); bindPageEvents(); toast('Reflection updated.');
  }

  function deleteReflection(id) {
    showConfirm('Delete reflection?', 'This removes the reflection from this device. Your chapter completion remains unchanged.', () => { state.reflections = state.reflections.filter(r=>r.id!==id); save(); render(); toast('Reflection deleted.'); });
  }

  function filterReflections() {
    const q = ($('#reflection-search')?.value || '').toLowerCase().trim();
    const book = $('#reflection-filter')?.value || '';
    const items = state.reflections.filter(r=>r.memberId===state.activeMemberId && (!q || `${r.label} ${r.text}`.toLowerCase().includes(q)) && (!book || r.book===book));
    $('#reflection-list').innerHTML = renderReflectionList(items);
    bindPageEvents();
  }

  function copyVerse(label) {
    const [num, text] = verseForCurrent(label);
    if (!text) return toast('No verse text is available for this chapter.', 'error');
    copyText(`“${text}” — ${label}:${num}`);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard.'); }
    catch { toast('Copy is not available in this browser.', 'error'); }
  }

  function bookmarkVerse(label, verse) {
    const exists = state.bookmarks.some(b=>b.memberId===state.activeMemberId && b.label===label && b.verse===verse);
    if (!exists) state.bookmarks.push({ id: uuid(), memberId: state.activeMemberId, label, verse, text: verses[label]?.find(v=>v[0]===verse)?.[1] || '', savedAt: new Date().toISOString() });
    save(); toast(exists ? 'Already bookmarked.' : 'Verse bookmarked.');
  }

  function adjustFont(delta) {
    state.settings.fontSize = Math.min(1.35, Math.max(.9, Number((state.settings.fontSize + delta).toFixed(2))));
    save(); renderBible();
  }

  function setTheme(theme) { state.settings.theme = theme; save(); render(); }

  function updateBibleChapterOptions() {
    const book = $('#bible-book').value;
    const count = studyPlan.find(g=>g.book===book)?.chapters || 1;
    const select = $('#bible-chapter');
    const old = Number(select.value) || 1;
    select.innerHTML = Array.from({length:count},(_,i)=>`<option value="${i+1}">Chapter ${i+1}</option>`).join('');
    select.value = String(Math.min(old,count));
  }

  function openSelectedBibleChapter() {
    const book = $('#bible-book').value;
    const chapter = $('#bible-chapter').value;
    window.__readerLabel = `${book} ${chapter}`;
    renderBible();
  }

  function saveMemberName() {
    const input = $('#settings-name');
    const member = currentMember();
    const name = input?.value.trim();
    if (!member || !name) return toast('Please enter a name.', 'error');
    member.name = name; save(); render(); toast('Name updated.');
  }

  function saveStartDate() {
    const input = $('#start-date');
    const date = input?.value;
    if (!date) return toast('Choose a study start date.', 'error');
    state.settings.startDate = date; save(); render(); toast('Study start date updated.');
  }

  async function toggleNotifications(enable) {
    if (!('Notification' in window)) { toast('Notifications are not supported by this browser.', 'error'); return; }
    try {
      const perm = await Notification.requestPermission();
      state.settings.notifications = enable && perm === 'granted';
      save();
      toast(state.settings.notifications ? 'Study reminders enabled.' : 'Notification permission was not granted.', state.settings.notifications?'success':'error');
      render();
    } catch { toast('Notification permission could not be requested.', 'error'); }
  }

  function exportData() {
    const payload = { app: 'Glory Carriers', version: 1, exportedAt: new Date().toISOString(), data: state };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`glory-carriers-backup-${dateKey()}.json`; a.click(); URL.revokeObjectURL(url); toast('Your backup file is ready.');
  }

  async function importFileChanged(e) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const text = await file.text(); const payload = JSON.parse(text); const incoming = payload.data || payload;
      if (!incoming.members || !incoming.settings) throw new Error('Unsupported backup format.');
      state = deepMerge(defaultData(), incoming); save(); render(); toast('Data imported successfully.');
    } catch (err) { console.error(err); toast('Could not import that file.', 'error'); }
    e.target.value = '';
  }

  function resetProgress() {
    showConfirm('Reset your progress?', 'This permanently clears your completed chapters, daily check-ins and reflections for the active member.', () => {
      Object.keys(state.completed).filter(k=>k.startsWith(`${state.activeMemberId}|`)).forEach(k=>delete state.completed[k]);
      Object.keys(state.checkins).filter(k=>k.startsWith(`${state.activeMemberId}|`)).forEach(k=>delete state.checkins[k]);
      state.reflections = state.reflections.filter(r=>r.memberId!==state.activeMemberId);
      save(); render(); toast('Your personal progress has been reset.');
    });
  }

  function modal(title, body, foot='') {
    $('#modal-region').innerHTML = `<div class="modal-backdrop" data-modal-backdrop><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-modal-close aria-label="Close">×</button></div><div class="modal-body">${body}</div>${foot?`<div class="modal-foot">${foot}</div>`:''}</div></div>`;
    $$('[data-modal-close], [data-modal-backdrop]').forEach(el=>el.addEventListener('click', e=>{ if(e.target===el) closeModal(); }));
  }
  function closeModal() { $('#modal-region').innerHTML=''; }

  function openPrayerModal() {
    const prayers = state.prayers.filter(p=>p.memberId===state.activeMemberId);
    modal('Prayer Journal', `<div class="field"><label for="prayer-input">Prayer point</label><textarea id="prayer-input" class="textarea" placeholder="Write it down. Bring it before God."></textarea></div><div style="margin-top:18px">${prayers.length?prayers.map(p=>`<div class="reflection-item" style="margin-bottom:8px"><div class="reflection-meta"><strong>Prayer point</strong><span>${fmtDate(p.createdAt.slice(0,10))}</span></div><p>${escapeHTML(p.text)}</p></div>`).join(''):`<div class="empty">Write it down. Bring it before God.</div>`}</div>`, '<button class="btn btn-secondary" data-modal-close>Close</button><button class="btn btn-primary" id="save-prayer">Save prayer</button>');
    $('#save-prayer').onclick=()=>{const v=$('#prayer-input').value.trim();if(!v)return toast('Write a prayer point first.','error');state.prayers.push({id:uuid(),memberId:state.activeMemberId,text:v,createdAt:new Date().toISOString()});save();closeModal();toast('Prayer point saved.');};
  }

  function openNotesModal() {
    const notes = state.notes.filter(n=>n.memberId===state.activeMemberId);
    modal('Bible Study Notes', `<div class="field"><label for="note-title">Title</label><input id="note-title" class="input" placeholder="Study thought, question, insight…"></div><div class="field" style="margin-top:12px"><label for="note-body">Note</label><textarea id="note-body" class="textarea" placeholder="Write your note here…"></textarea></div><div style="margin-top:18px">${notes.length?notes.map(n=>`<div class="reflection-item" style="margin-bottom:8px"><strong>${escapeHTML(n.title||'Untitled note')}</strong><p>${escapeHTML(n.text)}</p></div>`).join(''):`<div class="empty">Your Bible-study notebook is ready.</div>`}</div>`, '<button class="btn btn-secondary" data-modal-close>Close</button><button class="btn btn-primary" id="save-note">Save note</button>');
    $('#save-note').onclick=()=>{const title=$('#note-title').value.trim()||'Untitled note';const text=$('#note-body').value.trim();if(!text)return toast('Write a note first.','error');state.notes.push({id:uuid(),memberId:state.activeMemberId,title,text,createdAt:new Date().toISOString()});save();closeModal();toast('Note saved.');};
  }

  function openBookmarksModal() {
    const items = state.bookmarks.filter(b=>b.memberId===state.activeMemberId);
    modal('Bookmarks', items.length?items.map(b=>`<div class="reflection-item" style="margin-bottom:8px"><div class="reflection-meta"><strong>${escapeHTML(b.label)}:${escapeHTML(b.verse)}</strong><span>${fmtDate(b.savedAt.slice(0,10))}</span></div><p>${escapeHTML(b.text)}</p></div>`).join(''):`<div class="empty">Your saved Scriptures will appear here.</div>`, '<button class="btn btn-secondary" data-modal-close>Close</button>');
  }

  function openSearchModal() {
    modal('Scripture Search', `<div class="field"><label for="scripture-query">Search available text</label><input id="scripture-query" class="input" placeholder="e.g. Christ, faith, prayer…"></div><div id="search-results" style="margin-top:16px"></div>`, '<button class="btn btn-secondary" data-modal-close>Close</button>');
    $('#scripture-query').addEventListener('input', e=>{
      const q=e.target.value.toLowerCase().trim(); if(!q){$('#search-results').innerHTML='<div class="empty">Search the public-domain excerpts currently loaded in the app.</div>';return;}
      const hits=[]; for(const [label, rows] of Object.entries(verses)) for(const [num,text] of rows) if(text.toLowerCase().includes(q)) hits.push(`<div class="reflection-item" style="margin-bottom:8px"><div class="reflection-meta"><strong>${escapeHTML(label)}:${num}</strong></div><p>${escapeHTML(text)}</p></div>`);
      $('#search-results').innerHTML=hits.length?hits.join(''):`<div class="empty">No matching verses were found in the currently loaded excerpts.</div>`;
    });
    $('#search-results').innerHTML='<div class="empty">Search the public-domain excerpts currently loaded in the app.</div>';
  }

  function openQuickPrayerModal() {
    modal('Quick Prayer', `<p class="scripture">“Lord, speak to me through Your Word today. Open my heart to what You want me to see, receive, obey and share. Teach me to know Christ, grow in His Word, and carry Your glory into the world. Amen.”</p>`, '<button class="btn btn-secondary" data-modal-close>Close</button><button class="btn btn-primary" id="save-quick-prayer">Save as prayer point</button>');
    $('#save-quick-prayer').onclick=()=>{state.prayers.push({id:uuid(),memberId:state.activeMemberId,text:'Lord, speak to me through Your Word today. Open my heart to what You want me to see, receive, obey and share.',createdAt:new Date().toISOString()});save();closeModal();toast('Prayer point saved.');};
  }

  function openTimerModal() {
    const renderTimer = () => {
      const m=String(Math.floor(timer.seconds/60)).padStart(2,'0'), s=String(timer.seconds%60).padStart(2,'0');
      const out=$('#timer-display'); if(out) out.textContent=`${m}:${s}`;
      const btn=$('#timer-toggle'); if(btn) btn.textContent=timer.running?'Pause':'Start';
    };
    modal('Study Timer', `<div style="text-align:center"><div id="timer-display" style="font-size:4rem;font-weight:800;letter-spacing:-.06em">25:00</div><p class="muted">Use this space for focused Bible reading.</p><div class="btn-row" style="justify-content:center"><button class="btn btn-primary" id="timer-toggle">Start</button><button class="btn btn-secondary" id="timer-reset">Reset</button></div></div>`, '<button class="btn btn-secondary" data-modal-close>Close</button>');
    renderTimer();
    $('#timer-toggle').onclick=()=>{ timer.running=!timer.running; clearInterval(timer.handle); if(timer.running){timer.handle=setInterval(()=>{if(timer.seconds>0){timer.seconds--;renderTimer();}else{timer.running=false;clearInterval(timer.handle);toast('Your study timer is complete.');}},1000);} renderTimer(); };
    $('#timer-reset').onclick=()=>{timer.seconds=1500;timer.running=false;clearInterval(timer.handle);renderTimer();};
  }

  function openMembersModal() {
    const cards=state.members.map(m=>`<div class="reflection-item" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div><strong>${escapeHTML(m.name)}</strong><div class="muted">${m.id===state.activeMemberId?'Active member':''}</div></div><div class="btn-row"><button class="btn btn-secondary" data-member-switch="${m.id}">Select</button>${state.members.length>1?`<button class="btn btn-danger" data-member-delete="${m.id}">Delete</button>`:''}</div></div>`).join('');
    modal('Glory Carriers on this device', `<div class="field"><label for="new-member">Add another member</label><input id="new-member" class="input" maxlength="40" placeholder="Enter name"></div><div style="margin-top:18px">${cards || '<div class="empty">No members yet.</div>'}</div>`, '<button class="btn btn-secondary" data-modal-close>Close</button><button class="btn btn-primary" id="add-member">Add member</button>');
    $('#add-member').onclick=()=>{const name=$('#new-member').value.trim();if(!name)return toast('Enter a name first.','error');const m={id:uuid(),name};state.members.push(m);state.activeMemberId=m.id;save();closeModal();render();toast(`${name} added to Glory Carriers.`);};
    $$('[data-member-switch]').forEach(b=>b.onclick=()=>{state.activeMemberId=b.dataset.memberSwitch;save();closeModal();render();toast('Profile switched.');});
    $$('[data-member-delete]').forEach(b=>b.onclick=()=>{const id=b.dataset.memberDelete;const m=state.members.find(x=>x.id===id);if(!m)return;showConfirm(`Delete ${m.name}?`,'This removes that member and their local data from this device.',()=>{state.members=state.members.filter(x=>x.id!==id);state.reflections=state.reflections.filter(x=>x.memberId!==id);state.prayers=state.prayers.filter(x=>x.memberId!==id);state.notes=state.notes.filter(x=>x.memberId!==id);state.bookmarks=state.bookmarks.filter(x=>x.memberId!==id);Object.keys(state.completed).filter(k=>k.startsWith(`${id}|`)).forEach(k=>delete state.completed[k]);Object.keys(state.checkins).filter(k=>k.startsWith(`${id}|`)).forEach(k=>delete state.checkins[k]);state.activeMemberId=state.members[0]?.id||null;save();closeModal();render();toast('Member deleted.');});});
  }

  function showConfirm(title, message, onConfirm, confirmText='Confirm') {
    modal(title, `<p class="muted">${message}</p>`, `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn ${confirmText==='Delete'?'btn-danger':'btn-primary'}" id="confirm-action">${confirmText}</button>`);
    $('#confirm-action').onclick=()=>{closeModal();if(onConfirm)onConfirm();};
  }

  function initWelcome() {
    $('#name-form').addEventListener('submit', e=>{
      e.preventDefault();
      const input=$('#name-input'); const name=input.value.trim();
      if(!name){input.focus();return;}
      const m={id:uuid(),name}; state.members.push(m); state.activeMemberId=m.id; save(); render(); toast(`Welcome, ${name}.`);
    });
  }

  function initThemeButton() { $('#quick-theme').addEventListener('click',()=>setTheme(state.settings.theme==='dark'?'light':'dark')); }
  function initProfileButton() { $('#profile-button').addEventListener('click',()=>openMembersModal()); }
  function initMobileMenu() { $('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open')); }
  function closeMobileMenu() { $('#sidebar').classList.remove('open'); }

  function toast(message, type='success') {
    const el=document.createElement('div'); el.className='toast'; if(type==='error') el.style.borderLeftColor='var(--danger)'; el.textContent=message; $('#toast-region').appendChild(el); setTimeout(()=>el.remove(),3800);
  }

  function initRouter() {
    const route = location.hash.replace('#','');
    if (['dashboard','today','journey','reflections','bible','tools','settings'].includes(route)) currentRoute=route;
    window.addEventListener('hashchange',()=>{const r=location.hash.replace('#',''); if(r && r!==currentRoute && ['dashboard','today','journey','reflections','bible','tools','settings'].includes(r)){currentRoute=r;render();}});
  }

  async function registerSW() {
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn('Service worker registration failed', e); }
    }
  }

  function boot() {
    initWelcome(); initThemeButton(); initProfileButton(); initMobileMenu(); initRouter(); render(); registerSW();
  }
  boot();
})();
