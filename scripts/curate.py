#!/usr/bin/env python3
"""Hand-quality Hebrew translations (written by Claude) for the most-viewed skills.

The open MT model translates everything; this file layer overrides it for the skills people see most.
Translations live in data/he-curated.json as {skill_id: {"src": <hash of English source>, "he": ...}}.
A translation whose source hash no longer matches the description is stale and comes back in `todo`.

  curate.py todo [--limit 50] [--target 300]  -> JSON list of skills to translate next (priority order)
  curate.py apply translations.json           -> merge [{"id":..., "he":...}] into data/he-curated.json
  curate.py status                            -> coverage of the priority list

After `apply`, run `python3 scripts/translate.py --merge-only` to rebuild he.json and the detail files.
Style rules for translators: docs/translation-guide.md
"""
import argparse
import glob
import hashlib
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "site", "data")
CURATED = os.path.join(ROOT, "data", "he-curated.json")
HEB = re.compile(r"[א-ת]")


def src_hash(text):
    return hashlib.sha1((text or "").encode("utf-8")).hexdigest()[:12]


def load_curated():
    if not os.path.exists(CURATED):
        return {}
    with open(CURATED, encoding="utf-8") as f:
        return json.load(f)


def save_curated(cur):
    with open(CURATED, "w", encoding="utf-8") as f:
        f.write("{\n" + ",\n".join(f"{json.dumps(k)}:{json.dumps(v, ensure_ascii=False)}" for k, v in sorted(cur.items())) + "\n}\n")


def skills():
    """All repo skills with full descriptions, stars and weekly gain."""
    with open(os.path.join(DATA, "index.json"), encoding="utf-8") as f:
        ix = json.load(f)
    shards = {}
    for p in glob.glob(os.path.join(DATA, "repos", "*.json")):
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        shards[d["repo"]] = d["skills"]
    out = []
    for r in ix["skills"]:
        repo, stars, delta7 = ix["repos"][r[0]][:3]
        path = r[1]
        info = shards.get(repo, {}).get(path, {})
        out.append({
            "id": f"{repo}/{path}" if path else repo,
            "repo": repo,
            "name": r[2] or (path.rsplit("/", 1)[-1] if path else repo.split("/")[1]),
            "src": info.get("description") or r[3],
            "stars": stars,
            "gain7d": delta7,
        })
    return out


def priority(all_skills, target):
    """What visitors see first: the hot list and the most-starred list (max 3 per repo each), interleaved."""
    def top(key):
        seen, out = {}, []
        for s in sorted(all_skills, key=key):
            seen[s["repo"]] = seen.get(s["repo"], 0) + 1
            if seen[s["repo"]] <= 3:
                out.append(s)
        return out

    hot = top(lambda s: (-s["gain7d"], -s["stars"]))
    pop = top(lambda s: -s["stars"])
    order, ids = [], set()
    for pair in zip(hot, pop):
        for s in pair:
            if s["id"] not in ids and len(order) < target:
                ids.add(s["id"])
                order.append(s)
    return order


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["todo", "apply", "status"])
    ap.add_argument("file", nargs="?")
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--target", type=int, default=300, help="size of the priority list kept translated")
    a = ap.parse_args()
    cur = load_curated()

    if a.mode == "apply":
        if not a.file:
            sys.exit("usage: curate.py apply translations.json")
        with open(a.file, encoding="utf-8") as f:
            items = json.load(f)
        by_id = {s["id"]: s for s in skills()}
        ok = bad = 0
        for it in items:
            s = by_id.get(it.get("id"))
            he = (it.get("he") or "").strip()
            if not s or not he or not HEB.search(he):
                print(f"skip: {it.get('id')} ({'unknown id' if not s else 'no Hebrew text'})", file=sys.stderr)
                bad += 1
                continue
            cur[s["id"]] = {"src": src_hash(s["src"]), "he": he}
            ok += 1
        save_curated(cur)
        print(f"applied {ok}, skipped {bad}; {len(cur)} curated translations in total")
        return

    pri = priority(skills(), a.target)
    fresh = lambda s: s["id"] in cur and cur[s["id"]]["src"] == src_hash(s["src"])
    if a.mode == "status":
        done = sum(1 for s in pri if fresh(s))
        stale = sum(1 for s in pri if s["id"] in cur and not fresh(s))
        print(f"priority list: {len(pri)}; translated by Claude: {done}; stale: {stale}; missing: {len(pri) - done - stale}")
        return
    todo = [{"id": s["id"], "name": s["name"], "src": s["src"]} for s in pri if not fresh(s)][: a.limit]
    print(json.dumps(todo, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
