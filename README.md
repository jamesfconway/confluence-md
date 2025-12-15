# Confluence → Markdown Converter

A self-contained web app and Chrome extension that converts Confluence Cloud HTML into Markdown with configurable regex rules.
It supports clipboard ingestion, HTML/Markdown previews, and extension tooling to convert selections directly from any page.

## Features
- Paste or ingest Confluence snippets and instantly view formatted HTML alongside Markdown output.
- Toggle options for including links, image placeholders, and emoji shortcodes; preferences sync when run as an extension.
- Context menu actions (**Copy Markdown** and **Copy to sidebar**) to convert highlighted page content without opening the popup.
- Side panel and action popup both load the app UI, keeping conversion rules in `rules.json` consistent across entry points.
- Clipboard helpers: a **Paste from clipboard** control sits above the copied-content panel, and Markdown output provides copy
  buttons both in the toolbar and directly beneath the rendered Markdown for quick reuse.

## Use on the web
The app is a static page that can be hosted as-is.

### GitHub Pages
1. Commit and push the repo to GitHub.
2. Open **Settings → Pages**.
3. Under **Source**, select **Deploy from a branch** and choose **main** and **/(root)** (where `index.html` lives).
4. Save. GitHub will publish the site at `https://<username>.github.io/<repo>/` after a short build.

Once enabled, browse to the published URL and the app will load automatically because `index.html` sits at the root.

### Local use
If you prefer to run it locally:

```bash
# From the repo root
python3 -m http.server 8000
# then open http://localhost:8000/
```

All assets are bundled in the repository—no CDN access is required for local runs or the extension.

## Install as a Chrome extension
The repository doubles as a Manifest V3 extension. To load it locally:

1. Download or clone this repository.
2. In Chrome, open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. (Optional) Pin the extension to your toolbar for quick access.

> Chrome enforces local-only scripts and styles for extension pages. Because the app now ships with bundled assets, it loads without relaxing the content security policy.

### Using the extension
- **Popup**: Click the extension icon to open the app; paste Confluence HTML or use **Paste from clipboard** to convert.
- **Side panel**: Open the side panel via the extension icon or the context menu; the panel and popup share settings and rules.
- **Context menu**: Select content on any page, right-click, and choose **Copy Markdown** to copy converted text to your clipboard or **Copy to sidebar** to send it into the side panel for review.

Options (include links, image placeholders, emoji names) are stored via `chrome.storage.sync` so they persist across tabs.
