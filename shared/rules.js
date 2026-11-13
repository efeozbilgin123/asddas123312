import { canLayoffTile } from './melds.js';
import { isOkeyTile, tileHandPenaltyValue } from './tiles.js';

export function isDiscardPlayableOnTable(tile, tableMelds, okeyTarget) {
  if (!tile || !Array.isArray(tableMelds) || tableMelds.length === 0) {
    return false;
  }
  if (isOkeyTile(tile, okeyTarget)) {
    return false;
  }
  return tableMelds.some((meld) => canLayoffTile(tile, meld, okeyTarget).valid);
}

export function computeRoundScores({
  seats,
  winnerSeat,
  finishedWithOkey,
  okeyTarget,
  teamMode = 'solo'
}) {
  const multiplier = finishedWithOkey ? 2 : 1;
  const winningTeam =
    teamMode === 'paired' && winnerSeat !== null ? winnerSeat % 2 : null;

  return seats.map((seat) => {
    const penalties = seat.roundPenalties || 0;
    const teamIndex = seat.seatIndex % 2;

    if (winnerSeat !== null && seat.seatIndex === winnerSeat) {
      const bonus = -101 * multiplier;
      return {
        seatIndex: seat.seatIndex,
        teamIndex,
        name: seat.name,
        opened: seat.opened,
        openMode: seat.openMode,
        handValue: 0,
        penalties,
        roundDelta: bonus + penalties,
        isWinner: true,
        isWinningPartner: false
      };
    }

    if (winningTeam !== null && teamIndex === winningTeam) {
      return {
        seatIndex: seat.seatIndex,
        teamIndex,
        name: seat.name,
        opened: seat.opened,
        openMode: seat.openMode,
        handValue: 0,
        penalties,
        roundDelta: penalties,
        isWinner: false,
        isWinningPartner: true
      };
    }

    if (!seat.opened) {
      const unopenedPenalty = 202 * multiplier;
      return {
        seatIndex: seat.seatIndex,
        teamIndex,
        name: seat.name,
        opened: false,
        openMode: null,
        handValue: unopenedPenalty,
        penalties,
        roundDelta: unopenedPenalty + penalties,
        isWinner: false,
        isWinningPartner: false
      };
    }

    const rawHand = seat.hand.reduce(
      (sum, tile) => sum + tileHandPenaltyValue(tile, okeyTarget),
      0
    );
    const pairMultiplier = seat.openMode === 'pairs' ? 2 : 1;
    const handValue = rawHand * multiplier * pairMultiplier;

    return {
      seatIndex: seat.seatIndex,
      teamIndex,
      name: seat.name,
      opened: true,
      openMode: seat.openMode,
      handValue,
      penalties,
      roundDelta: handValue + penalties,
      isWinner: false,
      isWinningPartner: false
    };
  });
}
