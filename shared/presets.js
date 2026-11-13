export const PRESET_AVATAR_COUNT = 16;

export const BOT_NAME_POOL = Object.freeze([
  'Serhat',
  'Arhan',
  'Hasan',
  'Eray',
  'Arda Baz',
  'Kubilay',
  'Samet',
  'Gay Durukan',
  'Emir Yılmaz',
  'Emre Mencik',
  'Zeynep'
]);

export function isPresetAvatar(val) {
  const s = String(val || '').trim();
  const match = /^avatar-(\d+)$/.exec(s);
  if (!match) return false;
  const num = Number(match[1]);
  return Number.isInteger(num) && num >= 1 && num <= PRESET_AVATAR_COUNT;
}

export function normalizePresetAvatar(val, fallbackIdx = 0) {
  const s = String(val || '').trim();
  if (isPresetAvatar(s)) return s;
  return `avatar-${(fallbackIdx % PRESET_AVATAR_COUNT) + 1}`;
}

export function pickRandomBotName(excludeNames = [], rng = Math.random) {
  const taken = new Set(
    excludeNames
      .filter(Boolean)
      .map((name) => String(name).trim().toLocaleLowerCase('tr-TR'))
  );
  const available = BOT_NAME_POOL.filter(
    (name) => !taken.has(name.toLocaleLowerCase('tr-TR'))
  );
  const candidates = available.length > 0 ? available : BOT_NAME_POOL;
  const idx = Math.floor(rng() * candidates.length) % candidates.length;
  return candidates[idx];
}

export function pickRandomBotAvatar(excludeAvatars = [], rng = Math.random) {
  const taken = new Set(excludeAvatars.filter(Boolean).map((a) => String(a).trim()));
  const all = [];
  for (let i = 1; i <= PRESET_AVATAR_COUNT; i += 1) {
    all.push(`avatar-${i}`);
  }
  const available = all.filter((id) => !taken.has(id));
  const candidates = available.length > 0 ? available : all;
  const idx = Math.floor(rng() * candidates.length) % candidates.length;
  return candidates[idx];
}

export const KAHVE_QUICK_CHATS = Object.freeze([
  { id: 'play', label: 'Hadi oyna!', text: 'Hadi oyna!' },
  { id: 'tea', label: 'Çaylar benden', text: 'Çaylar benden!' },
  { id: 'opened', label: 'El açtık hayırlısı', text: 'El açtık hayırlısı!' },
  { id: 'okey', label: 'Okey mi geldi?', text: 'Okey mi geldi yoksa?' },
  { id: 'gg', label: 'Eline sağlık', text: 'Eline sağlık!' }
]);

export const TABLE_THEMES = Object.freeze([
  { id: 'green', label: 'Yeşil Çuha', color: '#1D5E43' },
  { id: 'burgundy', label: 'Bordo Kadife', color: '#6E2030' },
  { id: 'navy', label: 'Gece Laciverti', color: '#203C61' }
]);

export const ROOM_ATMOSPHERES = Object.freeze([
  { id: 'rainy', label: 'Yağmurlu Gece', desc: 'Camda yağmur ve sıcak sokak lambası ışığı' },
  { id: 'afternoon', label: 'Akşamüstü Altın Saat', desc: 'Pencereden süzülen sıcak ikindi güneşi' },
  { id: 'midnight', label: 'Gece Yarısı Ev Modu', desc: 'Yıldızlı gece ve kuzine şömine ışıltısı' }
]);

export const ROOM_AMBIANCES = Object.freeze([
  { id: 'rain', label: 'Dışarıda Yağmur', desc: 'Cama vuran hafif yağmur sesi' },
  { id: 'ocakbasi', label: 'Ocakbaşı & Çay Kazanı', desc: 'Demlenen çay kazanı fısıltısı' },
  { id: 'fireplace', label: 'Kuzine / Şömine', desc: 'Sıcacık odun çıtırtısı' },
  { id: 'none', label: 'Sessiz', desc: 'Yalnızca oyun sesleri' }
]);

export const RACK_THEMES = Object.freeze([
  { id: 'walnut', label: 'Koyu Ceviz', color: '#704426', rackColor: '#A97852' },
  { id: 'oak', label: 'Açık Meşe', color: '#C6955C', rackColor: '#E5BD8A' },
  { id: 'mahogany', label: 'Sıcak Maun', color: '#6E291D', rackColor: '#B25A44' }
]);

export const TILE_THEMES = Object.freeze([
  { id: 'ivory', label: 'Klasik Krem', top: '#FCF8EE', bottom: '#EFE6D1', border: '#DDD2BC', side: '#EAE1CE' },
  { id: 'pearl', label: 'Sedefli Beyaz', top: '#FFFFFF', bottom: '#EDF0F5', border: '#CFD6E0', side: '#ECEFF4' },
  { id: 'bone', label: 'Eskitme Kemik', top: '#F7EBD2', bottom: '#DFCAA3', border: '#C7AE80', side: '#DFCCA8' }
]);

export const TV_CHANNELS = Object.freeze([
  { id: 'trt1', label: 'TRT 1 Canlı', query: 'TRT 1 Canlı Yayın', title: 'TRT 1 Canlı' },
  { id: 'trthaber', label: 'TRT Haber Canlı', query: 'TRT Haber Canlı Yayın', title: 'TRT Haber Canlı' },
  { id: 'trtspor', label: 'TRT Spor Canlı', query: 'TRT Spor Canlı Yayın', title: 'TRT Spor Canlı' },
  { id: 'ntv', label: 'NTV Canlı', query: 'NTV Canlı Yayın', title: 'NTV Canlı' },
  { id: 'haberturk', label: 'Habertürk Canlı', query: 'Habertürk TV Canlı Yayın', title: 'Habertürk Canlı' },
  { id: 'yesilcam', label: 'Yeşilçam Sineması', query: 'Kemal Sunal Full Film Yeşilçam', title: 'Yeşilçam Sineması' },
  { id: 'fireplace4k', label: 'Şömine & Yağmur 4K', query: 'Cozy Fireplace 4K Crackling Fire Rain', title: 'Şömine & Yağmur TV' }
]);

export const KAHVE_CATS = Object.freeze([
  {
    index: 0,
    id: 'cat-1',
    name: 'Yumak',
    breed: 'Krem İran Kedisi',
    spot: 'Sol köşe minderi',
    photo: '/assets/cat-1.jpg',
    furColor: '#DDD4C6',
    accentColor: '#9E8D7B',
    eyeColor: '#4F778D',
    reaction: 'mırıldanarak kafasını eline yasladı!'
  },
  {
    index: 1,
    id: 'cat-2',
    name: 'Fırtına',
    breed: 'Tekir Yavru',
    spot: 'Sağ köşe minderi',
    photo: '/assets/cat-2.jpg',
    furColor: '#8B7968',
    accentColor: '#3C322A',
    eyeColor: '#B57B32',
    reaction: 'patisini uzatıp neşeyle miyavladı!'
  },
  {
    index: 2,
    id: 'cat-3',
    name: 'Kömür',
    breed: 'Siyah İran Kedisi',
    spot: 'Ocakbaşı köşesi',
    photo: '/assets/cat-3.jpg',
    furColor: '#1E1B1C',
    accentColor: '#352E30',
    eyeColor: '#E5B822',
    reaction: 'altın gözlerini kısarak gürül gürül mırladı!'
  }
]);

export function normalizeRoomAtmosphere(val) {
  const id = String(val || '').trim();
  return ROOM_ATMOSPHERES.some((a) => a.id === id) ? id : 'rainy';
}

export function normalizeRoomAmbiance(val) {
  const id = String(val || '').trim();
  return ROOM_AMBIANCES.some((a) => a.id === id) ? id : 'rain';
}

export function createEmptySocialStats() {
  return [0, 1, 2, 3].map(() => ({
    treatsOrdered: 0,
    sipsTaken: 0,
    catsPetted: 0
  }));
}

export function computeKahveAwards({ seats = [], socialStats = [], teamMode = 'solo' } = {}) {
  if (!Array.isArray(seats) || seats.length === 0) {
    return null;
  }

  const combined = seats.map((seat, idx) => {
    const s = seat || {};
    const m = s.matchStats || {};
    const soc = socialStats[idx] || {};
    return {
      seatIndex: s.seatIndex ?? idx,
      name: s.name || `Oyuncu ${idx + 1}`,
      teamIndex: s.teamIndex ?? (idx % 2),
      totalScore: Number(s.totalScore || 0),
      eldenFinishes: Number(m.eldenFinishes || 0),
      okeyFinishes: Number(m.okeyFinishes || 0),
      pairsOpens: Number(m.pairsOpens || 0),
      islekCount: Number(m.islekCount || 0),
      treatsOrdered: Number(soc.treatsOrdered || 0),
      sipsTaken: Number(soc.sipsTaken || 0),
      catsPetted: Number(soc.catsPetted || 0)
    };
  });

  const sortedByScoreAsc = [...combined].sort((a, b) => a.totalScore - b.totalScore || a.seatIndex - b.seatIndex);
  const sortedByScoreDesc = [...combined].sort((a, b) => b.totalScore - a.totalScore || a.seatIndex - b.seatIndex);

  const winner = sortedByScoreAsc[0];
  const payer = sortedByScoreDesc[0];

  let teamWinnerName = null;
  let teamPayerName = null;
  if (teamMode === 'paired' && combined.length >= 4) {
    const t0 = combined[0].totalScore + combined[2].totalScore;
    const t1 = combined[1].totalScore + combined[3].totalScore;
    if (t0 !== t1) {
      teamWinnerName = t0 < t1 ? '1. Takım' : '2. Takım';
      teamPayerName = t0 > t1 ? '1. Takım' : '2. Takım';
    }
  }

  const awards = [];
  if (winner) {
    awards.push({
      seatIndex: winner.seatIndex,
      name: teamWinnerName ? `${winner.name} (${teamWinnerName})` : winner.name,
      badge: 'Masanın Ağası',
      detail: `${winner.totalScore} puanla lider`
    });
  }

  const topElden = [...combined].sort(
    (a, b) => (b.eldenFinishes * 2 + b.okeyFinishes) - (a.eldenFinishes * 2 + a.okeyFinishes)
  )[0];
  if (topElden && topElden.eldenFinishes + topElden.okeyFinishes > 0) {
    awards.push({
      seatIndex: topElden.seatIndex,
      name: topElden.name,
      badge: 'El Ustası',
      detail: `${topElden.eldenFinishes} elden · ${topElden.okeyFinishes} okeyle bitiş`
    });
  }

  const topPairs = [...combined].sort((a, b) => b.pairsOpens - a.pairsOpens)[0];
  if (topPairs && topPairs.pairsOpens > 0) {
    awards.push({
      seatIndex: topPairs.seatIndex,
      name: topPairs.name,
      badge: 'Çift Avcısı',
      detail: `${topPairs.pairsOpens} kez çifte açtı`
    });
  }

  const topTreat = [...combined].sort((a, b) => b.treatsOrdered - a.treatsOrdered)[0];
  if (topTreat && topTreat.treatsOrdered > 0) {
    awards.push({
      seatIndex: topTreat.seatIndex,
      name: topTreat.name,
      badge: 'Gönlü Bol',
      detail: `${topTreat.treatsOrdered} ikram söyledi`
    });
  }

  const topSip = [...combined].sort((a, b) => b.sipsTaken - a.sipsTaken)[0];
  if (topSip && topSip.sipsTaken > 0) {
    awards.push({
      seatIndex: topSip.seatIndex,
      name: topSip.name,
      badge: 'Çay Tiriyakisi',
      detail: `${topSip.sipsTaken} yudum keyif`
    });
  }

  const topCat = [...combined].sort((a, b) => b.catsPetted - a.catsPetted)[0];
  if (topCat && topCat.catsPetted > 0) {
    awards.push({
      seatIndex: topCat.seatIndex,
      name: topCat.name,
      badge: 'Kedi Dostu',
      detail: `${topCat.catsPetted} kez kedi sevdi`
    });
  }

  const totalTreats = combined.reduce((s, r) => s + r.treatsOrdered, 0);
  const totalSips = combined.reduce((s, r) => s + r.sipsTaken, 0);
  const totalCats = combined.reduce((s, r) => s + r.catsPetted, 0);

  const billItems = [
    { label: 'Kahvehane Masa & Çuha Kuveri', qty: '1 masa', amount: 80 }
  ];
  if (totalTreats > 0) {
    billItems.push({ label: 'Ocakbaşı Çay & İkram Servisi', qty: `${totalTreats} adet`, amount: totalTreats * 25 });
  }
  if (totalSips > 0) {
    billItems.push({ label: 'Taze Demlenen Bardak Yudumu', qty: `${totalSips} yudum`, amount: totalSips * 5 });
  }
  if (totalCats > 0) {
    billItems.push({ label: 'Yumak, Fırtına & Kömür Ödül Maması', qty: `${totalCats} sevgi`, amount: 0 });
  }

  const billTotal = billItems.reduce((sum, item) => sum + item.amount, 0);
  const payerDisplay = teamPayerName || payer?.name || 'Misafir';

  return {
    winnerSeat: winner?.seatIndex ?? 0,
    winnerName: winner?.name || 'Oyuncu',
    payerSeat: payer?.seatIndex ?? 0,
    payerName: payerDisplay,
    awards,
    billItems,
    billTotal,
    receiptFooter: `Bugünün Çay & Tost Hesabı (${billTotal} TL) ${payerDisplay}'e yazıldı!`
  };
}
