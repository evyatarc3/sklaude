// Minimal YAML-frontmatter reader for SKILL.md files.
// Handles: key: value, quoted values, block scalars (| and >), indented continuation lines.
// Anything more exotic is ignored rather than throwing.

export function parseFrontmatter(text) {
  if (typeof text !== 'string') return { data: {}, body: '' };
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = src.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { data: {}, body: src };
  const lines = m[1].split('\n');
  const data = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) { i++; continue; }
    const key = kv[1].toLowerCase();
    let value = kv[2].trim();
    i++;
    if (/^[|>][+-]?\s*$/.test(value)) {
      const folded = value.startsWith('>');
      const block = [];
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === '')) {
        block.push(lines[i].trim());
        i++;
      }
      value = folded ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim();
    } else {
      // plain scalar continued on indented lines
      while (i < lines.length && /^\s+\S/.test(lines[i]) && !/^\s+-\s/.test(lines[i])) {
        value += ' ' + lines[i].trim();
        i++;
      }
      value = unquote(value);
    }
    if (!(key in data)) data[key] = value;
  }
  return { data, body: src.slice(m[0].length) };
}

function unquote(v) {
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
    const inner = v.slice(1, -1);
    return v[0] === '"' ? inner.replace(/\\"/g, '"').replace(/\\n/g, ' ') : inner.replace(/''/g, "'");
  }
  return v;
}
