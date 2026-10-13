/* Quest Log — pure game logic (no DOM). Works in browser (window.Quest) and node (module.exports). */
(function (root) {
  'use strict';

  const SIZES = {
    S: { label: 'Quick', xp: 10 },
    M: { label: 'Solid', xp: 25 },
    L: { label: 'Heavy', xp: 60 },
  };
  const BOSS_MULT = 3;
  const FOCUS_XP_PER_MIN = 1;
  const DAILY_GOAL = 3;

  const TITLES = [
    'Couch Goblin', 'Task Apprentice', 'Quest Taker', 'Grinder', 'Closer',
    'Workhorse', 'Finisher', 'Machine', 'Legend', 'Mythic Operator',
  ];

  const pad = (n) => String(n).padStart(2, '0');

  function dayKey(d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // Cumulative XP needed to *reach* level L (L1 = 0, L2 = 100, L3 = 300, L4 = 600 ...)
  function levelThreshold(L) { return 50 * L * (L - 1); }

  function levelInfo(xp) {
    let L = 1;
    while (xp >= levelThreshold(L + 1)) L++;
    const base = levelThreshold(L);
    const next = levelThreshold(L + 1);
    return { level: L, base, next, into: xp - base, span: next - base, pct: (xp - base) / (next - base) };
  }

  function titleFor(L) {
    return TITLES[Math.min(Math.floor((L - 1) / 2), TITLES.length - 1)];
  }

  function taskXp(size, boss) {
    const s = SIZES[size] || SIZES.M;
    return s.xp * (boss ? BOSS_MULT : 1);
  }

  // Streak = consecutive days with at least one activity, ending today (or yesterday if today is still empty).
  function streak(days, now) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function bestStreak(days) {
    const keys = [...days].sort();
    let best = 0, run = 0, prev = null;
    for (const k of keys) {
      const d = new Date(k + 'T12:00:00');
      if (prev && Math.round((d - prev) / 864e5) === 1) run++; else run = 1;
      if (run > best) best = run;
      prev = d;
    }
    return best;
  }

  const BADGES = [
    { id: 'first',   icon: 'sword',  name: 'First Blood',    desc: 'Complete your first quest',        test: (s) => s.done >= 1 },
    { id: 'hat',     icon: 'hat',    name: 'Hat Trick',      desc: 'Complete 3 quests in one day',     test: (s) => s.bestDay >= 3 },
    { id: 'ten',     icon: 'ten',    name: 'Double Digits',  desc: 'Complete 10 quests',               test: (s) => s.done >= 10 },
    { id: 'fifty',   icon: 'hammer', name: 'The Grind',      desc: 'Complete 50 quests',               test: (s) => s.done >= 50 },
    { id: 'boss1',   icon: 'boss',   name: 'Boss Slayer',    desc: 'Defeat a daily boss',              test: (s) => s.bosses >= 1 },
    { id: 'boss5',   icon: 'dragon', name: 'Dragon Hunter',  desc: 'Defeat 5 bosses',                  test: (s) => s.bosses >= 5 },
    { id: 'streak3', icon: 'flame',  name: 'On Fire',        desc: 'Reach a 3-day streak',             test: (s) => s.best >= 3 },
    { id: 'streak7', icon: 'bolt',   name: 'Week Warrior',   desc: 'Reach a 7-day streak',             test: (s) => s.best >= 7 },
    { id: 'streak30',icon: 'crown',  name: 'Unstoppable',    desc: 'Reach a 30-day streak',            test: (s) => s.best >= 30 },
    { id: 'focus1',  icon: 'target', name: 'Deep Diver',     desc: 'Finish a focus session',           test: (s) => s.focusSessions >= 1 },
    { id: 'focus10', icon: 'hourglass', name: 'Monk Mode',      desc: 'Focus for 10 hours total',         test: (s) => s.focusMin >= 600 },
    { id: 'lvl5',    icon: 'star',   name: 'Level 5',        desc: 'Reach level 5',                    test: (s) => s.level.level >= 5 },
  ];

  /**
   * tasks: all task records (including soft-deleted; completed ones keep their XP)
   * sessions: focus session records
   */
  function computeStats(tasks, sessions, now) {
    now = now || new Date();
    const today = dayKey(now);
    const days = new Set();
    const perDay = {};
    let totalXp = 0, done = 0, bosses = 0, doneToday = 0, xpToday = 0, focusMin = 0;

    for (const t of tasks) {
      if (!t.completed_at) continue;
      done++;
      totalXp += t.xp || 0;
      const k = dayKey(t.completed_at);
      days.add(k);
      perDay[k] = (perDay[k] || 0) + 1;
      if (t.boss_win) bosses++;
      if (k === today) { doneToday++; xpToday += t.xp || 0; }
    }
    for (const s of sessions) {
      totalXp += s.xp || 0;
      focusMin += s.minutes || 0;
      const k = dayKey(s.created_at);
      days.add(k);
      if (k === today) xpToday += s.xp || 0;
    }

    const st = {
      totalXp,
      level: levelInfo(totalXp),
      done, bosses, doneToday, xpToday, focusMin,
      focusSessions: sessions.length,
      days,
      streak: streak(days, now),
      best: bestStreak(days),
      bestDay: Math.max(0, ...Object.values(perDay)),
    };
    st.badges = new Set(BADGES.filter((b) => b.test(st)).map((b) => b.id));
    return st;
  }

  const api = {
    SIZES, BOSS_MULT, FOCUS_XP_PER_MIN, DAILY_GOAL, BADGES,
    dayKey, levelThreshold, levelInfo, titleFor, taskXp, streak, bestStreak, computeStats,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Quest = api;
})(typeof window !== 'undefined' ? window : globalThis);
