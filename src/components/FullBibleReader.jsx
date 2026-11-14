import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { BIBLE_BOOKS } from "../lib/bibleBooks.js";

const base = import.meta.env.BASE_URL;

export function FullBibleReader({
  initialBook,
  initialChapter,
  embedded = false,
  isOpen = true,
  onClose,
  onChapterChange,
  onStartReading,
  onMarkComplete,
  isSaving = false,
  startDisabled = false,
  completeDisabled = false,
  completeLabel = "Mark this chapter complete",
  startLabel = "Start Reading",
  readingProgress,
  progressLabel,
  successMessage,
  errorMessage,
  footerHint,
  completionSuccess,
  onDismissCompletion
}) {
  const titleId = useId();
  const completionTitleId = useId();
  const completionMessageId = useId();
  const overlayRef = useRef(null);
  const completionDialogRef = useRef(null);
  const completionContinueRef = useRef(null);
  const closeButtonRef = useRef(null);
  const readerTextRef = useRef(null);
  const loadedBookSlugRef = useRef("");
  const previousFocusRef = useRef(null);
  const closeTimerRef = useRef(null);
  const completionCloseTimerRef = useRef(null);
  const isClosingRef = useRef(false);
  const closeRequestRef = useRef(null);
  const completionDismissRef = useRef(null);
  const completionSuccessRef = useRef(completionSuccess);
  const wasCompletionOpenRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isCompletionClosing, setIsCompletionClosing] = useState(false);
  const [books] = useState(BIBLE_BOOKS);
  const [bookName, setBookName] = useState(() => BIBLE_BOOKS.some((book) => book.name === initialBook) ? initialBook : "Genesis");
  const [chapterNumber, setChapterNumber] = useState(Number(initialChapter) || 1);
  const [bookData, setBookData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  const [verseSearch, setVerseSearch] = useState("");
  const [textSize, setTextSize] = useState(1);

  const currentBook = books.find((book) => book.name === bookName);
  const requestClose = useCallback(() => {
    if (!onClose || isClosingRef.current) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    isClosingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      isClosingRef.current = false;
      setIsClosing(false);
      onClose();
    }, 180);
  }, [onClose]);
  closeRequestRef.current = requestClose;
  completionSuccessRef.current = completionSuccess;

  const dismissCompletion = useCallback(() => {
    if (!completionSuccess || isCompletionClosing) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onDismissCompletion?.();
      return;
    }
    setIsCompletionClosing(true);
    completionCloseTimerRef.current = window.setTimeout(() => {
      setIsCompletionClosing(false);
      onDismissCompletion?.();
    }, 180);
  }, [completionSuccess, isCompletionClosing, onDismissCompletion]);
  completionDismissRef.current = dismissCompletion;

  useEffect(() => {
    if (!currentBook || (!embedded && !isOpen) || loadedBookSlugRef.current === currentBook.slug) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`${base}bible/web/${currentBook.slug}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`${currentBook.name} could not be loaded. Please try again.`);
        return response.json();
      })
      .then((result) => {
        if (!alive) return;
        loadedBookSlugRef.current = currentBook.slug;
        setBookData(result);
      })
      .catch((loadError) => alive && setError(loadError.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [currentBook?.slug, embedded, isOpen]);

  useEffect(() => {
    if (embedded || !isOpen) return undefined;
    const previousFocus = document.activeElement;
    previousFocusRef.current = previousFocus instanceof HTMLElement ? previousFocus : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus({ preventScroll: true });

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (completionSuccessRef.current) completionDismissRef.current?.();
        else closeRequestRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const overlay = completionSuccessRef.current ? completionDialogRef.current : overlayRef.current;
      const focusable = [...(overlay?.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]") || [])];
      if (!focusable.length) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !overlay?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !overlay?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true });
    };
  }, [embedded, isOpen]);

  useEffect(() => {
    if (completionSuccess) {
      wasCompletionOpenRef.current = true;
      completionContinueRef.current?.focus({ preventScroll: true });
      return;
    }
    if (wasCompletionOpenRef.current && isOpen) closeButtonRef.current?.focus({ preventScroll: true });
    wasCompletionOpenRef.current = false;
    if (completionCloseTimerRef.current) window.clearTimeout(completionCloseTimerRef.current);
    setIsCompletionClosing(false);
  }, [completionSuccess, isOpen]);

  useEffect(() => {
    if (embedded || isOpen) return;
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    isClosingRef.current = false;
    setIsClosing(false);
  }, [embedded, isOpen]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    if (completionCloseTimerRef.current) window.clearTimeout(completionCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (currentBook && chapterNumber > currentBook.chapters) setChapterNumber(currentBook.chapters);
  }, [chapterNumber, currentBook]);

  useEffect(() => {
    if (readerTextRef.current) readerTextRef.current.scrollTop = 0;
  }, [bookName, chapterNumber]);

  useEffect(() => {
    onChapterChange?.({ book: bookName, chapter: chapterNumber });
  }, [bookName, chapterNumber, onChapterChange]);

  const verses = useMemo(() => bookData.filter((verse) => verse.chapterNumber === chapterNumber), [bookData, chapterNumber]);
  const visibleVerses = useMemo(() => {
    const query = verseSearch.trim().toLowerCase();
    return query ? verses.filter((verse) => verse.value.toLowerCase().includes(query) || String(verse.verseNumber).includes(query)) : verses;
  }, [verses, verseSearch]);
  const filteredBooks = books.filter((book) => book.name.toLowerCase().includes(bookSearch.trim().toLowerCase()));
  const oldTestament = filteredBooks.filter((book) => book.testament === "Old Testament");
  const newTestament = filteredBooks.filter((book) => book.testament === "New Testament");
  const currentBookIndex = books.findIndex((book) => book.name === bookName);

  function moveChapter(direction) {
    if (!currentBook) return;
    if (direction < 0 && chapterNumber > 1) setChapterNumber((value) => value - 1);
    else if (direction > 0 && chapterNumber < currentBook.chapters) setChapterNumber((value) => value + 1);
    else {
      const nextBook = books[currentBookIndex + direction];
      if (nextBook) {
        setBookName(nextBook.name);
        setChapterNumber(direction > 0 ? 1 : nextBook.chapters);
      }
    }
    setVerseSearch("");
  }

  return (
    <div
      ref={overlayRef}
      className={embedded ? "full-bible-embedded" : `full-bible-overlay${isClosing ? " is-closing" : ""}`}
      hidden={!embedded && !isOpen}
      aria-hidden={!embedded && !isOpen}
      onClick={!embedded ? (event) => { if (event.target === event.currentTarget) requestClose(); } : undefined}
    >
      <section className={`full-bible-reader${embedded ? " full-bible-reader--embedded" : " full-bible-reader--modal"}`} role={embedded ? undefined : "dialog"} aria-modal={!embedded && isOpen ? true : undefined} aria-hidden={completionSuccess ? "true" : undefined} aria-labelledby={titleId}>
        <header className={`full-bible-header${embedded ? "" : " full-bible-modal-header"}`}>
          <div className="full-bible-header-identity">
            {!embedded ? <span className="full-bible-header-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
                <path d="M8.5 7h8M8.5 10.5h8" />
              </svg>
            </span> : null}
            <div>
            <p className="eyebrow">WORLD ENGLISH BIBLE · PUBLIC DOMAIN</p>
            <h2 id={titleId}>{embedded ? "Bible library" : "Bible Reading"}</h2>
            {!embedded ? <p className="full-bible-header-context"><strong>{bookName} {chapterNumber}</strong><span>World English Bible</span></p> : null}
            </div>
          </div>
          {!embedded && Number.isFinite(readingProgress) ? <div className="full-bible-header-progress">
            <div><span>{progressLabel || "Reading plan progress"}</span><strong>{Math.round(readingProgress)}%</strong></div>
            <span className="full-bible-header-progress-track" role="progressbar" aria-label={progressLabel || "Reading plan progress"} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(readingProgress)}><i style={{ width: `${Math.min(100, Math.max(0, readingProgress))}%` }} /></span>
          </div> : null}
          {!embedded ? <button ref={closeButtonRef} type="button" className="full-bible-close" onClick={requestClose} aria-label="Close Bible reader">
            <span>Close</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button> : null}
        </header>

        <div className="full-bible-toolbar">
          <label>
            <span>Book</span>
            <select value={bookName} onChange={(event) => { setBookName(event.target.value); setChapterNumber(1); setVerseSearch(""); }}>
              {oldTestament.length ? <optgroup label="Old Testament">{oldTestament.map((book) => <option key={book.slug} value={book.name}>{book.name}</option>)}</optgroup> : null}
              {newTestament.length ? <optgroup label="New Testament">{newTestament.map((book) => <option key={book.slug} value={book.name}>{book.name}</option>)}</optgroup> : null}
            </select>
          </label>
          <label>
            <span>Chapter</span>
            <select value={chapterNumber} onChange={(event) => { setChapterNumber(Number(event.target.value)); setVerseSearch(""); }} disabled={!currentBook}>
              {Array.from({ length: currentBook?.chapters || 0 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
            </select>
          </label>
          <details className="full-bible-extra-controls">
            <summary>
              Reading settings
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            <div className="full-bible-extra-controls-content">
              <label className="full-bible-book-field">
                <span>Find a book</span>
                <input type="search" value={bookSearch} onChange={(event) => setBookSearch(event.target.value)} placeholder="Search Genesis, John…" />
              </label>
              <label className="full-bible-search-field">
                <span>Find in chapter</span>
                <input type="search" value={verseSearch} onChange={(event) => setVerseSearch(event.target.value)} placeholder="Search this chapter" />
              </label>
              <div className="full-bible-size-control" aria-label="Reading text size">
                <span>Text size</span>
                <button type="button" onClick={() => setTextSize((value) => Math.max(0, value - 1))} aria-label="Decrease text size" disabled={textSize === 0}>A−</button>
                <button type="button" onClick={() => setTextSize((value) => Math.min(2, value + 1))} aria-label="Increase text size" disabled={textSize === 2}>A+</button>
              </div>
            </div>
          </details>
        </div>

        {embedded ? <nav className="full-bible-chapter-nav" aria-label="Bible chapter navigation">
          <button type="button" className="secondary-button compact" onClick={() => moveChapter(-1)} disabled={!books.length || (currentBookIndex === 0 && chapterNumber === 1)}>Previous chapter</button>
          <p><strong>{bookName} {chapterNumber}</strong><span>{currentBook ? `${chapterNumber} of ${currentBook.chapters}` : ""}</span></p>
          <button type="button" className="secondary-button compact" onClick={() => moveChapter(1)} disabled={!currentBook || (currentBookIndex === books.length - 1 && chapterNumber === currentBook.chapters)}>Next chapter</button>
        </nav> : null}

        <main ref={readerTextRef} tabIndex="-1" className={`full-bible-text full-bible-text--${textSize}`} aria-live="polite">
          {loading ? <p className="full-bible-state">Loading chapter…</p> : error ? <p className="full-bible-state" role="alert">{error}</p> : !visibleVerses.length ? <p className="full-bible-state">No verses match that search in this chapter.</p> : visibleVerses.map((verse) => (
            <p key={`${verse.chapterNumber}-${verse.verseNumber}`}><sup>{verse.verseNumber}</sup>{verse.value}</p>
          ))}
        </main>

        <footer className={`full-bible-footer${embedded ? "" : " full-bible-modal-footer"}`}>
          {!embedded ? <div className={`full-bible-modal-actions${onMarkComplete ? " has-completion" : ""}`}>
            <button type="button" className="secondary-button compact full-bible-action-previous" onClick={() => moveChapter(-1)} disabled={!books.length || (currentBookIndex === 0 && chapterNumber === 1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg><span>Previous Chapter</span>
            </button>
            <button type="button" className="secondary-button compact full-bible-action-next" onClick={() => moveChapter(1)} disabled={!currentBook || (currentBookIndex === books.length - 1 && chapterNumber === currentBook.chapters)}>
              <span>Next Chapter</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            {onStartReading ? <button type="button" className="secondary-button compact full-bible-action-start" onClick={onStartReading} disabled={isSaving || startDisabled}>{startLabel}</button> : null}
            {onMarkComplete ? <button type="button" className="bible-btn primary full-bible-complete-action full-bible-action-complete" onClick={onMarkComplete} disabled={isSaving || completeDisabled} aria-busy={isSaving}>
              {isSaving
                ? <svg className="full-bible-completion-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 9" /></svg>}
              <span>{isSaving ? "Saving…" : completeLabel}</span>
            </button> : null}
          </div> : null}
          <div className="full-bible-footer-meta">
            <span>{footerHint || (embedded ? "Browsing does not change your assigned-reading progress." : "Take your time with today's reading.")}</span>
            <a href="https://ebible.org/engwebp/copyright.htm" target="_blank" rel="noreferrer">Text source and public-domain notice</a>
          </div>
          {!embedded && errorMessage ? <p className="full-bible-modal-feedback error" role="alert">{errorMessage}</p> : null}
          {!embedded && successMessage ? <p className="full-bible-modal-feedback success" role="status">{successMessage}</p> : null}
        </footer>
      </section>
      {!embedded && completionSuccess ? <div className={`full-bible-completion-backdrop${isCompletionClosing ? " is-closing" : ""}`} role="presentation">
        <section ref={completionDialogRef} className="full-bible-completion-dialog" role="dialog" aria-modal="true" aria-labelledby={completionTitleId} aria-describedby={completionMessageId}>
          <div className="full-bible-completion-confetti" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</div>
          <span className="full-bible-completion-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none">
              <circle className="full-bible-completion-ring" cx="32" cy="32" r="27" stroke="currentColor" strokeWidth="3" />
              <path className="full-bible-completion-check" d="m19 32 9 9 18-19" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="full-bible-completion-eyebrow">A MOMENT ROOTED IN THE WORD</p>
          <h2 id={completionTitleId}>Chapter Completed!</h2>
          <p id={completionMessageId} className="full-bible-completion-message">Wonderful work! You&apos;ve successfully completed this chapter. Keep growing in God&apos;s Word, one chapter at a time.</p>
          <strong className="full-bible-completion-passage">{completionSuccess.book} {completionSuccess.chapter}</strong>
          {Number.isFinite(completionSuccess.streak) ? <span className="full-bible-completion-streak">{completionSuccess.streak} day{completionSuccess.streak === 1 ? "" : "s"} rooted in the Word</span> : null}
          {completionSuccess.milestone ? <span className="full-bible-completion-milestone">Milestone earned · {completionSuccess.milestone}</span> : null}
          <button ref={completionContinueRef} type="button" className="full-bible-completion-continue" onClick={dismissCompletion}>Continue Reading</button>
        </section>
      </div> : null}
    </div>
  );
}
