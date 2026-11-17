/* Arc focus carousel: skill covers laid out on an arc, the focused one large in the middle.
   RTL: the next item sits to the left. Arrows, swipe/drag, keyboard (← →), click a side card to focus it,
   click the focused card to open it. One fan-out on first show; nothing moves on its own after that. */
window.Showcase = (() => {
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function create(root, { renderCover, onChange, onOpen }) {
    const stage = root.querySelector('.arc');
    let items = [];
    let active = 0;
    let cards = [];
    let shown = false;

    function geometry() {
      const w = stage.clientWidth;
      const small = w < 640;
      return {
        step: small ? 21 : 13,          // degrees between neighbours on the arc
        radius: small ? Math.max(300, w * 0.95) : Math.min(1000, w * 0.8),
        visible: small ? 2 : 3,         // cards shown on each side
      };
    }

    function layout() {
      const g = geometry();
      const n = items.length;
      cards.forEach((card, i) => {
        let d = i - active;
        if (d > n / 2) d -= n;
        if (d < -n / 2) d += n;
        const far = Math.abs(d) > g.visible;
        const t = (d * g.step * Math.PI) / 180;
        const x = -Math.sin(t) * g.radius;           // RTL: positive d goes left
        const y = (1 - Math.cos(t)) * g.radius * 0.8;
        const rot = -d * g.step * 0.85;
        const s = d === 0 ? 1 : Math.max(0.5, 0.74 - 0.05 * (Math.abs(d) - 1));
        card.style.transform = `translate(-50%, 0) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${s})`;
        card.style.opacity = far ? 0 : d === 0 ? 1 : Math.max(0.35, 1 - 0.14 * Math.abs(d));
        card.style.zIndex = String(20 - Math.abs(d));
        card.style.pointerEvents = far ? 'none' : '';
        card.classList.toggle('focus', d === 0);
        card.tabIndex = -1;
        card.setAttribute('aria-hidden', String(d !== 0));
      });
    }

    function go(i, source) {
      if (!items.length) return;
      active = (i + items.length) % items.length;
      layout();
      onChange(items[active], active, source);
    }

    function set(list) {
      // Same items again (e.g. Hebrew text arrived): keep the position the visitor is at.
      const same = list.length === items.length && list.every((s, i) => s.id === items[i].id);
      const keep = same ? active : 0;
      items = list;
      active = keep;
      stage.textContent = '';
      cards = items.map((s, i) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'arc-card';
        card.append(renderCover(s));
        const label = document.createElement('span');
        label.className = 'arc-label';
        label.dir = 'ltr';
        label.textContent = s.name;
        card.append(label);
        card.addEventListener('click', () => {
          if (moved) return;
          if (i === active) onOpen(items[i]);
          else go(i, 'click');
        });
        stage.append(card);
        return card;
      });
      if (!shown && !reduce()) {
        // The one orchestrated moment: everything starts stacked in the centre and fans out.
        cards.forEach((c) => { c.style.transition = 'none'; c.style.transform = 'translate(-50%, 40px) scale(.6)'; c.style.opacity = '0'; });
        stage.getBoundingClientRect();
        requestAnimationFrame(() => {
          cards.forEach((c, i) => { c.style.transition = ''; c.style.transitionDelay = `${Math.min(i, 6) * 45}ms`; });
          layout();
          setTimeout(() => cards.forEach((c) => { c.style.transitionDelay = ''; }), 900);
        });
      } else layout();
      shown = true;
      if (items.length) onChange(items[active], active, 'init');
    }

    // swipe / drag
    let startX = null;
    let moved = false;
    stage.addEventListener('pointerdown', (e) => { startX = e.clientX; moved = false; });
    stage.addEventListener('pointermove', (e) => { if (startX !== null && Math.abs(e.clientX - startX) > 8) moved = true; });
    const end = (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1), 'swipe'); // RTL: dragging left brings the next one
      setTimeout(() => { moved = false; }, 0);
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', () => { startX = null; });

    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { go(active + 1, 'key'); e.preventDefault(); }
      if (e.key === 'ArrowRight') { go(active - 1, 'key'); e.preventDefault(); }
      if (e.key === 'Enter' && e.target === stage) onOpen(items[active]);
    });
    root.querySelector('.sc-next').addEventListener('click', () => go(active + 1, 'arrow'));
    root.querySelector('.sc-prev').addEventListener('click', () => go(active - 1, 'arrow'));
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 120); });

    return { set, go, get current() { return items[active]; } };
  }

  return { create };
})();
