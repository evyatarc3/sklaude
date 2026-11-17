/* Generated "product covers" for skills: no image files, only CSS gradients + an inline icon.
   Hue comes from the topic (so colour carries meaning), the rest of the composition from a hash
   of the skill id (so every skill looks a little different but always the same). */
window.SkillArt = (() => {
  const HUES = {
    dev: 228, frontend: 328, docs: 32, data: 188, ai: 266, writing: 14, research: 146, marketing: 2,
    media: 292, devops: 206, testing: 92, security: 222, productivity: 168, business: 44, health: 350,
    education: 56, meta: 248, other: 220,
  };
  const SAT = { security: 28, other: 18 };
  const P = {
    dev: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16"/>',
    frontend: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
    docs: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    data: '<path d="M5 20V11M11 20V5M17 20v-6M3 20h18"/>',
    ai: '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    writing: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3M4 20h16"/>',
    research: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 14h9"/>',
    marketing: '<path d="M3 10.5v3l12 5.5V5L3 10.5z"/><path d="M18 9.5a3 3 0 0 1 0 5M6 14l1.2 5H10l-1-4"/>',
    media: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
    devops: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.6 4.2 4.2 0 0 0 7 18z"/>',
    testing: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
    security: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    productivity: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8.5 15l2 2 4-4"/>',
    business: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>',
    health: '<path d="M12 20s-8-4.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 10-8 10z"/><path d="M7 12h3l1.5-2.5 2 5L15 12h2"/>',
    education: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
    meta: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M17 13v8M13 17h8"/>',
    other: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
  };

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function icon(cat, cls = 'glyph') {
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${P[cat] || P.other}</svg>`;
  }

  /** Sets the cover's CSS variables and icon. `key` is any stable string (skill id or topic id). */
  function paint(node, cat, key) {
    const h = hash(key || cat);
    const base = HUES[cat] ?? HUES.other;
    const sat = SAT[cat] ?? 72;
    const r = (shift, span) => ((h >>> shift) % span);
    node.style.setProperty('--h1', base);
    node.style.setProperty('--h2', (base + 18 + r(3, 40)) % 360);
    node.style.setProperty('--h3', (base + 360 - 20 - r(9, 50)) % 360);
    node.style.setProperty('--s', `${sat}%`);
    node.style.setProperty('--x1', `${15 + r(5, 70)}%`);
    node.style.setProperty('--y1', `${10 + r(11, 50)}%`);
    node.style.setProperty('--x2', `${20 + r(17, 65)}%`);
    node.style.setProperty('--y2', `${45 + r(21, 50)}%`);
    node.style.setProperty('--a', `${r(25, 180)}deg`);
    node.dataset.motif = ['rings', 'lines', 'dots'][h % 3];
    node.classList.add('art');
    node.insertAdjacentHTML('beforeend', icon(cat));
    return node;
  }

  return { paint, icon, hues: HUES };
})();
