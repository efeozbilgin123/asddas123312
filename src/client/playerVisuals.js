import * as THREE from 'three';
import { createNameplateTexture, getAvatarTexture } from './textures.js';

const sharedGeo = {
  bezelMap: new Map(),
  collar: null,
  arm: null,
  hand: null,
  leg: null,
  shoe: null,
  turnRing: null,
  cueStick: null
};

function getBezelGeoms(medRadius) {
  const key = String(medRadius);
  let entry = sharedGeo.bezelMap.get(key);
  if (!entry) {
    entry = {
      bezel: new THREE.CylinderGeometry(medRadius + 0.095, medRadius + 0.095, 0.22, 28),
      innerRim: new THREE.TorusGeometry(medRadius + 0.015, 0.032, 8, 28),
      frontDisc: new THREE.CircleGeometry(medRadius, 28),
      rearDisc: new THREE.CircleGeometry(medRadius, 28),
      halo: new THREE.RingGeometry(medRadius + 0.14, medRadius + 0.24, 28)
    };
    sharedGeo.bezelMap.set(key, entry);
  }
  return entry;
}

function getLimbGeoms() {
  if (!sharedGeo.collar) {
    sharedGeo.collar = new THREE.CylinderGeometry(0.28, 0.36, 0.18, 14);
    sharedGeo.arm = new THREE.CylinderGeometry(0.14, 0.115, 0.92, 10);
    sharedGeo.hand = new THREE.SphereGeometry(0.125, 10, 8);
    sharedGeo.leg = new THREE.CylinderGeometry(0.18, 0.14, 1.38, 10);
    sharedGeo.shoe = new THREE.BoxGeometry(0.32, 0.18, 0.48);
    sharedGeo.turnRing = new THREE.RingGeometry(1.18, 1.36, 28);
    sharedGeo.cueStick = new THREE.CylinderGeometry(0.025, 0.052, 3.25, 8);
  }
  return sharedGeo;
}

export function buildKahveCharacter({
  bustGeom,
  avatarMatCache,
  avatar = 'avatar-1',
  name = 'Oyuncu',
  vestColor = '#6A4D1F',
  teamColor = '#C59A4B',
  isBot = false,
  isActive = false,
  seated = true,
  medRadius = 0.96,
  headY = 2.75,
  showNameplate = true,
  nameplateSub = '',
  nameplateY = null,
  rearPfp = true,
  hasCueStick = false,
  disposableMats = null
} = {}) {
  const root = new THREE.Group();
  const limbs = getLimbGeoms();
  const headGeoms = getBezelGeoms(medRadius);

  const bustMat = new THREE.MeshStandardMaterial({
    color: vestColor,
    roughness: 0.56,
    metalness: 0.08
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: isBot ? '#DCE6F2' : '#F4ECE0',
    roughness: 0.72
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: '#D9AD8B',
    roughness: 0.65
  });
  const trouserMat = new THREE.MeshStandardMaterial({
    color: '#222428',
    roughness: 0.78
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: '#18110E',
    roughness: 0.45,
    metalness: 0.15
  });
  const bezelMat = new THREE.MeshStandardMaterial({
    color: isActive ? '#F5C842' : teamColor,
    emissive: isActive ? '#9A6E12' : '#1E1408',
    emissiveIntensity: isActive ? 0.55 : 0.15,
    roughness: 0.26,
    metalness: 0.76
  });

  if (Array.isArray(disposableMats)) {
    disposableMats.push(bustMat, collarMat, skinMat, trouserMat, shoeMat, bezelMat);
  }

  // Torso body group (scaled cleanly so neck stops well below headY = 2.75)
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  if (bustGeom) {
    const bust = new THREE.Mesh(bustGeom, bustMat);
    bust.scale.set(1.18, 0.94, 0.62);
    bust.castShadow = true;
    bust.receiveShadow = true;
    bodyGroup.add(bust);
  }

  const collar = new THREE.Mesh(limbs.collar, collarMat);
  collar.position.set(0, 1.38, 0.02);
  bodyGroup.add(collar);

  // Articulated Left & Right Arms
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.92, 1.08, 0.04);

    const sleeve = new THREE.Mesh(limbs.arm, bustMat);
    sleeve.position.set(0, -0.44, 0);
    sleeve.castShadow = true;
    pivot.add(sleeve);

    const hand = new THREE.Mesh(limbs.hand, skinMat);
    hand.position.set(0, -0.94, 0.04);
    pivot.add(hand);

    if (seated) {
      pivot.rotation.x = -0.78;
      pivot.rotation.z = side * 0.14;
    } else {
      pivot.rotation.x = -0.14;
      pivot.rotation.z = side * 0.08;
    }
    bodyGroup.add(pivot);
    return pivot;
  };
  const leftArmPivot = makeArm(-1);
  const rightArmPivot = makeArm(1);

  let cuePivot = null;
  if (hasCueStick) {
    cuePivot = new THREE.Group();
    const cueMat = new THREE.MeshStandardMaterial({ color: '#8C4D27', roughness: 0.42 });
    if (Array.isArray(disposableMats)) disposableMats.push(cueMat);
    const cue = new THREE.Mesh(limbs.cueStick, cueMat);
    cue.position.set(0, 0.25, 0.16);
    cue.rotation.x = 0.14;
    cuePivot.position.set(0.95, 0.2, 0.25);
    cuePivot.add(cue);
    bodyGroup.add(cuePivot);
  }

  let leftLegPivot = null;
  let rightLegPivot = null;
  if (!seated) {
    const makeLeg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.36, -0.32, 0);

      const leg = new THREE.Mesh(limbs.leg, trouserMat);
      leg.position.set(0, -0.68, 0);
      leg.castShadow = true;
      pivot.add(leg);

      const shoe = new THREE.Mesh(limbs.shoe, shoeMat);
      shoe.position.set(0, -1.46, 0.08);
      shoe.castShadow = true;
      pivot.add(shoe);

      bodyGroup.add(pivot);
      return pivot;
    };
    leftLegPivot = makeLeg(-1);
    rightLegPivot = makeLeg(1);
  }

  // Okey-matched 3D Brass-Bezeled PFP Medallion centered cleanly ABOVE collar (zero clipping)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, headY, 0);
  root.add(headGroup);

  const bezel = new THREE.Mesh(headGeoms.bezel, bezelMat);
  bezel.rotation.x = Math.PI / 2;
  bezel.castShadow = true;
  headGroup.add(bezel);

  const innerRim = new THREE.Mesh(headGeoms.innerRim, bezelMat);
  innerRim.position.z = 0.11;
  headGroup.add(innerRim);

  const rawAv = String(avatar || 'avatar-1').trim() || 'avatar-1';
  const avCacheKey = `pfp-v2:${rawAv}:${isDataUrlOrFallbackKey(rawAv, name)}`;
  let avatarMat = avatarMatCache?.get(avCacheKey);
  if (!avatarMat) {
    avatarMat = new THREE.MeshBasicMaterial({
      map: getAvatarTexture(rawAv, name || 'O')
    });
    avatarMatCache?.set(avCacheKey, avatarMat);
  }

  const frontDisc = new THREE.Mesh(headGeoms.frontDisc, avatarMat);
  frontDisc.position.z = 0.118;
  headGroup.add(frontDisc);

  if (rearPfp) {
    const rearRim = new THREE.Mesh(headGeoms.innerRim, bezelMat);
    rearRim.position.z = -0.11;
    headGroup.add(rearRim);

    const rearDisc = new THREE.Mesh(headGeoms.rearDisc, avatarMat);
    rearDisc.rotation.y = Math.PI;
    rearDisc.position.z = -0.118;
    headGroup.add(rearDisc);
  } else {
    const rearCapMat = new THREE.MeshStandardMaterial({ color: '#14110F', roughness: 0.9 });
    if (Array.isArray(disposableMats)) disposableMats.push(rearCapMat);
    const rearDisc = new THREE.Mesh(headGeoms.rearDisc, rearCapMat);
    rearDisc.rotation.y = Math.PI;
    rearDisc.position.z = -0.116;
    headGroup.add(rearDisc);
  }

  let haloMesh = null;
  if (isActive) {
    const haloMat = new THREE.MeshBasicMaterial({
      color: '#FFE082',
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide
    });
    const turnRingMat = new THREE.MeshBasicMaterial({
      color: '#F5C842',
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide
    });
    if (Array.isArray(disposableMats)) disposableMats.push(haloMat, turnRingMat);

    haloMesh = new THREE.Mesh(headGeoms.halo, haloMat);
    haloMesh.position.z = 0.04;
    headGroup.add(haloMesh);

    const floorRing = new THREE.Mesh(limbs.turnRing, turnRingMat);
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.set(0, seated ? -0.32 : -1.94, 0);
    root.add(floorRing);
  }

  let nameplateMat = null;
  if (showNameplate) {
    const displayLabel = nameplateSub ? `${name} (${nameplateSub})` : (name || 'Oyuncu');
    nameplateMat = new THREE.SpriteMaterial({
      map: createNameplateTexture(displayLabel, { isActive, isBot }),
      transparent: true,
      depthWrite: false
    });
    const np = new THREE.Sprite(nameplateMat);
    np.position.set(0, nameplateY ?? (headY + medRadius + 0.64), 0);
    np.scale.set(3.25, 0.82, 1);
    np.renderOrder = 20;
    root.add(np);
  }

  return {
    group: root,
    bodyGroup,
    headGroup,
    haloMesh,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    cuePivot,
    nameplateMat
  };
}

function isDataUrlOrFallbackKey(rawAv, name) {
  if (/^data:image\//.test(rawAv)) return 'custom';
  if (/^avatar-\d+$/.test(rawAv)) return 'preset';
  return String(name || 'O').slice(0, 8);
}
