import { loadJSON } from './data.js';
import { renderLaquanChart } from './insights/laquan_chart.js';
import { renderLaquanTimeline } from './insights/laquan_timeline.js';

const STORIES = ['covid', 'laquan', 'blizzards'];

const fmtPct = (n, opts = {}) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  const v = Math.abs(n).toFixed(opts.decimals ?? 1);
  return `${sign}${v}%`;
};

const fmtPP = (n) => {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(1)} pp`;
};

const fmtRate = (r) => (r == null ? '—' : `${(r * 100).toFixed(1)}%`);

const fmtNum = new Intl.NumberFormat('en-US').format;

const fmtDate = (iso) => {
  if (!iso || iso.length < 10) return iso || '—';
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

function fillText(root, selector, value) {
  root.querySelectorAll(selector).forEach(el => { el.textContent = value; });
}

function markActiveCard(name) {
  document.querySelectorAll('.insight-card[data-insight]').forEach(card => {
    card.classList.toggle('insight-card--feature', card.dataset.insight === name);
  });
}

function showGrid() {
  const head = document.getElementById('insights-head');
  const grid = document.getElementById('insights-grid');
  head?.removeAttribute('hidden');
  grid?.removeAttribute('hidden');
  STORIES.forEach(s => document.getElementById(`insight-detail-${s}`)?.setAttribute('hidden', ''));
  markActiveCard(null);
  (head ?? grid)?.scrollIntoView({ block: 'start', behavior: 'auto' });
}

function showDetail(name) {
  document.getElementById('insights-grid')?.setAttribute('hidden', '');
  document.getElementById('insights-head')?.setAttribute('hidden', '');
  let active = null;
  STORIES.forEach(s => {
    const el = document.getElementById(`insight-detail-${s}`);
    if (!el) return;
    if (s === name) { el.removeAttribute('hidden'); active = el; }
    else el.setAttribute('hidden', '');
  });
  markActiveCard(name);
  active?.scrollIntoView({ block: 'start', behavior: 'auto' });
}

function populateCards(covid, laquan, blizzards) {
  const headlineEls = document.querySelectorAll('[data-headline]');
  headlineEls.forEach(el => {
    switch (el.dataset.headline) {
      case 'covid':
        el.textContent = fmtPct(covid.lockdown_drop_pct);
        break;
      case 'laquan':
        el.textContent = `${fmtRate(laquan.rate_before)} → ${fmtRate(laquan.rate_after)}`;
        break;
      case 'blizzards': {
        const deepest = blizzards.events.reduce((a, b) => (a.drop_pct < b.drop_pct ? a : b));
        el.textContent = fmtPct(deepest.drop_pct);
        break;
      }
    }
  });
}

function populateCovidDetail(d) {
  const root = document.getElementById('insight-detail-covid');
  if (!root) return;
  const set = (key, val) => fillText(root, `[data-covid="${key}"]`, val);
  set('lockdown-start', fmtDate(d.lockdown_window[0]));
  set('lockdown-end',   fmtDate(d.lockdown_window[1]));
  set('lockdown-actual', fmtNum(Math.round(d.lockdown_actual_mean)));
  set('lockdown-baseline', fmtNum(Math.round(d.lockdown_baseline_mean)));
  set('lockdown-drop', fmtPct(d.lockdown_drop_pct));
  set('floyd-peak-date', fmtDate(d.floyd_peak_date));
  set('floyd-peak-n', fmtNum(d.floyd_peak_n));
  set('floyd-peak-pct', fmtPct(d.floyd_peak_pct));
}

function populateLaquanDetail(d) {
  const root = document.getElementById('insight-detail-laquan');
  if (!root) return;
  const set = (key, val) => fillText(root, `[data-laquan="${key}"]`, val);
  set('volume-change', fmtPct(d.volume_change_pct));
  set('rate-before',   fmtRate(d.rate_before));
  set('rate-after',    fmtRate(d.rate_after));
  set('rate-drop',     fmtPP(d.rate_drop_pp));
  set('video-date',    fmtDate(d.video_date));

  const mount = document.getElementById('insight-chart-laquan');
  if (mount) {
    try {
      renderLaquanChart(mount, d);
    } catch (err) {
      console.error('laquan chart render failed', err);
    }
  }
  try {
    renderLaquanTimeline(document.getElementById('insight-timeline-laquan'));
  } catch (err) {
    console.error('laquan timeline render failed', err);
  }
}

function populateBlizzardsDetail(d) {
  const root = document.getElementById('insight-detail-blizzards');
  if (!root) return;
  const byYear = new Map();
  for (const ev of d.events) {
    const year = ev.event_start.slice(0, 4);
    byYear.set(year, ev);
  }
  ['2011', '2014', '2019'].forEach(y => {
    const ev = byYear.get(y);
    if (!ev) return;
    fillText(root, `[data-blizz="${y}-pct"]`, fmtPct(ev.drop_pct));
  });
}

function wireCards() {
  document.querySelectorAll('.insight-card[data-insight]').forEach(card => {
    card.addEventListener('click', () => showDetail(card.dataset.insight));
  });
  document.querySelectorAll('[data-back-to-insights]').forEach(btn => {
    btn.addEventListener('click', showGrid);
  });
}

export async function mountInsights() {
  if (!document.getElementById('insights-grid')) return;
  wireCards();
  try {
    const [covid, laquan, blizzards] = await Promise.all([
      loadJSON('insights_covid'),
      loadJSON('insights_laquan'),
      loadJSON('insights_blizzards'),
    ]);
    populateCards(covid, laquan, blizzards);
    populateCovidDetail(covid);
    populateLaquanDetail(laquan);
    populateBlizzardsDetail(blizzards);
  } catch (err) {
    console.error('insights: data load failed', err);
  }
}
