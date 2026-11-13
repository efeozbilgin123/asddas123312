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
  finishedWithOkey = false,
  finishedFromPairs = false,
  finishedFromHand = false,
  roundCancelled = false,
  okeyTarget,
  teamMode = 'solo'
}) {
  if (roundCancelled) {
    return seats.map((seat) => ({
      seatIndex: seat.seatIndex,
      teamIndex: seat.seatIndex % 2,
      name: seat.name,
      opened: seat.opened,
      openMode: seat.openMode,
      handValue: 0,
      penalties: 0,
      roundDelta: 0,
      isWinner: false,
      isWinningPartner: false
    }));
  }

  let multiplier = 1;
  if (finishedWithOkey) multiplier *= 2;
  if (finishedFromPairs || finishedFromHand) multiplier *= 2;

  const winningTeam =
    teamMode === 'paired' && winnerSeat !== null ? winnerSeat % 2 : null;

  return seats.map((seat) => {
    const basePenalties = seat.roundPenalties || 0;
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
        penalties: basePenalties,
        roundDelta: bonus + basePenalties,
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
        penalties: basePenalties,
        roundDelta: basePenalties,
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
        penalties: basePenalties,
        roundDelta: unopenedPenalty + basePenalties,
        isWinner: false,
        isWinningPartner: false
      };
    }

    let rawHand = 0;
    let okeyHoldPenalty = 0;
    for (const tile of seat.hand) {
      if (isOkeyTile(tile, okeyTarget)) {
        okeyHoldPenalty += 101;
      } else {
        rawHand += tileHandPenaltyValue(tile, okeyTarget);
      }
    }

    const pairMultiplier = seat.openMode === 'pairs' ? 2 : 1;
    const handValue = rawHand * multiplier * pairMultiplier;
    const penalties = basePenalties + okeyHoldPenalty;

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
