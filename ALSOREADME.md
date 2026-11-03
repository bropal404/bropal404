# How this repo works

`README.md` is not written by hand. A script generates it, and the portfolio website reads data from it.

## Layout

| Path | What it is |
| --- | --- |
| `public/` | The website, "The Kataria Chronicle" (static HTML, CSS and ES modules). `public/2025.html` is the previous version. |
| `scripts/refresh_readme.py` | Fetches live data and writes `README.md` and the status card. |
| `assets/status-<timestamp>.svg` | The status card shown in `README.md`. Generated; only one exists at a time. |
| `.github/workflows/refresh-readme.yml` | Runs the script and commits the result. |
| `.github/workflows/deploy.yml` | On every push to `main`, asks ResearchWeb to sync the site. |

## The README refresh script

`scripts/refresh_readme.py` runs on every push to `main` and every hour (`9 * * * *`).

What it collects:

- **Status line:** picked from the current hour in IST ("BIRIYANI TIME" at lunch, and so on).
- **Weather:** Hyderabad, from wttr.in. Shows "unavailable" if the request fails.
- **Latest push:** the repo, commit message and time of your most recent public push, read from your push events. The bot's own README commits are not your events, so they never count. If the events call fails, it falls back to the most recently pushed repo.
- **Repos and stars:** non-fork, non-archived repos you own.
- **Top languages:** summed across those repos.
- **Activity:** commits in the last 7 days, open issues and open PRs you authored, and your longest contribution streak (GraphQL).

Each missing value degrades to "n/a" or null. One failed API call does not stop the run.

What it writes:

1. `assets/status-YYYYMMDD-HHMM.svg`, the card. Old `assets/status*.svg` files are deleted first. The timestamp in the name is deliberate: GitHub's image proxy caches by URL, so a new name forces a fresh image.
2. `README.md`: a heading, an image link to the new card, and the raw data as JSON inside an HTML comment. The comment keeps it out of the rendered page.

The website fetches `README.md` from GitHub, finds the first ```` ```json ```` block and uses `status`, `latest_active_repo`, `last_commit` and `longest_streak`. Keep that block in the file.

The workflow then runs `git add -A README.md assets` and commits "chore: refresh README" only if something changed.

### Setup

- A repository secret `GH_PAT`: a classic personal access token with `read:user` and `repo` scopes. It is needed for the GraphQL calls.
- The script skips private repos and private events, so private repo names never appear in the card or the JSON.

### Testing locally

```bash
python3 scripts/refresh_readme.py --test
```

This uses built-in sample data, needs no token or network access, and writes only `test-out/status.svg` (git-ignored). Open it in a browser to check the card. It does not touch `README.md` or `assets/`.

To run the real thing on your machine:

```bash
GH_PAT=<token> python3 scripts/refresh_readme.py
```

That overwrites `README.md` and `assets/`.

## The website

Serve `public/` with any static server:

```bash
cd public && python3 -m http.server 8000
```

Open `http://localhost:8000/?nointro` to skip the intro animation. Press `?` on the page for keyboard shortcuts.
