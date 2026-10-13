/* Quest Log — gamified to-do PWA. Offline-first, syncs to Supabase when configured. */
(() => {
  'use strict';

  const Q = window.Quest;
  const CFG = window.APP_CONFIG || {};
  const configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const LOCAL_MODE = !configured;
  const sb = configured && window.supabase
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;

  /* ------------------------------------------------------------------ helpers */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mq = (q) => (window.matchMedia ? window.matchMedia(q).matches : false);
  const uid = () =>
    window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 3) | 8).toString(16);
        });
  const LS = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const fmtDur = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  const fmtMin = (m) => (m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm');
  const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));
  function fmtDue(due) {
    const today = Q.dayKey(new Date());
    const d = new Date(due + 'T12:00:00');
    const t = new Date(); t.setHours(12, 0, 0, 0);
    const diff = Math.round((d - t) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + (due < today ? ' (late)' : '');
  }

  /* ------------------------------------------------------------------ state */
  let user = null;
  let db = null; // { tasks:{id:rec}, sessions:{id:rec}, cursor:{tasks,sessions} }
  let timer = null; // { end, minutes, taskId }
  const ui = {
    tab: 'quests', openRow: null, showDone: false,
    size: 'M', draft: '', due: '',
    focusMin: 25, focusTask: '', justFinished: null,
    sync: { state: 'idle', at: null, err: '' },
  };

  const dataKey = () => 'quest:data:' + user.id;
  const timerKey = () => 'quest:timer:' + user.id;

  function loadDb() {
    const d = LS.get(dataKey());
    db = d && d.tasks ? d : { tasks: {}, sessions: {}, cursor: { tasks: null, sessions: null } };
    db.sessions = db.sessions || {};
    db.cursor = db.cursor || { tasks: null, sessions: null };
  }
  const saveDb = () => LS.set(dataKey(), db);
  const allTasks = () => Object.values(db.tasks);
  const liveTasks = () => allTasks().filter((t) => !t.deleted);
  const allSessions = () => Object.values(db.sessions);
  const stats = () => Q.computeStats(allTasks(), allSessions(), new Date());
  const pending = () => allTasks().concat(allSessions()).filter((r) => r._dirty).length;

  function touch(table, rec) {
    rec._v = (rec._v || 0) + 1;
    rec._dirty = 1;
    db[table][rec.id] = rec;
  }
  function commit() { saveDb(); render(); scheduleSync(); }

  /* ------------------------------------------------------------------ task actions */
  function addTask(title, size, due) {
    title = (title || '').trim();
    if (!title) return;
    touch('tasks', {
      id: uid(), title, size: Q.SIZES[size] ? size : 'M', due: due || null, boss_date: null,
      created_at: new Date().toISOString(), completed_at: null, xp: 0, boss_win: false, deleted: false,
    });
    commit();
  }

  function toggleDone(id) {
    const t = db.tasks[id];
    if (!t) return;
    if (t.completed_at) {
      t.completed_at = null; t.xp = 0; t.boss_win = false;
      touch('tasks', t); commit();
      return;
    }
    const before = stats();
    const isBoss = t.boss_date === Q.dayKey(new Date());
    t.completed_at = new Date().toISOString();
    t.xp = Q.taskXp(t.size, isBoss);
    t.boss_win = isBoss;
    touch('tasks', t);
    saveDb();
    celebrate(before, t.xp, isBoss ? 'Boss defeated!' : null);
    render();
    scheduleSync();
  }

  function setBoss(id) {
    const today = Q.dayKey(new Date());
    const t = db.tasks[id];
    if (!t || t.completed_at) return;
    if (t.boss_date === today) {
      t.boss_date = null; touch('tasks', t);
    } else {
      liveTasks().forEach((o) => { if (o.boss_date === today && !o.completed_at) { o.boss_date = null; touch('tasks', o); } });
      t.boss_date = today; touch('tasks', t);
      toast('👹 Boss set. ×3 XP if you beat it today');
    }
    ui.openRow = null;
    commit();
  }

  function deleteTask(id) {
    const t = db.tasks[id];
    if (!t) return;
    t.deleted = true; touch('tasks', t);
    ui.openRow = null;
    commit();
  }

  /* ------------------------------------------------------------------ rewards / fx */
  function celebrate(before, gained, headline) {
    const after = stats();
    burst(headline ? 150 : 60);
    sfx(headline ? 'win' : 'ok');
    toast('+' + gained + ' XP' + (headline ? ' · ' + headline : ''));
    const fresh = Q.BADGES.filter((b) => after.badges.has(b.id) && !before.badges.has(b.id));
    if (after.level.level > before.level.level) showLevelUp(after, fresh);
    else fresh.forEach((b, i) => setTimeout(() => toast(b.icon + ' Badge: ' + b.name, 'badge-t'), 700 + i * 900));
  }

  function toast(text, cls) {
    const el = document.createElement('div');
    el.className = 'toast ' + (cls || '');
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  let actx = null;
  const muted = () => LS.get('quest:mute', false);
  function sfx(kind) {
    if (muted()) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      const seq = kind === 'win' ? [523, 659, 784, 1047] : [660, 880];
      seq.forEach((f, i) => {
        const t0 = actx.currentTime + i * 0.09;
        const o = actx.createOscillator(); const g = actx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        o.connect(g); g.connect(actx.destination);
        o.start(t0); o.stop(t0 + 0.22);
      });
    } catch (e) {}
  }

  const fx = $('#fx');
  const fctx = fx.getContext ? fx.getContext('2d') : null;
  let parts = [], raf = null;
  function burst(n) {
    if (!fctx || mq('(prefers-reduced-motion: reduce)')) return;
    fx.width = window.innerWidth; fx.height = window.innerHeight;
    const colors = ['#fbbf24', '#8b5cf6', '#34d399', '#fb7185', '#60a5fa', '#fff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
      parts.push({
        x: fx.width / 2, y: fx.height * 0.38, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5,
        s: 4 + Math.random() * 6, c: colors[(Math.random() * colors.length) | 0], r: Math.random() * 6, life: 70 + Math.random() * 40,
      });
    }
    if (!raf) raf = requestAnimationFrame(stepFx);
  }
  function stepFx() {
    fctx.clearRect(0, 0, fx.width, fx.height);
    parts = parts.filter((p) => p.life > 0);
    parts.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.28; p.vx *= 0.99; p.r += 0.2; p.life--;
      fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.r);
      fctx.globalAlpha = Math.min(1, p.life / 30);
      fctx.fillStyle = p.c; fctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      fctx.restore();
    });
    if (parts.length) raf = requestAnimationFrame(stepFx);
    else { raf = null; fctx.clearRect(0, 0, fx.width, fx.height); }
  }

  /* ------------------------------------------------------------------ modal */
  function modal(html) {
    const m = $('#modal');
    m.innerHTML = '<div class="sheet">' + html + '</div>';
    m.hidden = false;
  }
  function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  function showLevelUp(after, freshBadges) {
    burst(220); sfx('win');
    modal(
      '<div class="lvl"><div class="muted small">LEVEL UP</div><div class="big-n">' + after.level.level + '</div>' +
      '<h2>' + esc(Q.titleFor(after.level.level)) + '</h2>' +
      (freshBadges.length ? '<div class="muted">New badge' + (freshBadges.length > 1 ? 's' : '') + ': ' + freshBadges.map((b) => b.icon + ' ' + esc(b.name)).join(', ') + '</div>' : '') +
      '<button class="btn primary big" data-act="closeModal">Keep going</button></div>'
    );
  }

  function openEdit(id) {
    const t = db.tasks[id];
    if (!t) return;
    modal(
      '<h3>Edit quest</h3>' +
      '<label>Title<input id="eTitle" value="' + esc(t.title) + '" maxlength="140"></label>' +
      (t.completed_at ? '' : '<label>Size<select id="eSize">' + Object.keys(Q.SIZES).map((k) => '<option value="' + k + '"' + (t.size === k ? ' selected' : '') + '>' + Q.SIZES[k].label + ' (' + Q.SIZES[k].xp + ' XP)</option>').join('') + '</select></label>') +
      '<label>Due date<input id="eDue" type="date" value="' + esc(t.due || '') + '"></label>' +
      '<div class="row end"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="eSave">Save</button></div>'
    );
    $('#eSave').onclick = () => {
      const title = $('#eTitle').value.trim();
      if (!title) return;
      t.title = title;
      if ($('#eSize')) t.size = $('#eSize').value;
      t.due = $('#eDue').value || null;
      touch('tasks', t);
      closeModal(); ui.openRow = null; commit();
    };
  }

  /* ------------------------------------------------------------------ focus timer */
  let tickId = null;
  function ensureTick() { if (!tickId) tickId = setInterval(tick, 250); }
  function startTimer() {
    timer = { end: Date.now() + ui.focusMin * 60000, minutes: ui.focusMin, taskId: ui.focusTask || null };
    ui.justFinished = null;
    LS.set(timerKey(), timer);
    ensureTick();
    render();
  }
  function giveUp() {
    if (!window.confirm('Give up this session? Abandoned sessions pay no XP.')) return;
    timer = null; LS.del(timerKey()); document.title = 'Quest Log'; render();
  }
  function finishTimer() {
    const t = timer;
    if (!t) return;
    timer = null; LS.del(timerKey()); document.title = 'Quest Log';
    const before = stats();
    const rec = { id: uid(), minutes: t.minutes, task_id: t.taskId, xp: t.minutes * Q.FOCUS_XP_PER_MIN, created_at: new Date().toISOString() };
    touch('sessions', rec); saveDb();
    celebrate(before, rec.xp, 'Focus session complete!');
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
    ui.justFinished = { taskId: t.taskId, minutes: t.minutes, xp: rec.xp };
    render(); scheduleSync();
  }
  function tick() {
    if (!timer) { clearInterval(tickId); tickId = null; return; }
    const left = timer.end - Date.now();
    if (left <= 0) { finishTimer(); return; }
    const str = fmtDur(left);
    const el = $('#timerText'); if (el) el.textContent = str;
    const ring = $('#timerRing'); if (ring) ring.style.setProperty('--p', String(1 - left / (timer.minutes * 60000)));
    document.title = str + ' · Quest Log';
  }

  /* ------------------------------------------------------------------ rendering */
  const NAV = [
    { id: 'quests', icon: '⚔️', label: 'Quests' },
    { id: 'focus', icon: '🎯', label: 'Focus' },
    { id: 'hero', icon: '🏅', label: 'Hero' },
  ];

  function render() {
    if (!user) return;
    const a = document.activeElement;
    const keep = a && a.id === 'newTitle' ? { s: a.selectionStart, e: a.selectionEnd } : null;
    const navHtml = NAV.map((n) =>
      '<button class="nav-b ' + (ui.tab === n.id ? 'on' : '') + '" data-act="tab" data-tab="' + n.id + '"><span class="ic">' + n.icon + '</span><span>' + n.label + '</span></button>'
    ).join('');
    $('#sideNav').innerHTML = navHtml;
    $('#tabbar').innerHTML = navHtml;
    renderHud();
    $('#view').innerHTML = ui.tab === 'quests' ? viewQuests() : ui.tab === 'focus' ? viewFocus() : viewHero();
    if (keep) {
      const i = $('#newTitle');
      if (i) { i.focus(); try { i.setSelectionRange(keep.s, keep.e); } catch (e) {} }
    }
    if (timer) tick();
  }

  function syncPill() {
    const p = pending();
    const s = ui.sync.state;
    if (LOCAL_MODE) return '<span class="pill warn">Local only</span>';
    if (s === 'syncing') return '<span class="pill">Syncing…</span>';
    if (s === 'offline') return '<span class="pill warn">Offline' + (p ? ' · ' + p + ' pending' : '') + '</span>';
    if (s === 'error') return '<span class="pill bad">Sync error' + (p ? ' · ' + p + ' pending' : '') + '</span>';
    if (s === 'synced' && !p) return '<span class="pill ok">✓ Synced</span>';
    return '<span class="pill">' + (p ? p + ' pending' : '…') + '</span>';
  }

  function renderHud() {
    const s = stats(); const L = s.level; const goal = Q.DAILY_GOAL;
    $('#hud').innerHTML =
      '<div class="hud-top"><div class="orb">' + L.level + '</div>' +
      '<div class="hud-id"><div class="hud-title">' + esc(Q.titleFor(L.level)) + '</div>' +
      '<div class="muted small">Level ' + L.level + ' · ' + s.totalXp + ' XP total</div></div>' +
      '<div class="chip fire" title="Current streak">🔥 ' + s.streak + '</div></div>' +
      '<div class="bar"><i style="width:' + Math.round(L.pct * 100) + '%"></i></div>' +
      '<div class="hud-row"><span class="small muted">' + L.into + ' / ' + L.span + ' XP to level ' + (L.level + 1) + '</span>' +
      '<span class="small">Today ' + Math.min(s.doneToday, goal) + '/' + goal + ' ✔' + syncPill() + '</span></div>';
  }

  function taskSort(a, b) {
    const today = Q.dayKey(new Date());
    const ab = a.boss_date === today ? 0 : 1, bb = b.boss_date === today ? 0 : 1;
    if (ab !== bb) return ab - bb;
    const ad = a.due || '9999', bd = b.due || '9999';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  }

  function taskRow(t, today) {
    const done = !!t.completed_at;
    const isBoss = t.boss_date === today && !done;
    const overdue = t.due && t.due < today && !done;
    const dodged = daysSince(t.created_at);
    const open = ui.openRow === t.id;
    const id = esc(t.id);
    return (
      '<li class="task ' + (done ? 'done' : '') + (isBoss ? ' is-boss' : '') + '">' +
      '<button class="check" data-act="toggle" data-id="' + id + '" aria-label="' + (done ? 'Mark not done' : 'Complete quest') + '">' + (done ? '✓' : '') + '</button>' +
      '<div class="t-body" data-act="more" data-id="' + id + '">' +
      '<div class="t-title">' + (isBoss ? '👹 ' : '') + esc(t.title) + '</div>' +
      '<div class="t-meta"><span class="tag s-' + t.size + '">' + Q.SIZES[t.size].label + ' · ' + (done ? t.xp : Q.taskXp(t.size, isBoss)) + ' XP</span>' +
      (t.due ? '<span class="tag ' + (overdue ? 'late' : '') + '">📅 ' + esc(fmtDue(t.due)) + '</span>' : '') +
      (!done && dodged >= 2 ? '<span class="tag dodge">dodged ' + dodged + 'd</span>' : '') +
      '</div></div>' +
      '<button class="more" data-act="more" data-id="' + id + '" aria-label="More actions">⋯</button>' +
      (open
        ? '<div class="t-actions">' +
          (done ? '' : '<button class="btn sm" data-act="boss" data-id="' + id + '">' + (isBoss ? 'Unset boss' : '👹 Make boss') + '</button>' +
            '<button class="btn sm" data-act="focus-task" data-id="' + id + '">▶ Focus</button>') +
          '<button class="btn sm" data-act="edit" data-id="' + id + '">✎ Edit</button>' +
          '<button class="btn sm danger" data-act="delete" data-id="' + id + '">🗑 Delete</button></div>'
        : '') +
      '</li>'
    );
  }

  function bossCard(active, today) {
    const boss = active.find((t) => t.boss_date === today);
    if (boss) {
      const d = daysSince(boss.created_at);
      return (
        '<div class="card boss"><div class="boss-tag">👹 TODAY\'S BOSS · ×' + Q.BOSS_MULT + ' XP</div>' +
        '<div class="boss-title">' + esc(boss.title) + '</div>' +
        '<div class="muted small">Worth ' + Q.taskXp(boss.size, true) + ' XP' + (d >= 2 ? ' · dodged for ' + d + ' days' : '') + '</div>' +
        '<div class="row"><button class="btn primary" data-act="toggle" data-id="' + esc(boss.id) + '">⚔️ Defeat it</button>' +
        '<button class="btn" data-act="focus-task" data-id="' + esc(boss.id) + '">▶ Focus on it</button></div></div>'
      );
    }
    const won = allTasks().some((t) => t.boss_win && t.completed_at && Q.dayKey(t.completed_at) === today);
    if (won) return '<div class="card boss won"><div class="boss-tag">🏆 BOSS DEFEATED</div><div class="boss-title">Today is a win.</div><div class="muted small">Everything else is bonus XP.</div></div>';
    if (active.length) {
      const oldest = active.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
      return (
        '<div class="card boss idle"><div class="boss-tag">PICK TODAY\'S BOSS</div>' +
        '<div class="muted">Choose the quest you\'ve been avoiding the longest. Beating it pays ×' + Q.BOSS_MULT + ' XP.</div>' +
        '<div><button class="btn primary" data-act="boss" data-id="' + esc(oldest.id) + '">👹 Fight: ' + esc(oldest.title.length > 40 ? oldest.title.slice(0, 40) + '…' : oldest.title) + (daysSince(oldest.created_at) >= 1 ? ' (' + daysSince(oldest.created_at) + 'd old)' : '') + '</button></div>' +
        '<div class="muted small">Or open ⋯ on any quest and tap "Make boss".</div></div>'
      );
    }
    return '<div class="card boss idle"><div class="boss-tag">NO BOSS YET</div><div class="muted">Add your quests below, then pick the scariest one as today\'s boss.</div></div>';
  }

  function weekDots(s) {
    const out = [];
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - 6);
    for (let i = 0; i < 7; i++) {
      const k = Q.dayKey(d);
      out.push('<div class="day"><div class="dot ' + (s.days.has(k) ? 'on' : '') + (i === 6 ? ' today' : '') + '">' + (s.days.has(k) ? '✓' : '') + '</div>' + d.toLocaleDateString(undefined, { weekday: 'narrow' }) + '</div>');
      d.setDate(d.getDate() + 1);
    }
    return out.join('');
  }

  function viewQuests() {
    const today = Q.dayKey(new Date());
    const s = stats();
    const active = liveTasks().filter((t) => !t.completed_at).sort(taskSort);
    const done = liveTasks().filter((t) => t.completed_at).sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1)).slice(0, 60);
    const nextBadge = Q.BADGES.find((b) => !s.badges.has(b.id));
    return (
      '<div class="q-grid"><div class="stack">' +
      bossCard(active, today) +
      '<form id="addForm" class="card add" autocomplete="off">' +
      '<input id="newTitle" placeholder="New quest. What\'s the next concrete step?" value="' + esc(ui.draft) + '" maxlength="140" enterkeyhint="done">' +
      '<div class="add-row"><div class="seg">' +
      Object.keys(Q.SIZES).map((k) => '<button type="button" class="seg-b ' + (ui.size === k ? 'on' : '') + '" data-act="size" data-k="' + k + '">' + Q.SIZES[k].label + '<small>' + Q.SIZES[k].xp + ' xp</small></button>').join('') +
      '</div><input id="newDue" type="date" value="' + esc(ui.due) + '" aria-label="Due date"><button class="btn primary" type="submit">Add</button></div></form>' +
      '<div class="section-h"><span>Active quests (' + active.length + ')</span></div>' +
      (active.length ? '<ul class="list">' + active.map((t) => taskRow(t, today)).join('') + '</ul>' : '<div class="card empty">Nothing on the board. Add a quest, make it small and concrete.</div>') +
      (done.length
        ? '<button class="linkish" data-act="showdone">' + (ui.showDone ? '▾' : '▸') + ' Completed (' + done.length + ')</button>' +
          (ui.showDone ? '<ul class="list">' + done.map((t) => taskRow(t, today)).join('') + '</ul>' : '')
        : '') +
      '</div><div class="stack q-side">' +
      '<div class="card"><div class="section-h" style="margin-bottom:10px"><span>This week</span><span class="muted small">+' + s.xpToday + ' XP today</span></div><div class="week">' + weekDots(s) + '</div></div>' +
      (nextBadge ? '<div class="card"><div class="muted small">NEXT BADGE</div><div style="font-weight:800;margin-top:4px">' + nextBadge.icon + ' ' + esc(nextBadge.name) + '</div><div class="muted small">' + esc(nextBadge.desc) + '</div></div>' : '') +
      '</div></div>'
    );
  }

  function viewFocus() {
    if (timer) {
      const t = timer.taskId && db.tasks[timer.taskId];
      return (
        '<div class="focus-wrap"><div class="card center"><div class="muted small">FOCUS SESSION · ' + timer.minutes + ' MIN</div>' +
        '<div class="ring" id="timerRing"><div class="ring-in"><div class="timer" id="timerText">' + fmtDur(timer.end - Date.now()) + '</div></div></div>' +
        '<div class="focus-task">' + (t ? esc(t.title) : 'Deep work') + '</div>' +
        '<p class="muted small">Finish to earn ' + timer.minutes * Q.FOCUS_XP_PER_MIN + ' XP. Quitting early pays nothing. Phone face down.</p>' +
        '<button class="btn danger" data-act="giveup">Give up</button></div></div>'
      );
    }
    const s = stats();
    const act = liveTasks().filter((t) => !t.completed_at).sort(taskSort);
    const fin = ui.justFinished;
    const finTask = fin && fin.taskId && db.tasks[fin.taskId] && !db.tasks[fin.taskId].completed_at ? db.tasks[fin.taskId] : null;
    return (
      '<div class="focus-wrap">' +
      (fin
        ? '<div class="card boss won"><div class="boss-tag">🎯 SESSION COMPLETE</div><div class="boss-title">+' + fin.xp + ' XP</div>' +
          '<div class="row">' + (finTask ? '<button class="btn primary" data-act="finishTask" data-id="' + esc(finTask.id) + '">✓ Mark "' + esc(finTask.title.slice(0, 28)) + '" done</button>' : '') +
          '<button class="btn" data-act="dismissFinish">Dismiss</button></div></div>'
        : '') +
      '<div class="card center"><div class="muted small">PICK A TARGET, THEN START</div>' +
      '<div class="ring idle"><div class="ring-in"><div class="timer">' + String(ui.focusMin).padStart(2, '0') + ':00</div></div></div>' +
      '<div class="chips">' + [10, 25, 45, 60].map((m) => '<button class="chipb ' + (ui.focusMin === m ? 'on' : '') + '" data-act="min" data-m="' + m + '">' + m + ' min</button>').join('') + '</div>' +
      '<div style="margin:14px 0 4px;text-align:left"><label>Working on<select id="focusTask"><option value="">Deep work (no specific quest)</option>' +
      act.map((t) => '<option value="' + esc(t.id) + '"' + (ui.focusTask === t.id ? ' selected' : '') + '>' + esc(t.title) + '</option>').join('') + '</select></label></div>' +
      '<button class="btn primary big" style="width:100%;margin-top:10px" data-act="start">▶ Start · earn ' + ui.focusMin * Q.FOCUS_XP_PER_MIN + ' XP</button></div>' +
      '<div class="card"><div class="muted small">FOCUS TOTALS</div><div class="stats" style="margin-top:8px"><div class="stat"><b>' + s.focusSessions + '</b><span>sessions</span></div><div class="stat"><b>' + fmtMin(s.focusMin) + '</b><span>total focus</span></div></div></div>' +
      '</div>'
    );
  }

  function viewHero() {
    const s = stats(); const L = s.level;
    const standalone = mq('(display-mode: standalone)') || window.navigator.standalone === true;
    return (
      '<div class="card center"><div class="muted small">YOU ARE</div><div style="font-size:26px;font-weight:900;margin:2px 0">' + esc(Q.titleFor(L.level)) + '</div><div class="muted">Level ' + L.level + ' · ' + s.totalXp + ' XP</div></div>' +
      '<div class="stats">' +
      [
        [s.done, 'quests completed'], [s.bosses, 'bosses slain'], [fmtMin(s.focusMin), 'focus time'],
        [s.streak + ' 🔥', 'current streak'], [s.best, 'best streak'], [s.bestDay, 'best day (quests)'],
      ].map((x) => '<div class="stat"><b>' + x[0] + '</b><span>' + x[1] + '</span></div>').join('') +
      '</div>' +
      '<div class="card"><div class="section-h" style="margin-bottom:10px"><span>Badges</span><span class="muted small">' + s.badges.size + '/' + Q.BADGES.length + '</span></div><div class="badges">' +
      Q.BADGES.map((b) => { const on = s.badges.has(b.id); return '<div class="badge ' + (on ? '' : 'locked') + '"><div class="b-ic">' + (on ? b.icon : '🔒') + '</div><div class="b-n">' + esc(b.name) + '</div><div class="b-d">' + esc(b.desc) + '</div></div>'; }).join('') +
      '</div></div>' +
      '<div class="card kv"><div class="section-h"><span>Account</span></div>' +
      '<div>' + (LOCAL_MODE ? '<b>Local-only mode.</b> <span class="muted">No Supabase config found in config.js, so there is no login and no sync.</span>' : 'Signed in as <b>' + esc(user.email || '') + '</b>') + '</div>' +
      (LOCAL_MODE ? '' : '<div class="muted small">' + (navigator.onLine ? 'Online' : 'Offline') + ' · ' + (ui.sync.at ? 'last sync ' + new Date(ui.sync.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'not synced yet') + ' · ' + pending() + ' change(s) waiting</div>') +
      (ui.sync.err ? '<div class="err small">Last sync error: ' + esc(ui.sync.err) + '</div>' : '') +
      '<div class="row">' + (LOCAL_MODE ? '' : '<button class="btn" data-act="sync">⟳ Sync now</button>') +
      '<button class="btn" data-act="mute">' + (muted() ? '🔇 Sound off' : '🔊 Sound on') + '</button>' +
      (LOCAL_MODE ? '' : '<button class="btn danger" data-act="logout">Log out</button>') + '</div></div>' +
      (standalone ? '' : '<div class="card kv"><b>📲 Install it</b><span class="muted">iPhone: Safari → Share → <b>Add to Home Screen</b>. Then open it from the icon and log in once there. Desktop Chrome/Edge: use the install icon in the address bar.</span></div>')
    );
  }

  /* ------------------------------------------------------------------ events */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const a = el.dataset.act; const id = el.dataset.id;
    switch (a) {
      case 'tab': ui.tab = el.dataset.tab; ui.openRow = null; render(); window.scrollTo(0, 0); break;
      case 'toggle': toggleDone(id); break;
      case 'more': ui.openRow = ui.openRow === id ? null : id; render(); break;
      case 'boss': setBoss(id); break;
      case 'focus-task': ui.focusTask = id; ui.tab = 'focus'; ui.openRow = null; render(); window.scrollTo(0, 0); break;
      case 'edit': openEdit(id); break;
      case 'delete': if (window.confirm('Delete this quest?')) deleteTask(id); break;
      case 'size': ui.size = el.dataset.k; render(); break;
      case 'min': ui.focusMin = Number(el.dataset.m); render(); break;
      case 'start': startTimer(); break;
      case 'giveup': giveUp(); break;
      case 'showdone': ui.showDone = !ui.showDone; render(); break;
      case 'sync': sync(true); break;
      case 'logout': logout(); break;
      case 'mute': LS.set('quest:mute', !muted()); render(); break;
      case 'closeModal': closeModal(); break;
      case 'dismissFinish': ui.justFinished = null; render(); break;
      case 'finishTask': ui.justFinished = null; toggleDone(id); break;
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'newTitle') ui.draft = e.target.value;
    if (e.target.id === 'newDue') ui.due = e.target.value;
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'focusTask') ui.focusTask = e.target.value;
    if (e.target.id === 'newDue') ui.due = e.target.value;
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'addForm') return;
    e.preventDefault();
    const t = ui.draft, sz = ui.size, d = ui.due;
    if (!t.trim()) return;
    ui.draft = ''; ui.due = '';
    addTask(t, sz, d);
    const i = $('#newTitle'); if (i) i.focus();
  });

  /* ------------------------------------------------------------------ sync (offline-first, last-write-wins) */
  let syncing = false, syncQueued = false, syncTimer = null;
  function setSync(state, err) {
    ui.sync.state = state;
    if (state === 'synced') { ui.sync.at = Date.now(); ui.sync.err = ''; }
    if (err !== undefined) ui.sync.err = err;
    if (user) renderHud();
  }
  function scheduleSync(ms) { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(), ms == null ? 800 : ms); }

  function mergeRow(table, row) {
    const local = db[table][row.id];
    if (local && local._dirty) return; // our pending change will overwrite the server copy
    const rec = Object.assign({}, row);
    delete rec.user_id; delete rec.updated_at;
    rec._v = local ? local._v || 0 : 0;
    db[table][row.id] = rec;
  }

  async function sync(manual) {
    if (!sb || !user || LOCAL_MODE) return;
    if (!navigator.onLine) { setSync('offline'); return; }
    if (syncing) { syncQueued = true; return; }
    syncing = true; setSync('syncing');
    try {
      for (const table of ['tasks', 'sessions']) {
        const store = db[table];
        // 1) push local changes
        const dirty = Object.values(store).filter((r) => r._dirty);
        for (let i = 0; i < dirty.length; i += 200) {
          const chunk = dirty.slice(i, i + 200);
          const sent = chunk.map((r) => [r.id, r._v]);
          const rows = chunk.map((r) => { const o = Object.assign({}, r, { user_id: user.id }); delete o._dirty; delete o._v; return o; });
          const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' });
          if (error) throw error;
          sent.forEach(([id, v]) => { const r = store[id]; if (r && r._v === v) delete r._dirty; });
        }
        // 2) pull remote changes (10s overlap guards against clock/transaction skew; merging is idempotent)
        const cur = db.cursor[table];
        const since = cur ? new Date(new Date(cur).getTime() - 10000).toISOString() : null;
        let maxTs = cur, from = 0;
        for (;;) {
          let q = sb.from(table).select('*').order('updated_at', { ascending: true }).order('id', { ascending: true }).range(from, from + 999);
          if (since) q = q.gte('updated_at', since);
          const { data, error } = await q;
          if (error) throw error;
          data.forEach((row) => { mergeRow(table, row); if (!maxTs || row.updated_at > maxTs) maxTs = row.updated_at; });
          if (data.length < 1000) break;
          from += 1000;
        }
        db.cursor[table] = maxTs;
      }
      saveDb();
      setSync('synced');
      render();
    } catch (err) {
      const msg = (err && (err.message || err.error_description)) || String(err);
      saveDb();
      setSync(navigator.onLine ? 'error' : 'offline', msg);
      if (manual) toast('Sync failed: ' + msg.slice(0, 60));
    } finally {
      syncing = false;
      if (syncQueued) { syncQueued = false; scheduleSync(300); }
    }
  }

  /* ------------------------------------------------------------------ auth + boot */
  function showLogin(msg) {
    $('#boot').hidden = true; $('#app').hidden = true; $('#login').hidden = false;
    $('#loginErr').textContent = msg || '';
  }

  function openUser(u) {
    user = u;
    if (!LOCAL_MODE) LS.set('quest:lastUser', u);
    loadDb();
    timer = LS.get(timerKey(), null);
    ui.sync = { state: LOCAL_MODE ? 'local' : navigator.onLine ? 'idle' : 'offline', at: null, err: '' };
    $('#boot').hidden = true; $('#login').hidden = true; $('#app').hidden = false;
    render();
    if (timer) ensureTick();
    sync();
  }

  async function logout() {
    if (!window.confirm('Log out of this device? Your data stays safe in the cloud.')) return;
    try { if (sb) await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
    LS.del('quest:lastUser');
    user = null; db = null; timer = null;
    document.title = 'Quest Log';
    $('#password').value = '';
    showLogin();
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    $('#loginErr').textContent = '';
    if (!sb) { $('#loginErr').textContent = 'The login library failed to load. Reload the page.'; return; }
    btn.disabled = true; btn.textContent = '…';
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
      if (error) throw error;
      openUser({ id: data.user.id, email: data.user.email });
    } catch (err) {
      $('#loginErr').textContent = !navigator.onLine ? 'You are offline. Connect once to log in.' : (err && err.message) || 'Login failed';
    } finally {
      btn.disabled = false; btn.textContent = 'Enter';
    }
  });

  async function boot() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

    if (LOCAL_MODE) { openUser({ id: 'local', email: 'local' }); return; }
    if (!sb) { showLogin('The login library failed to load. Reload the page.'); return; }

    let session = null;
    try { const r = await sb.auth.getSession(); session = r && r.data && r.data.session; } catch (e) {}
    if (session) { openUser({ id: session.user.id, email: session.user.email }); }
    else {
      const last = LS.get('quest:lastUser');
      if (last && last.id && !navigator.onLine) openUser(last); // offline: reopen the last logged-in profile
      else showLogin();
    }

    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && user) { user = null; db = null; timer = null; showLogin('Session expired. Log in again.'); }
    });
  }

  /* ------------------------------------------------------------------ lifecycle */
  let lastDay = Q.dayKey(new Date());
  window.addEventListener('online', () => { if (user) { setSync('idle'); scheduleSync(200); } });
  window.addEventListener('offline', () => { if (user) setSync('offline'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !user) return;
    tick();
    const d = Q.dayKey(new Date());
    if (d !== lastDay) { lastDay = d; render(); }
    scheduleSync(300);
  });
  setInterval(() => {
    if (!user || document.hidden) return;
    const d = Q.dayKey(new Date());
    if (d !== lastDay) { lastDay = d; render(); }
    scheduleSync(0);
  }, 60000);

  boot();
})();
