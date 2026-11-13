import { COLORS, effectiveTileProps, isGostergeTile, isOkeyTile } from './tiles.js';

export function validatePair(tiles, okeyTarget, gosterge = null) {
  if (!Array.isArray(tiles)) {
    return { valid: false, reason: 'Çift için geçerli taş seçin.' };
  }
  if (tiles.length === 1 && gosterge && isGostergeTile(tiles[0], gosterge)) {
    const g = tiles[0];
    return {
      valid: true,
      type: 'pair',
      isGostergePair: true,
      points: g.number * 2,
      slots: [
        { tile: g, representsColor: g.color, representsNumber: g.number }
      ]
    };
  }
  if (tiles.length !== 2) {
    return { valid: false, reason: 'Çift tam olarak 2 taştan (veya tek gösterge taşından) oluşmalıdır.' };
  }
  const [a, b] = tiles;
  const pa = effectiveTileProps(a, okeyTarget);
  const pb = effectiveTileProps(b, okeyTarget);

  if (pa.isWild || pb.isWild) {
    const rep = pa.isWild ? pb : pa;
    const val = rep.isWild ? okeyTarget.number : rep.number;
    return {
      valid: true,
      type: 'pair',
      points: val * 2,
      slots: [
        { tile: a, representsColor: rep.color, representsNumber: val },
        { tile: b, representsColor: rep.color, representsNumber: val }
      ]
    };
  }

  if (pa.color === pb.color && pa.number === pb.number) {
    return {
      valid: true,
      type: 'pair',
      points: pa.number * 2,
      slots: [
        { tile: a, representsColor: pa.color, representsNumber: pa.number },
        { tile: b, representsColor: pb.color, representsNumber: pb.number }
      ]
    };
  }

  return { valid: false, reason: 'Çift için aynı renk ve sayıda iki taş gerekir.' };
}

export function validateSet(tiles, okeyTarget) {
  if (!Array.isArray(tiles) || tiles.length < 3 || tiles.length > 4) {
    return { valid: false, reason: 'Per 3 veya 4 taştan oluşmalıdır.' };
  }

  const props = tiles.map((tile) => ({
    tile,
    eff: effectiveTileProps(tile, okeyTarget)
  }));

  const normals = props.filter((p) => !p.eff.isWild);
  const wilds = props.filter((p) => p.eff.isWild);

  if (normals.length === 0) {
    return { valid: false, reason: 'Perde en az bir gerçek taş bulunmalıdır.' };
  }

  const targetNumber = normals[0].eff.number;
  const usedColors = new Set();

  for (const item of normals) {
    if (item.eff.number !== targetNumber) {
      return { valid: false, reason: 'Perdeki tüm taşlar aynı sayıda olmalıdır.' };
    }
    if (usedColors.has(item.eff.color)) {
      return { valid: false, reason: 'Perdeki taşların renkleri birbirinden farklı olmalıdır.' };
    }
    usedColors.add(item.eff.color);
  }

  const missingColors = COLORS.filter((c) => !usedColors.has(c));
  const orderedColors = COLORS.filter((c) => usedColors.has(c));
  const slots = [];

  for (const color of orderedColors) {
    const match = normals.find((n) => n.eff.color === color);
    slots.push({
      tile: match.tile,
      representsColor: color,
      representsNumber: targetNumber
    });
  }

  for (let i = 0; i < wilds.length; i += 1) {
    const color = missingColors[i];
    if (!color) {
      return { valid: false, reason: 'Perde fazla Okey var.' };
    }
    slots.push({
      tile: wilds[i].tile,
      representsColor: color,
      representsNumber: targetNumber
    });
  }

  return {
    valid: true,
    type: 'set',
    number: targetNumber,
    points: targetNumber * tiles.length,
    slots
  };
}

export function validateRun(tiles, okeyTarget) {
  if (!Array.isArray(tiles) || tiles.length < 3 || tiles.length > 13) {
    return { valid: false, reason: 'Seri en az 3, en fazla 13 taştan oluşmalıdır.' };
  }

  const props = tiles.map((tile) => ({
    tile,
    eff: effectiveTileProps(tile, okeyTarget)
  }));

  const normals = props.filter((p) => !p.eff.isWild);
  const wilds = props.filter((p) => p.eff.isWild);

  if (normals.length === 0) {
    return { valid: false, reason: 'Seride en az bir gerçek taş bulunmalıdır.' };
  }

  const targetColor = normals[0].eff.color;
  const normalByNumber = new Map();

  for (const item of normals) {
    if (item.eff.color !== targetColor) {
      return { valid: false, reason: 'Serideki tüm taşlar aynı renkte olmalıdır.' };
    }
    if (normalByNumber.has(item.eff.number)) {
      return { valid: false, reason: 'Seride aynı sayıdan iki tane bulunamaz.' };
    }
    normalByNumber.set(item.eff.number, item.tile);
  }

  const len = tiles.length;
  let bestCandidate = null;

  for (let start = 1; start <= 14 - len; start += 1) {
    const end = start + len - 1;
    // Standard 101 Okey runs end at 13 (12-13-1 wraparound is not valid)
    const windowNums = [];
    const seen = new Set();

    for (let pos = start; pos <= end; pos += 1) {
      seen.add(pos);
      windowNums.push(pos);
    }

    // Every normal tile must exist in windowNums
    let allNormalsFit = true;
    for (const num of normalByNumber.keys()) {
      if (!seen.has(num)) {
        allNormalsFit = false;
        break;
      }
    }
    if (!allNormalsFit) continue;

    // Assign wilds to empty spots in windowNums
    const slots = [];
    let wildIdx = 0;
    let points = 0;

    for (const actualNum of windowNums) {
      points += actualNum;
      const realTile = normalByNumber.get(actualNum);
      if (realTile) {
        slots.push({
          tile: realTile,
          representsColor: targetColor,
          representsNumber: actualNum
        });
      } else {
        slots.push({
          tile: wilds[wildIdx].tile,
          representsColor: targetColor,
          representsNumber: actualNum
        });
        wildIdx += 1;
      }
    }

    if (wildIdx !== wilds.length) continue;

    if (!bestCandidate || points > bestCandidate.points) {
      bestCandidate = {
        valid: true,
        type: 'run',
        color: targetColor,
        start,
        points,
        slots
      };
    }
  }

  if (!bestCandidate) {
    return { valid: false, reason: 'Taşlar ardışık bir seri oluşturmuyor.' };
  }

  return bestCandidate;
}

export function validateGroup(tiles, okeyTarget) {
  const runRes = validateRun(tiles, okeyTarget);
  if (runRes.valid) return runRes;
  const setRes = validateSet(tiles, okeyTarget);
  if (setRes.valid) return setRes;
  return {
    valid: false,
    reason: 'Seçili taşlar geçerli bir per veya seri oluşturmuyor.'
  };
}

export function canLayoffTile(tile, targetMeld, okeyTarget) {
  if (!tile || !targetMeld || targetMeld.type === 'pair') {
    return { valid: false, reason: 'Bu gruba taş işlenemez.' };
  }

  const eff = effectiveTileProps(tile, okeyTarget);
  const existingTiles = targetMeld.slots.map((s) => s.tile);

  // Check if the player is swapping a real tile for an Okey joker on the table
  if (!eff.isWild) {
    const okeySlotIndex = targetMeld.slots.findIndex(
      (s) =>
        isOkeyTile(s.tile, okeyTarget) &&
        s.representsColor === eff.color &&
        s.representsNumber === eff.number
    );
    if (okeySlotIndex !== -1) {
      const updatedSlots = targetMeld.slots.map((s, idx) =>
        idx === okeySlotIndex
          ? {
              tile,
              representsColor: eff.color,
              representsNumber: eff.number
            }
          : s
      );
      return {
        valid: true,
        mode: 'swap_okey',
        swappedOkey: targetMeld.slots[okeySlotIndex].tile,
        updatedMeld: {
          ...targetMeld,
          slots: updatedSlots
        }
      };
    }
  }

  const candidateTiles = [...existingTiles, tile];
  const revalidated =
    targetMeld.type === 'set'
      ? validateSet(candidateTiles, okeyTarget)
      : validateRun(candidateTiles, okeyTarget);

  if (!revalidated.valid) {
    return { valid: false, reason: revalidated.reason || 'Bu taş seçili pere işlenemez.' };
  }

  return {
    valid: true,
    mode: 'append',
    swappedOkey: null,
    updatedMeld: {
      ...targetMeld,
      points: revalidated.points,
      slots: revalidated.slots
    }
  };
}

/**
 * Finds non-overlapping high-value melds in a hand for smart sorting or AI opening.
 */
export function findBestOpening(handTiles, okeyTarget, minPoints = 101, requiredTileId = null) {
  const orderedHand = requiredTileId
    ? [...handTiles].sort((a, b) => (a.id === requiredTileId ? -1 : b.id === requiredTileId ? 1 : 0))
    : handTiles;
  const wilds = orderedHand.filter((t) => isOkeyTile(t, okeyTarget));
  const normals = orderedHand.filter((t) => !isOkeyTile(t, okeyTarget));

  // Generate candidate pure melds (0 wilds first, then 1 wild)
  const candidates = [];

  // 1) Runs by color
  for (const color of COLORS) {
    const byNum = new Map();
    for (const t of normals) {
      const eff = effectiveTileProps(t, okeyTarget);
      if (eff.color === color) {
        if (!byNum.has(eff.number)) byNum.set(eff.number, []);
        byNum.get(eff.number).push(t);
      }
    }

    // Pure runs without wilds (stops at 13)
    for (let start = 1; start <= 11; start += 1) {
      const seq = [];
      for (let pos = start; pos <= 13; pos += 1) {
        const bucket = byNum.get(pos);
        if (!bucket || bucket.length === 0) break;
        seq.push(bucket[0]);
        if (seq.length >= 3) {
          const v = validateRun([...seq], okeyTarget);
          if (v.valid) candidates.push(v);
        }
      }
    }

    // Runs with 1 wild (stops at 13)
    if (wilds.length > 0) {
      for (const w of wilds) {
        for (let len = 3; len <= 7; len += 1) {
          for (let start = 1; start <= 14 - len; start += 1) {
            const picked = [];
            let misses = 0;
            for (let pos = start; pos < start + len; pos += 1) {
              const bucket = byNum.get(pos);
              if (bucket && bucket.length > 0) {
                picked.push(bucket[0]);
              } else {
                misses += 1;
              }
            }
            if (misses === 1 && picked.length >= 2) {
              const v = validateRun([...picked, w], okeyTarget);
              if (v.valid) candidates.push(v);
            }
          }
        }
      }
    }
  }

  // 2) Sets by number
  for (let num = 1; num <= 13; num += 1) {
    const byColor = new Map();
    for (const t of normals) {
      const eff = effectiveTileProps(t, okeyTarget);
      if (eff.number === num && !byColor.has(eff.color)) {
        byColor.set(eff.color, t);
      }
    }
    const distinct = [...byColor.values()];
    if (distinct.length >= 3) {
      const v = validateSet(distinct.slice(0, 3), okeyTarget);
      if (v.valid) candidates.push(v);
    }
    if (distinct.length === 4) {
      const v = validateSet(distinct, okeyTarget);
      if (v.valid) candidates.push(v);
    }
    if (distinct.length === 2 && wilds.length > 0) {
      const v = validateSet([...distinct, wilds[0]], okeyTarget);
      if (v.valid) candidates.push(v);
    }
  }

  // Sort candidates: when requiredTileId is set, place candidates containing it first, then by points descending
  candidates.sort((a, b) => {
    if (requiredTileId) {
      const aHas = a.slots.some((s) => s.tile.id === requiredTileId) ? 1 : 0;
      const bHas = b.slots.some((s) => s.tile.id === requiredTileId) ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;
    }
    return b.points - a.points || a.slots.length - b.slots.length;
  });

  // Greedy + simple swap backtracking over top candidates to maximize non-overlapping points
  let bestSolution = { groups: [], totalPoints: 0 };
  let bestWithRequired = { groups: [], totalPoints: 0 };

  function search(idx, usedIds, chosen, sum) {
    if (sum > bestSolution.totalPoints) {
      bestSolution = { groups: [...chosen], totalPoints: sum };
    }
    if (requiredTileId && usedIds.has(requiredTileId) && sum > bestWithRequired.totalPoints) {
      bestWithRequired = { groups: [...chosen], totalPoints: sum };
    }
    // Quick upper bound prune
    let possible = sum;
    for (let j = idx; j < Math.min(candidates.length, idx + 8); j += 1) {
      possible += candidates[j].points;
    }
    const floorScore = requiredTileId
      ? Math.min(bestSolution.totalPoints, bestWithRequired.totalPoints)
      : bestSolution.totalPoints;
    if (possible <= floorScore) return;

    for (let i = idx; i < candidates.length; i += 1) {
      const cand = candidates[i];
      const ids = cand.slots.map((s) => s.tile.id);
      if (ids.some((id) => usedIds.has(id))) continue;

      for (const id of ids) usedIds.add(id);
      chosen.push(cand);
      search(i + 1, usedIds, chosen, sum + cand.points);
      chosen.pop();
      for (const id of ids) usedIds.delete(id);

      // Keep branching tight for responsiveness
      if (chosen.length >= 6) break;
    }
  }

  search(0, new Set(), [], 0);

  if (requiredTileId) {
    return {
      canOpen: bestWithRequired.totalPoints >= minPoints && bestWithRequired.groups.length > 0,
      totalPoints: bestWithRequired.totalPoints,
      groups: bestWithRequired.groups,
      usesRequired: bestWithRequired.groups.length > 0,
      fallbackTotalPoints: bestSolution.totalPoints,
      fallbackGroups: bestSolution.groups
    };
  }

  return {
    canOpen: bestSolution.totalPoints >= minPoints,
    totalPoints: bestSolution.totalPoints,
    groups: bestSolution.groups,
    usesRequired: true
  };
}

export function findPairsInHand(handTiles, okeyTarget, requiredTileId = null, gosterge = null) {
  const orderedHand = requiredTileId
    ? [...handTiles].sort((a, b) => (a.id === requiredTileId ? -1 : b.id === requiredTileId ? 1 : 0))
    : handTiles;
  const wilds = orderedHand.filter((t) => isOkeyTile(t, okeyTarget));
  const normals = orderedHand.filter((t) => !isOkeyTile(t, okeyTarget));
  const buckets = new Map();

  for (const t of normals) {
    const eff = effectiveTileProps(t, okeyTarget);
    const key = `${eff.color}-${eff.number}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }

  const pairs = [];
  const singles = [];

  for (const list of buckets.values()) {
    if (list.length >= 2) {
      pairs.push([list[0], list[1]]);
    } else if (gosterge && isGostergeTile(list[0], gosterge)) {
      pairs.push([list[0]]);
    } else {
      singles.push(list[0]);
    }
  }

  // Pair remaining singles with wilds if any (prioritize requiredTileId first, then highest number)
  const sortedSingles = [...singles].sort((a, b) => {
    if (requiredTileId) {
      if (a.id === requiredTileId) return -1;
      if (b.id === requiredTileId) return 1;
    }
    return effectiveTileProps(b, okeyTarget).number - effectiveTileProps(a, okeyTarget).number;
  });

  let wIdx = 0;
  while (wIdx < wilds.length && sortedSingles.length > 0) {
    const single = sortedSingles.shift();
    pairs.push([single, wilds[wIdx]]);
    wIdx += 1;
  }

  if (wilds.length - wIdx >= 2) {
    pairs.push([wilds[wIdx], wilds[wIdx + 1]]);
  }

  return pairs;
}

export function layoutGroupsOnRack(groups, rest, cols = 14, rows = 2) {
  const totalSlots = cols * rows;
  const slots = new Array(totalSlots).fill(null);

  let row = 0;
  let col = 0;
  const unplaced = [];

  for (const group of groups) {
    if (!group || group.length === 0) continue;
    const len = group.length;

    if (col > 0 && col + 1 + len <= cols) {
      col += 1; // 1-slot gap between adjacent groups
    } else if (col > 0 && row + 1 < rows) {
      row += 1;
      col = 0;
    }

    if (row < rows && col + len <= cols) {
      const base = row * cols + col;
      for (let i = 0; i < len; i += 1) {
        slots[base + i] = group[i];
      }
      col += len;
    } else {
      unplaced.push(...group);
    }
  }

  const remaining = [...unplaced, ...rest];
  if (remaining.length > 0) {
    // If all formed groups fit on upper rows and leftovers fit on the next row, start leftovers on a fresh row
    if (row + 1 < rows && col > 0 && remaining.length <= (rows - 1 - row) * cols) {
      row += 1;
      col = 0;
    } else if (col > 0) {
      const curIdx = row * cols + col;
      if (totalSlots - (curIdx + 1) >= remaining.length) {
        if (col + 1 < cols) {
          col += 1;
        } else if (row + 1 < rows) {
          row += 1;
          col = 0;
        }
      }
    }

    let cursor = row * cols + col;
    while (remaining.length > 0 && cursor < totalSlots) {
      if (slots[cursor] === null) {
        slots[cursor] = remaining.shift();
      }
      cursor += 1;
    }

    // Safety fallback: if any tiles still remain, pack into any remaining empty slots
    for (let i = totalSlots - 1; i >= 0 && remaining.length > 0; i -= 1) {
      if (slots[i] === null) {
        slots[i] = remaining.pop();
      }
    }
  }

  return slots;
}

export function autoArrangeRuns(handTiles, okeyTarget) {
  const result = findBestOpening(handTiles, okeyTarget, 0);
  const usedIds = new Set();
  const groupTilesList = [];

  for (const group of result.groups) {
    const tiles = [];
    for (const slot of group.slots) {
      if (!usedIds.has(slot.tile.id)) {
        usedIds.add(slot.tile.id);
        tiles.push(slot.tile);
      }
    }
    if (tiles.length > 0) {
      groupTilesList.push(tiles);
    }
  }

  const rest = handTiles
    .filter((t) => !usedIds.has(t.id))
    .sort((a, b) => {
      const pa = effectiveTileProps(a, okeyTarget);
      const pb = effectiveTileProps(b, okeyTarget);
      if (pa.isWild !== pb.isWild) return pa.isWild ? -1 : 1;
      const colorDiff = COLORS.indexOf(pa.color) - COLORS.indexOf(pb.color);
      if (colorDiff !== 0) return colorDiff;
      return pa.number - pb.number;
    });

  return layoutGroupsOnRack(groupTilesList, rest);
}

export function autoArrangePairs(handTiles, okeyTarget, gosterge = null) {
  const pairs = findPairsInHand(handTiles, okeyTarget, null, gosterge);
  const usedIds = new Set();
  const pairTilesList = [];

  for (const pair of pairs) {
    const tiles = [];
    for (const t of pair) {
      if (!usedIds.has(t.id)) {
        usedIds.add(t.id);
        tiles.push(t);
      }
    }
    if (tiles.length > 0) {
      pairTilesList.push(tiles);
    }
  }

  const rest = handTiles
    .filter((t) => !usedIds.has(t.id))
    .sort((a, b) => {
      const pa = effectiveTileProps(a, okeyTarget);
      const pb = effectiveTileProps(b, okeyTarget);
      if (pa.number !== pb.number) return pa.number - pb.number;
      return COLORS.indexOf(pa.color) - COLORS.indexOf(pb.color);
    });

  return layoutGroupsOnRack(pairTilesList, rest);
}

/**
 * Automatically evaluates both valid Seri/Per (Tek) points and valid Çift (Pair) count
 * from the current rack slot layout (respecting manual gaps) as well as optimal full-hand combinations.
 */
export function analyzeHandLive(rackSlots, handTiles, okeyTarget, cols = 14, requiredTileId = null, gosterge = null) {
  const safeHand = Array.isArray(handTiles) ? handTiles : [];
  const rackSeriesGroups = [];
  const rackPairGroups = [];
  let rackSeriesPoints = 0;

  if (Array.isArray(rackSlots) && rackSlots.length > 0) {
    const handIds = new Set(safeHand.map((t) => t.id));
    const segments = [];
    const total = rackSlots.length;
    const rows = Math.ceil(total / cols);

    for (let r = 0; r < rows; r += 1) {
      let current = [];
      for (let c = 0; c < cols; c += 1) {
        const idx = r * cols + c;
        const tile = idx < total ? rackSlots[idx] : null;
        if (tile && handIds.has(tile.id)) {
          current.push(tile);
        } else if (current.length > 0) {
          segments.push(current);
          current = [];
        }
      }
      if (current.length > 0) segments.push(current);
    }

    const usedSeriesIds = new Set();
    const usedPairIds = new Set();

    for (const seg of segments) {
      if (seg.length >= 3 && !seg.some((t) => usedSeriesIds.has(t.id))) {
        const res = validateGroup(seg, okeyTarget);
        if (res.valid) {
          seg.forEach((t) => usedSeriesIds.add(t.id));
          rackSeriesPoints += res.points;
          rackSeriesGroups.push({
            type: res.type,
            points: res.points,
            tiles: res.slots.map((s) => s.tile)
          });
        }
      }
      if (
        (seg.length === 2 || (seg.length === 1 && gosterge && isGostergeTile(seg[0], gosterge))) &&
        !seg.some((t) => usedPairIds.has(t.id))
      ) {
        const pRes = validatePair(seg, okeyTarget, gosterge);
        if (pRes.valid) {
          seg.forEach((t) => usedPairIds.add(t.id));
          rackPairGroups.push({
            points: pRes.points,
            tiles: [...seg]
          });
        }
      }
    }
  }

  const bestSeries = findBestOpening(safeHand, okeyTarget, 0, requiredTileId);
  const rackSeriesUsesReq =
    !requiredTileId ||
    rackSeriesGroups.some((g) => g.tiles.some((t) => t.id === requiredTileId));

  let useRackSeries = false;
  if (requiredTileId) {
    if (rackSeriesGroups.length > 0 && rackSeriesUsesReq) {
      useRackSeries = !bestSeries.usesRequired || rackSeriesPoints >= bestSeries.totalPoints;
    } else if (!bestSeries.usesRequired) {
      useRackSeries =
        rackSeriesGroups.length > 0 &&
        rackSeriesPoints >= (bestSeries.fallbackTotalPoints ?? bestSeries.totalPoints);
    }
  } else {
    useRackSeries = rackSeriesGroups.length > 0 && rackSeriesPoints >= bestSeries.totalPoints;
  }

  const fallbackList = bestSeries.fallbackGroups || bestSeries.groups;
  const chosenSolverGroups =
    requiredTileId && !bestSeries.usesRequired ? fallbackList : bestSeries.groups;
  const chosenSolverPoints =
    requiredTileId && !bestSeries.usesRequired
      ? (bestSeries.fallbackTotalPoints ?? bestSeries.totalPoints)
      : bestSeries.totalPoints;

  const seriesGroups = useRackSeries
    ? rackSeriesGroups
    : chosenSolverGroups.map((g) => ({
        type: g.type,
        points: g.points,
        tiles: g.slots.map((s) => s.tile)
      }));
  const seriesPoints = useRackSeries ? rackSeriesPoints : chosenSolverPoints;
  const seriesUsesRequired =
    !requiredTileId ||
    seriesGroups.some((g) => g.tiles.some((t) => t.id === requiredTileId));

  const autoPairs = findPairsInHand(safeHand, okeyTarget, requiredTileId, gosterge);
  const rackPairsUsesReq =
    !requiredTileId ||
    rackPairGroups.some((g) => g.tiles.some((t) => t.id === requiredTileId));
  const autoPairsUsesReq =
    !requiredTileId ||
    autoPairs.some((pair) => pair.some((t) => t.id === requiredTileId));

  let useRackPairs = false;
  if (requiredTileId) {
    if (rackPairGroups.length > 0 && rackPairsUsesReq) {
      useRackPairs = !autoPairsUsesReq || rackPairGroups.length >= autoPairs.length;
    } else if (!autoPairsUsesReq) {
      useRackPairs = rackPairGroups.length > 0 && rackPairGroups.length >= autoPairs.length;
    }
  } else {
    useRackPairs = rackPairGroups.length > 0 && rackPairGroups.length >= autoPairs.length;
  }

  const pairGroups = useRackPairs
    ? rackPairGroups
    : autoPairs.map((pair) => ({
        points: validatePair(pair, okeyTarget, gosterge).points,
        tiles: pair
      }));
  const pairsUsesRequired =
    !requiredTileId ||
    pairGroups.some((g) => g.tiles.some((t) => t.id === requiredTileId));

  return {
    seriesPoints,
    seriesGroups,
    seriesUsesRequired,
    pairCount: pairGroups.length,
    pairGroups,
    pairsUsesRequired
  };
}

