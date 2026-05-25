import * as d3 from 'd3';

const PARSE = d3.timeParse('%Y-%m-%d');
const FMT_DAY = d3.timeFormat('%b %-d');
const FMT_FULL = d3.timeFormat('%a %b %-d, %Y');
const FMT_INT = d3.format(',');
const FMT_PCT = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`;

const ROBUST_TYPES = ['THEFT', 'BATTERY', 'NARCOTICS', 'CRIMINAL DAMAGE', 'OTHER OFFENSE', 'BURGLARY'];

function tokens(scopeEl) {
  const root = getComputedStyle(document.documentElement);
  const scope = scopeEl ? getComputedStyle(scopeEl) : root;
  const r = (n) => root.getPropertyValue(n).trim();
  const s = (n) => scope.getPropertyValue(n).trim() || root.getPropertyValue(n).trim();
  return {
    ink: r('--ink'),
    ink2: r('--ink-2'),
    ink3: r('--ink-3'),
    ink4: r('--ink-4') || r('--ink-3'),
    rule: r('--rule'),
    paper: r('--paper'),
    paper2: r('--paper-2') || r('--paper'),
    bliz1: s('--bliz-1'),
    bliz2: s('--bliz-2'),
    bliz3: s('--bliz-3'),
    bliz4: s('--bliz-4'),
    bliz5: s('--bliz-5'),
    blizAccent: s('--bliz-accent'),
    blizLine: s('--bliz-line'),
    blizSoft: s('--bliz-soft'),
  };
}

function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }

function styleAxis(sel, color) {
  sel.selectAll('path,line').attr('stroke', color);
  sel.selectAll('text')
    .attr('fill', color)
    .attr('font-family', 'var(--mono)')
    .attr('font-size', 11);
}

function findScope(el) {
  let n = el;
  while (n && !n.classList?.contains('bliz-charts')) n = n.parentElement;
  return n || document.documentElement;
}

// d3.scaleSequential parses color strings through d3-color, which does NOT
// understand the oklch() functional notation. Browsers DO render oklch in
// SVG attributes, which is why direct attr('fill', oklchString) works but
// any d3 interpolator handed the same string silently collapses to black.
// Resolve oklch CSS values to an rgb() string by painting them on a probe
// element inside the right scope and reading back getComputedStyle.color.
function resolveColor(cssValue, scopeEl) {
  const host = scopeEl && scopeEl !== document.documentElement
    ? scopeEl
    : document.body;
  const probe = document.createElement('span');
  probe.style.color = cssValue;
  probe.style.display = 'none';
  host.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  host.removeChild(probe);
  return rgb || cssValue;
}

function makeNode(tag, attrs = {}, text) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v);
  }
  if (text != null) el.textContent = String(text);
  return el;
}

// ─────────────────────────────────────────────────────────────────────────
// Dumbbell
// ─────────────────────────────────────────────────────────────────────────
function renderDumbbell(rootEl, blizzards) {
  const t = tokens(findScope(rootEl));
  clear(rootEl);

  const rows = blizzards.events.map(e => ({
    event: e.event,
    short: e.event.split(' ').slice(0, 2).join(' '),
    year: e.event_start.slice(0, 4),
    baseline: e.baseline_mean_n,
    low: e.lowest_day_n,
    drop: e.drop_pct,
  })).sort((a, b) => a.drop - b.drop);

  const W = 960, H = 280;
  const M = { top: 28, right: 96, bottom: 36, left: 130 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const svg = d3.select(rootEl).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', 'Daily crime baseline versus the lowest day during each blizzard event');
  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  const x = d3.scaleLinear()
    .domain([0, d3.max(rows, r => r.baseline) * 1.05])
    .range([0, innerW]);
  const y = d3.scaleBand()
    .domain(rows.map(r => r.event))
    .range([0, innerH])
    .padding(0.45);

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(FMT_INT).tickSizeOuter(0))
    .call(s => styleAxis(s, t.ink3));

  g.append('g')
    .call(d3.axisLeft(y).tickSize(0).tickFormat(d => rows.find(r => r.event === d).short))
    .call(s => {
      s.selectAll('path').remove();
      s.selectAll('text').attr('fill', t.ink).attr('font-family', 'var(--mono)').attr('font-size', 12);
    });

  const rowG = g.selectAll('g.row').data(rows).join('g')
    .attr('class', 'row')
    .attr('transform', d => `translate(0,${y(d.event) + y.bandwidth() / 2})`);

  rowG.append('line')
    .attr('x1', d => x(d.low)).attr('x2', d => x(d.baseline))
    .attr('y1', 0).attr('y2', 0)
    .attr('stroke', t.bliz3).attr('stroke-width', 3);

  rowG.append('circle')
    .attr('cx', d => x(d.baseline)).attr('cy', 0)
    .attr('r', 6)
    .attr('fill', t.paper).attr('stroke', t.ink2).attr('stroke-width', 2);

  rowG.append('circle')
    .attr('cx', d => x(d.low)).attr('cy', 0)
    .attr('r', 7)
    .attr('fill', t.blizAccent);

  rowG.append('text')
    .attr('x', d => x(d.baseline) + 12).attr('y', -10)
    .attr('fill', t.ink3)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.1em')
    .text(d => `baseline ${FMT_INT(Math.round(d.baseline))}`);

  rowG.append('text')
    .attr('x', d => x(d.low) - 12).attr('y', -10)
    .attr('text-anchor', 'end')
    .attr('fill', t.blizAccent)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.1em')
    .text(d => `low ${FMT_INT(d.low)}`);

  rowG.append('text')
    .attr('x', innerW + 12).attr('y', 4)
    .attr('fill', t.blizAccent)
    .attr('font-family', 'var(--mono)').attr('font-size', 16)
    .attr('font-weight', 600)
    .text(d => FMT_PCT(d.drop));

  g.append('text')
    .attr('x', 0).attr('y', innerH + 28)
    .attr('fill', t.ink3)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.14em')
    .text('INCIDENTS / DAY');
}

// ─────────────────────────────────────────────────────────────────────────
// Animated connected scatter
// One panel + event selector + play/pause/reset, traced day by day.
// Respects prefers-reduced-motion: full path drawn statically by default.
// ─────────────────────────────────────────────────────────────────────────
function renderConnectedScatter(rootEl, wide, temperature) {
  const t = tokens(findScope(rootEl));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tempByDate = new Map(temperature.daily.map(d => [d.date, d]));
  const eventsByYear = new Map();
  for (const e of wide.events) {
    const year = e.event_start.slice(0, 4);
    // Per-offset baseline from build_blizzards_extras.py / build_wide():
    // baseline[offset] = mean of daily total incidents on (event_start + offset)
    // taken across the two adjacent baseline years (e.g. for 2019 event_start
    // = Jan 30 and baseline_years = [2018, 2020], offset −1 = Jan 29 means
    // avg(Jan 29 2018, Jan 29 2020)). Same-calendar-day pairing, not a
    // rolling or seasonal mean.
    const baseByOff = new Map(e.baseline.map(b => [b.offset, b.n_avg]));
    const pts = e.actual.map(a => {
      const tr = tempByDate.get(a.date);
      if (!tr || tr.tavg == null) return null;
      return {
        date: PARSE(a.date),
        dateStr: a.date,
        offset: a.offset,
        n: a.n,
        base: baseByOff.get(a.offset) ?? null,
        tavg: tr.tavg,
        tmin: tr.tmin,
        tmax: tr.tmax,
        inEvent: a.date >= e.event_start && a.date <= e.event_end,
      };
    }).filter(Boolean);
    eventsByYear.set(year, {
      year,
      event: e.event,
      eventStart: e.event_start,
      eventEnd: e.event_end,
      baselineYears: e.baseline_years,
      pts,
    });
  }

  const svgWrap = rootEl.querySelector('[data-scatter-svg]');
  const playBtn = rootEl.querySelector('[data-scatter-play]');
  const resetBtn = rootEl.querySelector('[data-scatter-reset]');
  const progressEl = rootEl.querySelector('[data-scatter-progress]');
  const eventBtns = Array.from(rootEl.querySelectorAll('[data-scatter-event]'));

  const DURATION_MS = 6600;  // total trace duration, irrespective of n_points

  let currentYear = '2019';
  // animation handles for the currently-mounted panel
  let anim = null;

  // Cancel any in-flight animation cleanly so setEvent / reset / unmount don't
  // leak rAF callbacks or fight with a fresh build.
  function cancelAnim() {
    if (anim && anim.rafId) cancelAnimationFrame(anim.rafId);
    if (anim) anim.rafId = null;
  }

  function setPlayLabel(label, pressed) {
    playBtn.textContent = label;
    playBtn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  }

  function setEvent(year) {
    cancelAnim();
    currentYear = year;
    eventBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.scatterEvent === year ? 'true' : 'false'));
    setPlayLabel('▶ Play', false);
    build();
    if (reducedMotion) {
      // Full path drawn statically; no auto-play.
      seek(1);
    } else {
      seek(0);
    }
  }

  function build() {
    const ev = eventsByYear.get(currentYear);
    if (!ev) return;
    const pts = ev.pts;

    clear(svgWrap);

    const W = 720, H = 360;
    const M = { top: 28, right: 28, bottom: 60, left: 64 };
    const innerW = W - M.left - M.right;
    const innerH = H - M.top - M.bottom;

    const tempExtent = d3.extent(pts, p => p.tavg);
    const x = d3.scaleLinear()
      .domain([Math.floor(tempExtent[0] - 1), Math.ceil(tempExtent[1] + 1)])
      .range([0, innerW]);
    const y = d3.scaleLinear()
      .domain([0, d3.max(pts, p => p.n) * 1.08]).nice()
      .range([innerH, 0]);

    const svg = d3.select(svgWrap).append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')
      .attr('aria-label', `Connected scatter for ${ev.event}: daily average temperature versus daily incident count, traced in date order`);
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    g.append('g').selectAll('line.gx')
      .data(y.ticks(5)).join('line').attr('class', 'gx')
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', d => y(d)).attr('y2', d => y(d))
        .attr('stroke', t.rule).attr('stroke-dasharray', '2 3');

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(d => `${d}°`).tickSizeOuter(0))
      .call(s => styleAxis(s, t.ink3));
    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(FMT_INT).tickSizeOuter(0))
      .call(s => styleAxis(s, t.ink3));

    g.append('text')
      .attr('x', innerW / 2).attr('y', innerH + 40)
      .attr('text-anchor', 'middle')
      .attr('fill', t.ink3)
      .attr('font-family', 'var(--mono)').attr('font-size', 10)
      .attr('letter-spacing', '0.14em')
      .text('DAILY AVERAGE TEMPERATURE (°C)');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -46).attr('x', -innerH / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', t.ink3)
      .attr('font-family', 'var(--mono)').attr('font-size', 10)
      .attr('letter-spacing', '0.14em')
      .text('INCIDENTS / DAY');

    const line = d3.line()
      .x(p => x(p.tavg)).y(p => y(p.n))
      .curve(d3.curveCatmullRom.alpha(0.5));

    // Full path drawn once; the dashoffset is what animates.
    const pathSel = g.append('path').datum(pts)
      .attr('fill', 'none')
      .attr('stroke', t.blizLine)
      .attr('stroke-width', 1.6)
      .attr('d', line);
    const pathNode = pathSel.node();
    const totalLen = pathNode.getTotalLength();
    pathSel
      .attr('stroke-dasharray', `${totalLen} ${totalLen}`)
      .attr('stroke-dashoffset', totalLen);

    // All dots placed once; opacity gates their reveal as the trace passes.
    // Hit-area = the visible dot; pointer-events follow reveal state so a
    // hover only registers once the trace has passed that day.
    const dotsSel = g.selectAll('circle.pt').data(pts).join('circle')
      .attr('class', 'pt')
      .attr('cx', p => x(p.tavg)).attr('cy', p => y(p.n))
      .attr('r', p => p.inEvent ? 5 : 3)
      .attr('fill', p => p.inEvent ? t.blizAccent : t.paper)
      .attr('stroke', p => p.inEvent ? t.blizAccent : t.ink3)
      .attr('stroke-width', 1.2)
      .attr('opacity', 0)
      .style('pointer-events', 'none')
      .style('cursor', 'pointer');

    // Tooltip overlay — DOM child of the mount so it can sit above the SVG
    // and follow the cursor in mount-local coordinates.
    let tooltip = rootEl.querySelector('.proto-tooltip');
    if (!tooltip) {
      tooltip = makeNode('div', { class: 'proto-tooltip' });
      rootEl.appendChild(tooltip);
    }

    function buildScatterTip(p) {
      clear(tooltip);
      const head = makeNode('div');
      head.appendChild(makeNode('b', {}, FMT_FULL(p.date)));
      if (p.inEvent) head.appendChild(document.createTextNode(' · event day'));
      tooltip.appendChild(head);

      const row = (lbl, val, valStyle) => {
        const r = makeNode('div', { class: 'tt-row' });
        r.appendChild(makeNode('span', { class: 'tt-lbl' }, lbl));
        r.appendChild(makeNode('span', valStyle ? { style: valStyle } : {}, val));
        tooltip.appendChild(r);
      };

      row('temperature', `${p.tavg.toFixed(1)} °C`);
      row('incidents', FMT_INT(p.n));
      row('baseline', p.base != null ? FMT_INT(Math.round(p.base)) : '—');
      if (p.base != null) {
        const delta = ((p.n - p.base) / p.base) * 100;
        row('vs baseline', FMT_PCT(delta), `color: ${delta < 0 ? t.blizAccent : t.ink}; font-weight: 600`);
      }
    }

    function moveTip(evt) {
      tooltip.classList.add('is-visible');
      const r = rootEl.getBoundingClientRect();
      const tw = tooltip.offsetWidth;
      let tx = evt.clientX - r.left + 14;
      let ty = evt.clientY - r.top + 14;
      if (tx + tw > r.width) tx = evt.clientX - r.left - tw - 14;
      tooltip.style.left = `${tx}px`;
      tooltip.style.top = `${ty}px`;
    }
    function hideTip() { tooltip.classList.remove('is-visible'); }

    dotsSel
      .on('mousemove', (evt, p) => { buildScatterTip(p); moveTip(evt); })
      .on('mouseleave', hideTip)
      .on('touchstart', (evt, p) => {
        evt.preventDefault();
        buildScatterTip(p);
        moveTip(evt.touches[0]);
      }, { passive: false })
      .on('touchmove', (evt, p) => {
        evt.preventDefault();
        buildScatterTip(p);
        moveTip(evt.touches[0]);
      }, { passive: false })
      .on('touchend', hideTip);

    // Head marker — circle plus readout text, both repositioned each frame.
    const headRing = g.append('circle')
      .attr('r', 7)
      .attr('fill', 'none')
      .attr('stroke', t.bliz5)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0);
    const headLabel = g.append('text')
      .attr('fill', t.bliz5)
      .attr('font-family', 'var(--mono)').attr('font-size', 11)
      .attr('font-weight', 600)
      .attr('opacity', 0);

    anim = {
      pts, pathNode, dotsSel, headRing, headLabel, x, y, totalLen,
      progress: 0, playing: false, rafId: null, startedAt: 0, startedFrom: 0,
    };
  }

  // Seek to a fixed progress [0..1] without animating. Used for reset, paused
  // states, reduced-motion full-path render, and as the per-frame writer.
  function seek(progress) {
    if (!anim) return;
    progress = Math.max(0, Math.min(1, progress));
    anim.progress = progress;

    const { pathNode, dotsSel, headRing, headLabel, pts, x, y, totalLen } = anim;
    pathNode.setAttribute('stroke-dashoffset', totalLen * (1 - progress));

    // Reveal dots whose position-in-sequence has been passed; the same gate
    // enables pointer-events so hover only fires on visible points.
    dotsSel.each(function (_d, i) {
      const revealed = i / Math.max(1, pts.length - 1) <= progress;
      this.setAttribute('opacity', revealed ? 1 : 0);
      this.style.pointerEvents = revealed ? 'auto' : 'none';
    });

    // Head sits along the path itself for smoothness; readout uses the
    // nearest scheduled data point so the text stays meaningful.
    if (progress <= 0) {
      headRing.attr('opacity', 0);
      headLabel.attr('opacity', 0);
    } else {
      const pt = pathNode.getPointAtLength(totalLen * progress);
      headRing.attr('cx', pt.x).attr('cy', pt.y).attr('opacity', 1);
      const idx = Math.min(pts.length - 1, Math.round(progress * (pts.length - 1)));
      const d = pts[idx];
      headLabel
        .attr('x', pt.x + 10).attr('y', pt.y - 8)
        .attr('opacity', 1)
        .text(`${FMT_DAY(d.date)} · ${d.tavg.toFixed(1)}°C · ${FMT_INT(d.n)}`);
    }

    if (progressEl) progressEl.style.width = `${progress * 100}%`;
  }

  // Smoothstep easing — gentle in, gentle out, steady middle. Reads as "glide".
  const ease = (u) => u * u * (3 - 2 * u);

  function tick(now) {
    if (!anim) return;
    const elapsed = now - anim.startedAt;
    const localT = Math.min(1, elapsed / (DURATION_MS * (1 - anim.startedFrom)));
    const progress = anim.startedFrom + (1 - anim.startedFrom) * ease(localT);
    seek(progress);
    if (localT < 1) {
      anim.rafId = requestAnimationFrame(tick);
    } else {
      anim.playing = false;
      anim.rafId = null;
      setPlayLabel('↻ Replay', false);
    }
  }

  function play() {
    if (!anim) return;
    if (anim.progress >= 1) anim.progress = 0;
    if (anim.playing) return;
    anim.playing = true;
    anim.startedAt = performance.now();
    anim.startedFrom = anim.progress;
    setPlayLabel('❚❚ Pause', true);
    anim.rafId = requestAnimationFrame(tick);
  }
  function pause() {
    if (!anim || !anim.playing) return;
    cancelAnim();
    anim.playing = false;
    setPlayLabel('▶ Resume', false);
  }
  function reset() {
    cancelAnim();
    if (!anim) return;
    anim.playing = false;
    setPlayLabel('▶ Play', false);
    seek(0);
  }

  eventBtns.forEach(b => {
    b.addEventListener('click', () => setEvent(b.dataset.scatterEvent));
  });
  playBtn.addEventListener('click', () => (anim && anim.playing ? pause() : play()));
  resetBtn.addEventListener('click', reset);

  setEvent(currentYear);
}

// ─────────────────────────────────────────────────────────────────────────
// Calendar heatmap with hover
// Scope: the existing event windows from insights_blizzards.json (~25–37 days
// per event). A 25-year calendar would dwarf the story; these windows are
// already the right unit, and the troughs dominate the visual.
// Color: shared sequential blue (darker = quieter day) across all panels —
// honest cross-event comparison.
// ─────────────────────────────────────────────────────────────────────────
// Build the per-event day arrays + the shared color scale once, so legacy
// prototype mount and per-event article mounts both use identical encoding.
function buildTempScaleAndEvents(blizzards, temperature, scope) {
  const t = tokens(scope);
  const tempByDate = new Map(temperature.daily.map(d => [d.date, d]));

  const events = blizzards.events.map(e => {
    const days = e.window.map(d => {
      const dt = PARSE(d.date);
      const tr = tempByDate.get(d.date);
      const inEvent = d.date >= e.event_start && d.date <= e.event_end;
      return {
        date: dt,
        dateStr: d.date,
        tavg: tr ? tr.tavg : null,
        tmin: tr ? tr.tmin : null,
        tmax: tr ? tr.tmax : null,
        inEvent,
      };
    });
    return { event: e.event, short: e.event_start.slice(0, 4), days };
  });

  const allTavg = events.flatMap(e => e.days.map(d => d.tavg)).filter(v => v != null);
  const tMin = d3.min(allTavg);
  const tMax = d3.max(allTavg);

  // Light-to-medium blue ramp. Use d3.interpolateBlues clamped to a sub-range
  // that skips both the near-white bottom (t≈0) and the near-black navy top
  // (t≈1). Result: warm days = pale wash, cold days = saturated mid blue.
  // No black at either end; the page reads as a "cold wash" with depth.
  const RAMP_MIN = 0.12;  // skip the near-paper white
  const RAMP_MAX = 0.72;  // stop short of navy/black
  const blues = (u) => d3.interpolateBlues(RAMP_MIN + u * (RAMP_MAX - RAMP_MIN));

  // domain = [tMax, tMin] so HIGH tavg → u=0 → pale, LOW tavg → u=1 → mid blue.
  const color = d3.scaleSequential().domain([tMax, tMin]).interpolator(blues);

  // Cells never reach a dark shade; ink text is legible on every cell, so
  // we drop the dynamic per-cell text switch.
  const textThreshold = tMin - 1;  // never trips; left for API stability

  // Pre-resolved gradient stops for the legend swatch.
  const cPale = blues(0);
  const cMid  = blues(0.5);
  const cDeep = blues(1);

  return { events, tMin, tMax, color, c1: cPale, c3: cMid, c5: cDeep, textThreshold, t };
}

// Render exactly one event's calendar panel into a host element. Hosts may
// be a flex item in the legacy prototype mount, or an .insight-aside in the
// article margin. The tooltip is appended into hostEl so it positions in
// host-local coordinates.
function renderOneCalendarPanel(hostEl, ev, scale, opts = {}) {
  const { t, color, textThreshold } = scale;

  // Each panel owns its tooltip so positioning math stays simple.
  let tooltip = hostEl.querySelector(':scope > .proto-tooltip');
  if (!tooltip) {
    tooltip = makeNode('div', { class: 'proto-tooltip' });
    hostEl.appendChild(tooltip);
  }

  function buildTip(d) {
    clear(tooltip);
    const head = makeNode('div');
    head.appendChild(makeNode('b', {}, FMT_FULL(d.date)));
    if (d.inEvent) head.appendChild(document.createTextNode(' · event day'));
    tooltip.appendChild(head);

    const row = (lbl, val) => {
      const r = makeNode('div', { class: 'tt-row' });
      r.appendChild(makeNode('span', { class: 'tt-lbl' }, lbl));
      r.appendChild(makeNode('span', {}, val));
      tooltip.appendChild(r);
    };
    row('avg temp', d.tavg != null ? `${d.tavg.toFixed(1)} °C` : '—');
    row('min', d.tmin != null ? `${d.tmin.toFixed(1)} °C` : '—');
    row('max', d.tmax != null ? `${d.tmax.toFixed(1)} °C` : '—');
  }

  function moveTip(evt) {
    tooltip.classList.add('is-visible');
    const r = hostEl.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    let x = evt.clientX - r.left + 14;
    let y = evt.clientY - r.top + 14;
    if (x + tw > r.width) x = evt.clientX - r.left - tw - 14;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }
  function hideTip() { tooltip.classList.remove('is-visible'); }

  const cell = opts.cell ?? 22;
  const cellGap = 2;
  const cols = 7;
  const gridW = cell * cols + cellGap * (cols - 1);
  const headerH = 18;
  const panelPad = 8;
  const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const first = ev.days[0].date;
  const lead = (first.getDay() + 6) % 7;
  const weeks = Math.ceil((lead + ev.days.length) / 7);
  const gridH = weeks * cell + (weeks - 1) * cellGap;
  const W = gridW + panelPad * 2;
  const H = headerH + gridH + panelPad * 2;

  const svg = d3.select(hostEl).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', `Temperature calendar for ${ev.event}: days colored by daily average temperature on a blue scale; deeper blue means a colder day`)
    .style('width', '100%')
    .style('height', 'auto')
    .style('display', 'block');

  const g = svg.append('g').attr('transform', `translate(${panelPad},${panelPad})`);

  weekdayLabels.forEach((wd, i) => {
    g.append('text')
      .attr('x', i * (cell + cellGap) + cell / 2).attr('y', headerH - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', t.ink3)
      .attr('font-family', 'var(--mono)').attr('font-size', 9)
      .attr('letter-spacing', '0.06em')
      .text(wd);
  });

  ev.days.forEach((d, i) => {
    const slot = lead + i;
    const col = slot % 7;
    const row = Math.floor(slot / 7);
    const cx = col * (cell + cellGap);
    const cy = headerH + row * (cell + cellGap);
    const fill = d.tavg != null ? color(d.tavg) : t.paper2;

    const rect = g.append('rect')
      .attr('x', cx).attr('y', cy)
      .attr('width', cell).attr('height', cell)
      .attr('fill', fill)
      .attr('stroke', d.inEvent ? t.bliz5 : 'none')
      .attr('stroke-width', d.inEvent ? 2 : 0)
      .style('cursor', 'pointer');

    g.append('text')
      .attr('x', cx + cell - 3).attr('y', cy + 9)
      .attr('text-anchor', 'end')
      .attr('fill', d.tavg != null && d.tavg < textThreshold ? t.paper : t.ink)
      .attr('font-family', 'var(--mono)').attr('font-size', 8)
      .attr('pointer-events', 'none')
      .text(d.date.getDate());

    const onEnter = (evt) => {
      buildTip(d);
      moveTip(evt);
      rect.attr('stroke', t.bliz5).attr('stroke-width', d.inEvent ? 2 : 1.5);
    };
    const onLeave = () => {
      hideTip();
      rect.attr('stroke', d.inEvent ? t.bliz5 : 'none').attr('stroke-width', d.inEvent ? 2 : 0);
    };

    rect.on('mousemove', onEnter)
        .on('mouseleave', onLeave)
        .on('touchstart', (e) => { e.preventDefault(); onEnter(e.touches[0]); }, { passive: false })
        .on('touchmove',  (e) => { e.preventDefault(); onEnter(e.touches[0]); }, { passive: false })
        .on('touchend', onLeave);
  });
}

// Legacy prototype mount: three panels side by side in a single container,
// with a shared legend bar underneath.
function renderTemperatureCalendar(rootEl, blizzards, temperature) {
  const scope = findScope(rootEl);
  clear(rootEl);
  const scale = buildTempScaleAndEvents(blizzards, temperature, scope);
  const { events, tMin, tMax, c1, c3, c5, t } = scale;

  const wrap = d3.select(rootEl).append('div')
    .style('display', 'flex')
    .style('flex-wrap', 'wrap')
    .style('gap', '20px')
    .style('align-items', 'flex-start');

  events.forEach(ev => {
    const panel = wrap.append('div')
      .style('width', '200px')
      .style('position', 'relative')
      .node();

    const head = makeNode('div', {
      style: `font-family: var(--mono); font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: ${t.ink}; padding-bottom: 4px;`,
    }, `${ev.short} · ${ev.event.replace(`${ev.short} `, '')}`);
    panel.appendChild(head);

    renderOneCalendarPanel(panel, ev, scale);
  });

  // Shared legend below the panel row — single gradient + the bracketed
  // domain so the encoding is unambiguous everywhere.
  const legend = wrap.append('div')
    .style('flex', '1 1 100%')
    .style('display', 'flex')
    .style('align-items', 'center')
    .style('gap', '12px')
    .style('font-family', 'var(--mono)')
    .style('font-size', '10px')
    .style('letter-spacing', '0.12em')
    .style('text-transform', 'uppercase')
    .style('color', t.ink3)
    .style('margin-top', '8px');

  legend.append('span').text(`${tMin.toFixed(1)} °C`);
  const swatch = legend.append('div')
    .style('width', '180px')
    .style('height', '10px')
    .style('border', `1px solid ${t.rule}`);
  // Linear-gradient via inline style, mapping deep → light from left → right
  // matches the cell encoding when read with the labels.
  swatch.style('background', `linear-gradient(to right, ${c5}, ${c3}, ${c1})`);
  legend.append('span').text(`${tMax.toFixed(1)} °C`);
  legend.append('span')
    .style('text-transform', 'none')
    .style('letter-spacing', '0.04em')
    .text('· deeper blue = colder · ring = event day · hover for tmin/tavg/tmax');
}

// ─────────────────────────────────────────────────────────────────────────
// By-type sorted horizontal bar chart
// One bar per robust type. Each bar shows the AVERAGE % change vs baseline
// across the three events (mean of three deltas). One bar per type chosen
// over grouped bars because the story is a hierarchy — narcotics collapses
// hardest, battery holds best — and a single sorted axis reads it in one
// glance. The deck note states it's an average across events.
// ─────────────────────────────────────────────────────────────────────────
function renderByType(rootEl, byType) {
  const t = tokens(findScope(rootEl));
  clear(rootEl);

  const events = byType.events;

  // For each robust type, gather the per-event deltas and average them.
  const rows = ROBUST_TYPES.map(typeName => {
    const deltas = events.map(e => {
      const r = e.by_type.find(x => x.type === typeName);
      return r ? r.delta_pct : null;
    }).filter(v => v != null);
    return {
      type: typeName,
      avg: d3.mean(deltas),
      perEvent: events.map(e => {
        const r = e.by_type.find(x => x.type === typeName);
        return {
          year: e.event_window[0].slice(0, 4),
          delta: r ? r.delta_pct : null,
        };
      }),
    };
  }).sort((a, b) => a.avg - b.avg);  // most negative first → top of chart

  const W = 960, H = 380;
  const M = { top: 24, right: 120, bottom: 64, left: 170 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const xMin = Math.floor(d3.min(rows, r => r.avg) / 10) * 10 - 5;
  const x = d3.scaleLinear().domain([xMin, 0]).range([0, innerW]);
  const y = d3.scaleBand()
    .domain(rows.map(r => r.type))
    .range([0, innerH])
    .padding(0.28);

  const svg = d3.select(rootEl).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', 'Average percent change versus baseline by primary crime type, averaged across the three blizzard events (Feb 2011, Jan 2014, Jan 2019), each compared with the mean of the two adjacent years; sorted from biggest drop to smallest');
  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  // Vertical grid at every 10%, with the zero line strongest.
  const ticks = x.ticks(Math.max(4, Math.round(-xMin / 15)));
  g.append('g').selectAll('line.grid')
    .data(ticks).join('line').attr('class', 'grid')
      .attr('x1', d => x(d)).attr('x2', d => x(d))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', d => d === 0 ? t.ink : t.rule)
      .attr('stroke-width', d => d === 0 ? 1.2 : 1)
      .attr('stroke-dasharray', d => d === 0 ? null : '2 3');

  // x-axis at top of plot so the % scale reads above the bars.
  g.append('g')
    .call(d3.axisTop(x).tickValues(ticks).tickFormat(d => `${d}%`).tickSizeOuter(0))
    .call(s => styleAxis(s, t.ink3));

  // Type labels on the left.
  g.append('g')
    .call(d3.axisLeft(y).tickSize(0).tickPadding(10))
    .call(s => {
      s.selectAll('path').remove();
      s.selectAll('text')
        .attr('fill', t.ink)
        .attr('font-family', 'var(--mono)')
        .attr('font-size', 12);
    });

  // The bars themselves: from x(0) leftward to x(avg). Single fill — blue
  // chart palette accent — so the eye reads magnitude, not category color.
  g.selectAll('rect.bar').data(rows).join('rect')
    .attr('class', 'bar')
    .attr('y', d => y(d.type))
    .attr('height', y.bandwidth())
    .attr('x', d => x(d.avg))
    .attr('width', d => x(0) - x(d.avg))
    .attr('fill', t.blizAccent);

  // Value labels at the left edge of each bar.
  g.selectAll('text.val').data(rows).join('text')
    .attr('class', 'val')
    .attr('x', d => x(d.avg) - 8)
    .attr('y', d => y(d.type) + y.bandwidth() / 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'central')
    .attr('fill', t.blizAccent)
    .attr('font-family', 'var(--mono)').attr('font-size', 12)
    .attr('font-weight', 600)
    .text(d => FMT_PCT(d.avg));

  // Footer note: spells out the three events by name and date and how the
  // baseline is built, so readers don't conflate "one bar" with "one event"
  // or wonder what "baseline" refers to.
  g.append('text')
    .attr('x', 0).attr('y', innerH + 28)
    .attr('fill', t.ink3)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.08em')
    .text('Average of three event deltas — Feb 2011 (Snowmageddon) · Jan 2014 (polar vortex) · Jan 2019 (polar vortex).');
  g.append('text')
    .attr('x', 0).attr('y', innerH + 46)
    .attr('fill', t.ink3)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.08em')
    .text('Each event = same calendar dates vs the mean of the two adjacent years (e.g. 2014 vs avg of 2013 + 2015). Robust types only (baseline ≥ ~100 / yr).');
}

// ─────────────────────────────────────────────────────────────────────────
// Snap-back small multiples (blue palette)
// ─────────────────────────────────────────────────────────────────────────
function renderSnapback(rootEl, wide) {
  const t = tokens(findScope(rootEl));
  clear(rootEl);

  // Bumped H from 320 → 380 to give the legend its own row below the panels
  // (was colliding when crammed onto a single line at H-12).
  const W = 960, H = 380;
  const M = { top: 28, right: 24, bottom: 96, left: 56 };
  const panelGap = 24;
  const panelW = (W - M.left - M.right - 2 * panelGap) / 3;
  const innerH = H - M.top - M.bottom;

  const events = wide.events.map(e => {
    const actual = e.actual.map(a => ({ ...a, date: PARSE(a.date) }));
    const baseMap = new Map(e.baseline.map(b => [b.offset, b.n_avg]));
    const merged = actual.map(a => ({ ...a, base: baseMap.get(a.offset) ?? null }));
    return {
      event: e.event,
      short: e.event_start.slice(0, 4),
      eventStart: PARSE(e.event_start),
      eventEnd: PARSE(e.event_end),
      merged,
    };
  });

  const allN = events.flatMap(e => e.merged.flatMap(d => [d.n, d.base]).filter(v => v != null));
  const yMax = d3.max(allN) * 1.05;
  const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]);

  const svg = d3.select(rootEl).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', 'Daily incident counts from seven days before each blizzard to fourteen days after, against the adjacent-year baseline');

  events.forEach((ev, i) => {
    const panel = svg.append('g').attr('transform', `translate(${M.left + i * (panelW + panelGap)},${M.top})`);
    const x = d3.scaleLinear().domain([-7, 14]).range([0, panelW]);

    panel.append('g').selectAll('line.grid')
      .data(y.ticks(4)).join('line').attr('class', 'grid')
        .attr('x1', 0).attr('x2', panelW)
        .attr('y1', d => y(d)).attr('y2', d => y(d))
        .attr('stroke', t.rule).attr('stroke-dasharray', '2 3');

    const dayCount = Math.round((ev.eventEnd - ev.eventStart) / 86400000);
    panel.append('rect')
      .attr('x', x(0)).attr('y', 0)
      .attr('width', x(dayCount + 1) - x(0)).attr('height', innerH)
      .attr('fill', t.blizSoft);

    panel.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickValues([-7, 0, 7, 14]).tickFormat(d => `${d > 0 ? '+' : ''}${d}d`).tickSizeOuter(0))
      .call(s => styleAxis(s, t.ink3));

    if (i === 0) {
      panel.append('g')
        .call(d3.axisLeft(y).ticks(4).tickFormat(FMT_INT).tickSizeOuter(0))
        .call(s => styleAxis(s, t.ink3));
    }

    const baseLine = d3.line()
      .defined(d => d.base != null)
      .x(d => x(d.offset)).y(d => y(d.base));
    const actLine = d3.line()
      .x(d => x(d.offset)).y(d => y(d.n));

    // Baseline reads as quiet context; actual is the load-bearing line.
    panel.append('path').datum(ev.merged)
      .attr('fill', 'none').attr('stroke', t.ink4).attr('stroke-width', 1)
      .attr('stroke-dasharray', '5 4')
      .attr('d', baseLine);

    panel.append('path').datum(ev.merged)
      .attr('fill', 'none').attr('stroke', t.blizAccent).attr('stroke-width', 2.8)
      .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
      .attr('d', actLine);

    panel.append('text')
      .attr('x', 0).attr('y', -10)
      .attr('fill', t.ink)
      .attr('font-family', 'var(--mono)').attr('font-size', 12)
      .text(ev.short);

    panel.append('text')
      .attr('x', panelW / 2).attr('y', innerH + 32)
      .attr('text-anchor', 'middle')
      .attr('fill', t.ink3)
      .attr('font-family', 'var(--mono)').attr('font-size', 10)
      .attr('letter-spacing', '0.14em')
      .text('OFFSET DAYS');
  });

  // Legend gets its own row well below the panels. Three entries on one
  // line with explicit spacing so the long baseline label has room.
  const legY = H - 56;
  const legend = svg.append('g').attr('transform', `translate(${M.left},${legY})`);

  // 1 · actual
  legend.append('line').attr('x1', 0).attr('x2', 26).attr('y1', 0).attr('y2', 0)
    .attr('stroke', t.blizAccent).attr('stroke-width', 2.8)
    .attr('stroke-linecap', 'round');
  legend.append('text').attr('x', 34).attr('y', 4)
    .attr('fill', t.ink2).attr('font-family', 'var(--mono)').attr('font-size', 11)
    .text('actual');

  // 2 · baseline (longer label — generous space ahead of next item)
  legend.append('line').attr('x1', 120).attr('x2', 146).attr('y1', 0).attr('y2', 0)
    .attr('stroke', t.ink4).attr('stroke-width', 1).attr('stroke-dasharray', '5 4');
  legend.append('text').attr('x', 154).attr('y', 4)
    .attr('fill', t.ink2).attr('font-family', 'var(--mono)').attr('font-size', 11)
    .text('adjacent-year baseline');

  // 3 · event-day band
  legend.append('rect').attr('x', 400).attr('y', -7).attr('width', 26).attr('height', 14)
    .attr('fill', t.blizSoft);
  legend.append('text').attr('x', 434).attr('y', 4)
    .attr('fill', t.ink2).attr('font-family', 'var(--mono)').attr('font-size', 11)
    .text('event day(s)');

  // Second line: clarifies what the baseline mean is, so the chart stays
  // honest without crowding the line above.
  svg.append('text')
    .attr('x', M.left).attr('y', H - 28)
    .attr('fill', t.ink3).attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.06em')
    .text('Baseline = same calendar offset, year before and year after each event, averaged');
}

// Per-event article mounts. One small calendar panel per blizzard, dropped
// into the margin next to its section. Idempotent: any mount not present is
// skipped; mount presence is a no-op.
function renderPerEventCalendars(blizzards, temperature) {
  const probeScope = document.querySelector('.bliz-charts') || document.documentElement;
  const scale = buildTempScaleAndEvents(blizzards, temperature, probeScope);
  scale.events.forEach(ev => {
    const mount = document.getElementById(`insight-chart-bliz-cal-${ev.short}`);
    if (!mount) return;
    clear(mount);
    mount.style.position = 'relative';
    renderOneCalendarPanel(mount, ev, scale, { cell: 24 });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────
// Isolate each chart's render so an exception in one cannot prevent the
// rest from drawing. Failures are logged with the chart name; the rest of
// the article keeps rendering.
function safe(name, fn) {
  try { fn(); }
  catch (err) { console.error(`blizzards chart "${name}" failed to render:`, err); }
}

export function renderBlizzardsPrototypes({ blizzards, byType, wide, temperature }) {
  const dumb = document.getElementById('insight-chart-bliz-dumbbell');
  const scatter = document.getElementById('insight-chart-bliz-scatter');
  const calendar = document.getElementById('insight-chart-bliz-calendar-all');
  const byTypeEl = document.getElementById('insight-chart-bliz-bytype');
  const snap = document.getElementById('insight-chart-bliz-snapback');

  if (dumb)     safe('dumbbell',  () => renderDumbbell(dumb, blizzards));
  if (scatter)  safe('scatter',   () => renderConnectedScatter(scatter, wide, temperature));
  if (calendar) safe('calendar-all', () => renderTemperatureCalendar(calendar, blizzards, temperature));
  if (byTypeEl) safe('by-type',   () => renderByType(byTypeEl, byType));
  if (snap)     safe('snap-back', () => renderSnapback(snap, wide));

  safe('per-event-calendars', () => renderPerEventCalendars(blizzards, temperature));
}
