#!/usr/bin/env python3

import json
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen


USERNAME = "bropal404"
TOKEN = os.environ["GH_PAT"]

README = "README.md"

PROFILE_REPO_NAME = USERNAME.lower()

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
    if 3 <= hour < 6:
        return "am I dreaming"
    if 6 <= hour < 12:
        return "good morning, time to ship"
    if 12 <= hour < 15:
        return "BIRIYANI TIME"
    if 15 <= hour < 20 :
        return "debugging arc"
    if 20 <= hour < :
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
    # Exclude the profile repo itself so a README-only commit doesn't
    # make this script perpetually report itself as "latest active".
    candidates = [
        repo for repo in repos
        if repo["name"].lower() != PROFILE_REPO_NAME
    ]

    if not candidates:
        return None, None

    latest_repo = max(
        candidates,
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

    return current, longest, calendar["totalContributions"]


def main():
    now = datetime.now(IST)

    repos = get_repositories()

    languages = get_languages(repos)

    latest_repo, last_commit = get_latest_repo_and_commit(repos)

    repo_stats = get_repo_stats(repos)

    try:
        current_streak, longest_streak, total_this_year = get_contribution_stats()
    except Exception as e:
        print(f"Could not calculate contribution stats: {e}")
        current_streak = None
        longest_streak = None
        total_this_year = None

    output = {
        "status": get_status(now.hour),
        "weather": get_weather(),
        "github": {
            "top_languages": languages,
            "latest_active_repo": latest_repo,
            "last_commit": last_commit,
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "contributions_this_year": total_this_year,
            "total_repos": repo_stats["total_repos"],
            "total_stars": repo_stats["total_stars"],
            "most_starred_repo": repo_stats["most_starred_repo"],
        },
        "updated": now.strftime("%Y-%m-%d %H:%M IST"),
    }

    with open(README, "w", encoding="utf-8") as f:
        f.write("```json\n")
        json.dump(
            output,
            f,
            indent=2,
            ensure_ascii=False,
        )
        f.write("\n```\n")


if __name__ == "__main__":
    main()
