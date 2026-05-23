import * as d3 from 'd3';

const parseMonth = d3.timeParse('%Y-%m');
const fmtPct = d3.format('.0%');
const fmtVolAxis = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    ink:    v('--ink'),
    ink2:   v('--ink-2'),
    ink3:   v('--ink-3'),
    rule:   v('--rule'),
    accent: v('--accent'),
  };
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

  const VIEW_W = 960, VIEW_H = 380;
  const M = { top: 24, right: 64, bottom: 36, left: 64 };
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
    .attr('aria-label', 'Monthly volume and 12-month arrest rate, 2013 to 2018, with a marker at the November 2015 dashcam release');

  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  g.append('g').selectAll('line')
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
    .y(d => yVol(d.volume));

  const lineRate12 = d3.line()
    .defined(d => d.rate12 != null)
    .x(d => x(d.date))
    .y(d => yRate(d.rate12));

  g.append('path').datum(series)
    .attr('fill', 'none').attr('stroke', t.ink)
    .attr('stroke-width', 1.6).attr('d', lineVol);

  g.append('path').datum(series)
    .attr('fill', 'none').attr('stroke', t.accent)
    .attr('stroke-width', 2).attr('d', lineRate12);

  const eventDate = new Date(`${data.video_date}T12:00:00`);
  if (!Number.isNaN(eventDate.getTime())) {
    const xe = x(eventDate);
    g.append('line')
      .attr('x1', xe).attr('x2', xe).attr('y1', 0).attr('y2', innerH)
      .attr('stroke', t.ink).attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 4');
    g.append('text')
      .attr('x', xe + 6).attr('y', 14)
      .attr('fill', t.ink)
      .attr('font-family', 'var(--mono)').attr('font-size', 10)
      .attr('letter-spacing', '0.12em')
      .text('Nov 2015 — video released');
  }

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
  const VIEW_W = 960, VIEW_H = 320;
  const M = { top: 36, right: 24, bottom: 36, left: 56 };
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

  g.append('g').selectAll('line')
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
    .attr('y', -42).attr('x', -innerH / 2)
    .attr('text-anchor', 'middle')
    .attr('fill', t.accent)
    .attr('font-family', 'var(--mono)').attr('font-size', 10)
    .attr('letter-spacing', '0.14em')
    .text('ARREST RATE');

  const lineRate12 = d3.line()
    .defined(d => d.rate12 != null)
    .x(d => x(d.date))
    .y(d => yRate(d.rate12));

  g.append('path').datum(series)
    .attr('fill', 'none').attr('stroke', t.accent)
    .attr('stroke-width', 2).attr('d', lineRate12);

  const milestones = [
    { date: data.video_date,        label: 'Nov 2015 — Laquan McDonald video' },
    { date: data.consent_decree_date, label: 'Jan 2019 — Consent decree entered' },
  ];

  // Anchor each label at a height that does not overlap the curve at that x.
  const rateAt = (d) => {
    const target = d;
    let best = null;
    for (const pt of series) {
      if (pt.rate12 == null) continue;
      if (!best || Math.abs(pt.date - target) < Math.abs(best.date - target)) best = pt;
    }
    return best ? best.rate12 : null;
  };

  // Each label sits next to its own marker line. If the line is in the right
  // portion of the plot, the label flips to the left of the line so it can't
  // clip the right edge. The two labels stagger in y only when they're close
  // enough in x to risk collision.
  const placed = [];
  milestones.forEach((m) => {
    const d = new Date(`${m.date}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    const xe = x(d);
    g.append('line')
      .attr('x1', xe).attr('x2', xe).attr('y1', 0).attr('y2', innerH)
      .attr('stroke', t.ink).attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 4');

    const flipLeft = xe > innerW * 0.6;
    const collidesPrev = placed.some(p => Math.abs(p.xe - xe) < 180);
    const y = collidesPrev ? -8 : -22;

    g.append('text')
      .attr('x', flipLeft ? xe - 6 : xe + 6)
      .attr('y', y)
      .attr('text-anchor', flipLeft ? 'end' : 'start')
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
    ]));
  }
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
