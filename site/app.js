/* Skills Radar front end. Loads data/index.json, searches in the browser, and renders a page per skill
   (#s=owner/repo/path) from data/repos/<repo>.json plus the live SKILL.md. No backend. */
(() => {
  const $ = (s) => document.querySelector(s);
  const PAGE = 60;
  const FLAG_LABELS = {
    scripts: 'מריץ סקריפטים',
    network: 'ניגש לרשת',
    secrets: 'מבקש מפתחות או סיסמאות',
    destructive: 'פקודות מחיקה או שינוי מערכת',
    obfuscation: 'קוד מקודד או eval',
    autorun: 'מתקין או מריץ אוטומטית',
    binary: 'קבצים בינאריים',
  };
  const FLAG_HELP = {
    scripts: 'בתיקייה יש סקריפטים שהסקיל עשוי להריץ. כדאי לקרוא אותם לפני התקנה.',
    network: 'ההוראות כוללות פנייה לרשת, למשל curl או requests. כדאי לבדוק לאן.',
    secrets: 'ההוראות מזכירות מפתחות API, טוקנים או סיסמאות.',
    destructive: 'נמצאו פקודות שעלולות למחוק קבצים או לשנות את המערכת.',
    obfuscation: 'נמצא קוד מקודד או הרצה דינמית, כמו base64 או eval.',
    autorun: 'נמצאה התקנה או הרצה אוטומטית, למשל curl שמועבר ישר ל-sh.',
    binary: 'בתיקייה יש קבצים בינאריים שאי אפשר לקרוא.',
  };
  const RISK_FROM = { l: 'low', m: 'medium', h: 'high', u: 'unknown' };

  /* Hebrew -> English. Skills are written in English, so Hebrew words are expanded before searching.
     Keys are stems: a word matches when it starts with the key (after dropping prefixes like ו/ה/ל/ש). */
  const HE = {
    'מצג': 'presentation slides pptx deck', 'שקופ': 'slides', 'מסמכ': 'document docx', 'מסמך': 'document docx',
    'וורד': 'word docx', 'אקסל': 'excel xlsx spreadsheet', 'גיליונ': 'spreadsheet sheets', 'גיליון': 'spreadsheet sheets',
    'טבל': 'table spreadsheet csv', 'טופס': 'form', 'טפס': 'form', 'חתימ': 'signature sign',
    'עריכ': 'edit editing', 'עורכ': 'edit editor', 'עורך': 'edit editor', 'ערוך': 'edit',
    'כתיב': 'writing write', 'כותב': 'write writing', 'כתוב': 'write', 'תרגו': 'translate translation', 'מתרגמ': 'translate',
    'סיכו': 'summary summarize', 'מסכמ': 'summarize summary', 'מסכם': 'summarize summary', 'לסכם': 'summarize',
    'מאמר': 'paper article', 'מחקר': 'research', 'ציטוט': 'citation cite', 'ביבליוגרפ': 'bibliography references', 'אקדמ': 'academic',
    'תמונ': 'image photo', 'צילומ': 'photo', 'וידאו': 'video', 'סרטונ': 'video', 'סרטון': 'video', 'אודיו': 'audio',
    'מוזיק': 'music', 'תמלול': 'transcribe transcription', 'הקלט': 'recording audio', 'אנימצי': 'animation',
    'אתר': 'website web landing', 'עיצוב': 'design ui', 'מעצב': 'design', 'ממשק': 'interface ui', 'אפליקצי': 'app',
    'קוד': 'code', 'תכנות': 'programming code', 'באג': 'bug debug', 'דיבאג': 'debug', 'בדיק': 'test testing review', 'טסט': 'test',
    'גיט': 'git github', 'נתונ': 'data', 'דאטה': 'data', 'גרפ': 'chart graph', 'גרף': 'chart graph',
    'סטטיסט': 'statistics statistical', 'ניתוח': 'analysis analyze', 'דשבורד': 'dashboard', 'מסד': 'database sql',
    'מייל': 'email gmail', 'דואר': 'email', 'יומנ': 'calendar', 'יומן': 'calendar', 'פגיש': 'meeting', 'משימ': 'task todo',
    'הערות': 'notes', 'פתק': 'notes', 'חוז': 'contract', 'משפט': 'legal law', 'חשבונ': 'invoice accounting',
    'כספ': 'finance financial', 'תקציב': 'budget', 'שיווק': 'marketing', 'פרסו': 'ads advertising marketing',
    'מכיר': 'sales', 'רשתות': 'social media', 'פסיכולוג': 'psychology', 'טיפול': 'therapy', 'מטופל': 'patient clinical',
    'קליני': 'clinical', 'אבחו': 'diagnosis assessment', 'אבחנ': 'diagnosis', 'רפוא': 'medical health', 'בריאות': 'health',
    'למיד': 'learning', 'שיעור': 'lesson', 'חינוכ': 'education', 'חינוך': 'education', 'מבחנ': 'quiz exam', 'מבחן': 'quiz exam',
    'אבטח': 'security', 'סייבר': 'security', 'ענן': 'cloud', 'שרת': 'server deploy', 'פריס': 'deploy',
    'סוכנ': 'agent agents', 'סוכן': 'agent', 'פרומפט': 'prompt', 'בינה': 'ai llm', 'אוטומצי': 'automation automate',
    'ממיר': 'convert', 'המר': 'convert', 'חיפוש': 'search', 'מחפש': 'search', 'יוצר': 'create generate', 'ליצור': 'create generate',
    'בונה': 'build', 'לבנות': 'build', 'עברית': 'hebrew rtl', 'שאלונ': 'survey questionnaire', 'שאלון': 'survey questionnaire', 'סקר': 'survey',
  };
  const STOP = new Set(('צריך סקיל סקילים יודע שיודע אני רוצה משהו עם של את על כל לי או גם זה זו יכול שיכול עושה שעושה לעשות ' +
    'דברים דבר בשביל עבור כמו קצת טוב ממש אותו אותי שלי מה איך to the a an for and of with that skill skills which in on my me').split(' '));
  const HEB = /[֐-׿]/;
  const PREFIX = /^[והבלמשכ]{1,2}/;

  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const state = { view: 'hot', cat: null, q: '', skill: null, limit: PAGE, safe: false, official: false, group: true, he: store.get('radar.he') !== '0' };
  let data = { skills: [], categories: [] };
  let buzz = [];
  let catById = {};
  let docs = [];
  let byId = new Map();
  let listScroll = 0;

  const repoSlug = (() => {
    const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
    const path = location.pathname.split('/').filter(Boolean)[0];
    return m && path ? `${m[1]}/${path}` : 'evyatarc3/sklaude';
  })();
  $('#submit-link').href = `https://github.com/${repoSlug}/issues/new?template=submit-skill.yml`;

  const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[֑-ׇ]/g, '').replace(/[̀-ͯ]/g, '');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const num = (n) => compact.format(n);
  const daysSince = (d) => Math.max(0, Math.round((Date.now() - Date.parse(d)) / 864e5));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------- url state ----------
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    state.view = p.get('v') || 'hot';
    state.cat = p.get('c') || null;
    state.q = p.get('q') || '';
    state.skill = p.get('s') || null;
    $('#q').value = state.q;
  }
  function listParams() {
    const p = new URLSearchParams();
    if (state.view !== 'hot') p.set('v', state.view);
    if (state.cat) p.set('c', state.cat);
    if (state.q) p.set('q', state.q);
    return p;
  }
  const skillHref = (id) => { const p = listParams(); p.set('s', id); return `#${p}`; };
  function writeHash() {
    const p = listParams();
    if (state.skill) p.set('s', state.skill);
    const h = p.toString();
    history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  }

  // ---------- data ----------
  /** index.json (v2) is compact: repos are stored once, skills point at them. Expand to plain objects. */
  function expand(ix) {
    const cats = ix.categories;
    const flagsOf = (bits) => ix.flags.filter((_, i) => bits & (1 << i));
    const repos = ix.repos.map((r) => ({
      repo: r[0], stars: r[1], delta7: r[2], branch: r[3], updated: r[4], license: r[5], official: !!r[6], trendEstimated: !!r[7],
    }));
    const skills = ix.skills.map((r) => {
      const R = repos[r[0]];
      const path = r[1];
      return {
        id: path ? `${R.repo}/${path}` : R.repo,
        name: r[2] || path.split('/').pop() || R.repo.split('/')[1],
        description: r[3],
        repo: R.repo, path, branch: R.branch,
        url: `https://github.com/${R.repo}${path ? `/tree/${R.branch}/${path}` : ''}`,
        stars: R.stars, delta7: R.delta7, trendEstimated: R.trendEstimated, updated: R.updated,
        license: R.license, official: R.official,
        categories: r[4].map((i) => cats[i]?.id).filter(Boolean),
        flags: flagsOf(r[5]), risk: RISK_FROM[r[6]] || 'unknown', added: r[7], copies: r[8],
      };
    });
    for (const e of ix.external || []) {
      skills.push({ ...e, repo: null, stars: 0, categories: e.c.map((i) => cats[i]?.id).filter(Boolean), flags: flagsOf(e.f), risk: RISK_FROM[e.k] || 'unknown', added: e.a });
    }
    return { ...ix, skills };
  }

  // ---------- search ----------
  function buildIndex() {
    byId = new Map(data.skills.map((s) => [s.id, s]));
    catById = Object.fromEntries(data.categories.map((c) => [c.id, c]));
    docs = data.skills.map((s) => new Doc(s));
    warmIndex();
  }
  /** Fill the search text in idle slices, so the first search is instant without blocking the first paint. */
  function warmIndex() {
    const list = docs;
    let i = 0;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 60));
    const step = (deadline) => {
      if (list !== docs) return;
      while (i < list.length && deadline.timeRemaining() > 2) { const d = list[i++]; void d.name; void d.desc; void d.cat; void d.repo; void d.he; }
      if (i < list.length) idle(step);
    };
    idle(step);
  }
  /** Search text for one skill. Normalised on first use, so browsing never pays for 12,000 skills up front. */
  class Doc {
    constructor(s) { this.s = s; }
    get name() { return (this._name ??= norm(`${this.s.name} ${(this.s.path || '').split('/').pop().replace(/[_-]/g, ' ')}`)); }
    get repo() { return (this._repo ??= norm(this.s.repo || this.s.host || '')); }
    get cat() {
      return (this._cat ??= norm(this.s.categories.map((id) => catById[id]).filter(Boolean)
        .map((c) => `${c.label} ${(c.he || []).join(' ')} ${(c.keywords || []).join(' ')}`).join(' ')));
    }
    get desc() { return (this._desc ??= norm(this.s.description)); }
    get he() { return (this._he ??= norm(this.s.he || '')); }
  }

  /** Query -> list of terms; each term is a list of alternatives (Hebrew words expand to English). */
  function parseQuery(q) {
    const terms = [];
    const translated = new Set();
    for (const raw of norm(q).split(/[\s,.;:!?()"'/]+/)) {
      if (!raw || STOP.has(raw)) continue;
      if (!HEB.test(raw)) { if (raw.length > 1 || /\d/.test(raw)) terms.push([raw]); continue; }
      const variants = new Set([raw, raw.replace(PREFIX, ''), raw.slice(1)].filter((v) => v.length >= 2 && !STOP.has(v)));
      const alts = new Set(variants);
      for (const v of variants) {
        for (const [k, en] of Object.entries(HE)) {
          if (v.startsWith(k) || (v.length >= 3 && k.startsWith(v))) en.split(' ').forEach((w) => { alts.add(w); translated.add(w); });
        }
      }
      if (variants.size) terms.push([...alts]);
    }
    return { terms, translated: [...translated] };
  }

  const wordStart = (hay, t) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(t)}`, 'u').test(hay);

  function search(list, terms) {
    if (!terms.length) return list.map((d) => ({ d, score: 0, hits: 0 }));
    const out = [];
    for (const d of list) {
      let score = 0, hits = 0;
      for (const alts of terms) {
        let best = 0;
        for (const t of alts) {
          let s = 0;
          if (d.name.includes(t)) s += wordStart(d.name, t) ? 8 : 4;
          if (d.cat.includes(t)) s += 3;
          if (d.desc.includes(t)) s += wordStart(d.desc, t) ? 2 : 0.5;
          // The user's own Hebrew words found in the Hebrew description: as strong as a name match.
          if (d.he && HEB.test(t) && d.he.includes(t)) s += 6;
          if (d.repo.includes(t)) s += 1;
          best = Math.max(best, s);
        }
        if (best) { hits++; score += best; }
      }
      // How well it matches counts most; matching more of the words is a multiplier, not a gate.
      if (hits) out.push({ d, hits, score: score * (0.5 + (0.5 * hits) / terms.length) * (1 + Math.log10((d.s.stars || 0) + 1) / 6) });
    }
    // Results that match more of the words come first.
    const maxHits = Math.max(0, ...out.map((r) => r.hits));
    return out.filter((r) => r.hits >= Math.min(maxHits, Math.ceil(terms.length / 2)));
  }

  function results() {
    let list = docs;
    if (state.cat) list = list.filter((d) => d.s.categories.includes(state.cat));
    if (state.safe) list = list.filter((d) => d.s.risk !== 'high' && d.s.risk !== 'medium');
    if (state.official) list = list.filter((d) => d.s.official);
    const { terms, translated } = parseQuery(state.q);
    const res = search(list, terms);
    const by = {
      hot: (a, b) => (b.d.s.delta7 || 0) - (a.d.s.delta7 || 0) || b.d.s.stars - a.d.s.stars,
      new: (a, b) => (b.d.s.added || '').localeCompare(a.d.s.added || '') || (b.d.s.updated || '').localeCompare(a.d.s.updated || ''),
      top: (a, b) => b.d.s.stars - a.d.s.stars,
    }[state.view];
    res.sort(terms.length ? (a, b) => b.score - a.score || by(a, b) : by);
    let skills = res.map((r) => r.d.s);
    if (state.group && !terms.length) {
      const seen = {};
      skills = skills.filter((s) => ((seen[s.repo || s.host] = (seen[s.repo || s.host] || 0) + 1) <= 3));
    }
    const hl = terms.flat().filter((t) => !HEB.test(t) && t.length > 1);
    const hlHe = terms.flat().filter((t) => HEB.test(t) && t.length > 1);
    return { skills, hl, hlHe, translated, searching: terms.length > 0 };
  }

  // ---------- rendering ----------
  function highlight(node, text, terms, hebrew = false) {
    node.textContent = '';
    if (!terms.length) { node.textContent = text; return; }
    // Hebrew words carry prefixes (ו, ה, ש, ל...), so a match may start after up to two of them.
    const pre = hebrew ? '[והבלמשכ]{0,2}' : '';
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${pre}(?:${[...terms].sort((a, b) => b.length - a.length).map(esc).join('|')}))`, 'giu');
    let last = 0;
    for (const m of text.matchAll(re)) {
      node.append(text.slice(last, m.index), el('mark', null, m[0]));
      last = m.index + m[0].length;
    }
    node.append(text.slice(last));
  }

  function renderTopics() {
    const box = $('#cats');
    box.textContent = '';
    for (const c of data.categories) {
      if (!c.count) continue;
      const b = el('button', 'tile');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.cat === c.id));
      const art = SkillArt.paint(el('span'), c.id, `topic:${c.id}`);
      const txt = el('span', 'tile-text');
      txt.append(el('span', 'tile-label', c.label), el('span', 'n', `${c.count.toLocaleString('he-IL')} סקילים`));
      b.append(art, txt);
      b.onclick = () => setCat(state.cat === c.id ? null : c.id);
      box.append(b);
    }
    box.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function installCmd(s) {
    if (!s.repo) return s.url;
    const slug = (s.path ? s.path.split('/').pop() : s.name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    return `npx degit ${s.repo}${s.path ? '/' + s.path : ''}${s.branch ? '#' + s.branch : ''} ~/.claude/skills/${slug}`;
  }

  function row(s, i, ctx) {
    const r = $('#row-tpl').content.firstElementChild.cloneNode(true);
    r.querySelector('.rank').textContent = i + 1;
    const cover = r.querySelector('.cover');
    SkillArt.paint(cover, s.categories[0] || 'other', s.id);
    cover.href = s.repo ? skillHref(s.id) : s.url;
    cover.setAttribute('aria-label', s.name);
    if (!s.repo) { cover.target = '_blank'; cover.rel = 'noopener'; }
    const img = r.querySelector('.avatar');
    if (s.repo) img.src = `https://avatars.githubusercontent.com/${s.repo.split('/')[0]}?s=64`;
    else img.remove();
    img.onerror = () => img.remove();

    const name = r.querySelector('.name');
    highlight(name, s.name, ctx.hl);
    name.href = s.repo ? skillHref(s.id) : s.url;
    if (!s.repo) { name.target = '_blank'; name.rel = 'noopener'; } else name.removeAttribute('target');
    const path = r.querySelector('.path');
    path.textContent = s.repo ? `${s.repo}${s.path ? '/' + s.path : ''}` : s.host;
    path.href = s.repo ? `https://github.com/${s.repo}` : s.url;
    const desc = r.querySelector('.desc');
    if (state.he && s.he) {
      desc.dir = 'rtl';
      desc.classList.add('he');
      desc.title = s.description;
      highlight(desc, s.he, ctx.hlHe, true);
    } else {
      desc.dir = 'ltr';
      highlight(desc, s.description, ctx.hl);
    }
    desc.onclick = () => r.classList.toggle('open');

    const pulse = r.querySelector('.pulse');
    if (ctx.view === 'hot' && !ctx.searching && s.delta7 > 0) {
      const bar = el('span', 'meter');
      const fill = el('i');
      fill.style.width = `${Math.max(4, Math.round((s.delta7 / ctx.maxDelta) * 100))}%`;
      bar.append(fill);
      const gain = el('span', 'gain', `+${num(s.delta7)}${s.trendEstimated ? '*' : ''}`);
      if (s.trendEstimated) gain.title = 'הערכה: עוד אין שבוע שלם של היסטוריה';
      pulse.append(bar, gain, ' השבוע');
    } else if (ctx.view === 'new' && !ctx.searching) {
      const n = daysSince(s.added);
      pulse.textContent = n === 0 ? 'נוסף היום' : n === 1 ? 'נוסף אתמול' : `נוסף לפני ${n} ימים`;
    } else if (s.repo) {
      pulse.textContent = `${num(s.stars)} כוכבים`;
    }

    const tags = r.querySelector('.topics-of');
    if (s.official) tags.append(el('span', 'official', 'Anthropic'));
    for (const id of s.categories) {
      const c = catById[id];
      if (!c || id === 'other') continue;
      const b = el('button', null, c.label);
      b.type = 'button';
      b.onclick = () => setCat(id);
      tags.append(b);
    }
    if (!s.repo) tags.append(el('span', null, 'מחוץ לגיטהאב'));

    const warn = r.querySelector('.warn');
    if (s.risk === 'medium' || s.risk === 'high') {
      warn.classList.add(s.risk);
      warn.textContent = s.flags.map((f) => FLAG_LABELS[f] || f).join(', ');
    } else if (!s.repo) {
      warn.classList.add('medium');
      warn.textContent = 'לא נבדק';
    }

    const copy = r.querySelector('.copy');
    const cmd = installCmd(s);
    copy.title = cmd;
    if (!s.repo) copy.textContent = 'העתקת קישור';
    copy.onclick = async () => {
      const label = copy.textContent;
      try { await navigator.clipboard.writeText(cmd); } catch { prompt('העתקה ידנית:', cmd); return; }
      track('copy_install', { skill_id: s.id, location: 'list' });
      copy.textContent = 'הועתק';
      copy.classList.add('done');
      setTimeout(() => { copy.textContent = label; copy.classList.remove('done'); }, 1800);
    };
    return r;
  }

  function emptyState(html) {
    const li = el('li', 'empty');
    li.innerHTML = html;
    $('#list').append(li);
    $('#more').hidden = true;
  }

  function renderBuzz() {
    const box = $('#list');
    const { terms } = parseQuery(state.q);
    const items = buzz.filter((b) => !terms.length || terms.some((alts) => alts.some((t) => norm(b.title).includes(t))));
    $('#count').textContent = items.length ? `${items.length} דיונים מהחודש האחרון` : '';
    if (!items.length) return emptyState(buzz.length ? 'אין דיון שמתאים לחיפוש.' : 'עוד אין דיונים. הם ייאספו מ-Hacker News בהרצה היומית הבאה.');
    for (const b of items) {
      const li = el('li', 'buzz');
      const pts = el('div', 'pts', b.points);
      pts.append(el('small', null, 'נקודות'));
      const main = el('div');
      const a = el('a', 'title', b.title);
      a.href = b.url; a.target = '_blank'; a.rel = 'noopener'; a.dir = 'auto';
      const meta = el('div', 'meta');
      const d = el('a', null, `${b.comments} תגובות`);
      d.href = b.discussion; d.target = '_blank'; d.rel = 'noopener';
      meta.append(d, el('span', null, b.date), el('span', null, b.source));
      main.append(a, meta);
      li.append(pts, main);
      box.append(li);
    }
    $('#more').hidden = true;
  }

  // ---------- analytics (no-op unless config.js has a GA4 id) ----------
  const track = (name, params) => window.radarTrack && window.radarTrack(name, params);
  let lastPage = null;
  let searchTimer;
  let lastSearch = '';
  /** One page view per real navigation (tab, topic, skill page), not per keystroke in the search box. */
  function trackPage(detail) {
    const path = detail ? `/skill/${detail.id}` : `/${state.view}${state.cat ? '/' + state.cat : ''}`;
    if (path === lastPage) return;
    lastPage = path;
    track('page_view', {
      page_title: detail ? `${detail.name} | רדאר סקילים` : 'רדאר סקילים',
      page_location: `${location.origin}${location.pathname}#${path}`,
      page_path: path,
    });
    if (detail) track('view_skill', { skill_id: detail.id, repo: detail.repo, translation: detail.he ? 'he' : 'none' });
  }
  /** A search is counted once the person stops typing for 1.5s. */
  function trackSearch(count) {
    clearTimeout(searchTimer);
    const q = state.q.trim();
    if (!q || q === lastSearch) return;
    searchTimer = setTimeout(() => {
      lastSearch = q;
      track('search', { search_term: q.slice(0, 100), results: count, hebrew: HEB.test(q) ? 1 : 0, view: state.view });
    }, 1500);
  }

  // ---------- showcase (arc carousel) ----------
  const SC_TEXT = {
    hot: ['החמים השבוע', 'הסקילים שצברו הכי הרבה כוכבים בשבוע האחרון.'],
    top: ['הכי פופולריים', 'הסקילים מהריפואים עם הכי הרבה כוכבים.'],
    new: ['חדשים על המדף', 'הסקילים האחרונים שנכנסו לאינדקס.'],
  };
  let showcase = null;
  let heLoaded = false;
  let showcaseKey = '';
  function showcaseCover(s) {
    const c = SkillArt.paint(el('span', 'arc-cover'), s.categories[0] || 'other', s.id);
    if (s.repo) {
      const img = el('img', 'avatar');
      img.alt = ''; img.width = 36; img.height = 36; img.loading = 'lazy';
      img.src = `https://avatars.githubusercontent.com/${s.repo.split('/')[0]}?s=72`;
      img.onerror = () => img.remove();
      c.append(img);
    }
    return c;
  }
  function focusInfo(s, i, source) {
    const name = $('.sc-name');
    name.textContent = s.name;
    name.href = skillHref(s.id);
    $('#sc-open').href = skillHref(s.id);
    const desc = $('.sc-desc');
    const he = state.he && s.he;
    desc.textContent = he ? s.he : s.description;
    desc.dir = he ? 'rtl' : 'ltr';
    const topic = catById[s.categories[0]]?.label;
    const stat = state.view === 'hot' && s.delta7 > 0 ? `+${num(s.delta7)} כוכבים השבוע` : `${num(s.stars)} כוכבים`;
    $('.sc-meta').textContent = [stat, topic, s.repo].filter(Boolean).join('   ');
    const copy = $('#sc-copy');
    copy.onclick = async () => {
      const cmd = installCmd(s);
      try { await navigator.clipboard.writeText(cmd); } catch { prompt('העתקה ידנית:', cmd); return; }
      track('copy_install', { skill_id: s.id, location: 'showcase' });
      copy.textContent = 'הועתק'; copy.classList.add('done');
      setTimeout(() => { copy.textContent = 'העתקת פקודת התקנה'; copy.classList.remove('done'); }, 1800);
    };
    if (source !== 'init') track('showcase_browse', { skill_id: s.id, position: i + 1, via: source, view: state.view });
  }
  function updateShowcase(list) {
    if (!showcase) {
      showcase = Showcase.create($('#showcase'), {
        renderCover: showcaseCover,
        onChange: focusInfo,
        onOpen: (s) => { track('showcase_open', { skill_id: s.id, view: state.view }); location.hash = skillHref(s.id); },
      });
    }
    // Hebrew arrives after the first render; include it so the focused description switches when it does.
    const key = `${state.view}|${state.he}|${heLoaded}|${list.map((s) => s.id).join(',')}`;
    if (key === showcaseKey) return;
    showcaseKey = key;
    const [title, sub] = SC_TEXT[state.view] || SC_TEXT.hot;
    $('#sc-title').textContent = title;
    $('#sc-sub').textContent = sub;
    showcase.set(list);
  }

  function render() {
    writeHash();
    const detail = state.skill && byId.get(state.skill);
    if (data.skills.length) trackPage(detail);
    document.body.classList.toggle('on-skill', !!detail);
    if (detail) return renderSkill(detail);
    document.title = 'רדאר סקילים';
    document.querySelectorAll('.views button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
    const isBuzz = state.view === 'buzz';
    $('#cats').hidden = isBuzz;
    $('#showcase').hidden = true;
    $('.filters').hidden = isBuzz;
    renderTopics();
    const box = $('#list');
    box.textContent = '';
    if (isBuzz) { box.classList.remove('ranked'); return renderBuzz(); }

    const { skills, hl, hlHe, translated, searching } = results();
    trackSearch(skills.length);
    $('#hint').textContent = translated.length
      ? `חיפשתי גם: ${translated.slice(0, 8).join(', ')}`
      : 'אפשר לכתוב בעברית. המילים מתורגמות לאנגלית, השפה שבה הסקילים כתובים.';
    box.classList.toggle('ranked', !searching && (state.view === 'hot' || state.view === 'top'));
    const cat = state.cat && catById[state.cat];
    $('#count').textContent = skills.length
      ? `${skills.length.toLocaleString('he-IL')} ${searching ? 'סקילים מתאימים' : 'סקילים'}${cat ? ` בנושא ${cat.label}` : ''}`
      : '';

    if (!data.skills.length) return emptyState('עוד אין נתונים. ההרצה הראשונה של האיסוף תמלא את הרשימה.');
    if (!skills.length) {
      const safeQ = state.q.replace(/[<>&"]/g, '');
      emptyState(`אין סקיל שמתאים ל<strong>${safeQ || 'הסינון'}</strong>${cat ? ` בנושא ${cat.label}` : ''}. ` +
        (cat ? 'אפשר <a href="#" id="clear-cat">לחפש בכל הנושאים</a>, או ' : 'אפשר ') + 'לנסות מילה אחרת באנגלית.');
      $('#clear-cat')?.addEventListener('click', (e) => { e.preventDefault(); setCat(null); });
      return;
    }
    // Browsing (no search, no topic): the top of the list goes on the arc, one per repo; the grid shows the rest.
    let gridSkills = skills;
    let offset = 0;
    if (!searching && !state.cat && data.skills.length) {
      const seen = new Set();
      const shelf = [];
      for (const s of skills) {
        const k = s.repo || s.host;
        if (seen.has(k)) continue;
        seen.add(k);
        shelf.push(s);
        if (shelf.length === 12) break;
      }
      if (shelf.length >= 5) {
        $('#showcase').hidden = false;
        updateShowcase(shelf);
        const ids = new Set(shelf.map((s) => s.id));
        gridSkills = skills.filter((s) => !ids.has(s.id));
        offset = shelf.length;
      }
    }
    const ctx = { hl, hlHe, searching, view: state.view, maxDelta: Math.max(1, ...skills.map((s) => s.delta7 || 0)) };
    const frag = document.createDocumentFragment();
    gridSkills.slice(0, state.limit).forEach((s, i) => frag.append(row(s, i + offset, ctx)));
    box.append(frag);
    $('#more').hidden = gridSkills.length <= state.limit;
    $('#more').textContent = `עוד ${Math.min(PAGE, gridSkills.length - state.limit)}`;
  }

  // ---------- skill page ----------
  let skillToken = 0;
  const rawUrl = (s, file) => `https://raw.githubusercontent.com/${s.repo}/${encodeURIComponent(s.branch)}/${[s.path, file].filter(Boolean).map((p) => p.split('/').map(encodeURIComponent).join('/')).join('/')}`;
  const blobUrl = (s, file) => `https://github.com/${s.repo}/blob/${s.branch}/${[s.path, file].filter(Boolean).join('/')}`;

  function section(title) {
    const sec = el('section', 'side');
    sec.append(el('h2', null, title));
    return sec;
  }

  function renderSkill(s) {
    const token = ++skillToken;
    document.title = `${s.name} | רדאר סקילים`;
    const box = $('#skill');
    box.textContent = '';

    const back = el('a', 'back', 'חזרה לרשימה');
    back.href = `#${listParams()}`;
    box.append(back);

    // header
    const head = el('header', 'd-head');
    const img = el('img', 'avatar');
    img.alt = ''; img.width = 56; img.height = 56;
    img.src = `https://avatars.githubusercontent.com/${s.repo.split('/')[0]}?s=112`;
    const titles = el('div');
    const h1 = el('h1', 'd-name', s.name);
    h1.dir = 'ltr';
    const path = el('a', 'path', `${s.repo}${s.path ? '/' + s.path : ''}`);
    path.href = s.url; path.target = '_blank'; path.rel = 'noopener'; path.dir = 'ltr';
    titles.append(h1, path);
    head.append(img, titles);
    box.append(head);

    const facts = el('dl', 'facts');
    const fact = (k, v) => { if (v == null || v === '') return; const d = el('div'); d.append(el('dt', null, k), el('dd', null, v)); facts.append(d); };
    fact('כוכבים לריפו', num(s.stars));
    if (s.delta7 > 0) fact('השבוע', `+${num(s.delta7)}${s.trendEstimated ? ' (הערכה)' : ''}`);
    if (s.updated) { const n = daysSince(s.updated); fact('עדכון אחרון', n === 0 ? 'היום' : n === 1 ? 'אתמול' : `לפני ${n} ימים`); }
    fact('רישיון', s.license || 'לא צוין');
    const topics = s.categories.filter((c) => c !== 'other').map((c) => catById[c]?.label).filter(Boolean);
    if (topics.length) fact('נושאים', topics.join(', '));
    if (s.official) fact('מקור', 'Anthropic');
    box.append(facts);

    const grid = el('div', 'd-grid');
    const heBlock = el('section', 'he-block');
    heBlock.hidden = true;
    const file = el('article', 'file');
    const tab = el('div', 'tab', 'SKILL.md');
    tab.dir = 'ltr';
    const body = el('div', 'file-body');
    body.append(el('p', 'loading', 'טוען את הקובץ מגיטהאב…'));
    file.append(tab, body);

    const aside = el('aside');
    // install
    const inst = section('התקנה ב-Claude Code');
    const cmd = installCmd(s);
    const pre = el('pre', 'cmd'); pre.dir = 'ltr'; pre.textContent = cmd;
    const copy = el('button', 'copy wide', 'העתקת הפקודה');
    copy.type = 'button';
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(cmd); } catch { prompt('העתקה ידנית:', cmd); return; }
      track('copy_install', { skill_id: s.id, location: 'skill_page' });
      copy.textContent = 'הועתק'; copy.classList.add('done');
      setTimeout(() => { copy.textContent = 'העתקת הפקודה'; copy.classList.remove('done'); }, 1800);
    };
    inst.append(pre, copy, el('p', 'note', 'להעלאה ל-claude.ai: מורידים את התיקייה כקובץ zip ומעלים אותו בהגדרות, באזור Skills.'));
    // safety
    const safe = section('בדיקת בטיחות');
    if (s.flags.length) {
      const ul = el('ul', `flags ${s.risk}`);
      for (const f of s.flags) { const li = el('li'); li.append(el('strong', null, FLAG_LABELS[f] || f), el('span', null, FLAG_HELP[f] || '')); ul.append(li); }
      safe.append(ul);
    } else safe.append(el('p', 'note', 'בבדיקה הסטטית לא נמצאו סימנים חשודים. זה לא אישור שהסקיל בטוח, רק שלא נמצא משהו שמצריך תשומת לב.'));
    // files (filled from the repo detail file)
    const files = section('קבצים בתיקייה');
    files.append(el('p', 'note', 'טוען…'));
    // siblings in the same repo
    const same = data.skills.filter((x) => x.repo === s.repo && x.id !== s.id);
    const more = section(`עוד מ-${s.repo.split('/')[1]}`);
    if (same.length) {
      const ul = el('ul', 'same');
      for (const x of same.slice(0, 10)) { const a = el('a', null, x.name); a.href = skillHref(x.id); a.dir = 'ltr'; const li = el('li'); li.append(a); ul.append(li); }
      more.append(ul);
      if (same.length > 10) more.append(el('p', 'note', `ועוד ${same.length - 10} סקילים בריפו הזה.`));
    }
    aside.append(inst, safe, files);
    if (same.length) aside.append(more);
    const gh = el('a', 'gh', 'פתיחת התיקייה בגיטהאב');
    gh.href = s.url; gh.target = '_blank'; gh.rel = 'noopener';
    aside.append(gh);

    const main = el('div', 'd-main');
    main.append(heBlock, file);
    grid.append(main, aside);
    box.append(grid);

    // details: full description + file list
    const shard = `data/repos/${s.repo.toLowerCase().replace('/', '__')}.json`;
    const detailP = fetch(shard).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    detailP.then((d) => {
      if (token !== skillToken) return;
      const info = d?.skills?.[s.path];
      if (info?.he) {
        heBlock.append(el('h2', null, 'בעברית'));
        const p = el('p', null, info.he); p.dir = 'rtl';
        const who = info.heBy === 'claude' ? 'תרגום של Claude.' : 'תרגום אוטומטי במודל תרגום פתוח, ולכן לפעמים מגושם.';
        heBlock.append(p, el('p', 'note', `${who} הקובץ עצמו מוצג למטה כמו שהוא.`));
        heBlock.hidden = false;
      }
      files.lastChild.remove();
      files.querySelector('h2').textContent = `קבצים בתיקייה${info ? ` (${info.fileCount})` : ''}`;
      if (!info?.files?.length) {
        // A count without a list means the data predates file lists; the next daily run fills them in.
        const onlySkillMd = info && info.fileCount <= 1;
        files.append(el('p', 'note', onlySkillMd ? 'רק SKILL.md.' : 'רשימת הקבצים תופיע אחרי העדכון היומי הבא.'));
        return;
      }
      const ul = el('ul', 'files');
      for (const f of info.files) {
        const a = el('a', null, f); a.href = blobUrl(s, f); a.target = '_blank'; a.rel = 'noopener'; a.dir = 'ltr';
        const li = el('li'); li.append(a); ul.append(li);
      }
      files.append(ul);
      if (info.fileCount > info.files.length) files.append(el('p', 'note', `ועוד ${info.fileCount - info.files.length} בגיטהאב.`));
    });

    // the SKILL.md itself, live from GitHub
    detailP
      .then((d) => fetch(rawUrl(s, d?.skills?.[s.path]?.file || 'SKILL.md')))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
      .then((text) => {
        if (token !== skillToken) return;
        body.textContent = '';
        body.append(SkillMd.render(text, blobUrl(s, '')));
      })
      .catch(() => detailP.then((d) => {
        if (token !== skillToken) return;
        body.textContent = '';
        const p = el('p', 'desc-full', d?.skills?.[s.path]?.description || s.description);
        p.dir = 'auto';
        const a = el('a', null, 'לקובץ בגיטהאב');
        a.href = blobUrl(s, 'SKILL.md'); a.target = '_blank'; a.rel = 'noopener';
        const note = el('p', 'note', 'לא הצלחתי לטעון את הקובץ עכשיו. זה התיאור שלו מהאינדקס. ');
        note.append(a);
        body.append(note, p);
      }));
  }

  function setCat(id) { state.cat = id; state.limit = PAGE; render(); }

  // ---------- wiring ----------
  let qTimer;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value.trim(); state.limit = PAGE; render(); }, 120);
  });
  document.querySelectorAll('.views button').forEach((b) => (b.onclick = () => { state.view = b.dataset.view; state.limit = PAGE; render(); }));
  $('#more').onclick = () => { state.limit += PAGE; track('load_more', { view: state.view, shown: state.limit + PAGE }); render(); };
  $('#submit-link').addEventListener('click', () => track('click_submit_skill', {}));
  for (const [id, key] of [['#f-safe', 'safe'], ['#f-official', 'official'], ['#f-group', 'group'], ['#f-he', 'he']]) {
    $(id).checked = state[key];
    $(id).onchange = (e) => {
      state[key] = e.target.checked;
      if (key === 'he') store.set('radar.he', e.target.checked ? '1' : '0');
      track('toggle_filter', { filter: key, on: e.target.checked ? 1 : 0 });
      state.limit = PAGE;
      render();
    };
  }

  /** Hebrew descriptions (machine-translated in the daily run) load after the list is on screen. */
  function loadHebrew() {
    fetch('data/he.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((he) => {
        if (!he || he.index !== data.generatedAt || !Array.isArray(he.items)) return; // stale or missing
        data.skills.forEach((s, i) => { if (he.items[i]) { s.he = he.items[i]; docs[i]._he = undefined; } });
        heLoaded = true;
        warmIndex();
        $('#f-he').closest('label').hidden = false;
        if (!state.skill) render();
      })
      .catch(() => {});
  }
  window.addEventListener('hashchange', () => {
    const wasSkill = !!state.skill;
    if (!wasSkill) listScroll = scrollY;
    readHash();
    render();
    if (state.skill) scrollTo(0, 0);
    else if (wasSkill) requestAnimationFrame(() => scrollTo(0, listScroll));
  });

  readHash();
  Promise.all([
    fetch('data/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((ix) => (ix ? expand(ix) : data)),
    fetch('data/buzz.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
  ])
    .then(([d, b]) => {
      data = d;
      buzz = b.items || [];
      buildIndex();
      const st = d.stats || {};
      const when = d.generatedAt ? new Date(d.generatedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) : null;
      $('#sub').textContent = `${(st.skills || 0).toLocaleString('he-IL')} סקילים מ-${(st.repos || 0).toLocaleString('he-IL')} ריפואים.` +
        (when ? ` עודכן ב-${when}.` : '') + // On the first run everything is "new", which says nothing; show it only once there's a baseline.
        (st.newThisWeek && st.newThisWeek < st.skills ? ` ${st.newThisWeek.toLocaleString('he-IL')} נוספו השבוע.` : '');
      render();
      loadHebrew();
    })
    .catch(() => {
      $('#count').textContent = '';
      emptyState('לא הצלחתי לטעון את data/index.json. אם האתר רץ מקומית, הפעילו אותו דרך שרת (npm run serve) ולא מקובץ.');
    });
})();
