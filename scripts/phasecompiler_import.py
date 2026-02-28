from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import requests


API_BASE = "https://api.github.com"


@dataclass(frozen=True)
class Repo:
    owner: str
    name: str


def _parse_repo(repo_str: str) -> Repo:
    if "/" not in repo_str:
        raise ValueError(
            f"Expected GITHUB_REPOSITORY like 'owner/repo', got: {repo_str}")
    owner, name = repo_str.split("/", 1)
    return Repo(owner=owner, name=name)


def _headers(token: str) -> Dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "phase-compiler-importer",
    }


def _request(method: str, url: str, token: str, *, json_body: Optional[dict] = None) -> Any:
    r = requests.request(method, url, headers=_headers(
        token), json=json_body, timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"{method} {url} failed: {r.status_code} {r.text}")
    if r.status_code == 204:
        return None
    return r.json()


def _list_all(token: str, url: str) -> List[dict]:
    """Paginate through GitHub REST list endpoints."""
    out: List[dict] = []
    page = 1
    while True:
        r = requests.get(url, headers=_headers(token), params={
                         "per_page": 100, "page": page}, timeout=30)
        if r.status_code >= 400:
            raise RuntimeError(f"GET {url} failed: {r.status_code} {r.text}")
        batch = r.json()
        if not isinstance(batch, list):
            raise RuntimeError(f"Expected list from {url}, got {type(batch)}")
        out.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return out


def _find_milestone_number(token: str, repo: Repo, title: str) -> Optional[int]:
    url = f"{API_BASE}/repos/{repo.owner}/{repo.name}/milestones?state=all"
    for ms in _list_all(token, url):
        if ms.get("title") == title:
            return int(ms["number"])
    return None


def _create_milestone(token: str, repo: Repo, title: str, description: str, dry_run: bool) -> int:
    existing = _find_milestone_number(token, repo, title)
    if existing is not None:
        return existing

    if dry_run:
        print(f"[dry-run] would create milestone: {title}")
        return -1

    url = f"{API_BASE}/repos/{repo.owner}/{repo.name}/milestones"
    payload = {"title": title, "description": description}
    ms = _request("POST", url, token, json_body=payload)
    return int(ms["number"])


def _issue_exists_by_marker(token: str, repo: Repo, marker: str) -> bool:
    """
    Cheap-ish idempotency: search open+closed issues for a unique marker.
    This uses the repo issues list and scans bodies.
    """
    url = f"{API_BASE}/repos/{repo.owner}/{repo.name}/issues?state=all"
    for issue in _list_all(token, url):
        body = issue.get("body") or ""
        if marker in body:
            return True
    return False


def _create_issue(
    token: str,
    repo: Repo,
    title: str,
    body: str,
    milestone_number: Optional[int],
    labels: List[str],
    dry_run: bool,
) -> None:
    marker = _extract_marker(body)
    if marker and _issue_exists_by_marker(token, repo, marker):
        return

    if dry_run:
        print(f"[dry-run] would create issue: {title}")
        return

    url = f"{API_BASE}/repos/{repo.owner}/{repo.name}/issues"
    payload: Dict[str, Any] = {"title": title, "body": body, "labels": labels}
    if milestone_number is not None and milestone_number != -1:
        payload["milestone"] = milestone_number
    _request("POST", url, token, json_body=payload)


def _extract_marker(body: str) -> Optional[str]:
    # marker looks like: <!-- phasecompiler:key=... -->
    start = body.find("<!-- phasecompiler:key=")
    if start == -1:
        return None
    end = body.find("-->", start)
    if end == -1:
        return None
    return body[start: end + 3]


def _load_plan(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "phases" not in data or not isinstance(data["phases"], list):
        raise ValueError("plan.json must contain a top-level 'phases' array")
    return data


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("plan_path", help="Path to plan.json")
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY",
                    ""), help="owner/repo (default: env)")
    ap.add_argument("--token", default=os.environ.get("GITHUB_TOKEN",
                    ""), help="GitHub token (default: env)")
    ap.add_argument("--dry-run", default="false",
                    help="true/false (default: false)")
    args = ap.parse_args()

    dry_run = str(args.dry_run).lower() in {"1", "true", "yes", "y"}

    if not args.repo:
        raise SystemExit("Missing --repo and GITHUB_REPOSITORY is not set.")
    if not args.token:
        raise SystemExit("Missing --token and GITHUB_TOKEN is not set.")

    repo = _parse_repo(args.repo)
    plan = _load_plan(args.plan_path)

    phases = plan["phases"]

    for phase in phases:
        pid = int(phase.get("id"))
        ptitle = str(phase.get("title", "")).strip()
        tasks = phase.get("tasks", [])
        if not ptitle or not isinstance(tasks, list):
            raise ValueError(f"Invalid phase entry: {phase}")

        milestone_title = f"Phase {pid}: {ptitle}"
        milestone_desc = f"Imported by PhaseCompiler from {args.plan_path}."
        ms_number = _create_milestone(
            args.token, repo, milestone_title, milestone_desc, dry_run=dry_run)

        # Create one issue per task
        for idx, task in enumerate(tasks, start=1):
            task_str = str(task).strip()
            if not task_str:
                continue

            issue_title = f"[P{pid}] {task_str}"
            marker = f"<!-- phasecompiler:key=phase:{pid}:task:{idx} -->"
            body = (
                f"{marker}\n\n"
                f"**Phase:** {milestone_title}\n\n"
                f"**Task:** {task_str}\n\n"
                f"_Generated from `{args.plan_path}`._\n"
            )
            labels = [f"phase:{pid}", "phasecompiler"]
            _create_issue(
                args.token,
                repo,
                title=issue_title,
                body=body,
                milestone_number=ms_number if ms_number != -1 else None,
                labels=labels,
                dry_run=dry_run,
            )

    print("Import complete." if not dry_run else "Dry-run complete.")


if __name__ == "__main__":
    main()
