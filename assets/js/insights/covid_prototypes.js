import * as d3 from 'd3';

const PARSE_D = d3.timeParse('%Y-%m-%d');
const FMT_DATE = d3.timeFormat('%b %-d');
const FMT_FULL = d3.timeFormat('%a %b %-d, %Y');
const FMT_INT = d3.format(',');
const FMT_DELTA = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(0)}%`;

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    ink: v('--ink'),
    ink2: v('--ink-2'),
    ink3: v('--ink-3'),
    ink4: v('--ink-4') || v('--ink-3'),
    rule: v('--rule'),
    paper: v('--paper'),
    paper2: v('--paper-2') || v('--paper'),
    accent: v('--accent'),
    accentSoft: v('--accent-soft') || v('--accent'),
  };
}

function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
function styleAxis(sel, color) {
  sel.selectAll('path,line').attr('stroke', color);
  sel.selectAll('text').attr('fill', color).attr('font-family', 'var(--mono)').attr('font-size', 11);
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

// Pure helper: align baseline_1819 onto the 2020 daily series via day-of-year.
function alignedBaseline(covid) {
  const series = covid.series_2020.map(d => ({ date: PARSE_D(d.date), n: d.n }));
  const baseByDoy = new Map(covid.baseline_1819.map(b => [b.doy, b.n_avg]));
  const epoch = new Date(2020, 0, 1);
  return series.map(d => {
    const doy = d3.timeDay.count(epoch, d.date);
    return { date: d.date, n: d.n, base: baseByDoy.get(doy) ?? null };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// B · ANIMATED FLOYD ZOOM
// One chart, three acts:
//   1 — wide view (Feb → Dec 2020) shows the lockdown trough as context
//   2 — x-domain smoothstep-zooms in to May 25 → Jun 5; y rescales to the
//       new window, so the spike grows out of the trough as the frame
//       tightens (the animation IS the story: spike erupts from low base)
//   3 — verified annotations fade in one by one (May 30 → May 31 → Jun 1),
//       staggered in y so labels don't collide; hover scrub enables
// Replay button restarts the sequence; prefers-reduced-motion jumps to
// the resolved state with all annotations visible.
// ─────────────────────────────────────────────────────────────────────────
function renderFloydZoomAnimated(rootEl, covid) {
  const t = tokens();
  clear(rootEl);

  const allData = alignedBaseline(covid).filter(d => d.date >= PARSE_D('2020-02-15'));

  // Domains: wide context vs target spike window.
  const WIDE = [PARSE_D('2020-02-15'), PARSE_D('2020-12-31')];
  const ZOOM = [PARSE_D('2020-05-25'), PARSE_D('2020-06-05')];

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const W = 960, H = 460;
  // Top margin is generous so the zoomed-state event title can sit well
  // above the staggered day annotations without crowding them.
  const M = { top: 124, right: 28, bottom: 56, left: 56 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  // Controls strip — single primary button whose label adapts to state.
  // Initial: "▶ Discover what happened at the peak" (factual; no causal claim on
  // the crime data itself). After the animation: "↻ Replay".
  const controls = makeNode('div', { class: 'proto-controls' });
  const playBtn = makeNode('button', { type: 'button', class: 'proto-btn' }, '▶ Discover what happened at the peak');
  controls.appendChild(playBtn);
  const progress = makeNode('div', { class: 'proto-progress' });
  const progressFill = makeNode('div', { class: 'proto-progress__fill', style: 'width: 0%' });
  progress.appendChild(progressFill);
  controls.appendChild(progress);
  rootEl.appendChild(controls);

  const svgWrap = makeNode('div');
  rootEl.appendChild(svgWrap);

  const svg = d3.select(svgWrap).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', 'Animated zoom from the 2020 lockdown context into the May 30 to June 5 spike, with verified annotations');

  // Clip path so paths outside the visible x-domain don't bleed.
  svg.append('defs').append('clipPath').attr('id', 'covid-zoom-clip')
    .append('rect').attr('width', innerW).attr('height', innerH);

  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  const x = d3.scaleTime().domain(WIDE).range([0, innerW]);
  const y = d3.scaleLinear().domain([0, d3.max(allData, d => Math.max(d.n, d.base ?? 0)) * 1.05]).range([innerH, 0]);

  // Grid (redrawn on each y rescale).
  const gridG = g.append('g').attr('class', 'grid');

  // Axes (redrawn each frame as scales change).
  const xAxisG = g.append('g').attr('transform', `translate(0,${innerH})`);
  const yAxisG = g.append('g');

  // Y-axis label
  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -42).attr('x', -innerH / 2)
    .attr('text-anchor', 'middle')
    .attr('fill', t.ink3)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.14em')
    .text('INCIDENTS / DAY');

  // Data layers (inside clip so paths don't bleed outside the plot area).
  const dataLayer = g.append('g').attr('clip-path', 'url(#covid-zoom-clip)');

  // --- LOCKDOWN BAND ---
  // Rectangle sits inside the clipped data layer; its label lives ABOVE
  // the plot (in the top margin) so it can't crowd the play-button strip
  // or the peak label inside the chart.
  const LOCK_START = PARSE_D('2020-03-21');
  const LOCK_END   = PARSE_D('2020-05-01');
  const LOCK_DROP_PCT = Math.round(covid.lockdown_drop_pct);  // verified value from data
  const lockBand = dataLayer.append('rect')
    .attr('y', 0).attr('height', innerH)
    .attr('fill', t.ink2).attr('opacity', 0.16);

  const baseArea = d3.area()
    .defined(d => d.base != null)
    .x(d => x(d.date)).y0(innerH).y1(d => y(d.base));
  const baseLine = d3.line()
    .defined(d => d.base != null)
    .x(d => x(d.date)).y(d => y(d.base));
  const line2020 = d3.line()
    .x(d => x(d.date)).y(d => y(d.n));

  // Below-baseline fill (lockdown trough): the visual subject of the card.
  // Ink-filled area where 2020 sits under the baseline curve.
  const belowFill = d3.area()
    .defined(d => d.base != null && d.n < d.base)
    .x(d => x(d.date))
    .y0(d => y(d.base))
    .y1(d => y(d.n));
  // Above-baseline fill (Floyd spike etc.).
  const aboveFill = d3.area()
    .defined(d => d.base != null && d.n > d.base)
    .x(d => x(d.date))
    .y0(d => y(d.base))
    .y1(d => y(d.n));

  const baseAreaPath = dataLayer.append('path').datum(allData)
    .attr('fill', t.ink4).attr('opacity', 0.14);
  // Trough fill carries the main narrative weight of this card: it is the
  // 6-week lockdown drop. Strong enough to read as a primary feature
  // alongside the Floyd spike (without rescaling the data).
  const belowFillPath = dataLayer.append('path').datum(allData)
    .attr('fill', t.ink).attr('opacity', 0.34);
  const aboveFillPath = dataLayer.append('path').datum(allData)
    .attr('fill', t.accent).attr('opacity', 0.32);
  const baseLinePath = dataLayer.append('path').datum(allData)
    .attr('fill', 'none').attr('stroke', t.ink3).attr('stroke-width', 1)
    .attr('stroke-dasharray', '3 3');
  const linePath = dataLayer.append('path').datum(allData)
    .attr('fill', 'none').attr('stroke', t.accent).attr('stroke-width', 2.4)
    .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
  const dotsG = dataLayer.append('g');

  // Wide-view labels — laid out in the M.top margin space ABOVE the plot
  // so they can't crowd the play-button strip (which sits outside the SVG)
  // or each other. Two horizontal lanes:
  //   y = -56  ── lockdown band label + verified ≈−38% annotation
  //   y = -22  ── May 31 peak label, with a leader line down to the spike
  // The lockdown label is anchored over the centre of the band; the peak
  // label is anchored over the spike. The two regions are far apart in x
  // on the wide view (lockdown is ~Mar/Apr, spike is May 31), so the two
  // labels never overlap horizontally either.
  // Wide-state label lanes. Sit comfortably inside the bigger top margin
  // so they don't crowd the play-button strip above the SVG.
  const LANE_LOCK = -82;
  const LANE_PEAK = -38;

  // Lockdown label group (above plot).
  const lockLabelG = g.append('g').attr('class', 'lockdown-label').attr('opacity', 1);
  const lockLabelMain = lockLabelG.append('text')
    .attr('y', LANE_LOCK)
    .attr('text-anchor', 'middle')
    .attr('fill', t.ink)
    .attr('font-family', 'var(--mono)').attr('font-size', 11)
    .attr('font-weight', 700)
    .attr('letter-spacing', '0.12em')
    .text('STAY-AT-HOME · 6 WEEKS');
  const lockLabelStat = lockLabelG.append('text')
    .attr('y', LANE_LOCK + 14)
    .attr('text-anchor', 'middle')
    .attr('fill', t.ink2)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.06em')
    .text(`≈ ${FMT_DELTA(LOCK_DROP_PCT)} vs the 2018-19 baseline`);
  // Vertical leader lines at the lockdown band edges, helping the eye tie
  // the label above the plot to the shaded region inside.
  const lockLeaderL = lockLabelG.append('line')
    .attr('stroke', t.ink3).attr('stroke-width', 1)
    .attr('stroke-dasharray', '2 3');
  const lockLeaderR = lockLabelG.append('line')
    .attr('stroke', t.ink3).attr('stroke-width', 1)
    .attr('stroke-dasharray', '2 3');

  // Centred large stat INSIDE the band itself, so the trough is also
  // labelled in-place — at first glance you see ink trough + a "≈ −38%"
  // landmark sitting on top of it.
  const lockInBandStat = dataLayer.append('text')
    .attr('text-anchor', 'middle')
    .attr('fill', t.ink)
    .attr('font-family', 'var(--mono)').attr('font-size', 22)
    .attr('font-weight', 700)
    .attr('opacity', 0.55)
    .text(`${FMT_DELTA(LOCK_DROP_PCT)}`);

  // Wide-view peak label — leader line + paper-backed text, ABOVE the plot
  // in the second lane so it can't collide with the lockdown labels.
  const peakLabelG = g.append('g').attr('class', 'peak-label').attr('opacity', 1);
  const peakLabelLeader = peakLabelG.append('line')
    .attr('stroke', t.accent).attr('stroke-width', 1.2);
  const peakLabelDot = peakLabelG.append('circle')
    .attr('r', 3.5).attr('fill', t.accent);
  const peakLabelBg = peakLabelG.append('rect')
    .attr('fill', t.paper).attr('opacity', 0.94);
  const peakLabelText = peakLabelG.append('text')
    .attr('y', LANE_PEAK)
    .attr('fill', t.accent)
    .attr('font-family', 'var(--mono)').attr('font-size', 11)
    .attr('font-weight', 700)
    .text(`May 31 · peak ${FMT_INT(covid.floyd_peak_n)} incidents`);

  // Zoomed-view event title — sits over the whole event window, names what
  // the period is. Frames the data as "crime rose during the unrest"
  // (the chart already shows the rise), NOT "the protests were criminal".
  // Visible only while state === 'zoomed'.
  const titleG = g.append('g').attr('class', 'event-title').attr('opacity', 0);
  const titleText = titleG.append('text')
    .attr('y', -104)
    .attr('text-anchor', 'middle')
    .attr('fill', t.ink)
    .attr('font-family', 'var(--mono)').attr('font-size', 12)
    .attr('font-weight', 700)
    .attr('letter-spacing', '0.10em')
    .text('UNREST AFTER GEORGE FLOYD’S DEATH');
  const titleRule = titleG.append('line')
    .attr('y1', -94).attr('y2', -94)
    .attr('stroke', t.ink).attr('stroke-width', 1);

  // Per-day annotations — staggered in TWO dimensions so the close-spaced
  // labels (May 30, 31, Jun 1) can never overlap:
  //   - x: anchor end / middle / start so each label extends into its own
  //     horizontal lane (left of May 30, centred on May 31, right of Jun 1)
  //   - y: peak (May 31) sits in its own upper lane; May 30 and Jun 1 share
  //     the lower lane but are well separated in x
  // Each label has a thin leader line from its baseline down to the data
  // point at the corresponding date.
  const ANNOT = [
    { date: '2020-05-30', label: 'May 30 · protests downtown, bridges raised', y: -34, anchor: 'end',    dx: -6 },
    { date: '2020-05-31', label: `May 31 · peak ${FMT_INT(covid.floyd_peak_n)} incidents`, y: -68, anchor: 'middle', dx: 0 },
    { date: '2020-06-01', label: 'Jun 1 · 9 pm city-wide curfew',              y: -34, anchor: 'start',  dx: 6 },
  ];
  const annotG = g.append('g').attr('class', 'annot');
  const annotNodes = ANNOT.map(a => {
    const d = PARSE_D(a.date);
    const grp = annotG.append('g').attr('opacity', 0);
    const ln = grp.append('line')
      .attr('y1', a.y + 6).attr('y2', innerH)
      .attr('stroke', t.ink2).attr('stroke-width', 1).attr('stroke-dasharray', '2 3');
    const tx = grp.append('text')
      .attr('y', a.y)
      .attr('text-anchor', a.anchor)
      .attr('fill', t.ink)
      .attr('font-family', 'var(--mono)').attr('font-size', 10)
      .attr('font-weight', 600)
      .text(a.label);
    return { d, grp, ln, tx, anchorOffset: a.dx };
  });

  // Hover scrub (enabled once the animation resolves).
  let tooltip = rootEl.querySelector('.proto-tooltip');
  if (!tooltip) {
    tooltip = makeNode('div', { class: 'proto-tooltip' });
    rootEl.appendChild(tooltip);
  }
  const guide = g.append('line')
    .attr('y1', 0).attr('y2', innerH)
    .attr('stroke', t.ink).attr('stroke-width', 1).attr('opacity', 0);
  const dotA = g.append('circle').attr('r', 5).attr('fill', t.accent).attr('stroke', t.paper).attr('stroke-width', 1.5).attr('opacity', 0);
  const dotB = g.append('circle').attr('r', 4).attr('fill', t.paper).attr('stroke', t.ink3).attr('stroke-width', 1.2).attr('opacity', 0);
  const bisect = d3.bisector(d => d.date).left;

  const hit = g.append('rect')
    .attr('width', innerW).attr('height', innerH)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair')
    .style('pointer-events', 'none');

  function showTip(d, evt) {
    clear(tooltip);
    tooltip.appendChild(makeNode('b', {}, FMT_FULL(d.date)));
    const row = (lbl, val, opt) => {
      const r = makeNode('div', { class: 'tt-row' });
      r.appendChild(makeNode('span', { class: 'tt-lbl' }, lbl));
      r.appendChild(makeNode('span', opt || {}, val));
      tooltip.appendChild(r);
    };
    row('2020', FMT_INT(d.n));
    row('baseline', d.base != null ? FMT_INT(Math.round(d.base)) : '—');
    if (d.base) {
      const delta = ((d.n - d.base) / d.base) * 100;
      row('vs baseline', FMT_DELTA(delta), { style: `color: ${delta >= 0 ? t.accent : t.ink2}; font-weight: 600` });
    }
    tooltip.classList.add('is-visible');
    const r = rootEl.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    let tx = evt.clientX - r.left + 14;
    let ty = evt.clientY - r.top + 14;
    if (tx + tw > r.width) tx = evt.clientX - r.left - tw - 14;
    tooltip.style.left = `${tx}px`;
    tooltip.style.top = `${ty}px`;
  }

  function hoverMove(evt) {
    const [mx] = d3.pointer(evt, g.node());
    const dt = x.invert(mx);
    const i = bisect(allData, dt);
    const a = allData[Math.max(0, i - 1)], b = allData[Math.min(allData.length - 1, i)];
    const d = !a ? b : !b ? a : (dt - a.date < b.date - dt ? a : b);
    if (!d) return;
    guide.attr('x1', x(d.date)).attr('x2', x(d.date)).attr('opacity', 1);
    dotA.attr('cx', x(d.date)).attr('cy', y(d.n)).attr('opacity', 1);
    if (d.base != null) dotB.attr('cx', x(d.date)).attr('cy', y(d.base)).attr('opacity', 1);
    showTip(d, evt);
  }
  function hoverLeave() {
    guide.attr('opacity', 0); dotA.attr('opacity', 0); dotB.attr('opacity', 0);
    tooltip.classList.remove('is-visible');
  }
  hit.on('mousemove', hoverMove).on('mouseleave', hoverLeave)
     .on('touchstart', (e) => { e.preventDefault(); hoverMove(e.touches[0]); }, { passive: false })
     .on('touchmove',  (e) => { e.preventDefault(); hoverMove(e.touches[0]); }, { passive: false })
     .on('touchend', hoverLeave);

  function redraw() {
    // y rescales to whatever is visible in the current x-domain — that's
    // what makes the spike "grow" as we zoom in: at wide view, the spike
    // is one tall pip in a chart dominated by the lockdown trough; at the
    // zoomed view, only the spike-window data sets the y scale, so the
    // spike fills the frame.
    const [xs, xe] = x.domain();
    const visible = allData.filter(d => d.date >= xs && d.date <= xe);
    const yMax = d3.max(visible, d => Math.max(d.n, d.base ?? 0)) * 1.08;
    y.domain([0, yMax]);

    baseAreaPath.attr('d', baseArea);
    belowFillPath.attr('d', belowFill);
    aboveFillPath.attr('d', aboveFill);
    baseLinePath.attr('d', baseLine);
    linePath.attr('d', line2020);

    // Lockdown band rect — clamp visible portion to the plot area.
    const lbx0 = Math.max(0, x(LOCK_START));
    const lbx1 = Math.min(innerW, x(LOCK_END));
    if (lbx1 > lbx0) {
      lockBand.attr('x', lbx0).attr('width', lbx1 - lbx0).style('display', null);
      const lbCx = (lbx0 + lbx1) / 2;
      // Lockdown label (above plot): centred on the visible band.
      lockLabelMain.attr('x', lbCx);
      lockLabelStat.attr('x', lbCx);
      // Leaders from the band edges up to the label baseline.
      lockLeaderL.attr('x1', lbx0).attr('x2', lbx0).attr('y1', 0).attr('y2', LANE_LOCK + 18);
      lockLeaderR.attr('x1', lbx1).attr('x2', lbx1).attr('y1', 0).attr('y2', LANE_LOCK + 18);
      // In-band stat: large landmark text sitting near the bottom of the
      // trough, centred horizontally in the band.
      lockInBandStat
        .attr('x', lbCx)
        .attr('y', innerH * 0.62)
        .style('display', null);
    } else {
      lockBand.style('display', 'none');
      lockLabelMain.attr('x', -9999);
      lockLabelStat.attr('x', -9999);
      lockLeaderL.attr('x1', -9999).attr('x2', -9999);
      lockLeaderR.attr('x1', -9999).attr('x2', -9999);
      lockInBandStat.style('display', 'none');
    }

    // Persistent peak label (wide view) — ABOVE the plot.
    // Leader goes from the spike data point up to the label baseline,
    // then offsets slightly so the text doesn't cap the spike directly.
    const peakDate = PARSE_D('2020-05-31');
    const peakN = covid.floyd_peak_n;
    const pxAt = x(peakDate);
    const pyAt = y(peakN);
    peakLabelDot.attr('cx', pxAt).attr('cy', pyAt);
    peakLabelLeader
      .attr('x1', pxAt).attr('y1', pyAt)
      .attr('x2', pxAt).attr('y2', LANE_PEAK + 4);
    peakLabelText
      .attr('x', pxAt + 8)
      .attr('text-anchor', 'start');
    const pbb = peakLabelText.node().getBBox();
    peakLabelBg
      .attr('x', pbb.x - 4).attr('y', pbb.y - 2)
      .attr('width', pbb.width + 8).attr('height', pbb.height + 4);

    // Event title (zoomed view) — centred across the visible Floyd window.
    const tx0 = Math.max(0, x(PARSE_D('2020-05-28')));
    const tx1 = Math.min(innerW, x(PARSE_D('2020-06-03')));
    if (tx1 > tx0) {
      const cx2 = (tx0 + tx1) / 2;
      titleText.attr('x', cx2);
      titleRule.attr('x1', tx0).attr('x2', tx1);
    }

    dotsG.selectAll('circle.day').data(allData, d => d.date.getTime())
      .join(
        enter => enter.append('circle').attr('class', 'day').attr('r', 3.5).attr('fill', t.accent),
        update => update,
      )
      .attr('cx', d => x(d.date)).attr('cy', d => y(d.n))
      // Hide dots when zoomed wide (too dense); reveal as we zoom in.
      .attr('opacity', () => {
        const widthDays = d3.timeDay.count(xs, xe);
        return widthDays < 30 ? 1 : 0;
      });

    // x-axis ticks density depends on visible range.
    const widthDays = d3.timeDay.count(xs, xe);
    const tickFn = widthDays > 90
      ? d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat('%b'))
      : d3.axisBottom(x).ticks(d3.timeDay.every(1)).tickFormat(d3.timeFormat('%b %-d'));
    xAxisG.call(tickFn.tickSizeOuter(0)).call(s => styleAxis(s, t.ink3));
    if (widthDays <= 30) {
      xAxisG.selectAll('text').attr('transform', 'rotate(-30)').attr('text-anchor', 'end').attr('dx', -4);
    } else {
      xAxisG.selectAll('text').attr('transform', null).attr('text-anchor', 'middle').attr('dx', null);
    }
    yAxisG.call(d3.axisLeft(y).ticks(5).tickFormat(FMT_INT).tickSizeOuter(0))
      .call(s => styleAxis(s, t.ink3));

    gridG.selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', t.rule).attr('stroke-dasharray', '2 3');

    // Annotation positions update with current x scale.
    annotNodes.forEach(a => {
      const xe2 = x(a.d);
      a.ln.attr('x1', xe2).attr('x2', xe2);
      a.tx.attr('x', xe2 + a.anchorOffset);
    });
  }

  // ── Animation orchestration · two-way toggle ─────────────────────────
  // Zoom-in path:  wide → zoomed; peak label fades out, annotations stagger in.
  // Zoom-out path: zoomed → wide; annotations fade out, peak label fades in.
  // Event title cross-fades opposite to the peak label.
  const ZOOM_MS = 2200;
  const REVEAL_GAP_MS = 350;
  const REVEAL_TOTAL_MS = REVEAL_GAP_MS * (annotNodes.length + 1);

  let state = 'wide';       // 'wide' or 'zoomed'
  let animating = false;
  let rafId = null;

  const LABELS = {
    wideIdle:    '▶ Discover what happened at the peak',
    zoomedIdle:  '↩ Back to the full year',
    busy:        '… animating',
  };

  function cancelAnim() { if (rafId) cancelAnimationFrame(rafId); rafId = null; }

  function setAnnotOpacity(i, op) { annotNodes[i].grp.attr('opacity', op); }
  function setAllAnnots(op) { annotNodes.forEach((_, i) => setAnnotOpacity(i, op)); }
  function setProgress(p) { progressFill.style.width = `${Math.min(100, Math.max(0, p * 100))}%`; }
  function enableHover() { hit.style('pointer-events', 'all'); }
  function disableHover() { hit.style('pointer-events', 'none'); hoverLeave(); }

  function setPeakLabelOpacity(op) { peakLabelG.attr('opacity', op); }
  function setTitleOpacity(op) { titleG.attr('opacity', op); }
  // Lockdown label + in-band stat are wide-only — they cross-fade together
  // with the peak label so the wide-state labels disappear once we zoom.
  function setLockLabelOpacity(op) {
    lockLabelG.attr('opacity', op);
    lockInBandStat.attr('opacity', op * 0.55);  // in-band stat sits softly
  }

  function setIdleLabel() {
    playBtn.disabled = false;
    playBtn.textContent = state === 'wide' ? LABELS.wideIdle : LABELS.zoomedIdle;
  }

  function setBusyLabel() {
    playBtn.disabled = true;
    playBtn.textContent = LABELS.busy;
  }

  function snapTo(targetState) {
    cancelAnim();
    disableHover();
    state = targetState;
    if (targetState === 'zoomed') {
      x.domain(ZOOM);
      redraw();
      setAllAnnots(1);
      setPeakLabelOpacity(0);
      setLockLabelOpacity(0);
      setTitleOpacity(1);
      setProgress(1);
      enableHover();
    } else {
      x.domain(WIDE);
      redraw();
      setAllAnnots(0);
      setPeakLabelOpacity(1);
      setLockLabelOpacity(1);
      setTitleOpacity(0);
      setProgress(0);
      // Wide view: hover stays off — at full-year density the scrub is noisy.
      disableHover();
    }
    setIdleLabel();
  }

  function animateZoomIn() {
    cancelAnim();
    animating = true;
    setBusyLabel();
    disableHover();
    setAllAnnots(0);

    const startTime = performance.now();
    const xInterp = d3.interpolate(WIDE, ZOOM);
    const ease = d3.easeCubicInOut;
    const total = ZOOM_MS + REVEAL_TOTAL_MS;

    function tick(now) {
      const elapsed = now - startTime;
      if (elapsed < ZOOM_MS) {
        const u = ease(elapsed / ZOOM_MS);
        x.domain(xInterp(u));
        redraw();
        // Wide-state labels (peak + lockdown) fade out as we zoom;
        // event title fades in over the last half for a soft handoff.
        setPeakLabelOpacity(1 - u);
        setLockLabelOpacity(1 - u);
        setTitleOpacity(Math.max(0, (u - 0.5) * 2));
        setProgress(elapsed / total);
        rafId = requestAnimationFrame(tick);
        return;
      }
      x.domain(ZOOM); redraw();
      setPeakLabelOpacity(0);
      setLockLabelOpacity(0);
      setTitleOpacity(1);

      const revealElapsed = elapsed - ZOOM_MS;
      const stage = Math.floor(revealElapsed / REVEAL_GAP_MS);
      annotNodes.forEach((_, i) => setAnnotOpacity(i, i <= stage ? 1 : 0));
      setProgress(elapsed / total);

      if (revealElapsed >= REVEAL_TOTAL_MS) {
        setAllAnnots(1);
        setProgress(1);
        rafId = null;
        animating = false;
        state = 'zoomed';
        setIdleLabel();
        enableHover();
        return;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }

  function animateZoomOut() {
    cancelAnim();
    animating = true;
    setBusyLabel();
    disableHover();

    const startTime = performance.now();
    const xInterp = d3.interpolate(ZOOM, WIDE);
    const ease = d3.easeCubicInOut;
    // First fade annotations out (short), then the zoom-out, with the
    // peak label fading back in over the second half.
    const FADE_OUT_MS = 350;
    const total = FADE_OUT_MS + ZOOM_MS;

    function tick(now) {
      const elapsed = now - startTime;
      if (elapsed < FADE_OUT_MS) {
        const f = elapsed / FADE_OUT_MS;
        setAllAnnots(1 - f);
        setTitleOpacity(1 - f);
        setProgress(elapsed / total);
        rafId = requestAnimationFrame(tick);
        return;
      }
      setAllAnnots(0);
      setTitleOpacity(0);

      const zoomElapsed = elapsed - FADE_OUT_MS;
      if (zoomElapsed < ZOOM_MS) {
        const u = ease(zoomElapsed / ZOOM_MS);
        x.domain(xInterp(u));
        redraw();
        // Both wide-state labels cross-fade in over the back half.
        const labelOp = Math.max(0, (u - 0.5) * 2);
        setPeakLabelOpacity(labelOp);
        setLockLabelOpacity(labelOp);
        setProgress(elapsed / total);
        rafId = requestAnimationFrame(tick);
        return;
      }
      x.domain(WIDE); redraw();
      setPeakLabelOpacity(1);
      setLockLabelOpacity(1);
      setProgress(0);
      rafId = null;
      animating = false;
      state = 'wide';
      setIdleLabel();
      // Wide view: scrub stays off.
      disableHover();
    }
    rafId = requestAnimationFrame(tick);
  }

  function onPlayClick() {
    if (animating) return;
    if (state === 'wide') animateZoomIn();
    else animateZoomOut();
  }

  playBtn.addEventListener('click', onPlayClick);

  if (reducedMotion) {
    // Reduced motion: skip animation; show the resolved zoomed state so
    // the content is reachable without motion. Toggle still works as
    // instant snap if the user opts in.
    snapTo('zoomed');
    // Override toggle handler to snap instantly for reduced-motion users.
    playBtn.removeEventListener('click', onPlayClick);
    playBtn.addEventListener('click', () => {
      snapTo(state === 'wide' ? 'zoomed' : 'wide');
    });
  } else {
    // Static wide view + idle label.
    snapTo('wide');
  }
}


// ─────────────────────────────────────────────────────────────────────────
// D · SMALL MULTIPLES — one panel per robust crime type across 2020
// 4×2 grid. Shared x-axis (2020 weeks). Shared y by default so magnitudes
// stay comparable; toggle to per-panel y for shape-only comparison. Faint
// 2018/19 baseline behind each 2020 line. Lockdown band + Floyd week
// marker drawn in every panel so the two reference events align across
// the grid. Single shared hover.
// ─────────────────────────────────────────────────────────────────────────
function renderTypeSmallMultiples(rootEl, byType) {
  const t = tokens();
  clear(rootEl);

  // Robust types: lockdown-window baseline ≥ 1100/window (~183/week). Eight
  // types qualify — exactly fills a 4×2 grid. Lower-volume categories
  // (ROBBERY ~148/wk, MOTOR VEHICLE THEFT ~172/wk) would still be readable
  // but produce visibly noisier lines; left off for the prototype.
  const lock42 = new Map(byType.windows.lockdown_42d.by_type.map(r => [r.type, r.n_baseline_avg]));
  const robust = [...lock42.entries()]
    .filter(([, n]) => n >= 1100)
    .sort((a, b) => b[1] - a[1])
    .map(([typeName]) => typeName);

  // Build per-type weekly series + matched-WoY baseline.
  const baselineByWoy = new Map(byType.baseline_by_woy.map(b => [b.woy, b.by_type]));
  const panels = robust.map(typeName => {
    const s2020 = byType.weekly_2020.map(wk => {
      const e = wk.by_type.find(x => x.type === typeName);
      return { date: PARSE_D(wk.week_start), woy: wk.woy, n: e ? e.n : 0 };
    }).sort((a, b) => a.date - b.date);
    const base = byType.weekly_2020.map(wk => {
      const entries = baselineByWoy.get(wk.woy) || [];
      const e = entries.find(x => x.type === typeName);
      return { date: PARSE_D(wk.week_start), woy: wk.woy, n: e ? e.n_avg : 0 };
    }).sort((a, b) => a.date - b.date);
    const yMax = Math.max(
      d3.max(s2020, d => d.n) || 0,
      d3.max(base,  d => d.n) || 0,
    );
    return { type: typeName, s2020, base, yMax };
  });

  // Controls: segmented y-scale toggle. Both segments always visible; the
  // active one is filled-accent, the inactive one muted. Default is
  // per-panel — small multiples are about shape, not magnitude, and the
  // diverging-bars chart already carries the magnitude story for the
  // Floyd window.
  const controls = makeNode('div', { class: 'proto-controls' });
  const label = makeNode('span', { style: 'color: var(--ink-3); letter-spacing: 0.06em' }, 'Y-axis');
  controls.appendChild(label);
  const seg = makeNode('div', { class: 'proto-segmented', role: 'group', 'aria-label': 'Y-axis scale' });
  const btnShared = makeNode('button', { type: 'button', class: 'proto-btn proto-segmented__seg', 'aria-pressed': 'false' }, 'Shared y');
  const btnPer    = makeNode('button', { type: 'button', class: 'proto-btn proto-segmented__seg', 'aria-pressed': 'true' },  'Per-panel y');
  seg.appendChild(btnShared);
  seg.appendChild(btnPer);
  controls.appendChild(seg);
  rootEl.appendChild(controls);

  const svgWrap = makeNode('div');
  rootEl.appendChild(svgWrap);

  // Tooltip (shared across all panels).
  let tooltip = rootEl.querySelector('.proto-tooltip');
  if (!tooltip) {
    tooltip = makeNode('div', { class: 'proto-tooltip' });
    rootEl.appendChild(tooltip);
  }

  // Grid geometry. 4 cols × 2 rows.
  const W = 960, H = 460;
  const cols = 4, rows = 2;
  const M = { top: 18, right: 16, bottom: 44, left: 18 };
  const gap = 16;
  const cellW = (W - M.left - M.right - gap * (cols - 1)) / cols;
  const cellH = (H - M.top - M.bottom - gap * (rows - 1)) / rows;
  const panelM = { top: 20, right: 6, bottom: 18, left: 32 };
  const innerW = cellW - panelM.left - panelM.right;
  const innerH = cellH - panelM.top - panelM.bottom;

  const xDomain = d3.extent(panels[0].s2020, d => d.date);
  const x = d3.scaleTime().domain(xDomain).range([0, innerW]);
  const sharedYMax = d3.max(panels, p => p.yMax) * 1.05;

  let scaleMode = 'per';  // 'shared' or 'per' — per-panel is the small-multiples default
  let bisect = d3.bisector(d => d.date).left;

  function yFor(panel) {
    const max = scaleMode === 'shared' ? sharedYMax : panel.yMax * 1.08;
    return d3.scaleLinear().domain([0, max]).range([innerH, 0]);
  }

  function render() {
    clear(svgWrap);
    const svg = d3.select(svgWrap).append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')
      .attr('aria-label', `Small multiples of weekly crime by primary type across 2020 with 2018-19 baseline, ${scaleMode} y-axis`);

    panels.forEach((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = M.left + col * (cellW + gap);
      const cy = M.top  + row * (cellH + gap);

      const cell = svg.append('g').attr('transform', `translate(${cx},${cy})`);
      // Panel chrome
      cell.append('rect')
        .attr('x', 0).attr('y', 0).attr('width', cellW).attr('height', cellH)
        .attr('fill', t.paper2).attr('stroke', t.rule);

      // Panel title (type) — left-aligned over the plot area.
      cell.append('text')
        .attr('x', panelM.left).attr('y', 13)
        .attr('fill', t.ink)
        .attr('font-family', 'var(--mono)').attr('font-size', 11)
        .attr('font-weight', 600)
        .text(p.type);

      const g = cell.append('g').attr('transform', `translate(${panelM.left},${panelM.top})`);
      const y = yFor(p);

      // Lockdown band
      const ls = x(PARSE_D('2020-03-21'));
      const le = x(PARSE_D('2020-05-01'));
      g.append('rect')
        .attr('x', ls).attr('y', 0).attr('width', le - ls).attr('height', innerH)
        .attr('fill', t.ink3).attr('opacity', 0.07);

      // Floyd week marker
      const fxs = x(PARSE_D('2020-05-25'));
      const fxe = x(PARSE_D('2020-06-05'));
      g.append('rect')
        .attr('x', fxs).attr('y', 0).attr('width', Math.max(2, fxe - fxs)).attr('height', innerH)
        .attr('fill', t.accent).attr('opacity', 0.10);

      // Baseline (faint, dashed)
      const baseLine = d3.line()
        .x(d => x(d.date)).y(d => y(d.n))
        .curve(d3.curveMonotoneX);
      g.append('path').datum(p.base)
        .attr('fill', 'none').attr('stroke', t.ink3).attr('stroke-width', 1)
        .attr('stroke-dasharray', '3 3').attr('opacity', 0.7)
        .attr('d', baseLine);

      // 2020 line (accent)
      const series2020Line = d3.line()
        .x(d => x(d.date)).y(d => y(d.n))
        .curve(d3.curveMonotoneX);
      g.append('path').datum(p.s2020)
        .attr('fill', 'none').attr('stroke', t.accent).attr('stroke-width', 1.6)
        .attr('d', series2020Line);

      // y-axis tick (top of plot, just shows the max for orientation)
      g.append('text')
        .attr('x', -4).attr('y', 4)
        .attr('text-anchor', 'end')
        .attr('fill', t.ink3)
        .attr('font-family', 'var(--mono)').attr('font-size', 9)
        .text(FMT_INT(Math.round(y.domain()[1])));
      g.append('text')
        .attr('x', -4).attr('y', innerH)
        .attr('text-anchor', 'end')
        .attr('fill', t.ink3)
        .attr('font-family', 'var(--mono)').attr('font-size', 9)
        .text('0');

      // x-axis: only on bottom row
      if (row === rows - 1) {
        g.append('g').attr('transform', `translate(0,${innerH})`)
          .call(d3.axisBottom(x).ticks(d3.timeMonth.every(2)).tickFormat(d3.timeFormat('%b')).tickSizeOuter(0))
          .call(s => styleAxis(s, t.ink3))
          .selectAll('text').attr('font-size', 9);
      }

      // Hover: invisible overlay sized to the plot area; pick nearest week.
      const hit = g.append('rect')
        .attr('width', innerW).attr('height', innerH)
        .attr('fill', 'transparent').style('cursor', 'crosshair');
      const guide = g.append('line')
        .attr('y1', 0).attr('y2', innerH)
        .attr('stroke', t.ink).attr('stroke-width', 1).attr('opacity', 0);
      const dotA = g.append('circle').attr('r', 4).attr('fill', t.accent).attr('opacity', 0);
      const dotB = g.append('circle').attr('r', 3).attr('fill', t.paper).attr('stroke', t.ink3).attr('stroke-width', 1).attr('opacity', 0);

      function move(evt) {
        const [mx] = d3.pointer(evt, g.node());
        const dt = x.invert(mx);
        const i2 = bisect(p.s2020, dt);
        const a = p.s2020[Math.max(0, i2 - 1)], b = p.s2020[Math.min(p.s2020.length - 1, i2)];
        const d = !a ? b : !b ? a : (dt - a.date < b.date - dt ? a : b);
        const bi = p.base.find(z => +z.date === +d.date);
        guide.attr('x1', x(d.date)).attr('x2', x(d.date)).attr('opacity', 1);
        dotA.attr('cx', x(d.date)).attr('cy', y(d.n)).attr('opacity', 1);
        if (bi) dotB.attr('cx', x(bi.date)).attr('cy', y(bi.n)).attr('opacity', 1);

        clear(tooltip);
        tooltip.appendChild(makeNode('b', {}, `${p.type} · week of ${FMT_FULL(d.date)}`));
        const row1 = makeNode('div', { class: 'tt-row' });
        row1.appendChild(makeNode('span', { class: 'tt-lbl' }, '2020'));
        row1.appendChild(makeNode('span', {}, FMT_INT(d.n)));
        tooltip.appendChild(row1);
        const row2 = makeNode('div', { class: 'tt-row' });
        row2.appendChild(makeNode('span', { class: 'tt-lbl' }, 'baseline'));
        row2.appendChild(makeNode('span', {}, bi ? FMT_INT(Math.round(bi.n)) : '—'));
        tooltip.appendChild(row2);
        if (bi && bi.n > 0) {
          const delta = ((d.n - bi.n) / bi.n) * 100;
          const row3 = makeNode('div', { class: 'tt-row' });
          row3.appendChild(makeNode('span', { class: 'tt-lbl' }, 'vs baseline'));
          row3.appendChild(makeNode('span', { style: `color: ${delta < 0 ? t.ink2 : t.accent}; font-weight: 600` }, FMT_DELTA(delta)));
          tooltip.appendChild(row3);
        }
        tooltip.classList.add('is-visible');
        const r = rootEl.getBoundingClientRect();
        const tw = tooltip.offsetWidth;
        let tx = evt.clientX - r.left + 14;
        let ty = evt.clientY - r.top + 14;
        if (tx + tw > r.width) tx = evt.clientX - r.left - tw - 14;
        tooltip.style.left = `${tx}px`;
        tooltip.style.top = `${ty}px`;
      }
      function leave() {
        guide.attr('opacity', 0); dotA.attr('opacity', 0); dotB.attr('opacity', 0);
        tooltip.classList.remove('is-visible');
      }
      hit.on('mousemove', move).on('mouseleave', leave)
         .on('touchstart', (e) => { e.preventDefault(); move(e.touches[0]); }, { passive: false })
         .on('touchmove',  (e) => { e.preventDefault(); move(e.touches[0]); }, { passive: false })
         .on('touchend', leave);
    });

    // Footer legend
    const foot = svg.append('g').attr('transform', `translate(${M.left},${H - 14})`);
    foot.append('line').attr('x1', 0).attr('x2', 22).attr('y1', 0).attr('y2', 0)
      .attr('stroke', t.accent).attr('stroke-width', 1.6);
    foot.append('text').attr('x', 28).attr('y', 4)
      .attr('fill', t.ink2).attr('font-family', 'var(--mono)').attr('font-size', 10).text('2020 weekly');
    foot.append('line').attr('x1', 108).attr('x2', 130).attr('y1', 0).attr('y2', 0)
      .attr('stroke', t.ink3).attr('stroke-width', 1).attr('stroke-dasharray', '3 3');
    foot.append('text').attr('x', 136).attr('y', 4)
      .attr('fill', t.ink2).attr('font-family', 'var(--mono)').attr('font-size', 10).text('2018-19 baseline (same week, averaged)');
    foot.append('rect').attr('x', 360).attr('y', -6).attr('width', 16).attr('height', 10)
      .attr('fill', t.ink3).attr('opacity', 0.07);
    foot.append('text').attr('x', 380).attr('y', 4)
      .attr('fill', t.ink3).attr('font-family', 'var(--mono)').attr('font-size', 10).text('lockdown');
    foot.append('rect').attr('x', 444).attr('y', -6).attr('width', 16).attr('height', 10)
      .attr('fill', t.accent).attr('opacity', 0.10);
    foot.append('text').attr('x', 464).attr('y', 4)
      .attr('fill', t.ink3).attr('font-family', 'var(--mono)').attr('font-size', 10).text('Floyd week');
    foot.append('text').attr('x', 560).attr('y', 4)
      .attr('fill', t.ink3).attr('font-family', 'var(--mono)').attr('font-size', 10)
      .text(`y-axis: ${scaleMode === 'shared' ? 'shared (magnitudes comparable across panels)' : 'per-panel (each shape fills its frame)'}`);
  }

  function setMode(mode) {
    scaleMode = mode;
    btnShared.setAttribute('aria-pressed', mode === 'shared' ? 'true' : 'false');
    btnPer.setAttribute('aria-pressed',    mode === 'per'    ? 'true' : 'false');
    render();
  }
  btnShared.addEventListener('click', () => setMode('shared'));
  btnPer.addEventListener('click',    () => setMode('per'));
  setMode('per');
}

// ─────────────────────────────────────────────────────────────────────────
// E · FLOYD DIVERGING BARS (approved — kept verbatim)
// ─────────────────────────────────────────────────────────────────────────
function renderFloydDiverging(rootEl, byType) {
  const t = tokens();
  clear(rootEl);

  const FORCE_INCLUDE = new Set(['PUBLIC PEACE VIOLATION', 'ARSON']);
  const win = byType.windows.floyd_8d.by_type;

  const candidates = win.filter(d =>
    d.n_baseline_avg >= 100 || FORCE_INCLUDE.has(d.type) || d.n_2020 >= 250
  );
  const rows = candidates.sort((a, b) => Math.abs(b.delta_pct ?? 0) - Math.abs(a.delta_pct ?? 0)).slice(0, 10);
  rows.sort((a, b) => {
    if ((a.delta_pct >= 0) !== (b.delta_pct >= 0)) return a.delta_pct >= 0 ? -1 : 1;
    return a.delta_pct >= 0 ? b.delta_pct - a.delta_pct : a.delta_pct - b.delta_pct;
  });

  const W = 960, H = 440;
  const M = { top: 28, right: 260, bottom: 50, left: 180 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const VISUAL_CAP_POS = 400;
  const VISUAL_CAP_NEG = -100;
  const x = d3.scaleLinear().domain([VISUAL_CAP_NEG, VISUAL_CAP_POS]).range([0, innerW]);
  const y = d3.scaleBand().domain(rows.map(r => r.type)).range([0, innerH]).padding(0.28);

  const svg = d3.select(rootEl).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', 'Composition shift during the 8-day Floyd window: percent change versus 2018-19 baseline by primary type, with raw counts in every label');
  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  const ticks = [-100, -50, 0, 50, 100, 200, 300, 400];
  g.append('g').selectAll('line.grid')
    .data(ticks).join('line').attr('class', 'grid')
      .attr('x1', d => x(d)).attr('x2', d => x(d))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', d => d === 0 ? t.ink : t.rule)
      .attr('stroke-width', d => d === 0 ? 1.2 : 1)
      .attr('stroke-dasharray', d => d === 0 ? null : '2 3');

  g.append('g')
    .call(d3.axisTop(x).tickValues(ticks).tickFormat(d => `${d}%`).tickSizeOuter(0))
    .call(s => styleAxis(s, t.ink3));

  g.append('g')
    .call(d3.axisLeft(y).tickSize(0).tickPadding(10))
    .call(s => {
      s.selectAll('path').remove();
      s.selectAll('text').attr('fill', t.ink).attr('font-family', 'var(--mono)').attr('font-size', 11);
    });

  rows.forEach(r => {
    const yc = y(r.type);
    const delta = r.delta_pct ?? 0;
    const capped = delta > VISUAL_CAP_POS;
    const visualDelta = capped ? VISUAL_CAP_POS : Math.max(VISUAL_CAP_NEG, delta);
    const fill = delta >= 0 ? t.accent : t.ink3;
    const xStart = delta >= 0 ? x(0) : x(visualDelta);
    const xEnd = delta >= 0 ? x(visualDelta) : x(0);

    g.append('rect')
      .attr('x', xStart).attr('y', yc)
      .attr('width', xEnd - xStart).attr('height', y.bandwidth())
      .attr('fill', fill).attr('opacity', delta >= 0 ? 1 : 0.75);

    if (capped) {
      g.append('text')
        .attr('x', x(visualDelta) - 6).attr('y', yc + y.bandwidth() / 2)
        .attr('text-anchor', 'end').attr('dominant-baseline', 'central')
        .attr('fill', t.paper).attr('font-family', 'var(--mono)').attr('font-size', 12)
        .attr('font-weight', 700)
        .text('»');
    }
  });

  g.selectAll('text.raw').data(rows).join('text').attr('class', 'raw')
    .attr('x', innerW + 12)
    .attr('y', d => y(d.type) + y.bandwidth() / 2)
    .attr('dominant-baseline', 'central')
    .attr('fill', t.ink2)
    .attr('font-family', 'var(--mono)').attr('font-size', 11)
    .text(d => {
      const a = FMT_INT(d.n_2020);
      const b = FMT_INT(Math.round(d.n_baseline_avg));
      const pct = d.delta_pct == null ? '—' : FMT_DELTA(d.delta_pct);
      return `${a}  vs  ${b}  (${pct})`;
    });

  g.append('text')
    .attr('x', 0).attr('y', innerH + 30)
    .attr('fill', t.ink3)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.06em')
    .text('Floyd window 2020-05-29 → 2020-06-05 (8 days). Bars clipped at ±cap; raw counts and uncapped % in every label.');
}

// ─────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────
function safe(name, fn) {
  try { fn(); }
  catch (err) { console.error(`covid chart "${name}" failed to render:`, err); }
}

export function renderCovidPrototypes({ covid, byType, byHour }) {
  // Article mount IDs use the project-wide `insight-chart-covid-*`
  // convention; the legacy `proto-covid-*` IDs are checked too so older
  // markup keeps working during the assembly transition.
  const pick = (...ids) => ids.map(id => document.getElementById(id)).find(Boolean);
  const floydZoom = pick('insight-chart-covid-floyd-zoom', 'proto-covid-floyd-zoom');
  const sm = pick('insight-chart-covid-small-multiples', 'proto-covid-small-multiples');
  const floyd = pick('insight-chart-covid-comp-floyd', 'proto-covid-comp-floyd');

  if (floydZoom) safe('floyd-zoom-animated', () => renderFloydZoomAnimated(floydZoom, covid));
  if (sm)        safe('type-small-multiples',() => renderTypeSmallMultiples(sm, byType));
  if (floyd)     safe('floyd-diverging',     () => renderFloydDiverging(floyd, byType));
}
