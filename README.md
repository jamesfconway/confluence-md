# Confluence → Markdown Converter

A single-page web app that converts Confluence Cloud HTML into Markdown with configurable rules. The app is fully self-contained in `index.html`.

## GitHub Pages deployment
GitHub Pages can host this page directly from the repository without extra build steps.

1. Commit and push the repo to GitHub (the main branch is fine).
2. In the repository, open **Settings → Pages**.
3. Under **Source**, select **Deploy from a branch** and choose **main** and **/(root)** (where `index.html` lives).
4. Save. GitHub will publish the site at `https://<username>.github.io/<repo>/` after a short build.

Once enabled, browse to the published URL and the app will load automatically because `index.html` sits at the root.

## Local use
If you prefer to run it locally:

```bash
# From the repo root
python3 -m http.server 8000
# then open http://localhost:8000/
```

All external dependencies are loaded via CDN, so no additional setup is required.
