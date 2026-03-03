# יום ספורט חוב״ב — Sports Day Scoreboard Dashboard

A live-updating scoreboard dashboard for a school sports day. Pulls data from a public Google Sheet and displays category scores, overall standings, and medal winners — designed to run on a TV or projector.

## Features

- **7 sport categories** with color-coded scores (Red, Yellow, Green teams)
- **Overall standings** bar showing categories won per team
- **Medal winners** per class, revealed automatically when a category completes
- **Live auto-refresh** every 5 seconds with status indicator
- **Hebrew RTL** layout optimized for 1920×1080 displays

## How to Run

1. Open `index.html` in a web browser.
2. The dashboard fetches data automatically.

## Configuration

The Google Sheet ID is set in `script.js`:

```js
const SHEET_ID = '1wBDYWlm9DcjDsWD2ZNL5X2KuKig0d-TaIH8unVlOVZw';
```

To use a different data source: Replace it with your own public Google Sheet URL. See `script.js` for the expected sheet layout (row/column mapping).

## Tech Stack

Plain HTML, CSS, and JavaScript — no frameworks, no build step, no dependencies.
