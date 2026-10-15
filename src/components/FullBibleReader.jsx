import { useEffect, useMemo, useState } from "react";
import { BIBLE_BOOKS } from "../lib/bibleBooks.js";

const base = import.meta.env.BASE_URL;

export function FullBibleReader({ initialBook, initialChapter, embedded = false, onClose }) {
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

  useEffect(() => {
    if (!currentBook) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`${base}bible/web/${currentBook.slug}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`${currentBook.name} could not be loaded. Please try again.`);
        return response.json();
      })
      .then((result) => alive && setBookData(result))
      .catch((loadError) => alive && setError(loadError.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [currentBook?.slug]);

  useEffect(() => {
    if (embedded || !onClose) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [embedded, onClose]);

  useEffect(() => {
    if (currentBook && chapterNumber > currentBook.chapters) setChapterNumber(currentBook.chapters);
  }, [chapterNumber, currentBook]);

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
    <div className={embedded ? "full-bible-embedded" : "full-bible-overlay"}>
      <section className={`full-bible-reader${embedded ? " full-bible-reader--embedded" : ""}`} role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : "true"} aria-labelledby="full-bible-title">
        <header className="full-bible-header">
          <div>
            <p className="eyebrow">WORLD ENGLISH BIBLE · PUBLIC DOMAIN</p>
            <h2 id="full-bible-title">Bible library</h2>
          </div>
          {!embedded ? <button type="button" className="ghost-button compact" onClick={onClose} aria-label="Close Bible reader">Close</button> : null}
        </header>

        <div className="full-bible-toolbar">
          <label className="full-bible-book-field">
            <span>Find a book</span>
            <input type="search" value={bookSearch} onChange={(event) => setBookSearch(event.target.value)} placeholder="Search Genesis, John…" />
          </label>
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

        <nav className="full-bible-chapter-nav" aria-label="Bible chapter navigation">
          <button type="button" className="secondary-button compact" onClick={() => moveChapter(-1)} disabled={!books.length || (currentBookIndex === 0 && chapterNumber === 1)}>Previous chapter</button>
          <p><strong>{bookName} {chapterNumber}</strong><span>{currentBook ? `${chapterNumber} of ${currentBook.chapters}` : ""}</span></p>
          <button type="button" className="secondary-button compact" onClick={() => moveChapter(1)} disabled={!currentBook || (currentBookIndex === books.length - 1 && chapterNumber === currentBook.chapters)}>Next chapter</button>
        </nav>

        <main className={`full-bible-text full-bible-text--${textSize}`} aria-live="polite">
          {loading ? <p className="full-bible-state">Loading chapter…</p> : error ? <p className="full-bible-state" role="alert">{error}</p> : !visibleVerses.length ? <p className="full-bible-state">No verses match that search in this chapter.</p> : visibleVerses.map((verse) => (
            <p key={`${verse.chapterNumber}-${verse.verseNumber}`}><sup>{verse.verseNumber}</sup>{verse.value}</p>
          ))}
        </main>

        <footer className="full-bible-footer">
          <span>Browsing does not change your assigned-reading progress.</span>
          <a href="https://ebible.org/engwebp/copyright.htm" target="_blank" rel="noreferrer">Text source and public-domain notice</a>
        </footer>
      </section>
    </div>
  );
}
