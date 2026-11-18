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

    /** `pos` is the (possibly fractional) index in the middle: whole when at rest, in between while dragging. */
    function layout(pos = active) {
      const g = geometry();
      const n = items.length;
      const atRest = pos === active;
      cards.forEach((card, i) => {
        let d = i - pos;
        if (d > n / 2) d -= n;
        if (d < -n / 2) d += n;
        const ad = Math.abs(d);
        const far = ad > g.visible + 0.5;
        const t = (d * g.step * Math.PI) / 180;
        const x = -Math.sin(t) * g.radius;           // RTL: positive d goes left
        const y = (1 - Math.cos(t)) * g.radius * 0.8;
        const rot = -d * g.step * 0.85;
        const s = ad < 1 ? 1 - 0.26 * ad : Math.max(0.5, 0.74 - 0.05 * (ad - 1));
        // Fades out over the last half step, so cards slide in and out instead of popping.
        const edge = Math.min(1, Math.max(0, (g.visible + 0.5 - ad) * 2));
        card.style.transform = `translate(-50%, 0) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${s.toFixed(3)})`;
        card.style.opacity = (Math.max(0.35, 1 - 0.14 * ad) * edge).toFixed(3);
        card.style.zIndex = String(20 - Math.round(ad));
        card.style.pointerEvents = far ? 'none' : '';
        if (atRest) {
          card.classList.toggle('focus', i === active);
          card.tabIndex = -1;
          card.setAttribute('aria-hidden', String(i !== active));
        }
      });
    }

    function go(i, source) {
      if (!items.length) return;
      const next = ((i % items.length) + items.length) % items.length;
      const changed = next !== active;
      active = next;
      layout();
      if (changed) onChange(items[active], active, source);
    }

    function set(list) {
      // Same items again (e.g. Hebrew text arrived): keep the cards and the position, only refresh the text.
      const same = cards.length && list.length === items.length && list.every((s, i) => s.id === items[i].id);
      if (same) {
        items = list;
        onChange(items[active], active, 'init');
        return;
      }
      items = list;
      active = 0;
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

    // Drag: the arc follows the pointer, then settles on the nearest card (a quick flick carries one further).
    let drag = null;
    let moved = false;
    let raf = 0;
    const spacing = () => { const g = geometry(); return Math.sin((g.step * Math.PI) / 180) * g.radius; };
    stage.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      drag = { id: e.pointerId, x0: e.clientX, x: e.clientX, t: e.timeStamp, v: 0, px: spacing() };
      moved = false;
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dt = e.timeStamp - drag.t;
      if (dt > 0) drag.v = 0.7 * drag.v + 0.3 * ((e.clientX - drag.x) / dt);
      drag.x = e.clientX;
      drag.t = e.timeStamp;
      if (!moved && Math.abs(drag.x - drag.x0) > 8) {
        moved = true;
        stage.classList.add('dragging');
        try { stage.setPointerCapture(drag.id); } catch { /* pointer already gone */ }
      }
      if (moved && !raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (drag) layout(active - (drag.x - drag.x0) / drag.px); // RTL: dragging left brings the next one
        });
      }
    });
    const end = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      cancelAnimationFrame(raf);
      raf = 0;
      if (!moved) return;
      stage.getBoundingClientRect();        // commit the dragged position before transitions come back on
      stage.classList.remove('dragging');
      const flick = Math.abs(d.v) > 0.4 ? -Math.sign(d.v) * 0.5 : 0;
      const target = cancelled ? active : Math.round(active - (d.x - d.x0) / d.px + flick);
      if (target === active) layout(); else go(target, 'swipe');
      setTimeout(() => { moved = false; }, 0);
    };
    stage.addEventListener('pointerup', (e) => end(e, false));
    stage.addEventListener('pointercancel', (e) => end(e, true));

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
