const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const DEFAULT = {
  players: [],
  teams: { '1': [], '2': [] },
  lastTeams: null,
  savedTeams: [],
  sortMode: 'fav'
};
const state = { ...DEFAULT, ...safeParse(localStorage.getItem('lol-inhouse-pro')) };
state.players ||= [];
state.teams ||= { '1': [], '2': [] };
state.teams['1'] ||= [];
state.teams['2'] ||= [];
state.savedTeams ||= [];
state.sortMode ||= 'fav';

const TIER_BASE = { UNRANKED: -1, IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600, EMERALD: 2000, DIAMOND: 2400, MASTER: 2800, GRANDMASTER: 3200, CHALLENGER: 3600 };
const TIER_LABEL = { UNRANKED: 'Unranked', IRON: 'Iron', BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platinum', EMERALD: 'Emerald', DIAMOND: 'Diamond', MASTER: 'Master', GRANDMASTER: 'Grandmaster', CHALLENGER: 'Challenger' };
const LINES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];

function safeParse(v) { try { return v ? JSON.parse(v) : {}; } catch { return {}; } }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); }
function persist() { localStorage.setItem('lol-inhouse-pro', JSON.stringify(state)); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 1700); }
function normalizeLine(v) { return LINES.includes(v) ? v : 'ALL'; }
function lineCounts(list) { const c = Object.fromEntries(LINES.map(l => [l, 0])); list.forEach(p => { if (LINES.includes(p.line)) c[p.line]++; }); return c; }
function getPlayer(id) { return state.players.find(p => p.id === id); }
function teamPlayers(num) { return (state.teams[num] || []).map(getPlayer).filter(Boolean); }
function activePlayers() { return state.players.filter(p => !p.excluded); }
function totalScore(list) { return list.reduce((s, p) => s + Number(p.score || 0), 0); }
function avg(list) { return list.length ? totalScore(list) / list.length : 0; }
function stdDev(list) { if (!list.length) return 0; const a = avg(list); return Math.sqrt(list.reduce((s, p) => s + Math.pow(Number(p.score || 0) - a, 2), 0) / list.length); }
function winRate(p) { const total = Number(p.wins || 0) + Number(p.losses || 0); return total ? Math.round(Number(p.wins || 0) / total * 100) : 0; }
function adjustedScore(p) { const games = Number(p.wins || 0) + Number(p.losses || 0); const wr = winRate(p); const wrBonus = games >= 20 ? Math.max(-120, Math.min(120, (wr - 50) * 4)) : 0; return Math.round(Number(p.score || 0) + wrBonus); }
function tierText(p) { const tier = String(p.tier || 'UNRANKED').toUpperCase(); return `${TIER_LABEL[tier] || tier} ${p.rank || ''}`.trim(); }
function tierValue(p) { const tier = String(p.tier || 'UNRANKED').toUpperCase(); return TIER_BASE[tier] ?? -1; }
function copy(obj) { return JSON.parse(JSON.stringify(obj)); }

function saveAndRender(msg) { persist(); render(); if (msg) toast(msg); }

function addPlayer(player) {
  const key = player.name.trim().toLowerCase();
  if (state.players.some(p => p.name.trim().toLowerCase() === key)) {
    toast('이미 추가된 닉네임입니다.');
    return false;
  }
  state.players.push({
    id: uid(),
    name: player.name,
    tier: player.tier || 'UNRANKED',
    rank: player.rank || '',
    score: Number(player.score || 0),
    wins: Number(player.wins || 0),
    losses: Number(player.losses || 0),
    line: normalizeLine(player.line),
    favorite: false,
    excluded: false,
    captain: false
  });
  saveAndRender('유저를 추가했습니다.');
  return true;
}

function addManualPlayer() {
  const name = $('#manualName').value.trim();
  if (!name) return toast('이름을 입력하세요.');
  const score = Number($('#manualScore').value || 0);
  const wins = Number($('#manualWins')?.value || 0);
  const losses = Number($('#manualLosses')?.value || 0);
  addPlayer({ name, score, tier: $('#manualTier').value, line: $('#manualLine').value, wins, losses });
  $('#manualName').value = '';
  $('#manualScore').value = '';
  if ($('#manualWins')) $('#manualWins').value = '';
  if ($('#manualLosses')) $('#manualLosses').value = '';
}

function updatePlayer(id, key, value) {
  const p = getPlayer(id);
  if (!p) return;
  if (key === 'score' || key === 'wins' || key === 'losses') p[key] = Number(value || 0);
  else if (key === 'line') p[key] = normalizeLine(value);
  else p[key] = value;
  saveAndRender('수정했습니다.');
}

function toggle(id, key) {
  const p = getPlayer(id);
  if (!p) return;
  p[key] = !p[key];
  if (key === 'excluded' && p.excluded) removeFromTeams(id, false);
  saveAndRender();
}

function deletePlayer(id) {
  state.players = state.players.filter(p => p.id !== id);
  removeFromTeams(id, false);
  saveAndRender('삭제했습니다.');
}

function removeFromTeams(id, rerender = true) {
  state.teams['1'] = state.teams['1'].filter(x => x !== id);
  state.teams['2'] = state.teams['2'].filter(x => x !== id);
  if (rerender) saveAndRender();
}

function moveToTeam(id, team) {
  const p = getPlayer(id);
  if (!p || p.excluded) return toast('제외된 유저는 팀에 넣을 수 없습니다.');
  state.lastTeams = copy(state.teams);
  removeFromTeams(id, false);
  state.teams[team].push(id);
  saveAndRender();
}

function teamCost(a, b, mode = 'balanced') {
  const avgPenalty = Math.abs(avg(a) - avg(b)) * 3.4;
  const sizePenalty = Math.abs(a.length - b.length) * 9999;
  const stdPenalty = Math.abs(stdDev(a) - stdDev(b)) * 0.8;
  let linePenalty = 0;
  const ac = lineCounts(a), bc = lineCounts(b);
  for (const l of LINES) linePenalty += Math.abs(ac[l] - bc[l]) * (mode === 'line' ? 580 : 250);
  const highTierPenalty = Math.abs(a.filter(p => tierValue(p) >= 2400).length - b.filter(p => tierValue(p) >= 2400).length) * 220;
  return avgPenalty + sizePenalty + stdPenalty + linePenalty + highTierPenalty;
}

function randomTeams(list) {
  const s = [...list].sort(() => Math.random() - 0.5);
  const half = Math.ceil(s.length / 2);
  return { a: s.slice(0, half), b: s.slice(half) };
}

function optimizeTeams(list, mode) {
  const n = list.length;
  let best = null;
  const attempts = n <= 12 ? Math.min(1 << n, 4096) : 6000;

  for (let i = 0; i < attempts; i++) {
    let a = [], b = [];
    if (n <= 12 && i < (1 << n)) {
      for (let j = 0; j < n; j++) ((i >> j) & 1 ? a : b).push(list[j]);
      if (Math.abs(a.length - b.length) > 1) continue;
    } else {
      ({ a, b } = randomTeams(list));
    }
    const cost = teamCost(a, b, mode) + Math.random() * 0.001;
    if (!best || cost < best.cost) best = { a, b, cost };
  }
  return best || randomTeams(list);
}

function captainTeams(list, mode) {
  const c1 = $('#captain1').value;
  const c2 = $('#captain2').value;
  if (!c1 || !c2 || c1 === c2) return toast('서로 다른 팀장 2명을 선택하세요.');
  const cap1 = getPlayer(c1), cap2 = getPlayer(c2);
  const rest = list.filter(p => p.id !== c1 && p.id !== c2);
  let best = null;
  const attempts = Math.min(5000, Math.max(1000, 1 << Math.min(rest.length, 12)));
  for (let i = 0; i < attempts; i++) {
    const shuffled = [...rest].sort(() => Math.random() - 0.5);
    const a = [cap1], b = [cap2];
    for (const p of shuffled) {
      const ca = teamCost([...a, p], b, mode);
      const cb = teamCost(a, [...b, p], mode);
      if (a.length <= b.length && ca <= cb) a.push(p);
      else if (b.length < a.length && cb <= ca) b.push(p);
      else (ca <= cb ? a : b).push(p);
    }
    const cost = teamCost(a, b, mode);
    if (!best || cost < best.cost) best = { a, b, cost };
  }
  return best;
}

function makeTeams() {
  const list = activePlayers();
  if (list.length < 2) return toast('참여 인원이 2명 이상 필요합니다.');
  state.lastTeams = copy(state.teams);
  const mode = $('#balanceMode').value;
  let result;
  if (mode === 'random') result = randomTeams(list);
  else if (mode === 'captain') result = captainTeams(list, 'line');
  else result = optimizeTeams(list, mode);
  if (!result) return;
  state.teams['1'] = result.a.map(p => p.id);
  state.teams['2'] = result.b.map(p => p.id);
  saveAndRender('팀을 생성했습니다.');
}

function undoTeams() {
  if (!state.lastTeams) return toast('되돌릴 팀이 없습니다.');
  const current = copy(state.teams);
  state.teams = copy(state.lastTeams);
  state.lastTeams = current;
  saveAndRender('되돌렸습니다.');
}

function clearTeams() {
  state.lastTeams = copy(state.teams);
  state.teams = { '1': [], '2': [] };
  saveAndRender('팀을 비웠습니다.');
}

function savePreset() {
  if (!state.teams['1'].length && !state.teams['2'].length) return toast('저장할 팀이 없습니다.');
  const name = prompt('저장 이름을 입력하세요.', `내전 ${new Date().toLocaleString('ko-KR')}`);
  if (!name) return;
  state.savedTeams.unshift({ id: uid(), name, createdAt: new Date().toISOString(), teams: copy(state.teams) });
  saveAndRender('팀을 저장했습니다.');
}

function loadPreset(id) {
  const saved = state.savedTeams.find(s => s.id === id);
  if (!saved) return;
  state.lastTeams = copy(state.teams);
  state.teams = copy(saved.teams);
  saveAndRender('저장된 팀을 불러왔습니다.');
}

function deletePreset(id) {
  state.savedTeams = state.savedTeams.filter(s => s.id !== id);
  saveAndRender('저장 팀을 삭제했습니다.');
}

function clearSaved() {
  if (!confirm('저장된 팀을 전부 삭제할까요?')) return;
  state.savedTeams = [];
  saveAndRender('저장된 팀을 모두 삭제했습니다.');
}

function prediction() {
  const a = avg(teamPlayers('1'));
  const b = avg(teamPlayers('2'));
  if (!a && !b) return '-';
  const p1 = Math.round(100 / (1 + Math.exp(-(a - b) / 360)));
  if (p1 === 50) return '반반';
  return p1 > 50 ? `1팀 ${p1}%` : `2팀 ${100 - p1}%`;
}

function copyDiscord() {
  const fmt = (title, list) => `[${title}]\n` + (list.length ? list.map(p => `${p.line} - ${p.name} / ${tierText(p)} / ${p.score}점`).join('\n') : '없음');
  const text = `${fmt('1팀', teamPlayers('1'))}\n\n${fmt('2팀', teamPlayers('2'))}\n\n평균 점수\n1팀: ${avg(teamPlayers('1')).toFixed(1)}\n2팀: ${avg(teamPlayers('2')).toFixed(1)}\n차이: ${Math.abs(avg(teamPlayers('1')) - avg(teamPlayers('2'))).toFixed(1)}\n예측: ${prediction()}`;
  navigator.clipboard.writeText(text).then(() => toast('디스코드용 팀 결과를 복사했습니다.'));
}

function sortedPlayers() {
  const q = $('#search').value.trim().toLowerCase();
  const sort = $('#sortMode').value;
  const list = state.players.filter(p => p.name.toLowerCase().includes(q));
  return list.sort((a, b) => {
    if (sort === 'fav') return Number(b.favorite) - Number(a.favorite) || Number(a.excluded) - Number(b.excluded) || adjustedScore(b) - adjustedScore(a);
    if (sort === 'score-desc') return adjustedScore(b) - adjustedScore(a);
    if (sort === 'score-asc') return adjustedScore(a) - adjustedScore(b);
    if (sort === 'tier-desc') return tierValue(b) - tierValue(a) || adjustedScore(b) - adjustedScore(a);
    if (sort === 'tier-asc') return tierValue(a) - tierValue(b) || adjustedScore(a) - adjustedScore(b);
    return a.name.localeCompare(b.name, 'ko');
  });
}

function renderPlayerCard(p, inTeam = false) {
  const card = document.createElement('div');
  card.className = `player-card ${p.excluded ? 'excluded' : ''}`;
  card.draggable = true;
  card.dataset.id = p.id;
  card.addEventListener('dragstart', e => { card.classList.add('dragging'); e.dataTransfer.setData('text/plain', p.id); });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  card.innerHTML = `
    <div class="player-main">
      <div><div class="player-name">${p.favorite ? '★ ' : ''}${escapeHtml(p.name)}</div><div class="mini">보정점수 ${adjustedScore(p)} · 승률 ${winRate(p)}%</div></div>
      <button class="btn small ghost" data-act="fav">${p.favorite ? '★' : '☆'}</button>
    </div>
    <div class="badges">
      <span class="badge">${tierText(p)}</span>
      <span class="badge ${p.excluded ? 'warn' : 'good'}">${p.excluded ? '제외' : '참여'}</span>
      <span class="badge line">${p.line}</span>
      <span class="badge">${p.score}점</span>
    </div>
    ${inTeam ? '' : `<div class="edit-grid"><input value="${escapeAttr(p.name)}" data-edit="name" title="이름" /><input type="number" value="${p.score}" data-edit="score" title="점수" /><select data-edit="tier" title="티어">${['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER','GRANDMASTER','CHALLENGER','UNRANKED'].map(t => `<option ${String(p.tier).toUpperCase() === t ? 'selected' : ''}>${t}</option>`).join('')}</select><select data-edit="line" title="라인">${['TOP','JG','MID','ADC','SUP','ALL'].map(l => `<option ${p.line === l ? 'selected' : ''}>${l}</option>`).join('')}</select><input type="number" value="${p.wins || 0}" data-edit="wins" title="승수" /><input type="number" value="${p.losses || 0}" data-edit="losses" title="패수" /></div>`}
    <div class="card-actions">
      <button class="btn small" data-act="team1">1팀</button>
      <button class="btn small" data-act="team2">2팀</button>
      <button class="btn small ghost" data-act="exclude">${p.excluded ? '참여' : '제외'}</button>
      ${inTeam ? `<button class="btn small ghost" data-act="remove">팀 제거</button>` : `<button class="btn small danger" data-act="delete">삭제</button>`}
    </div>`;

  card.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'fav') toggle(p.id, 'favorite');
    if (act === 'exclude') toggle(p.id, 'excluded');
    if (act === 'team1') moveToTeam(p.id, '1');
    if (act === 'team2') moveToTeam(p.id, '2');
    if (act === 'remove') removeFromTeams(p.id);
    if (act === 'delete') deletePlayer(p.id);
  });

  card.querySelectorAll('[data-edit]').forEach(el => {
    el.addEventListener('change', () => updatePlayer(p.id, el.dataset.edit, el.value));
  });
  return card;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

function renderPlayers() {
  const box = $('#playerList');
  box.innerHTML = '';
  const list = sortedPlayers();
  if (!list.length) {
    box.innerHTML = '<div class="panel-lite mini">유저가 없습니다.</div>';
    return;
  }
  list.forEach(p => box.appendChild(renderPlayerCard(p, false)));
}

function renderTeam(num) {
  const list = teamPlayers(num);
  const box = $(`#team${num}`);
  box.innerHTML = '';
  list.forEach(p => box.appendChild(renderPlayerCard(p, true)));
  $(`#team${num}Meta`).textContent = `${list.length}명 · 평균 ${avg(list).toFixed(1)}`;
}

function renderSaved() {
  const box = $('#savedList');
  if (!state.savedTeams.length) {
    box.innerHTML = '<div class="mini">저장된 팀이 없습니다.</div>';
    return;
  }
  box.innerHTML = state.savedTeams.map(s => `<div class="saved-item"><div><b>${escapeHtml(s.name)}</b><div class="mini">${new Date(s.createdAt).toLocaleString('ko-KR')}</div></div><div><button class="btn small" onclick="loadPreset('${s.id}')">불러오기</button> <button class="btn small danger" onclick="deletePreset('${s.id}')">삭제</button></div></div>`).join('');
}

function renderCaptains() {
  const show = $('#balanceMode').value === 'captain';
  $('#captainBox').classList.toggle('hidden', !show);
  const opts = activePlayers().map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  const old1 = $('#captain1').value, old2 = $('#captain2').value;
  $('#captain1').innerHTML = `<option value="">선택</option>${opts}`;
  $('#captain2').innerHTML = `<option value="">선택</option>${opts}`;
  if (old1) $('#captain1').value = old1;
  if (old2) $('#captain2').value = old2;
}

function renderStats() {
  const active = activePlayers();
  const t1 = teamPlayers('1'), t2 = teamPlayers('2');
  $('#statSelected').textContent = active.length;
  $('#statAvg1').textContent = avg(t1).toFixed(1);
  $('#statAvg2').textContent = avg(t2).toFixed(1);
  $('#statDiff').textContent = Math.abs(avg(t1) - avg(t2)).toFixed(1);
  $('#statPredict').textContent = prediction();
}

function render() {
  $('#sortMode').value = state.sortMode;
  renderCaptains();
  renderPlayers();
  renderTeam('1');
  renderTeam('2');
  renderSaved();
  renderStats();
}

function setupDrops() {
  $$('.dropzone').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      moveToTeam(id, zone.dataset.team);
    });
  });
}

$('#addManualBtn').addEventListener('click', addManualPlayer);
$('#shuffleBtn').addEventListener('click', makeTeams);
$('#undoBtn').addEventListener('click', undoTeams);
$('#clearTeamsBtn').addEventListener('click', clearTeams);
$('#copyBtn').addEventListener('click', copyDiscord);
$('#savePresetBtn').addEventListener('click', savePreset);
$('#clearSavedBtn').addEventListener('click', clearSaved);
$('#sortMode').addEventListener('change', e => { state.sortMode = e.target.value; saveAndRender(); });
$('#search').addEventListener('input', renderPlayers);
$('#balanceMode').addEventListener('change', renderCaptains);

window.loadPreset = loadPreset;
window.deletePreset = deletePreset;

setupDrops();
render();
