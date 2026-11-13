import { BilliardSession } from '../../shared/billiardSession.js';
import { GameSession } from '../../shared/gameSession.js';
import { createEmptyOrders, KAHVE_MENU_MAP } from '../../shared/menu.js';
import { buildYouTubeEmbedUrl, parseMusicUrl, summarizeMusicQueue } from '../../shared/music.js';
import {
  createEmptySocialStats,
  KAHVE_CATS,
  KAHVE_QUICK_CHATS,
  normalizeRoomAmbiance,
  normalizeRoomAtmosphere,
  pickRandomBotAvatar,
  pickRandomBotName,
  ROOM_AMBIANCES
} from '../../shared/presets.js';

const LOCAL_QUICK_CHAT_MAP = new Map(KAHVE_QUICK_CHATS.map((q) => [q.id, q]));

export class LocalSingleplayerClient {
  constructor({ playerName, playerAvatar, seatIndex = 0, options, onState }) {
    this.onState = onState;
    this.playerId = 'local-human';
    this.music = null;
    this.musicQueue = [];
    this.musicQueueIndex = 0;
    this.musicAutoplay = true;
    this.musicHistory = [];
    this.tv = null;
    this.ambianceTrack = null;
    this.orders = createEmptyOrders();
    this.lastOrder = null;
    this.orderSeq = 0;
    this.socialStats = createEmptySocialStats();
    this.catPetSeq = 0;
    this.chatHistory = [];
    this.chatSeq = 0;
    this.nudgeSeq = 0;
    this.lastNudgeAt = 0;
    this.playerName = (typeof playerName === 'string' ? playerName.trim().slice(0, 20) : '') || 'Oyuncu';
    this.playerAvatar = playerAvatar || 'avatar-1';
    this.viewerSeatIndex = [0, 1, 2, 3].includes(Number(seatIndex)) ? Number(seatIndex) : 0;
    this.okeyHumanSeatIndex = this.viewerSeatIndex;
    this.myActivity = 'okey'; // 'okey' | 'billiard' | 'spectator'
    this.watchSeatIndex = null;
    this.billiardSeatIndex = null;
    this.roamers = [];

    const humanAvatar = this.playerAvatar;
    const usedNames = [this.playerName];
    const usedAvatars = [humanAvatar];
    const seatsConfig = [0, 1, 2, 3].map((idx) => {
      if (idx === this.viewerSeatIndex) {
        return {
          playerId: this.playerId,
          name: this.playerName,
          avatar: humanAvatar,
          isBot: false,
          connected: true
        };
      }
      const botName = pickRandomBotName(usedNames);
      const botAvatar = pickRandomBotAvatar(usedAvatars);
      usedNames.push(botName);
      usedAvatars.push(botAvatar);
      return {
        playerId: `bot-${idx}`,
        name: botName,
        avatar: botAvatar,
        isBot: true,
        connected: true
      };
    });

    const normalizedOptions = {
      ...(options && typeof options === 'object' ? options : {}),
      roomAtmosphere: normalizeRoomAtmosphere(options?.roomAtmosphere),
      roomAmbiance: normalizeRoomAmbiance(options?.roomAmbiance)
    };

    this.billiard = new BilliardSession({
      onStateChange: () => {
        this.emitRoomState();
      }
    });
    // Start a friendly background bot game on the billiard table so solo players can watch or join!
    this.billiard.assignBot(0);
    this.billiard.assignBot(1);

    this.session = new GameSession({
      roomCode: 'TEK1',
      seatsConfig,
      options: normalizedOptions,
      onStateChange: () => {
        this.emitRoomState();
      }
    });
    this.session.startRound();
  }

  recordMusicHistory(track) {
    if (!track?.videoId) return;
    if (!this.musicHistory.includes(track.videoId)) {
      this.musicHistory.push(track.videoId);
      if (this.musicHistory.length > 40) {
        this.musicHistory.shift();
      }
    }
  }

  emitRoomState() {
    if (!this.onState || !this.session) return;
    const isSpectator = this.myActivity === 'spectator';
    const isOkey = this.myActivity === 'okey' && this.okeyHumanSeatIndex !== null;
    const effectiveViewer = isOkey ? this.okeyHumanSeatIndex : (this.watchSeatIndex ?? 0);
    const bSeat = this.billiard?.findHumanSeat(this.playerId) || null;
    this.billiardSeatIndex = bSeat ? bSeat.seatIndex : null;

    this.onState({
      code: 'TEK1',
      name: 'Tek Kişilik Masa',
      status: 'playing',
      isHost: true,
      isLocal: true,
      myActivity: this.myActivity,
      billiardSeatIndex: this.billiardSeatIndex,
      myRoamerKey: 'r-local',
      isSpectator,
      watchSeatIndex: isSpectator ? this.watchSeatIndex : null,
      spectators: isSpectator
        ? [{ name: this.playerName, avatar: this.playerAvatar, connected: true, watchSeatIndex: this.watchSeatIndex }]
        : [],
      spectatorCount: isSpectator ? 1 : 0,
      roamers: this.roamers,
      billiard: this.billiard ? this.billiard.getClientView() : null,
      music: this.music,
      tv: this.tv,
      ambianceTrack: this.ambianceTrack,
      orders: this.orders,
      lastOrder: this.lastOrder,
      socialStats: this.socialStats,
      chatHistory: this.chatHistory,
      options: this.session.options,
      viewerSeatIndex: effectiveViewer,
      seats: this.session.seats.map((s) => ({
        seatIndex: s.seatIndex,
        teamIndex: s.seatIndex % 2,
        type: s.isBot ? 'bot' : 'human',
        name: s.name,
        avatar: s.avatar,
        connected: true
      })),
      game: this.session.getClientView(effectiveViewer, {
        isSpectator: !isOkey,
        watchSeatIndex: isSpectator ? this.watchSeatIndex : null
      })
    });
  }

  vacateLocalOkeyToBot() {
    if (this.okeyHumanSeatIndex === null) return;
    const seatIdx = this.okeyHumanSeatIndex;
    const curSeat = this.session.seats[seatIdx];
    this.session.updateSeatConnection(seatIdx, {
      playerId: `bot-${seatIdx}`,
      name: curSeat?.name?.endsWith('(Bot)') ? curSeat.name : `${this.playerName} (Bot)`,
      avatar: this.playerAvatar,
      isBot: true,
      connected: true
    });
    this.okeyHumanSeatIndex = null;
  }

  action(event, data, ack) {
    if (!this.session) {
      ack?.({ ok: false, error: 'Yerel oturum kapalı.' });
      return;
    }

    let res = { ok: false, error: 'Bilinmeyen işlem.' };
    switch (event) {
      case 'game:drawDeck':
        res = this.okeyHumanSeatIndex !== null
          ? this.session.drawFromDeck(this.okeyHumanSeatIndex)
          : { ok: false, error: 'Okey masasında oturmuyorsunuz.' };
        break;
      case 'game:drawDiscard':
        res = this.okeyHumanSeatIndex !== null
          ? this.session.drawFromDiscard(this.okeyHumanSeatIndex)
          : { ok: false, error: 'Okey masasında oturmuyorsunuz.' };
        break;
      case 'game:returnDiscard':
        res = this.okeyHumanSeatIndex !== null
          ? this.session.returnPickedDiscard(this.okeyHumanSeatIndex)
          : { ok: false, error: 'Okey masasında oturmuyorsunuz.' };
        break;
      case 'game:openHand':
        res = this.okeyHumanSeatIndex !== null
          ? this.session.openHand(this.okeyHumanSeatIndex, data?.groups, data?.mode)
          : { ok: false, error: 'Okey masasında oturmuyorsunuz.' };
        break;
      case 'game:layMeld':
        res = this.okeyHumanSeatIndex !== null
          ? this.session.layMeld(this.okeyHumanSeatIndex, data?.tileIds)
          : { ok: false, error: 'Okey masasında oturmuyorsunuz.' };
        break;
      case 'game:layoffTile':
        res = this.okeyHumanSeatIndex !== null
          ? this.session.layoffTile(this.okeyHumanSeatIndex, data?.tileId, data?.meldId)
          : { ok: false, error: 'Okey masasında oturmuyorsunuz.' };
        break;
      case 'game:discard':
        res = this.okeyHumanSeatIndex !== null
          ? this.session.discardTile(this.okeyHumanSeatIndex, data?.tileId)
          : { ok: false, error: 'Okey masasında oturmuyorsunuz.' };
        break;
      case 'game:nextRound':
        if (this.session.phase !== 'roundOver') {
          res = { ok: false, error: 'Mevcut el henüz bitmedi.' };
          break;
        }
        this.session.startRound();
        res = { ok: true };
        break;
      case 'room:standUp':
      case 'room:billiardLeave': {
        this.vacateLocalOkeyToBot();
        if (this.billiard?.findHumanSeat(this.playerId)) {
          this.billiard.standHuman(this.playerId, { convertToBotIfActive: true });
        }
        this.myActivity = 'spectator';
        this.watchSeatIndex = null;
        this.emitRoomState();
        res = { ok: true, activity: 'spectator' };
        break;
      }
      case 'room:watchSeat': {
        const idx = data?.seatIndex === null || data?.seatIndex === undefined || data?.seatIndex === ''
          ? null
          : Number(data.seatIndex);
        this.watchSeatIndex = idx !== null && Number.isInteger(idx) && idx >= 0 && idx <= 3 ? idx : null;
        this.emitRoomState();
        res = { ok: true, watchSeatIndex: this.watchSeatIndex };
        break;
      }
      case 'room:takeSeat': {
        const reqIdx = data?.seatIndex !== undefined && data?.seatIndex !== null ? Number(data.seatIndex) : this.viewerSeatIndex;
        const targetIdx = [0, 1, 2, 3].includes(reqIdx) ? reqIdx : 0;
        if (this.billiard?.findHumanSeat(this.playerId)) {
          this.billiard.standHuman(this.playerId, { convertToBotIfActive: true });
        }
        this.okeyHumanSeatIndex = targetIdx;
        this.viewerSeatIndex = targetIdx;
        this.myActivity = 'okey';
        this.watchSeatIndex = null;
        this.session.updateSeatConnection(targetIdx, {
          playerId: this.playerId,
          name: this.playerName,
          avatar: this.playerAvatar,
          isBot: false,
          connected: true
        });
        this.emitRoomState();
        res = { ok: true, seatIndex: targetIdx };
        break;
      }
      case 'room:billiardJoin': {
        this.vacateLocalOkeyToBot();
        const reqIdx = data?.seatIndex !== undefined && data?.seatIndex !== null ? Number(data.seatIndex) : 0;
        if (this.billiard.phase !== 'playing') {
          this.billiard.seats[reqIdx].type = 'empty';
          this.billiard.seats[reqIdx].playerId = null;
        }
        let sitRes = this.billiard.sitHuman({
          playerId: this.playerId,
          playerName: this.playerName,
          playerAvatar: this.playerAvatar,
          seatIndex: reqIdx
        });
        if (!sitRes.ok && this.billiard.phase === 'playing') {
          const botSeat = this.billiard.seats.find((s) => s.type === 'bot');
          if (botSeat) {
            botSeat.type = 'human';
            botSeat.playerId = this.playerId;
            botSeat.name = this.playerName;
            botSeat.avatar = this.playerAvatar;
            botSeat.connected = true;
            sitRes = { ok: true, seatIndex: botSeat.seatIndex };
          }
        }
        if (sitRes.ok) {
          this.myActivity = 'billiard';
          this.watchSeatIndex = null;
          this.emitRoomState();
        }
        res = sitRes;
        break;
      }
      case 'room:billiardToggleBot':
        res = this.billiard.toggleBotSeat(data?.seatIndex);
        break;
      case 'room:billiardStart':
        res = this.billiard.startMatch({ autoFillBot: data?.autoFillBot !== false });
        break;
      case 'room:billiardAim':
        res = this.billiard.updateAim(this.playerId, { angle: data?.angle, power: data?.power });
        break;
      case 'room:billiardPlaceBall':
        res = this.billiard.placeCueBall(this.playerId, { x: data?.x, z: data?.z });
        break;
      case 'room:billiardShoot':
        res = this.billiard.shoot(this.playerId, { angle: data?.angle, power: data?.power });
        break;
      case 'room:roamMove':
        res = { ok: true };
        break;
      case 'room:musicSet': {
        const resolved = data?.resolvedPayload;
        const mode = data?.mode === 'queue' ? 'queue' : 'replace';
        if (resolved?.ok && resolved.track) {
          const incoming = (Array.isArray(resolved.queue) && resolved.queue.length > 0
            ? resolved.queue
            : [resolved.track]
          ).map((t) => ({ ...t, updatedBy: this.playerName }));
          if (mode === 'queue' && this.music && this.musicQueue.length > 0) {
            const cap = Math.max(0, 30 - this.musicQueue.length);
            this.musicQueue.push(...incoming.slice(0, cap));
            this.music = {
              ...this.music,
              queueIndex: this.musicQueueIndex,
              queueTotal: this.musicQueue.length,
              hasNext: this.musicQueueIndex + 1 < this.musicQueue.length,
              autoplayEnabled: Boolean(this.musicAutoplay),
              queueItems: summarizeMusicQueue(this.musicQueue, this.musicQueueIndex)
            };
          } else {
            this.musicQueue = incoming.slice(0, 30);
            this.musicQueueIndex = 0;
            this.recordMusicHistory(this.musicQueue[0]);
            this.music = {
              ...this.musicQueue[0],
              updatedBy: this.playerName,
              updatedAt: Date.now(),
              queueIndex: 0,
              queueTotal: this.musicQueue.length,
              hasNext: this.musicQueue.length > 1,
              autoplayEnabled: Boolean(this.musicAutoplay),
              queueItems: summarizeMusicQueue(this.musicQueue, 0)
            };
          }
          this.emitRoomState();
          res = { ok: true, music: this.music };
          break;
        }

        const parsed = parseMusicUrl(data?.url, data?.title);
        if (!parsed.ok) {
          res = parsed;
        } else if (parsed.needsResolution) {
          res = { ok: false, error: 'Spotify veya şarkı araması için sunucu bağlantısı gerekiyor.' };
        } else if (mode === 'queue' && this.music && this.musicQueue.length > 0) {
          if (this.musicQueue.length < 30) {
            this.musicQueue.push({ ...parsed, updatedBy: this.playerName });
          }
          this.music = {
            ...this.music,
            queueIndex: this.musicQueueIndex,
            queueTotal: this.musicQueue.length,
            hasNext: this.musicQueueIndex + 1 < this.musicQueue.length,
            autoplayEnabled: Boolean(this.musicAutoplay),
            queueItems: summarizeMusicQueue(this.musicQueue, this.musicQueueIndex)
          };
          this.emitRoomState();
          res = { ok: true, music: this.music };
        } else {
          const item = { ...parsed, updatedBy: this.playerName };
          this.musicQueue = [item];
          this.musicQueueIndex = 0;
          this.recordMusicHistory(item);
          this.music = {
            ...item,
            updatedBy: this.playerName,
            updatedAt: Date.now(),
            queueIndex: 0,
            queueTotal: 1,
            hasNext: false,
            autoplayEnabled: Boolean(this.musicAutoplay),
            queueItems: summarizeMusicQueue(this.musicQueue, 0)
          };
          this.emitRoomState();
          res = { ok: true, music: this.music };
        }
        break;
      }
      case 'room:musicAutoplay': {
        this.musicAutoplay = data?.enabled === undefined ? !this.musicAutoplay : Boolean(data.enabled);
        if (this.music) {
          this.music = {
            ...this.music,
            autoplayEnabled: this.musicAutoplay,
            queueItems: summarizeMusicQueue(this.musicQueue, this.musicQueueIndex)
          };
          this.emitRoomState();
        }
        res = { ok: true, autoplayEnabled: this.musicAutoplay, music: this.music };
        break;
      }
      case 'room:musicNext': {
        if (!this.music) {
          res = { ok: true, music: null };
          break;
        }
        const activeKey = `${this.music.embedUrl}|${this.music.updatedAt || 0}`;
        if (data?.currentKey && data.currentKey !== activeKey) {
          res = { ok: true, music: this.music, skippedDuplicate: true };
          break;
        }

        const nextIdx = this.musicQueueIndex + 1;
        if (nextIdx >= this.musicQueue.length) {
          if (this.musicAutoplay && !data?.stopIfEmpty) {
            if (data?.autoplayTrack?.embedUrl) {
              this.recordMusicHistory(this.music);
              this.recordMusicHistory(data.autoplayTrack);
              if (this.musicQueue.length >= 30) {
                this.musicQueue.shift();
              }
              this.musicQueue.push({ ...data.autoplayTrack, updatedBy: 'Serhat Canikli' });
              this.musicQueueIndex = this.musicQueue.length - 1;
              this.music = {
                ...data.autoplayTrack,
                updatedBy: 'Serhat Canikli',
                updatedAt: Date.now(),
                queueIndex: this.musicQueueIndex,
                queueTotal: this.musicQueue.length,
                hasNext: false,
                autoplayEnabled: true,
                queueItems: summarizeMusicQueue(this.musicQueue, this.musicQueueIndex)
              };
              this.emitRoomState();
              res = { ok: true, music: this.music };
              break;
            }
            this.recordMusicHistory(this.music);
            res = { ok: false, needsAutoplayTrack: this.music, excludeVideoIds: [...this.musicHistory] };
            break;
          }

          this.music = null;
          this.musicQueue = [];
          this.musicQueueIndex = 0;
          this.emitRoomState();
          res = { ok: true, music: null };
          break;
        }
        const candidate = this.musicQueue[nextIdx];
        const nextTrack = data?.resolvedTrack || candidate;
        if (!nextTrack?.embedUrl) {
          res = { ok: false, needsResolveItem: nextTrack, nextIndex: nextIdx };
          break;
        }
        const trackWithOwner = { ...nextTrack, updatedBy: candidate?.updatedBy || nextTrack.updatedBy || this.playerName };
        this.musicQueue[nextIdx] = trackWithOwner;
        this.musicQueueIndex = nextIdx;
        this.recordMusicHistory(trackWithOwner);
        this.music = {
          ...trackWithOwner,
          updatedAt: Date.now(),
          queueIndex: nextIdx,
          queueTotal: this.musicQueue.length,
          hasNext: nextIdx + 1 < this.musicQueue.length,
          autoplayEnabled: Boolean(this.musicAutoplay),
          queueItems: summarizeMusicQueue(this.musicQueue, nextIdx)
        };
        this.emitRoomState();
        res = { ok: true, music: this.music };
        break;
      }
      case 'room:musicQueueJump': {
        const targetIdx = Number(data?.index);
        if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= this.musicQueue.length) {
          res = { ok: false, error: 'Geçersiz sıra numarası.' };
          break;
        }
        const candidate = this.musicQueue[targetIdx];
        const targetTrack = data?.resolvedTrack || candidate;
        if (!targetTrack?.embedUrl) {
          res = { ok: false, needsResolveItem: targetTrack, targetIndex: targetIdx };
          break;
        }
        const trackWithOwner = { ...targetTrack, updatedBy: candidate?.updatedBy || targetTrack.updatedBy || this.playerName };
        this.musicQueue[targetIdx] = trackWithOwner;
        this.musicQueueIndex = targetIdx;
        this.recordMusicHistory(trackWithOwner);
        this.music = {
          ...trackWithOwner,
          updatedAt: Date.now(),
          queueIndex: targetIdx,
          queueTotal: this.musicQueue.length,
          hasNext: targetIdx + 1 < this.musicQueue.length,
          autoplayEnabled: Boolean(this.musicAutoplay),
          queueItems: summarizeMusicQueue(this.musicQueue, targetIdx)
        };
        this.emitRoomState();
        res = { ok: true, music: this.music };
        break;
      }
      case 'room:musicQueueRemove': {
        const targetIdx = Number(data?.index);
        if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= this.musicQueue.length) {
          res = { ok: false, error: 'Geçersiz sıra numarası.' };
          break;
        }
        const removingCurrent = targetIdx === this.musicQueueIndex;
        if (removingCurrent) {
          const previewLen = this.musicQueue.length - 1;
          if (previewLen > 0) {
            const nextPlayIdx = Math.min(targetIdx, previewLen - 1);
            const candidate = nextPlayIdx >= targetIdx ? this.musicQueue[nextPlayIdx + 1] : this.musicQueue[nextPlayIdx];
            const resolved = data?.resolvedTrack || candidate;
            if (!resolved?.embedUrl) {
              res = { ok: false, needsResolveItem: resolved, targetIndex: targetIdx };
              break;
            }
            this.musicQueue.splice(targetIdx, 1);
            const trackWithOwner = { ...resolved, updatedBy: candidate?.updatedBy || resolved.updatedBy || this.playerName };
            this.musicQueue[nextPlayIdx] = trackWithOwner;
            this.musicQueueIndex = nextPlayIdx;
            this.recordMusicHistory(trackWithOwner);
            this.music = {
              ...trackWithOwner,
              updatedAt: Date.now(),
              queueIndex: nextPlayIdx,
              queueTotal: this.musicQueue.length,
              hasNext: nextPlayIdx + 1 < this.musicQueue.length,
              autoplayEnabled: Boolean(this.musicAutoplay),
              queueItems: summarizeMusicQueue(this.musicQueue, nextPlayIdx)
            };
          } else {
            this.musicQueue = [];
            this.musicQueueIndex = 0;
            this.music = null;
          }
          this.emitRoomState();
          res = { ok: true, music: this.music };
          break;
        }

        this.musicQueue.splice(targetIdx, 1);
        if (targetIdx < this.musicQueueIndex) {
          this.musicQueueIndex = Math.max(0, this.musicQueueIndex - 1);
        }
        if (this.music) {
          this.music = {
            ...this.music,
            queueIndex: this.musicQueueIndex,
            queueTotal: this.musicQueue.length,
            hasNext: this.musicQueueIndex + 1 < this.musicQueue.length,
            queueItems: summarizeMusicQueue(this.musicQueue, this.musicQueueIndex)
          };
        }
        this.emitRoomState();
        res = { ok: true, music: this.music };
        break;
      }
      case 'room:musicQueueClear': {
        if (!this.music || this.musicQueue.length === 0) {
          res = { ok: true, music: this.music };
          break;
        }
        const active = this.musicQueue[this.musicQueueIndex] || { ...this.music };
        this.musicQueue = [active];
        this.musicQueueIndex = 0;
        this.music = {
          ...this.music,
          queueIndex: 0,
          queueTotal: 1,
          hasNext: false,
          queueItems: summarizeMusicQueue(this.musicQueue, 0)
        };
        this.emitRoomState();
        res = { ok: true, music: this.music };
        break;
      }
      case 'room:musicQueueShuffle': {
        if (!this.music || this.musicQueue.length === 0) {
          res = { ok: true, music: this.music };
          break;
        }
        const curIdx = Math.max(0, Math.min(this.musicQueueIndex || 0, this.musicQueue.length - 1));
        const head = this.musicQueue.slice(0, curIdx + 1);
        const upcoming = this.musicQueue.slice(curIdx + 1);
        for (let i = upcoming.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
        }
        this.musicQueue = [...head, ...upcoming];
        this.musicQueueIndex = curIdx;
        this.music = {
          ...this.music,
          queueIndex: curIdx,
          queueTotal: this.musicQueue.length,
          hasNext: curIdx + 1 < this.musicQueue.length,
          queueItems: summarizeMusicQueue(this.musicQueue, curIdx)
        };
        this.emitRoomState();
        res = { ok: true, music: this.music };
        break;
      }
      case 'room:musicQueueMove': {
        const fromIdx = Number(data?.fromIndex);
        const toIdx = Number(data?.toIndex);
        if (
          !Number.isInteger(fromIdx) ||
          !Number.isInteger(toIdx) ||
          fromIdx < 0 ||
          fromIdx >= this.musicQueue.length ||
          toIdx < 0 ||
          toIdx >= this.musicQueue.length
        ) {
          res = { ok: false, error: 'Geçersiz sıra konumu.' };
          break;
        }
        if (fromIdx === toIdx) {
          res = { ok: true, music: this.music };
          break;
        }
        const [moved] = this.musicQueue.splice(fromIdx, 1);
        this.musicQueue.splice(toIdx, 0, moved);
        let curIdx = this.musicQueueIndex || 0;
        if (curIdx === fromIdx) {
          curIdx = toIdx;
        } else if (fromIdx < curIdx && toIdx >= curIdx) {
          curIdx -= 1;
        } else if (fromIdx > curIdx && toIdx <= curIdx) {
          curIdx += 1;
        }
        this.musicQueueIndex = curIdx;
        if (this.music) {
          this.music = {
            ...this.music,
            queueIndex: curIdx,
            queueTotal: this.musicQueue.length,
            hasNext: curIdx + 1 < this.musicQueue.length,
            queueItems: summarizeMusicQueue(this.musicQueue, curIdx)
          };
        }
        this.emitRoomState();
        res = { ok: true, music: this.music };
        break;
      }
      case 'room:musicFallback': {
        const fallbacks = Array.isArray(this.music?.fallbackVideoIds) ? [...this.music.fallbackVideoIds] : [];
        const nextId = fallbacks.shift();
        if (!nextId) {
          res = { ok: false, noFallback: true };
        } else {
          this.music = {
            ...this.music,
            videoId: nextId,
            fallbackVideoIds: fallbacks,
            embedUrl: buildYouTubeEmbedUrl(nextId),
            updatedAt: Date.now(),
            queueItems: summarizeMusicQueue(this.musicQueue, this.musicQueueIndex)
          };
          this.recordMusicHistory(this.music);
          this.emitRoomState();
          res = { ok: true, music: this.music };
        }
        break;
      }
      case 'room:musicStop':
        this.music = null;
        this.musicQueue = [];
        this.musicQueueIndex = 0;
        this.musicHistory = [];
        this.emitRoomState();
        res = { ok: true };
        break;
      case 'room:options': {
        const opts = data?.options || data || {};
        if (opts.roomAtmosphere !== undefined) {
          this.session.options.roomAtmosphere = normalizeRoomAtmosphere(opts.roomAtmosphere);
        }
        if (opts.roomAmbiance !== undefined) {
          const nextAmb = normalizeRoomAmbiance(opts.roomAmbiance);
          const changed = nextAmb !== this.session.options.roomAmbiance;
          this.session.options.roomAmbiance = nextAmb;
          if (nextAmb === 'none') {
            this.ambianceTrack = null;
          } else if (changed && data?.ambianceTrack === undefined) {
            this.ambianceTrack = null;
          }
        }
        if (data?.ambianceTrack !== undefined) {
          this.ambianceTrack = data.ambianceTrack || null;
        }
        this.emitRoomState();
        res = { ok: true, options: this.session.options, ambiance: this.ambianceTrack };
        break;
      }
      case 'room:ambianceSet': {
        const ambId = String(data?.ambianceId || '').trim();
        if (ambId === 'none') {
          this.session.options.roomAmbiance = 'none';
          this.ambianceTrack = null;
          this.emitRoomState();
          res = { ok: true, ambiance: null, options: this.session.options };
          break;
        }
        const payload = data?.ambiancePayload;
        if (!payload || typeof payload !== 'object' || !payload.embedUrl) {
          res = { ok: false, error: 'Ortam sesi çözümlenemedi.' };
          break;
        }
        if (ROOM_AMBIANCES.some((a) => a.id === ambId)) {
          this.session.options.roomAmbiance = ambId;
        } else if (this.session.options.roomAmbiance === 'none') {
          this.session.options.roomAmbiance = 'rain';
        }
        this.ambianceTrack = {
          ambianceId: payload.ambianceId || (ambId || 'custom'),
          title: String(payload.title || 'Ortam Sesi').slice(0, 64),
          videoId: payload.videoId || null,
          fallbackVideoIds: Array.isArray(payload.fallbackVideoIds) ? payload.fallbackVideoIds.slice(0, 5) : [],
          originalUrl: payload.originalUrl || '',
          embedUrl: String(payload.embedUrl),
          updatedAt: Date.now()
        };
        this.emitRoomState();
        res = { ok: true, ambiance: this.ambianceTrack, options: this.session.options };
        break;
      }
      case 'room:tvSet': {
        const tvPayload = data?.tvPayload;
        if (!tvPayload || typeof tvPayload !== 'object' || !tvPayload.embedUrl) {
          res = { ok: false, error: 'TV yayını çözümlenemedi.' };
          break;
        }
        this.tv = {
          channelId: tvPayload.channelId || null,
          provider: tvPayload.provider || 'youtube',
          kind: tvPayload.kind || 'iframe',
          title: String(tvPayload.title || 'TV Kanalı').slice(0, 64),
          videoId: tvPayload.videoId || null,
          fallbackVideoIds: Array.isArray(tvPayload.fallbackVideoIds) ? tvPayload.fallbackVideoIds.slice(0, 5) : [],
          originalUrl: tvPayload.originalUrl || '',
          embedUrl: String(tvPayload.embedUrl),
          isLive: Boolean(tvPayload.isLive),
          updatedBy: this.playerName,
          updatedAt: Date.now()
        };
        this.emitRoomState();
        res = { ok: true, tv: this.tv };
        break;
      }
      case 'room:tvStop':
        this.tv = null;
        this.emitRoomState();
        res = { ok: true, tv: null };
        break;
      case 'room:orderTreat': {
        const item = KAHVE_MENU_MAP.get(String(data?.itemId || ''));
        if (!item) {
          res = { ok: false, error: 'Geçersiz kahvehane siparişi.' };
          break;
        }
        const target = data?.target || 'self';
        let targetIndices;
        if (target === 'all') {
          targetIndices = [0, 1, 2, 3];
        } else if (target === 'self') {
          targetIndices = [this.viewerSeatIndex];
        } else {
          const idx = Number(target);
          if (!Number.isInteger(idx) || !this.session.seats[idx]) {
            res = { ok: false, error: 'Seçilen koltukta kimse oturmuyor.' };
            break;
          }
          targetIndices = [idx];
        }
        const servedAt = Date.now();
        this.orderSeq += 1;
        for (const seatIdx of targetIndices) {
          const slot = this.orders[seatIdx] || { drink: null, food: null };
          slot[item.category] = {
            id: `ord-${this.orderSeq}-${seatIdx}`,
            itemId: item.id,
            label: item.label,
            shortLabel: item.shortLabel,
            category: item.category,
            sipsRemaining: item.category === 'drink' ? 4 : undefined,
            fromSeat: this.viewerSeatIndex,
            fromName: this.playerName,
            servedAt
          };
          this.orders[seatIdx] = slot;
        }
        if (this.socialStats[this.viewerSeatIndex]) {
          this.socialStats[this.viewerSeatIndex].treatsOrdered += targetIndices.length;
        }
        const targetName =
          target === 'all'
            ? 'tüm masaya'
            : targetIndices[0] === this.viewerSeatIndex
              ? 'kendine'
              : this.session.seats[targetIndices[0]]?.name || 'arkadaşına';
        this.lastOrder = {
          id: this.orderSeq,
          itemId: item.id,
          label: item.label,
          category: item.category,
          fromSeat: this.viewerSeatIndex,
          fromName: this.playerName,
          target,
          targetName,
          servedAt
        };
        this.emitRoomState();
        res = { ok: true, orders: this.orders, lastOrder: this.lastOrder, socialStats: this.socialStats };
        break;
      }
      case 'room:orderSip': {
        const slot = this.orders[this.viewerSeatIndex];
        const drink = slot?.drink;
        if (!drink) {
          res = { ok: false, error: 'Masanızda içilecek bir bardak yok.' };
          break;
        }
        const curSips = Number.isFinite(Number(drink.sipsRemaining)) ? Number(drink.sipsRemaining) : 4;
        let action = 'sip';
        if (curSips > 0) {
          drink.sipsRemaining = Math.max(0, curSips - 1);
          if (this.socialStats[this.viewerSeatIndex]) {
            this.socialStats[this.viewerSeatIndex].sipsTaken += 1;
          }
        } else {
          drink.sipsRemaining = 4;
          drink.refilledAt = Date.now();
          action = 'refill';
          if (this.socialStats[this.viewerSeatIndex]) {
            this.socialStats[this.viewerSeatIndex].treatsOrdered += 1;
          }
        }
        this.emitRoomState();
        res = { ok: true, action, sipsRemaining: drink.sipsRemaining, orders: this.orders, socialStats: this.socialStats };
        break;
      }
      case 'room:orderClear': {
        if (data?.target === 'all') {
          this.orders = createEmptyOrders();
        } else {
          this.orders[this.viewerSeatIndex] = { drink: null, food: null };
        }
        this.emitRoomState();
        res = { ok: true, orders: this.orders, socialStats: this.socialStats };
        break;
      }
      case 'room:catPet': {
        const idx = Number(data?.catIndex);
        const cat = Number.isInteger(idx) ? KAHVE_CATS[idx] : null;
        if (!cat) {
          res = { ok: false, error: 'Geçersiz kedi seçimi.' };
          break;
        }
        const action = ['pet', 'mama', 'milk'].includes(String(data?.action || 'pet'))
          ? String(data?.action || 'pet')
          : 'pet';
        if (this.socialStats[this.viewerSeatIndex]) {
          this.socialStats[this.viewerSeatIndex].catsPetted += 1;
        }
        this.catPetSeq += 1;
        const payload = {
          id: this.catPetSeq,
          catIndex: idx,
          cat,
          action,
          seatIndex: this.viewerSeatIndex,
          name: this.playerName,
          socialStats: this.socialStats,
          at: Date.now()
        };
        this.emitRoomState();
        res = { ok: true, payload };
        break;
      }
      case 'room:chatSend': {
        const quick = data?.quickId ? LOCAL_QUICK_CHAT_MAP.get(String(data.quickId)) : null;
        const rawText = quick ? quick.text : String(data?.text || '');
        const cleanText = rawText.trim().replace(/\s+/g, ' ').slice(0, 140);
        if (!cleanText) {
          res = { ok: false, error: 'Boş mesaj gönderilemez.' };
          break;
        }
        this.chatSeq += 1;
        const viewerSeat = this.session.seats[this.viewerSeatIndex];
        const entry = {
          id: this.chatSeq,
          seatIndex: this.viewerSeatIndex,
          name: this.playerName,
          avatar: viewerSeat?.avatar || 'avatar-1',
          text: cleanText,
          quickId: quick?.id || null,
          sentAt: Date.now()
        };
        this.chatHistory.push(entry);
        if (this.chatHistory.length > 40) this.chatHistory.shift();
        this.emitRoomState();
        res = { ok: true, entry };
        break;
      }
      case 'room:nudge': {
        const now = Date.now();
        if (now - this.lastNudgeAt < 2500) {
          res = { ok: false, error: 'Biraz yavaş, masayı kırmayalım!' };
          break;
        }
        this.lastNudgeAt = now;
        this.nudgeSeq += 1;
        const rawTarget = data?.targetSeatIndex;
        const validTarget =
          rawTarget !== null &&
          rawTarget !== undefined &&
          Number.isInteger(Number(rawTarget)) &&
          this.session.seats[Number(rawTarget)]
            ? Number(rawTarget)
            : null;
        const nudge = {
          id: this.nudgeSeq,
          seatIndex: this.viewerSeatIndex,
          name: this.playerName,
          targetSeatIndex: validTarget,
          sentAt: now
        };
        res = { ok: true, nudge };
        break;
      }
      case 'admin:unlock':
      case 'admin:snapshot':
        res = { ok: true, snapshot: this.session.getAdminSnapshot() };
        break;
      case 'admin:swapTile': {
        const out = this.session.adminSwapTile({
          actorSeatIndex: this.viewerSeatIndex,
          myTileId: data?.myTileId,
          sourceKind: data?.sourceKind,
          targetSeatIndex: data?.targetSeatIndex,
          targetTileId: data?.targetTileId
        });
        res = out.ok ? { ok: true, snapshot: this.session.getAdminSnapshot() } : out;
        break;
      }
      case 'admin:stealOkey': {
        const out = this.session.adminStealOkey(this.viewerSeatIndex, data?.myTileId);
        res = out.ok ? { ok: true, snapshot: this.session.getAdminSnapshot() } : out;
        break;
      }
      default:
        break;
    }
    ack?.(res);
  }

  destroy() {
    if (this.session) {
      this.session.destroy();
      this.session = null;
    }
    if (this.billiard) {
      this.billiard.destroy();
      this.billiard = null;
    }
  }
}
