/* Skills Radar front end. Loads data/skills.json and searches in the browser. No backend. */
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

  const state = { view: 'hot', cat: null, q: '', limit: PAGE, safe: false, official: false, group: true };
  let data = { skills: [], categories: [] };
  let buzz = [];
  let catById = {};
  let docs = [];

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
    $('#q').value = state.q;
  }
  function writeHash() {
    const p = new URLSearchParams();
    if (state.view !== 'hot') p.set('v', state.view);
    if (state.cat) p.set('c', state.cat);
    if (state.q) p.set('q', state.q);
    const h = p.toString();
    history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  }

  // ---------- search ----------
  function buildIndex() {
    catById = Object.fromEntries(data.categories.map((c) => [c.id, c]));
    docs = data.skills.map((s) => ({
      s,
      name: norm(`${s.name} ${(s.path || '').split('/').pop().replace(/[_-]/g, ' ')}`),
      repo: norm(s.repo || s.host || ''),
      cat: norm(s.categories.map((id) => catById[id]).filter(Boolean)
        .map((c) => `${c.label} ${(c.he || []).join(' ')} ${(c.keywords || []).join(' ')}`).join(' ')),
      desc: norm(s.description),
    }));
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
    return { skills, hl, translated, searching: terms.length > 0 };
  }

  // ---------- rendering ----------
  function highlight(node, text, terms) {
    node.textContent = '';
    if (!terms.length) { node.textContent = text; return; }
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${terms.sort((a, b) => b.length - a.length).map(esc).join('|')})`, 'giu');
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
      const b = el('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.cat === c.id));
      b.append(c.label, el('span', 'n', c.count));
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
    const img = r.querySelector('.avatar');
    if (s.repo) img.src = `https://avatars.githubusercontent.com/${s.repo.split('/')[0]}?s=72`;
    else img.src = 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%23e9ebf0'/><path d='M7 10h7l2 2h9v11H7z' fill='%235d6270'/></svg>");
    img.onerror = () => { img.style.visibility = 'hidden'; };

    const name = r.querySelector('.name');
    highlight(name, s.name, ctx.hl);
    name.href = s.url;
    const path = r.querySelector('.path');
    path.textContent = s.repo ? `${s.repo}${s.path ? '/' + s.path : ''}` : s.host;
    path.href = s.repo ? `https://github.com/${s.repo}` : s.url;
    const desc = r.querySelector('.desc');
    highlight(desc, s.description, ctx.hl);
    desc.onclick = () => r.classList.toggle('open');

    const pulse = r.querySelector('.pulse');
    if (ctx.view === 'hot' && !ctx.searching && s.delta7 > 0) {
      const bar = el('span', 'bar');
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

  function render() {
    writeHash();
    document.querySelectorAll('.views button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
    const isBuzz = state.view === 'buzz';
    $('#cats').hidden = isBuzz;
    $('.filters').hidden = isBuzz;
    renderTopics();
    const box = $('#list');
    box.textContent = '';
    if (isBuzz) { box.classList.remove('ranked'); return renderBuzz(); }

    const { skills, hl, translated, searching } = results();
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
    const ctx = { hl, searching, view: state.view, maxDelta: Math.max(1, ...skills.map((s) => s.delta7 || 0)) };
    const frag = document.createDocumentFragment();
    skills.slice(0, state.limit).forEach((s, i) => frag.append(row(s, i, ctx)));
    box.append(frag);
    $('#more').hidden = skills.length <= state.limit;
    $('#more').textContent = `עוד ${Math.min(PAGE, skills.length - state.limit)}`;
  }

  function setCat(id) { state.cat = id; state.limit = PAGE; render(); }

  // ---------- wiring ----------
  let qTimer;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value.trim(); state.limit = PAGE; render(); }, 120);
  });
  document.querySelectorAll('.views button').forEach((b) => (b.onclick = () => { state.view = b.dataset.view; state.limit = PAGE; render(); }));
  $('#more').onclick = () => { state.limit += PAGE; render(); };
  for (const [id, key] of [['#f-safe', 'safe'], ['#f-official', 'official'], ['#f-group', 'group']]) {
    $(id).checked = state[key];
    $(id).onchange = (e) => { state[key] = e.target.checked; state.limit = PAGE; render(); };
  }
  window.addEventListener('hashchange', () => { readHash(); render(); });

  readHash();
  Promise.all([
    fetch('data/skills.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : data)),
    fetch('data/buzz.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
  ])
    .then(([d, b]) => {
      data = d;
      buzz = b.items || [];
      buildIndex();
      const st = d.stats || {};
      const when = d.generatedAt ? new Date(d.generatedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) : null;
      $('#sub').textContent = `${(st.skills || 0).toLocaleString('he-IL')} סקילים מ-${(st.repos || 0).toLocaleString('he-IL')} ריפואים.` +
        (when ? ` עודכן ב-${when}.` : '') + (st.newThisWeek ? ` ${st.newThisWeek} נוספו השבוע.` : '');
      render();
    })
    .catch(() => {
      $('#count').textContent = '';
      emptyState('לא הצלחתי לטעון את data/skills.json. אם האתר רץ מקומית, הפעילו אותו דרך שרת (npm run serve) ולא מקובץ.');
    });
})();
