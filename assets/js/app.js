(function(){
  const tabs   = Array.from(document.querySelectorAll('button[data-tab]'));
  const links  = Array.from(document.querySelectorAll('[data-tab-link]'));
  const panels = {
    home:     document.getElementById('panel-home'),
    map:      document.getElementById('panel-map'),
    trends:   document.getElementById('panel-trends'),
    insights: document.getElementById('panel-insights'),
  };

  function selectTab(name){
    document.body.dataset.tab = name;
    Object.keys(panels).forEach(k => {
      const p = panels[k];
      if (!p) return;
      const isActive = (k === name);
      p.classList.toggle('is-active', isActive);
      if (isActive) {
        p.removeAttribute('hidden');
        p.querySelectorAll('.stagger').forEach(s => {
          s.classList.remove('stagger');
          void s.offsetWidth;
          s.classList.add('stagger');
        });
      } else {
        p.setAttribute('hidden', '');
      }
    });
    tabs.forEach(t => {
      const isActive = t.dataset.tab === name;
      if (t.getAttribute('role') === 'tab') {
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
    });
    requestAnimationFrame(() => {
      const html = document.documentElement;
      const prev = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      html.scrollTop = 0;
      document.body.scrollTop = 0;
      html.style.scrollBehavior = prev;
    });
    requestAnimationFrame(applyBleed);
  }

  tabs.forEach(t => {
    t.addEventListener('click', e => {
      e.preventDefault();
      selectTab(t.dataset.tab);
    });
  });

  links.forEach(l => {
    l.addEventListener('click', e => {
      e.preventDefault();
      selectTab(l.dataset.tabLink);
    });
  });

  const hourMinEl = document.getElementById('filter-hour-min');
  const hourMaxEl = document.getElementById('filter-hour-max');
  const hourDispEl = document.getElementById('hour-display');
  const hourFillEl = document.getElementById('hour-range-fill');
  const H_MIN = 0, H_MAX = 24, H_SPAN = H_MAX - H_MIN;

  function fmtHourStart(h){
    return String(parseInt(h, 10)).padStart(2, '0') + ':00';
  }
  function fmtHourEnd(h){
    return String(parseInt(h, 10)).padStart(2, '0') + ':59';
  }

  function syncHourRange(){
    if (!hourMinEl || !hourMaxEl) return;
    let a = parseInt(hourMinEl.value, 10);
    let b = parseInt(hourMaxEl.value, 10);
    if (hourDispEl) {
      hourDispEl.textContent = `${fmtHourStart(a)} — ${fmtHourEnd(b - 1)}`;
    }
    if (hourFillEl) {
      hourFillEl.style.left = ((a - H_MIN) / H_SPAN * 100) + '%';
      hourFillEl.style.right = ((H_MAX - b) / H_SPAN * 100) + '%';
    }
    document.dispatchEvent(new CustomEvent('crimiviz:hours-changed'));
  }

  if (hourMinEl && hourMaxEl) {
    hourMinEl.addEventListener('input', () => {
      const a = parseInt(hourMinEl.value, 10);
      const b = parseInt(hourMaxEl.value, 10);
      if (a >= b) {
        if (a + 1 <= H_MAX) hourMaxEl.value = String(a + 1);
        else hourMinEl.value = String(H_MAX - 1);
      }
      syncHourRange();
    });
    hourMaxEl.addEventListener('input', () => {
      const a = parseInt(hourMinEl.value, 10);
      const b = parseInt(hourMaxEl.value, 10);
      if (b <= a) {
        if (b - 1 >= H_MIN) hourMinEl.value = String(b - 1);
        else hourMaxEl.value = String(H_MIN + 1);
      }
      syncHourRange();
    });
    syncHourRange();
  }

  const yearMinEl = document.getElementById('filter-year-min');
  const yearMaxEl = document.getElementById('filter-year-max');
  const yearDispEl = document.getElementById('year-display');
  const yearFillEl = document.getElementById('year-range-fill');
  const Y_MIN = 2002, Y_MAX = 2027, Y_SPAN = Y_MAX - Y_MIN;

  function syncYearRange(){
    if (!yearMinEl || !yearMaxEl) return;
    let a = parseInt(yearMinEl.value, 10);
    let b = parseInt(yearMaxEl.value, 10);
    if (yearDispEl) yearDispEl.textContent = (b - 1 === a) ? String(a) : `${a} — ${b - 1}`;
    if (yearFillEl) {
      yearFillEl.style.left = ((a - Y_MIN) / Y_SPAN * 100) + '%';
      yearFillEl.style.right = ((Y_MAX - b) / Y_SPAN * 100) + '%';
    }
    document.dispatchEvent(new CustomEvent('crimiviz:years-changed'));
  }

  if (yearMinEl && yearMaxEl) {
    yearMinEl.addEventListener('input', () => {
      const a = parseInt(yearMinEl.value, 10);
      const b = parseInt(yearMaxEl.value, 10);
      if (a >= b) {
        if (a + 1 <= Y_MAX) yearMaxEl.value = String(a + 1);
        else yearMinEl.value = String(Y_MAX - 1);
      }
      syncYearRange();
    });
    yearMaxEl.addEventListener('input', () => {
      const a = parseInt(yearMinEl.value, 10);
      const b = parseInt(yearMaxEl.value, 10);
      if (b <= a) {
        if (b - 1 >= Y_MIN) yearMinEl.value = String(b - 1);
        else yearMaxEl.value = String(Y_MIN + 1);
      }
      syncYearRange();
    });
    syncYearRange();
  }

  const tip = document.getElementById('map-tooltip');
  if (tip) {
    tip.style.display = 'none';
    tip.setAttribute('aria-hidden', 'true');
  }

  const drips = Array.from(document.querySelectorAll('.drip'));
  const kpiBleeds = Array.from(document.querySelectorAll('[data-kpi-bleed]'));

  function setDrip(el, h){
    el.style.height = h + 'px';
  }

  function applyBleed(){
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const p = Math.min(1, Math.max(0, window.scrollY / max));
    drips.forEach(d => {
      const cs = getComputedStyle(d);
      const base  = parseFloat(cs.getPropertyValue('--base'))  || 80;
      const extra = parseFloat(cs.getPropertyValue('--extra')) || 400;
      const top = parseFloat(cs.top) || 0;
      const isCorner = d.classList.contains('drip-left') || d.classList.contains('drip-right');
      if (isCorner) {
        const target = Math.max(base, window.innerHeight - top - 4);
        setDrip(d, base + (target - base) * p);
      } else {
        const eased = 1 - Math.pow(1 - p, 1.6);
        setDrip(d, base + extra * eased);
      }
    });
    kpiBleeds.forEach(b => {
      const cs = getComputedStyle(b);
      const base  = parseFloat(cs.getPropertyValue('--base'))  || 18;
      const extra = parseFloat(cs.getPropertyValue('--extra')) || 40;
      const r = b.getBoundingClientRect();
      const vis = Math.min(1, Math.max(0, 1 - r.top / window.innerHeight));
      const eased = 1 - Math.pow(1 - vis, 1.4);
      setDrip(b, base + extra * eased);
    });
  }

  let ticking = false;
  function onScroll(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { applyBleed(); ticking = false; });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', applyBleed);
  applyBleed();

  const tablist = document.querySelector('[role="tablist"]');
  if (tablist) {
    tablist.addEventListener('keydown', (e) => {
      const order = ['home', 'map', 'trends', 'insights'];
      const current = document.querySelector('.tab[aria-selected="true"]').dataset.tab;
      let i = order.indexOf(current);
      if (e.key === 'ArrowRight') i = (i + 1) % order.length;
      else if (e.key === 'ArrowLeft') i = (i - 1 + order.length) % order.length;
      else return;
      selectTab(order[i]);
      document.querySelector('.tab[data-tab="' + order[i] + '"]').focus();
    });
  }

  window.Crimiviz = window.Crimiviz || {};
  window.Crimiviz.selectTab = selectTab;
  window.Crimiviz.applyBleed = applyBleed;

  // ─── Year / Hour sweep animation ───
  const ANIM_STEP_MS = 500;
  let animTimer = null;
  let animTarget = null;

  function setPlayingButton(target, playing){
    const btn = document.querySelector(`.range-play[data-target="${target}"]`);
    if (btn) btn.classList.toggle('is-playing', playing);
  }

  function stopAnimation(){
    if (animTimer !== null) { clearInterval(animTimer); animTimer = null; }
    if (animTarget) setPlayingButton(animTarget, false);
    animTarget = null;
  }

  function startAnimation(target){
    stopAnimation();
    const minEl = document.getElementById(`filter-${target}-min`);
    const maxEl = document.getElementById(`filter-${target}-max`);
    if (!minEl || !maxEl) return;
    const lo = parseInt(minEl.min, 10);
    const hi = parseInt(minEl.max, 10);
    const sync = target === 'year' ? syncYearRange : syncHourRange;
    let cur = lo;
    minEl.value = String(cur);
    maxEl.value = String(cur + 1);
    sync();
    animTarget = target;
    setPlayingButton(target, true);
    animTimer = setInterval(() => {
      cur = cur >= hi - 1 ? lo : cur + 1;
      minEl.value = String(cur);
      maxEl.value = String(cur + 1);
      sync();
    }, ANIM_STEP_MS);
  }

  document.querySelectorAll('.range-play').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (animTarget === target) stopAnimation();
      else startAnimation(target);
    });
  });

  ['filter-year-min', 'filter-year-max', 'filter-hour-min', 'filter-hour-max'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('pointerdown', () => { if (animTarget) stopAnimation(); });
  });
})();
