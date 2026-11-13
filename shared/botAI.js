import {
  canLayoffTile,
  findBestOpening,
  findPairsInHand,
  validatePair
} from './melds.js';
import { isDiscardPlayableOnTable } from './rules.js';
import { effectiveTileProps, isOkeyTile } from './tiles.js';

export function chooseBotDrawSource({ seat, leftDiscardTop, state }) {
  if (!leftDiscardTop || isOkeyTile(leftDiscardTop, state.okeyTarget)) return 'deck';

  const leftSeatIdx = (seat.seatIndex + 3) % 4;
  const leftSeat = state.seats?.[leftSeatIdx];
  const katlamaliPairLock = Boolean(state.options?.katlamali && leftSeat?.openMode === 'pairs');
  const openTarget = typeof state.getOpenThreshold === 'function'
    ? state.getOpenThreshold(seat.seatIndex)
    : state.openThreshold;
  const pairTarget = typeof state.getPairThreshold === 'function'
    ? state.getPairThreshold(seat.seatIndex)
    : (state.pairThreshold || 5);

  // If bot already opened and can immediately lay off leftDiscardTop onto the table, take it!
  if (seat.opened) {
    const canLayoff = state.tableMelds.some(
      (meld) => canLayoffTile(leftDiscardTop, meld, state.okeyTarget).valid
    );
    if (canLayoff) return 'discard';
  } else {
    if (!katlamaliPairLock) {
      const withTile = [...seat.hand, leftDiscardTop];
      const openTry = findBestOpening(withTile, state.okeyTarget, openTarget, leftDiscardTop.id);
      if (openTry.canOpen) {
        const usesTile = openTry.groups.some((g) =>
          g.slots.some((s) => s.tile.id === leftDiscardTop.id)
        );
        if (usesTile) return 'discard';
      }
    } else {
      const withTile = [...seat.hand, leftDiscardTop];
      const pairList = findPairsInHand(withTile, state.okeyTarget, leftDiscardTop.id);
      if (pairList.length >= pairTarget) {
        const usesTile = pairList.some((pair) => pair.some((t) => t.id === leftDiscardTop.id));
        if (usesTile) return 'discard';
      }
    }
  }

  return 'deck';
}

export function computeBotTurnActions({ seat, state }) {
  const actions = [];
  let workingHand = [...seat.hand];
  let workingMelds = state.tableMelds.map((m) => ({
    ...m,
    slots: [...m.slots]
  }));
  let opened = seat.opened;
  let openMode = seat.openMode;
  const mustUseId = state.pickedDiscardTileId;
  const openTarget = typeof state.getOpenThreshold === 'function'
    ? state.getOpenThreshold(seat.seatIndex)
    : state.openThreshold;
  const pairTarget = typeof state.getPairThreshold === 'function'
    ? state.getPairThreshold(seat.seatIndex)
    : (state.pairThreshold || 5);
  const pickedFromSeat = state.pickedDiscardFromSeat != null
    ? state.seats?.[state.pickedDiscardFromSeat]
    : null;
  const katlamaliSeriesBlocked = Boolean(
    mustUseId && state.options?.katlamali && pickedFromSeat?.openMode === 'pairs'
  );

  // 1. Try opening if not yet opened
  if (!opened) {
    const opening = findBestOpening(workingHand, state.okeyTarget, openTarget, mustUseId);
    const pairList = findPairsInHand(workingHand, state.okeyTarget, mustUseId);
    const canOpenPairs = pairList.length >= pairTarget;

    const openingUsesMust =
      !mustUseId ||
      opening.groups.some((g) => g.slots.some((s) => s.tile.id === mustUseId));
    const pairsUseMust =
      !mustUseId ||
      pairList.some((pair) => pair.some((t) => t.id === mustUseId));

    if (
      !katlamaliSeriesBlocked &&
      opening.canOpen &&
      openingUsesMust &&
      workingHand.length - opening.groups.reduce((n, g) => n + g.slots.length, 0) >= 1
    ) {
      const usedIds = new Set();
      const groupTileIds = [];
      for (const g of opening.groups) {
        const ids = g.slots.map((s) => s.tile.id);
        groupTileIds.push(ids);
        ids.forEach((id) => usedIds.add(id));
      }
      actions.push({
        type: 'openHand',
        mode: 'series',
        groups: groupTileIds
      });
      workingHand = workingHand.filter((t) => !usedIds.has(t.id));
      opened = true;
      openMode = 'series';
      for (const g of opening.groups) {
        workingMelds.push({
          id: `sim-${workingMelds.length}`,
          type: g.type,
          ownerSeat: seat.seatIndex,
          points: g.points,
          slots: g.slots
        });
      }
    } else if (canOpenPairs && pairsUseMust && workingHand.length - pairList.length * 2 >= 1) {
      const pairTileIds = pairList.map((p) => p.map((t) => t.id));
      const usedIds = new Set(pairTileIds.flat());
      actions.push({
        type: 'openHand',
        mode: 'pairs',
        groups: pairTileIds
      });
      workingHand = workingHand.filter((t) => !usedIds.has(t.id));
      opened = true;
      openMode = 'pairs';
    }
  }

  // 1b. If already opened and holding mustUseId from left discard, lay it off onto a table meld first
  let mustUseSatisfied = !mustUseId || !workingHand.some((t) => t.id === mustUseId);
  if (opened && !mustUseSatisfied && workingHand.length > 1) {
    const mustIdx = workingHand.findIndex((t) => t.id === mustUseId);
    if (mustIdx !== -1) {
      const mustTile = workingHand[mustIdx];
      for (let mIdx = 0; mIdx < workingMelds.length; mIdx += 1) {
        const res = canLayoffTile(mustTile, workingMelds[mIdx], state.okeyTarget);
        if (res.valid && !res.swappedOkey) {
          actions.push({
            type: 'layoffTile',
            tileId: mustTile.id,
            meldId: workingMelds[mIdx].id
          });
          workingHand.splice(mustIdx, 1);
          workingMelds[mIdx] = res.updatedMeld;
          mustUseSatisfied = true;
          break;
        }
      }
    }
  }

  // 2. If opened, try laying down extra complete melds (only if leaving >= 1 tile to discard)
  if (opened && openMode !== 'pairs') {
    const extra = findBestOpening(
      workingHand,
      state.okeyTarget,
      0,
      mustUseSatisfied ? null : mustUseId
    );
    const orderedGroups = !mustUseSatisfied
      ? [...extra.groups].sort((a, b) => {
          const aHas = a.slots.some((s) => s.tile.id === mustUseId) ? 1 : 0;
          const bHas = b.slots.some((s) => s.tile.id === mustUseId) ? 1 : 0;
          return bHas - aHas;
        })
      : extra.groups;
    for (const group of orderedGroups) {
      if (workingHand.length - group.slots.length >= 1) {
        const ids = group.slots.map((s) => s.tile.id);
        if (!mustUseSatisfied && !ids.includes(mustUseId)) continue;
        mustUseSatisfied = true;
        actions.push({
          type: 'layMeld',
          tileIds: ids
        });
        const idSet = new Set(ids);
        workingHand = workingHand.filter((t) => !idSet.has(t.id));
        workingMelds.push({
          id: `sim-${workingMelds.length}`,
          type: group.type,
          ownerSeat: seat.seatIndex,
          points: group.points,
          slots: group.slots
        });
      }
    }
  } else if (opened && openMode === 'pairs') {
    const extraPairs = findPairsInHand(
      workingHand,
      state.okeyTarget,
      mustUseSatisfied ? null : mustUseId
    );
    for (const pair of extraPairs) {
      if (workingHand.length - 2 >= 1 && validatePair(pair, state.okeyTarget).valid) {
        const ids = pair.map((t) => t.id);
        if (!mustUseSatisfied && !ids.includes(mustUseId)) continue;
        mustUseSatisfied = true;
        actions.push({
          type: 'layMeld',
          tileIds: ids
        });
        const idSet = new Set(ids);
        workingHand = workingHand.filter((t) => !idSet.has(t.id));
      }
    }
  }

  // 3. Try laying off individual tiles onto existing table melds (keep at least 1 tile to discard)
  if (opened) {
    let laidAny = true;
    while (laidAny && workingHand.length > 1) {
      laidAny = false;
      for (let i = 0; i < workingHand.length; i += 1) {
        const tile = workingHand[i];
        // Don't waste an Okey in a random layoff unless it finishes the hand
        if (isOkeyTile(tile, state.okeyTarget) && workingHand.length > 2) continue;

        for (let mIdx = 0; mIdx < workingMelds.length; mIdx += 1) {
          const meld = workingMelds[mIdx];
          const res = canLayoffTile(tile, meld, state.okeyTarget);
          if (res.valid && !res.swappedOkey) {
            actions.push({
              type: 'layoffTile',
              tileId: tile.id,
              meldId: meld.id
            });
            workingHand.splice(i, 1);
            workingMelds[mIdx] = res.updatedMeld;
            laidAny = true;
            break;
          }
        }
        if (laidAny) break;
      }
    }
  }

  // 4. Pick best discard tile (avoid Okey, avoid tiles in useful pairs/runs, avoid İşlek Taş)
  const candidates = workingHand.map((tile) => {
    const eff = effectiveTileProps(tile, state.okeyTarget);
    let score = eff.number; // Prefer discarding high deadwood when safe

    if (isOkeyTile(tile, state.okeyTarget)) {
      score -= 1000;
    }
    if (isDiscardPlayableOnTable(tile, workingMelds, state.okeyTarget)) {
      score -= 500;
    }

    // Penalize discarding tiles that form neighbor runs or pairs in hand
    for (const other of workingHand) {
      if (other.id === tile.id) continue;
      const oEff = effectiveTileProps(other, state.okeyTarget);
      if (oEff.color === eff.color && Math.abs(oEff.number - eff.number) === 1) {
        score -= 18;
      }
      if (oEff.color === eff.color && oEff.number === eff.number) {
        score -= 12;
      }
      if (oEff.number === eff.number && oEff.color !== eff.color) {
        score -= 14;
      }
    }

    return { tile, score };
  });

  candidates.sort((a, b) => b.score - a.score);
  const discardTile = candidates[0]?.tile || workingHand[0];

  if (discardTile) {
    actions.push({
      type: 'discardTile',
      tileId: discardTile.id
    });
  }

  return actions;
}
