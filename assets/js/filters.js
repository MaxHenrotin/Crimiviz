const ALL_YEARS = Array.from({ length: 25 }, (_, i) => 2002 + i);

export const state = {
  type: 'ALL',
  hour: 'ALL',
  years: new Set(ALL_YEARS),
};

export function setYears(years) {
  state.years = years instanceof Set ? years : new Set(years);
  emit();
}

export function isAllYears() {
  return state.years.size === ALL_YEARS.length;
}

const listeners = new Set();

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach(fn => fn(state));
}

export function setType(value) {
  state.type = value || 'ALL';
  emit();
}

export function setHour(value) {
  if (value === null || value === undefined || value === '' || value === 'ALL') {
    state.hour = 'ALL';
  } else if (typeof value === 'object' && value.start !== undefined && value.end !== undefined) {
    if (value.start === 0 && value.end === 23) state.hour = 'ALL';
    else state.hour = { start: value.start, end: value.end };
  } else {
    const n = parseInt(value, 10);
    state.hour = isNaN(n) ? 'ALL' : { start: n, end: n };
  }
  emit();
}

export function reset() {
  state.type = 'ALL';
  state.hour = 'ALL';
  state.years = new Set(ALL_YEARS);
  emit();
}
