# GLORY CARRIERS — Daily Bible Study

A vanilla HTML5/CSS3/JavaScript Progressive Web App for the Glory Carriers cell group.

## Run locally

A service worker requires a secure context or localhost. From this folder, run one of:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Files

- `index.html` — app shell
- `style.css` — responsive premium UI
- `app.js` — app state, routing, study logic, tools and local persistence
- `manifest.json` — PWA manifest
- `sw.js` — offline cache/service worker
- `icon.svg` — app icon

## Notes

The offline Bible reader intentionally contains public-domain KJV excerpts rather than a complete modern copyrighted translation. Add additional permitted public-domain/licensed Bible text to the `verses` object in `app.js` or connect the reader to a licensed Bible API later.

All personal application data is stored locally in `localStorage` in this version.
