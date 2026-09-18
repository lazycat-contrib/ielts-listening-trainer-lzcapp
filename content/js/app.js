/**
 * IELTS Listening Trainer — Phase 4
 * Polished daily-use learning app.
 */
import { openDB, getAll, getOne, putOne, count, clearStore } from './core/database.js';
import { register, navigateTo, listen } from './core/router.js';
import { loadState, getState, updateState } from './core/state.js';
import { importQuestions, reimportQuestions } from './services/importService.js';
import { recordAttempt, startPractice, toggleFavorite, markMastered, verifyAllData, resetProgress, deleteHistoryEntry } from './services/recordService.js';
import { computeDashboardStats, computeWeeklyStats, computePartStats, computeTypeStats, computeCalendar } from './services/analysisService.js';

/* ═══════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════ */

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString()) return '今天';
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return '昨天';
    return `${d.getMonth()+1}/${d.getDate()}`;
  } catch(e) { return '—'; }
}

function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._tid); t._tid = setTimeout(() => t.classList.remove('show'), 2800);
}

function refresh() {
  const hash = (window.location.hash || '#dashboard').replace('#', '');
  navigateTo(hash);
  _badges();
}

function _badges() {
  const s = getState(), p = s.progress;
  let r = 0;
  Object.values(p).forEach(x => {
    if (x.learningStatus === 'review') r++;
  });
  const rb = document.getElementById('badge-review');
  if (rb) { rb.textContent = r; rb.style.display = r > 0 ? '' : 'none'; }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return ['夜深了', '注意休息，明天继续加油'];
  if (h < 12) return ['早上好', '新的一天，从听力练习开始'];
  if (h < 18) return ['下午好', '保持专注，继续完成今日目标'];
  return ['晚上好', '今天练习得怎么样？'];
}

/* ═══════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════ */

function renderDashboard(root) {
  const { questions, progress } = getState();
  const stats = computeDashboardStats(questions, progress);
  const [gTitle, gSub] = greeting();
  const goal = getState().settings.dailyGoal || 3;
  const done = Math.min(stats.todayCount, goal);
  const goalPct = Math.round(done / goal * 100);
  const ringCircum = 2 * Math.PI * 38;
  const ringOffset = ringCircum - (goalPct / 100) * ringCircum;
  const recs = _smartRecs(questions, progress);

  root.innerHTML = `
    <div class="hero-section">
      <div class="hero-left">
        <div class="greeting-hello">${gTitle}，Lin</div>
        <h2>今天继续完成<br>Listening Practice</h2>
      </div>
      <div class="hero-right">
        <img src="assets/illustrations/undraw_online-learning_tgmv.svg" alt="Learning" style="width:260px;height:auto">
      </div>
    </div>

    <div class="hero-row">
      ${_continueBlock(questions, progress)}
      <div class="card" style="display:flex;align-items:center;gap:24px">
        <div class="progress-ring-wrap">
          <svg width="96" height="96" viewBox="0 0 96 96" class="progress-ring-svg">
            <circle class="progress-ring-bg" cx="48" cy="48" r="38"/>
            <circle class="progress-ring-fill" cx="48" cy="48" r="38"
              stroke-dasharray="${ringCircum}" stroke-dashoffset="${ringOffset}"/>
            <text x="48" y="48" class="progress-ring-text">${done}/${goal}</text>
          </svg>
        </div>
        <div>
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);margin-bottom:6px">今日目标</div>
          <div style="font-size:15px;font-weight:600;line-height:1.4">${done >= goal ? '目标已完成' : `还差 ${goal-done} 篇`}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">Listening Practice</div>
        </div>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-tile tint-purple">
        <div class="st-icon" style="background:var(--accent-light);color:var(--accent)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="st-value">${stats.completedCount}<span style="font-size:14px;color:var(--text-secondary)">/${stats.total}</span></div>
        <div class="st-label">累计完成</div>
      </div>
      <div class="stat-tile tint-green">
        <div class="st-icon" style="background:var(--success-light);color:var(--success)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        </div>
        <div class="st-value">${stats.avgAccuracy}%</div>
        <div class="st-label">平均正确率</div>
      </div>
      <div class="stat-tile tint-amber">
        <div class="st-icon" style="background:var(--warning-light);color:var(--warning)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="st-value">${stats.streak}<span style="font-size:14px;color:var(--text-secondary)">天</span></div>
        <div class="st-label">连续学习</div>
      </div>
      <div class="stat-tile tint-rose">
        <div class="st-icon" style="background:var(--danger-light);color:var(--danger)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.54 2-5.5 1.41 5 4.93 4.47 5 8.5a5 5 0 0 1-10 0c0-2.12-.52-3.87-1.5-5"/></svg>
        </div>
        <div class="st-value">${stats.totalHours}<span style="font-size:14px;color:var(--text-secondary)">h</span></div>
        <div class="st-label">学习时间</div>
      </div>
    </div>

    <div class="section-header"><h2>推荐练习</h2></div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
      ${recs.slice(0, 4).map((r,i) => {
        const colors = ['var(--accent)','var(--warning)','var(--success)','var(--text-secondary)'];
        const labels = ['高频·未完成','最近有错误','已收藏','长期未练'];
        const p = progress[r.id];
        const tag = p?.completed ? `<span class="tag tag-green">${Math.round((p.accuracy||0)*100)}%</span>` : '<span class="tag tag-gray">新题</span>';
        return `<div class="rec-card" data-action="practice" data-qid="${r.id}">
          <div class="rec-icon" style="background:${colors[i]}18;color:${colors[i]}">${i+1}</div>
          <div class="rec-info"><div class="rec-title">${r.title}</div><div class="rec-sub">${r.part} · ${r.frequency} · ${labels[i]}</div></div>${tag}
        </div>`;
      }).join('')}
    </div>
  `;
}

function _continueBlock(questions, progress) {
  let best = null, bestDate = '';
  Object.values(progress).forEach(p => {
    const d = p.lastOpened || p.lastPractice;
    if (d && d > bestDate) { bestDate = d; best = p; }
  });
  if (!best || !best.lastPractice) {
    return `<div class="card continue-card" data-action="nav" data-qid="library">
      <div class="cc-title">继续学习</div>
      <div class="cc-name">开始你的第一篇练习</div>
      <div class="cc-meta">去题库选择题目</div>
      <button class="cc-btn">开始</button>
    </div>`;
  }
  const q = questions.find(q => q.id === best.questionId);
  if (!q) return '';
  const pct = Math.round((best.accuracy||0)*100);
  return `
    <div class="card continue-card" data-action="practice" data-qid="${q.id}">
      <div class="cc-title">继续学习</div>
      <div class="cc-name">${q.title}</div>
      <div class="cc-meta">${q.part} · 正确率 ${pct}% · 练习 ${best.attemptCount} 次</div>
      <button class="cc-btn">继续练习</button>
    </div>`;
}

function _smartRecs(questions, progress) {
  const now = Date.now();
  const DAY = 86400000;
  const merged = questions.map(q => ({ ...q, _p: progress[q.id] }));

  // Score each question for recommendation priority
  const scored = merged.map(q => {
    const p = q._p;
    let score = 0;

    // High frequency + not completed = highest priority
    if (q.frequency === '高频' && !p?.completed) score += 100;
    else if (q.frequency === '次高频' && !p?.completed) score += 70;
    else if (!p?.completed) score += 40;

    // Has mistakes
    if (p?.wrongCount > 0 && p?.learningStatus !== 'mastered') score += 50 + p.wrongCount * 5;

    // Favorites
    if (p?.favorite) score += 30;

    // Low accuracy (but completed)
    if (p?.completed && p.accuracy < 0.7) score += 20;

    // Long time no practice (> 14 days)
    if (p?.lastPractice) {
      const days = (now - new Date(p.lastPractice).getTime()) / DAY;
      if (days > 14) score += 15;
    }

    // Mastered items get lower priority
    if (p?.learningStatus === 'mastered') score -= 60;

    return { ...q, _score: score };
  });

  return scored.sort((a, b) => b._score - a._score);
}

/* ═══════════════════════════════════════
   LIBRARY
   ═══════════════════════════════════════ */

function renderLibrary(root) {
  const { questions, progress } = getState();
  if (!questions.length) {
    root.innerHTML = `<div class="empty-state"><h3>Library unavailable</h3></div>`;
    return;
  }

  root.innerHTML = `
    <div class="section-header" style="margin-bottom:8px">
      <div><h2>听力题库</h2><div class="sh-sub">${questions.length} 篇真题，选择一篇开始练习</div></div>
      <img src="assets/illustrations/undraw_grading-papers_7fpu.svg" style="width:100px;height:auto;opacity:.85" alt="Papers">
    </div>
    <div class="filter-bar">
      <input type="text" id="f-search" placeholder="搜索标题...">
      <select id="f-part"><option value="all">全部 Part</option><option>Part 1</option><option>Part 2</option><option>Part 3</option><option>Part 4</option></select>
      <select id="f-freq"><option value="all">全部频率</option><option>高频</option><option>次高频</option><option>非高频</option></select>
      <select id="f-type"><option value="all">全部题型</option><option value="fill">填空</option><option value="single">选择</option><option value="multiple">多选</option><option value="matching">匹配</option><option value="map">地图</option></select>
      <select id="f-sort"><option value="recommended">推荐学习</option><option value="highfreq">高频优先</option><option value="mistakes">错误最多</option><option value="recent">最近练习</option><option value="lowacc">正确率最低</option></select>
      <span style="margin-left:auto;font-size:12px;color:var(--text-secondary)" id="f-count"></span>
    </div>
    <div class="card-grid" id="lib-grid"></div>
  `;

  _renderLibGrid();
  ['f-search','f-part','f-freq','f-type','f-sort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === 'f-search' ? 'input' : 'change', _renderLibGrid);
  });
}

function _renderLibGrid() {
  const s = getState();
  const { questions, progress } = s;
  let items = [...questions];

  const part = document.getElementById('f-part')?.value || 'all';
  const freq = document.getElementById('f-freq')?.value || 'all';
  const type = document.getElementById('f-type')?.value || 'all';
  const search = (document.getElementById('f-search')?.value || '').toLowerCase();
  const sort = document.getElementById('f-sort')?.value || 'recommended';

  if (part !== 'all') items = items.filter(q => q.part === part);
  if (freq !== 'all') items = items.filter(q => q.frequency === freq);
  if (type !== 'all') items = items.filter(q => (q.questionTypes||[]).includes(type));
  if (search) items = items.filter(q => q.title.toLowerCase().includes(search));

  // Sort
  const scored = _smartRecs(items, progress);
  const scoredMap = {}; scored.forEach((x,i) => scoredMap[x.id] = i);

  if (sort === 'recommended') {
    items.sort((a,b) => (scoredMap[a.id]||999) - (scoredMap[b.id]||999));
  } else if (sort === 'highfreq') {
    const o = {'高频':0,'次高频':1,'非高频':2};
    items.sort((a,b) => (o[a.frequency]||3) - (o[b.frequency]||3) || !!(progress[b.id]?.completed) - !!(progress[a.id]?.completed));
  } else if (sort === 'mistakes') {
    items.sort((a,b) => (progress[b.id]?.wrongCount||0) - (progress[a.id]?.wrongCount||0));
  } else if (sort === 'recent') {
    items.sort((a,b) => (progress[b.id]?.lastPractice||'').localeCompare(progress[a.id]?.lastPractice||''));
  } else if (sort === 'lowacc') {
    items.sort((a,b) => (progress[a.id]?.accuracy||0) - (progress[b.id]?.accuracy||0));
  }

  const countEl = document.getElementById('f-count');
  if (countEl) countEl.textContent = `${items.length} / ${questions.length} 篇`;

  const grid = document.getElementById('lib-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><h3>无匹配题目</h3></div>';
    return;
  }

  grid.innerHTML = items.map(q => {
    const p = progress[q.id] || {};
    const acc = Math.round((p.accuracy||0)*100);
    const ring = p.learningStatus==='mastered'?'mastered':p.completed?'completed':p.wrongCount>0?'review':'new';
    const barCls = acc>=80?'high':acc>=60?'mid':'low';
    return `
      <div class="question-card ${q.frequency==='高频'?'border-purple':q.frequency==='次高频'?'border-amber':'border-green'}" data-action="practice" data-qid="${q.id}">
        <div class="qc-header">
          <div style="flex:1;min-width:0">
            <div class="qc-title">${q.title}</div>
            <div class="qc-meta">
              <span>${q.part}</span>
              ${q.frequency?`<span class="tag ${q.frequency==='高频'?'tag-red':q.frequency==='次高频'?'tag-amber':'tag-gray'}">${q.frequency}</span>`:''}
            </div>
          </div>
          <span class="status-ring ${ring}"></span>
        </div>
        <div class="qc-tags">${(q.tags||[]).map(t=>`<span class="tag tag-blue">${t}</span>`).join('')}</div>
        <div class="qc-footer">
          <div class="qf-item"><span class="qf-label">Accuracy</span><span class="qf-value">${p.completed?acc+'%':'—'}</span></div>
          ${p.completed?`<div class="progress-bar"><div class="progress-fill ${barCls}" style="width:${acc}%"></div></div>`:''}
          <div class="qf-item"><span class="qf-label">Sessions</span><span class="qf-value">${p.attemptCount||0}</span></div>
          <div class="qf-item"><span class="qf-label">Last</span><span class="qf-value">${fmtDate(p.lastPractice)}</span></div>
          <span data-action="fav" data-qid="${q.id}" style="cursor:pointer;font-size:15px;flex-shrink:0;opacity:${p.favorite?1:.3}">&#9733;</span>
        </div>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════
   MISTAKES
   ═══════════════════════════════════════ */

function renderHistory(root) {
  const { questions, progress } = getState();

  // Flatten all history entries
  let allEntries = [];
  Object.values(progress).forEach(p => {
    (p.history || []).forEach((h, idx) => {
      const q = questions.find(q => q.id === p.questionId);
      if (q) {
        allEntries.push({
          questionId: p.questionId, historyIndex: idx,
          title: q.title, part: q.part, frequency: q.frequency,
          date: h.date, score: h.score, total: h.total,
          accuracy: h.accuracy, duration: h.duration,
          wrongQuestions: h.wrongQuestions || []
        });
      }
    });
  });
  allEntries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const totalPractices = allEntries.length;
  const avgAccuracy = totalPractices > 0
    ? Math.round(allEntries.reduce((s, e) => s + e.accuracy, 0) / totalPractices * 100) : 0;
  const totalMinutes = Math.round(allEntries.reduce((s, e) => s + (e.duration || 0), 0) / 60);
  const uniqueDays = new Set(allEntries.map(e => (e.date || '').slice(0, 10))).size;

  const sorts = [
    { value: 'newest', label: '最新在前' },
    { value: 'oldest', label: '最早在前' },
    { value: 'highest', label: '正确率最高' },
    { value: 'lowest', label: '正确率最低' }
  ];

  root.innerHTML = `
    <div class="section-header">
      <div><h2>练习记录</h2><div class="section-subtitle">每一次听力，每一次进步</div></div>
    </div>

    <div class="stat-row">
      <div class="stat-tile"><div class="stat-value">${totalPractices}</div><div class="stat-label">累计练习</div></div>
      <div class="stat-tile"><div class="stat-value">${avgAccuracy}%</div><div class="stat-label">平均正确率</div></div>
      <div class="stat-tile"><div class="stat-value">${totalMinutes}<span style="font-size:14px;color:var(--text-secondary)">分</span></div><div class="stat-label">学习时间</div></div>
      <div class="stat-tile"><div class="stat-value">${uniqueDays}<span style="font-size:14px;color:var(--text-secondary)">天</span></div><div class="stat-label">活跃天数</div></div>
    </div>

    <div class="section-header" style="margin-top:8px"><h2>Part 能力</h2></div>
    <div class="part-grid" style="margin-bottom:28px">
      ${_renderPartCards(questions, progress)}
    </div>

    <div class="filter-bar">
      <select id="h-part"><option value="all">全部 Part</option><option>Part 1</option><option>Part 2</option><option>Part 3</option><option>Part 4</option></select>
      <select id="h-sort">${sorts.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}</select>
      <span style="margin-left:auto;font-size:12px;color:var(--text-secondary)" id="h-count"></span>
    </div>

    <div id="history-list" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden"></div>
  `;

  _renderHistoryList(allEntries);
  document.getElementById('h-part').addEventListener('change', () => _renderHistoryList(allEntries));
  document.getElementById('h-sort').addEventListener('change', () => _renderHistoryList(allEntries));
}

function _renderPartCards(questions, progress) {
  const parts = { 'Part 1': [], 'Part 2': [], 'Part 3': [], 'Part 4': [] };
  questions.forEach(q => {
    const p = progress[q.id];
    if (p && p.completed) parts[q.part].push(p.accuracy);
  });
  return Object.entries(parts).map(([part, accs]) => {
    const count = accs.length;
    const avg = count > 0 ? Math.round(accs.reduce((a,b)=>a+b,0)/count*100) : 0;
    const color = avg >= 80 ? 'var(--success)' : avg >= 60 ? 'var(--accent)' : avg > 0 ? 'var(--warning)' : 'var(--text-tertiary)';
    return `<div class="part-card">
      <div class="part-value" style="color:${color}">${avg}%</div>
      <div class="part-label">${part}</div>
      <div style="font-size:10px;color:var(--text-tertiary)">${count} sessions</div>
      <div class="part-bar"><div class="part-fill" style="width:${Math.max(2,avg)}%;background:${color}"></div></div>
    </div>`;
  }).join('');
}

function _renderHistoryList(allEntries) {
  const partFilter = document.getElementById('h-part')?.value || 'all';
  const sort = document.getElementById('h-sort')?.value || 'newest';

  let filtered = [...allEntries];
  if (partFilter !== 'all') filtered = filtered.filter(e => e.part === partFilter);
  if (sort === 'newest') filtered.sort((a, b) => (b.date||'').localeCompare(a.date||''));
  else if (sort === 'oldest') filtered.sort((a, b) => (a.date||'').localeCompare(b.date||''));
  else if (sort === 'highest') filtered.sort((a, b) => (b.accuracy||0)-(a.accuracy||0));
  else if (sort === 'lowest') filtered.sort((a, b) => (a.accuracy||0)-(b.accuracy||0));

  const countEl = document.getElementById('h-count');
  if (countEl) countEl.textContent = `${filtered.length} 条记录`;

  const listEl = document.getElementById('history-list');
  if (!listEl) return;
  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state">
      <img src="assets/illustrations/undraw_peekaboo_5o8i.svg" style="width:240px" alt="No records">
      <h3>还没有练习记录</h3>
      <p>开始第一次 IELTS Listening 训练，<br>积累你的学习轨迹</p>
      <button class="btn btn-primary" data-action="nav" data-qid="library" style="margin-top:8px">开始第一次练习</button>
    </div>`;
    return;
  }

  listEl.innerHTML = filtered.map(e => {
    const pct = Math.round((e.accuracy||0)*100);
    const abCls = pct >= 80 ? 'high' : pct >= 60 ? 'mid' : 'low';
    const durMin = Math.floor((e.duration||0)/60);
    const durSec = (e.duration||0)%60;
    const durStr = durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`;
    const dateStr = fmtDate(e.date);
    const fullDate = e.date ? e.date.slice(0,10) : '';

    return `<div class="history-item">
      <div class="hi-icon">♪</div>
      <div class="hi-main">
        <div class="hi-title">${e.title}</div>
        <div class="hi-meta">
          <span class="tag tag-blue">${e.part}</span>
          ${e.frequency?`<span class="tag ${e.frequency==='高频'?'tag-red':e.frequency==='次高频'?'tag-amber':'tag-gray'}">${e.frequency}</span>`:''}
          <span>${fullDate}</span>
          <span>·</span>
          <span>${durStr}</span>
        </div>
      </div>
      <div class="accuracy-badge ${abCls}">${pct}%</div>
      <div class="hi-actions">
        <button class="btn btn-ghost btn-sm" data-action="practice" data-qid="${e.questionId}">重新练习</button>
        <button class="btn btn-ghost btn-sm" data-action="delete-record" data-qid="${e.questionId}" data-hidx="${e.historyIndex}">×</button>
      </div>
    </div>`;
  }).join('');
}

async function _handleDeleteRecord(qid, hidx) {
  if (!confirm('删除这条练习记录？\n\n只删除这一条，不影响题库和其他记录。')) return;
  try {
    await deleteHistoryEntry(qid, hidx);
    toast('已删除 ✓');
    refresh();
  } catch (err) {
    toast('删除失败: ' + err.message);
  }
}

/* ═══════════════════════════════════════
   STATISTICS
   ═══════════════════════════════════════ */

function renderStatistics(root) {
  const { questions, progress } = getState();
  const weekly = computeWeeklyStats(progress);
  const parts = computePartStats(questions, progress);
  const types = computeTypeStats(questions, progress);
  const cal = computeCalendar(progress);

  // Score trend — last 10 attempts
  const allHistory = [];
  Object.values(progress).forEach(p => {
    (p.history||[]).forEach(h => allHistory.push({...h, title: p.questionId}));
  });
  allHistory.sort((a,b) => (a.date||'').localeCompare(b.date||''));
  const recent10 = allHistory.slice(-10);
  const trendMax = Math.max(...recent10.map(h=>h.accuracy||0), 0.01);

  root.innerHTML = `
    <div class="section-header"><h2>正确率趋势</h2><div class="section-subtitle">最近 ${recent10.length} 次练习</div></div>
    <div class="card" style="margin-bottom:20px;">
      ${recent10.length > 0 ? `
        <div style="display:flex;align-items:flex-end;gap:6px;height:120px;padding:0 8px;">
          ${recent10.map(h => {
            const pct = Math.round((h.accuracy||0)*100);
            const hPct = Math.max(4, ((h.accuracy||0)/trendMax)*100);
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
              <div style="font-size:10px;font-weight:700;color:${pct>=80?'var(--success)':pct>=60?'var(--accent)':'var(--danger)'}">${pct}%</div>
              <div style="width:100%;max-width:36px;background:${pct>=80?'var(--success)':pct>=60?'var(--accent)':'var(--danger)'};border-radius:4px 4px 0 0;height:${hPct}%;transition:height .3s;"></div>
              <div style="font-size:8px;color:var(--text-tertiary);writing-mode:vertical-lr;">${h.date?h.date.slice(5,10):''}</div>
            </div>`;
          }).join('')}
        </div>
      ` : `<div class="empty-state">
        <img src="assets/illustrations/undraw_researching_49yy.svg" style="width:220px" alt="No data">
        <h3>数据收集中</h3>
        <p>完成更多练习后，<br>这里会生成你的听力成长分析</p>
      </div>`}
    </div>

    <div class="section-header"><h2>Part 能力分析</h2></div>
    <div class="card" style="margin-bottom:20px;">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;text-align:center;">
        ${parts.map(p => {
          const color = p.accuracy>=80?'var(--success)':p.accuracy>=60?'var(--accent)':p.accuracy>0?'var(--danger)':'var(--border)';
          return `<div style="padding:12px 8px;">
            <div style="font-size:28px;font-weight:800;color:${color};">${p.accuracy}%</div>
            <div style="font-size:10px;font-weight:600;color:var(--text-secondary);margin-top:4px;">${p.part}</div>
            <div style="font-size:10px;color:var(--text-tertiary)">${p.count} sessions</div>
            <div style="margin-top:6px;height:3px;background:var(--border);border-radius:2px;overflow:hidden;">
              <div style="height:100%;width:${Math.max(2,p.accuracy)}%;background:${color};border-radius:2px;"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="section-header"><h2>题型能力</h2></div>
    <div class="card" style="margin-bottom:20px;">
      <div class="bar-chart">
        ${types.map(t => {
          const lb = {fill:'Fill',single:'Choice',multiple:'Multiple',matching:'Matching',map:'Map'}[t.type]||t.type;
          const color = t.accuracy>=80?'var(--success)':t.accuracy>=60?'var(--accent)':t.accuracy>0?'var(--danger)':'var(--border)';
          return `<div class="bar-row"><div class="bar-label">${lb}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3,t.accuracy)}%;background:${color}">${t.count>0?t.accuracy+'%':'—'}</div></div><div class="bar-value">${t.count}</div></div>`;
        }).join('')}
      </div>
    </div>

    <div class="section-header"><h2>学习日历</h2><div class="section-subtitle">近 90 天</div></div>
    <div class="card">
      <div class="calendar-grid">
        ${cal.map(d => `<div class="calendar-cell l${d.count===0?0:d.count<=2?1:d.count<=4?2:d.count<=7?3:4}" title="${d.date.slice(5)}: ${d.count}次"></div>`).join('')}
      </div>
      <div style="display:flex;gap:10px;align-items:center;margin-top:10px;font-size:10px;color:var(--text-secondary)">
        <span>少</span><span class="calendar-cell l0"></span><span class="calendar-cell l1"></span><span class="calendar-cell l2"></span><span class="calendar-cell l3"></span><span class="calendar-cell l4"></span><span>多</span>
        <span style="margin-left:10px">共 ${cal.reduce((s,d)=>s+d.count,0)} 次</span>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════
   SETTINGS
   ═══════════════════════════════════════ */

function renderSettings(root) {
  const { questions, progress } = getState();
  const pCount = Object.keys(progress).length;

  root.innerHTML = `
    <div class="section-header"><h2>设置</h2></div>

    <div class="settings-section">
      <h3>数据备份</h3>
      <div class="setting-row">
        <div>
          <div class="sr-label">导出学习数据</div>
          <div class="sr-desc">下载包含所有练习记录、收藏和设置的 JSON 文件</div>
        </div>
        <button class="btn btn-primary btn-sm" id="s-export">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          导出
        </button>
      </div>
      <div class="setting-row">
        <div>
          <div class="sr-label">导入备份数据</div>
          <div class="sr-desc">从之前导出的 JSON 备份文件中恢复数据</div>
        </div>
        <button class="btn btn-sm" id="s-import">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          导入
        </button>
        <input type="file" id="s-import-file" accept=".json" style="display:none">
      </div>
    </div>

    <div class="settings-section">
      <h3>数据管理</h3>
      <div class="setting-row">
        <div>
          <div class="sr-label">清除练习记录</div>
          <div class="sr-desc">重置所有练习历史，题库索引保持不变</div>
        </div>
        <button class="btn btn-sm" id="s-clear-progress" style="color:var(--danger);border-color:var(--danger)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          清除
        </button>
      </div>
      <div class="setting-row">
        <div>
          <div class="sr-label">重新导入题库</div>
          <div class="sr-desc">刷新题库索引，不影响练习记录</div>
        </div>
        <button class="btn btn-sm" id="s-reimport">刷新题库</button>
      </div>
    </div>

    <div class="settings-section">
      <h3>当前数据</h3>
      <div class="stat-row" style="margin-bottom:0">
        <div class="stat-tile tint-purple">
          <div class="st-value">${questions.length}</div>
          <div class="st-label">题库总数</div>
        </div>
        <div class="stat-tile tint-green">
          <div class="st-value">${pCount}</div>
          <div class="st-label">练习记录</div>
        </div>
      </div>
      ${pCount > 0 ? `
        <div class="setting-row" style="margin-top:14px">
          <div>
            <div class="sr-label">数据完整性校验</div>
            <div class="sr-desc">检查 IndexedDB 数据一致性</div>
          </div>
          <button class="btn btn-sm" id="s-verify">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            校验
          </button>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('s-export')?.addEventListener('click', _exportData);
  document.getElementById('s-import')?.addEventListener('click', () => document.getElementById('s-import-file')?.click());
  document.getElementById('s-import-file')?.addEventListener('change', _importData);
  document.getElementById('s-clear-progress')?.addEventListener('click', _clearProgress);
  document.getElementById('s-reimport')?.addEventListener('click', _reimport);
  document.getElementById('s-verify')?.addEventListener('click', async () => {
    const r = await verifyAllData();
    toast(r.ok ? `✅ 数据正常 (${r.stats.totalQuestions}篇/${r.stats.completed}完成)` : `⚠ 发现 ${r.issues.length} 个问题`);
  });
}

/* ═══════════════════════════════════════
   PRACTICE FLOW
   ═══════════════════════════════════════ */

async function openPractice(questionId) {
  const { questions } = getState();
  const q = questions.find(q => q.id === questionId);
  if (!q) { toast('题目未找到'); return; }

  await startPractice(questionId);
  const t0 = Date.now();

  const win = window.open(q.htmlPath, 'ielts_practice');
  if (!win) { toast('⚠ 弹窗被拦截，请允许弹窗'); return; }
  toast(`已打开: ${q.title}`);

  const iv = setInterval(async () => {
    if (win.closed) {
      clearInterval(iv);
      _completeDialog(questionId, q, Math.round((Date.now()-t0)/1000));
    }
  }, 1500);
}

function _completeDialog(qid, q, secs) {
  const old = document.getElementById('complete-dialog');
  if (old) old.remove();

  const m = Math.floor(secs/60), s = secs%60;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'complete-dialog';
  overlay.innerHTML = `
    <div class="modal-box">
      <h3 style="margin-bottom:4px;">✅ 完成练习</h3>
      <p style="font-size:14px;font-weight:600;margin-bottom:2px;">${q.title}</p>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">${q.part} · ${q.questionCount}题 · 用时${m}分${s}秒</p>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">正确数量</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="number" id="mc-score" min="0" max="${q.questionCount}" value="0" style="width:64px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;text-align:center;">
          <span style="font-weight:600;">/ ${q.questionCount}</span>
          <span id="mc-preview" style="font-size:14px;font-weight:700;"></span>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn" id="mc-skip">跳过</button>
        <button class="btn btn-primary" id="mc-confirm">✓ 保存</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const inp = overlay.querySelector('#mc-score');
  const prev = overlay.querySelector('#mc-preview');
  function up() {
    const sc = Math.min(q.questionCount, Math.max(0, parseInt(inp.value)||0));
    const pct = q.questionCount>0?Math.round(sc/q.questionCount*100):0;
    prev.textContent = pct+'%';
    prev.style.color = pct>=80?'var(--success)':pct>=60?'var(--warning)':'var(--danger)';
  }
  inp.addEventListener('input', up); up();

  overlay.querySelector('#mc-skip').addEventListener('click', () => { overlay.remove(); refresh(); });
  overlay.querySelector('#mc-confirm').addEventListener('click', async () => {
    const score = Math.min(q.questionCount, Math.max(0, parseInt(inp.value)||0));
    overlay.remove();
    const answers = [];
    for (let i=0;i<q.questionCount;i++) answers.push({questionId:String(i+1),userAnswer:i<score?'✓':'✗',correctAnswer:'',isCorrect:i<score});
    const result = await recordAttempt(qid, { score, total:q.questionCount, answers, duration:secs });
    const pct = Math.round(score/q.questionCount*100);
    toast(`${pct>=80?'🎉':pct>=60?'👍':'💪'} ${score}/${q.questionCount} (${pct}%)`);
    refresh();
  });
}

/* ═══════════════════════════════════════
   DATA ACTIONS
   ═══════════════════════════════════════ */

async function _master(qid) { await markMastered(qid); toast('已标记掌握 ✓'); refresh(); }
async function _fav(qid) { const r = await toggleFavorite(qid); toast(r.favorite?'已收藏 ⭐':'已取消'); refresh(); }

async function _exportData() {
  const db = await openDB();
  const [q, p, s] = await Promise.all([getAll('questions'),getAll('progress'),getAll('settings')]);
  const backup = { exportedAt: new Date().toISOString(), version: 3, questions: q, progress: p, settings: s };
  const blob = new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`ielts-trainer-${new Date().toISOString().split('T')[0]}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('📥 数据已导出');
}

async function _importData(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.version || !data.progress) { toast('⚠ 无效的备份文件'); return; }

    const db = await openDB();
    // Import progress
    const tx = db.transaction('progress','readwrite');
    const store = tx.objectStore('progress');
    if (data.progress) {
      await new Promise((resolve,reject) => {
        const req = store.clear(); req.onsuccess=resolve; req.onerror=reject;
      });
      data.progress.forEach(p => store.put(p));
    }
    if (data.settings) {
      const stx = db.transaction('settings','readwrite');
      const sstore = stx.objectStore('settings');
      await new Promise((resolve,reject) => {
        const req = sstore.clear(); req.onsuccess=resolve; req.onerror=reject;
      });
      data.settings.forEach(s => sstore.put(s));
    }
    await new Promise(resolve => { tx.oncomplete = resolve; });

    await loadState(getAll);
    toast(`✅ 已导入 ${data.progress?.length||0} 条记录`);
    refresh();
  } catch(err) { toast('❌ 导入失败: '+err.message); }
  e.target.value = '';
}

async function _clearProgress() {
  if (!confirm('确定清除所有学习记录？此操作不可恢复。\n\n建议先导出备份。')) return;
  const db = await openDB();
  const tx = db.transaction('progress','readwrite');
  await new Promise((resolve,reject) => { const r = tx.objectStore('progress').clear(); r.onsuccess=resolve; r.onerror=reject; });
  await loadState(getAll);
  toast('🗑 学习记录已清除');
  refresh();
}

async function _reimport() {
  if (!confirm('重新导入题库索引（不影响学习记录）？')) return;
  await reimportQuestions();
  await loadState(getAll);
  toast('✅ 题库已刷新');
  refresh();
}

/* ═══════════════════════════════════════
   GLOBAL EVENTS
   ═══════════════════════════════════════ */

function setupEvents() {
  document.querySelectorAll('.nav-link').forEach(b => {
    b.addEventListener('click', () => { const r = b.dataset.route; if (r) navigateTo(r); });
  });

  // Theme toggle — sidebar button
  const tb = document.getElementById('btn-theme-sidebar');
  if (tb) {
    tb.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark');
      try { localStorage.setItem('ielts_trainer_theme', isDark?'dark':'light'); } catch(e){}
    });
  }
  try { if (localStorage.getItem('ielts_trainer_theme')==='dark') { document.body.classList.add('dark'); } } catch(e){}

  // Export — sidebar button
  document.getElementById('btn-export-sidebar')?.addEventListener('click', _exportData);

  document.getElementById('app-root').addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const act = el.dataset.action, qid = el.dataset.qid;
    if (act==='practice'&&qid) openPractice(qid);
    else if (act==='master'&&qid) _master(qid);
    else if (act==='fav'&&qid) { e.stopPropagation(); _fav(qid); }
    else if (act==='delete-record'&&qid) { e.stopPropagation(); _handleDeleteRecord(qid, parseInt(el.dataset.hidx)); }
	    else if (act==='nav') navigateTo(qid);
  });
}

/* ═══════════════════════════════════════
   INIT
   ═══════════════════════════════════════ */

async function init() {
  try {
    document.getElementById('init-status').textContent = '正在打开数据库...';
    await openDB();

    document.getElementById('init-status').textContent = '正在导入题库...';
    await importQuestions();

    document.getElementById('init-status').textContent = '正在加载数据...';
    await loadState(getAll);

    document.getElementById('init-status').textContent = '正在校验...';
    await verifyAllData();

    register('dashboard', renderDashboard);
    register('library', renderLibrary);
    register('history', renderHistory);
    register('statistics', renderStatistics);
    register('settings', renderSettings);

    listen();
    setupEvents();

    const hash = (window.location.hash||'#dashboard').replace('#','');
    navigateTo(hash||'dashboard');

    // Global debug
    window.__verify = () => verifyAllData().then(r => { console.table(r.stats); return r; });

    console.log('🚀 IELTS Trainer ready');
  } catch(err) {
    console.error('Init failed:', err);
    document.getElementById('app-root').innerHTML = `
      <div class="empty-state"><div class="empty-icon">⚠️</div><h3>初始化失败</h3><p style="color:var(--danger)">${err.message}</p>
      <button class="btn btn-primary" style="margin-top:12px" onclick="location.reload()">🔄 重试</button></div>`;
  }
}

init().catch(err => {
  document.getElementById('app-root').innerHTML = `
    <div class="empty-state"><div class="empty-icon">💥</div><h3>严重错误</h3><p style="color:var(--danger)">${err.message}</p></div>`;
});
