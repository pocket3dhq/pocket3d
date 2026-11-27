// The Materials tab on the three.js side: finds which three materials and
// textures belong to each glTF material, applies the visitor's edits, and
// draws the viewport's channel views.
//
// The loaded materials are never changed. An edited material gets its own
// copy (made from the loaded one plus the edits each time they change), put
// on the meshes in its place; with no edits the loaded one goes back. So
// with no edits and the Lit view, the model is exactly as loaded.

import * as THREE from 'three';
import type { GLTF, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  describeMaterials,
  effectiveFeatures,
  effectiveValues,
  GltfJson,
  isEdited,
  isSrgbSlot,
  MaterialEdit,
  MaterialEdits,
  MaterialInfo,
  MaterialsReport,
  ReplacedImage,
  SlotId,
  slotState,
  SLOTS,
  uvAttribute,
  ViewMode,
} from './material.settings';

type Kind = 'basic' | 'standard' | 'physical';
type AnyMaterial = THREE.MeshBasicMaterial | THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

// The three property each slot's texture goes in
const SLOT_PROPERTY: Record<SlotId, string> = {
  baseColor: 'map',
  metallic: 'metalnessMap',
  roughness: 'roughnessMap',
  normal: 'normalMap',
  occlusion: 'aoMap',
  emissive: 'emissiveMap',
  transmission: 'transmissionMap',
  thickness: 'thicknessMap',
  clearcoat: 'clearcoatMap',
  clearcoatRoughness: 'clearcoatRoughnessMap',
  clearcoatNormal: 'clearcoatNormalMap',
  sheenColor: 'sheenColorMap',
  sheenRoughness: 'sheenRoughnessMap',
};

// Where a loaded material is on screen: a mesh, and its place in the
// mesh's material list when it has one
interface Use {
  mesh: THREE.Mesh;
  group: number | null;
  original: THREE.Material;
}

interface Entry {
  info: MaterialInfo;
  originals: THREE.Material[];
  uses: Use[];
  // the visitor's version of each loaded material, made on the first edit
  lives: Map<THREE.Material, AnyMaterial>;
  // the textures as loaded (from the first loaded material), and the ones
  // loaded later (an unlit material's PBR textures)
  textures: Partial<Record<SlotId, THREE.Texture>>;
  loading: Partial<Record<SlotId, Promise<THREE.Texture | null>>>;
  loaded: THREE.Texture[];
  // a texture moved to another UV set, and a dropped-in image, per slot
  moved: Partial<Record<SlotId, { uvSet: number; texture: THREE.Texture }>>;
  replaced: Partial<Record<SlotId, { key: string; texture: THREE.Texture }>>;
}

export interface MaterialIndex {
  report: Omit<MaterialsReport, 'src'>;
  entries: Map<string, Entry>;
  parser: GLTFParser;
  // checker materials for the UV view, per UV set and side
  checkers: Map<string, THREE.MeshBasicMaterial>;
  checkerTextures: Map<number, THREE.Texture>;
  // the channel view hook each material has now
  hooks: WeakMap<THREE.Material, string>;
  hooked: Set<THREE.Material>;
  // told when a texture loaded later arrives (the edits then apply again)
  onLoaded: (() => void) | null;
  alive: boolean;
}

const kindOf = (material: THREE.Material): Kind | null => {
  if ((material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return 'physical';
  if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return 'standard';
  if ((material as THREE.MeshBasicMaterial).isMeshBasicMaterial) return 'basic';
  return null;
};

const makeMaterial = (kind: Kind): AnyMaterial =>
  kind === 'physical'
    ? new THREE.MeshPhysicalMaterial()
    : kind === 'standard'
      ? new THREE.MeshStandardMaterial()
      : new THREE.MeshBasicMaterial();

const materialsOf = (mesh: THREE.Mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

// Finds the glTF material behind each three material on the model. The
// loader copies a material for some meshes (vertex colours, flat shading,
// no tangents) and the copies keep the link; materials it makes itself
// (the default one) have none
export const indexMaterials = (gltf: GLTF): MaterialIndex => {
  const parser = gltf.parser;
  const report = describeMaterials(parser.json as GltfJson);
  const infos = new Map(report.materials.map((info) => [info.key, info]));
  const entries = new Map<string, Entry>();

  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    materialsOf(mesh).forEach((material, i) => {
      if (!kindOf(material)) return;
      const index = parser.associations.get(material)?.materials;
      const key = typeof index === 'number' ? String(index) : 'default';
      const info = infos.get(key);
      if (!info) return;
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          info,
          originals: [],
          uses: [],
          lives: new Map(),
          textures: {},
          loading: {},
          loaded: [],
          moved: {},
          replaced: {},
        };
        for (const slot of SLOTS) {
          const texture = (material as unknown as Record<string, unknown>)[SLOT_PROPERTY[slot]];
          if (texture instanceof THREE.Texture) entry.textures[slot] = texture;
        }
        entries.set(key, entry);
      }
      if (!entry.originals.includes(material)) entry.originals.push(material);
      entry.uses.push({ mesh, group: Array.isArray(mesh.material) ? i : null, original: material });
    });
  });

  return {
    report,
    entries,
    parser,
    checkers: new Map(),
    checkerTextures: new Map(),
    hooks: new WeakMap(),
    hooked: new Set(),
    onLoaded: null,
    alive: true,
  };
};

const assign = (use: Use, material: THREE.Material) => {
  if (use.group === null) {
    if (use.mesh.material !== material) use.mesh.material = material;
  } else {
    const list = use.mesh.material as THREE.Material[];
    if (list[use.group] !== material) list[use.group] = material;
  }
};

// ---- textures ----

// A slot's texture as loaded, or loaded now when the loader skipped it
// (unlit materials get only their base colour)
const loadSlot = (index: MaterialIndex, entry: Entry, slot: SlotId): Promise<THREE.Texture | null> => {
  const known = entry.textures[slot];
  if (known) return Promise.resolve(known);
  const def = entry.info.slots[slot]?.def;
  if (!def) return Promise.resolve(null);
  let pending = entry.loading[slot];
  if (!pending) {
    const params: Record<string, unknown> = {};
    pending = index.parser
      .assignTexture(params, 'map', def, isSrgbSlot(slot) ? THREE.SRGBColorSpace : undefined)
      .then(() => {
        const texture = params.map instanceof THREE.Texture ? params.map : null;
        if (!texture) return null;
        if (!index.alive) {
          texture.dispose();
          return null;
        }
        entry.textures[slot] = texture;
        entry.loaded.push(texture);
        index.onLoaded?.();
        return texture;
      })
      .catch((error) => {
        console.error('Could not load a texture', error);
        return null;
      });
    entry.loading[slot] = pending;
  }
  return pending;
};

const copySampling = (texture: THREE.Texture, from: THREE.Texture | undefined, slot: SlotId, uvSet: number) => {
  texture.flipY = false;
  texture.colorSpace = isSrgbSlot(slot) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (from) {
    texture.wrapS = from.wrapS;
    texture.wrapT = from.wrapT;
    texture.magFilter = from.magFilter;
    texture.minFilter = from.minFilter;
    texture.anisotropy = from.anisotropy;
    texture.offset.copy(from.offset);
    texture.repeat.copy(from.repeat);
    texture.center.copy(from.center);
    texture.rotation = from.rotation;
  } else {
    // glTF's default sampler
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.channel = uvSet;
};

const replacedTexture = (entry: Entry, slot: SlotId, image: ReplacedImage, uvSet: number) => {
  const key = `${image.id}:${uvSet}`;
  const cached = entry.replaced[slot];
  if (cached?.key === key) return cached.texture;
  cached?.texture.dispose();
  const texture = new THREE.Texture(image.bitmap);
  copySampling(texture, entry.textures[slot], slot, uvSet);
  texture.needsUpdate = true;
  entry.replaced[slot] = { key, texture };
  return texture;
};

// The same image read through another UV set (a copy shares the image
// already on the graphics card)
const movedTexture = (entry: Entry, slot: SlotId, base: THREE.Texture, uvSet: number) => {
  const cached = entry.moved[slot];
  if (cached?.uvSet === uvSet) return cached.texture;
  cached?.texture.dispose();
  const texture = base.clone();
  texture.channel = uvSet;
  entry.moved[slot] = { uvSet, texture };
  return texture;
};

// The texture a slot shows with these edits, or null. Loads it when the
// loader skipped it (and says so through onLoaded once it's here)
const slotTexture = (index: MaterialIndex, entry: Entry, edit: MaterialEdit | undefined, slot: SlotId) => {
  const state = slotState(entry.info, edit, slot);
  if (state.off) return null;
  if (state.image) return replacedTexture(entry, slot, state.image, state.uvSet);
  const base = entry.textures[slot];
  if (!base) {
    if (state.file) void loadSlot(index, entry, slot);
    return null;
  }
  return base.channel === state.uvSet ? base : movedTexture(entry, slot, base, state.uvSet);
};

// For the panel's previews: the texture a slot shows, loading it first if
// needed
export const textureForSlot = async (
  index: MaterialIndex,
  key: string,
  slot: SlotId,
  edit: MaterialEdit | undefined
): Promise<THREE.Texture | null> => {
  const entry = index.entries.get(key);
  if (!entry) return null;
  const state = slotState(entry.info, edit, slot);
  if (state.image) return replacedTexture(entry, slot, state.image, state.uvSet);
  if (!state.file) return null;
  return loadSlot(index, entry, slot);
};

// Frees cached textures the edits no longer use
const pruneTextures = (entry: Entry, edit: MaterialEdit | undefined) => {
  for (const slot of SLOTS) {
    const state = slotState(entry.info, edit, slot);
    const replaced = entry.replaced[slot];
    if (replaced && (!state.image || replaced.key !== `${state.image.id}:${state.uvSet}`)) {
      replaced.texture.dispose();
      delete entry.replaced[slot];
    }
    const moved = entry.moved[slot];
    if (moved && (state.image || moved.uvSet !== state.uvSet)) {
      moved.texture.dispose();
      delete entry.moved[slot];
    }
  }
};

// ---- edited materials ----

// What the shader program depends on: when it changes, three must rebuild
// the program (needsUpdate); slider moves don't
const signature = (material: THREE.Material) => {
  const record = material as unknown as Record<string, unknown>;
  return [
    material.type,
    material.side,
    material.transparent,
    material.alphaTest > 0,
    material.vertexColors,
    ...Object.values(SLOT_PROPERTY).map((property) => !!record[property]),
    ...Object.values(SLOT_PROPERTY).map((property) => (record[property] as THREE.Texture | null)?.channel ?? -1),
  ].join(',');
};

const wantedKind = (original: THREE.Material, info: MaterialInfo, edit: MaterialEdit) => {
  const values = effectiveValues(info, edit);
  if (values.unlit) return 'basic';
  const features = effectiveFeatures(info, edit);
  const physical =
    kindOf(original) === 'physical' ||
    features.transmission ||
    features.ior ||
    features.volume ||
    features.clearcoat ||
    features.sheen;
  return physical ? 'physical' : 'standard';
};

// three flips the normal map's Y on meshes without tangents (it works out
// tangents in the shader); a replaced or edited normal map must too
const normalSign = (entry: Entry, original: THREE.Material) => {
  const use = entry.uses.find((item) => item.original === original);
  return use && !use.mesh.geometry.getAttribute('tangent') ? -1 : 1;
};

// Sets everything the panel edits on `live`, starting from the loaded material
const build = (
  index: MaterialIndex,
  entry: Entry,
  original: THREE.Material,
  live: AnyMaterial,
  edit: MaterialEdit
) => {
  const { info } = entry;
  const values = effectiveValues(info, edit);
  const features = effectiveFeatures(info, edit);
  const liveKind = kindOf(live);
  const originalKind = kindOf(original);

  // whatever the panel doesn't touch comes from the loaded material
  if (liveKind === originalKind) {
    (live as THREE.Material).copy(original);
  } else {
    THREE.Material.prototype.copy.call(live, original);
    if (liveKind === 'physical' && originalKind === 'standard') {
      THREE.MeshStandardMaterial.prototype.copy.call(live, original);
      // the standard copy leaves only STANDARD defined
      live.defines = { STANDARD: '', PHYSICAL: '' };
    }
    if ('flatShading' in live && 'flatShading' in original) {
      live.flatShading = (original as THREE.MeshStandardMaterial).flatShading;
    }
  }

  const tex = (slot: SlotId) => slotTexture(index, entry, edit, slot);

  live.side = values.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  live.transparent = values.alphaMode === 'BLEND';
  live.depthWrite = values.alphaMode !== 'BLEND';
  live.alphaTest = values.alphaMode === 'MASK' ? values.alphaCutoff : 0;
  live.color.setRGB(values.baseColor[0], values.baseColor[1], values.baseColor[2], THREE.LinearSRGBColorSpace);
  live.opacity = values.opacity;
  live.map = tex('baseColor');

  if (liveKind === 'basic') return;
  const standard = live as THREE.MeshStandardMaterial;
  const sign = normalSign(entry, original);
  standard.metalness = values.metallic;
  standard.roughness = values.roughness;
  standard.metalnessMap = tex('metallic');
  standard.roughnessMap = tex('roughness');
  standard.normalMap = tex('normal');
  standard.normalScale.set(values.normalScale, values.normalScale * sign);
  standard.aoMap = tex('occlusion');
  standard.aoMapIntensity = values.occlusionStrength;
  if (features.emission) {
    standard.emissive.setRGB(values.emissive[0], values.emissive[1], values.emissive[2], THREE.LinearSRGBColorSpace);
    standard.emissiveMap = tex('emissive');
  } else {
    standard.emissive.setRGB(0, 0, 0);
    standard.emissiveMap = null;
  }
  standard.emissiveIntensity = values.emissiveStrength;

  if (liveKind !== 'physical') return;
  const physical = live as THREE.MeshPhysicalMaterial;
  physical.transmission = features.transmission ? values.transmission : 0;
  physical.transmissionMap = features.transmission ? tex('transmission') : null;
  physical.ior = features.ior ? values.ior : 1.5;
  physical.thickness = features.volume ? values.thickness : 0;
  physical.thicknessMap = features.volume ? tex('thickness') : null;
  physical.attenuationColor.setRGB(
    values.attenuationColor[0],
    values.attenuationColor[1],
    values.attenuationColor[2],
    THREE.LinearSRGBColorSpace
  );
  physical.attenuationDistance = features.volume ? values.attenuationDistance : Infinity;
  physical.clearcoat = features.clearcoat ? values.clearcoat : 0;
  physical.clearcoatMap = features.clearcoat ? tex('clearcoat') : null;
  physical.clearcoatRoughness = values.clearcoatRoughness;
  physical.clearcoatRoughnessMap = features.clearcoat ? tex('clearcoatRoughness') : null;
  physical.clearcoatNormalMap = features.clearcoat ? tex('clearcoatNormal') : null;
  physical.clearcoatNormalScale.set(values.clearcoatNormalScale, values.clearcoatNormalScale * sign);
  physical.sheen = features.sheen ? 1 : 0;
  physical.sheenColor.setRGB(values.sheenColor[0], values.sheenColor[1], values.sheenColor[2], THREE.LinearSRGBColorSpace);
  physical.sheenColorMap = features.sheen ? tex('sheenColor') : null;
  physical.sheenRoughness = values.sheenRoughness;
  physical.sheenRoughnessMap = features.sheen ? tex('sheenRoughness') : null;
};

const liveFor = (index: MaterialIndex, entry: Entry, original: THREE.Material, edit: MaterialEdit) => {
  const kind = wantedKind(original, entry.info, edit);
  let live = entry.lives.get(original);
  let before = live ? signature(live) : '';
  if (!live || kindOf(live) !== kind) {
    live?.dispose();
    live = makeMaterial(kind);
    entry.lives.set(original, live);
    before = '';
  }
  build(index, entry, original, live, edit);
  if (signature(live) !== before) live.needsUpdate = true;
  return live;
};

// ---- channel views ----

const CHECKER_SIZE = 1024;
const CHECKER_CELLS = 8;

// A numbered checker (A1 at the top left of UV space): stretching shows as
// uneven squares, mirrored islands as mirrored labels
const makeChecker = () => {
  const canvas = document.createElement('canvas');
  canvas.width = CHECKER_SIZE;
  canvas.height = CHECKER_SIZE;
  const context = canvas.getContext('2d');
  if (context) {
    const cell = CHECKER_SIZE / CHECKER_CELLS;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `600 ${cell * 0.32}px ui-monospace, monospace`;
    for (let row = 0; row < CHECKER_CELLS; row++) {
      for (let column = 0; column < CHECKER_CELLS; column++) {
        const hue = (column / CHECKER_CELLS) * 300;
        const light = (row + column) % 2 === 0 ? 72 : 48;
        context.fillStyle = `hsl(${hue} 55% ${light}%)`;
        context.fillRect(column * cell, row * cell, cell, cell);
        context.fillStyle = light > 60 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)';
        context.fillText(`${String.fromCharCode(65 + column)}${row + 1}`, (column + 0.5) * cell, (row + 0.5) * cell);
      }
    }
    context.strokeStyle = 'rgba(0,0,0,0.35)';
    context.lineWidth = 2;
    for (let i = 0; i <= CHECKER_CELLS; i++) {
      context.beginPath();
      context.moveTo(i * cell, 0);
      context.lineTo(i * cell, CHECKER_SIZE);
      context.moveTo(0, i * cell);
      context.lineTo(CHECKER_SIZE, i * cell);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  // glTF's UV space: (0, 0) at the top left of the image
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
};

const checkerFor = (index: MaterialIndex, mesh: THREE.Mesh, material: THREE.Material, uvSet: number) => {
  const has = !!mesh.geometry.getAttribute(uvAttribute(uvSet));
  const key = `${has ? uvSet : 'none'}:${material.side}`;
  let checker = index.checkers.get(key);
  if (!checker) {
    checker = new THREE.MeshBasicMaterial({ side: material.side, toneMapped: false });
    if (has) {
      let texture = index.checkerTextures.get(uvSet);
      if (!texture) {
        const first = index.checkerTextures.get(-1) ?? makeChecker();
        index.checkerTextures.set(-1, first);
        texture = uvSet === 0 ? first : first.clone();
        texture.channel = uvSet;
        index.checkerTextures.set(uvSet, texture);
      }
      checker.map = texture;
    } else {
      checker.color.setRGB(1, 0, 1, THREE.SRGBColorSpace);
    }
    index.checkers.set(key, checker);
  }
  return checker;
};

// The GLSL that replaces the pixel's colour with one channel. It runs after
// tone mapping and the output conversion, so data comes out raw (a
// roughness of 0.5 is 50% grey) and colours as stored (sRGB)
const channelCode = (material: THREE.Material, view: ViewMode) => {
  const lit = kindOf(material) === 'standard' || kindOf(material) === 'physical';
  const srgb = (value: string) => `sRGBTransferOETF( vec4( ${value}, 1.0 ) ).rgb`;
  let colour: string;
  switch (view.channel) {
    case 'baseColor': {
      const base = srgb('diffuseColor.rgb');
      colour =
        view.isolate === 'rgb'
          ? base
          : view.isolate === 'a'
            ? 'vec3( diffuseColor.a )'
            : `vec3( ( ${base} ).${view.isolate} )`;
      break;
    }
    case 'alpha':
      colour = 'vec3( diffuseColor.a )';
      break;
    case 'metallic':
      colour = lit ? 'vec3( metalnessFactor )' : 'vec3( 0.5 )';
      break;
    case 'roughness':
      colour = lit ? 'vec3( roughnessFactor )' : 'vec3( 0.5 )';
      break;
    case 'normal':
      colour = lit ? 'inverseTransformDirection( normal, viewMatrix ) * 0.5 + 0.5' : 'vec3( 0.5 )';
      break;
    case 'occlusion':
      colour = lit ? '\n#ifdef USE_AOMAP\nvec3( ambientOcclusion )\n#else\nvec3( 1.0 )\n#endif\n' : 'vec3( 1.0 )';
      break;
    case 'emissive':
      colour = lit ? `clamp( ${srgb('totalEmissiveRadiance')}, 0.0, 1.0 )` : 'vec3( 0.0 )';
      break;
    default:
      return null;
  }
  return `gl_FragColor = vec4( ${colour}, 1.0 );`;
};

const setHook = (index: MaterialIndex, material: THREE.Material, view: ViewMode | null) => {
  const code = view ? channelCode(material, view) : null;
  const key = code ? `p3d-view:${view?.channel}:${view?.isolate}` : undefined;
  if (index.hooks.get(material) === key) return;
  const own = material as unknown as Record<string, unknown>;
  if (code && key) {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>\n${code}`
      );
    };
    material.customProgramCacheKey = () => key;
    index.hooks.set(material, key);
    index.hooked.add(material);
  } else {
    // back to three's own (the prototype's)
    delete own.onBeforeCompile;
    delete own.customProgramCacheKey;
    index.hooks.delete(material);
    index.hooked.delete(material);
  }
  material.needsUpdate = true;
};

// ---- applying ----

// Puts the edits and the channel view on the model: each mesh gets its
// loaded material, the visitor's version of it, or the UV checker
export const refreshMaterials = (index: MaterialIndex, edits: MaterialEdits, view: ViewMode) => {
  if (!index.alive) return;
  const hook = view.channel === 'lit' || view.channel === 'uv' ? null : view;
  for (const entry of index.entries.values()) {
    const edit = edits[entry.info.key];
    const edited = isEdited(edit);
    const lives = new Map<THREE.Material, THREE.Material>();
    if (edited && edit) {
      for (const original of entry.originals) lives.set(original, liveFor(index, entry, original, edit));
    }
    for (const use of entry.uses) {
      let material = lives.get(use.original) ?? use.original;
      if (view.channel === 'uv') material = checkerFor(index, use.mesh, material, view.uvSet);
      assign(use, material);
    }
    if (!edited) {
      for (const live of entry.lives.values()) {
        index.hooked.delete(live);
        live.dispose();
      }
      entry.lives.clear();
    }
    pruneTextures(entry, edited ? edit : undefined);
    for (const material of [...entry.originals, ...entry.lives.values()]) setHook(index, material, hook);
  }
};

// The glTF material (its key in the Materials tab) a mesh shows, in the
// slot `group` of its material list when it has one; null when it isn't one
// of the file's materials
export const materialKeyFor = (index: MaterialIndex, mesh: THREE.Object3D, group: number | null) => {
  for (const entry of index.entries.values()) {
    if (entry.uses.some((use) => use.mesh === mesh && (use.group === null || group === null || use.group === group))) {
      return entry.info.key;
    }
  }
  return null;
};

// Puts the loaded materials back and frees everything made here (the
// loaded materials and textures are freed with the model)
export const disposeMaterialIndex = (index: MaterialIndex) => {
  index.alive = false;
  index.onLoaded = null;
  for (const entry of index.entries.values()) {
    for (const use of entry.uses) assign(use, use.original);
    for (const original of entry.originals) setHook(index, original, null);
    for (const live of entry.lives.values()) live.dispose();
    entry.lives.clear();
    for (const texture of entry.loaded) texture.dispose();
    for (const item of Object.values(entry.replaced)) item?.texture.dispose();
    for (const item of Object.values(entry.moved)) item?.texture.dispose();
  }
  for (const checker of index.checkers.values()) checker.dispose();
  for (const texture of new Set(index.checkerTextures.values())) texture.dispose();
};
