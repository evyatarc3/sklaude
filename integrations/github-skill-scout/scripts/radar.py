#!/usr/bin/env python3
"""Query the Skills Radar index (a daily-updated index of Claude skills on GitHub and beyond).

Usage:
  radar.py search "pdf form filling" [--cat docs] [--safe] [--limit 10] [--json]
  radar.py hot|top|new [--cat data] [--limit 10] [--json]
  radar.py show owner/repo/path/to/skill            # full description, files, SKILL.md URL
  radar.py cats                                      # list topic ids

Search terms must be English (skills are written in English); translate the user's request first.
Standard library only. The index is cached for 6 hours in the system temp dir.
Set RADAR_URL to point at another deployment (default: the public Skills Radar site).
"""
import argparse
import json
import math
import os
import re
import sys
import tempfile
import time
import urllib.request

BASE = os.environ.get("RADAR_URL", "https://evyatarc3.github.io/sklaude/data/index.json").rsplit("/", 1)[0]
SITE = BASE.rsplit("/data", 1)[0]
CACHE = os.path.join(tempfile.gettempdir(), "skills-radar-index.json")
RISK = {"l": "low", "m": "medium", "h": "high", "u": "unknown"}


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "skills-radar-cli"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8")


def load_index():
    if os.path.exists(CACHE) and time.time() - os.path.getmtime(CACHE) < 6 * 3600:
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    text = fetch(f"{BASE}/index.json")
    with open(CACHE, "w", encoding="utf-8") as f:
        f.write(text)
    return json.loads(text)


def expand(ix):
    cats = [c["id"] for c in ix["categories"]]
    flags = ix["flags"]
    repos = ix["repos"]
    out = []
    for r in ix["skills"]:
        repo, stars, delta7, branch, updated, lic, official, _est = repos[r[0]]
        path = r[1]
        out.append({
            "id": f"{repo}/{path}" if path else repo,
            "name": r[2] or (path.rsplit("/", 1)[-1] if path else repo.split("/")[1]),
            "description": r[3],
            "repo": repo, "path": path, "branch": branch,
            "github": f"https://github.com/{repo}" + (f"/tree/{branch}/{path}" if path else ""),
            "stars": stars, "gain7d": delta7, "updated": updated, "license": lic or None,
            "official": bool(official),
            "categories": [cats[i] for i in r[4] if i < len(cats)],
            "flags": [f for i, f in enumerate(flags) if r[5] & (1 << i)],
            "risk": RISK.get(r[6], "unknown"), "added": r[7],
        })
    for e in ix.get("external", []):
        out.append({
            "id": e["id"], "name": e["name"], "description": e.get("description", ""), "repo": None, "path": "",
            "github": e["url"], "stars": 0, "gain7d": 0, "updated": e.get("a"), "license": None, "official": False,
            "categories": [cats[i] for i in e.get("c", []) if i < len(cats)],
            "flags": [f for i, f in enumerate(flags) if e.get("f", 0) & (1 << i)],
            "risk": RISK.get(e.get("k"), "unknown"), "added": e.get("a"),
        })
    return out


def search(skills, query):
    terms = [t for t in re.split(r"[\s,;:/]+", query.lower()) if len(t) > 1]
    if not terms:
        return skills
    results = []
    for s in skills:
        name = (s["name"] + " " + s["path"].rsplit("/", 1)[-1].replace("-", " ").replace("_", " ")).lower()
        desc = s["description"].lower()
        cats = " ".join(s["categories"])
        score = hits = 0
        for t in terms:
            best = 0
            if t in name:
                best += 8 if re.search(rf"(^|[^a-z0-9]){re.escape(t)}", name) else 4
            if t in cats:
                best += 3
            if t in desc:
                best += 2 if re.search(rf"(^|[^a-z0-9]){re.escape(t)}", desc) else 0.5
            if s["repo"] and t in s["repo"].lower():
                best += 1
            if best:
                hits += 1
                score += best
        if hits:
            s = dict(s, _score=score * (0.5 + 0.5 * hits / len(terms)) * (1 + math.log10(s["stars"] + 1) / 6))
            results.append((hits, s))
    if not results:
        return []
    need = min(max(h for h, _ in results), math.ceil(len(terms) / 2))
    return sorted((s for h, s in results if h >= need), key=lambda s: -s["_score"])


def per_repo(skills, n=3):
    seen = {}
    out = []
    for s in skills:
        k = s["repo"] or s["github"]
        seen[k] = seen.get(k, 0) + 1
        if seen[k] <= n:
            out.append(s)
    return out


def page_url(s):
    from urllib.parse import quote
    return f"{SITE}/#s={quote(s['id'], safe='')}" if s["repo"] else s["github"]


def print_rows(rows, as_json):
    if as_json:
        print(json.dumps([{k: v for k, v in s.items() if not k.startswith("_")} | {"radar": page_url(s)} for s in rows], ensure_ascii=False, indent=1))
        return
    for i, s in enumerate(rows, 1):
        warn = f" | risk: {s['risk']} ({', '.join(s['flags'])})" if s["flags"] else ""
        gain = f" (+{s['gain7d']}/wk)" if s["gain7d"] > 0 else ""
        print(f"{i}. {s['name']}  [{s['repo'] or 'external'}]  ★{s['stars']}{gain}  updated {s['updated']}{warn}")
        print(f"   {s['description']}")
        print(f"   {s['github']}")
        print(f"   radar page: {page_url(s)}")


def show(skills, sid):
    s = next((x for x in skills if x["id"].lower() == sid.lower().strip("/")), None)
    if not s:
        cands = [x["id"] for x in skills if sid.lower() in x["id"].lower()][:5]
        sys.exit(f"Not found: {sid}" + (f"\nDid you mean: {', '.join(cands)}" if cands else ""))
    detail = {}
    if s["repo"]:
        try:
            shard = json.loads(fetch(f"{BASE}/repos/{s['repo'].lower().replace('/', '__')}.json"))
            detail = shard.get("skills", {}).get(s["path"], {})
        except Exception as e:  # noqa: BLE001
            detail = {"error": str(e)}
    fname = detail.get("file") or "SKILL.md"
    raw = f"https://raw.githubusercontent.com/{s['repo']}/{s['branch']}/{s['path'] + '/' if s['path'] else ''}{fname}" if s["repo"] else s["github"]
    out = {k: v for k, v in s.items() if not k.startswith("_")}
    out.update({"description": detail.get("description", s["description"]), "files": detail.get("files"),
                "file_count": detail.get("fileCount"), "skill_md_raw": raw, "radar": page_url(s)})
    print(json.dumps(out, ensure_ascii=False, indent=1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["search", "hot", "top", "new", "show", "cats"])
    ap.add_argument("query", nargs="?", default="")
    ap.add_argument("--cat", help="topic id, see: radar.py cats")
    ap.add_argument("--safe", action="store_true", help="hide skills with medium/high risk signals")
    ap.add_argument("--official", action="store_true", help="only anthropics/* repos")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    ix = load_index()
    if a.mode == "cats":
        for c in ix["categories"]:
            print(f"{c['id']:<14}{c['count']:>6}  {c['label']}")
        return
    skills = expand(ix)
    if a.mode == "show":
        return show(skills, a.query)
    if a.cat:
        skills = [s for s in skills if a.cat in s["categories"]]
    if a.safe:
        skills = [s for s in skills if s["risk"] in ("low",)]
    if a.official:
        skills = [s for s in skills if s["official"]]
    if a.mode == "search":
        rows = search(skills, a.query)
    elif a.mode == "hot":
        rows = per_repo(sorted(skills, key=lambda s: (-s["gain7d"], -s["stars"])))
    elif a.mode == "top":
        rows = per_repo(sorted(skills, key=lambda s: -s["stars"]))
    else:
        rows = per_repo(sorted(skills, key=lambda s: (s["added"] or "", s["stars"]), reverse=True))
    print(f"# Skills Radar, index of {ix['stats']['skills']} skills, updated {ix['generatedAt'][:10]}. Showing {min(a.limit, len(rows))} of {len(rows)}.")
    print_rows(rows[: a.limit], a.json)


if __name__ == "__main__":
    main()
