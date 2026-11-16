/* Minimal, safe Markdown renderer for SKILL.md files.
   Everything is built with DOM APIs and textContent: raw HTML in the source is shown as text, never parsed.
   Supports: frontmatter, headings, paragraphs, lists, blockquotes, fenced code, tables, rules, inline code,
   bold, italic, links (http/https, or relative ones resolved against the skill folder on GitHub). */
window.SkillMd = (() => {
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

  function splitFrontmatter(text) {
    const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const m = src.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
    return m ? { fm: m[1], body: src.slice(m[0].length) } : { fm: null, body: src };
  }

  /** Frontmatter as it appears in the file, with keys set apart from values. */
  function renderFrontmatter(fm) {
    const pre = el('pre', 'fm');
    pre.dir = 'ltr';
    const lines = ['---', ...fm.split('\n'), '---'];
    lines.forEach((line, i) => {
      const m = line.match(/^(\s*[\w-]+:)(.*)$/);
      if (m) {
        const k = el('span', 'k');
        k.textContent = m[1];
        pre.append(k, m[2]);
      } else {
        const span = el('span', line === '---' ? 'rule' : null);
        span.textContent = line;
        pre.append(span);
      }
      if (i < lines.length - 1) pre.append('\n');
    });
    return pre;
  }

  function safeUrl(href, base) {
    const h = href.trim();
    if (/^https?:\/\//i.test(h)) return h;
    if (/^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('//')) return null; // javascript:, data:, etc.
    if (h.startsWith('#')) return null;
    try { return new URL(h, base).href; } catch { return null; }
  }

  // Inline: code spans first (their content is literal), then links, bold, italic.
  function inline(parent, text, base) {
    const re = /(`+)([\s\S]*?)\1|!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([^*]+)\*\*|__([^_]+)__|(?<![\w*])\*([^*\s][^*]*?)\*(?!\w)|(?<![\w_])_([^_\s][^_]*?)_(?!\w)/g;
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) parent.append(text.slice(last, m.index));
      if (m[1]) {
        const c = el('code'); c.textContent = m[2]; parent.append(c);
      } else if (m[4] !== undefined) {
        const url = safeUrl(m[4], base);
        const label = m[0].startsWith('!') ? `תמונה: ${m[3] || m[4]}` : m[3];
        if (url) {
          const a = el('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener nofollow';
          inline(a, label, base); parent.append(a);
        } else parent.append(label);
      } else if (m[5] || m[6]) {
        const b = el('strong'); inline(b, m[5] || m[6], base); parent.append(b);
      } else if (m[7] || m[8]) {
        const i = el('em'); inline(i, m[7] || m[8], base); parent.append(i);
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.append(text.slice(last));
  }

  function block(tag, text, base) {
    const e = el(tag);
    e.dir = 'auto';
    inline(e, text, base);
    return e;
  }

  function renderBody(md, base) {
    const out = document.createDocumentFragment();
    const lines = md.split('\n');
    let i = 0;
    const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const fence = line.match(/^\s*(```+|~~~+)\s*([\w+-]*)/);
      if (fence) {
        const code = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++]);
        i++;
        const pre = el('pre'); pre.dir = 'ltr';
        const c = el('code'); c.textContent = code.join('\n');
        if (fence[2]) pre.dataset.lang = fence[2];
        pre.append(c); out.append(pre);
        continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (h) { out.append(block(`h${Math.min(6, h[1].length + 1)}`, h[2], base)); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.append(el('hr')); i++; continue; }
      if (isTableRow(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const wrap = el('div', 'table'); const table = el('table'); const thead = el('thead'); const tr = el('tr');
        cells(line).forEach((c) => tr.append(block('th', c, base)));
        thead.append(tr); table.append(thead);
        const tbody = el('tbody');
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) {
          const r = el('tr'); cells(lines[i]).forEach((c) => r.append(block('td', c, base))); tbody.append(r); i++;
        }
        table.append(tbody); wrap.append(table); out.append(wrap);
        continue;
      }
      if (/^\s*>/.test(line)) {
        const q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        const bq = el('blockquote'); bq.append(renderBody(q.join('\n'), base)); out.append(bq);
        continue;
      }
      const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (li) {
        const ordered = /\d/.test(li[2]);
        const list = el(ordered ? 'ol' : 'ul');
        while (i < lines.length) {
          const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (m) {
            const item = block('li', m[3].replace(/^\[( |x)\]\s*/i, (_, x) => (x.trim() ? '☑ ' : '☐ ')), base);
            if (m[1].length >= 2) item.classList.add('nested');
            list.append(item); i++;
          } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && list.lastChild) {
            list.lastChild.append(' '); inline(list.lastChild, lines[i].trim(), base); i++;
          } else break;
        }
        out.append(list);
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|```|~~~|>|[-*+]\s|\d+[.)]\s|\|)/.test(lines[i])) para.push(lines[i++].trim());
      if (!para.length) para.push(lines[i++].trim());
      out.append(block('p', para.join(' '), base));
    }
    return out;
  }

  /** @param {string} text full SKILL.md  @param {string} base URL that relative links resolve against */
  function render(text, base) {
    const { fm, body } = splitFrontmatter(text);
    const frag = document.createDocumentFragment();
    if (fm) frag.append(renderFrontmatter(fm));
    const md = el('div', 'md');
    md.append(renderBody(body, base));
    frag.append(md);
    return frag;
  }

  return { render };
})();
