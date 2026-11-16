/* Skills Radar: static front end. Loads data/skills.json and searches in the browser. No backend. */
(() => {
  const $ = (s) => document.querySelector(s);
  const PAGE = 60;
  const FLAG_LABELS = {
    scripts: 'כולל סקריפטים להרצה',
    network: 'ניגש לרשת',
    secrets: 'מזכיר מפתחות או סיסמאות',
    destructive: 'פקודות שעלולות למחוק או לשנות מערכת',
    obfuscation: 'קוד מקודד או eval',
    autorun: 'מתקין או מריץ דברים אוטומטית',
    binary: 'קבצים בינאריים',
  };
  const RISK_LABELS = { low: 'סיכון נמוך', medium: 'שווה בדיקה', high: 'סימני סיכון', unknown: 'לא נבדק' };

  const state = { view: 'hot', cat: null, q: '', limit: PAGE, safe: false, official: false, group: true };
  let data = { skills: [], categories: [] };
  let buzz = [];
  let catById = {};
  let docs = [];

  // Where is the GitHub repo? Derive from <user>.github.io/<repo>/, fall back to the original.
  const repoSlug = (() => {
    const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
    const path = location.pathname.split('/').filter(Boolean)[0];
    return m && path ? `${m[1]}/${path}` : 'evyatarc3/sklaude';
  })();
  $('#submit-link').href = `https://github.com/${repoSlug}/issues/new?template=submit-skill.yml`;

  const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[֑-ׇ]/g, '').replace(/[̀-ͯ]/g, '');
  const fmt = new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 1 });
  const daysSince = (d) => Math.max(0, Math.round((Date.now() - Date.parse(d)) / 864e5));

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get('v')) state.view = p.get('v');
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

  function buildIndex() {
    catById = Object.fromEntries(data.categories.map((c) => [c.id, c]));
    docs = data.skills.map((s) => {
      const cats = s.categories.map((id) => catById[id]).filter(Boolean);
      return {
        s,
        name: norm(`${s.name} ${(s.path || '').replace(/[/_-]/g, ' ')}`),
        repo: norm(s.repo || s.host || ''),
        cat: norm(cats.map((c) => `${c.label} ${(c.he || []).join(' ')} ${(c.keywords || []).join(' ')}`).join(' ')),
        desc: norm(s.description),
      };
    });
  }

  function search(list, q) {
    const terms = norm(q).split(/[\s,]+/).filter((t) => t.length > 0);
    if (!terms.length) return list.map((d) => ({ d, score: 0 }));
    const out = [];
    for (const d of list) {
      let score = 0;
      let ok = true;
      for (const t of terms) {
        let s = 0;
        if (d.name.includes(t)) s += d.name.split(/\s+/).includes(t) ? 8 : 5;
        if (d.repo.includes(t)) s += 2;
        if (d.cat.includes(t)) s += 3;
        if (d.desc.includes(t)) s += new RegExp(`(^|[^\\p{L}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(d.desc) ? 2 : 1;
        if (!s) { ok = false; break; }
        score += s;
      }
      if (ok) out.push({ d, score: score * (1 + Math.log10((d.s.stars || 0) + 1) / 5) });
    }
    return out;
  }

  function filtered() {
    let list = docs;
    if (state.cat) list = list.filter((d) => d.s.categories.includes(state.cat));
    if (state.safe) list = list.filter((d) => d.s.risk !== 'high');
    if (state.official) list = list.filter((d) => d.s.official);
    let res = search(list, state.q);
    const by = {
      hot: (a, b) => (b.d.s.delta7 || 0) - (a.d.s.delta7 || 0) || b.d.s.stars - a.d.s.stars,
      new: (a, b) => (b.d.s.added || '').localeCompare(a.d.s.added || '') || (b.d.s.updated || '').localeCompare(a.d.s.updated || '') || b.d.s.stars - a.d.s.stars,
      top: (a, b) => b.d.s.stars - a.d.s.stars,
    }[state.view];
    res.sort(state.q ? (a, b) => b.score - a.score || by(a, b) : by);
    let skills = res.map((r) => r.d.s);
    if (state.group && !state.q) {
      const seen = {};
      skills = skills.filter((s) => {
        const k = s.repo || s.host;
        seen[k] = (seen[k] || 0) + 1;
        return seen[k] <= 3;
      });
    }
    return skills;
  }

  function renderCats() {
    const box = $('#cats');
    box.textContent = '';
    const all = document.createElement('button');
    all.className = 'chip';
    all.setAttribute('aria-pressed', String(!state.cat));
    all.textContent = 'הכל';
    all.onclick = () => setCat(null);
    box.append(all);
    for (const c of data.categories) {
      if (!c.count) continue;
      const b = document.createElement('button');
      b.className = 'chip';
      b.setAttribute('aria-pressed', String(state.cat === c.id));
      b.innerHTML = `<span></span><span class="n"></span>`;
      b.firstChild.textContent = c.label;
      b.lastChild.textContent = c.count;
      b.onclick = () => setCat(state.cat === c.id ? null : c.id);
      box.append(b);
    }
    box.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function installCmd(s) {
    if (!s.repo) return s.url;
    const slug = (s.path ? s.path.split('/').pop() : s.name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    const src = `${s.repo}${s.path ? '/' + s.path : ''}${s.branch ? '#' + s.branch : ''}`;
    return `npx degit ${src} ~/.claude/skills/${slug}`;
  }

  function card(s) {
    const el = $('#card-tpl').content.firstElementChild.cloneNode(true);
    el.querySelector('.name').textContent = s.name;
    const repo = el.querySelector('.repo');
    repo.textContent = s.repo ? `${s.repo}${s.path ? ' › ' + s.path : ''}` : s.host;
    repo.href = s.repo ? `https://github.com/${s.repo}` : s.url;
    const desc = el.querySelector('.desc');
    desc.textContent = s.description;
    desc.onclick = () => el.classList.toggle('open');
    const risk = el.querySelector('.risk');
    risk.classList.add(s.risk || 'unknown');
    risk.textContent = RISK_LABELS[s.risk] || RISK_LABELS.unknown;
    risk.title = s.flags?.length ? s.flags.map((f) => FLAG_LABELS[f] || f).join(' · ') : 'לא נמצאו סימנים חשודים בבדיקה הסטטית';
    const tags = el.querySelector('.tags');
    if (s.official) tags.append(tag('Anthropic', null, 'official'));
    for (const id of s.categories) if (catById[id]) tags.append(tag(catById[id].label, id));
    if (!s.repo) tags.append(tag('מחוץ לגיטהאב'));
    const meta = el.querySelector('.meta');
    const parts = [];
    if (s.repo) parts.push(`★ ${fmt.format(s.stars)}`);
    meta.textContent = parts.join(' ');
    if (s.delta7 > 0) {
      const up = document.createElement('span');
      up.className = 'up';
      up.textContent = ` +${fmt.format(s.delta7)} השבוע${s.trendEstimated ? '*' : ''}`;
      if (s.trendEstimated) up.title = 'הערכה: אין עדיין שבוע שלם של היסטוריה';
      meta.append(up);
    }
    if (s.updated) {
      const n = daysSince(s.updated);
      meta.append(` · עודכן ${n === 0 ? 'היום' : n === 1 ? 'אתמול' : `לפני ${n} ימים`}`);
    }
    if (s.copies > 1) meta.append(` · ${s.copies} עותקים`);
    el.querySelector('.open').href = s.url;
    el.querySelector('.copy').onclick = () => copy(installCmd(s));
    return el;
  }

  function tag(text, catId, extra) {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = `tag ${extra || ''}`;
    t.textContent = text;
    if (catId) t.onclick = () => setCat(catId);
    return t;
  }

  function renderBuzz() {
    const box = $('#list');
    box.textContent = '';
    const q = norm(state.q);
    const items = buzz.filter((b) => !q || norm(b.title).includes(q));
    if (!items.length) return empty(buzz.length ? 'אין דיונים שמתאימים לחיפוש' : 'אין עדיין נתוני קהילה. הם יופיעו אחרי ההרצה היומית הבאה.');
    for (const b of items) {
      const el = document.createElement('div');
      el.className = 'buzz-item';
      el.innerHTML = `<a class="title" dir="auto" target="_blank" rel="noopener"></a><div class="meta"></div>`;
      el.firstChild.textContent = b.title;
      el.firstChild.href = b.url;
      const m = el.lastChild;
      m.textContent = `▲ ${b.points} · ${b.comments} תגובות · ${b.date} · `;
      const d = document.createElement('a');
      d.href = b.discussion; d.target = '_blank'; d.rel = 'noopener'; d.textContent = 'לדיון';
      m.append(d);
      box.append(el);
    }
    $('#count').textContent = `${items.length} דיונים`;
    $('#more').hidden = true;
  }

  function empty(msg) {
    const e = document.createElement('p');
    e.className = 'empty';
    e.textContent = msg;
    $('#list').append(e);
    $('#count').textContent = '';
    $('#more').hidden = true;
  }

  function render() {
    writeHash();
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
    $('#cats').hidden = state.view === 'buzz';
    document.querySelector('.filters').hidden = state.view === 'buzz';
    renderCats();
    if (state.view === 'buzz') return renderBuzz();
    const list = filtered();
    const box = $('#list');
    box.textContent = '';
    if (!list.length) return empty(data.skills.length ? 'לא נמצאו סקילים. כדאי לנסות מילה אחרת או להסיר סינון.' : 'אין עדיין נתונים. הם יופיעו אחרי ההרצה הראשונה של האיסוף.');
    const frag = document.createDocumentFragment();
    list.slice(0, state.limit).forEach((s) => frag.append(card(s)));
    box.append(frag);
    $('#count').textContent = `${list.length.toLocaleString('he-IL')} סקילים`;
    $('#more').hidden = list.length <= state.limit;
  }

  function setCat(id) { state.cat = id; state.limit = PAGE; render(); }

  let toastTimer;
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('הועתק: ' + text); }
    catch { prompt('העתקה ידנית:', text); }
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ----- wiring -----
  let qTimer;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value.trim(); state.limit = PAGE; render(); }, 120);
  });
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { state.view = b.dataset.view; state.limit = PAGE; render(); }));
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
      const when = d.generatedAt ? new Date(d.generatedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) : '—';
      $('#sub').textContent = `${(st.skills || 0).toLocaleString('he-IL')} סקילים מ-${(st.repos || 0).toLocaleString('he-IL')} מקורות · ${st.newThisWeek || 0} חדשים השבוע · עודכן ב-${when}`;
      render();
    })
    .catch(() => { $('#sub').textContent = 'שגיאה בטעינת הנתונים'; empty('לא הצלחתי לטעון את data/skills.json'); });
})();
