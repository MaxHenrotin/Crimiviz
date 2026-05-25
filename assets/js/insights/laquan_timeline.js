// Vertical event timeline for the Laquan detail article.
// Each entry is a dated fact from the public record. Edit the EVENTS array
// below to change wording, dates, or order. Dates display as written —
// they are not parsed, so any short form ("Oct 20, 2014", "Late Nov 2015")
// reads fine.

// Each `stat` describes the event itself (count or duration computed from
// the verified dates) — never an arrest-rate / volume figure that could
// be misread as caused by the event. Events without a verified number
// simply carry no stat.
const EVENTS = [
  {
    date: 'Oct 20, 2014',
    title: 'The shooting',
    body: 'Officer Jason Van Dyke fires sixteen rounds at seventeen-year-old Laquan McDonald on South Pulaski Road. Dashcam footage is taken into evidence.',
    stat: '16 shots fired',
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
    stat: '400 days after the shooting',
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
    stat: '7 days after the video',
  },
  {
    date: 'Dec 7, 2015',
    title: 'DOJ civil-rights probe opens',
    body: 'The U.S. Department of Justice announces a pattern-or-practice investigation into the Chicago Police Department.',
    stat: '→ 164-page DOJ report, Jan 2017',
  },
  {
    date: 'Jan 31, 2019',
    title: 'Consent decree entered',
    body: 'A federal court enters a consent decree governing CPD reforms, more than three years after the arrest-rate line had already settled at its new level.',
    stat: '~3 years after the video',
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
  if (ev.stat) {
    const s = document.createElement('span');
    s.className = 'insight-timeline__stat';
    s.textContent = ev.stat;
    body.append(s);
  }

  li.append(dot, date, body);
  return li;
}

export function renderLaquanTimeline(mount) {
  if (!mount) return;
  while (mount.firstChild) mount.removeChild(mount.firstChild);

  // Drawn axis — sits behind the dots. A second element overlays it from
  // the top and grows as the reader scrolls, so the line itself shows
  // reading progress.
  const axis = document.createElement('span');
  axis.className = 'insight-timeline__axis';
  axis.setAttribute('aria-hidden', 'true');
  const axisFill = document.createElement('span');
  axisFill.className = 'insight-timeline__axis-fill';
  axis.appendChild(axisFill);
  mount.appendChild(axis);

  const items = EVENTS.map(buildItem);
  items.forEach(li => mount.appendChild(li));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach(li => li.classList.add('is-revealed', 'is-active'));
    axisFill.style.height = '100%';
    return;
  }

  // First reveal — fade-up as each item enters the viewport. Small stagger
  // for the first few so the opening of the timeline feels read-in, not
  // pop-in.
  const revealIO = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const idx = items.indexOf(entry.target);
      const delay = Math.min(idx, 3) * 80;
      setTimeout(() => entry.target.classList.add('is-revealed'), delay);
      revealIO.unobserve(entry.target);
    }
  }, { threshold: 0.3, rootMargin: '0px 0px -8% 0px' });
  items.forEach(li => revealIO.observe(li));

  // Scroll-driven axis fill — measured each rAF against the dot positions
  // so the fill always ends at the last dot the reader has scrolled past.
  // The "reading line" sits at 55% of the viewport so the fill leads the
  // active item slightly, mirroring how the eye works ahead of the cursor.
  const READING_LINE_RATIO = 0.55;
  let rafScheduled = false;

  function update() {
    rafScheduled = false;
    const reading = window.innerHeight * READING_LINE_RATIO;
    const axisRect = axis.getBoundingClientRect();
    if (axisRect.height <= 0) return;

    let lastActiveTop = -Infinity;
    items.forEach((li) => {
      const dot = li.querySelector('.insight-timeline__dot');
      if (!dot) return;
      const dotRect = dot.getBoundingClientRect();
      const dotCenter = dotRect.top + dotRect.height / 2;
      const isActive = dotCenter <= reading;
      li.classList.toggle('is-active', isActive);
      if (isActive && dotCenter > lastActiveTop) lastActiveTop = dotCenter;
    });

    let fillPx;
    if (lastActiveTop === -Infinity) {
      fillPx = Math.max(0, Math.min(axisRect.height, reading - axisRect.top));
    } else {
      fillPx = Math.max(0, Math.min(axisRect.height, lastActiveTop - axisRect.top));
    }
    axisFill.style.height = `${fillPx}px`;
  }

  function schedule() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  schedule();
}
