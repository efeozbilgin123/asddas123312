import { GameSession } from '../../shared/gameSession.js';

export class LocalSingleplayerClient {
  constructor({ playerName, options, onState }) {
    this.onState = onState;
    this.session = new GameSession({
      roomCode: 'TEK1',
      seatsConfig: [
        { playerId: 'local-0', name: playerName || 'Oyuncu', isBot: false, connected: true },
        { playerId: 'bot-1', name: 'Selim (Bot)', isBot: true, connected: true },
        { playerId: 'bot-2', name: 'Zeynep (Bot)', isBot: true, connected: true },
        { playerId: 'bot-3', name: 'Kerem (Bot)', isBot: true, connected: true }
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
      options: this.session.options,
      viewerSeatIndex: 0,
      seats: this.session.seats.map((s) => ({
        seatIndex: s.seatIndex,
        type: s.isBot ? 'bot' : 'human',
        name: s.name,
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
        this.session.startRound();
        res = { ok: true };
        break;
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
