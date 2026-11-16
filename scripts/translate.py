#!/usr/bin/env python3
"""Translate skill descriptions to Hebrew with open MT models, inside GitHub Actions. No paid API.

- English -> Hebrew: Helsinki-NLP/opus-mt-en-he
- Other languages (Chinese, Russian, Korean, ...) -> English (Helsinki-NLP/opus-mt-mul-en) -> Hebrew
- Descriptions already in Hebrew are kept.

Works sentence by sentence with a cache (data/he-cache.json, keyed by a hash of the source sentence),
so each daily run only translates new or changed text. Most-starred skills go first, and the run stops
after --max-minutes; whatever is left is picked up by the next run.

Outputs:
- site/data/he.json: short Hebrew description per skill, aligned with index.json order (list + search)
- site/data/repos/*.json: adds "he" (full Hebrew description) to each skill (skill page)
"""
import argparse
import glob
import hashlib
import json
import os
import re
import time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "site", "data")
CACHE = os.path.join(ROOT, "data", "he-cache.json")

NON_LATIN = re.compile(r"[Ѐ-ӿ؀-ۿ฀-๿぀-ヿ㐀-鿿가-힯Ͱ-Ͽ]")
HEB = re.compile(r"[א-ת]")
EN_WORDS = set("the and to of a for with when use this is in or you your from on that it as by be an are using any all can into".split())
FOREIGN_WORDS = set(("de la el los las del para por con una uno que y es se su sus como "  # es/pt
                     "do da dos das em um uma não são com " "der die das und ist mit für von nicht ein eine zu "  # pt/de
                     "le les des et pour avec une est dans sur pas du " "di il per che non sono della").split())  # fr/it
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(`\[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff])|(?<=[。！？；])")


def key(s):
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:14]


def sentences(text):
    parts = [p.strip() for p in SENT_SPLIT.split(text or "") if p and p.strip()]
    out = []
    for p in parts:  # very long "sentences" (lists separated by ;) translate badly in one go
        while len(p) > 400:
            cut = max(p.rfind("; ", 0, 400), p.rfind(", ", 0, 400))
            cut = cut if cut > 150 else 400
            out.append(p[: cut + 1].strip())
            p = p[cut + 1 :].strip()
        if p:
            out.append(p)
    return out


def is_hebrew(s):
    letters = re.findall(r"[^\W\d_]", s)
    return bool(letters) and len(HEB.findall(s)) / len(letters) > 0.3


def needs_pivot(s):
    if NON_LATIN.search(s):
        return True
    words = re.findall(r"[A-Za-z]+", s.lower())
    # Latin-script but not English: function words of other languages outnumber English ones.
    # (Short technical English often has no "the"/"and", so absence of English alone isn't enough.)
    foreign = sum(w in FOREIGN_WORDS for w in words)
    return foreign >= 2 and foreign > sum(w in EN_WORDS for w in words)


def shorten(text, n=150):
    if len(text) <= n:
        return text
    cut = text[:n]
    sp = cut.rfind(" ")
    return cut[: sp if sp > n * 0.7 else n].rstrip(" ,.;:-") + "…"


class Translator:
    def __init__(self, name, beams):
        import torch
        from transformers import MarianMTModel, MarianTokenizer

        torch.set_num_threads(os.cpu_count() or 4)
        self.torch = torch
        self.tok = MarianTokenizer.from_pretrained(name)
        self.model = MarianMTModel.from_pretrained(name).eval()
        self.beams = beams

    def __call__(self, batch):
        with self.torch.inference_mode():
            enc = self.tok(batch, return_tensors="pt", padding=True, truncation=True, max_length=256)
            out = self.model.generate(**enc, num_beams=self.beams, max_new_tokens=320)
        return [t.strip() for t in self.tok.batch_decode(out, skip_special_tokens=True)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-minutes", type=float, default=45)
    ap.add_argument("--batch", type=int, default=24)
    ap.add_argument("--beams", type=int, default=2)
    a = ap.parse_args()
    t0 = time.time()

    with open(os.path.join(DATA, "index.json"), encoding="utf-8") as f:
        ix = json.load(f)
    repos = ix["repos"]
    shards = {}
    for p in glob.glob(os.path.join(DATA, "repos", "*.json")):
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        shards[d["repo"]] = (p, d)

    # Every skill's full description, in index order (repo skills, then external).
    entries = []  # (stars, full_text, repo|None, path|None)
    for r in ix["skills"]:
        repo = repos[r[0]][0]
        shard = shards.get(repo, (None, {"skills": {}}))[1]
        full = (shard["skills"].get(r[1]) or {}).get("description") or r[3]
        entries.append((repos[r[0]][1], full, repo, r[1]))
    for e in ix.get("external", []):
        entries.append((0, e.get("description", ""), None, None))

    cache = {}
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)

    # Unique untranslated sentences, most-starred skills first.
    todo, seen = [], set()
    for _, text, _, _ in sorted(entries, key=lambda e: -e[0]):
        for s in sentences(text):
            k = key(s)
            if k in cache or k in seen:
                continue
            seen.add(k)
            if is_hebrew(s):
                cache[k] = s
            else:
                todo.append(s)
    print(f"{len(entries)} skills, {len(cache)} cached sentences, {len(todo)} to translate")

    deadline = t0 + a.max_minutes * 60
    done = 0
    if todo:
        en_he = Translator("Helsinki-NLP/opus-mt-en-he", a.beams)
        pivot = [s for s in todo if needs_pivot(s)]
        direct = [s for s in todo if not needs_pivot(s)]
        mul_en = Translator("Helsinki-NLP/opus-mt-mul-en", a.beams) if pivot else None
        # Keep priority order inside each group; pivot group is small, do it first.
        for group, two_step in ((pivot, True), (direct, False)):
            for i in range(0, len(group), a.batch):
                if time.time() > deadline:
                    break
                batch = group[i : i + a.batch]
                src = mul_en(batch) if two_step else batch
                for s, he in zip(batch, en_he(src)):
                    cache[key(s)] = he
                done += len(batch)
                if done % (a.batch * 20) == 0:
                    rate = done / max(1, time.time() - t0)
                    print(f"  {done}/{len(todo)} sentences ({rate:.1f}/s)", flush=True)
    print(f"translated {done} sentences in {(time.time() - t0) / 60:.1f} min; {len(todo) - done} left for next run")

    # Cache: one entry per line keeps git diffs small.
    with open(CACHE, "w", encoding="utf-8") as f:
        f.write("{\n" + ",\n".join(f"{json.dumps(k)}:{json.dumps(v, ensure_ascii=False)}" for k, v in sorted(cache.items())) + "\n}\n")

    def hebrew(text):
        parts = sentences(text)
        out = [cache.get(key(s)) for s in parts]
        return " ".join(out) if parts and all(out) else None

    short, full_by_skill, complete = [], {}, 0
    for _, text, repo, path in entries:
        he = hebrew(text)
        short.append(shorten(he) if he else None)
        if he:
            complete += 1
            if repo:
                full_by_skill[(repo, path)] = he
    for repo, (p, d) in shards.items():
        changed = False
        for path, info in d["skills"].items():
            he = full_by_skill.get((repo, path))
            if he and info.get("he") != he:
                info["he"] = he
                changed = True
        if changed:
            with open(p, "w", encoding="utf-8") as f:
                f.write(json.dumps(d, ensure_ascii=False) + "\n")
    with open(os.path.join(DATA, "he.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps({"v": 1, "index": ix["generatedAt"], "items": short}, ensure_ascii=False) + "\n")
    print(f"he.json: {complete}/{len(entries)} skills have a Hebrew description")


if __name__ == "__main__":
    main()
