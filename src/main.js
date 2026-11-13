import { io } from 'socket.io-client';
import {
  autoArrangePairs,
  autoArrangeRuns,
  findBestOpening,
  findPairsInHand,
  validateGroup,
  validatePair
} from '../shared/melds.js';
import { KAHVE_MENU } from '../shared/menu.js';
import { parseMusicUrl } from '../shared/music.js';
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
  : /^avatar-[1-6]$/.test(savedAvatar)
    ? savedAvatar
    : 'avatar-1';

const els = {
  canvas: document.getElementById('table-canvas'),
  wordmark: document.querySelector('.wordmark'),
  connBadge: document.getElementById('connection-badge'),
  roomPill: document.getElementById('room-pill'),
  cameraGroup: document.getElementById('camera-group'),
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

  musicDock: document.getElementById('music-dock'),
  musicProviderBadge: document.getElementById('music-provider-badge'),
  musicTrackTitle: document.getElementById('music-track-title'),
  musicVolume: document.getElementById('music-volume'),
  musicExternalLink: document.getElementById('music-external-link'),
  musicDockToggle: document.getElementById('music-dock-toggle'),
  musicDockStop: document.getElementById('music-dock-stop'),
  musicPlayerHost: document.getElementById('music-player-host'),

  dialogMusic: document.getElementById('dialog-music'),
  musicForm: document.getElementById('music-form'),
  musicUrlInput: document.getElementById('music-url-input'),
  musicUrlHelp: document.getElementById('music-url-help'),
  musicTitleInput: document.getElementById('music-title-input'),
  btnMusicStop: document.getElementById('btn-music-stop'),

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
    : /^avatar-[1-6]$/.test(avatarVal)
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
let lastEventIdSeen = 0;
let lastOrderIdSeen = 0;
let lastRoundModalNumber = 0;
let lastTurnSeatSeen = null;
let lastTurnRoundSeen = null;
let bannerNotice = '';
let noticeTimer = null;

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
  lastRoundModalNumber = 0;
  stagedGroups = [];

  localClient = new LocalSingleplayerClient({
    playerName: name,
    playerAvatar: selectedAvatar,
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

  const btn = quickStart ? els.btnQuickPlay : els.btnCreateRoom;
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;

  socket.emit(
    'room:create',
    {
      playerName: name,
      playerAvatar: selectedAvatar,
      roomName: els.roomName.value.trim(),
      quickStart,
      options: readLobbyOptions()
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

const PROVIDER_LABELS = {
  youtube: 'YouTube',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
  audio: 'Ses Akışı',
  web: 'Web Player'
};

let activeMusicKey = null;
let activeMusicData = null;
let activeAudioEl = null;
let activeIframeEl = null;

function applyMusicVolume(volPct) {
  const pct = Math.max(0, Math.min(100, Number(volPct) || 0));
  if (activeAudioEl) {
    activeAudioEl.volume = pct / 100;
  }
  if (activeIframeEl && activeMusicData) {
    try {
      if (activeMusicData.provider === 'youtube') {
        activeIframeEl.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'setVolume', args: [pct] }),
          '*'
        );
      } else if (activeMusicData.provider === 'soundcloud') {
        activeIframeEl.contentWindow?.postMessage(
          JSON.stringify({ method: 'setVolume', value: pct }),
          '*'
        );
      }
    } catch {
      // Ignore cross-origin postMessage restrictions
    }
  }
}

function applyRoomMusic(music) {
  if (!music || !music.embedUrl) {
    activeMusicKey = null;
    activeMusicData = null;
    activeAudioEl = null;
    activeIframeEl = null;
    if (els.musicDock) els.musicDock.hidden = true;
    if (els.musicPlayerHost) els.musicPlayerHost.innerHTML = '';
    return;
  }

  const key = `${music.embedUrl}|${music.updatedAt || 0}`;
  if (els.musicDock) els.musicDock.hidden = false;
  if (els.musicProviderBadge) {
    els.musicProviderBadge.textContent = PROVIDER_LABELS[music.provider] || 'Müzik';
  }
  if (els.musicTrackTitle) {
    const byTag = music.updatedBy ? ` (${music.updatedBy})` : '';
    els.musicTrackTitle.textContent = `${music.title || 'Oda Müziği'}${byTag}`;
  }
  if (els.musicExternalLink) {
    els.musicExternalLink.href = music.originalUrl || music.embedUrl;
    els.musicExternalLink.hidden = false;
  }

  if (key === activeMusicKey) return;
  activeMusicKey = key;
  activeMusicData = music;
  activeAudioEl = null;
  activeIframeEl = null;

  if (!els.musicPlayerHost) return;
  els.musicPlayerHost.innerHTML = '';

  if (music.kind === 'audio') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.autoplay = true;
    audio.src = music.embedUrl;
    audio.volume = (Number(els.musicVolume?.value) || 55) / 100;
    els.musicPlayerHost.appendChild(audio);
    activeAudioEl = audio;
    audio.play().catch(() => {});
  } else {
    const iframe = document.createElement('iframe');
    iframe.src = music.embedUrl;
    iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.loading = 'eager';
    iframe.title = music.title || 'Ortak Oda Müziği';
    iframe.addEventListener('load', () => {
      applyMusicVolume(els.musicVolume?.value ?? 55);
    });
    els.musicPlayerHost.appendChild(iframe);
    activeIframeEl = iframe;
  }
}

function switchView(room) {
  currentRoom = room;
  if (!room) {
    els.viewLobby.hidden = false;
    els.viewWaiting.hidden = true;
    els.viewGame.hidden = true;
    els.btnLeave.hidden = true;
    if (els.btnOrders) els.btnOrders.hidden = true;
    if (els.btnMusic) els.btnMusic.hidden = true;
    els.connBadge.hidden = false;
    els.roomPill.hidden = true;
    els.cameraGroup.hidden = true;
    stagedGroups = [];
    lastRoundModalNumber = 0;
    lastTurnSeatSeen = null;
    lastTurnRoundSeen = null;
    lastOrderIdSeen = 0;
    if (els.dialogRound.open) els.dialogRound.close();
    if (els.dialogSecret.open) els.dialogSecret.close();
    if (els.dialogMusic?.open) els.dialogMusic.close();
    if (els.dialogOrders?.open) els.dialogOrders.close();
    applyRoomMusic(null);
    scene3d.setRoomOrders(null, 0);
    scene3d.renderGameState(null);
    return;
  }

  els.btnLeave.hidden = false;
  if (els.btnOrders) els.btnOrders.hidden = false;
  if (els.btnMusic) els.btnMusic.hidden = false;
  if (Object.prototype.hasOwnProperty.call(room, 'music')) {
    applyRoomMusic(room.music || null);
  }
  applyRoomOrders(room.orders || null, room.lastOrder || null, room.viewerSeatIndex ?? 0);

  if (room.status === 'waiting') {
    els.viewLobby.hidden = true;
    els.viewWaiting.hidden = false;
    els.viewGame.hidden = true;
    els.connBadge.hidden = false;
    els.roomPill.hidden = false;
    els.roomPill.textContent = `Oda ${room.code}`;
    els.cameraGroup.hidden = true;
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

  room.seats.forEach((seat) => {
    const card = document.createElement('div');
    card.className = 'wait-seat';

    const left = document.createElement('div');
    left.className = 'wait-seat__left';

    const avatarImg = document.createElement('img');
    avatarImg.className = 'wait-seat__avatar';
    const avatarVal = seat.avatar || `avatar-${(seat.seatIndex % 6) + 1}`;
    avatarImg.src = avatarVal.startsWith('data:image/')
      ? avatarVal
      : `/assets/${avatarVal}.jpg`;
    avatarImg.alt = seat.name || seatLabels[seat.seatIndex];

    const info = document.createElement('div');
    info.className = 'wait-seat__info';

    const title = document.createElement('strong');
    title.textContent =
      seat.type === 'empty' ? `${seatLabels[seat.seatIndex]} koltuğu boş` : seat.name;

    const role = document.createElement('span');
    role.className = 'wait-seat__role';
    const baseRole =
      seat.type === 'human'
        ? 'Gerçek oyuncu'
        : seat.type === 'bot'
          ? 'Yapay zekâ bot'
          : 'Oyun başlayınca bot atanabilir';
    role.textContent = isPaired
      ? `${(seat.seatIndex % 2) + 1}. Takım · ${baseRole}`
      : baseRole;

    info.append(title, role);
    left.append(avatarImg, info);
    card.appendChild(left);

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
    if (ev.type === 'round_start') {
      soundFX.playTileShuffle();
    } else if (ev.type === 'draw_deck' || ev.type === 'draw_discard') {
      soundFX.playTileFlip();
    } else if (ev.type === 'return_discard') {
      soundFX.playFeltSlide();
    } else if (ev.type === 'open_hand') {
      soundFX.playOpenHand();
    } else if (ev.type === 'round_over') {
      soundFX.playRoundWin();
    } else if (ev.type === 'discard') {
      if (String(ev.message || '').toLowerCase().includes('ceza')) {
        soundFX.playPenalty();
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
  const pairThr = game.pairThreshold || 5;
  els.hudThreshold.textContent =
    pairThr > 5 ? `${game.openThreshold} · ${pairThr}ç` : String(game.openThreshold);

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
  const canLayNewMeld =
    mySeat?.openMode === 'pairs'
      ? Boolean(validPair?.valid)
      : Boolean(validGroup?.valid);

  els.btnStageGroup.hidden = !canStage;
  els.btnLayMeld.hidden = !(isPlayPhase && mySeat?.opened && canLayNewMeld);
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
        const winnerLabel = t0 < t1 ? '1. Takım (Güney–Kuzey)' : '2. Takım (Doğu–Batı)';
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
      { label: '1. Takım (Güney–Kuzey)', score: t0, leading: t0 <= t1 },
      { label: '2. Takım (Doğu–Batı)', score: t1, leading: t1 <= t0 }
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
  socket.emit('room:leave', {}, () => {
    switchView(null);
    refreshRooms();
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

  const pairReq = game.pairThreshold || 5;
  const pickedFromSeat =
    game.pickedDiscardFromSeat != null ? game.seats?.[game.pickedDiscardFromSeat] : null;
  const katlamaliPairOnly = Boolean(
    game.options?.katlamali && game.pickedDiscardTileId && pickedFromSeat?.openMode === 'pairs'
  );

  const best = katlamaliPairOnly
    ? { canOpen: false, groups: [], totalPoints: 0 }
    : findBestOpening(mySeat.hand, game.okeyTarget, game.openThreshold);

  if (best.groups.length > 0 && best.canOpen) {
    stagedGroups = best.groups.map((g, idx) => ({
      id: `auto-${Date.now()}-${idx}`,
      mode: 'series',
      tiles: g.slots.map((s) => s.tile),
      points: g.points
    }));
    scene3d.clearSelection();
    updateGameControls();
  } else {
    const pairs = findPairsInHand(mySeat.hand, game.okeyTarget);
    if (pairs.length >= pairReq) {
      stagedGroups = pairs.map((pair, idx) => ({
        id: `pair-${Date.now()}-${idx}`,
        mode: 'pairs',
        tiles: pair,
        points: validatePair(pair, game.okeyTarget).points
      }));
      scene3d.clearSelection();
      updateGameControls();
    } else if (best.groups.length > 0) {
      stagedGroups = best.groups.map((g, idx) => ({
        id: `auto-${Date.now()}-${idx}`,
        mode: 'series',
        tiles: g.slots.map((s) => s.tile),
        points: g.points
      }));
      scene3d.clearSelection();
      updateGameControls();
      showNotice(`Bulunan en yüksek toplam ${best.totalPoints} sayı (açılış için ${game.openThreshold} gerekir).`);
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

// Shared Room Music controls
function openMusicDialog() {
  if (!currentRoom) return;
  if (els.musicUrlHelp) els.musicUrlHelp.textContent = '';
  if (els.musicUrlInput && activeMusicData?.originalUrl) {
    els.musicUrlInput.value = activeMusicData.originalUrl;
  }
  if (els.musicTitleInput && activeMusicData?.title) {
    els.musicTitleInput.value = activeMusicData.title;
  }
  els.dialogMusic?.showModal();
}

els.btnMusic?.addEventListener('click', openMusicDialog);
els.btnWaitMusic?.addEventListener('click', openMusicDialog);

els.musicForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const rawUrl = els.musicUrlInput?.value || '';
  const customTitle = els.musicTitleInput?.value || '';
  const preview = parseMusicUrl(rawUrl, customTitle);
  if (!preview.ok) {
    if (els.musicUrlHelp) els.musicUrlHelp.textContent = preview.error;
    els.musicUrlInput?.focus();
    return;
  }
  if (els.musicUrlHelp) els.musicUrlHelp.textContent = '';

  sendGameAction('room:musicSet', { url: rawUrl, title: customTitle }, (res) => {
    if (!res?.ok) {
      if (els.musicUrlHelp) {
        els.musicUrlHelp.textContent = res?.error || 'Müzik başlatılamadı.';
      }
      return;
    }
    if (res.music) applyRoomMusic(res.music);
    if (els.dialogMusic?.open) els.dialogMusic.close();
  });
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

[els.dialogRules, els.dialogRound, els.dialogSecret, els.dialogMusic, els.dialogOrders].forEach((dlg) => {
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
