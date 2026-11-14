import { useEffect, useMemo, useRef, useState } from "react";
import { CELL_GROUP_NAME } from "../lib/identity";

const faqItems = [
  { category: "Getting Started", question: "What is City on a Hill?", answer: "The City on a Hill workspace helps this cell group stay connected through Bible study, prayer, messages, events, and shared resources." },
  { category: "Getting Started", question: "Who can join?", answer: "Access is for active members of the cell group. If you need an account or your access is paused, contact a group administrator to confirm your membership and account setup." },
  { category: "Getting Started", question: "How do I access my account?", answer: "Sign in with the email address and password attached to your account. If you cannot sign in, use the password recovery option on the sign-in screen or ask an administrator for help." },
  { category: "Getting Started", question: "How do I update my profile?", answer: "Open Profile & settings from the account menu to update your display name." },
  { category: "Bible Study", question: "How does the group Bible reading plan work?", answer: "Open Bible Study and choose the group study area to see the current shared reading and its completion activity. Administrators manage the shared plan." },
  { category: "Bible Study", question: "How do I mark a chapter as completed?", answer: "In Personal Bible Study, open a chapter in the reader and choose Mark this chapter complete. Group reading completion is recorded from the shared plan." },
  { category: "Bible Study", question: "How are personal Bible streaks calculated?", answer: "Your personal streak uses your own completed personal readings and the daily requirement configured for the streak. Personal reading history is separate from group reading activity." },
  { category: "Bible Study", question: "What are Bible streak partners?", answer: "A partnership is a reading circle where members encourage one another and see shared reading progress after they accept an invitation. Each member keeps their personal reading history." },
  { category: "Bible Study", question: "Can I have multiple streak partners?", answer: "Yes. You can create more than one partnership, and each circle can invite up to nine other members. Invitations must be accepted before the shared rhythm begins." },
  { category: "Bible Study", question: "How do I track my reading progress?", answer: "Personal Bible Study shows your plan completion, daily reading status, streak summary, and earned milestones. Bible Study also shows shared group and partner activity." },
  { category: "Prayer", question: "How do I submit a prayer request?", answer: "Open Prayer, add a title and any context you would like to share, then choose Share prayer request. You can make the displayed request anonymous." },
  { category: "Prayer", question: "Can I share an answered prayer?", answer: "Use Mark answered on a request when that action is available to your account. The request remains on the Prayer page with its answered status so the group can celebrate and give thanks." },
  { category: "Prayer", question: "Who can see my prayer requests?", answer: "Requests on the shared Prayer page are visible to members of your cell group. When you choose anonymous, your name is replaced with Anonymous on the request." },
  { category: "Events & Communication", question: "How do I view upcoming events?", answer: "Open Events to browse upcoming and past gatherings. Event details include the time and location when provided, and upcoming events can offer RSVP and calendar actions." },
  { category: "Events & Communication", question: "How do I receive notifications?", answer: "In-app notifications are available from the bell. You can manage notification preferences in Profile & settings. Device push alerts depend on browser support and workspace configuration." },
  { category: "Events & Communication", question: "How do I send messages?", answer: "Open Messages, choose an active member, write your note, and send it as a private direct message." },
  { category: "Account & Support", question: "How do I change my password?", answer: "Open Profile & settings and use the password form, or choose password recovery from the sign-in screen if you cannot sign in." },
  { category: "Account & Support", question: "How do I change the application theme?", answer: "Choose Switch to dark theme or Switch to light theme from the account menu, or change it in Profile & settings. Your choice is saved on this device." },
  { category: "Account & Support", question: "Who do I contact if I experience a problem?", answer: "Send a message to a group administrator from Messages, or ask a group leader for help in person." }
];

const categories = [...new Set(faqItems.map((item) => item.category))];

function useScrollReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return undefined;
    element.classList.add("story-reveal-ready");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0, rootMargin: "0px 0px -8% 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = "" }) {
  const ref = useScrollReveal();
  return <div ref={ref} className={`story-reveal ${className}`.trim()}>{children}</div>;
}

export function FAQPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All questions");
  const [openQuestion, setOpenQuestion] = useState(faqItems[0].question);
  const filteredItems = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return faqItems.filter((item) => {
      const categoryMatches = activeCategory === "All questions" || item.category === activeCategory;
      const searchMatches = !search || `${item.question} ${item.answer} ${item.category}`.toLocaleLowerCase().includes(search);
      return categoryMatches && searchMatches;
    });
  }, [query, activeCategory]);

  function selectCategory(category) {
    setActiveCategory(category);
    const nextFirstQuestion = faqItems.find((item) => category === "All questions" || item.category === category);
    if (nextFirstQuestion) setOpenQuestion(nextFirstQuestion.question);
  }

  return (
    <div className="story-page faq-page">
      <header className="story-hero faq-hero" style={{ "--story-hero-image": `url("${import.meta.env.BASE_URL}community/b.jpeg")` }}>
        <div className="story-orb story-orb-one" aria-hidden="true" />
        <div className="story-orb story-orb-two" aria-hidden="true" />
        <div className="story-hero-copy">
          <p className="story-kicker">A little help, whenever you need it</p>
          <h1>Frequently asked <span>questions</span></h1>
          <p>Clear answers to help you find your way around the City on a Hill community.</p>
        </div>
        <div className="faq-hero-art" aria-hidden="true">
          <svg viewBox="0 0 220 190" fill="none">
            <circle cx="174" cy="40" r="21" className="faq-art-sun" />
            <path d="M27 146c18-26 44-35 75-35 38 0 61 15 91 36v22H27v-23Z" className="faq-art-ground" />
            <path d="M43 71c0-8 6-14 14-14h44c8 0 14 6 14 14v25c0 8-6 14-14 14H78l-17 13v-13h-4c-8 0-14-6-14-14V71Z" className="faq-art-bubble" />
            <path d="M69 76c1-8 6-12 14-12 8 0 13 5 13 12 0 6-3 9-8 13-4 3-5 5-5 9" className="faq-art-question" />
            <circle cx="83" cy="105" r="2.6" className="faq-art-question" />
            <path d="M119 157c2-19 16-31 34-31s32 12 34 31" className="faq-art-person" />
            <path d="M129 157c1-13 9-21 24-21s23 8 24 21" className="faq-art-shirt" />
            <circle cx="153" cy="105" r="25" className="faq-art-face" />
            <path d="M128 103c1-19 12-31 28-31 15 0 27 12 27 29-6-2-12-7-16-13-7 9-21 14-39 15Z" className="faq-art-hair" />
            <circle cx="145" cy="107" r="2" className="faq-art-eye" /><circle cx="162" cy="107" r="2" className="faq-art-eye" />
            <path d="M147 117c4 4 9 4 13 0" className="faq-art-smile" />
            <path d="m39 46 4 9 9 4-9 4-4 9-4-9-9-4 9-4 4-9Z" className="faq-art-spark" />
            <path d="m186 91 2.5 5.5 5.5 2.5-5.5 2.5-2.5 5.5-2.5-5.5-5.5-2.5 5.5-2.5 2.5-5.5Z" className="faq-art-spark faq-art-spark-small" />
          </svg>
        </div>
      </header>

      <section className="faq-library" aria-label="Frequently asked questions">
        <div className="faq-tools">
          <label className="faq-search">
            <span className="faq-search-icon" aria-hidden="true">⌕</span>
            <span className="sr-only">Search frequently asked questions</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions or topics" />
            {query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>×</button> : null}
          </label>
          <p className="faq-result-count" aria-live="polite">{filteredItems.length} {filteredItems.length === 1 ? "answer" : "answers"}</p>
        </div>

        <nav className="faq-category-nav" aria-label="FAQ categories">
          {["All questions", ...categories].map((category) => (
            <button key={category} type="button" className={activeCategory === category ? "is-active" : ""} aria-pressed={activeCategory === category} onClick={() => selectCategory(category)}>{category}</button>
          ))}
        </nav>

        {filteredItems.length ? (
          <div className="faq-question-list">
            {filteredItems.map((item, index) => {
              const isOpen = openQuestion === item.question;
              const answerId = `faq-answer-${index}`;
              return (
                <article className={`faq-item${isOpen ? " is-open" : ""}`} key={item.question}>
                  <button type="button" className="faq-question" aria-expanded={isOpen} aria-controls={answerId} onClick={() => setOpenQuestion(isOpen ? "" : item.question)}>
                    <span><small>{item.category}</small><strong>{item.question}</strong></span><i aria-hidden="true" />
                  </button>
                  <div className="faq-answer-clip" id={answerId} aria-hidden={!isOpen}>
                    <div><p>{item.answer}</p></div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="faq-empty-state" role="status"><span aria-hidden="true">✦</span><h2>No answers found</h2><p>Try a different phrase or choose another category.</p><button type="button" className="secondary-button" onClick={() => { setQuery(""); selectCategory("All questions"); }}>Clear filters</button></div>
        )}
      </section>
    </div>
  );
}

export function AboutPage({ onNavigate }) {
  const navigate = (section) => onNavigate?.(section);
  return (
    <div className="story-page about-page">
      <header className="story-hero about-hero" style={{ "--story-hero-image": `url("${import.meta.env.BASE_URL}community/b.jpeg")` }}>
        <div className="story-orb story-orb-one" aria-hidden="true" />
        <div className="story-orb story-orb-two" aria-hidden="true" />
        <div className="about-hero-spark about-hero-spark-one" aria-hidden="true">✦</div>
        <div className="about-hero-spark about-hero-spark-two" aria-hidden="true">✧</div>
        <div className="story-hero-copy">
          <p className="story-kicker">Faith · Fellowship · Purpose</p>
          <h1>CITY ON A HILL</h1>
          <p className="about-hero-statement">A digital space for faith, fellowship, and shared growth.</p>
          <div className="about-hero-actions"><button type="button" className="story-primary-action" onClick={() => navigate("bible-study")}>Explore Bible Study <span aria-hidden="true">↗</span></button><button type="button" className="story-secondary-action" onClick={() => navigate("prayer")}>Visit the Prayer page</button></div>
        </div>
        <svg className="about-hero-art" viewBox="0 0 300 250" fill="none" aria-hidden="true">
          <circle cx="229" cy="54" r="29" className="about-art-sun" />
          <path d="M28 177c25-31 57-47 98-47 43 0 78 17 112 49v40H28v-42Z" className="about-art-far-hill" />
          <path d="M18 194c34-36 74-53 121-53 54 0 91 20 145 56v27H18v-30Z" className="about-art-hill" />
          <path d="M67 117h30v62H67zM103 92h39v87h-39zM151 110h31v69h-31zM190 81h42v98h-42z" className="about-art-building" />
          <path d="M113 101h6m12 0h6m-24 17h6m12 0h6m-24 17h6m12 0h6m-24 17h6m12 0h6M199 94h7m12 0h7m-26 18h7m12 0h7m-26 18h7m12 0h7m-26 18h7m12 0h7" className="about-art-window" />
          <path d="M78 130v-13m-6 7h12M211 103v-15m-7 7h14" className="about-art-cross" />
          <path d="M83 180c1-12 7-18 16-18s15 6 16 18" className="about-art-person-one" />
          <circle cx="99" cy="151" r="10" className="about-art-face-one" />
          <path d="M84 150c1-10 7-16 15-16 7 0 12 5 14 12-10 2-19 3-29 4Z" className="about-art-hair" />
          <path d="M239 188c1-11 7-17 15-17s14 6 15 17" className="about-art-person-two" />
          <circle cx="254" cy="160" r="9" className="about-art-face-two" />
          <path d="m44 77 5 11 11 5-11 5-5 11-5-11-11-5 11-5 5-11Z" className="about-art-star" />
          <path d="m259 112 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z" className="about-art-star about-art-star-small" />
        </svg>
        <span className="about-hero-caption">A place to grow, together</span>
      </header>

      <Reveal className="about-introduction">
        <p className="story-kicker">A connected community</p>
        <h2>Growing together, staying close.</h2>
        <p>{CELL_GROUP_NAME} is a digital home for fellowship, spiritual growth, and meaningful relationships. The platform helps members stay connected through prayer, Bible study, communication, and shared experiences.</p>
      </Reveal>

      <section className="about-pillars" aria-label="What the platform supports">
        <Reveal><article className="about-pillar about-pillar-scripture"><span className="about-pillar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v17H6.5A2.5 2.5 0 0 0 4 22V5.5ZM20 5.5A2.5 2.5 0 0 0 17.5 3H12v17h5.5A2.5 2.5 0 0 1 20 22V5.5Z"/><path d="M8 8h1M15 8h1"/></svg></span><small>01 · ROOTED</small><h3>Grow in Scripture</h3><p>Make space for personal reading and shared Bible study.</p></article></Reveal>
        <Reveal><article className="about-pillar about-pillar-prayer"><span className="about-pillar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M20.3 5.8a5 5 0 0 0-7.1 0L12 7l-1.2-1.2a5 5 0 0 0-7.1 7.1L12 21l8.3-8.1a5 5 0 0 0 0-7.1Z"/><path d="M12 9v6m-3-3h6"/></svg></span><small>02 · HELD IN PRAYER</small><h3>Care for one another</h3><p>Share prayer requests, encouragement, and answered prayers.</p></article></Reveal>
        <Reveal><article className="about-pillar about-pillar-community"><span className="about-pillar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-3.4 2.3-5.2 5.5-5.2s5.1 1.8 5.5 5.2M16 5.5a3 3 0 0 1 0 5.8M17 15c2.1.5 3.3 2.2 3.5 5"/></svg></span><small>03 · TOGETHER</small><h3>Stay connected</h3><p>Keep up with messages, gatherings, and resources from the group.</p></article></Reveal>
      </section>

      <section className="about-purpose-grid" aria-label="Ways members connect and grow">
        <Reveal><article className="about-purpose-card about-vision"><span className="about-purpose-mark" aria-hidden="true">✦</span><p className="story-kicker">Community</p><h2>Stay connected.</h2><p>Use messages, announcements, and event updates to stay close to what is happening in your cell group.</p></article></Reveal>
        <Reveal><article className="about-purpose-card about-mission"><span className="about-purpose-mark" aria-hidden="true">↗</span><p className="story-kicker">Spiritual growth</p><h2>Grow at your own pace.</h2><p>Personal and group Bible Study, prayer, and fellowship give members practical ways to take part.</p></article></Reveal>
      </section>

      <Reveal className="scripture-reveal">
        <blockquote className="about-scripture"><span className="scripture-glow" aria-hidden="true" /><span className="scripture-ornament" aria-hidden="true">“</span><p>You are the light of the world. A city set on a hill cannot be hidden.</p><cite>MATTHEW 5:14</cite><span className="scripture-bottom-mark" aria-hidden="true">✦</span></blockquote>
      </Reveal>
    </div>
  );
}
