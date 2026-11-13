export const KAHVE_MENU = [
  {
    id: 'cay',
    label: 'Tavşan Kanı Çay',
    shortLabel: 'Çay',
    category: 'drink',
    desc: 'İnce belli bardakta taze demlenmiş Rize çayı'
  },
  {
    id: 'oralet',
    label: 'Portakallı Oralet',
    shortLabel: 'Oralet',
    category: 'drink',
    desc: 'Sıcacık klasik kahvehane oraleti'
  },
  {
    id: 'kahve',
    label: 'Türk Kahvesi',
    shortLabel: 'Kahve',
    category: 'drink',
    desc: 'Orta şekerli, bol köpüklü, lokum ikramlı'
  },
  {
    id: 'gazoz',
    label: 'Nostaljik Gazoz',
    shortLabel: 'Gazoz',
    category: 'drink',
    desc: 'Soğuk cam şişe kahve gazozu'
  },
  {
    id: 'tost',
    label: 'Kaşarlı Tost',
    shortLabel: 'Tost',
    category: 'food',
    desc: 'Çıtır ekmek arasında erimiş kaşar ve domates'
  },
  {
    id: 'simit',
    label: 'Simit & Peynir',
    shortLabel: 'Simit',
    category: 'food',
    desc: 'Susamlı çıtır simit ve beyaz peynir'
  },
  {
    id: 'baklava',
    label: 'Fıstıklı Baklava',
    shortLabel: 'Baklava',
    category: 'food',
    desc: 'İki dilim çıtır Antep fıstıklı baklava'
  },
  {
    id: 'cerez',
    label: 'Karışık Çerez',
    shortLabel: 'Çerez',
    category: 'food',
    desc: 'Kavrulmuş fıstık, leblebi ve fındık kasesi'
  }
];

export const KAHVE_MENU_MAP = new Map(KAHVE_MENU.map((item) => [item.id, item]));

export function createEmptyOrders() {
  return [
    { drink: null, food: null },
    { drink: null, food: null },
    { drink: null, food: null },
    { drink: null, food: null }
  ];
}
