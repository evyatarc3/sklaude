# Translation guide: skill descriptions into Hebrew

For translations written by Claude (`scripts/curate.py`). Each translation replaces the machine translation of one skill's description on the site.

## The job
Translate the skill's `description` so that a Hebrew-speaking person browsing the site understands within seconds what the skill does and when to use it. Same meaning and same length as the source. Don't add information, don't drop information, and don't sell it.

## Rules
1. **Natural Hebrew, not a word-by-word translation.** Rebuild the sentence the way a person would say it.
2. **"skill" is "סקיל"** (plural סקילים), never "מיומנות".
3. **Technical terms and names stay in English** when that's how Israelis say them: PR, UI, API, MCP, CLI, SDK, PDF, Docker, GitHub, Claude Code, prompt, commit, hooks, frontend, deploy. Product and file names exactly as they are (`.docx`, Figma, Notion).
4. **Instructions to the model** ("Use this skill when the user asks…") are rendered neutrally: "מתאים כשהמשתמש מבקש…" or "להשתמש כש…". Avoid gendered forms (השתמש/השתמשי). Prefer infinitives and impersonal phrasing.
5. **Long trigger lists** ("Triggers include: 'Word doc', 'word document'…"): keep the trigger phrases in English, in quotation marks, and translate only the framing.
6. **Gender agreement:** סקיל is masculine ("הסקיל יוצר").
7. **Punctuation:** Hebrew punctuation and a comma before "ו" only where needed. English terms with a Hebrew prefix take a hyphen (ב-PDF, ל-GitHub).
8. **Garbled source** (marketing hype, broken English): translate the clear meaning, nothing more.

## Format
Return a JSON array: `[{"id": "<the exact id from todo>", "he": "<translation>"}]`. Then:
```bash
python3 scripts/curate.py apply translations.json
python3 scripts/translate.py --merge-only
```
