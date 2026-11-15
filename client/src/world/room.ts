import * as THREE from 'three';
import type { AssetBank, PbrSet } from './assets';
import { PLACEMENTS, ROOM, TAVLA, WALL_KILIM, WINDOW, type Placement } from '@kahvehane/shared';
import type { QualityPreset } from './quality';

function pbr(set: PbrSet | undefined, repeatX: number, repeatY: number, fallback: string): THREE.MeshStandardMaterial {
  if (!set) return new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.9 });
  const maps = { map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, aoMap: set.aoMap };
  const cloned: Record<string, THREE.Texture | undefined> = {};
  for (const [k, t] of Object.entries(maps)) {
    if (!t) continue;
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeatX, repeatY);
    c.anisotropy = 8;
    c.needsUpdate = true;
    cloned[k] = c;
  }
  return new THREE.MeshStandardMaterial({ ...cloned, roughness: 1 });
}

function plane(w: number, h: number, mat: THREE.Material, receive: boolean): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.receiveShadow = receive;
  return m;
}

const PLASTER_TILE = 2.5; // meters per texture repeat
const WAINSCOT = 1.0; // lower wooden wall panel height

/** One wall: plaster above a wooden wainscot. Built in local space facing +z, centered on x. */
function wall(width: number, bank: AssetBank, q: QualityPreset, hole?: { x: number; y: number; w: number; h: number }): THREE.Group {
  const g = new THREE.Group();
  const H = ROOM.height;
  const plaster = (w: number, h: number) => pbr(bank.textures.get('clay_plaster'), w / PLASTER_TILE, h / PLASTER_TILE, '#d9c3a0');
  const pieces: { x0: number; x1: number; y0: number; y1: number }[] = [];
  if (!hole) pieces.push({ x0: -width / 2, x1: width / 2, y0: WAINSCOT, y1: H });
  else {
    const hx0 = hole.x - hole.w / 2, hx1 = hole.x + hole.w / 2, hy0 = hole.y - hole.h / 2, hy1 = hole.y + hole.h / 2;
    pieces.push({ x0: -width / 2, x1: hx0, y0: WAINSCOT, y1: H });
    pieces.push({ x0: hx1, x1: width / 2, y0: WAINSCOT, y1: H });
    pieces.push({ x0: hx0, x1: hx1, y0: hy1, y1: H });
    pieces.push({ x0: hx0, x1: hx1, y0: WAINSCOT, y1: hy0 });
  }
  for (const p of pieces) {
    const w = p.x1 - p.x0, h = p.y1 - p.y0;
    if (w <= 0 || h <= 0) continue;
    const m = plane(w, h, plaster(w, h), q.shadows);
    m.position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0);
    g.add(m);
  }
  const panel = plane(width, WAINSCOT, pbr(bank.textures.get('beam_wall_01'), width / 2, 0.5, '#6b4a2b'), q.shadows);
  panel.position.set(0, WAINSCOT / 2, 0.005);
  g.add(panel);
  // trim rail on top of the wainscot
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, 0.04), pbr(bank.textures.get('wooden_rough_planks'), width / 2, 0.1, '#4a2f1a'));
  rail.position.set(0, WAINSCOT, 0.02);
  rail.castShadow = rail.receiveShadow = q.shadows;
  g.add(rail);
  return g;
}

function windowFrame(bank: AssetBank, q: QualityPreset): THREE.Group {
  const g = new THREE.Group();
  const wood = pbr(bank.textures.get('wooden_rough_planks'), 1, 0.2, '#4a2f1a');
  const { width: w, height: h } = WINDOW;
  const t = 0.08, d = 0.18;
  const bar = (bw: number, bh: number, x: number, y: number, depth = d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, depth), wood);
    m.position.set(x, y, 0);
    m.castShadow = m.receiveShadow = q.shadows;
    g.add(m);
  };
  bar(w + t * 2, t, 0, h / 2 + t / 2);
  bar(w + t * 2, t, 0, -h / 2 - t / 2);
  bar(t, h, -w / 2 - t / 2, 0);
  bar(t, h, w / 2 + t / 2, 0);
  bar(0.04, h, 0, 0, 0.06); // mullion
  bar(w, 0.04, 0, h * 0.15, 0.06); // transom
  const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.05, 0.3), wood);
  sill.position.set(0, -h / 2 - t - 0.02, 0.1);
  sill.castShadow = sill.receiveShadow = q.shadows;
  g.add(sill);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshPhysicalMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0 })
  );
  glass.position.z = -0.03;
  g.add(glass);
  return g;
}

/** Light-emitting parts of lamp models glow warmly; picture frames get our own artwork. */
function glow(mesh: THREE.Mesh, bank?: AssetBank): void {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (!mat?.name) return;
  if (/chandelier_01_lamp$|_flame$/.test(mat.name)) {
    const m = mat.clone();
    m.emissive.set('#ffc27a');
    m.emissiveIntensity = 4;
    mesh.material = m;
    mesh.castShadow = false;
  } else if (/picture_frame.*_artwork$/.test(mat.name) && bank?.textures.get('legacy-art')) {
    const m = mat.clone();
    m.map = bank.textures.get('legacy-art')!.map;
    m.color.set('#ffffff');
    mesh.material = m;
  } else if (/picture_frame.*_glass$/.test(mat.name)) {
    mesh.visible = false; // the dark glass hides the artwork under our lighting
  } else if (/_glass$/.test(mat.name) && /lantern|lamp/.test(mat.name)) {
    const m = mat.clone();
    m.emissive.set('#ffb060');
    m.emissiveIntensity = 0.6;
    mesh.material = m;
    mesh.castShadow = false;
  }
}

export function addPlacement(group: THREE.Group, p: Placement, bank: AssetBank, q: QualityPreset): boolean {
  const src = bank.models.get(p.asset);
  if (!src) return false;
  const obj = src.clone(true);
  obj.position.set(...p.pos);
  obj.rotation.y = p.rotY;
  if (p.scale) obj.scale.setScalar(p.scale);
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = q.shadows;
    mesh.receiveShadow = q.shadows;
    glow(mesh, bank);
  });
  obj.name = p.id;
  obj.userData.placementId = p.id;
  group.add(obj);
  return true;
}

/** Wall kilim and the tavla board: generated textures on simple surfaces. Added once their textures load. */
export function addDecor(group: THREE.Group, bank: AssetBank, q: QualityPreset): void {
  if (group.getObjectByName('decor')) return;
  const decor = new THREE.Group();
  decor.name = 'decor';
  const kilim = bank.textures.get('kilim');
  if (kilim) {
    const wallRug = new THREE.Mesh(new THREE.PlaneGeometry(WALL_KILIM.width, WALL_KILIM.height), new THREE.MeshStandardMaterial({ map: kilim.map, roughness: 1 }));
    wallRug.position.set(WALL_KILIM.x, WALL_KILIM.y, WALL_KILIM.z);
    wallRug.rotation.y = Math.PI / 2;
    wallRug.receiveShadow = q.shadows;
    decor.add(wallRug);
  }
  const tavla = bank.textures.get('tavla');
  if (tavla) {
    const wood = new THREE.MeshStandardMaterial({ color: '#3a2112', roughness: 0.6 });
    const top = new THREE.MeshStandardMaterial({ map: tavla.map, roughness: 0.55 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(TAVLA.width, 0.035, TAVLA.depth), [wood, wood, top, wood, wood, wood]);
    board.position.set(TAVLA.x, TAVLA.y + 0.0175, TAVLA.z);
    board.rotation.y = 0.25;
    board.castShadow = board.receiveShadow = q.shadows;
    decor.add(board);
  }
  if (decor.children.length) group.add(decor);
}

/** Adds every placement whose model is loaded and not yet in the group. Returns how many were added. */
export function addLoadedPlacements(group: THREE.Group, bank: AssetBank, q: QualityPreset): number {
  const present = new Set(group.children.map((c) => c.userData.placementId as string | undefined));
  let added = 0;
  for (const p of PLACEMENTS) if (!present.has(p.id) && addPlacement(group, p, bank, q)) added += 1;
  return added;
}

export interface Room {
  group: THREE.Group;
  furniture: THREE.Group;
}

export function buildRoom(bank: AssetBank, q: QualityPreset): Room {
  const group = new THREE.Group();
  const W = ROOM.width, D = ROOM.depth, H = ROOM.height;

  const floor = plane(W, D, pbr(bank.textures.get('brown_planks_07'), W / 0.9, D / 0.9, '#6e4a2c'), q.shadows);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const ceiling = plane(W, D, pbr(bank.textures.get('wooden_rough_planks'), W / 2.5, D / 2.5, '#4a2f1a'), false);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  group.add(ceiling);
  const beamMat = new THREE.MeshStandardMaterial({ color: '#3a2616', roughness: 0.85 });
  for (let x = -W / 2 + 2; x < W / 2; x += 3) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, D), beamMat);
    beam.position.set(x, H - 0.12, 0);
    beam.castShadow = q.shadows;
    group.add(beam);
  }

  const back = wall(W, bank, q, { x: WINDOW.x, y: WINDOW.y, w: WINDOW.width, h: WINDOW.height });
  back.position.z = -D / 2;
  group.add(back);
  const front = wall(W, bank, q);
  front.position.z = D / 2;
  front.rotation.y = Math.PI;
  group.add(front);
  const left = wall(D, bank, q);
  left.position.x = -W / 2;
  left.rotation.y = Math.PI / 2;
  group.add(left);
  const right = wall(D, bank, q);
  right.position.x = W / 2;
  right.rotation.y = -Math.PI / 2;
  group.add(right);

  const win = windowFrame(bank, q);
  win.position.set(WINDOW.x, WINDOW.y, -D / 2);
  group.add(win);

  const kilimTex = bank.textures.get('kilim');
  if (kilimTex) {
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 2),
      new THREE.MeshStandardMaterial({ map: kilimTex.map, roughness: 1 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-4.4, 0.006, -3.75);
    rug.receiveShadow = q.shadows;
    group.add(rug);
  }

  // Stove pipe: blackened steel from the stove top up through the ceiling
  const stove = PLACEMENTS.find((p) => p.id === 'stove');
  if (stove) {
    const pipeMat = new THREE.MeshStandardMaterial({ color: '#1c1b1d', roughness: 0.55, metalness: 0.8 });
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, H - 0.86, 24), pipeMat);
    pipe.position.set(stove.pos[0], 0.86 + (H - 0.86) / 2, stove.pos[2]);
    pipe.castShadow = q.shadows;
    group.add(pipe);
  }

  const furniture = new THREE.Group();
  furniture.name = 'furniture';
  addLoadedPlacements(furniture, bank, q);
  group.add(furniture);
  return { group, furniture };
}
