import { GameSession } from '../../shared/gameSession.js';
import { createEmptyOrders, KAHVE_MENU_MAP } from '../../shared/menu.js';
import { buildYouTubeEmbedUrl, parseMusicUrl } from '../../shared/music.js';
import { pickRandomBotAvatar, pickRandomBotName } from '../../shared/presets.js';

export class LocalSingleplayerClient {
  constructor({ playerName, playerAvatar, seatIndex = 0, options, onState }) {
    this.onState = onState;
    this.music = null;
    this.musicQueue = [];
    this.musicQueueIndex = 0;
    this.musicAutoplay = true;
    this.musicHistory = [];
    this.orders = createEmptyOrders();
    this.lastOrder = null;
    this.orderSeq = 0;
    this.playerName = (typeof playerName === 'string' ? playerName.trim().slice(0, 20) : '') || 'Oyuncu';
    this.viewerSeatIndex = [0, 1, 2, 3].includes(Number(seatIndex)) ? Number(seatIndex) : 0;

    const humanAvatar = playerAvatar || 'avatar-1';
    const usedNames = [this.playerName];
    const usedAvatars = [humanAvatar];
    const seatsConfig = [0, 1, 2, 3].map((idx) => {
      if (idx === this.viewerSeatIndex) {
        return {
          playerId: `local-${idx}`,
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

    this.session = new GameSession({
      roomCode: 'TEK1',
      seatsConfig,
      options,
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
    this.onState({
      code: 'TEK1',
      name: 'Tek Kişilik Masa',
      status: 'playing',
      isHost: true,
      isLocal: true,
      music: this.music,
      orders: this.orders,
      lastOrder: this.lastOrder,
      options: this.session.options,
      viewerSeatIndex: this.viewerSeatIndex,
      seats: this.session.seats.map((s) => ({
        seatIndex: s.seatIndex,
        teamIndex: s.seatIndex % 2,
        type: s.isBot ? 'bot' : 'human',
        name: s.name,
        avatar: s.avatar,
        connected: true
      })),
      game: this.session.getClientView(this.viewerSeatIndex)
    });
  }

  action(event, data, ack) {
    if (!this.session) {
      ack?.({ ok: false, error: 'Yerel oturum kapalı.' });
      return;
    }

    let res = { ok: false, error: 'Bilinmeyen işlem.' };
    switch (event) {
      case 'game:drawDeck':
        res = this.session.drawFromDeck(this.viewerSeatIndex);
        break;
      case 'game:drawDiscard':
        res = this.session.drawFromDiscard(this.viewerSeatIndex);
        break;
      case 'game:returnDiscard':
        res = this.session.returnPickedDiscard(this.viewerSeatIndex);
        break;
      case 'game:openHand':
        res = this.session.openHand(this.viewerSeatIndex, data?.groups, data?.mode);
        break;
      case 'game:layMeld':
        res = this.session.layMeld(this.viewerSeatIndex, data?.tileIds);
        break;
      case 'game:layoffTile':
        res = this.session.layoffTile(this.viewerSeatIndex, data?.tileId, data?.meldId);
        break;
      case 'game:discard':
        res = this.session.discardTile(this.viewerSeatIndex, data?.tileId);
        break;
      case 'game:nextRound':
        if (this.session.phase !== 'roundOver') {
          res = { ok: false, error: 'Mevcut el henüz bitmedi.' };
          break;
        }
        this.session.startRound();
        res = { ok: true };
        break;
      case 'room:musicSet': {
        const resolved = data?.resolvedPayload;
        const mode = data?.mode === 'queue' ? 'queue' : 'replace';
        if (resolved?.ok && resolved.track) {
          const incoming = Array.isArray(resolved.queue) && resolved.queue.length > 0
            ? resolved.queue
            : [resolved.track];
          if (mode === 'queue' && this.music && this.musicQueue.length > 0) {
            const cap = Math.max(0, 30 - this.musicQueue.length);
            this.musicQueue.push(...incoming.slice(0, cap));
            this.music = {
              ...this.music,
              queueIndex: this.musicQueueIndex,
              queueTotal: this.musicQueue.length,
              hasNext: this.musicQueueIndex + 1 < this.musicQueue.length,
              autoplayEnabled: Boolean(this.musicAutoplay)
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
              autoplayEnabled: Boolean(this.musicAutoplay)
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
        } else {
          this.musicQueue = [parsed];
          this.musicQueueIndex = 0;
          this.recordMusicHistory(parsed);
          this.music = {
            ...parsed,
            updatedBy: this.playerName,
            updatedAt: Date.now(),
            queueIndex: 0,
            queueTotal: 1,
            hasNext: false,
            autoplayEnabled: Boolean(this.musicAutoplay)
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
            autoplayEnabled: this.musicAutoplay
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
                autoplayEnabled: true
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
        const nextTrack = data?.resolvedTrack || this.musicQueue[nextIdx];
        if (!nextTrack?.embedUrl) {
          res = { ok: false, needsResolveItem: nextTrack, nextIndex: nextIdx };
          break;
        }
        this.musicQueue[nextIdx] = nextTrack;
        this.musicQueueIndex = nextIdx;
        this.recordMusicHistory(nextTrack);
        this.music = {
          ...nextTrack,
          updatedBy: nextTrack.updatedBy || this.playerName,
          updatedAt: Date.now(),
          queueIndex: nextIdx,
          queueTotal: this.musicQueue.length,
          hasNext: nextIdx + 1 < this.musicQueue.length,
          autoplayEnabled: Boolean(this.musicAutoplay)
        };
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
            updatedAt: Date.now()
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
            fromSeat: this.viewerSeatIndex,
            fromName: this.playerName,
            servedAt
          };
          this.orders[seatIdx] = slot;
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
        res = { ok: true, orders: this.orders, lastOrder: this.lastOrder };
        break;
      }
      case 'room:orderClear': {
        if (data?.target === 'all') {
          this.orders = createEmptyOrders();
        } else {
          this.orders[this.viewerSeatIndex] = { drink: null, food: null };
        }
        this.emitRoomState();
        res = { ok: true, orders: this.orders };
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
  }
}
