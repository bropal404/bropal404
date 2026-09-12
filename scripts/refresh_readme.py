#!/usr/bin/env python3

import json
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen


USERNAME = os.environ["G_USERNAME"]
TOKEN = os.environ["GH_PAT"]

README = "README.md"

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
    payload = json.dumps({
        "query": query,
        "variables": variables,
    }).encode()

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
    if 0 <= hour < 6:
        return "late night coffee"
    if 6 <= hour < 12:
        return "good morning, time to ship"
    if 12 <= hour < 15:
        return "biriyani time"
    if 15 <= hour < 19:
        return "debugging arc"
    return "post nut clarity"


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
            "temperature": f'{current["temp_C"]}°C',
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

    return [
        repo
        for repo in repos
        if not repo["fork"] and not repo["archived"]
    ]


def get_languages(repos):
    totals = Counter()

    for repo in repos:
        try:
            languages = github_get(repo["languages_url"])

            for language, bytes_count in languages.items():
                totals[language] += bytes_count

        except Exception as e:
            print(f"Could not read languages for {repo['name']}: {e}")

    return [
        language
        for language, _ in totals.most_common(5)
    ]


def get_latest_repo_and_commit(repos):
    if not repos:
        return None, None

    latest_repo = max(
        repos,
        key=lambda repo: repo.get("pushed_at") or "",
    )

    try:
        commits = github_get(
            f"https://api.github.com/repos/"
            f"{USERNAME}/{latest_repo['name']}/commits?per_page=1"
        )

        if commits:
            return latest_repo["name"], commits[0]["commit"]["author"]["date"]

    except Exception as e:
        print(f"Could not get latest commit: {e}")

    return latest_repo["name"], latest_repo.get("pushed_at")


def get_contribution_streak():
    query = """
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
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

    days = []

    for week in data["user"]["contributionsCollection"]["contributionCalendar"]["weeks"]:
        days.extend(week["contributionDays"])

    days.sort(key=lambda x: x["date"])

    counts = [day["contributionCount"] for day in days]

    current = 0
    longest = 0
    streak = 0

    for count in counts:
        if count > 0:
            streak += 1
            longest = max(longest, streak)
        else:
            streak = 0

    # Current streak: walk backwards from today.
    current = 0

    for day in reversed(days):
        if day["contributionCount"] > 0:
            current += 1
        else:
            break

    return current, longest


def main():
    now = datetime.now(IST)

    repos = get_repositories()

    languages = get_languages(repos)

    latest_repo, last_commit = get_latest_repo_and_commit(repos)

    try:
        current_streak, longest_streak = get_contribution_streak()
    except Exception as e:
        print(f"Could not calculate contribution streak: {e}")
        current_streak = None
        longest_streak = None

    output = {
        "status": get_status(now.hour),

        "weather": get_weather(),

        "github": {
            "top_languages": languages,
            "latest_active_repo": latest_repo,
            "last_commit": last_commit,
            "current_streak": current_streak,
            "longest_streak": longest_streak,
        },

        "updated": now.isoformat(),
    }

    with open(README, "w", encoding="utf-8") as f:
        json.dump(
            output,
            f,
            indent=2,
            ensure_ascii=False,
        )
        f.write("\n")


if __name__ == "__main__":
    main()
