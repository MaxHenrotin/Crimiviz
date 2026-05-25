import * as d3 from 'd3';

const parseMonth = d3.timeParse('%Y-%m');
const fmtPct = d3.format('.0%');
const fmtVolAxis = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    ink:        v('--ink'),
    ink2:       v('--ink-2'),
    ink3:       v('--ink-3'),
    rule:       v('--rule'),
    ruleSoft:   v('--rule-soft') || v('--rule'),
    paper:      v('--paper'),
    accent:     v('--accent'),
    accentSoft: v('--accent-soft') || v('--accent'),
  };
}

const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Subtle stroke-dashoffset draw-in for line paths. Bails out under
// prefers-reduced-motion so motion-sensitive readers see the resolved
// line immediately.
function animateLine(pathSel, duration = 900, delay = 0) {
  if (REDUCED_MOTION) return;
  const node = pathSel.node();
  if (!node || typeof node.getTotalLength !== 'function') return;
  const len = node.getTotalLength();
  if (!Number.isFinite(len) || len <= 0) return;
  pathSel
    .attr('stroke-dasharray', `${len} ${len}`)
    .attr('stroke-dashoffset', len)
    .transition()
      .delay(delay)
      .duration(duration)
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0)
      .on('end', function () {
        // Clear the dasharray so future overlays (hover guides etc.)
        // don't inherit a phantom dash pattern on this path.
        d3.select(this).attr('stroke-dasharray', null);
      });
}

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function styleAxis(sel, color, t) {
  sel.selectAll('path,line').attr('stroke', color);
  sel.selectAll('text')
    .attr('fill', color)
    .attr('font-family', 'var(--mono)')
    .attr('font-size', 11);
}

function parseSeries(raw) {
  return raw.map(d => ({
    date: parseMonth(d.month),
    volume: d.volume,
    rate: d.arrest_rate,
    rate12: d.arrest_rate_12m,
  }));
}

// ─────────────────────────────────────────────────────────────
// Chart A — zoomed dual axis, ~2013–2018
// Volume on the left in dark ink; 12-month arrest rate on the right in accent.
// Both lines share the same time domain. Numbers live in the caption below.
// ─────────────────────────────────────────────────────────────
function renderZoomChart(rootEl, data, captionEl) {
  const t = tokens();
  clear(rootEl);
  if (captionEl) clear(captionEl);

  const all = parseSeries(data.series);
  const xMin = new Date('2013-01-01');
  const xMax = new Date('2018-12-31');
  const series = all.filter(d => d.date >= xMin && d.date <= xMax);

  const VIEW_W = 960, VIEW_H = 400;
  // Generous top margin so the post-video band's label can sit above the
  // plot without competing with the volume curve.
  const M = { top: 56, right: 68, bottom: 40, left: 68 };
  const innerW = VIEW_W - M.left - M.right;
  const innerH = VIEW_H - M.top - M.bottom;

  const x = d3.scaleTime().domain([xMin, xMax]).range([0, innerW]);

  // Both Y axes anchored at 0 — flat-volume line should read as flat, and the
  // arrest-rate drop should not be visually inflated by a truncated baseline.
  const yVol = d3.scaleLinear()
    .domain([0, d3.max(series, d => d.volume) * 1.1])
    .nice()
    .range([innerH, 0]);

  const yRate = d3.scaleLinear()
    .domain([0, 0.4])
    .range([innerH, 0]);

  const svg = d3.select(rootEl).append('svg')
    .attr('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', 'Monthly volume and 12-month arrest rate, 2013 to 2018. After the November 2015 video release, the volume line stays flat while the arrest-rate line breaks downward.');

  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  // Post-video accent band — quiet tint over the months after Nov 2015,
  // grounding the "what changes after the marker" reading. Sits behind
  // every other plot element so axes and lines stay legible above it.
  const eventDate = new Date(`${data.video_date}T12:00:00`);
  const hasEvent = !Number.isNaN(eventDate.getTime());
  if (hasEvent) {
    const xe = x(eventDate);
    g.append('rect')
      .attr('x', xe).attr('y', 0)
      .attr('width', Math.max(0, innerW - xe)).attr('height', innerH)
      .attr('fill', t.accent)
      .attr('opacity', 0.06);
  }

  // Horizontal gridlines — anchored to the volume scale so they're spaced
  // evenly with the left ticks. Light, dashed, and never crossing the axis
  // baselines.
  g.append('g').attr('class', 'grid').selectAll('line')
    .data(yVol.ticks(5))
    .join('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => yVol(d)).attr('y2', d => yVol(d))
      .attr('stroke', t.rule)
      .attr('stroke-dasharray', '2 3');

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat('%Y')).tickSizeOuter(0))
    .call(s => styleAxis(s, t.ink3, t));

  g.append('g')
    .call(d3.axisLeft(yVol).ticks(5).tickFormat(fmtVolAxis).tickSizeOuter(0))
    .call(s => styleAxis(s, t.ink3, t));

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -48).attr('x', -innerH / 2)
    .attr('text-anchor', 'middle')
    .attr('fill', t.ink2)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.14em')
    .text('INCIDENTS / MONTH');

  g.append('g')
    .attr('transform', `translate(${innerW},0)`)
    .call(d3.axisRight(yRate).ticks(5).tickFormat(fmtPct).tickSizeOuter(0))
    .call(s => styleAxis(s, t.accent, t));

  g.append('text')
    .attr('transform', 'rotate(90)')
    .attr('y', -innerW - 48).attr('x', innerH / 2)
    .attr('text-anchor', 'middle')
    .attr('fill', t.accent)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.14em')
    .text('ARREST RATE');

  const lineVol = d3.line()
    .defined(d => d.volume != null)
    .x(d => x(d.date))
    .y(d => yVol(d.volume))
    .curve(d3.curveMonotoneX);

  const lineRate12 = d3.line()
    .defined(d => d.rate12 != null)
    .x(d => x(d.date))
    .y(d => yRate(d.rate12))
    .curve(d3.curveMonotoneX);

  const volPath = g.append('path').datum(series)
    .attr('fill', 'none').attr('stroke', t.ink)
    .attr('stroke-width', 1.4)
    .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
    .attr('d', lineVol);

  const ratePath = g.append('path').datum(series)
    .attr('fill', 'none').attr('stroke', t.accent)
    .attr('stroke-width', 2.2)
    .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
    .attr('d', lineRate12);

  // Inflection point — the nearest monthly sample to the video date.
  // Highlight it on the rate line, then echo the same x on the volume
  // line to show the rate breaks while the volume holds.
  if (hasEvent) {
    const xe = x(eventDate);
    let inflect = null;
    for (const pt of series) {
      if (pt.rate12 == null) continue;
      if (!inflect || Math.abs(pt.date - eventDate) < Math.abs(inflect.date - eventDate)) inflect = pt;
    }
    if (inflect) {
      g.append('circle')
        .attr('cx', x(inflect.date)).attr('cy', yRate(inflect.rate12))
        .attr('r', 4.5).attr('fill', t.accent)
        .attr('stroke', t.paper).attr('stroke-width', 1.5);
      g.append('circle')
        .attr('cx', x(inflect.date)).attr('cy', yVol(inflect.volume))
        .attr('r', 4).attr('fill', t.ink)
        .attr('stroke', t.paper).attr('stroke-width', 1.5);
    }

    // Marker line at the video release date.
    g.append('line')
      .attr('x1', xe).attr('x2', xe).attr('y1', 0).attr('y2', innerH)
      .attr('stroke', t.ink).attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 4');

    // Top-margin event title with a tiny rule under it (mirrors the
    // COVID-zoom title treatment so the cards feel like a matched set).
    g.append('text')
      .attr('x', xe + 8).attr('y', -28)
      .attr('fill', t.ink)
      .attr('font-family', 'var(--mono)').attr('font-size', 10)
      .attr('font-weight', 700).attr('letter-spacing', '0.12em')
      .text('NOV 2015 · VIDEO RELEASED');

    // Two integrated annotations carrying the core finding. Anchored to
    // their respective series colors so the eye associates each phrase
    // with its line.
    g.append('text')
      .attr('x', xe + 8).attr('y', yVol(d3.max(series, d => d.volume)) + 16)
      .attr('fill', t.ink)
      .attr('font-family', 'var(--mono)').attr('font-size', 10)
      .attr('letter-spacing', '0.10em')
      .text('volume holds');
    g.append('text')
      .attr('x', xe + 8).attr('y', yRate(0.34))
      .attr('fill', t.accent)
      .attr('font-family', 'var(--mono)').attr('font-size', 10)
      .attr('letter-spacing', '0.10em')
      .text('rate breaks');
  }

  animateLine(volPath, 900, 100);
  animateLine(ratePath, 1100, 240);

  if (captionEl) {
    const volSign = data.volume_change_pct > 0 ? '+' : data.volume_change_pct < 0 ? '−' : '';
    const before = `${(data.rate_before * 100).toFixed(1)}%`;
    const after  = `${(data.rate_after * 100).toFixed(1)}%`;
    const drop   = `${data.rate_drop_pp > 0 ? '+' : '−'}${Math.abs(data.rate_drop_pp).toFixed(1)} pp`;
    const volChg = `${volSign}${Math.abs(data.volume_change_pct).toFixed(1)}%`;
    captionEl.append(...makeCaption([
      ['Volume change · ±24 mo',  volChg, 'ink'],
      ['Arrest rate · 24 mo before', before, 'accent'],
      ['Arrest rate · 24 mo after',  after,  'accent'],
      ['Drop',                       drop,   'accent'],
    ]));
  }

  attachZoomHover({ rootEl, svg, g, x, yVol, yRate, series, innerW, innerH, t });
}

function attachZoomHover({ rootEl, svg, g, x, yVol, yRate, series, innerW, innerH, t }) {
  const points = series.filter(d => d.rate12 != null && d.volume != null);
  if (!points.length) return;

  const readout = document.createElement('div');
  readout.className = 'insight-chart__hover-readout';
  rootEl.appendChild(readout);

  const guide = g.append('line')
    .attr('class', 'insight-chart__hover-guide')
    .attr('y1', 0).attr('y2', innerH)
    .attr('stroke', t.ink2)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '2 3')
    .attr('opacity', 0);

  const dotVol = g.append('circle')
    .attr('class', 'insight-chart__hover-dot')
    .attr('r', 4)
    .attr('fill', t.ink)
    .attr('opacity', 0);

  const dotRate = g.append('circle')
    .attr('class', 'insight-chart__hover-dot')
    .attr('r', 4)
    .attr('fill', t.accent)
    .attr('opacity', 0);

  const bisect = d3.bisector(d => d.date).left;
  const fmtMonth = d3.timeFormat('%b %Y');
  const fmtVol = d3.format(',');

  const hit = g.append('rect')
    .attr('width', innerW).attr('height', innerH)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair');

  const move = (event) => {
    const [mx] = d3.pointer(event, g.node());
    const date = x.invert(mx);
    const i = bisect(points, date);
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i)];
    const pt = !a ? b : !b ? a : (date - a.date < b.date - date ? a : b);
    if (!pt) return;

    const px = x(pt.date);
    guide.attr('x1', px).attr('x2', px).attr('opacity', 1);
    dotVol.attr('cx', px).attr('cy', yVol(pt.volume)).attr('opacity', 1);
    dotRate.attr('cx', px).attr('cy', yRate(pt.rate12)).attr('opacity', 1);

    const svgRect = svg.node().getBoundingClientRect();
    const rootRect = rootEl.getBoundingClientRect();
    const scale = svgRect.width / (innerW + 64 + 64);
    const pxAbs = (px + 64) * scale + (svgRect.left - rootRect.left);
    const flip = pxAbs > rootRect.width * 0.6;
    readout.style.left = flip ? 'auto' : `${pxAbs + 14}px`;
    readout.style.right = flip ? `${rootRect.width - pxAbs + 14}px` : 'auto';
    readout.classList.add('is-visible');
    readout.innerHTML = '';
    const head = document.createElement('div');
    head.style.marginBottom = '4px';
    head.innerHTML = `<b>${fmtMonth(pt.date)}</b>`;
    readout.appendChild(head);
    const r1 = document.createElement('div');
    r1.className = 'ro-row';
    r1.innerHTML = `<span class="ro-lbl">Volume</span><span>${fmtVol(pt.volume)}</span>`;
    readout.appendChild(r1);
    const r2 = document.createElement('div');
    r2.className = 'ro-row';
    r2.innerHTML = `<span class="ro-lbl">Arrest rate · 12 mo</span><span class="ro-accent">${(pt.rate12 * 100).toFixed(1)}%</span>`;
    readout.appendChild(r2);
  };

  const leave = () => {
    guide.attr('opacity', 0);
    dotVol.attr('opacity', 0);
    dotRate.attr('opacity', 0);
    readout.classList.remove('is-visible');
  };

  hit.on('mousemove', move)
     .on('mouseleave', leave)
     .on('touchstart', (e) => { e.preventDefault(); move(e.touches[0]); }, { passive: false })
     .on('touchmove',  (e) => { e.preventDefault(); move(e.touches[0]); }, { passive: false })
     .on('touchend', leave);
}

// ─────────────────────────────────────────────────────────────
// Chart B — full range, arrest rate only
// Two neutral milestone markers (video release, consent decree). The visual
// argument here is *persistence*: the line falls, then stays low. Order
// matters — the drop precedes the decree by ~3 years, so we never imply
// causation.
// ─────────────────────────────────────────────────────────────
function renderFullChart(rootEl, data, captionEl) {
  const t = tokens();
  clear(rootEl);
  if (captionEl) clear(captionEl);

  const series = parseSeries(data.series);
  const VIEW_W = 960, VIEW_H = 340;
  // Top margin holds the two centered milestone labels stacked vertically;
  // right margin gives the latest year tick room to breathe.
  const M = { top: 50, right: 32, bottom: 40, left: 60 };
  const innerW = VIEW_W - M.left - M.right;
  const innerH = VIEW_H - M.top - M.bottom;

  const x = d3.scaleTime()
    .domain(d3.extent(series, d => d.date))
    .range([0, innerW]);

  const yRate = d3.scaleLinear()
    .domain([0, 0.5])
    .range([innerH, 0]);

  const svg = d3.select(rootEl).append('svg')
    .attr('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', '12-month arrest rate, 2001 to today, with timeline markers for the Laquan McDonald video release and the 2019 consent decree');

  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  // Post-video band — same idiom as Chart A so the eye reads them as a
  // pair: tinted region after Nov 2015 visually flags "this is when the
  // line settled at its new level". Behind everything else.
  const videoDate = new Date(`${data.video_date}T12:00:00`);
  const hasVideo = !Number.isNaN(videoDate.getTime());
  if (hasVideo) {
    const xv = x(videoDate);
    g.append('rect')
      .attr('x', xv).attr('y', 0)
      .attr('width', Math.max(0, innerW - xv)).attr('height', innerH)
      .attr('fill', t.accent)
      .attr('opacity', 0.05);
  }

  g.append('g').attr('class', 'grid').selectAll('line')
    .data(yRate.ticks(5))
    .join('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => yRate(d)).attr('y2', d => yRate(d))
      .attr('stroke', t.rule)
      .attr('stroke-dasharray', '2 3');

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(d3.timeYear.every(2)).tickSizeOuter(0))
    .call(s => styleAxis(s, t.ink3, t));

  g.append('g')
    .call(d3.axisLeft(yRate).ticks(5).tickFormat(fmtPct).tickSizeOuter(0))
    .call(s => styleAxis(s, t.accent, t));

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -46).attr('x', -innerH / 2)
    .attr('text-anchor', 'middle')
    .attr('fill', t.accent)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.14em')
    .text('ARREST RATE · 12 MO');

  // Soft area fill under the rate line gives the curve weight and helps
  // the persistence read at a glance (low and steady = a wide low band).
  const areaRate12 = d3.area()
    .defined(d => d.rate12 != null)
    .x(d => x(d.date))
    .y0(innerH)
    .y1(d => yRate(d.rate12))
    .curve(d3.curveMonotoneX);

  g.append('path').datum(series)
    .attr('fill', t.accent).attr('opacity', 0.08)
    .attr('d', areaRate12);

  const lineRate12 = d3.line()
    .defined(d => d.rate12 != null)
    .x(d => x(d.date))
    .y(d => yRate(d.rate12))
    .curve(d3.curveMonotoneX);

  const ratePath = g.append('path').datum(series)
    .attr('fill', 'none').attr('stroke', t.accent)
    .attr('stroke-width', 2)
    .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
    .attr('d', lineRate12);
  animateLine(ratePath, 1100, 120);

  const milestones = [
    { date: data.video_date,          label: 'Nov 2015 · video released' },
    { date: data.consent_decree_date, label: 'Jan 2019 · consent decree' },
  ];

  // Each label is centered over its OWN dashed line and stacked vertically
  // when the two labels are close enough in x to overlap horizontally.
  // Centring removes the side-anchored ambiguity that earlier read as the
  // 2019 label hanging over the 2015 line.
  // Find the nearest series sample to a given date — used to anchor each
  // milestone dot onto the actual rate line at that month.
  const nearestSample = (target) => {
    let best = null;
    for (const pt of series) {
      if (pt.rate12 == null) continue;
      if (!best || Math.abs(pt.date - target) < Math.abs(best.date - target)) best = pt;
    }
    return best;
  };

  const placed = [];
  milestones.forEach((m) => {
    const d = new Date(`${m.date}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    const xe = x(d);
    g.append('line')
      .attr('x1', xe).attr('x2', xe).attr('y1', 0).attr('y2', innerH)
      .attr('stroke', t.ink).attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 4');

    // Small dot on the rate line at the milestone's nearest month —
    // attaches the label to the curve visually, not just to the vertical
    // line floating in empty space.
    const sample = nearestSample(d);
    if (sample) {
      g.append('circle')
        .attr('cx', x(sample.date)).attr('cy', yRate(sample.rate12))
        .attr('r', 4).attr('fill', t.accent)
        .attr('stroke', t.paper).attr('stroke-width', 1.5);
    }

    const collidesPrev = placed.some(p => Math.abs(p.xe - xe) < 220);
    const y = collidesPrev ? -8 : -22;

    g.append('text')
      .attr('x', xe)
      .attr('y', y)
      .attr('text-anchor', 'middle')
      .attr('fill', t.ink)
      .attr('font-family', 'var(--mono)').attr('font-size', 10)
      .attr('letter-spacing', '0.12em')
      .text(m.label);

    placed.push({ xe });
  });

  if (captionEl) {
    captionEl.append(...makeCaption([
      ['Reading',         'The drop starts ~3 years before the consent decree.', 'ink'],
      ['Milestones',      'Timeline context, not causes.',                       'ink'],
      ['Interaction',     'Hover any month to read its exact 12-month rate.',    'ink'],
    ]));
  }

  attachFullHover({ rootEl, svg, g, x, yRate, series, innerW, innerH, t });
}

// Hover-readout for Chart B. Chose hover over brush+zoom because the
// chart's argument — "the rate fell, then stayed low for years" — is
// already legible from the line shape; hover lets the reader verify
// exact monthly values without changing the framing or adding a
// brush-and-reset gesture that competes with the milestone markers.
function attachFullHover({ rootEl, svg, g, x, yRate, series, innerW, innerH, t }) {
  const points = series.filter(d => d.rate12 != null);
  if (!points.length) return;

  const readout = document.createElement('div');
  readout.className = 'insight-chart__hover-readout';
  rootEl.appendChild(readout);

  const guide = g.append('line')
    .attr('class', 'insight-chart__hover-guide')
    .attr('y1', 0).attr('y2', innerH)
    .attr('stroke', t.ink2)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '2 3')
    .attr('opacity', 0);

  const dot = g.append('circle')
    .attr('class', 'insight-chart__hover-dot')
    .attr('r', 4)
    .attr('fill', t.accent)
    .attr('opacity', 0);

  const bisect = d3.bisector(d => d.date).left;
  const fmtMonth = d3.timeFormat('%b %Y');

  // Hit rect sits over the plot; cursor swap signals interactivity.
  const hit = g.append('rect')
    .attr('width', innerW).attr('height', innerH)
    .attr('fill', 'transparent')
    .style('cursor', 'crosshair');

  const move = (event) => {
    const [mx] = d3.pointer(event, g.node());
    const date = x.invert(mx);
    const i = bisect(points, date);
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i)];
    const pt = !a ? b : !b ? a : (date - a.date < b.date - date ? a : b);
    if (!pt) return;

    const px = x(pt.date);
    guide.attr('x1', px).attr('x2', px).attr('opacity', 1);
    dot.attr('cx', px).attr('cy', yRate(pt.rate12)).attr('opacity', 1);

    // Mirror the positioning math from attachZoomHover so the readout
    // never clips the right edge: flip to the left of the cursor past
    // 60% of the chart width.
    const svgRect = svg.node().getBoundingClientRect();
    const rootRect = rootEl.getBoundingClientRect();
    const scale = svgRect.width / 960;
    const pxAbs = (px + 56) * scale + (svgRect.left - rootRect.left);
    const flip = pxAbs > rootRect.width * 0.6;
    readout.style.left = flip ? 'auto' : `${pxAbs + 14}px`;
    readout.style.right = flip ? `${rootRect.width - pxAbs + 14}px` : 'auto';
    readout.classList.add('is-visible');
    readout.innerHTML = '';
    const head = document.createElement('div');
    head.style.marginBottom = '4px';
    head.innerHTML = `<b>${fmtMonth(pt.date)}</b>`;
    readout.appendChild(head);
    const r = document.createElement('div');
    r.className = 'ro-row';
    r.innerHTML = `<span class="ro-lbl">Arrest rate · 12 mo</span><span class="ro-accent">${(pt.rate12 * 100).toFixed(1)}%</span>`;
    readout.appendChild(r);
  };

  const leave = () => {
    guide.attr('opacity', 0);
    dot.attr('opacity', 0);
    readout.classList.remove('is-visible');
  };

  hit.on('mousemove', move)
     .on('mouseleave', leave)
     .on('touchstart', (e) => { e.preventDefault(); move(e.touches[0]); }, { passive: false })
     .on('touchmove',  (e) => { e.preventDefault(); move(e.touches[0]); }, { passive: false })
     .on('touchend', leave);
}

function makeCaption(rows) {
  return rows.map(([lbl, val, kind]) => {
    const wrap = document.createElement('span');
    wrap.className = 'cap';
    const l = document.createElement('span');
    l.className = 'lbl';
    l.textContent = lbl;
    const v = document.createElement('span');
    v.className = `val${kind === 'accent' ? ' accent' : ''}`;
    v.textContent = val;
    wrap.append(l, v);
    return wrap;
  });
}

export function renderLaquanChart(_container, data) {
  // _container is the parent <div id="insight-chart-laquan">, kept for API
  // compatibility but unused — both charts mount into their own children.
  const zoomMount = document.getElementById('insight-chart-laquan-zoom');
  const fullMount = document.getElementById('insight-chart-laquan-full');
  const zoomCap   = document.getElementById('insight-caption-laquan-zoom');
  const fullCap   = document.getElementById('insight-caption-laquan-full');
  if (zoomMount) renderZoomChart(zoomMount, data, zoomCap);
  if (fullMount) renderFullChart(fullMount, data, fullCap);
}
