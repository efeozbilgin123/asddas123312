import { io } from 'socket.io-client';
import {
  analyzeHandLive,
  autoArrangePairs,
  autoArrangeRuns,
  validateGroup,
  validatePair
} from '../shared/melds.js';
import { KAHVE_MENU } from '../shared/menu.js';
import { formatMusicPlayerDisplay, KAHVE_PLAYLISTS, parseMusicUrl } from '../shared/music.js';
import { isPresetAvatar, KAHVE_QUICK_CHATS, TABLE_THEMES } from '../shared/presets.js';
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

function isValidCustomAvatar(val) {
  return (
    typeof val === 'string' &&
    val.length <= 180000 &&
    /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(val)
  );
}

const playerId = getOrCreatePlayerId();
const savedName = localStorage.getItem('yuzbir_player_name') || '';
const savedAvatar = localStorage.getItem('yuzbir_player_avatar') || 'avatar-1';
let customAvatarDataUrl = isValidCustomAvatar(savedAvatar) ? savedAvatar : '';
let selectedAvatar = isValidCustomAvatar(savedAvatar)
  ? savedAvatar
  : isPresetAvatar(savedAvatar)
    ? savedAvatar
    : 'avatar-1';

const els = {
  canvas: document.getElementById('table-canvas'),
  wordmark: document.querySelector('.wordmark'),
  connBadge: document.getElementById('connection-badge'),
  roomPill: document.getElementById('room-pill'),
  themePicker: document.getElementById('theme-picker'),
  cameraGroup: document.getElementById('camera-group'),
  btnYazboz: document.getElementById('btn-yazboz'),
  btnChat: document.getElementById('btn-chat'),
  chatUnreadBadge: document.getElementById('chat-unread-badge'),
  btnOrders: document.getElementById('btn-orders'),
  btnMusic: document.getElementById('btn-music'),
  btnSound: document.getElementById('btn-sound'),
  btnRules: document.getElementById('btn-rules'),
  btnLeave: document.getElementById('btn-leave'),

  viewLobby: document.getElementById('view-lobby'),
  viewWaiting: document.getElementById('view-waiting'),
  viewGame: document.getElementById('view-game'),

  playerName: document.getElementById('player-name'),
  playerNameHelp: document.getElementById('player-name-help'),
  roomName: document.getElementById('room-name'),
  avatarPicker: document.getElementById('avatar-picker'),
  avatarUpload: document.getElementById('avatar-upload'),
  customAvatarBtn: document.getElementById('custom-avatar-btn'),
  customAvatarImg: document.getElementById('custom-avatar-img'),
  optTeamMode: document.getElementById('opt-team-mode'),
  optKatlamali: document.getElementById('opt-katlamali'),
  optMaxRounds: document.getElementById('opt-max-rounds'),
  optIslek: document.getElementById('opt-islek'),
  optTimer: document.getElementById('opt-timer'),
  optSeat: document.getElementById('opt-seat'),
  optTableTheme: document.getElementById('opt-table-theme'),
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
  btnWaitOrders: document.getElementById('btn-wait-orders'),
  btnWaitMusic: document.getElementById('btn-wait-music'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  waitSeatsGrid: document.getElementById('wait-seats-grid'),
  waitHostControls: document.getElementById('wait-host-controls'),
  waitTeamMode: document.getElementById('wait-team-mode'),
  waitKatlamali: document.getElementById('wait-katlamali'),
  waitMaxRounds: document.getElementById('wait-max-rounds'),
  waitIslek: document.getElementById('wait-islek'),
  waitTimer: document.getElementById('wait-timer'),
  waitStatusMsg: document.getElementById('wait-status-msg'),
  btnStartMatch: document.getElementById('btn-start-match'),

  hudRound: document.getElementById('hud-round'),
  hudOkey: document.getElementById('hud-okey'),
  hudSeriesCount: document.getElementById('hud-series-count'),
  hudPairsCount: document.getElementById('hud-pairs-count'),
  hudTimer: document.getElementById('hud-timer'),
  hudTurnText: document.getElementById('hud-turn-text'),
  gameAlertToast: document.getElementById('game-alert-toast'),
  hudSpeechBubble: document.getElementById('hud-speech-bubble'),

  stagingBar: document.getElementById('staging-bar'),
  stagingGroups: document.getElementById('staging-groups'),
  stagingTotal: document.getElementById('staging-total'),
  btnCommitOpen: document.getElementById('btn-commit-open'),
  btnClearStage: document.getElementById('btn-clear-stage'),

  btnSortRuns: document.getElementById('btn-sort-runs'),
  btnSortPairs: document.getElementById('btn-sort-pairs'),
  btnClearSel: document.getElementById('btn-clear-sel'),
  selectionHint: document.getElementById('selection-hint'),

  btnDrawDeck: document.getElementById('btn-draw-deck'),
  btnDrawDiscard: document.getElementById('btn-draw-discard'),
  btnReturnDiscard: document.getElementById('btn-return-discard'),
  btnOpenSeries: document.getElementById('btn-open-series'),
  btnOpenPairs: document.getElementById('btn-open-pairs'),
  btnStageGroup: document.getElementById('btn-stage-group'),
  btnLayMeld: document.getElementById('btn-lay-meld'),
  btnDiscardTile: document.getElementById('btn-discard-tile'),
  btnShowRoundSummary: document.getElementById('btn-show-round-summary'),
  btnHudNextRound: document.getElementById('btn-hud-next-round'),

  musicDock: document.getElementById('music-dock'),
  musicProviderBadge: document.getElementById('music-provider-badge'),
  musicDjStatus: document.getElementById('music-dj-status'),
  musicTrackTitle: document.getElementById('music-track-title'),
  musicDockPlayPause: document.getElementById('music-dock-playpause'),
  musicDockNext: document.getElementById('music-dock-next'),
  musicDockQueue: document.getElementById('music-dock-queue'),
  musicDockAdd: document.getElementById('music-dock-add'),
  musicDockAutoplay: document.getElementById('music-dock-autoplay'),
  musicVolume: document.getElementById('music-volume'),
  musicExternalLink: document.getElementById('music-external-link'),
  musicDockToggle: document.getElementById('music-dock-toggle'),
  musicDockStop: document.getElementById('music-dock-stop'),
  musicQueueDrawer: document.getElementById('music-queue-drawer'),
  musicQueueSummary: document.getElementById('music-queue-summary'),
  musicQueueShuffle: document.getElementById('music-queue-shuffle'),
  musicQueueClear: document.getElementById('music-queue-clear'),
  musicQueueAdd: document.getElementById('music-queue-add'),
  musicQueueList: document.getElementById('music-queue-list'),
  musicPlayerHost: document.getElementById('music-player-host'),

  chatDrawer: document.getElementById('chat-drawer'),
  btnTableNudge: document.getElementById('btn-table-nudge'),
  btnChatClose: document.getElementById('btn-chat-close'),
  chatMessages: document.getElementById('chat-messages'),
  chatQuickBar: document.getElementById('chat-quick-bar'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),

  dialogMusic: document.getElementById('dialog-music'),
  musicPresetsGrid: document.getElementById('music-presets-grid'),
  musicForm: document.getElementById('music-form'),
  musicUrlInput: document.getElementById('music-url-input'),
  musicUrlHelp: document.getElementById('music-url-help'),
  musicTitleInput: document.getElementById('music-title-input'),
  btnMusicStop: document.getElementById('btn-music-stop'),
  btnMusicQueue: document.getElementById('btn-music-queue'),
  btnMusicPlay: document.getElementById('btn-music-play'),
  dialogMusicQueueSection: document.getElementById('dialog-music-queue-section'),
  dialogMusicQueueSummary: document.getElementById('dialog-music-queue-summary'),
  dialogMusicQueueShuffle: document.getElementById('dialog-music-queue-shuffle'),
  dialogMusicQueueClear: document.getElementById('dialog-music-queue-clear'),
  dialogMusicQueueList: document.getElementById('dialog-music-queue-list'),

  dialogYazboz: document.getElementById('dialog-yazboz'),
  yazbozEmpty: document.getElementById('yazboz-empty'),
  yazbozTeamTotals: document.getElementById('yazboz-team-totals'),
  yazbozTableWrap: document.getElementById('yazboz-table-wrap'),
  yazbozThead: document.getElementById('yazboz-thead'),
  yazbozTbody: document.getElementById('yazboz-tbody'),
  yazbozTfoot: document.getElementById('yazboz-tfoot'),

  dialogOrders: document.getElementById('dialog-orders'),
  orderTarget: document.getElementById('order-target'),
  btnOrderClear: document.getElementById('btn-order-clear'),
  orderStatusMsg: document.getElementById('order-status-msg'),
  orderMenuGrid: document.getElementById('order-menu-grid'),

  dialogRules: document.getElementById('dialog-rules'),
  dialogRound: document.getElementById('dialog-round'),
  roundDialogTitle: document.getElementById('round-dialog-title'),
  roundDialogMsg: document.getElementById('round-dialog-msg'),
  roundTeamScores: document.getElementById('round-team-scores'),
  roundTbody: document.getElementById('round-tbody'),
  btnRoundLeave: document.getElementById('btn-round-leave'),
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

function setSelectedAvatar(avatarVal) {
  const isCustom = isValidCustomAvatar(avatarVal);
  selectedAvatar = isCustom
    ? avatarVal
    : isPresetAvatar(avatarVal)
      ? avatarVal
      : 'avatar-1';

  localStorage.setItem('yuzbir_player_avatar', selectedAvatar);

  if (customAvatarDataUrl && els.customAvatarBtn && els.customAvatarImg) {
    els.customAvatarImg.src = customAvatarDataUrl;
    els.customAvatarBtn.hidden = false;
  }

  els.avatarPicker?.querySelectorAll('.avatar-btn').forEach((btn) => {
    const active =
      btn.dataset.avatar === 'custom'
        ? isCustom
        : btn.dataset.avatar === selectedAvatar;
    btn.classList.toggle('is-selected', active);
    btn.setAttribute('aria-checked', String(active));
  });
}

setSelectedAvatar(selectedAvatar);
els.avatarPicker?.querySelectorAll('.avatar-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.avatar === 'custom') {
      if (customAvatarDataUrl) setSelectedAvatar(customAvatarDataUrl);
    } else {
      setSelectedAvatar(btn.dataset.avatar);
    }
  });
});

els.avatarUpload?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const imgUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    try {
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const minSide = Math.min(img.width, img.height);
      const sx = Math.floor((img.width - minSide) / 2);
      const sy = Math.floor((img.height - minSide) / 2);
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
      let dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      if (dataUrl.length > 140000) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.62);
      }
      if (isValidCustomAvatar(dataUrl)) {
        customAvatarDataUrl = dataUrl;
        setSelectedAvatar(dataUrl);
      }
    } finally {
      URL.revokeObjectURL(imgUrl);
      els.avatarUpload.value = '';
    }
  };
  img.onerror = () => {
    URL.revokeObjectURL(imgUrl);
    els.avatarUpload.value = '';
  };
  img.src = imgUrl;
});

let currentRoom = null;
let localClient = null;
let secretUnlocked = false;
let stagedGroups = []; // [{ id, mode: 'series'|'pairs', tiles, points }]
let liveAutoAnalysis = { seriesPoints: 0, seriesGroups: [], pairCount: 0, pairGroups: [] };
let lastEventIdSeen = 0;
let lastOrderIdSeen = 0;
let lastChatIdSeen = 0;
let lastNudgeIdSeen = 0;
let chatUnreadCount = 0;
let lastRoundModalNumber = 0;
let lastTurnSeatSeen = null;
let lastTurnRoundSeen = null;
let bannerNotice = '';
let noticeTimer = null;
let hudBubbleTimer = null;

function applyRoomOrders(orders, lastOrder, viewerSeatIndex) {
  const viewerIdx = viewerSeatIndex ?? currentRoom?.viewerSeatIndex ?? 0;
  scene3d.setRoomOrders(orders || null, viewerIdx);
  if (lastOrder && Number(lastOrder.id) > lastOrderIdSeen) {
    lastOrderIdSeen = Number(lastOrder.id);
    soundFX.playOrderServed(lastOrder.category || 'drink');
    const msg = `${lastOrder.fromName}, ${lastOrder.targetName} ${lastOrder.label} söyledi.`;
    showNotice(msg, 3600);
  }
}

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
  onRackReorder: () => {
    soundFX.playTileClack(1.15);
    updateGameControls();
  }
});

function applyTableTheme(themeId, persist = true) {
  const valid = TABLE_THEMES.some((t) => t.id === themeId) ? themeId : 'green';
  if (persist) {
    localStorage.setItem('yuzbir_table_theme', valid);
  }
  scene3d.setTableTheme(valid);
  if (els.optTableTheme) {
    els.optTableTheme.value = valid;
  }
  els.themePicker?.querySelectorAll('.theme-dot').forEach((btn) => {
    const active = btn.dataset.theme === valid;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

applyTableTheme(localStorage.getItem('yuzbir_table_theme') || 'green', false);

els.themePicker?.querySelectorAll('.theme-dot').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyTableTheme(btn.dataset.theme || 'green');
  });
});

els.optTableTheme?.addEventListener('change', (e) => {
  applyTableTheme(e.target.value);
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

function showHudSpeechBubble(name, text, duration = 4200) {
  if (!els.hudSpeechBubble) return;
  if (hudBubbleTimer) clearTimeout(hudBubbleTimer);
  if (!text) {
    els.hudSpeechBubble.hidden = true;
    els.hudSpeechBubble.textContent = '';
    return;
  }
  els.hudSpeechBubble.textContent = `${name || 'Oyuncu'}: ${text}`;
  els.hudSpeechBubble.hidden = false;
  hudBubbleTimer = setTimeout(() => {
    if (els.hudSpeechBubble) {
      els.hudSpeechBubble.hidden = true;
    }
  }, duration);
}

function updateChatUnreadBadge() {
  if (!els.chatUnreadBadge) return;
  if (chatUnreadCount > 0) {
    els.chatUnreadBadge.textContent = chatUnreadCount > 9 ? '9+' : String(chatUnreadCount);
    els.chatUnreadBadge.hidden = false;
  } else {
    els.chatUnreadBadge.textContent = '0';
    els.chatUnreadBadge.hidden = true;
  }
}

function formatChatTime(ts) {
  const d = new Date(ts || Date.now());
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function appendChatMessageEl(entry) {
  if (!els.chatMessages || !entry) return;
  const emptyEl = els.chatMessages.querySelector('.chat-empty');
  if (emptyEl) emptyEl.remove();

  const li = document.createElement('li');
  const mySeatIdx = currentRoom?.viewerSeatIndex ?? 0;
  const isMine = entry.seatIndex === mySeatIdx;
  li.className = `chat-msg${isMine ? ' is-mine' : ''}`;

  const head = document.createElement('div');
  head.className = 'chat-msg__head';

  const author = document.createElement('span');
  author.className = 'chat-msg__author';
  author.textContent = isMine ? `${entry.name} (Siz)` : (entry.name || 'Oyuncu');

  const time = document.createElement('span');
  time.className = 'chat-msg__time';
  time.textContent = formatChatTime(entry.sentAt);

  head.append(author, time);

  const body = document.createElement('div');
  body.className = 'chat-msg__text';
  body.textContent = entry.text || '';

  li.append(head, body);
  els.chatMessages.appendChild(li);
  while (els.chatMessages.children.length > 40) {
    els.chatMessages.firstElementChild?.remove();
  }
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function renderChatHistory(history) {
  if (!els.chatMessages) return;
  els.chatMessages.innerHTML = '';
  const list = Array.isArray(history) ? history : [];
  if (list.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'chat-empty';
    empty.textContent = 'Masada henüz mesaj yok. Çabuk bir sataşma gönderin!';
    els.chatMessages.appendChild(empty);
    return;
  }
  list.forEach((entry) => appendChatMessageEl(entry));
}

function handleIncomingChat(entry) {
  if (!entry || !entry.id) return;
  const idNum = Number(entry.id);
  if (idNum <= lastChatIdSeen) return;
  lastChatIdSeen = idNum;

  appendChatMessageEl(entry);
  soundFX.playChatBlip();

  const viewerIdx = currentRoom?.viewerSeatIndex ?? 0;
  const rel = (Number(entry.seatIndex) - Number(viewerIdx) + 4) % 4;

  if (currentRoom?.status === 'playing') {
    if (rel === 0) {
      showHudSpeechBubble(entry.name, entry.text);
    } else {
      scene3d.showSeatBubble(entry.seatIndex, entry.name, entry.text, viewerIdx);
    }
  }

  if (els.chatDrawer?.hidden) {
    chatUnreadCount += 1;
    updateChatUnreadBadge();
  }
}

function syncChatHistory(history, { announceNew = false } = {}) {
  const list = Array.isArray(history) ? history : [];
  if (!announceNew) {
    renderChatHistory(list);
    lastChatIdSeen = list.reduce((m, item) => Math.max(m, Number(item?.id || 0)), lastChatIdSeen);
    return;
  }
  for (const item of list) {
    if (Number(item?.id || 0) > lastChatIdSeen) {
      handleIncomingChat(item);
    }
  }
}

function handleIncomingNudge(nudge) {
  if (!nudge || !nudge.id) return;
  const idNum = Number(nudge.id);
  if (idNum <= lastNudgeIdSeen) return;
  lastNudgeIdSeen = idNum;

  soundFX.playTableNudge();
  scene3d.nudgeSeat(nudge.seatIndex ?? 0);
  showNotice(`${nudge.name || 'Bir oyuncu'} masaya vurdu!`, 3200);
}

let gameAlertTimer = null;
function showGameAlert(text, kind = 'islek', duration = 4500) {
  if (!els.gameAlertToast) return;
  if (gameAlertTimer) clearTimeout(gameAlertTimer);
  if (!text) {
    els.gameAlertToast.hidden = true;
    els.gameAlertToast.textContent = '';
    els.gameAlertToast.classList.remove('is-okey', 'is-islek');
    return;
  }
  els.gameAlertToast.textContent = text;
  els.gameAlertToast.classList.remove('is-okey', 'is-islek');
  els.gameAlertToast.classList.add(kind === 'okey' ? 'is-okey' : 'is-islek');
  els.gameAlertToast.hidden = false;
  gameAlertTimer = setTimeout(() => {
    if (els.gameAlertToast) {
      els.gameAlertToast.hidden = true;
    }
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
      const modeLabel = r.options?.teamMode === 'paired' ? 'Eşli' : 'Tekli';
      const katLabel = r.options?.katlamali ? 'Katlamalı' : 'Katlamasız';
      const ruleText = `${modeLabel} · ${katLabel}`;
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

function readLobbyOptions() {
  return {
    teamMode: els.optTeamMode.value === 'paired' ? 'paired' : 'solo',
    katlamali: els.optKatlamali.value === '1',
    maxRounds: Number(els.optMaxRounds.value),
    islekPenalty: els.optIslek.checked,
    turnSeconds: Number(els.optTimer.value)
  };
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
  lastOrderIdSeen = 0;
  lastChatIdSeen = 0;
  lastNudgeIdSeen = 0;
  chatUnreadCount = 0;
  updateChatUnreadBadge();
  lastRoundModalNumber = 0;
  stagedGroups = [];

  localClient = new LocalSingleplayerClient({
    playerName: name,
    playerAvatar: selectedAvatar,
    seatIndex: Number(els.optSeat?.value || 0),
    options: readLobbyOptions(),
    onState: (room) => {
      switchView(room);
    }
  });
  localClient.emitRoomState();
}

function createRoom(quickStart) {
  const name = validatePlayerName();
  if (!name) return;

  if (!socket.connected) {
    els.playerNameHelp.textContent = 'Sunucu bağlantısı bekleniyor, lütfen tekrar deneyin.';
    return;
  }

  const btn = quickStart ? els.btnQuickPlay : els.btnCreateRoom;
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;

  let settled = false;
  const resetTimer = setTimeout(() => {
    if (settled) return;
    settled = true;
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
    els.playerNameHelp.textContent = 'Sunucu yanıt vermedi. Bağlantınızı kontrol edin.';
  }, 6000);

  socket.emit(
    'room:create',
    {
      playerName: name,
      playerAvatar: selectedAvatar,
      roomName: els.roomName.value.trim(),
      quickStart,
      seatIndex: Number(els.optSeat?.value || 0),
      options: readLobbyOptions()
    },
    (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(resetTimer);
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

  if (!socket.connected) {
    els.joinHelp.textContent = 'Sunucu bağlantısı bekleniyor, lütfen tekrar deneyin.';
    return;
  }

  els.joinCode.removeAttribute('aria-invalid');
  els.joinHelp.textContent = '';

  socket.emit(
    'room:join',
    { roomCode: clean, playerName: name, playerAvatar: selectedAvatar },
    (res) => {
      if (!res?.ok) {
        els.joinCode.setAttribute('aria-invalid', 'true');
        els.joinHelp.textContent = res?.error || 'Odaya katılınamadı.';
      }
    }
  );
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

let activeMusicKey = null;
let activeMusicData = null;
let activeAudioEl = null;
let activeIframeEl = null;
let isMusicPaused = false;
let musicAdvancePendingKey = null;

function syncMusicPlayerLabels(music = activeMusicData) {
  const display = formatMusicPlayerDisplay(music, isMusicPaused);
  if (els.musicProviderBadge) {
    els.musicProviderBadge.textContent = display.djName;
  }
  if (els.musicTrackTitle) {
    els.musicTrackTitle.textContent = display.titleText;
    els.musicTrackTitle.title = display.titleText;
  }
  if (els.musicDjStatus) {
    els.musicDjStatus.textContent = display.statusText;
    els.musicDjStatus.title = `${display.djName} ${display.statusText}`;
  }
  if (els.musicDock) {
    els.musicDock.classList.toggle('is-paused', Boolean(isMusicPaused));
    if (music) {
      els.musicDock.setAttribute('aria-label', `${display.djName}: ${display.titleText} · ${display.statusText}`);
    }
  }
}

function postYouTubeCommand(func, args = []) {
  if (!activeIframeEl || activeMusicData?.provider !== 'youtube') return;
  try {
    activeIframeEl.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      'https://www.youtube.com'
    );
  } catch {
    // Ignore cross-origin postMessage restrictions
  }
}

function applyMusicVolume(volPct) {
  const raw = Number(volPct);
  const pct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 55));
  if (activeAudioEl) {
    activeAudioEl.volume = pct / 100;
  }
  if (activeIframeEl && activeMusicData) {
    try {
      if (activeMusicData.provider === 'youtube') {
        postYouTubeCommand('setVolume', [pct]);
      } else if (activeMusicData.provider === 'soundcloud') {
        activeIframeEl.contentWindow?.postMessage(
          JSON.stringify({ method: 'setVolume', value: pct }),
          'https://w.soundcloud.com'
        );
      }
    } catch {
      // Ignore cross-origin postMessage restrictions
    }
  }
}

function updateMusicPlayPauseLabel() {
  if (els.musicDockPlayPause) {
    els.musicDockPlayPause.textContent = isMusicPaused ? 'Çal' : 'Duraklat';
  }
  syncMusicPlayerLabels();
}

async function resolveNextOfflineTrackIfNeeded(item) {
  if (!item || item.embedUrl || !item.query) return item;
  try {
    const resp = await fetch('/api/music/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: item.query, title: item.trackTitle || item.title })
    });
    const data = await resp.json();
    if (data?.ok && data.track) return data.track;
  } catch {
    // Ignore offline fetch failures
  }
  return null;
}

async function fetchOfflineAutoplayTrack(seedTrack, excludeVideoIds = []) {
  if (!seedTrack) return null;
  try {
    const resp = await fetch('/api/music/autoplay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track: seedTrack, excludeVideoIds })
    });
    const data = await resp.json();
    if (data?.ok && data.track) return data.track;
  } catch {
    // Ignore offline fetch failures
  }
  return null;
}

function advanceRoomMusic(expectedKey = activeMusicKey) {
  if (!currentRoom || !activeMusicData) return;
  const targetKey = expectedKey || activeMusicKey;
  if (targetKey && targetKey === musicAdvancePendingKey) return;
  musicAdvancePendingKey = targetKey;

  const clearPendingIfSame = () => {
    if (musicAdvancePendingKey === targetKey) {
      musicAdvancePendingKey = null;
    }
  };

  sendGameAction('room:musicNext', { currentKey: targetKey || '' }, async (res) => {
    if (!res?.ok && res?.needsResolveItem && localClient) {
      const resolvedTrack = await resolveNextOfflineTrackIfNeeded(res.needsResolveItem);
      if (resolvedTrack) {
        sendGameAction('room:musicNext', {
          currentKey: targetKey || '',
          resolvedTrack
        }, (r2) => {
          clearPendingIfSame();
          if (r2?.ok) applyRoomMusic(r2.music || null);
        });
        return;
      }
    }

    if (!res?.ok && res?.needsAutoplayTrack && localClient) {
      const autoTrack = await fetchOfflineAutoplayTrack(res.needsAutoplayTrack, res.excludeVideoIds);
      sendGameAction('room:musicNext', {
        currentKey: targetKey || '',
        autoplayTrack: autoTrack || null,
        stopIfEmpty: !autoTrack
      }, (r2) => {
        clearPendingIfSame();
        if (r2?.ok) applyRoomMusic(r2.music || null);
      });
      return;
    }

    clearPendingIfSame();
    if (res?.ok && !res?.skippedDuplicate) {
      applyRoomMusic(res.music || null);
    }
  });
}

function handleMusicPlaybackError(expectedKey) {
  if (!currentRoom || !activeMusicData || expectedKey !== activeMusicKey) return;
  sendGameAction('room:musicFallback', { currentKey: expectedKey }, (res) => {
    if (res?.ok && res.music) {
      applyRoomMusic(res.music);
    } else if (res?.noFallback && (activeMusicData?.hasNext || activeMusicData?.autoplayEnabled !== false)) {
      advanceRoomMusic(expectedKey);
    }
  });
}

function jumpMusicQueue(index) {
  if (!currentRoom || !activeMusicData) return;
  sendGameAction('room:musicQueueJump', { index }, async (res) => {
    if (!res?.ok && res?.needsResolveItem && localClient) {
      const resolvedTrack = await resolveNextOfflineTrackIfNeeded(res.needsResolveItem);
      if (resolvedTrack) {
        sendGameAction('room:musicQueueJump', { index, resolvedTrack }, (r2) => {
          if (r2?.ok) applyRoomMusic(r2.music || null);
        });
      }
      return;
    }
    if (res?.ok) {
      applyRoomMusic(res.music || null);
    }
  });
}

function removeMusicQueueItem(index) {
  if (!currentRoom || !activeMusicData) return;
  sendGameAction('room:musicQueueRemove', { index }, async (res) => {
    if (!res?.ok && res?.needsResolveItem && localClient) {
      const resolvedTrack = await resolveNextOfflineTrackIfNeeded(res.needsResolveItem);
      if (resolvedTrack) {
        sendGameAction('room:musicQueueRemove', { index, resolvedTrack }, (r2) => {
          if (r2?.ok) applyRoomMusic(r2.music || null);
        });
      }
      return;
    }
    if (res?.ok) {
      applyRoomMusic(res.music || null);
    }
  });
}

function clearUpcomingMusicQueue() {
  if (!currentRoom || !activeMusicData) return;
  sendGameAction('room:musicQueueClear', {}, (res) => {
    if (res?.ok) {
      applyRoomMusic(res.music || null);
    }
  });
}

function shuffleMusicQueue() {
  if (!currentRoom || !activeMusicData) return;
  sendGameAction('room:musicQueueShuffle', {}, (res) => {
    if (res?.ok) {
      applyRoomMusic(res.music || null);
    }
  });
}

function moveMusicQueueItem(fromIndex, toIndex) {
  if (!currentRoom || !activeMusicData) return;
  sendGameAction('room:musicQueueMove', { fromIndex, toIndex }, (res) => {
    if (res?.ok) {
      applyRoomMusic(res.music || null);
    }
  });
}

function populateQueueListEl(listEl, items) {
  if (!listEl) return;
  listEl.innerHTML = '';

  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = `music-queue__item${item.isCurrent ? ' is-current' : ''}`;

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'music-queue__play';
    playBtn.title = item.isCurrent ? 'Şu an çalıyor' : 'Bu parçaya geç';
    playBtn.addEventListener('click', () => {
      if (!item.isCurrent) jumpMusicQueue(item.index);
    });

    const idxSpan = document.createElement('span');
    idxSpan.className = 'music-queue__idx';
    idxSpan.textContent = item.isCurrent ? '▶' : String(item.index + 1);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'music-queue__meta';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'music-queue__name';
    nameSpan.textContent = item.title || 'Parça';

    const subSpan = document.createElement('span');
    subSpan.className = 'music-queue__sub';
    const subParts = [];
    if (item.isCurrent) {
      subParts.push('Şu an çalıyor');
    }
    if (item.updatedBy === 'Serhat Canikli') {
      subParts.push('Serhat Canikli · Otomatik');
    } else if (item.updatedBy) {
      subParts.push(`İsteyen: ${item.updatedBy}`);
    }
    subSpan.textContent = subParts.join(' · ') || 'Sırada';

    metaDiv.appendChild(nameSpan);
    metaDiv.appendChild(subSpan);
    playBtn.appendChild(idxSpan);
    playBtn.appendChild(metaDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'music-queue__item-actions';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'music-queue__move';
    upBtn.textContent = '↑';
    upBtn.title = 'Yukarı taşı';
    upBtn.disabled = item.index === 0;
    upBtn.setAttribute('aria-label', `${item.title || 'Parçayı'} yukarı taşı`);
    upBtn.addEventListener('click', () => {
      if (item.index > 0) moveMusicQueueItem(item.index, item.index - 1);
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'music-queue__move';
    downBtn.textContent = '↓';
    downBtn.title = 'Aşağı taşı';
    downBtn.disabled = item.index >= items.length - 1;
    downBtn.setAttribute('aria-label', `${item.title || 'Parçayı'} aşağı taşı`);
    downBtn.addEventListener('click', () => {
      if (item.index < items.length - 1) moveMusicQueueItem(item.index, item.index + 1);
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'music-queue__remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Sıradan kaldır';
    removeBtn.setAttribute('aria-label', `${item.title || 'Parçayı'} sıradan kaldır`);
    removeBtn.addEventListener('click', () => {
      removeMusicQueueItem(item.index);
    });

    actionsDiv.append(upBtn, downBtn, removeBtn);
    li.appendChild(playBtn);
    li.appendChild(actionsDiv);
    listEl.appendChild(li);
  });
}

function renderMusicQueue(music = activeMusicData) {
  const items = Array.isArray(music?.queueItems) && music.queueItems.length > 0
    ? music.queueItems
    : (music ? [{
        index: 0,
        title: music.title || 'Oda Müziği',
        sourceProvider: music.sourceProvider || music.provider || '',
        updatedBy: music.updatedBy || 'Serhat Canikli',
        isCurrent: true
      }] : []);

  const total = items.length;
  const curIdx = music?.queueIndex || 0;
  const upcomingCount = items.filter((it, i) => i > curIdx).length;
  const hasUpcoming = upcomingCount > 0;
  const canShuffle = upcomingCount >= 2;

  if (els.musicDockQueue) {
    els.musicDockQueue.textContent = total > 0 ? `Sıra (${total})` : 'Sıra';
    els.musicDockQueue.hidden = total === 0;
  }
  if (els.musicQueueSummary) {
    els.musicQueueSummary.textContent = `Şarkı Sırası (${total})`;
  }
  if (els.musicQueueShuffle) {
    els.musicQueueShuffle.hidden = !canShuffle;
  }
  if (els.musicQueueClear) {
    els.musicQueueClear.hidden = !hasUpcoming && total <= 1;
  }
  if (els.dialogMusicQueueSection) {
    els.dialogMusicQueueSection.hidden = total === 0;
  }
  if (els.dialogMusicQueueSummary) {
    els.dialogMusicQueueSummary.textContent = `Çalma Sırası (${total})`;
  }
  if (els.dialogMusicQueueShuffle) {
    els.dialogMusicQueueShuffle.hidden = !canShuffle;
  }
  if (els.dialogMusicQueueClear) {
    els.dialogMusicQueueClear.hidden = !hasUpcoming && total <= 1;
  }
  if (els.btnMusicQueue) {
    els.btnMusicQueue.hidden = !music;
  }

  populateQueueListEl(els.musicQueueList, items);
  populateQueueListEl(els.dialogMusicQueueList, items);
}

function applyRoomMusic(music) {
  if (!music || !music.embedUrl) {
    activeMusicKey = null;
    activeMusicData = null;
    activeAudioEl = null;
    activeIframeEl = null;
    isMusicPaused = false;
    musicAdvancePendingKey = null;
    scene3d.setMusicPerformanceMode(false);
    if (els.musicDock) {
      els.musicDock.hidden = true;
      els.musicDock.classList.add('is-minimized');
      els.musicDock.classList.remove('is-paused');
    }
    if (els.musicQueueDrawer) {
      els.musicQueueDrawer.hidden = true;
    }
    if (els.musicDockQueue) {
      els.musicDockQueue.setAttribute('aria-expanded', 'false');
    }
    syncMusicPlayerLabels(null);
    renderMusicQueue(null);
    if (els.musicDockPlayPause) els.musicDockPlayPause.hidden = true;
    if (els.musicDockNext) els.musicDockNext.hidden = true;
    if (els.musicDockAutoplay) els.musicDockAutoplay.hidden = true;
    if (els.musicExternalLink) els.musicExternalLink.hidden = true;
    if (els.musicDockToggle) {
      els.musicDockToggle.hidden = true;
      els.musicDockToggle.textContent = 'Göster';
      els.musicDockToggle.setAttribute('aria-expanded', 'false');
    }
    if (els.musicPlayerHost) els.musicPlayerHost.innerHTML = '';
    return;
  }

  scene3d.setMusicPerformanceMode(true);
  const key = `${music.embedUrl}|${music.updatedAt || 0}`;
  const isBotMode = (
    music.kind === 'bot' ||
    music.sourceProvider === 'spotify' ||
    music.sourceProvider === 'search' ||
    music.sourceProvider === 'autoplay'
  );
  const autoplayOn = music.autoplayEnabled !== false;

  if (els.musicDock) els.musicDock.hidden = false;
  if (els.musicDockNext) {
    const canNext = Boolean(music.hasNext || (autoplayOn && music.provider === 'youtube'));
    els.musicDockNext.hidden = !canNext;
  }
  if (els.musicDockAutoplay) {
    els.musicDockAutoplay.hidden = false;
    els.musicDockAutoplay.textContent = autoplayOn ? 'Oto: Açık' : 'Oto: Kapalı';
    els.musicDockAutoplay.setAttribute('aria-pressed', String(autoplayOn));
  }
  if (els.musicExternalLink) {
    els.musicExternalLink.href = music.originalUrl || music.embedUrl;
    els.musicExternalLink.hidden = isBotMode;
  }
  if (els.musicDockToggle) {
    const allowToggle = !isBotMode && music.kind !== 'audio';
    els.musicDockToggle.hidden = !allowToggle;
  }
  if (els.musicDockPlayPause) {
    els.musicDockPlayPause.hidden = !(music.provider === 'youtube' || music.provider === 'soundcloud' || music.kind === 'audio');
  }

  renderMusicQueue(music);

  if (key === activeMusicKey) {
    activeMusicData = music;
    syncMusicPlayerLabels(music);
    return;
  }

  activeMusicKey = key;
  activeMusicData = music;
  activeAudioEl = null;
  activeIframeEl = null;
  isMusicPaused = false;
  musicAdvancePendingKey = null;
  updateMusicPlayPauseLabel();

  if (els.musicDock) {
    // Discord Serhat Canikli style: keep player hidden in background for bot/YouTube/Spotify tracks
    const startMinimized = isBotMode || music.provider === 'youtube' || music.provider === 'soundcloud';
    els.musicDock.classList.toggle('is-minimized', startMinimized);
    if (els.musicDockToggle) {
      els.musicDockToggle.textContent = startMinimized ? 'Göster' : 'Gizle';
      els.musicDockToggle.setAttribute('aria-expanded', String(!startMinimized));
    }
  }

  if (!els.musicPlayerHost) return;
  els.musicPlayerHost.innerHTML = '';

  const volVal = Number(els.musicVolume?.value);
  const resolvedVol = Number.isFinite(volVal) ? volVal : 55;

  if (music.kind === 'audio') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.autoplay = true;
    audio.src = music.embedUrl;
    audio.volume = Math.max(0, Math.min(100, resolvedVol)) / 100;
    audio.addEventListener('play', () => {
      isMusicPaused = false;
      updateMusicPlayPauseLabel();
    });
    audio.addEventListener('pause', () => {
      isMusicPaused = true;
      updateMusicPlayPauseLabel();
    });
    audio.addEventListener('ended', () => {
      advanceRoomMusic(key);
    });
    els.musicPlayerHost.appendChild(audio);
    activeAudioEl = audio;
    audio.play().catch(() => {});
  } else {
    let iframeSrc = music.embedUrl;
    if (music.provider === 'youtube' && !iframeSrc.includes('origin=')) {
      const sep = iframeSrc.includes('?') ? '&' : '?';
      iframeSrc = `${iframeSrc}${sep}origin=${encodeURIComponent(window.location.origin)}`;
    }
    const iframe = document.createElement('iframe');
    iframe.src = iframeSrc;
    if (music.provider === 'web') {
      iframe.sandbox = 'allow-scripts allow-presentation';
    }
    iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.loading = 'eager';
    iframe.title = music.title || 'Ortak Oda Müziği';
    iframe.addEventListener('load', () => {
      if (music.provider === 'youtube') {
        try {
          iframe.contentWindow?.postMessage(
            JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
            'https://www.youtube.com'
          );
        } catch {
          // Ignore cross-origin restrictions
        }
      } else if (music.provider === 'soundcloud') {
        try {
          iframe.contentWindow?.postMessage(
            JSON.stringify({ method: 'addEventListener', value: 'finish' }),
            'https://w.soundcloud.com'
          );
        } catch {
          // Ignore cross-origin restrictions
        }
      }
      applyMusicVolume(els.musicVolume?.value ?? 55);
    });
    els.musicPlayerHost.appendChild(iframe);
    activeIframeEl = iframe;
  }
}

window.addEventListener('message', (event) => {
  if (!activeIframeEl || event.source !== activeIframeEl.contentWindow) return;

  if (event.origin === 'https://w.soundcloud.com') {
    let scPayload;
    try {
      scPayload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (scPayload?.event === 'finish') {
      advanceRoomMusic(activeMusicKey);
    }
    return;
  }

  if (event.origin !== 'https://www.youtube.com') return;
  let payload;
  try {
    payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }
  if (!payload || typeof payload !== 'object') return;

  if (payload.event === 'onReady') {
    applyMusicVolume(els.musicVolume?.value ?? 55);
    postYouTubeCommand('playVideo');
  } else if (payload.event === 'onStateChange') {
    if (payload.info === 1) {
      isMusicPaused = false;
      updateMusicPlayPauseLabel();
    } else if (payload.info === 2) {
      isMusicPaused = true;
      updateMusicPlayPauseLabel();
    } else if (payload.info === 0) {
      advanceRoomMusic(activeMusicKey);
    }
  } else if (payload.event === 'onError') {
    if ([100, 101, 150].includes(Number(payload.info))) {
      handleMusicPlaybackError(activeMusicKey);
    }
  }
});

function switchView(room) {
  const prevRoom = currentRoom;
  currentRoom = room;
  if (!room) {
    els.viewLobby.hidden = false;
    els.viewWaiting.hidden = true;
    els.viewGame.hidden = true;
    els.btnLeave.hidden = true;
    if (els.btnYazboz) els.btnYazboz.hidden = true;
    if (els.btnChat) {
      els.btnChat.hidden = true;
      els.btnChat.setAttribute('aria-expanded', 'false');
    }
    if (els.chatDrawer) els.chatDrawer.hidden = true;
    if (els.hudSpeechBubble) els.hudSpeechBubble.hidden = true;
    if (els.btnOrders) els.btnOrders.hidden = true;
    if (els.btnMusic) els.btnMusic.hidden = true;
    els.connBadge.hidden = false;
    els.roomPill.hidden = true;
    els.cameraGroup.hidden = true;
    els.cameraGroup.querySelectorAll('.seg__btn').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.cam === 'fp');
    });
    stagedGroups = [];
    lastEventIdSeen = 0;
    lastRoundModalNumber = 0;
    lastTurnSeatSeen = null;
    lastTurnRoundSeen = null;
    lastOrderIdSeen = 0;
    lastChatIdSeen = 0;
    lastNudgeIdSeen = 0;
    chatUnreadCount = 0;
    updateChatUnreadBadge();
    if (els.chatMessages) els.chatMessages.innerHTML = '';
    bannerNotice = '';
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    if (hudBubbleTimer) {
      clearTimeout(hudBubbleTimer);
      hudBubbleTimer = null;
    }
    if (gameAlertTimer) {
      clearTimeout(gameAlertTimer);
      gameAlertTimer = null;
    }
    if (els.dialogRound.open) els.dialogRound.close();
    if (els.dialogSecret.open) els.dialogSecret.close();
    if (els.dialogMusic?.open) els.dialogMusic.close();
    if (els.dialogOrders?.open) els.dialogOrders.close();
    if (els.dialogYazboz?.open) els.dialogYazboz.close();
    showGameAlert('', 'islek', 0);
    applyRoomMusic(null);
    scene3d.setRoomOrders(null, 0);
    scene3d.renderGameState(null);
    return;
  }

  if (!prevRoom && room.lastOrder?.id) {
    lastOrderIdSeen = Number(room.lastOrder.id);
  }
  if (els.dialogOrders?.open) {
    renderOrdersTargetSelect();
  }

  els.btnLeave.hidden = false;
  if (els.btnChat) els.btnChat.hidden = false;
  if (els.btnYazboz) els.btnYazboz.hidden = !room.game;
  if (els.btnOrders) els.btnOrders.hidden = false;
  if (els.btnMusic) els.btnMusic.hidden = false;
  if (Object.prototype.hasOwnProperty.call(room, 'music')) {
    applyRoomMusic(room.music || null);
  }
  applyRoomOrders(room.orders || null, room.lastOrder || null, room.viewerSeatIndex ?? 0);
  syncChatHistory(room.chatHistory, { announceNew: Boolean(prevRoom) });

  if (room.status === 'waiting') {
    els.viewLobby.hidden = true;
    els.viewWaiting.hidden = false;
    els.viewGame.hidden = true;
    els.connBadge.hidden = false;
    els.roomPill.hidden = false;
    els.roomPill.textContent = `Oda ${room.code}`;
    els.cameraGroup.hidden = true;
    showGameAlert('', 'islek', 0);
    renderWaitingRoom(room);
    scene3d.renderGameState(null);
  } else {
    els.viewLobby.hidden = true;
    els.viewWaiting.hidden = true;
    els.viewGame.hidden = false;
    els.connBadge.hidden = true;
    els.roomPill.hidden = true;
    els.cameraGroup.hidden = false;
    renderGameRoom(room);
  }
}

function renderWaitingRoom(room) {
  els.waitRoomTitle.textContent = room.name;
  els.waitRoomCode.textContent = room.code;
  els.waitHostControls.hidden = !room.isHost;
  els.btnStartMatch.hidden = !room.isHost;

  els.waitTeamMode.value = room.options.teamMode === 'paired' ? 'paired' : 'solo';
  els.waitKatlamali.value = room.options.katlamali ? '1' : '0';
  els.waitMaxRounds.value = String(room.options.maxRounds ?? 5);
  els.waitIslek.checked = Boolean(room.options.islekPenalty);
  els.waitTimer.value = String(room.options.turnSeconds || 60);

  els.waitSeatsGrid.innerHTML = '';
  const seatLabels = ['Güney', 'Doğu', 'Kuzey', 'Batı'];
  const isPaired = room.options.teamMode === 'paired';
  const mySeatIdx = room.viewerSeatIndex ?? 0;

  room.seats.forEach((seat) => {
    const isMine = seat.seatIndex === mySeatIdx;
    const card = document.createElement('div');
    card.className = `wait-seat${isMine ? ' wait-seat--mine' : ''}`;

    const left = document.createElement('div');
    left.className = 'wait-seat__left';

    const avatarImg = document.createElement('img');
    avatarImg.className = 'wait-seat__avatar';
    const avatarVal = seat.avatar || `avatar-${(seat.seatIndex % 16) + 1}`;
    avatarImg.src = avatarVal.startsWith('data:image/')
      ? avatarVal
      : `/assets/${avatarVal}.jpg`;
    avatarImg.alt = seat.name || seatLabels[seat.seatIndex];

    const info = document.createElement('div');
    info.className = 'wait-seat__info';

    const title = document.createElement('strong');
    title.textContent =
      seat.type === 'empty'
        ? `${seatLabels[seat.seatIndex]} koltuğu boş`
        : `${seat.name}${isMine ? ' (Siz)' : ''}`;

    const role = document.createElement('span');
    role.className = 'wait-seat__role';
    const baseRole =
      seat.type === 'human'
        ? `${seatLabels[seat.seatIndex]} · Gerçek oyuncu`
        : seat.type === 'bot'
          ? `${seatLabels[seat.seatIndex]} · Yapay zekâ bot`
          : 'Oyun başlayınca bot atanabilir';
    role.textContent = isPaired
      ? `${(seat.seatIndex % 2) + 1}. Takım · ${baseRole}`
      : baseRole;

    info.append(title, role);
    left.append(avatarImg, info);
    card.appendChild(left);

    const actions = document.createElement('div');
    actions.className = 'wait-seat__actions';

    if (!isMine) {
      const moveBtn = document.createElement('button');
      moveBtn.type = 'button';
      moveBtn.className = 'btn btn--quiet btn--sm';
      moveBtn.textContent = seat.type === 'human' ? 'Yer Değiştir' : 'Buraya Geç';
      moveBtn.addEventListener('click', () => {
        socket.emit('room:switchSeat', { seatIndex: seat.seatIndex }, (res) => {
          if (!res?.ok) {
            els.waitStatusMsg.textContent = res?.error || 'Koltuk değiştirilemedi.';
          } else {
            els.waitStatusMsg.textContent = '';
          }
        });
      });
      actions.appendChild(moveBtn);
    }

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
      actions.appendChild(btn);
    }

    if (actions.childElementCount > 0) {
      card.appendChild(actions);
    }

    els.waitSeatsGrid.appendChild(card);
  });
}

function renderGameRoom(room) {
  const game = room.game;
  if (!game) return;

  // Handle sound effects & alerts for newly seen event
  if (game.lastEvent && game.lastEvent.id > lastEventIdSeen) {
    lastEventIdSeen = game.lastEvent.id;
    const ev = game.lastEvent;
    if (ev.type === 'round_start') {
      soundFX.playTileShuffle();
      showGameAlert('', 'islek', 0);
    } else if (ev.type === 'draw_deck' || ev.type === 'draw_discard') {
      soundFX.playTileFlip();
    } else if (ev.type === 'return_discard') {
      soundFX.playFeltSlide();
    } else if (ev.type === 'open_hand') {
      soundFX.playOpenHand();
    } else if (ev.type === 'round_over') {
      const summary = game.roundSummary;
      const mult = summary
        ? (summary.finishedWithOkey ? 2 : 1) * ((summary.finishedFromPairs || summary.finishedFromHand) ? 2 : 1)
        : 1;
      soundFX.playRoundWin(mult);
      if (
        summary &&
        summary.winnerSeat !== null &&
        summary.winnerSeat !== undefined &&
        !summary.roundCancelled &&
        !summary.deckExhausted
      ) {
        scene3d.triggerWinCelebration({
          winnerSeat: summary.winnerSeat,
          viewerSeat: game.viewerSeatIndex,
          multiplier: mult
        });
      }
      if (els.dialogYazboz?.open) {
        renderYazbozDialog();
      }
    } else if (ev.type === 'discard') {
      const msgLower = String(ev.message || '').toLowerCase();
      const alertKind =
        ev.alertKind ||
        (msgLower.includes('okey')
          ? 'okey'
          : msgLower.includes('işlek') || msgLower.includes('ceza')
            ? 'islek'
            : null);

      if (alertKind) {
        soundFX.playPenalty();
        const tileText = ev.tile ? ` (${formatTileLabel(ev.tile)})` : '';
        const alertText = `${ev.message}${tileText}`;
        showNotice(alertText, 4500);
        showGameAlert(alertText, alertKind, 4500);
      } else {
        soundFX.playTileClack(0.92);
      }
    } else if (ev.type === 'lay_meld' || ev.type === 'layoff') {
      soundFX.playTileClack(1.08);
    }
    if (els.dialogSecret.open && !els.secretPanelView.hidden) {
      sendGameAction('admin:snapshot', {}, (res) => {
        if (res?.ok && res.snapshot) renderSecretSnapshot(res.snapshot);
      });
    }
  }

  // Soft kahvehane turn bell when turn arrives at viewer
  if (
    game.phase === 'playing' &&
    game.currentSeat === game.viewerSeatIndex &&
    (lastTurnSeatSeen !== game.currentSeat || lastTurnRoundSeen !== game.roundNumber)
  ) {
    soundFX.playTurnBell();
  }
  lastTurnSeatSeen = game.currentSeat;
  lastTurnRoundSeen = game.roundNumber;

  scene3d.renderGameState(game);

  els.hudRound.textContent =
    game.maxRounds > 0 ? `${game.roundNumber} / ${game.maxRounds}` : String(game.roundNumber);

  if (game.okeyTarget) {
    const colorName = COLOR_LABELS[game.okeyTarget.color] || game.okeyTarget.color;
    els.hudOkey.textContent = `${colorName} ${game.okeyTarget.number}`;
    els.hudOkey.className = `okey-chip okey-chip--${game.okeyTarget.color}`;
  }

  // Filter staged groups to only keep tiles still in hand
  const viewerIdx = game.viewerSeatIndex;
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
    const baseMsg = game.roundSummary?.message || 'El tamamlandı.';
    els.hudTurnText.textContent = currentRoom?.isHost
      ? baseMsg
      : `${baseMsg} · Masa kurucusunun devam etmesi bekleniyor.`;
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
      els.hudTurnText.textContent = 'Sıra sizde: taş açın, işleyin veya sağdaki TAŞ AT alanına sürükleyin.';
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
  const leftTopIsOkey = Boolean(leftTopTile && isOkeyTile(leftTopTile, game.okeyTarget));

  els.btnDrawDeck.hidden = !isDrawPhase;
  els.btnDrawDiscard.hidden = !(isDrawPhase && leftTopTile && !leftTopIsOkey);
  if (leftTopTile && !leftTopIsOkey) {
    els.btnDrawDiscard.textContent = `Yandan Al (${formatTileLabel(leftTopTile)})`;
  }

  els.btnReturnDiscard.hidden = !(
    isPlayPhase &&
    game.pickedDiscardTileId &&
    !game.committedMeldThisTurn
  );

  // Live automatic Tek (Seri) and Cift counting without needing a manual Per Bul button
  const mustUseTileId = isPlayPhase ? (game.pickedDiscardTileId || null) : null;
  liveAutoAnalysis = analyzeHandLive(
    scene3d.getRackSlots(),
    mySeat?.hand || [],
    game.okeyTarget,
    14,
    mustUseTileId,
    game.gosterge
  );
  const openReq = game.openThreshold || 101;
  const pairReq = game.pairThreshold || 5;
  const pickedFromSeat =
    game.pickedDiscardFromSeat != null ? game.seats?.[game.pickedDiscardFromSeat] : null;
  const katlamaliPairOnly = Boolean(
    game.options?.katlamali && game.pickedDiscardTileId && pickedFromSeat?.openMode === 'pairs'
  );
  const handCount = mySeat?.hand?.length || 0;
  const seriesUsedCount = liveAutoAnalysis.seriesGroups.reduce((n, g) => n + g.tiles.length, 0);
  const seriesLeavesDiscard = handCount - seriesUsedCount >= 1;
  const pairsUsedCount = liveAutoAnalysis.pairGroups.reduce((n, g) => n + g.tiles.length, 0);
  const pairsLeavesDiscard = handCount - pairsUsedCount >= 1 || liveAutoAnalysis.pairCount > pairReq;

  if (els.hudSeriesCount) {
    if (mySeat?.opened) {
      els.hudSeriesCount.textContent = `${liveAutoAnalysis.seriesPoints} p`;
      els.hudSeriesCount.classList.remove('is-ready');
    } else {
      els.hudSeriesCount.textContent = `${liveAutoAnalysis.seriesPoints} / ${openReq}`;
      els.hudSeriesCount.classList.toggle(
        'is-ready',
        !katlamaliPairOnly &&
          liveAutoAnalysis.seriesUsesRequired &&
          liveAutoAnalysis.seriesPoints >= openReq &&
          seriesLeavesDiscard
      );
    }
  }

  if (els.hudPairsCount) {
    if (mySeat?.opened) {
      els.hudPairsCount.textContent = `${liveAutoAnalysis.pairCount} ç`;
      els.hudPairsCount.classList.remove('is-ready');
    } else {
      els.hudPairsCount.textContent = `${liveAutoAnalysis.pairCount} / ${pairReq}`;
      els.hudPairsCount.classList.toggle(
        'is-ready',
        liveAutoAnalysis.pairsUsesRequired &&
          liveAutoAnalysis.pairCount >= pairReq &&
          pairsLeavesDiscard
      );
    }
  }

  const canDirectSeriesOpen =
    isPlayPhase &&
    !mySeat?.opened &&
    stagedGroups.length === 0 &&
    !katlamaliPairOnly &&
    liveAutoAnalysis.seriesUsesRequired &&
    liveAutoAnalysis.seriesPoints >= openReq &&
    liveAutoAnalysis.seriesGroups.length > 0 &&
    seriesLeavesDiscard;

  const canDirectPairsOpen =
    isPlayPhase &&
    !mySeat?.opened &&
    stagedGroups.length === 0 &&
    liveAutoAnalysis.pairsUsesRequired &&
    liveAutoAnalysis.pairCount >= pairReq &&
    liveAutoAnalysis.pairGroups.length >= pairReq &&
    pairsLeavesDiscard;

  if (els.btnOpenSeries) {
    els.btnOpenSeries.hidden = !canDirectSeriesOpen;
    if (canDirectSeriesOpen) {
      els.btnOpenSeries.textContent = `Tek Aç (${liveAutoAnalysis.seriesPoints})`;
    }
  }
  if (els.btnOpenPairs) {
    els.btnOpenPairs.hidden = !canDirectPairsOpen;
    if (canDirectPairsOpen) {
      els.btnOpenPairs.textContent = `Çift Aç (${liveAutoAnalysis.pairCount})`;
    }
  }

  const selected = scene3d.getSelectedTiles();
  els.btnClearSel.hidden = selected.length === 0;

  // Evaluate selected tiles
  let selectionMsg = '';
  let validGroup = null;
  let validPair = null;

  if (selected.length > 0) {
    if (selected.length === 1) {
      const gPair = validatePair(selected, game.okeyTarget, game.gosterge);
      if (gPair.valid) {
        validPair = gPair;
        selectionMsg = `Gösterge çifti (${formatTileLabel(selected[0])})`;
        if (isPlayPhase && mySeat?.opened) {
          selectionMsg += mySeat.openMode === 'pairs'
            ? ' · Masaya indirebilir veya işleyebilirsiniz'
            : ' · Masadaki yeşil gruplara tıklayıp işleyebilirsiniz';
        }
      } else {
        selectionMsg = `1 taş seçili (${formatTileLabel(selected[0])})`;
        if (isPlayPhase && mySeat?.opened) {
          selectionMsg += ' · Masadaki yeşil gruplara tıklayıp işleyebilirsiniz';
        }
      }
    } else if (selected.length === 2) {
      validPair = validatePair(selected, game.okeyTarget, game.gosterge);
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
  const isPlaying = game.phase === 'playing';
  const canStage =
    isPlaying &&
    !mySeat?.opened &&
    ((validGroup && validGroup.valid) || (validPair && validPair.valid));
  const canLayNewMeld =
    mySeat?.openMode === 'pairs'
      ? Boolean(validPair?.valid)
      : Boolean(validGroup?.valid);

  els.btnStageGroup.hidden = !canStage;
  els.btnLayMeld.hidden = !(isPlayPhase && mySeat?.opened && canLayNewMeld);
  els.btnDiscardTile.hidden = !(isPlayPhase && selected.length === 1);

  const isRoundOver = game.phase === 'roundOver' && Boolean(game.roundSummary);
  if (els.btnShowRoundSummary) {
    els.btnShowRoundSummary.hidden = !isRoundOver;
  }
  if (els.btnHudNextRound) {
    els.btnHudNextRound.hidden = !(isRoundOver && currentRoom?.isHost);
    if (isRoundOver) {
      els.btnHudNextRound.textContent = game.roundSummary?.matchComplete
        ? 'Devam Et (Ekstra El)'
        : 'Sonraki El';
    }
  }

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
  const pairReq = game.pairThreshold || 5;

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
    els.stagingTotal.textContent = `Çift: ${pairsCount} / ${pairReq}`;
    els.btnCommitOpen.disabled = !(isPlayPhase && pairsCount >= pairReq);
  } else {
    els.stagingTotal.textContent = `Toplam: ${totalPoints} / ${game.openThreshold}`;
    els.btnCommitOpen.disabled = !(isPlayPhase && totalPoints >= game.openThreshold);
  }
}

function openRoundSummaryDialog(room, summary) {
  const badges = [];
  if (summary.finishedFromPairs) badges.push('Çiftten');
  if (summary.finishedFromHand) badges.push('Elden');
  if (summary.finishedWithOkey) badges.push('Okeyle');
  const finishTag = badges.length > 0 ? ` · ${badges.join(' + ')}` : '';

  if (summary.roundCancelled) {
    els.roundDialogTitle.textContent = `${summary.roundNumber}. El İptal Edildi (4 Çift)`;
  } else if (summary.matchComplete) {
    els.roundDialogTitle.textContent = `Oyun Tamamlandı (${summary.maxRounds} El)`;
  } else if (summary.deckExhausted) {
    els.roundDialogTitle.textContent = `${summary.roundNumber}. El · Deste Tükendi`;
  } else {
    els.roundDialogTitle.textContent = `${summary.roundNumber}. El Sonucu${finishTag}`;
  }

  let msg = summary.message || '';
  if (summary.matchComplete) {
    if (summary.teamMode === 'paired' && Array.isArray(summary.teamScores)) {
      const [t0, t1] = summary.teamScores;
      if (t0 !== t1) {
        const winnerLabel = t0 < t1 ? '1. Takım (Güney & Kuzey)' : '2. Takım (Doğu & Batı)';
        msg = `${msg ? `${msg} · ` : ''}${winnerLabel} önde tamamladı! İsterseniz ekstra el ile devam edebilirsiniz.`;
      }
    } else {
      msg = `${msg ? `${msg} · ` : ''}Belirlenen ${summary.maxRounds} el tamamlandı! İsterseniz ekstra el ile devam edebilirsiniz.`;
    }
  }
  els.roundDialogMsg.textContent = msg;

  if (summary.teamMode === 'paired' && Array.isArray(summary.teamScores)) {
    els.roundTeamScores.hidden = false;
    els.roundTeamScores.innerHTML = '';
    const [t0, t1] = summary.teamScores;
    const teams = [
      { label: '1. Takım (Güney & Kuzey)', score: t0, leading: t0 <= t1 },
      { label: '2. Takım (Doğu & Batı)', score: t1, leading: t1 <= t0 }
    ];
    teams.forEach((team) => {
      const card = document.createElement('div');
      card.className = `team-summary-card${team.leading ? ' is-leading' : ''}`;
      const nameEl = document.createElement('strong');
      nameEl.textContent = team.label;
      const scoreEl = document.createElement('span');
      scoreEl.className = 'num';
      scoreEl.textContent = `${team.score} p`;
      card.append(nameEl, scoreEl);
      els.roundTeamScores.appendChild(card);
    });
  } else {
    els.roundTeamScores.hidden = true;
    els.roundTeamScores.innerHTML = '';
  }

  els.roundTbody.innerHTML = '';
  summary.rows.forEach((row) => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    const teamTag = summary.teamMode === 'paired' ? `[T${(row.seatIndex % 2) + 1}] ` : '';
    tdName.textContent = row.isWinner
      ? `${teamTag}${row.name} (Kazandı)`
      : `${teamTag}${row.name}`;

    const tdOpen = document.createElement('td');
    tdOpen.textContent = row.opened
      ? row.openMode === 'pairs'
        ? 'Çift Açtı'
        : 'Açtı'
      : 'Açmadı';

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

  els.btnNextRound.textContent = summary.matchComplete
    ? 'Devam Et (Ekstra El)'
    : 'Sonraki El';
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

function leaveCurrentMatch() {
  if (els.dialogRound.open) els.dialogRound.close();
  if (localClient) {
    localClient.destroy();
    localClient = null;
    switchView(null);
    return;
  }
  if (!socket.connected) {
    switchView(null);
    refreshRooms();
    return;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    switchView(null);
    refreshRooms();
  };
  const fallbackTimer = setTimeout(finish, 1000);
  socket.emit('room:leave', {}, () => {
    clearTimeout(fallbackTimer);
    finish();
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

els.btnLeave.addEventListener('click', leaveCurrentMatch);
els.btnRoundLeave.addEventListener('click', leaveCurrentMatch);

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
    teamMode: els.waitTeamMode.value === 'paired' ? 'paired' : 'solo',
    katlamali: els.waitKatlamali.value === '1',
    maxRounds: Number(els.waitMaxRounds.value),
    islekPenalty: els.waitIslek.checked,
    turnSeconds: Number(els.waitTimer.value)
  });
}

els.waitTeamMode.addEventListener('change', syncHostOptions);
els.waitKatlamali.addEventListener('change', syncHostOptions);
els.waitMaxRounds.addEventListener('change', syncHostOptions);
els.waitIslek.addEventListener('change', syncHostOptions);
els.waitTimer.addEventListener('change', syncHostOptions);

els.btnStartMatch.addEventListener('click', () => {
  socket.emit('room:start', {}, (res) => {
    if (!res?.ok) els.waitStatusMsg.textContent = res?.error || 'Oyun başlatılamadı.';
  });
});

function handleNextRound() {
  sendGameAction('game:nextRound', {}, (res) => {
    if (!res?.ok) showNotice(res?.error || 'Yeni el başlatılamadı.');
  });
}

els.btnNextRound.addEventListener('click', handleNextRound);
els.btnHudNextRound?.addEventListener('click', handleNextRound);
els.btnShowRoundSummary?.addEventListener('click', () => {
  if (currentRoom?.game?.roundSummary) {
    openRoundSummaryDialog(currentRoom, currentRoom.game.roundSummary);
  }
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
  updateGameControls();
});

els.btnSortPairs.addEventListener('click', () => {
  const game = currentRoom?.game;
  const hand = game?.seats[game.viewerSeatIndex]?.hand;
  if (!hand) return;
  const arranged = autoArrangePairs(hand, game.okeyTarget, game.gosterge);
  scene3d.arrangeHandOrder(arranged);
  soundFX.playTileClack(1.1);
  updateGameControls();
});

els.btnOpenSeries?.addEventListener('click', () => {
  const game = currentRoom?.game;
  const mySeat = game?.seats[game.viewerSeatIndex];
  if (!game || !mySeat || mySeat.opened) return;
  if (liveAutoAnalysis.seriesGroups.length === 0) return;
  const groups = liveAutoAnalysis.seriesGroups.map((g) => g.tiles.map((t) => t.id));
  sendGameAction('game:openHand', { groups, mode: 'series' }, (res) => {
    if (!res?.ok) {
      showNotice(res?.error || 'El açılamadı.');
    } else {
      stagedGroups = [];
      scene3d.clearSelection();
    }
  });
});

els.btnOpenPairs?.addEventListener('click', () => {
  const game = currentRoom?.game;
  const mySeat = game?.seats[game.viewerSeatIndex];
  if (!game || !mySeat || mySeat.opened) return;
  if (liveAutoAnalysis.pairGroups.length === 0) return;

  let pairsToOpen = [...liveAutoAnalysis.pairGroups];
  const mustId = game.pickedDiscardTileId || null;
  const countUsedPairTiles = (list) => list.reduce((n, g) => n + g.tiles.length, 0);
  if (countUsedPairTiles(pairsToOpen) >= mySeat.hand.length && pairsToOpen.length > 1) {
    const dropIdx = pairsToOpen.findIndex((g) => !mustId || !g.tiles.some((t) => t.id === mustId));
    if (dropIdx !== -1) {
      pairsToOpen.splice(dropIdx, 1);
    }
  }

  const groups = pairsToOpen.map((g) => g.tiles.map((t) => t.id));
  sendGameAction('game:openHand', { groups, mode: 'pairs' }, (res) => {
    if (!res?.ok) {
      showNotice(res?.error || 'Çift açılamadı.');
    } else {
      stagedGroups = [];
      scene3d.clearSelection();
    }
  });
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

  if (selected.length === 1 || selected.length === 2) {
    const pair = validatePair(selected, game.okeyTarget, game.gosterge);
    if (pair.valid) {
      if (stagedGroups.some((g) => g.mode !== 'pairs')) {
        stagedGroups = [];
      }
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
  const game = currentRoom?.game;
  const mySeat = game?.seats[game.viewerSeatIndex];
  const selected = scene3d.getSelectedTiles();
  const minLen = mySeat?.openMode === 'pairs' ? 1 : 2;
  if (selected.length < minLen) return;
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

// Shared Room Music controls (Serhat Canikli bot style)
function renderMusicPresets() {
  if (!els.musicPresetsGrid) return;
  els.musicPresetsGrid.innerHTML = '';
  KAHVE_PLAYLISTS.forEach((preset) => {
    const card = document.createElement('div');
    card.className = 'music-preset-card';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'music-preset-card__title';
    titleSpan.textContent = preset.label;
    titleSpan.title = preset.label;

    const actions = document.createElement('div');
    actions.className = 'music-preset-card__actions';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'btn btn--quiet btn--sm';
    playBtn.textContent = 'Çal';
    playBtn.addEventListener('click', () => {
      submitRoomMusic('replace', { url: preset.query, title: preset.title });
    });

    const queueBtn = document.createElement('button');
    queueBtn.type = 'button';
    queueBtn.className = 'btn btn--quiet btn--sm';
    queueBtn.textContent = '+ Sıra';
    queueBtn.addEventListener('click', () => {
      submitRoomMusic('queue', { url: preset.query, title: preset.title });
    });

    actions.append(playBtn, queueBtn);
    card.append(titleSpan, actions);
    els.musicPresetsGrid.appendChild(card);
  });
}

function openMusicDialog({ emptyInput = Boolean(activeMusicData) } = {}) {
  if (!currentRoom) return;
  if (els.musicUrlHelp) els.musicUrlHelp.textContent = '';
  if (els.musicUrlInput) {
    els.musicUrlInput.value = emptyInput ? '' : (activeMusicData?.originalUrl || '');
  }
  if (els.musicTitleInput) {
    els.musicTitleInput.value = emptyInput ? '' : (activeMusicData?.title || '');
  }
  if (els.btnMusicQueue) {
    els.btnMusicQueue.hidden = !activeMusicData;
  }
  renderMusicPresets();
  renderMusicQueue(activeMusicData);
  els.dialogMusic?.showModal();
  if (emptyInput) {
    els.musicUrlInput?.focus();
  }
}

els.btnMusic?.addEventListener('click', () => openMusicDialog());
els.btnWaitMusic?.addEventListener('click', () => openMusicDialog());

let musicSubmitting = false;

async function submitRoomMusic(mode = 'replace', override = null) {
  if (musicSubmitting) return;
  const rawUrl = override ? (override.url || '') : (els.musicUrlInput?.value || '');
  const customTitle = override ? (override.title || '') : (els.musicTitleInput?.value || '');
  const preview = parseMusicUrl(rawUrl, customTitle);
  if (!preview.ok) {
    if (els.musicUrlHelp) els.musicUrlHelp.textContent = preview.error;
    els.musicUrlInput?.focus();
    return;
  }

  musicSubmitting = true;
  if (els.btnMusicPlay) els.btnMusicPlay.disabled = true;
  if (els.btnMusicQueue) els.btnMusicQueue.disabled = true;
  if (els.musicUrlHelp) {
    els.musicUrlHelp.textContent = preview.needsResolution
      ? 'Serhat Canikli parçayı hazırlıyor...'
      : '';
  }

  const finishSubmit = () => {
    musicSubmitting = false;
    if (els.btnMusicPlay) els.btnMusicPlay.disabled = false;
    if (els.btnMusicQueue) els.btnMusicQueue.disabled = false;
  };

  let resolvedPayload = null;
  if (localClient && preview.needsResolution) {
    try {
      const resp = await fetch('/api/music/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl, title: customTitle })
      });
      const json = await resp.json();
      if (!json?.ok) {
        if (els.musicUrlHelp) {
          els.musicUrlHelp.textContent = json?.error || 'Parça çözümlenemedi.';
        }
        finishSubmit();
        return;
      }
      resolvedPayload = json;
    } catch {
      if (els.musicUrlHelp) {
        els.musicUrlHelp.textContent = 'Spotify veya şarkı araması için sunucu bağlantısı gerekiyor.';
      }
      finishSubmit();
      return;
    }
  }

  sendGameAction(
    'room:musicSet',
    { url: rawUrl, title: customTitle, mode, resolvedPayload },
    (res) => {
      finishSubmit();
      if (!res?.ok) {
        if (els.musicUrlHelp) {
          els.musicUrlHelp.textContent = res?.error || 'Müzik başlatılamadı.';
        }
        return;
      }
      if (res.music) applyRoomMusic(res.music);
      if (mode === 'queue') {
        if (!override) {
          if (els.musicUrlInput) els.musicUrlInput.value = '';
          if (els.musicTitleInput) els.musicTitleInput.value = '';
        }
        if (els.musicUrlHelp) {
          const addedCount = Number(res.queuedCount);
          els.musicUrlHelp.textContent = addedCount > 1
            ? `${addedCount} parça sıraya eklendi.`
            : 'Parça sıraya eklendi.';
        }
        if (!override) els.musicUrlInput?.focus();
      } else {
        if (els.musicUrlHelp) els.musicUrlHelp.textContent = '';
        if (els.dialogMusic?.open) els.dialogMusic.close();
      }
    }
  );
}

els.musicForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  submitRoomMusic('replace');
});

els.btnMusicQueue?.addEventListener('click', () => {
  submitRoomMusic('queue');
});

function stopRoomMusic() {
  sendGameAction('room:musicStop', {}, (res) => {
    if (res?.ok) {
      applyRoomMusic(null);
      if (els.dialogMusic?.open) els.dialogMusic.close();
    }
  });
}

els.btnMusicStop?.addEventListener('click', stopRoomMusic);
els.musicDockStop?.addEventListener('click', stopRoomMusic);

els.musicDockPlayPause?.addEventListener('click', () => {
  if (!activeMusicData) return;
  if (activeAudioEl) {
    if (activeAudioEl.paused) {
      activeAudioEl.play().catch(() => {});
      isMusicPaused = false;
    } else {
      activeAudioEl.pause();
      isMusicPaused = true;
    }
    updateMusicPlayPauseLabel();
    return;
  }

  isMusicPaused = !isMusicPaused;
  updateMusicPlayPauseLabel();
  if (activeMusicData.provider === 'youtube') {
    postYouTubeCommand(isMusicPaused ? 'pauseVideo' : 'playVideo');
  } else if (activeMusicData.provider === 'soundcloud' && activeIframeEl) {
    try {
      activeIframeEl.contentWindow?.postMessage(
        JSON.stringify({ method: isMusicPaused ? 'pause' : 'play' }),
        'https://w.soundcloud.com'
      );
    } catch {
      // Ignore cross-origin postMessage restrictions
    }
  }
});

els.musicDockNext?.addEventListener('click', () => {
  advanceRoomMusic(activeMusicKey);
});

els.musicDockQueue?.addEventListener('click', () => {
  if (!els.musicQueueDrawer) return;
  const isNowHidden = !els.musicQueueDrawer.hidden;
  els.musicQueueDrawer.hidden = isNowHidden;
  els.musicDockQueue.setAttribute('aria-expanded', String(!isNowHidden));
});

els.musicDockAdd?.addEventListener('click', () => openMusicDialog({ emptyInput: true }));
els.musicQueueAdd?.addEventListener('click', () => openMusicDialog({ emptyInput: true }));
els.musicQueueShuffle?.addEventListener('click', shuffleMusicQueue);
els.dialogMusicQueueShuffle?.addEventListener('click', shuffleMusicQueue);
els.musicQueueClear?.addEventListener('click', clearUpcomingMusicQueue);
els.dialogMusicQueueClear?.addEventListener('click', clearUpcomingMusicQueue);

els.musicDockAutoplay?.addEventListener('click', () => {
  if (!currentRoom || !activeMusicData) return;
  const nextEnabled = !(activeMusicData.autoplayEnabled !== false);
  sendGameAction('room:musicAutoplay', { enabled: nextEnabled }, (res) => {
    if (res?.ok && res.music) {
      applyRoomMusic(res.music);
    }
  });
});

els.musicDockToggle?.addEventListener('click', () => {
  if (!els.musicDock) return;
  const minimized = els.musicDock.classList.toggle('is-minimized');
  els.musicDockToggle.textContent = minimized ? 'Göster' : 'Gizle';
  els.musicDockToggle.setAttribute('aria-expanded', String(!minimized));
});

els.musicVolume?.addEventListener('input', (e) => {
  applyMusicVolume(e.target.value);
});

// Kahvehane Orders controls
function renderOrdersTargetSelect() {
  if (!els.orderTarget || !currentRoom) return;
  const prev = els.orderTarget.value || 'self';
  const mySeatIdx = currentRoom.viewerSeatIndex ?? 0;

  els.orderTarget.innerHTML = '';

  const optSelf = document.createElement('option');
  optSelf.value = 'self';
  optSelf.textContent = 'Kendime';
  els.orderTarget.appendChild(optSelf);

  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = 'Tüm Masaya (İkram)';
  els.orderTarget.appendChild(optAll);

  (currentRoom.seats || []).forEach((seat) => {
    if (seat.type !== 'empty' && seat.seatIndex !== mySeatIdx) {
      const opt = document.createElement('option');
      opt.value = String(seat.seatIndex);
      opt.textContent = seat.name || `Koltuk ${seat.seatIndex + 1}`;
      els.orderTarget.appendChild(opt);
    }
  });

  const hasPrev = Array.from(els.orderTarget.options).some((o) => o.value === prev);
  els.orderTarget.value = hasPrev ? prev : 'self';
}

function renderOrdersMenu() {
  if (!els.orderMenuGrid) return;
  els.orderMenuGrid.innerHTML = '';

  const sections = [
    { key: 'drink', title: 'Sıcak & Soğuk İçecekler', tag: 'İçecek' },
    { key: 'food', title: 'Yiyecek & Çerez', tag: 'İkram' }
  ];

  sections.forEach((sec) => {
    const items = KAHVE_MENU.filter((item) => item.category === sec.key);
    if (items.length === 0) return;

    const sectionEl = document.createElement('div');
    sectionEl.className = 'order-section';

    const titleEl = document.createElement('div');
    titleEl.className = 'order-section__title';
    titleEl.textContent = sec.title;
    sectionEl.appendChild(titleEl);

    const gridEl = document.createElement('div');
    gridEl.className = 'order-menu-grid';

    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'order-card';

      const top = document.createElement('div');
      top.className = 'order-card__top';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'order-card__title';
      nameSpan.textContent = item.label;

      const tagSpan = document.createElement('span');
      tagSpan.className = 'order-card__tag';
      tagSpan.textContent = sec.tag;

      top.appendChild(nameSpan);
      top.appendChild(tagSpan);

      const descEl = document.createElement('span');
      descEl.className = 'order-card__desc';
      descEl.textContent = item.desc;

      btn.appendChild(top);
      btn.appendChild(descEl);

      btn.addEventListener('click', () => {
        const target = els.orderTarget?.value || 'self';
        sendGameAction('room:orderTreat', { itemId: item.id, target }, (res) => {
          if (!res?.ok) {
            if (els.orderStatusMsg) {
              els.orderStatusMsg.textContent = res?.error || 'Sipariş verilemedi.';
            }
            return;
          }
          if (currentRoom) {
            currentRoom.orders = res.orders;
            currentRoom.lastOrder = res.lastOrder;
          }
          applyRoomOrders(res.orders, res.lastOrder, currentRoom?.viewerSeatIndex ?? 0);
          if (els.orderStatusMsg) {
            els.orderStatusMsg.textContent = `${item.label} masaya servis edildi.`;
          }
          if (els.dialogOrders?.open) {
            els.dialogOrders.close();
          }
        });
      });

      gridEl.appendChild(btn);
    });

    sectionEl.appendChild(gridEl);
    els.orderMenuGrid.appendChild(sectionEl);
  });
}

function openOrdersDialog() {
  if (!currentRoom) return;
  if (els.orderStatusMsg) els.orderStatusMsg.textContent = '';
  renderOrdersTargetSelect();
  renderOrdersMenu();
  els.dialogOrders?.showModal();
}

els.btnOrders?.addEventListener('click', openOrdersDialog);
els.btnWaitOrders?.addEventListener('click', openOrdersDialog);

els.btnOrderClear?.addEventListener('click', () => {
  sendGameAction('room:orderClear', { target: 'self' }, (res) => {
    if (!res?.ok) {
      if (els.orderStatusMsg) {
        els.orderStatusMsg.textContent = res?.error || 'Servis toplanamadı.';
      }
      return;
    }
    if (currentRoom) {
      currentRoom.orders = res.orders;
    }
    applyRoomOrders(res.orders, null, currentRoom?.viewerSeatIndex ?? 0);
    if (els.orderStatusMsg) {
      els.orderStatusMsg.textContent = 'Önünüzdeki servis toplandı.';
    }
  });
});

// Live Scorebook (Canlı Yazboz) controls
function renderYazbozDialog() {
  const game = currentRoom?.game;
  if (!game) return;
  const history = Array.isArray(game.roundHistory) ? game.roundHistory : [];
  const isPaired = game.options?.teamMode === 'paired';
  const seats = Array.isArray(game.seats) ? game.seats : [];

  if (history.length === 0) {
    if (els.yazbozEmpty) els.yazbozEmpty.hidden = false;
    if (els.yazbozTableWrap) els.yazbozTableWrap.hidden = true;
    if (els.yazbozTeamTotals) {
      els.yazbozTeamTotals.hidden = true;
      els.yazbozTeamTotals.innerHTML = '';
    }
    return;
  }

  if (els.yazbozEmpty) els.yazbozEmpty.hidden = true;
  if (els.yazbozTableWrap) els.yazbozTableWrap.hidden = false;

  if (isPaired && els.yazbozTeamTotals) {
    const t0 = (seats[0]?.totalScore || 0) + (seats[2]?.totalScore || 0);
    const t1 = (seats[1]?.totalScore || 0) + (seats[3]?.totalScore || 0);
    els.yazbozTeamTotals.hidden = false;
    els.yazbozTeamTotals.innerHTML = '';
    [
      { label: '1. Takım (Güney & Kuzey)', score: t0, leading: t0 <= t1 },
      { label: '2. Takım (Doğu & Batı)', score: t1, leading: t1 <= t0 }
    ].forEach((team) => {
      const card = document.createElement('div');
      card.className = `team-summary-card${team.leading ? ' is-leading' : ''}`;
      const nameEl = document.createElement('strong');
      nameEl.textContent = team.label;
      const scoreEl = document.createElement('span');
      scoreEl.className = 'num';
      scoreEl.textContent = `${team.score} p`;
      card.append(nameEl, scoreEl);
      els.yazbozTeamTotals.appendChild(card);
    });
  } else if (els.yazbozTeamTotals) {
    els.yazbozTeamTotals.hidden = true;
    els.yazbozTeamTotals.innerHTML = '';
  }

  if (els.yazbozThead) {
    els.yazbozThead.innerHTML = '';
    const tr = document.createElement('tr');
    const thRound = document.createElement('th');
    thRound.scope = 'col';
    thRound.textContent = 'El';
    const thRes = document.createElement('th');
    thRes.scope = 'col';
    thRes.textContent = 'Sonuç';
    tr.append(thRound, thRes);

    seats.forEach((seat, idx) => {
      const th = document.createElement('th');
      th.scope = 'col';
      const teamTag = isPaired ? `[T${(idx % 2) + 1}] ` : '';
      const selfTag = idx === game.viewerSeatIndex ? ' (Siz)' : '';
      th.textContent = `${teamTag}${seat?.name || `Koltuk ${idx + 1}`}${selfTag}`;
      tr.appendChild(th);
    });
    els.yazbozThead.appendChild(tr);
  }

  if (els.yazbozTbody) {
    els.yazbozTbody.innerHTML = '';
    history.forEach((entry) => {
      const tr = document.createElement('tr');

      const tdEl = document.createElement('td');
      tdEl.className = 'num';
      tdEl.textContent = `#${entry.roundNumber}`;

      const tdRes = document.createElement('td');
      if (entry.roundCancelled) {
        tdRes.textContent = 'İptal (4 Çift)';
      } else if (entry.deckExhausted) {
        tdRes.textContent = 'Deste Tükendi';
      } else {
        const tags = [];
        if (entry.finishedFromPairs) tags.push('Çiftten');
        if (entry.finishedFromHand) tags.push('Elden');
        if (entry.finishedWithOkey) tags.push('Okeyle');
        tdRes.textContent = tags.length > 0
          ? `${entry.winnerName || 'Kazanan'} (${tags.join(' + ')})`
          : (entry.winnerName || 'Kazanan');
      }

      tr.append(tdEl, tdRes);

      for (let sIdx = 0; sIdx < 4; sIdx += 1) {
        const row = (entry.rows || []).find((r) => r.seatIndex === sIdx);
        const td = document.createElement('td');
        td.className = 'num';
        if (!row) {
          td.textContent = '-';
        } else {
          const deltaStr = row.roundDelta > 0 ? `+${row.roundDelta}` : String(row.roundDelta);
          td.textContent = `${deltaStr} (${row.totalScore})`;
          if (row.isWinner) td.classList.add('yazboz-win');
          else if (row.roundDelta >= 101) td.classList.add('yazboz-pen');
        }
        tr.appendChild(td);
      }

      els.yazbozTbody.appendChild(tr);
    });
  }

  if (els.yazbozTfoot) {
    els.yazbozTfoot.innerHTML = '';
    const tr = document.createElement('tr');
    const thTotal = document.createElement('th');
    thTotal.scope = 'row';
    thTotal.colSpan = 2;
    thTotal.textContent = 'Güncel Toplam';
    tr.appendChild(thTotal);
    for (let sIdx = 0; sIdx < 4; sIdx += 1) {
      const td = document.createElement('td');
      td.className = 'num';
      td.textContent = `${seats[sIdx]?.totalScore ?? 0} p`;
      tr.appendChild(td);
    }
    els.yazbozTfoot.appendChild(tr);
  }
}

els.btnYazboz?.addEventListener('click', () => {
  if (!currentRoom?.game) return;
  renderYazbozDialog();
  els.dialogYazboz?.showModal();
});

// Room Chat & Table Nudge controls
function toggleChatDrawer(forceOpen) {
  if (!els.chatDrawer || !currentRoom) return;
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : els.chatDrawer.hidden;
  els.chatDrawer.hidden = !shouldOpen;
  if (els.btnChat) {
    els.btnChat.setAttribute('aria-expanded', String(shouldOpen));
  }
  if (shouldOpen) {
    chatUnreadCount = 0;
    updateChatUnreadBadge();
    if (els.chatMessages) {
      els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }
    els.chatInput?.focus();
  }
}

function sendChatPayload({ text = '', quickId = null }) {
  if (!currentRoom) return;
  sendGameAction('room:chatSend', { text, quickId }, (res) => {
    if (!res?.ok) {
      if (res?.error) showNotice(res.error, 2500);
      return;
    }
    if (res.entry) {
      handleIncomingChat(res.entry);
    }
  });
}

if (els.chatQuickBar) {
  els.chatQuickBar.innerHTML = '';
  KAHVE_QUICK_CHATS.forEach((q) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-quick-btn';
    btn.textContent = q.label;
    btn.addEventListener('click', () => {
      sendChatPayload({ quickId: q.id });
    });
    els.chatQuickBar.appendChild(btn);
  });
}

els.btnChat?.addEventListener('click', () => toggleChatDrawer());
els.btnChatClose?.addEventListener('click', () => toggleChatDrawer(false));

els.chatForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = els.chatInput?.value?.trim() || '';
  if (!text) return;
  els.chatInput.value = '';
  sendChatPayload({ text });
});

els.btnTableNudge?.addEventListener('click', () => {
  if (!currentRoom) return;
  sendGameAction('room:nudge', {}, (res) => {
    if (!res?.ok) {
      if (res?.error) showNotice(res.error, 2200);
      return;
    }
    if (res.nudge) {
      handleIncomingNudge(res.nudge);
    }
  });
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

[
  els.dialogRules,
  els.dialogRound,
  els.dialogSecret,
  els.dialogMusic,
  els.dialogOrders,
  els.dialogYazboz
].forEach((dlg) => {
  dlg?.addEventListener('click', (e) => {
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
    head.textContent = title;
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
      btn.textContent = tile.isFakeOkey ? '✦' : String(tile.number);
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

socket.on('room:music', (music) => {
  if (!localClient && currentRoom) {
    currentRoom.music = music || null;
    applyRoomMusic(music || null);
  }
});

socket.on('room:orders', (payload) => {
  if (!localClient && currentRoom && payload) {
    currentRoom.orders = payload.orders || null;
    currentRoom.lastOrder = payload.lastOrder || null;
    applyRoomOrders(payload.orders || null, payload.lastOrder || null, currentRoom.viewerSeatIndex ?? 0);
  }
});

socket.on('room:chat', (entry) => {
  if (!localClient && currentRoom && entry) {
    if (!Array.isArray(currentRoom.chatHistory)) currentRoom.chatHistory = [];
    currentRoom.chatHistory.push(entry);
    if (currentRoom.chatHistory.length > 40) currentRoom.chatHistory.shift();
    handleIncomingChat(entry);
  }
});

socket.on('room:nudge', (nudge) => {
  if (!localClient && currentRoom && nudge) {
    handleIncomingNudge(nudge);
  }
});
