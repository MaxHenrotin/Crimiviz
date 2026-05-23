// Vertical event timeline for the Laquan detail article.
// Each entry is a dated fact from the public record. Edit the EVENTS array
// below to change wording, dates, or order. Dates display as written —
// they are not parsed, so any short form ("Oct 20, 2014", "Late Nov 2015")
// reads fine.

const EVENTS = [
  {
    date: 'Oct 20, 2014',
    title: 'The shooting',
    body: 'Officer Jason Van Dyke fires sixteen rounds at seventeen-year-old Laquan McDonald on South Pulaski Road. Dashcam footage is taken into evidence.',
  },
  {
    date: '2015 (year-long)',
    title: 'The fight to release the video',
    body: 'A freelance journalist sues for the dashcam footage under the Illinois Freedom of Information Act. The city resists. The case moves through the Cook County courts for most of the year.',
  },
  {
    date: 'Nov 24, 2015',
    title: 'Video released — officer charged',
    body: 'Hours before a court-ordered deadline, the Cook County State\'s Attorney charges Van Dyke with first-degree murder. The video is published the same day.',
  },
  {
    date: 'Late Nov 2015',
    title: 'Protests',
    body: 'Demonstrations close Michigan Avenue on Black Friday and continue downtown for several weeks.',
  },
  {
    date: 'Dec 1, 2015',
    title: 'Superintendent fired',
    body: 'Mayor Rahm Emanuel requests and accepts the resignation of police superintendent Garry McCarthy.',
  },
  {
    date: 'Dec 7, 2015',
    title: 'DOJ civil-rights probe opens',
    body: 'The U.S. Department of Justice announces a pattern-or-practice investigation into the Chicago Police Department.',
  },
  {
    date: 'Jan 31, 2019',
    title: 'Consent decree entered',
    body: 'A federal court enters a consent decree governing CPD reforms, more than three years after the arrest-rate line had already settled at its new level.',
  },
];

function buildItem(ev) {
  const li = document.createElement('li');
  li.className = 'insight-timeline__item';

  const dot = document.createElement('span');
  dot.className = 'insight-timeline__dot';
  dot.setAttribute('aria-hidden', 'true');

  const date = document.createElement('span');
  date.className = 'insight-timeline__date';
  date.textContent = ev.date;

  const body = document.createElement('div');
  body.className = 'insight-timeline__body';
  const h = document.createElement('h5');
  h.textContent = ev.title;
  const p = document.createElement('p');
  p.textContent = ev.body;
  body.append(h, p);

  li.append(dot, date, body);
  return li;
}

export function renderLaquanTimeline(mount) {
  if (!mount) return;
  while (mount.firstChild) mount.removeChild(mount.firstChild);

  const items = EVENTS.map(buildItem);
  items.forEach(li => mount.appendChild(li));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach(li => li.classList.add('is-revealed'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const idx = items.indexOf(entry.target);
      const delay = Math.min(idx, 3) * 80;
      setTimeout(() => entry.target.classList.add('is-revealed'), delay);
      io.unobserve(entry.target);
    }
  }, { threshold: 0.35, rootMargin: '0px 0px -10% 0px' });

  items.forEach(li => io.observe(li));
}
