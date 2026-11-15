export type AssetKind = 'model' | 'texture' | 'hdri';

export interface AssetEntry {
  id: string;
  kind: AssetKind;
  source: 'polyhaven' | 'local';
  /** Local assets: path relative to the assets root. */
  path?: string;
  /** Loaded after the first render. */
  deferred?: boolean;
}

const model = (id: string, deferred = false): AssetEntry => ({ id, kind: 'model', source: 'polyhaven', deferred });
const texture = (id: string): AssetEntry => ({ id, kind: 'texture', source: 'polyhaven' });

export const MANIFEST: AssetEntry[] = [
  model('sofa_03'),
  model('sofa_02', true),
  model('barrel_stove'),
  model('Rockingchair_01', true),
  model('round_wooden_table_01'),
  model('painted_wooden_chair_01'),
  model('coffee_table_round_01', true),
  model('television_02'),
  model('tea_set_01', true),
  model('throw_pillows_01', true),
  model('wooden_bookshelf_worn', true),
  model('potted_plant_02', true),
  model('vintage_oil_lamp', true),
  model('mantel_clock_01', true),
  model('lantern_chandelier_01'),
  model('drawer_cabinet', true),
  model('wicker_basket_01', true),
  model('hanging_picture_frame_01', true),
  model('wooden_stool_01', true),
  texture('brown_planks_07'),
  texture('clay_plaster'),
  texture('beam_wall_01'),
  texture('wooden_rough_planks'),
  { id: 'snowy_forest', kind: 'hdri', source: 'polyhaven' },
  { id: 'kilim', kind: 'texture', source: 'local', path: 'rug/kilim_2k.jpg' }
];
