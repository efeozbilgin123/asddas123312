/** Static description of the salon. Meters; origin at floor center; back wall at -z, entrance at +z. */

export const ROOM = { width: 16, depth: 12, height: 3.2 } as const;

export interface Box2 { minX: number; minZ: number; maxX: number; maxZ: number }
export type Vec3 = [number, number, number];

export interface Placement {
  id: string;
  asset: string;
  pos: Vec3;
  rotY: number;
  scale?: number;
  collider?: Box2;
}

export interface Seat {
  id: string;
  pos: Vec3;
  /** Yaw the seated avatar faces (+z rotated by facingY). */
  facingY: number;
  kind: 'sofa' | 'chair' | 'stool' | 'rocking';
}

/** Sitting surface per seat kind: height, and how far forward of the seat point the hips rest (meters). */
export const SEAT_POSE: Record<Seat['kind'], { height: number; forward: number }> = {
  sofa: { height: 0.6, forward: 0.2 },
  chair: { height: 0.47, forward: -0.05 },
  stool: { height: 0.45, forward: 0 },
  rocking: { height: 0.56, forward: 0.02 }
};

export interface CatSpot { id: string; pos: Vec3; kind: 'sleep' | 'sit' | 'wander' }

export const box = (x: number, z: number, hx: number, hz: number): Box2 => ({
  minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz
});

/** Collider for an object whose local half-extents are (hx, hz), rotated by a multiple of 90°. */
function rotBox(x: number, z: number, hx: number, hz: number, rotY: number): Box2 {
  const quarter = Math.round(rotY / (Math.PI / 2)) % 2 !== 0;
  return quarter ? box(x, z, hz, hx) : box(x, z, hx, hz);
}

const PI = Math.PI;
const placements: Placement[] = [];
const seats: Seat[] = [];

function place(p: Placement): void {
  placements.push(p);
}

// ---- Oturma köşesi (back-left) ----
place({ id: 'stove', asset: 'barrel_stove', pos: [-7.2, 0, -5.2], rotY: PI / 4, collider: box(-7.2, -5.2, 0.42, 0.42) });
place({ id: 'basket', asset: 'wicker_basket_01', pos: [-7.45, 0, -4.25], rotY: 0.3, collider: box(-7.45, -4.25, 0.22, 0.2) });
place({ id: 'sofa', asset: 'sofa_03', pos: [-4.4, 0, -2.3], rotY: PI, collider: box(-4.4, -2.3, 1.38, 0.47) });
place({ id: 'pillows', asset: 'throw_pillows_01', pos: [-4.4, 0.42, -2.25], rotY: PI });
place({ id: 'coffee-table', asset: 'coffee_table_round_01', pos: [-4.4, 0, -3.95], rotY: 0, scale: 0.6, collider: box(-4.4, -3.95, 0.4, 0.4) });
place({ id: 'tea-set', asset: 'tea_set_01', pos: [-4.4, 0.295, -3.95], rotY: 0.4, scale: 0.6 });
place({ id: 'tv-stool', asset: 'wooden_stool_01', pos: [-4.4, 0, -5.35], rotY: 0, scale: 1.25, collider: box(-4.4, -5.35, 0.28, 0.28) });
place({ id: 'tv', asset: 'television_02', pos: [-4.4, 0.55, -5.35], rotY: 0, scale: 1.7 });
place({ id: 'rocking-chair', asset: 'Rockingchair_01', pos: [-6.6, 0, -3.2], rotY: 2.6, collider: box(-6.6, -3.2, 0.42, 0.42) });
place({ id: 'side-sofa', asset: 'sofa_02', pos: [-7.45, 0, -0.9], rotY: PI / 2, collider: rotBox(-7.45, -0.9, 0.92, 0.5, PI / 2) });
place({ id: 'lamp-stool', asset: 'wooden_stool_01', pos: [-3.3, 0, -1.5], rotY: 0.2, collider: box(-3.3, -1.5, 0.24, 0.24) });
place({ id: 'oil-lamp', asset: 'vintage_oil_lamp', pos: [-3.3, 0.44, -1.5], rotY: 0 });

seats.push({ id: 'sofa-l', pos: [-5.0, 0, -2.3], facingY: PI, kind: 'sofa' });
seats.push({ id: 'sofa-r', pos: [-3.8, 0, -2.3], facingY: PI, kind: 'sofa' });
seats.push({ id: 'rocking', pos: [-6.6, 0, -3.2], facingY: 2.6, kind: 'rocking' });
seats.push({ id: 'side-sofa-a', pos: [-7.45, 0, -1.35], facingY: PI / 2, kind: 'sofa' });
seats.push({ id: 'side-sofa-b', pos: [-7.45, 0, -0.45], facingY: PI / 2, kind: 'sofa' });

// ---- Oyun masaları (4 tables × 4 chairs) ----
export const GAME_TABLES: { id: string; x: number; z: number }[] = [
  { id: 'masa-1', x: -0.8, z: -3.2 },
  { id: 'masa-2', x: 3.6, z: -3.2 },
  { id: 'masa-3', x: -0.8, z: 1.4 },
  { id: 'masa-4', x: 3.6, z: 1.4 }
];
const TABLE_SCALE = 0.76;
const CHAIR_RADIUS = 0.95;
for (const t of GAME_TABLES) {
  place({ id: t.id, asset: 'round_wooden_table_01', pos: [t.x, 0, t.z], rotY: 0, scale: TABLE_SCALE, collider: box(t.x, t.z, 0.5, 0.5) });
  for (let k = 0; k < 4; k++) {
    const ang = (k * PI) / 2; // chair positions around the table
    const cx = t.x + Math.sin(ang) * CHAIR_RADIUS;
    const cz = t.z + Math.cos(ang) * CHAIR_RADIUS;
    const face = ang + PI; // looks toward the table center
    const id = `${t.id}-sandalye-${k + 1}`;
    place({ id, asset: 'painted_wooden_chair_01', pos: [cx, 0, cz], rotY: face, collider: box(cx, cz, 0.24, 0.24) });
    seats.push({ id, pos: [cx, 0, cz], facingY: face, kind: 'chair' });
  }
}

// ---- Mutfak / raf köşesi (back-right) ----
place({ id: 'cabinet', asset: 'drawer_cabinet', pos: [6.6, 0, -5.7], rotY: 0, collider: box(6.6, -5.7, 0.58, 0.27) });
place({ id: 'clock', asset: 'mantel_clock_01', pos: [6.6, 1.88, -5.7], rotY: 0 });
place({ id: 'bookshelf', asset: 'wooden_bookshelf_worn', pos: [7.6, 0, -3.2], rotY: -PI / 2, collider: rotBox(7.6, -3.2, 0.7, 0.3, -PI / 2) });
place({ id: 'plant', asset: 'potted_plant_02', pos: [7.4, 0, -4.75], rotY: -0.6, collider: box(7.4, -4.75, 0.35, 0.35) });
place({ id: 'corner-stool', asset: 'wooden_stool_01', pos: [5.4, 0, -5.4], rotY: 0.5, collider: box(5.4, -5.4, 0.24, 0.24) });
seats.push({ id: 'corner-stool', pos: [5.4, 0, -5.4], facingY: 0, kind: 'stool' });

// ---- Kahvehane eşyaları ----
// bookshelf (right wall, faces −x): books on its shelves, a vase on top
for (const [i, y] of [0.45, 0.93, 1.42].entries()) {
  place({ id: `books-${i + 1}`, asset: 'book_encyclopedia_set_01', pos: [7.55, y, -3.5 + i * 0.12], rotY: -PI / 2 });
}
place({ id: 'shelf-vase', asset: 'ceramic_vase_02', pos: [7.6, 2.06, -2.75], rotY: 0.3 });
// cabinet top
place({ id: 'cabinet-pot', asset: 'brass_pot_01', pos: [6.2, 1.88, -5.7], rotY: 0.4 });
place({ id: 'cabinet-jug', asset: 'jug_01', pos: [7.0, 1.88, -5.7], rotY: -0.5 });
// grandfather clock against the right wall
place({ id: 'grandfather-clock', asset: 'vintage_grandfather_clock_01', pos: [7.75, 0, -0.6], rotY: -PI / 2, collider: rotBox(7.75, -0.6, 0.32, 0.22, -PI / 2) });
// bench by the entrance, left wall
place({ id: 'bench', asset: 'painted_wooden_bench', pos: [-7.7, 0, 3.0], rotY: PI / 2, collider: rotBox(-7.7, 3.0, 0.6, 0.26, PI / 2) });
seats.push({ id: 'bench-a', pos: [-7.7, 0, 2.7], facingY: PI / 2, kind: 'stool' });
seats.push({ id: 'bench-b', pos: [-7.7, 0, 3.3], facingY: PI / 2, kind: 'stool' });
place({ id: 'big-plant', asset: 'potted_plant_01', pos: [-7.45, 0, 5.4], rotY: 0.8, collider: box(-7.45, 5.4, 0.3, 0.3) });
// window sill
place({ id: 'sill-plant', asset: 'potted_plant_04', pos: [0.75, 0.88, -5.9], rotY: 0 });
place({ id: 'sill-lantern', asset: 'wooden_lantern_01', pos: [2.1, 0.88, -5.9], rotY: 0.2 });
// game tables: a plate here, a vase there (masa-2 gets the tavla board)
place({ id: 'plate-1', asset: 'carved_wooden_plate', pos: [-0.8, 0.76, -3.2], rotY: 0 });
place({ id: 'plate-3', asset: 'carved_wooden_plate', pos: [-0.8, 0.76, 1.4], rotY: 1 });
place({ id: 'vase-4', asset: 'brass_vase_01', pos: [3.6, 0.76, 1.4], rotY: 0, scale: 0.55 });

/** Generated-texture decor (no models): wall kilim and a tavla board. */
export const WALL_KILIM = { x: -ROOM.width / 2 + 0.02, y: 1.95, z: -0.9, width: 2.1, height: 1.4 } as const;
export const TAVLA = { x: 3.6, y: 0.76, z: -3.2, width: 0.5, depth: 0.38 } as const;

// ---- Tavan ve duvarlar ----
place({ id: 'chandelier-1', asset: 'lantern_chandelier_01', pos: [-4.4, ROOM.height, -3.4], rotY: 0 });
place({ id: 'chandelier-2', asset: 'lantern_chandelier_01', pos: [1.4, ROOM.height, -0.9], rotY: 0.5 });
place({ id: 'chandelier-3', asset: 'lantern_chandelier_01', pos: [5.8, ROOM.height, -2.2], rotY: 1.1 });
place({ id: 'frame-1', asset: 'hanging_picture_frame_01', pos: [-2.2, 1.75, -ROOM.depth / 2 + 0.03], rotY: 0 });
place({ id: 'frame-2', asset: 'hanging_picture_frame_01', pos: [-ROOM.width / 2 + 0.03, 1.75, -3.4], rotY: PI / 2 });
place({ id: 'frame-3', asset: 'fancy_picture_frame_01', pos: [4.2, 1.85, -ROOM.depth / 2 + 0.03], rotY: 0 });
place({ id: 'frame-4', asset: 'fancy_picture_frame_01', pos: [ROOM.width / 2 - 0.03, 1.85, 2.0], rotY: -PI / 2 });

export const PLACEMENTS: readonly Placement[] = placements;
export const SEATS: readonly Seat[] = seats;

/** Window on the back wall: center x/y, size. */
export const WINDOW = { x: 1.4, y: 1.65, width: 2.0, height: 1.4 } as const;

/** Reserved for the billiard table (milestone 6). */
export const BILLIARD_AREA: Box2 = { minX: 3.0, maxX: 7.6, minZ: 3.0, maxZ: 5.8 };

export const SPAWN: Vec3 = [0, 0, 4.6];

export const CAT_SPOTS: readonly CatSpot[] = [
  { id: 'soba-onu', pos: [-6.4, 0, -4.6], kind: 'sleep' },
  { id: 'kilim', pos: [-5.6, 0, -4.7], kind: 'sleep' },
  { id: 'pencere', pos: [1.4, 0, -5.5], kind: 'sit' },
  { id: 'raf-onu', pos: [6.6, 0, -4.6], kind: 'sit' },
  { id: 'masalar-arasi', pos: [1.4, 0, -0.9], kind: 'wander' },
  { id: 'koridor', pos: [1.4, 0, 3.6], kind: 'wander' },
  { id: 'giris', pos: [-2.5, 0, 3.6], kind: 'wander' },
  { id: 'yan-kanepe', pos: [-6.4, 0, 0.6], kind: 'wander' }
];

/** Straight, verified-clear paths the cat may walk (undirected). */
export const CAT_EDGES: readonly (readonly [string, string])[] = [
  ['soba-onu', 'kilim'],
  ['kilim', 'pencere'],
  ['pencere', 'raf-onu'],
  ['pencere', 'masalar-arasi'],
  ['masalar-arasi', 'koridor'],
  ['koridor', 'giris'],
  ['giris', 'yan-kanepe']
];

export const FURNITURE_COLLIDERS: readonly Box2[] = placements.flatMap((p) => (p.collider ? [p.collider] : []));

const W = ROOM.width / 2;
const D = ROOM.depth / 2;
const T = 1; // wall thickness outside the room
export const WALL_COLLIDERS: readonly Box2[] = [
  { minX: -W - T, maxX: W + T, minZ: -D - T, maxZ: -D },
  { minX: -W - T, maxX: W + T, minZ: D, maxZ: D + T },
  { minX: -W - T, maxX: -W, minZ: -D - T, maxZ: D + T },
  { minX: W, maxX: W + T, minZ: -D - T, maxZ: D + T }
];

export const COLLIDERS: readonly Box2[] = [...FURNITURE_COLLIDERS, ...WALL_COLLIDERS];

/** Distance from the seat point to where you stand: clears the furniture's depth plus the avatar's radius. */
const APPROACH: Record<Seat['kind'], number> = { sofa: 0.85, rocking: 0.8, chair: 0.6, stool: 0.6 };

/**
 * Where an avatar stands before sitting / after standing: in front of the seat (distance per kind),
 * except game chairs, which face a table — there the avatar stands behind the chair.
 */
export function seatApproach(seat: Seat, distance = APPROACH[seat.kind]): { x: number; z: number } {
  const dir = seat.kind === 'chair' ? seat.facingY + Math.PI : seat.facingY;
  return { x: seat.pos[0] + Math.sin(dir) * distance, z: seat.pos[2] + Math.cos(dir) * distance };
}
