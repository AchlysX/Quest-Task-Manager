/* Quest Log — inline SVG icon set (no emoji, no icon font, works offline).
   24×24 grid, 2px round strokes, drawn in currentColor so icons follow the text colour.
   Usage: Quest.icon('flame') returns an <svg> string. Works in browser (window.Quest) and node (module.exports). */
(function (root) {
  'use strict';

  const P = {
    /* brand + navigation */
    bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    medal: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',

    /* actions + status */
    check: '<path d="M20 6 9 17l-5-5" stroke-width="3"/>',
    play: '<polygon points="7 4 20 12 7 20 7 4" fill="currentColor"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'sound-on': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    'sound-off': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
    install: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',

    /* game */
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    // horned mask: the daily boss
    boss: '<path d="M8.6 6.4C5.6 6.2 3.6 4.6 3 2c-.6 3.6.6 6.2 3.4 7.4"/><path d="M15.4 6.4c3-.2 5-1.8 5.6-4.4.6 3.6-.6 6.2-3.4 7.4"/><path d="M6.4 9.4C7.4 7 9.5 5.5 12 5.5s4.6 1.5 5.6 3.9c.5 1.2.4 2.9.4 4.1 0 4.2-2.6 8.5-6 8.5s-6-4.3-6-8.5c0-1.2-.1-2.9.4-4.1z"/><path d="m8.5 11.5 2.5 1.5"/><path d="m15.5 11.5-2.5 1.5"/><path d="M9.5 17h5"/><path d="M10.5 17v1.5"/><path d="M13.5 17v1.5"/>',
    // slit-pupil eye: dragon
    dragon: '<path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z"/><path d="M12 7.5c-1.7 1.8-1.7 7.2 0 9 1.7-1.8 1.7-7.2 0-9z" fill="currentColor"/><path d="M5 5.5 6.5 7.5"/><path d="M12 2v1.5"/><path d="M19 5.5 17.5 7.5"/>',
    sword: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/>',
    hat: '<path d="M2 18.5h20"/><path d="M6 18.5V6.5C6 5.4 8.7 4.5 12 4.5s6 .9 6 2v12"/><path d="M6 14h12"/>',
    ten: '<path d="M3.5 8.5 7 6v12"/><ellipse cx="15.5" cy="12" rx="4.5" ry="6"/>',
    hammer: '<path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0a2.12 2.12 0 0 1 0-3L12 9"/><path d="M17.64 15 22 10.64"/><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/>',
    crown: '<path d="m2 5 3 11h14l3-11-6 6-4-7-4 7-6-6z"/><path d="M5 20h14"/>',
    hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  };

  function icon(name, cls) {
    return '<svg class="i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (P[name] || '') + '</svg>';
  }

  const api = { icon, ICONS: Object.keys(P) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Quest = Object.assign(root.Quest || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
