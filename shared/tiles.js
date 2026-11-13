export const COLORS = ['red', 'blue', 'black', 'yellow'];

export const COLOR_LABELS = {
  red: 'Kırmızı',
  blue: 'Mavi',
  black: 'Siyah',
  yellow: 'Sarı'
};

export function computeOkeyTarget(gosterge) {
  if (!gosterge || gosterge.isFakeOkey) {
    return { color: 'red', number: 1 };
  }
  return {
    color: gosterge.color,
    number: (gosterge.number % 13) + 1
  };
}

export function createDeck() {
  const deck = [];
  let idCounter = 1;

  for (let copy = 0; copy < 2; copy += 1) {
    for (const color of COLORS) {
      for (let number = 1; number <= 13; number += 1) {
        deck.push({
          id: `t-${idCounter++}`,
          color,
          number,
          copy,
          isFakeOkey: false
        });
      }
    }
  }

  for (let copy = 0; copy < 2; copy += 1) {
    deck.push({
      id: `t-${idCounter++}`,
      color: 'fake',
      number: 0,
      copy,
      isFakeOkey: true
    });
  }

  return deck;
}

export function shuffleDeck(deck, rng = Math.random) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function isOkeyTile(tile, okeyTarget) {
  if (!tile || !okeyTarget || tile.isFakeOkey) return false;
  return tile.color === okeyTarget.color && tile.number === okeyTarget.number;
}

export function isGostergeTile(tile, gosterge) {
  if (!tile || !gosterge || tile.isFakeOkey || gosterge.isFakeOkey) return false;
  return tile.color === gosterge.color && tile.number === gosterge.number;
}

export function effectiveTileProps(tile, okeyTarget) {
  if (!tile) return null;
  if (tile.isFakeOkey) {
    return {
      color: okeyTarget.color,
      number: okeyTarget.number,
      isWild: false,
      isFakeOkey: true
    };
  }
  if (isOkeyTile(tile, okeyTarget)) {
    return {
      color: tile.color,
      number: tile.number,
      isWild: true,
      isFakeOkey: false
    };
  }
  return {
    color: tile.color,
    number: tile.number,
    isWild: false,
    isFakeOkey: false
  };
}

export function tileHandPenaltyValue(tile, okeyTarget) {
  if (!tile) return 0;
  if (isOkeyTile(tile, okeyTarget)) return 101;
  if (tile.isFakeOkey) return okeyTarget.number;
  return tile.number;
}

export function formatTileLabel(tile) {
  if (!tile) return '';
  if (tile.isFakeOkey) return 'Sahte Okey';
  return `${COLOR_LABELS[tile.color] ?? tile.color} ${tile.number}`;
}
