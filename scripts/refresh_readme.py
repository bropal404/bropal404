#!/usr/bin/env python3

import argparse
import textwrap
import json
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path
from urllib.request import Request, urlopen


USERNAME = "bropal404"
TOKEN = os.environ.get("GH_PAT", "")

README = "README.md"
ASSETS = Path("assets")


IST = timezone(timedelta(hours=5, minutes=30))


def github_get(url):
    req = Request(
        url,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )

    with urlopen(req, timeout=20) as response:
        return json.loads(response.read())


def github_graphql(query, variables):
    payload = json.dumps(
        {
            "query": query,
            "variables": variables,
        }
    ).encode()

    req = Request(
        "https://api.github.com/graphql",
        data=payload,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
    )

    with urlopen(req, timeout=20) as response:
        result = json.loads(response.read())

    if "errors" in result:
        raise RuntimeError(result["errors"])

    return result["data"]


def get_status(hour):
    if 2 <= hour <= 6:
        return "am I dreaming"
    if 6 <= hour < 9:
        return "at the gym"
    if 6 <= hour < 12:
        return "good morning, time to ship"
    if 12 <= hour < 15:
        return "BIRIYANI TIME"
    if 15 <= hour < 20:
        return "debugging arc"
    if 20 <= hour <= 23:
        return "Struggling with a deadline"
    return "having a chai without sugar"


def get_weather():
    url = "https://wttr.in/Hyderabad?format=j1"

    try:
        req = Request(
            url,
            headers={"User-Agent": "README-refresh/1.0"},
        )

        with urlopen(req, timeout=15) as response:
            data = json.loads(response.read())

        current = data["current_condition"][0]

        return {
            "location": "Hyderabad",
            "temperature": f"{current['temp_C']}°C",
            "condition": current["weatherDesc"][0]["value"],
        }

    except Exception:
        return {
            "location": "Hyderabad",
            "temperature": None,
            "condition": "unavailable",
        }


def get_repositories():
    repos = []
    page = 1

    while True:
        data = github_get(
            f"https://api.github.com/users/{USERNAME}/repos"
            f"?per_page=100&page={page}&type=owner&sort=pushed"
        )

        if not data:
            break

        repos.extend(data)

        if len(data) < 100:
            break

        page += 1

    return [repo for repo in repos if not repo["fork"] and not repo["archived"]]


def get_languages(repos):
    totals = Counter()

    for repo in repos:
        try:
            languages = github_get(repo["languages_url"])

            for language, bytes_count in languages.items():
                totals[language] += bytes_count

        except Exception as e:
            print(f"Could not read languages for {repo['name']}: {e}")

    return [language for language, _ in totals.most_common(5)]


def get_latest_push(repos):
    """Most recent public push by the user, with its commit message.

    Uses the user's own push events, so commits made by the Actions bot
    (README refreshes) never count, and the profile repo is not excluded.
    Falls back to the most recently pushed repo if events are unavailable.
    """
    try:
        events = github_get(
            f"https://api.github.com/users/{USERNAME}/events/public?per_page=100"
        )
        for event in events:
            if event.get("type") != "PushEvent":
                continue

            full_name = event["repo"]["name"]
            name = full_name.split("/", 1)[-1]
            date = event["created_at"]
            message = None

            try:
                commit = github_get(
                    f"https://api.github.com/repos/{full_name}/commits/{event['payload']['head']}"
                )["commit"]
                message = commit["message"].strip().splitlines()[0]
                date = commit["author"]["date"]
            except Exception as e:
                print(f"Could not read head commit of {full_name}: {e}")

            return name, date, message
    except Exception as e:
        print(f"Could not read push events: {e}")

    if not repos:
        return None, None, None
    latest = max(repos, key=lambda repo: repo.get("pushed_at") or "")
    return latest["name"], latest.get("pushed_at"), None


def get_repo_stats(repos):
    """Total repo count, total stars, and the most-starred repo."""
    total_stars = sum(repo.get("stargazers_count", 0) for repo in repos)

    most_starred = None
    if repos:
        top = max(repos, key=lambda repo: repo.get("stargazers_count", 0))
        if top.get("stargazers_count", 0) > 0:
            most_starred = {
                "name": top["name"],
                "stars": top["stargazers_count"],
            }

    return {
        "total_repos": len(repos),
        "total_stars": total_stars,
        "most_starred_repo": most_starred,
    }


def get_activity():
    """Commits in the last 7 days, plus open issues and pull requests authored by the user."""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    query = """
    query($login: String!, $since: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $since) { totalCommitContributions }
        issues(states: OPEN) { totalCount }
        pullRequests(states: OPEN) { totalCount }
      }
    }
    """
    user = github_graphql(query, {"login": USERNAME, "since": since})["user"]
    return (
        user["contributionsCollection"]["totalCommitContributions"],
        user["issues"]["totalCount"],
        user["pullRequests"]["totalCount"],
    )


def get_contribution_stats():
    query = """
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
    """

    data = github_graphql(
        query,
        {"login": USERNAME},
    )

    calendar = data["user"]["contributionsCollection"]["contributionCalendar"]

    days = []

    for week in calendar["weeks"]:
        days.extend(week["contributionDays"])

    days.sort(key=lambda x: x["date"])

    counts = [day["contributionCount"] for day in days]

    longest = 0
    streak = 0

    for count in counts:
        if count > 0:
            streak += 1
            longest = max(longest, streak)
        else:
            streak = 0

    current = 0

    for day in reversed(days):
        if day["contributionCount"] > 0:
            current += 1
        else:
            break

    return current, longest


def ago(iso):
    if not iso:
        return "unknown"
    delta = datetime.now(timezone.utc) - datetime.fromisoformat(
        iso.replace("Z", "+00:00")
    )
    minutes = int(delta.total_seconds() // 60)
    for unit, size in (("d", 1440), ("h", 60)):
        if minutes >= size:
            return f"{minutes // size}{unit} ago"
    return f"{max(minutes, 0)}m ago"


def fmt(value, suffix=""):
    return "n/a" if value is None else f"{value}{suffix}"


def render_svg(data):
    gh = data["github"]
    wx = data["weather"]

    status = data["status"].strip()
    status = status[0].upper() + status[1:].lower()
    size = max(34, min(60, int(480 / (0.5 * len(status)))))

    weather = (
        f"{wx['temperature']}  ·  {wx['condition']}"
        if wx["temperature"]
        else "weather unavailable"
    )

    message = gh.get("last_commit_message") or "no commit message"
    lines = textwrap.wrap(message, width=34)
    if len(lines) > 2:
        lines = lines[:2]
        lines[1] = lines[1].rstrip(".,;: ")[:31] + "…"
    msg = "".join(
        f'<text x="620" y="{214 + n * 25}" class="msg">{"“" if n == 0 else ""}{escape(line)}{"”" if n == len(lines) - 1 else ""}</text>'
        for n, line in enumerate(lines)
    )

    stats = [
        (fmt(gh["total_repos"]), "REPOS"),
        (fmt(gh["total_stars"]), "STARS"),
        (fmt(gh.get("commits_last_7_days")), "COMMITS / WEEK"),
        (fmt(gh.get("open_issues")), "OPEN ISSUES"),
        (fmt(gh.get("open_prs")), "OPEN PRS"),
        (fmt(gh["longest_streak"], " d"), "BEST STREAK"),
    ]
    cells = "".join(
        f'<text x="{60 + i * 140}" y="392" class="num">{escape(v)}</text>'
        f'<text x="{60 + i * 140}" y="350" class="k">{escape(k)}</text>'
        for i, (v, k) in enumerate(stats)
    )
    langs = "   ·   ".join(gh["top_languages"][:5]) or "n/a"
    repo_name = gh["latest_active_repo"] or "n/a"
    if len(repo_name) > 32:
        repo_name = repo_name[:31] + "…"
    repo_size = max(18, min(32, int(280 / (0.6 * len(repo_name)))))
    repo = escape(repo_name)

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="960" height="490" viewBox="0 0 960 490" role="img" aria-label="Live status for {USERNAME}: {escape(data["status"])}">
<style>
text {{ fill:#17181a; font-family: Georgia, 'Times New Roman', serif; }}
.bg {{ fill:#eceae4; }} .acc {{ fill:#b5472f; }} .hair {{ stroke:#d4d1c7; }} .ring {{ stroke:#d3d0c6; }} .ink {{ stroke:#17181a; }}
.k {{ font: 600 10.5px ui-monospace, 'SF Mono', Menlo, Consolas, monospace; letter-spacing: .18em; fill:#7a7870; }}
.mono {{ font: 13px ui-monospace, 'SF Mono', Menlo, Consolas, monospace; fill:#5c5b55; letter-spacing: .04em; }}
.msg {{ font-size: 17px; font-style: italic; fill:#4a4943; }}
.num {{ font-size: 36px; }}
.status {{ font-size: {size}px; letter-spacing: -1px; }}
.repo {{ font-size: 32px; font-weight: 700; letter-spacing: -.5px; }}
@media (prefers-color-scheme: dark) {{
  text {{ fill:#ecebe5; }}
  .bg {{ fill:#101113; }} .acc {{ fill:#6989ff; }} .hair {{ stroke:#2c2d30; }} .ring {{ stroke:#26272a; }} .ink {{ stroke:#ecebe5; }}
  .k {{ fill:#788898; }} .mono {{ fill:#a4a49c; }} .msg {{ fill:#b9b8b0; }}
}}
</style>
<rect width="960" height="490" class="bg"/>
<g fill="none" class="ring" stroke-width="1"><circle cx="960" cy="0" r="70"/><circle cx="960" cy="0" r="115"/><circle cx="960" cy="0" r="160"/></g>

<circle cx="60" cy="58" r="4.5" class="acc"/>
<text x="76" y="62" class="k">LIVE  ·  @{escape(USERNAME.upper())}</text>
<line x1="60" y1="88" x2="900" y2="88" class="hair"/>

<text x="60" y="140" class="k">RIGHT NOW</text>
<text x="58" y="206" class="status">{escape(status)}</text>
<text x="60" y="246" class="mono">{escape(weather)}</text>

<line x1="580" y1="120" x2="580" y2="262" class="hair"/>
<text x="620" y="140" class="k">LATEST PUSH  ·  {escape(ago(gh["last_commit"]).upper())}</text>
<text x="620" y="182" class="repo" style="font-size:{repo_size}px">{repo}</text>
{msg}

<line x1="60" y1="318" x2="900" y2="318" class="ink" stroke-width="1.5"/>
{cells}
<line x1="60" y1="424" x2="900" y2="424" class="hair"/>
<text x="60" y="454" class="mono">{escape(langs)}</text>
<text x="900" y="454" class="mono" text-anchor="end">updated {escape(data["updated"])}</text>
</svg>
"""


SAMPLE = {
    "status": "BIRIYANI TIME",
    "weather": {"location": "Hyderabad", "temperature": "31°C", "condition": "Clear"},
    "github": {
        "top_languages": ["Python", "C", "TypeScript", "Go"],
        "latest_active_repo": "green-customer-insights-platform",
        "last_commit": "2026-10-12T11:42:58Z",
        "last_commit_message": "tokenizer: handle Nepali conjuncts without splitting graphemes",
        "current_streak": 3,
        "commits_last_7_days": 14,
        "open_issues": 3,
        "open_prs": 1,
        "longest_streak": 12,
        "total_repos": 47,
        "total_stars": 8,
        "most_starred_repo": {"name": "bropal404", "stars": 1},
    },
    "updated": "sample data",
}


def main():
    parser = argparse.ArgumentParser(
        description="Refresh README.md and assets/status.svg"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="use sample data (no network, no token) and write to ./test-out/ only",
    )
    args = parser.parse_args()

    if args.test:
        out = Path("test-out")
        out.mkdir(exist_ok=True)
        (out / "status.svg").write_text(render_svg(SAMPLE), encoding="utf-8")
        print(f"Wrote {out / 'status.svg'}")
        return

    if not TOKEN:
        raise SystemExit("GH_PAT is not set (use --test to try it with sample data)")

    now = datetime.now(IST)

    repos = get_repositories()

    languages = get_languages(repos)

    latest_repo, last_commit, last_message = get_latest_push(repos)

    repo_stats = get_repo_stats(repos)

    try:
        current_streak, longest_streak = get_contribution_stats()
    except Exception as e:
        print(f"Could not calculate contribution stats: {e}")
        current_streak = None
        longest_streak = None

    try:
        commits_week, open_issues, open_prs = get_activity()
    except Exception as e:
        print(f"Could not read activity: {e}")
        commits_week = open_issues = open_prs = None

    output = {
        "status": get_status(now.hour),
        "weather": get_weather(),
        "github": {
            "top_languages": languages,
            "latest_active_repo": latest_repo,
            "last_commit": last_commit,
            "last_commit_message": last_message,
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "commits_last_7_days": commits_week,
            "open_issues": open_issues,
            "open_prs": open_prs,
            "total_repos": repo_stats["total_repos"],
            "total_stars": repo_stats["total_stars"],
            "most_starred_repo": repo_stats["most_starred_repo"],
        },
        "updated": now.strftime("%Y-%m-%d %H:%M IST"),
    }

    # GitHub's image proxy caches by URL, so each refresh gets a new file name.
    ASSETS.mkdir(exist_ok=True)
    for old in ASSETS.glob("status*.svg"):
        old.unlink()
    svg_path = ASSETS / f"status-{now.strftime('%Y%m%d-%H%M')}.svg"
    svg_path.write_text(render_svg(output), encoding="utf-8")

    with open(README, "w", encoding="utf-8") as f:
        f.write("# Gopal Kataria\n\n")
        f.write(f"![Live status]({svg_path.as_posix()})\n\n")
        # Hidden from the rendered page; the website reads this block.
        f.write("<!--\n```json\n")
        json.dump(output, f, indent=2, ensure_ascii=False)
        f.write("\n```\n-->\n")


if __name__ == "__main__":
    main()
