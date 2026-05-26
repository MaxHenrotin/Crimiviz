import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { loadJSON } from './data.js';
import { state, setType, setHour, setYears, onChange } from './filters.js';
import { mountMap } from './map/map.js';
import { mountInsights } from './insights.js';

window.__crimiviz = { d3, topojson, state };

const typeTrigger = document.getElementById('filter-type');
const typeMenu = document.getElementById('filter-type-menu');
const typeLabel = typeTrigger?.querySelector('.select-label');

function openTypeMenu() {
  if (!typeMenu) return;
  typeMenu.hidden = false;
  typeTrigger.setAttribute('aria-expanded', 'true');
  const sel = typeMenu.querySelector('li[aria-selected="true"]');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}
function closeTypeMenu() {
  if (!typeMenu) return;
  typeMenu.hidden = true;
  typeTrigger.setAttribute('aria-expanded', 'false');
}
if (typeTrigger && typeMenu) {
  typeTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    typeMenu.hidden ? openTypeMenu() : closeTypeMenu();
  });
  document.addEventListener('click', (e) => {
    if (!typeMenu.hidden && !typeMenu.contains(e.target) && e.target !== typeTrigger) closeTypeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !typeMenu.hidden) closeTypeMenu();
  });
  typeMenu.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-value]');
    if (!li) return;
    const value = li.dataset.value;
    typeTrigger.dataset.value = value;
    if (typeLabel) {
      const nameSpan = li.querySelector('.select-opt-name');
      typeLabel.textContent = nameSpan ? nameSpan.textContent : li.textContent;
    }
    typeMenu.querySelectorAll('li').forEach(x => x.setAttribute('aria-selected', x === li ? 'true' : 'false'));
    setType(value);
    closeTypeMenu();
  });
}

document.addEventListener('crimiviz:years-changed', () => {
  const minEl = document.getElementById('filter-year-min');
  const maxEl = document.getElementById('filter-year-max');
  if (!minEl || !maxEl) return;
  let a = parseInt(minEl.value, 10);
  let b = parseInt(maxEl.value, 10);
  if (a > b) [a, b] = [b, a];
  const active = new Set();
  for (let y = a; y <= b; y++) active.add(y);
  setYears(active);
});

document.addEventListener('crimiviz:hours-changed', () => {
  const minEl = document.getElementById('filter-hour-min');
  const maxEl = document.getElementById('filter-hour-max');
  if (!minEl || !maxEl) return;
  let a = parseInt(minEl.value, 10);
  let b = parseInt(maxEl.value, 10);
  if (a > b) [a, b] = [b, a];
  setHour(a === 0 && b === 23 ? 'ALL' : { start: a, end: b });
});

onChange(s => {
  console.debug('filters', s);
});

mountMap();
mountInsights();

loadJSON('meta').then(meta => {
  console.info(`crimiviz · ${meta.total_rows.toLocaleString()} rows · ${meta.min_date.slice(0,10)} → ${meta.max_date.slice(0,10)}`);
});

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const fmtCount = new Intl.NumberFormat('en-US').format;

loadJSON('crime_types').then(rows => {
  if (!typeMenu || !Array.isArray(rows)) return;
  const counts = new Map();
  for (const r of rows) {
    if (r.type === 'DOMESTIC VIOLENCE') continue;
    const key = r.type === 'CRIM SEXUAL ASSAULT' ? 'CRIMINAL SEXUAL ASSAULT' : r.type;
    counts.set(key, (counts.get(key) || 0) + (r.n || 0));
  }
  const sorted = [...counts.entries()]
    .map(([type, n]) => ({ type, n }))
    .sort((a, b) => b.n - a.n);
  const all = document.createElement('li');
  all.dataset.value = 'ALL';
  all.setAttribute('role', 'option');
  all.setAttribute('aria-selected', 'true');
  all.textContent = 'All categories';
  typeMenu.appendChild(all);
  for (const r of sorted) {
    const li = document.createElement('li');
    li.dataset.value = r.type;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    const name = document.createElement('span');
    name.className = 'select-opt-name';
    name.textContent = titleCase(r.type);
    const num = document.createElement('span');
    num.className = 'select-opt-num';
    num.textContent = fmtCount(r.n);
    li.appendChild(name);
    li.appendChild(num);
    typeMenu.appendChild(li);
  }
});
