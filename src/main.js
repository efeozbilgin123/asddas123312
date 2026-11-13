import { io } from 'socket.io-client';
import {
  autoArrangePairs,
  autoArrangeRuns,
  findBestOpening,
  findPairsInHand,
  validateGroup,
  validatePair
} from '../shared/melds.js';
import { COLOR_LABELS, formatTileLabel, isOkeyTile } from '../shared/tiles.js';
import { LocalSingleplayerClient } from './client/localSession.js';
import { OkeyTable3D } from './client/scene3d.js';
import { soundFX } from './client/sound.js';

function getOrCreatePlayerId() {
  let id = localStorage.getItem('yuzbir_player_id');
  if (!id) {
    id = `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    localStorage.setItem('yuzbir_player_id', id);
  }
  return id;
}

const playerId = getOrCreatePlayerId();
const savedName = localStorage.getItem('yuzbir_player_name') || '';

const els = {
  canvas: document.getElementById('table-canvas'),
  wordmark: document.querySelector('.wordmark'),
  connBadge: document.getElementById('connection-badge'),
  roomPill: document.getElementById('room-pill'),
  cameraGroup: document.getElementById('camera-group'),
  btnSound: document.getElementById('btn-sound'),
  btnRules: document.getElementById('btn-rules'),
  btnLeave: document.getElementById('btn-leave'),

  viewLobby: document.getElementById('view-lobby'),
  viewWaiting: document.getElementById('view-waiting'),
  viewGame: document.getElementById('view-game'),

  playerName: document.getElementById('player-name'),
  playerNameHelp: document.getElementById('player-name-help'),
  roomName: document.getElementById('room-name'),
  optKatlamali: document.getElementById('opt-katlamali'),
  optIslek: document.getElementById('opt-islek'),
  optTimer: document.getElementById('opt-timer'),
  btnQuickPlay: document.getElementById('btn-quick-play'),
  btnSingleplayer: document.getElementById('btn-singleplayer'),
  btnCreateRoom: document.getElementById('btn-create-room'),

  joinCodeForm: document.getElementById('join-code-form'),
  joinCode: document.getElementById('join-code'),
  joinHelp: document.getElementById('join-help'),

  btnRefreshRooms: document.getElementById('btn-refresh-rooms'),
  btnRetryRooms: document.getElementById('btn-retry-rooms'),
  roomsLoading: document.getElementById('rooms-loading'),
  roomsError: document.getElementById('rooms-error'),
  roomsEmpty: document.getElementById('rooms-empty'),
  roomsTableWrap: document.getElementById('rooms-table-wrap'),
  roomsTbody: document.getElementById('rooms-tbody'),

  waitRoomTitle: document.getElementById('wait-room-title'),
  waitRoomCode: document.getElementById('wait-room-code'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  waitSeatsGrid: document.getElementById('wait-seats-grid'),
  waitHostControls: document.getElementById('wait-host-controls'),
  waitKatlamali: document.getElementById('wait-katlamali'),
  waitIslek: document.getElementById('wait-islek'),
  waitTimer: document.getElementById('wait-timer'),
  waitStatusMsg: document.getElementById('wait-status-msg'),
  btnStartMatch: document.getElementById('btn-start-match'),

  hudRound: document.getElementById('hud-round'),
  hudDeck: document.getElementById('hud-deck'),
  hudOkey: document.getElementById('hud-okey'),
  hudThreshold: document.getElementById('hud-threshold'),
  hudTimer: document.getElementById('hud-timer'),
  hudTurnText: document.getElementById('hud-turn-text'),

  stagingBar: document.getElementById('staging-bar'),
  stagingGroups: document.getElementById('staging-groups'),
  stagingTotal: document.getElementById('staging-total'),
  btnCommitOpen: document.getElementById('btn-commit-open'),
  btnClearStage: document.getElementById('btn-clear-stage'),

  btnSortRuns: document.getElementById('btn-sort-runs'),
  btnSortPairs: document.getElementById('btn-sort-pairs'),
  btnAutoStage: document.getElementById('btn-auto-stage'),
  btnClearSel: document.getElementById('btn-clear-sel'),
  selectionHint: document.getElementById('selection-hint'),

  btnDrawDeck: document.getElementById('btn-draw-deck'),
  btnDrawDiscard: document.getElementById('btn-draw-discard'),
  btnReturnDiscard: document.getElementById('btn-return-discard'),
  btnStageGroup: document.getElementById('btn-stage-group'),
  btnLayMeld: document.getElementById('btn-lay-meld'),
  btnDiscardTile: document.getElementById('btn-discard-tile'),

  dialogRules: document.getElementById('dialog-rules'),
  dialogRound: document.getElementById('dialog-round'),
  roundDialogTitle: document.getElementById('round-dialog-title'),
  roundDialogMsg: document.getElementById('round-dialog-msg'),
  roundTbody: document.getElementById('round-tbody'),
  btnNextRound: document.getElementById('btn-next-round'),
  roundWaitHost: document.getElementById('round-wait-host'),

  dialogSecret: document.getElementById('dialog-secret'),
  secretLockView: document.getElementById('secret-lock-view'),
  secretPinInput: document.getElementById('secret-pin-input'),
  secretPinHelp: document.getElementById('secret-pin-help'),
  secretPanelView: document.getElementById('secret-panel-view'),
  secretMyTile: document.getElementById('secret-my-tile'),
  btnSecretOkey: document.getElementById('btn-secret-okey'),
  btnSecretRefresh: document.getElementById('btn-secret-refresh'),
  secretStatus: document.getElementById('secret-status'),
  secretSources: document.getElementById('secret-sources')
};

els.playerName.value = savedName;
const urlRoom = new URLSearchParams(window.location.search).get('room');
if (urlRoom) {
  els.joinCode.value = urlRoom.toUpperCase().slice(0, 6);
}

let currentRoom = null;
let localClient = null;
let secretUnlocked = false;
let stagedGroups = []; // [{ id, mode: 'series'|'pairs', tiles, points }]
let lastEventIdSeen = 0;
let lastRoundModalNumber = 0;
let bannerNotice = '';
let noticeTimer = null;

const socket = io({
  auth: { playerId }
});

function sendGameAction(event, data, ack) {
  if (localClient) {
    localClient.action(event, data, ack);
  } else {
    socket.emit(event, data, ack);
  }
}

const scene3d = new OkeyTable3D(els.canvas, {
  onDrawDeck: () => handleDrawDeck(),
  onDrawDiscard: () => handleDrawDiscard(),
  onDiscardTile: (tileId) => handleDiscardTile(tileId),
  onLayoffTile: (tileId, meldId) => handleLayoffTile(tileId, meldId),
  onSelectionChange: () => updateGameControls(),
  onRackReorder: () => soundFX.playTileClack(1.15)
});

function showNotice(text, duration = 3500) {
  bannerNotice = text;
  updateTurnBanner();
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    bannerNotice = '';
    updateTurnBanner();
  }, duration);
}

function setConnectionState(kind, label) {
  els.connBadge.textContent = label;
  els.connBadge.classList.remove('pill--ok', 'pill--warn');
  if (kind === 'ok') els.connBadge.classList.add('pill--ok');
  if (kind === 'warn') els.connBadge.classList.add('pill--warn');
}

function setRoomsRegionState(mode, rooms = []) {
  els.roomsLoading.hidden = mode !== 'loading';
  els.roomsError.hidden = mode !== 'error';
  els.roomsEmpty.hidden = mode !== 'empty';
  els.roomsTableWrap.hidden = mode !== 'full';

  if (mode === 'full') {
    els.roomsTbody.innerHTML = '';
    for (const r of rooms) {
      const tr = document.createElement('tr');
      const ruleText = r.options?.katlamali ? 'Katlamalı' : 'Klasik 101';
      const statusText = r.status === 'playing' ? 'Oyunda' : 'Bekliyor';

      const tdName = document.createElement('td');
      tdName.textContent = `${r.name} (${statusText})`;

      const tdCode = document.createElement('td');
      tdCode.className = 'num';
      tdCode.textContent = r.code;

      const tdRule = document.createElement('td');
      tdRule.textContent = ruleText;

      const tdCount = document.createElement('td');
      tdCount.className = 'num';
      tdCount.textContent = `${r.humanCount} / 4`;

      const tdAct = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--sm';
      btn.textContent = 'Katıl';
      btn.disabled = r.openSeats === 0 && r.status === 'playing';
      btn.addEventListener('click', () => joinRoomByCode(r.code));
      tdAct.appendChild(btn);

      tr.append(tdName, tdCode, tdRule, tdCount, tdAct);
      els.roomsTbody.appendChild(tr);
    }
  }
}

function validatePlayerName() {
  const val = els.playerName.value.trim();
  if (!val) {
    els.playerName.setAttribute('aria-invalid', 'true');
    els.playerName.setAttribute('aria-describedby', 'player-name-help');
    els.playerNameHelp.textContent = 'Masaya oturmak için bir oyuncu adı yazın.';
    els.playerName.focus();
    return null;
  }
  els.playerName.removeAttribute('aria-invalid');
  els.playerNameHelp.textContent = '';
  localStorage.setItem('yuzbir_player_name', val);
  return val;
}

function startSingleplayer() {
  const rawName = els.playerName.value.trim();
  const name = rawName || 'Oyuncu';
  if (rawName) {
    els.playerName.removeAttribute('aria-invalid');
    els.playerNameHelp.textContent = '';
    localStorage.setItem('yuzbir_player_name', rawName);
  }

  if (localClient) {
    localClient.destroy();
    localClient = null;
  }

  lastEventIdSeen = 0;
  lastRoundModalNumber = 0;
  stagedGroups = [];

  localClient = new LocalSingleplayerClient({
    playerName: name,
    options: {
      katlamali: els.optKatlamali.checked,
      islekPenalty: els.optIslek.checked,
      turnSeconds: Number(els.optTimer.value)
    },
    onState: (room) => {
      switchView(room);
    }
  });
  localClient.emitRoomState();
}

function createRoom(quickStart) {
  const name = validatePlayerName();
  if (!name) return;

  const btn = quickStart ? els.btnQuickPlay : els.btnCreateRoom;
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;

  socket.emit(
    'room:create',
    {
      playerName: name,
      roomName: els.roomName.value.trim(),
      quickStart,
      options: {
        katlamali: els.optKatlamali.checked,
        islekPenalty: els.optIslek.checked,
        turnSeconds: Number(els.optTimer.value)
      }
    },
    (res) => {
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      if (!res?.ok) {
        els.playerNameHelp.textContent = res?.error || 'Oda kurulamadı.';
      }
    }
  );
}

function joinRoomByCode(code) {
  const name = validatePlayerName();
  if (!name) return;

  const clean = String(code || '').trim().toUpperCase();
  if (!clean) {
    els.joinCode.setAttribute('aria-invalid', 'true');
    els.joinCode.setAttribute('aria-describedby', 'join-help');
    els.joinHelp.textContent = 'Katılmak için 4 haneli oda kodunu yazın.';
    els.joinCode.focus();
    return;
  }

  els.joinCode.removeAttribute('aria-invalid');
  els.joinHelp.textContent = '';

  socket.emit('room:join', { roomCode: clean, playerName: name }, (res) => {
    if (!res?.ok) {
      els.joinCode.setAttribute('aria-invalid', 'true');
      els.joinHelp.textContent = res?.error || 'Odaya katılınamadı.';
    }
  });
}

function refreshRooms() {
  setRoomsRegionState('loading');
  socket.emit('rooms:get', (res) => {
    if (!res?.ok) {
      setRoomsRegionState('error');
      return;
    }
    if (!res.rooms || res.rooms.length === 0) {
      setRoomsRegionState('empty');
    } else {
      setRoomsRegionState('full', res.rooms);
    }
  });
}

function switchView(room) {
  currentRoom = room;
  if (!room) {
    els.viewLobby.hidden = false;
    els.viewWaiting.hidden = true;
    els.viewGame.hidden = true;
    els.btnLeave.hidden = true;
    els.roomPill.hidden = true;
    els.cameraGroup.hidden = true;
    stagedGroups = [];
    lastRoundModalNumber = 0;
    if (els.dialogRound.open) els.dialogRound.close();
    if (els.dialogSecret.open) els.dialogSecret.close();
    scene3d.renderGameState(null);
    return;
  }

  els.btnLeave.hidden = false;
  els.roomPill.hidden = false;
  els.roomPill.textContent = room.isLocal ? 'Tek Kişilik (Yerel)' : `Oda ${room.code}`;

  if (room.status === 'waiting') {
    els.viewLobby.hidden = true;
    els.viewWaiting.hidden = false;
    els.viewGame.hidden = true;
    els.cameraGroup.hidden = true;
    renderWaitingRoom(room);
    scene3d.renderGameState(null);
  } else {
    els.viewLobby.hidden = true;
    els.viewWaiting.hidden = true;
    els.viewGame.hidden = false;
    els.cameraGroup.hidden = false;
    renderGameRoom(room);
  }
}

function renderWaitingRoom(room) {
  els.waitRoomTitle.textContent = room.name;
  els.waitRoomCode.textContent = room.code;
  els.waitHostControls.hidden = !room.isHost;
  els.btnStartMatch.hidden = !room.isHost;

  els.waitKatlamali.checked = Boolean(room.options.katlamali);
  els.waitIslek.checked = Boolean(room.options.islekPenalty);
  els.waitTimer.value = String(room.options.turnSeconds || 60);

  els.waitSeatsGrid.innerHTML = '';
  const seatLabels = ['Güney', 'Doğu', 'Kuzey', 'Batı'];

  room.seats.forEach((seat) => {
    const card = document.createElement('div');
    card.className = 'wait-seat';

    const info = document.createElement('div');
    info.className = 'wait-seat__info';

    const title = document.createElement('strong');
    title.textContent =
      seat.type === 'empty' ? `${seatLabels[seat.seatIndex]} koltuğu boş` : seat.name;

    const role = document.createElement('span');
    role.className = 'wait-seat__role';
    role.textContent =
      seat.type === 'human'
        ? 'Gerçek oyuncu'
        : seat.type === 'bot'
          ? 'Yapay zekâ bot'
          : 'Oyun başlayınca bot atanabilir';

    info.append(title, role);
    card.appendChild(info);

    if (room.isHost && seat.type !== 'human') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--quiet btn--sm';
      btn.textContent = seat.type === 'bot' ? 'Botu Çıkar' : 'Bot Ekle';
      btn.addEventListener('click', () => {
        socket.emit('room:toggleBot', { seatIndex: seat.seatIndex }, (res) => {
          if (!res?.ok) els.waitStatusMsg.textContent = res?.error || 'Koltuk güncellenemedi.';
        });
      });
      card.appendChild(btn);
    }

    els.waitSeatsGrid.appendChild(card);
  });
}

function renderGameRoom(room) {
  const game = room.game;
  if (!game) return;

  // Handle sound effects for newly seen event
  if (game.lastEvent && game.lastEvent.id > lastEventIdSeen) {
    lastEventIdSeen = game.lastEvent.id;
    const ev = game.lastEvent;
    if (ev.type === 'open_hand' || ev.type === 'round_over') {
      soundFX.playMeldChime();
    } else if (['draw_deck', 'draw_discard', 'discard', 'lay_meld', 'layoff'].includes(ev.type)) {
      soundFX.playTileClack(ev.type === 'discard' ? 0.92 : 1.08);
    }
    if (els.dialogSecret.open && !els.secretPanelView.hidden) {
      sendGameAction('admin:snapshot', {}, (res) => {
        if (res?.ok && res.snapshot) renderSecretSnapshot(res.snapshot);
      });
    }
  }

  scene3d.renderGameState(game);

  els.hudRound.textContent = String(game.roundNumber);
  els.hudDeck.textContent = String(game.deckCount);
  els.hudThreshold.textContent = String(game.openThreshold);

  if (game.okeyTarget) {
    const colorName = COLOR_LABELS[game.okeyTarget.color] || game.okeyTarget.color;
    els.hudOkey.textContent = `${colorName} ${game.okeyTarget.number}`;
    els.hudOkey.className = `okey-chip okey-chip--${game.okeyTarget.color}`;
  }

  const viewerIdx = game.viewerSeatIndex;
  for (let rel = 0; rel < 4; rel += 1) {
    const seatIdx = (viewerIdx + rel) % 4;
    const seat = game.seats[seatIdx];
    const card = document.getElementById(`seat-card-${rel}`);
    if (!card || !seat) continue;

    card.classList.toggle(
      'is-active',
      game.phase === 'playing' && game.currentSeat === seatIdx
    );
    card.querySelector('.seat-name').textContent =
      rel === 0 ? `${seat.name} (Siz)` : seat.name;
    card.querySelector('.seat-score').textContent = `${seat.totalScore} p`;
    card.querySelector('.seat-tiles').textContent = `${seat.tileCount} taş`;

    const tag = card.querySelector('.seat-open-tag');
    if (seat.opened) {
      tag.classList.add('is-opened');
      tag.textContent = seat.openMode === 'pairs' ? 'Çift açık' : `${seat.openedPoints} açık`;
    } else {
      tag.classList.remove('is-opened');
      tag.textContent = 'Açmadı';
    }
  }

  // Filter staged groups to only keep tiles still in hand
  const handIds = new Set((game.seats[viewerIdx]?.hand || []).map((t) => t.id));
  stagedGroups = stagedGroups.filter((g) => g.tiles.every((t) => handIds.has(t.id)));
  if (game.seats[viewerIdx]?.opened) {
    stagedGroups = [];
  }

  updateTurnBanner();
  updateGameControls();

  // Round over modal
  if (game.phase === 'roundOver' && game.roundSummary && game.roundNumber !== lastRoundModalNumber) {
    lastRoundModalNumber = game.roundNumber;
    openRoundSummaryDialog(room, game.roundSummary);
  } else if (game.phase === 'playing' && els.dialogRound.open) {
    els.dialogRound.close();
  }
}

function updateTurnBanner() {
  const game = currentRoom?.game;
  if (!game) return;

  if (bannerNotice) {
    els.hudTurnText.textContent = bannerNotice;
    return;
  }

  if (game.phase === 'roundOver') {
    els.hudTurnText.textContent = game.roundSummary?.message || 'El tamamlandı.';
    return;
  }

  const activeSeat = game.seats[game.currentSeat];
  const isMe = game.currentSeat === game.viewerSeatIndex;
  if (isMe) {
    if (game.turnPhase === 'draw') {
      els.hudTurnText.textContent = 'Sıra sizde: ortadan taş çekin veya solunuzdaki taşı alın.';
    } else if (game.pickedDiscardTileId) {
      els.hudTurnText.textContent = 'Yandan aldığınız taşı açtığınız perlerde kullanın veya geri koyun.';
    } else {
      els.hudTurnText.textContent = 'Sıra sizde: taş açın, işleyin veya sağ kenara 1 taş atın.';
    }
  } else {
    els.hudTurnText.textContent = `${activeSeat?.name || 'Oyuncu'} hamle yapıyor.`;
  }
}

function updateGameControls() {
  const game = currentRoom?.game;
  if (!game) return;

  const viewerIdx = game.viewerSeatIndex;
  const mySeat = game.seats[viewerIdx];
  const isMyTurn = game.phase === 'playing' && game.currentSeat === viewerIdx;
  const isDrawPhase = isMyTurn && game.turnPhase === 'draw';
  const isPlayPhase = isMyTurn && game.turnPhase === 'play';

  const leftSeatIdx = (viewerIdx + 3) % 4;
  const leftTopTile = game.discardPiles[leftSeatIdx]?.topTile;

  els.btnDrawDeck.hidden = !isDrawPhase;
  els.btnDrawDiscard.hidden = !(isDrawPhase && leftTopTile);
  if (leftTopTile) {
    els.btnDrawDiscard.textContent = `Yandan Al (${formatTileLabel(leftTopTile)})`;
  }

  els.btnReturnDiscard.hidden = !(
    isPlayPhase &&
    game.pickedDiscardTileId &&
    !game.committedMeldThisTurn
  );

  const selected = scene3d.getSelectedTiles();
  els.btnClearSel.hidden = selected.length === 0;

  // Evaluate selected tiles
  let selectionMsg = '';
  let validGroup = null;
  let validPair = null;

  if (selected.length > 0) {
    if (selected.length === 1) {
      selectionMsg = `1 taş seçili (${formatTileLabel(selected[0])})`;
      if (isPlayPhase && mySeat?.opened) {
        selectionMsg += ' · Masadaki yeşil gruplara tıklayıp işleyebilirsiniz';
      }
    } else if (selected.length === 2) {
      validPair = validatePair(selected, game.okeyTarget);
      selectionMsg = validPair.valid
        ? `Geçerli çift (${validPair.points} sayı)`
        : `${selected.length} taş seçili`;
    } else {
      validGroup = validateGroup(selected, game.okeyTarget);
      selectionMsg = validGroup.valid
        ? `Geçerli ${validGroup.type === 'run' ? 'seri' : 'per'} (${validGroup.points} sayı)`
        : validGroup.reason;
    }
  }
  els.selectionHint.textContent = selectionMsg;

  // Stage / Lay / Discard buttons
  const canStage =
    !mySeat?.opened &&
    ((validGroup && validGroup.valid) || (validPair && validPair.valid));

  els.btnStageGroup.hidden = !canStage;
  els.btnLayMeld.hidden = !(
    isPlayPhase &&
    mySeat?.opened &&
    ((validGroup && validGroup.valid) || (mySeat.openMode === 'pairs' && validPair?.valid))
  );
  els.btnDiscardTile.hidden = !(isPlayPhase && selected.length === 1);

  renderStagingBar(game, mySeat, isPlayPhase);
}

function renderStagingBar(game, mySeat, isPlayPhase) {
  if (mySeat?.opened || stagedGroups.length === 0) {
    els.stagingBar.hidden = true;
    return;
  }

  els.stagingBar.hidden = false;
  els.stagingGroups.innerHTML = '';

  let totalPoints = 0;
  let pairsCount = 0;
  const allPairs = stagedGroups.every((g) => g.mode === 'pairs');

  stagedGroups.forEach((g) => {
    totalPoints += g.points;
    if (g.mode === 'pairs') pairsCount += 1;

    const chip = document.createElement('span');
    chip.className = 'staged-chip';
    const label = g.tiles.map((t) => formatTileLabel(t)).join(', ');
    const text = document.createElement('span');
    text.textContent = `${label} (${g.points})`;

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.setAttribute('aria-label', 'Grubu çıkar');
    rm.textContent = '×';
    rm.addEventListener('click', () => {
      stagedGroups = stagedGroups.filter((item) => item.id !== g.id);
      updateGameControls();
    });

    chip.append(text, rm);
    els.stagingGroups.appendChild(chip);
  });

  if (allPairs) {
    els.stagingTotal.textContent = `Çift: ${pairsCount} / 5`;
    els.btnCommitOpen.disabled = !(isPlayPhase && pairsCount >= 5);
  } else {
    els.stagingTotal.textContent = `Toplam: ${totalPoints} / ${game.openThreshold}`;
    els.btnCommitOpen.disabled = !(isPlayPhase && totalPoints >= game.openThreshold);
  }
}

function openRoundSummaryDialog(room, summary) {
  els.roundDialogTitle.textContent = `${summary.roundNumber}. El Sonucu`;
  els.roundDialogMsg.textContent = summary.message || '';
  els.roundTbody.innerHTML = '';

  summary.rows.forEach((row) => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = row.isWinner ? `${row.name} (Kazandı)` : row.name;

    const tdOpen = document.createElement('td');
    tdOpen.textContent = row.opened ? 'Açtı' : 'Açmadı';

    const tdHand = document.createElement('td');
    tdHand.className = 'num';
    tdHand.textContent = String(row.handValue);

    const tdPen = document.createElement('td');
    tdPen.className = 'num';
    tdPen.textContent = String(row.penalties);

    const tdDelta = document.createElement('td');
    tdDelta.className = 'num';
    tdDelta.textContent = row.roundDelta > 0 ? `+${row.roundDelta}` : String(row.roundDelta);

    const tdTot = document.createElement('td');
    tdTot.className = 'num';
    tdTot.textContent = String(row.totalScore);

    tr.append(tdName, tdOpen, tdHand, tdPen, tdDelta, tdTot);
    els.roundTbody.appendChild(tr);
  });

  els.btnNextRound.hidden = !room.isHost;
  els.roundWaitHost.hidden = room.isHost;
  if (!els.dialogRound.open) {
    els.dialogRound.showModal();
  }
}

// Game actions
function handleDrawDeck() {
  sendGameAction('game:drawDeck', {}, (res) => {
    if (!res?.ok && res?.error) showNotice(res.error);
  });
}

function handleDrawDiscard() {
  sendGameAction('game:drawDiscard', {}, (res) => {
    if (!res?.ok && res?.error) showNotice(res.error);
  });
}

function handleDiscardTile(tileId) {
  sendGameAction('game:discard', { tileId }, (res) => {
    if (!res?.ok && res?.error) {
      showNotice(res.error);
    } else {
      scene3d.clearSelection();
    }
  });
}

function handleLayoffTile(tileId, meldId) {
  sendGameAction('game:layoffTile', { tileId, meldId }, (res) => {
    if (!res?.ok && res?.error) {
      showNotice(res.error);
    } else {
      scene3d.clearSelection();
    }
  });
}

// Button Event Wiring
els.btnQuickPlay.addEventListener('click', () => createRoom(true));
els.btnSingleplayer?.addEventListener('click', startSingleplayer);
els.btnCreateRoom.addEventListener('click', () => createRoom(false));

els.joinCodeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  joinRoomByCode(els.joinCode.value);
});

els.btnRefreshRooms.addEventListener('click', refreshRooms);
els.btnRetryRooms.addEventListener('click', refreshRooms);

els.btnLeave.addEventListener('click', () => {
  if (localClient) {
    localClient.destroy();
    localClient = null;
    switchView(null);
    return;
  }
  socket.emit('room:leave', {}, () => {
    switchView(null);
    refreshRooms();
  });
});

els.btnCopyCode.addEventListener('click', async () => {
  if (!currentRoom) return;
  const inviteUrl = `${window.location.origin}/?room=${currentRoom.code}`;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    els.waitStatusMsg.textContent = `Davet linki panoya kopyalandı: ${inviteUrl}`;
  } catch {
    els.waitStatusMsg.textContent = `Oda kodu: ${currentRoom.code}`;
  }
});

function syncHostOptions() {
  socket.emit('room:options', {
    katlamali: els.waitKatlamali.checked,
    islekPenalty: els.waitIslek.checked,
    turnSeconds: Number(els.waitTimer.value)
  });
}

els.waitKatlamali.addEventListener('change', syncHostOptions);
els.waitIslek.addEventListener('change', syncHostOptions);
els.waitTimer.addEventListener('change', syncHostOptions);

els.btnStartMatch.addEventListener('click', () => {
  socket.emit('room:start', {}, (res) => {
    if (!res?.ok) els.waitStatusMsg.textContent = res?.error || 'Oyun başlatılamadı.';
  });
});

els.btnNextRound.addEventListener('click', () => {
  sendGameAction('game:nextRound', {}, (res) => {
    if (!res?.ok) showNotice(res?.error || 'Yeni el başlatılamadı.');
  });
});

els.btnDrawDeck.addEventListener('click', handleDrawDeck);
els.btnDrawDiscard.addEventListener('click', handleDrawDiscard);
els.btnReturnDiscard.addEventListener('click', () => {
  sendGameAction('game:returnDiscard', {}, (res) => {
    if (!res?.ok && res?.error) showNotice(res.error);
  });
});

els.btnClearSel.addEventListener('click', () => {
  scene3d.clearSelection();
  updateGameControls();
});

els.btnSortRuns.addEventListener('click', () => {
  const game = currentRoom?.game;
  const hand = game?.seats[game.viewerSeatIndex]?.hand;
  if (!hand) return;
  const arranged = autoArrangeRuns(hand, game.okeyTarget);
  scene3d.arrangeHandOrder(arranged);
  soundFX.playTileClack(1.1);
});

els.btnSortPairs.addEventListener('click', () => {
  const game = currentRoom?.game;
  const hand = game?.seats[game.viewerSeatIndex]?.hand;
  if (!hand) return;
  const arranged = autoArrangePairs(hand, game.okeyTarget);
  scene3d.arrangeHandOrder(arranged);
  soundFX.playTileClack(1.1);
});

els.btnAutoStage.addEventListener('click', () => {
  const game = currentRoom?.game;
  const mySeat = game?.seats[game.viewerSeatIndex];
  if (!game || !mySeat || mySeat.opened) {
    showNotice('Eliniz açıkken yeni grubu seçip Grubu İndir düğmesini kullanın.');
    return;
  }

  const best = findBestOpening(mySeat.hand, game.okeyTarget, game.openThreshold);
  if (best.groups.length > 0) {
    stagedGroups = best.groups.map((g, idx) => ({
      id: `auto-${Date.now()}-${idx}`,
      mode: 'series',
      tiles: g.slots.map((s) => s.tile),
      points: g.points
    }));
    scene3d.clearSelection();
    updateGameControls();
    if (!best.canOpen) {
      showNotice(`Bulunan en yüksek toplam ${best.totalPoints} sayı (açılış için ${game.openThreshold} gerekir).`);
    }
  } else {
    const pairs = findPairsInHand(mySeat.hand, game.okeyTarget);
    if (pairs.length >= 5) {
      stagedGroups = pairs.map((pair, idx) => ({
        id: `pair-${Date.now()}-${idx}`,
        mode: 'pairs',
        tiles: pair,
        points: validatePair(pair, game.okeyTarget).points
      }));
      scene3d.clearSelection();
      updateGameControls();
    } else {
      showNotice('Istakada otomatik grup bulunamadı.');
    }
  }
});

els.btnStageGroup.addEventListener('click', () => {
  const game = currentRoom?.game;
  if (!game) return;
  const selected = scene3d.getSelectedTiles();
  const stagedIds = new Set(stagedGroups.flatMap((g) => g.tiles.map((t) => t.id)));

  if (selected.some((t) => stagedIds.has(t.id))) {
    showNotice('Seçili taşlardan biri zaten hazırlık grubunda.');
    return;
  }

  if (selected.length === 2) {
    const pair = validatePair(selected, game.okeyTarget);
    if (pair.valid) {
      stagedGroups.push({
        id: `st-${Date.now()}`,
        mode: 'pairs',
        tiles: [...selected],
        points: pair.points
      });
      scene3d.clearSelection();
      updateGameControls();
      return;
    }
  }

  const group = validateGroup(selected, game.okeyTarget);
  if (!group.valid) {
    showNotice(group.reason);
    return;
  }

  // Switching between pairs and series clears incompatible mode
  if (stagedGroups.some((g) => g.mode === 'pairs')) {
    stagedGroups = [];
  }

  stagedGroups.push({
    id: `st-${Date.now()}`,
    mode: 'series',
    tiles: group.slots.map((s) => s.tile),
    points: group.points
  });
  scene3d.clearSelection();
  updateGameControls();
});

els.btnClearStage.addEventListener('click', () => {
  stagedGroups = [];
  updateGameControls();
});

els.btnCommitOpen.addEventListener('click', () => {
  if (stagedGroups.length === 0) return;
  const mode = stagedGroups.every((g) => g.mode === 'pairs') ? 'pairs' : 'series';
  const groups = stagedGroups.map((g) => g.tiles.map((t) => t.id));
  sendGameAction('game:openHand', { groups, mode }, (res) => {
    if (!res?.ok) {
      showNotice(res?.error || 'El açılamadı.');
    } else {
      stagedGroups = [];
      scene3d.clearSelection();
    }
  });
});

els.btnLayMeld.addEventListener('click', () => {
  const selected = scene3d.getSelectedTiles();
  if (selected.length < 2) return;
  sendGameAction('game:layMeld', { tileIds: selected.map((t) => t.id) }, (res) => {
    if (!res?.ok) {
      showNotice(res?.error || 'Grup indirilemedi.');
    } else {
      scene3d.clearSelection();
    }
  });
});

els.btnDiscardTile.addEventListener('click', () => {
  const selected = scene3d.getSelectedTiles();
  if (selected.length === 1) {
    handleDiscardTile(selected[0].id);
  }
});

// Camera Preset Switcher
els.cameraGroup.querySelectorAll('.seg__btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    els.cameraGroup.querySelectorAll('.seg__btn').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    scene3d.setCameraPreset(btn.dataset.cam);
  });
});

// Sound toggle
let muted = false;
els.btnSound.addEventListener('click', () => {
  muted = !muted;
  soundFX.setMuted(muted);
  els.btnSound.setAttribute('aria-pressed', String(muted));
  els.btnSound.querySelector('span').textContent = muted ? 'Ses kapalı' : 'Ses açık';
});

// Dialog controls
els.btnRules.addEventListener('click', () => {
  els.dialogRules.showModal();
});

document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const dlg = document.getElementById(btn.dataset.closeDialog);
    if (dlg?.open) dlg.close();
  });
});

[els.dialogRules, els.dialogRound, els.dialogSecret].forEach((dlg) => {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
});

// Secret Tile Vault (5 rapid taps on wordmark OR Ctrl+Shift+O / Ctrl+Shift+G)
function openSecretVault() {
  if (!currentRoom?.game || currentRoom.game.phase !== 'playing') {
    showNotice('Gizli kasa yalnızca aktif el sırasında kullanılabilir.');
    return;
  }

  els.secretPinHelp.textContent = '';
  els.secretStatus.textContent = '';

  if (localClient || secretUnlocked) {
    els.secretLockView.hidden = true;
    els.secretPanelView.hidden = false;
    sendGameAction('admin:snapshot', {}, (res) => {
      if (res?.ok && res.snapshot) {
        renderSecretSnapshot(res.snapshot);
      } else {
        els.secretLockView.hidden = false;
        els.secretPanelView.hidden = true;
      }
    });
  } else {
    els.secretLockView.hidden = false;
    els.secretPanelView.hidden = true;
  }

  if (!els.dialogSecret.open) {
    els.dialogSecret.showModal();
  }
}

let wordmarkTapCount = 0;
let wordmarkTapTimer = null;
els.wordmark.addEventListener('click', (e) => {
  e.preventDefault();
  wordmarkTapCount += 1;
  if (wordmarkTapTimer) clearTimeout(wordmarkTapTimer);
  if (wordmarkTapCount >= 5) {
    wordmarkTapCount = 0;
    openSecretVault();
    return;
  }
  wordmarkTapTimer = setTimeout(() => {
    wordmarkTapCount = 0;
  }, 2200);
});

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'g')) {
    e.preventDefault();
    openSecretVault();
  }
});

els.secretLockView.addEventListener('submit', (e) => {
  e.preventDefault();
  const pin = els.secretPinInput.value.trim();
  if (!pin) {
    els.secretPinHelp.textContent = 'Gizli anahtarı girin.';
    els.secretPinInput.focus();
    return;
  }
  sendGameAction('admin:unlock', { pin }, (res) => {
    if (!res?.ok) {
      els.secretPinHelp.textContent = res?.error || 'Gizli anahtar hatalı.';
      els.secretPinInput.focus();
      return;
    }
    secretUnlocked = true;
    els.secretPinInput.value = '';
    els.secretPinHelp.textContent = '';
    els.secretLockView.hidden = true;
    els.secretPanelView.hidden = false;
    if (res.snapshot) {
      renderSecretSnapshot(res.snapshot);
    }
  });
});

function renderSecretSnapshot(snapshot) {
  const viewerIdx = currentRoom?.game?.viewerSeatIndex ?? 0;
  const mySeat = snapshot.seats.find((s) => s.seatIndex === viewerIdx);
  const selectedOnRack = scene3d.getSelectedTiles();
  const prevChoice = selectedOnRack[0]?.id || els.secretMyTile.value;

  els.secretMyTile.innerHTML = '';
  (mySeat?.hand || []).forEach((tile) => {
    const opt = document.createElement('option');
    opt.value = tile.id;
    opt.textContent = isOkeyTile(tile, snapshot.okeyTarget)
      ? `${formatTileLabel(tile)} (OKEY)`
      : formatTileLabel(tile);
    els.secretMyTile.appendChild(opt);
  });
  if (prevChoice && (mySeat?.hand || []).some((t) => t.id === prevChoice)) {
    els.secretMyTile.value = prevChoice;
  }

  els.secretSources.innerHTML = '';

  const renderBucket = (title, tiles, sourceKind, targetSeatIndex = null) => {
    const group = document.createElement('div');
    group.className = 'secret-group';

    const head = document.createElement('div');
    head.className = 'secret-group__title';
    head.textContent = `${title} (${tiles.length} taş)`;
    group.appendChild(head);

    const wrap = document.createElement('div');
    wrap.className = 'secret-tiles';

    const sorted = [...tiles].sort((a, b) => {
      const ao = isOkeyTile(a, snapshot.okeyTarget) ? 0 : 1;
      const bo = isOkeyTile(b, snapshot.okeyTarget) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.color !== b.color) return String(a.color).localeCompare(String(b.color));
      return a.number - b.number;
    });

    sorted.forEach((tile) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isOk = isOkeyTile(tile, snapshot.okeyTarget);
      btn.className = `tile-chip tile-chip--${tile.color}${isOk ? ' is-okey' : ''}`;
      btn.textContent = tile.isFakeOkey ? 'S' : String(tile.number);
      btn.title = `${formatTileLabel(tile)} ile sessiz takas yap`;
      btn.addEventListener('click', () => {
        const myTileId = els.secretMyTile.value;
        sendGameAction(
          'admin:swapTile',
          { myTileId, sourceKind, targetSeatIndex, targetTileId: tile.id },
          (res) => {
            if (!res?.ok) {
              els.secretStatus.textContent = res?.error || 'Takas başarısız.';
              return;
            }
            soundFX.playTileClack(1.2);
            els.secretStatus.textContent = `${formatTileLabel(tile)} sessizce ıstakanıza alındı.`;
            if (res.snapshot) renderSecretSnapshot(res.snapshot);
          }
        );
      });
      wrap.appendChild(btn);
    });

    group.appendChild(wrap);
    els.secretSources.appendChild(group);
  };

  snapshot.seats
    .filter((s) => s.seatIndex !== viewerIdx)
    .forEach((s) => {
      renderBucket(s.name, s.hand, 'seat', s.seatIndex);
    });

  renderBucket('Ortadaki Deste', snapshot.deck, 'deck');
}

els.btnSecretRefresh.addEventListener('click', () => {
  sendGameAction('admin:snapshot', {}, (res) => {
    if (res?.ok && res.snapshot) {
      renderSecretSnapshot(res.snapshot);
    }
  });
});

els.btnSecretOkey.addEventListener('click', () => {
  const myTileId = els.secretMyTile.value;
  sendGameAction('admin:stealOkey', { myTileId }, (res) => {
    if (!res?.ok) {
      els.secretStatus.textContent = res?.error || 'Okey alınamadı.';
      return;
    }
    soundFX.playMeldChime();
    els.secretStatus.textContent = 'Okey sessizce ıstakanıza alındı.';
    if (res.snapshot) renderSecretSnapshot(res.snapshot);
  });
});

// Turn countdown tick
setInterval(() => {
  const game = currentRoom?.game;
  if (!game || game.phase !== 'playing' || !game.turnEndsAt) {
    els.hudTimer.textContent = '-';
    return;
  }
  const rem = Math.max(0, Math.ceil((game.turnEndsAt - Date.now()) / 1000));
  els.hudTimer.textContent = String(rem);
}, 500);

// Socket.IO Lifecycle
socket.on('connect', () => {
  setConnectionState('ok', 'Bağlı');
});

socket.on('disconnect', () => {
  setConnectionState('warn', 'Bağlantı kesildi');
  if (!currentRoom) {
    setRoomsRegionState('error');
  }
});

socket.on('connect_error', () => {
  setConnectionState('warn', 'Bağlantı hatası');
  if (!currentRoom) {
    setRoomsRegionState('error');
  }
});

socket.on('rooms:list', (rooms) => {
  if (!Array.isArray(rooms) || rooms.length === 0) {
    setRoomsRegionState('empty');
  } else {
    setRoomsRegionState('full', rooms);
  }
});

socket.on('room:state', (room) => {
  if (!localClient) {
    switchView(room);
  }
});
