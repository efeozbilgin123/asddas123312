import { GameSession } from '../../shared/gameSession.js';
import { createEmptyOrders, KAHVE_MENU_MAP } from '../../shared/menu.js';
import { parseMusicUrl } from '../../shared/music.js';

export class LocalSingleplayerClient {
  constructor({ playerName, playerAvatar, options, onState }) {
    this.onState = onState;
    this.music = null;
    this.orders = createEmptyOrders();
    this.lastOrder = null;
    this.orderSeq = 0;
    this.playerName = (typeof playerName === 'string' ? playerName.trim().slice(0, 20) : '') || 'Oyuncu';
    this.session = new GameSession({
      roomCode: 'TEK1',
      seatsConfig: [
        { playerId: 'local-0', name: this.playerName, avatar: playerAvatar || 'avatar-1', isBot: false, connected: true },
        { playerId: 'bot-1', name: 'Selim (Bot)', avatar: 'avatar-4', isBot: true, connected: true },
        { playerId: 'bot-2', name: 'Zeynep (Bot)', avatar: 'avatar-2', isBot: true, connected: true },
        { playerId: 'bot-3', name: 'Kerem (Bot)', avatar: 'avatar-3', isBot: true, connected: true }
      ],
      options,
      onStateChange: () => {
        this.emitRoomState();
      }
    });
    this.session.startRound();
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
      viewerSeatIndex: 0,
      seats: this.session.seats.map((s) => ({
        seatIndex: s.seatIndex,
        teamIndex: s.seatIndex % 2,
        type: s.isBot ? 'bot' : 'human',
        name: s.name,
        avatar: s.avatar,
        connected: true
      })),
      game: this.session.getClientView(0)
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
        res = this.session.drawFromDeck(0);
        break;
      case 'game:drawDiscard':
        res = this.session.drawFromDiscard(0);
        break;
      case 'game:returnDiscard':
        res = this.session.returnPickedDiscard(0);
        break;
      case 'game:openHand':
        res = this.session.openHand(0, data?.groups, data?.mode);
        break;
      case 'game:layMeld':
        res = this.session.layMeld(0, data?.tileIds);
        break;
      case 'game:layoffTile':
        res = this.session.layoffTile(0, data?.tileId, data?.meldId);
        break;
      case 'game:discard':
        res = this.session.discardTile(0, data?.tileId);
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
        const parsed = parseMusicUrl(data?.url, data?.title);
        if (!parsed.ok) {
          res = parsed;
        } else {
          this.music = {
            ...parsed,
            updatedBy: this.playerName,
            updatedAt: Date.now()
          };
          this.emitRoomState();
          res = { ok: true, music: this.music };
        }
        break;
      }
      case 'room:musicStop':
        this.music = null;
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
          targetIndices = [0];
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
            fromSeat: 0,
            fromName: this.playerName,
            servedAt
          };
          this.orders[seatIdx] = slot;
        }
        const targetName =
          target === 'all'
            ? 'tüm masaya'
            : targetIndices[0] === 0
              ? 'kendine'
              : this.session.seats[targetIndices[0]]?.name || 'arkadaşına';
        this.lastOrder = {
          id: this.orderSeq,
          itemId: item.id,
          label: item.label,
          category: item.category,
          fromSeat: 0,
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
          this.orders[0] = { drink: null, food: null };
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
          actorSeatIndex: 0,
          myTileId: data?.myTileId,
          sourceKind: data?.sourceKind,
          targetSeatIndex: data?.targetSeatIndex,
          targetTileId: data?.targetTileId
        });
        res = out.ok ? { ok: true, snapshot: this.session.getAdminSnapshot() } : out;
        break;
      }
      case 'admin:stealOkey': {
        const out = this.session.adminStealOkey(0, data?.myTileId);
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
