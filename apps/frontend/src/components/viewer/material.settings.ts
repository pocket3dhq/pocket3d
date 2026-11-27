// The Materials tab's model: what the file says about each material, the
// visitor's edits on top of it, and the viewport's channel views.
//
// Everything shown comes from the glTF JSON, not from three.js: the loader
// changes some of it on the way (unlit materials become MeshBasicMaterial
// and lose their PBR textures, meshes without tangents get a copy of the
// material with the normal map's Y flipped, texCoord > 0 copies the
// texture). Edits stay on the visitor's screen, like the rest of the Adjust
// panel. No three.js here, so it's unit tested.

export type Rgb = [number, number, number];
export type AlphaMode = 'OPAQUE' | 'MASK' | 'BLEND';
// which part of a texture or colour to look at
export type Isolate = 'rgb' | 'r' | 'g' | 'b' | 'a';

// ---- texture slots ----

export const SLOTS = [
  'baseColor',
  'metallic',
  'roughness',
  'normal',
  'occlusion',
  'emissive',
  'transmission',
  'thickness',
  'clearcoat',
  'clearcoatRoughness',
  'clearcoatNormal',
  'sheenColor',
  'sheenRoughness',
] as const;
export type SlotId = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<SlotId, string> = {
  baseColor: 'Albedo',
  metallic: 'Metallic',
  roughness: 'Roughness',
  normal: 'Normal',
  occlusion: 'Occlusion',
  emissive: 'Emissive',
  transmission: 'Transmission',
  thickness: 'Thickness',
  clearcoat: 'Coat',
  clearcoatRoughness: 'Coat roughness',
  clearcoatNormal: 'Coat normal',
  sheenColor: 'Sheen colour',
  sheenRoughness: 'Sheen roughness',
};

// The channel of its texture each slot reads (glTF spec): a packed
// occlusion-roughness-metallic texture is R, G, B
export const SLOT_CHANNEL: Record<SlotId, Isolate> = {
  baseColor: 'rgb',
  metallic: 'b',
  roughness: 'g',
  normal: 'rgb',
  occlusion: 'r',
  emissive: 'rgb',
  transmission: 'r',
  thickness: 'g',
  clearcoat: 'r',
  clearcoatRoughness: 'g',
  clearcoatNormal: 'rgb',
  sheenColor: 'rgb',
  sheenRoughness: 'a',
};

// Colour textures are stored as sRGB, everything else as plain data
export const SRGB_SLOTS: readonly SlotId[] = ['baseColor', 'emissive', 'sheenColor'];
export const isSrgbSlot = (slot: SlotId) => SRGB_SLOTS.includes(slot);

// Unlit materials use only their base colour
export const UNLIT_SLOTS: readonly SlotId[] = ['baseColor'];

// ---- values ----

// Every value a material has, as the glTF spec defines it (colours are
// linear, as in the file)
export interface MaterialValues {
  doubleSided: boolean;
  unlit: boolean;
  baseColor: Rgb;
  // the base colour factor's alpha
  opacity: number;
  metallic: number;
  roughness: number;
  normalScale: number;
  occlusionStrength: number;
  alphaMode: AlphaMode;
  alphaCutoff: number;
  emissive: Rgb;
  emissiveStrength: number;
  transmission: number;
  ior: number;
  thickness: number;
  attenuationColor: Rgb;
  // Infinity: no absorption
  attenuationDistance: number;
  clearcoat: number;
  clearcoatRoughness: number;
  clearcoatNormalScale: number;
  sheenColor: Rgb;
  sheenRoughness: number;
}
export type ValueKey = keyof MaterialValues;

// The glTF spec's defaults (a material with nothing set)
export const SPEC_DEFAULTS: MaterialValues = {
  doubleSided: false,
  unlit: false,
  baseColor: [1, 1, 1],
  opacity: 1,
  metallic: 1,
  roughness: 1,
  normalScale: 1,
  occlusionStrength: 1,
  alphaMode: 'OPAQUE',
  alphaCutoff: 0.5,
  emissive: [0, 0, 0],
  emissiveStrength: 1,
  transmission: 0,
  ior: 1.5,
  thickness: 0,
  attenuationColor: [1, 1, 1],
  attenuationDistance: Infinity,
  clearcoat: 0,
  clearcoatRoughness: 0,
  clearcoatNormalScale: 1,
  sheenColor: [0, 0, 0],
  sheenRoughness: 0,
};

// The parts that switch on and off (LePoly's switches): on in the file when
// the material uses them
export const FEATURES = ['emission', 'transmission', 'ior', 'volume', 'clearcoat', 'sheen'] as const;
export type Feature = (typeof FEATURES)[number];
export type Features = Record<Feature, boolean>;

// Ranges for sliders and typed values. IOR stops where three does (2.333)
export const RANGES = {
  factor: [0, 1],
  normalScale: [0, 2],
  emissiveStrength: [0, 100],
  emissiveSlider: [0, 10],
  ior: [1, 2.333],
  thickness: [0, 1000],
  thicknessSlider: [0, 1],
  attenuationDistance: [0, 1e6],
} as const;

// ---- what the file says ----

export interface TextureTransform {
  offset: [number, number];
  scale: [number, number];
  // degrees
  rotation: number;
}

export interface SlotInfo {
  // the glTF texture index
  texture: number;
  // the UV set it reads (TEXCOORD_n)
  texCoord: number;
  transform: TextureTransform | null;
  // the textureInfo as written in the file, to load it later (unlit
  // materials' PBR textures are only loaded when Unlit is switched off)
  def: { index: number; texCoord?: number; extensions?: Record<string, unknown> };
}

export interface TextureFacts {
  index: number;
  name: string;
  // e.g. image/png; '' when the file doesn't say
  mimeType: string;
  // size of the image in the file, null when it's outside the .glb
  bytes: number | null;
  // e.g. "Repeat · Linear mipmaps"
  sampler: string;
}

export interface MaterialInfo {
  // the glTF index as a string, or 'default' for primitives without one
  key: string;
  index: number | null;
  name: string;
  // how many meshes and primitives use it
  meshes: number;
  primitives: number;
  // extensions on this material (KHR_materials_*), plus KHR_texture_transform
  extensions: string[];
  values: MaterialValues;
  features: Features;
  slots: Partial<Record<SlotId, SlotInfo>>;
  // occlusion and metallic-roughness come from one image (ORM)
  packed: boolean;
  // UV sets its primitives have (1 = TEXCOORD_0 only, 0 = none)
  uvSets: number;
  // read-only values of extensions the panel doesn't edit
  extras: { label: string; value: string }[];
}

export interface MaterialsReport {
  // the model file this describes
  src: string;
  materials: MaterialInfo[];
  textures: Record<number, TextureFacts>;
}

// The parts of the glTF JSON read here (the file can say anything: every
// field is checked before use)
type Json = Record<string, unknown>;
export interface GltfJson {
  materials?: unknown;
  meshes?: unknown;
  textures?: unknown;
  images?: unknown;
  bufferViews?: unknown;
  samplers?: unknown;
}

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && !Number.isNaN(value) ? value : fallback;
const rgb = (value: unknown, fallback: Rgb): Rgb =>
  Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every((v) => typeof v === 'number')
    ? [value[0], value[1], value[2]]
    : fallback;
const ext = (owner: Json | undefined, name: string): Json | undefined => {
  const extensions = owner?.extensions;
  return isObject(extensions) && isObject(extensions[name]) ? (extensions[name] as Json) : undefined;
};

const textureInfo = (value: unknown): SlotInfo | undefined => {
  if (!isObject(value) || typeof value.index !== 'number' || value.index < 0) return undefined;
  const texCoord = Math.max(0, Math.floor(num(value.texCoord, 0)));
  const transformDef = ext(value, 'KHR_texture_transform');
  const transform: TextureTransform | null = transformDef
    ? {
        offset: [num(list(transformDef.offset)[0], 0), num(list(transformDef.offset)[1], 0)],
        scale: [num(list(transformDef.scale)[0], 1), num(list(transformDef.scale)[1], 1)],
        rotation: (num(transformDef.rotation, 0) * 180) / Math.PI,
      }
    : null;
  // a transform can move the texture to another UV set
  const transformCoord = transformDef && typeof transformDef.texCoord === 'number' ? transformDef.texCoord : texCoord;
  const def: SlotInfo['def'] = { index: value.index };
  if (typeof value.texCoord === 'number') def.texCoord = value.texCoord;
  if (isObject(value.extensions)) def.extensions = value.extensions;
  return { texture: value.index, texCoord: transformCoord, transform, def };
};

// glTF sampler numbers → words
const WRAP: Record<number, string> = { 33071: 'Clamp', 33648: 'Mirror', 10497: 'Repeat' };
const MAG: Record<number, string> = { 9728: 'Nearest', 9729: 'Linear' };
const MIN: Record<number, string> = {
  9728: 'Nearest',
  9729: 'Linear',
  9984: 'Nearest mipmaps',
  9985: 'Linear, nearest mipmap',
  9986: 'Nearest, linear mipmaps',
  9987: 'Linear mipmaps',
};

const describeSampler = (sampler: Json | undefined) => {
  const wrapS = WRAP[num(sampler?.wrapS, 10497)] ?? 'Repeat';
  const wrapT = WRAP[num(sampler?.wrapT, 10497)] ?? 'Repeat';
  const wrap = wrapS === wrapT ? wrapS : `${wrapS} × ${wrapT}`;
  const filter = sampler && typeof sampler.minFilter === 'number' ? MIN[sampler.minFilter] : undefined;
  const mag = sampler && typeof sampler.magFilter === 'number' ? MAG[sampler.magFilter] : undefined;
  return [wrap, filter ?? mag ?? 'Linear mipmaps'].join(' · ');
};

// Base64 data URIs hold 3 bytes per 4 characters
const dataUriBytes = (uri: string) => {
  const comma = uri.indexOf(',');
  if (!uri.startsWith('data:') || comma < 0) return null;
  const data = uri.slice(comma + 1);
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  ktx2: 'image/ktx2',
};

const describeTextures = (json: GltfJson): Record<number, TextureFacts> => {
  const images = list(json.images);
  const bufferViews = list(json.bufferViews);
  const samplers = list(json.samplers);
  const facts: Record<number, TextureFacts> = {};
  list(json.textures).forEach((texture, index) => {
    if (!isObject(texture)) return;
    // the loader prefers an extension's image (WebP, AVIF, KTX2) when it has one
    const source =
      ['EXT_texture_webp', 'EXT_texture_avif', 'KHR_texture_basisu']
        .map((name) => ext(texture, name)?.source)
        .find((value) => typeof value === 'number') ?? texture.source;
    const image = typeof source === 'number' && isObject(images[source]) ? (images[source] as Json) : undefined;
    const uri = typeof image?.uri === 'string' ? image.uri : '';
    let mimeType = typeof image?.mimeType === 'string' ? image.mimeType : '';
    if (!mimeType && uri.startsWith('data:')) mimeType = uri.slice(5, uri.indexOf(';'));
    if (!mimeType && uri) mimeType = MIME_BY_EXTENSION[uri.split('?')[0].split('.').pop()?.toLowerCase() ?? ''] ?? '';
    let bytes: number | null = null;
    if (image && typeof image.bufferView === 'number' && isObject(bufferViews[image.bufferView])) {
      bytes = num((bufferViews[image.bufferView] as Json).byteLength, 0);
    } else if (uri) {
      bytes = dataUriBytes(uri);
    }
    const sampler = typeof texture.sampler === 'number' && isObject(samplers[texture.sampler]) ? (samplers[texture.sampler] as Json) : undefined;
    const name =
      (typeof texture.name === 'string' && texture.name) ||
      (typeof image?.name === 'string' && image.name) ||
      (uri && !uri.startsWith('data:') ? uri.split('/').pop() ?? '' : '') ||
      `Texture ${index}`;
    facts[index] = { index, name, mimeType, bytes, sampler: describeSampler(sampler) };
  });
  return facts;
};

// Which image a texture shows (two textures can share one image with
// different samplers)
const imageOf = (json: GltfJson, texture: number) => {
  const def = list(json.textures)[texture];
  return isObject(def) && typeof def.source === 'number' ? def.source : -1 - texture;
};

const formatNumber = (value: number) => String(Math.round(value * 1000) / 1000);

const describeMaterial = (json: GltfJson, def: Json, index: number): Omit<MaterialInfo, 'meshes' | 'primitives' | 'uvSets'> => {
  const pbr = isObject(def.pbrMetallicRoughness) ? def.pbrMetallicRoughness : undefined;
  const baseColorFactor = list(pbr?.baseColorFactor);
  const alphaMode: AlphaMode = def.alphaMode === 'MASK' || def.alphaMode === 'BLEND' ? def.alphaMode : 'OPAQUE';
  const transmission = ext(def, 'KHR_materials_transmission');
  const ior = ext(def, 'KHR_materials_ior');
  const volume = ext(def, 'KHR_materials_volume');
  const clearcoat = ext(def, 'KHR_materials_clearcoat');
  const sheen = ext(def, 'KHR_materials_sheen');
  const strength = ext(def, 'KHR_materials_emissive_strength');
  const normal = isObject(def.normalTexture) ? def.normalTexture : undefined;
  const occlusion = isObject(def.occlusionTexture) ? def.occlusionTexture : undefined;
  const clearcoatNormal = isObject(clearcoat?.clearcoatNormalTexture) ? clearcoat.clearcoatNormalTexture : undefined;

  const values: MaterialValues = {
    doubleSided: def.doubleSided === true,
    unlit: ext(def, 'KHR_materials_unlit') !== undefined,
    baseColor: rgb(baseColorFactor, SPEC_DEFAULTS.baseColor),
    opacity: num(baseColorFactor[3], 1),
    metallic: num(pbr?.metallicFactor, SPEC_DEFAULTS.metallic),
    roughness: num(pbr?.roughnessFactor, SPEC_DEFAULTS.roughness),
    normalScale: num(normal?.scale, 1),
    occlusionStrength: num(occlusion?.strength, 1),
    alphaMode,
    alphaCutoff: num(def.alphaCutoff, SPEC_DEFAULTS.alphaCutoff),
    emissive: rgb(def.emissiveFactor, SPEC_DEFAULTS.emissive),
    emissiveStrength: num(strength?.emissiveStrength, 1),
    transmission: num(transmission?.transmissionFactor, 0),
    ior: num(ior?.ior, SPEC_DEFAULTS.ior),
    thickness: num(volume?.thicknessFactor, 0),
    attenuationColor: rgb(volume?.attenuationColor, SPEC_DEFAULTS.attenuationColor),
    attenuationDistance: num(volume?.attenuationDistance, Infinity),
    clearcoat: num(clearcoat?.clearcoatFactor, 0),
    clearcoatRoughness: num(clearcoat?.clearcoatRoughnessFactor, 0),
    clearcoatNormalScale: num(clearcoatNormal?.scale, 1),
    sheenColor: rgb(sheen?.sheenColorFactor, SPEC_DEFAULTS.sheenColor),
    sheenRoughness: num(sheen?.sheenRoughnessFactor, 0),
  };

  const slots: Partial<Record<SlotId, SlotInfo>> = {};
  const put = (slot: SlotId, value: unknown) => {
    const info = textureInfo(value);
    if (info) slots[slot] = info;
  };
  put('baseColor', pbr?.baseColorTexture);
  put('metallic', pbr?.metallicRoughnessTexture);
  put('roughness', pbr?.metallicRoughnessTexture);
  put('normal', def.normalTexture);
  put('occlusion', def.occlusionTexture);
  put('emissive', def.emissiveTexture);
  put('transmission', transmission?.transmissionTexture);
  put('thickness', volume?.thicknessTexture);
  put('clearcoat', clearcoat?.clearcoatTexture);
  put('clearcoatRoughness', clearcoat?.clearcoatRoughnessTexture);
  put('clearcoatNormal', clearcoat?.clearcoatNormalTexture);
  put('sheenColor', sheen?.sheenColorTexture);
  put('sheenRoughness', sheen?.sheenRoughnessTexture);

  const features: Features = {
    emission: values.emissive.some((v) => v > 0),
    transmission: transmission !== undefined,
    ior: ior !== undefined,
    volume: volume !== undefined,
    clearcoat: clearcoat !== undefined,
    sheen: sheen !== undefined,
  };

  const packed =
    !!slots.occlusion && !!slots.metallic && imageOf(json, slots.occlusion.texture) === imageOf(json, slots.metallic.texture);

  const extensions = isObject(def.extensions) ? Object.keys(def.extensions) : [];
  const textureDefs = [
    pbr?.baseColorTexture,
    pbr?.metallicRoughnessTexture,
    def.normalTexture,
    def.occlusionTexture,
    def.emissiveTexture,
  ];
  if (textureDefs.some((t) => isObject(t) && ext(t, 'KHR_texture_transform'))) extensions.push('KHR_texture_transform');

  const extras: MaterialInfo['extras'] = [];
  const specular = ext(def, 'KHR_materials_specular');
  if (specular) {
    extras.push({ label: 'Specular', value: formatNumber(num(specular.specularFactor, 1)) });
    extras.push({ label: 'Specular colour', value: linearToHex(rgb(specular.specularColorFactor, [1, 1, 1])) });
  }
  const iridescence = ext(def, 'KHR_materials_iridescence');
  if (iridescence) {
    extras.push({ label: 'Iridescence', value: formatNumber(num(iridescence.iridescenceFactor, 0)) });
    extras.push({ label: 'Iridescence IOR', value: formatNumber(num(iridescence.iridescenceIor, 1.3)) });
    extras.push({
      label: 'Iridescence thickness',
      value: `${formatNumber(num(iridescence.iridescenceThicknessMinimum, 100))}–${formatNumber(
        num(iridescence.iridescenceThicknessMaximum, 400)
      )} nm`,
    });
  }
  const anisotropy = ext(def, 'KHR_materials_anisotropy');
  if (anisotropy) {
    extras.push({ label: 'Anisotropy', value: formatNumber(num(anisotropy.anisotropyStrength, 0)) });
    extras.push({
      label: 'Anisotropy rotation',
      value: `${formatNumber((num(anisotropy.anisotropyRotation, 0) * 180) / Math.PI)}°`,
    });
  }
  const dispersion = ext(def, 'KHR_materials_dispersion');
  if (dispersion) extras.push({ label: 'Dispersion', value: formatNumber(num(dispersion.dispersion, 0)) });

  return {
    key: String(index),
    index,
    name: typeof def.name === 'string' && def.name.trim() ? def.name.trim() : `Material ${index}`,
    extensions,
    values,
    features,
    slots,
    packed,
    extras,
  };
};

// Every material of the file, in the file's order, with what uses it.
// Primitives without a material get the spec's default one, listed last
export const describeMaterials = (json: GltfJson): Omit<MaterialsReport, 'src'> => {
  const usage = new Map<string, { meshes: Set<number>; primitives: number; uvSets: number }>();
  list(json.meshes).forEach((mesh, meshIndex) => {
    if (!isObject(mesh)) return;
    for (const primitive of list(mesh.primitives)) {
      if (!isObject(primitive)) continue;
      const key = typeof primitive.material === 'number' ? String(primitive.material) : 'default';
      const attributes = isObject(primitive.attributes) ? primitive.attributes : {};
      let uvSets = 0;
      while (typeof attributes[`TEXCOORD_${uvSets}`] === 'number') uvSets++;
      const entry = usage.get(key) ?? { meshes: new Set<number>(), primitives: 0, uvSets: Infinity };
      entry.meshes.add(meshIndex);
      entry.primitives++;
      // a UV set is usable when every primitive has it
      entry.uvSets = Math.min(entry.uvSets, uvSets);
      usage.set(key, entry);
    }
  });
  const used = (key: string) => {
    const entry = usage.get(key);
    return {
      meshes: entry?.meshes.size ?? 0,
      primitives: entry?.primitives ?? 0,
      uvSets: entry && Number.isFinite(entry.uvSets) ? entry.uvSets : 0,
    };
  };

  const materials: MaterialInfo[] = list(json.materials).map((def, index) => ({
    ...describeMaterial(json, isObject(def) ? def : {}, index),
    ...used(String(index)),
  }));
  if (usage.has('default')) {
    materials.push({
      key: 'default',
      index: null,
      name: 'Default material',
      extensions: [],
      values: { ...SPEC_DEFAULTS },
      features: { emission: false, transmission: false, ior: false, volume: false, clearcoat: false, sheen: false },
      slots: {},
      packed: false,
      extras: [],
      ...used('default'),
    });
  }
  return { materials, textures: describeTextures(json) };
};

// ---- the visitor's edits ----

// An image the visitor dropped in for a slot (decoded once, kept while the
// page is open)
export interface ReplacedImage {
  id: string;
  name: string;
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

export interface SlotEdit {
  // the texture switched off
  off?: boolean;
  // read from another UV set
  uvSet?: number;
  image?: ReplacedImage;
}

// Only what differs from the file
export interface MaterialEdit {
  values?: Partial<MaterialValues>;
  features?: Partial<Features>;
  slots?: Partial<Record<SlotId, SlotEdit>>;
}

// per material key
export type MaterialEdits = Record<string, MaterialEdit>;

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => v === b[i]) : a === b;

export const effectiveValues = (info: MaterialInfo, edit?: MaterialEdit): MaterialValues => ({
  ...info.values,
  ...edit?.values,
});

export const effectiveFeatures = (info: MaterialInfo, edit?: MaterialEdit): Features => ({
  ...info.features,
  ...edit?.features,
});

export interface SlotState {
  file: SlotInfo | undefined;
  off: boolean;
  uvSet: number;
  image: ReplacedImage | undefined;
  // a texture feeds this slot
  present: boolean;
}

export const slotState = (info: MaterialInfo, edit: MaterialEdit | undefined, slot: SlotId): SlotState => {
  const file = info.slots[slot];
  const own = edit?.slots?.[slot];
  const off = own?.off === true;
  const image = own?.image;
  return {
    file,
    off,
    uvSet: own?.uvSet ?? file?.texCoord ?? 0,
    image,
    present: !off && (!!image || !!file),
  };
};

const prune = (edit: MaterialEdit): MaterialEdit | undefined => {
  const out: MaterialEdit = {};
  if (edit.values && Object.keys(edit.values).length) out.values = edit.values;
  if (edit.features && Object.keys(edit.features).length) out.features = edit.features;
  if (edit.slots) {
    const slots: Partial<Record<SlotId, SlotEdit>> = {};
    for (const [slot, value] of Object.entries(edit.slots) as [SlotId, SlotEdit][]) {
      if (value && Object.keys(value).length) slots[slot] = value;
    }
    if (Object.keys(slots).length) out.slots = slots;
  }
  return Object.keys(out).length ? out : undefined;
};

export const isEdited = (edit: MaterialEdit | undefined) => !!edit && prune(edit) !== undefined;

// The edit with one value set; a value back at the file's is no edit
export const withValue = <K extends ValueKey>(
  info: MaterialInfo,
  edit: MaterialEdit | undefined,
  key: K,
  value: MaterialValues[K]
): MaterialEdit | undefined => {
  const values = { ...edit?.values };
  if (same(value, info.values[key])) delete values[key];
  else values[key] = value;
  return prune({ ...edit, values });
};

export const withFeature = (
  info: MaterialInfo,
  edit: MaterialEdit | undefined,
  feature: Feature,
  on: boolean
): MaterialEdit | undefined => {
  const features = { ...edit?.features };
  if (on === info.features[feature]) delete features[feature];
  else features[feature] = on;
  return prune({ ...edit, features });
};

// `patch` fields set to undefined are cleared
export const withSlot = (
  info: MaterialInfo,
  edit: MaterialEdit | undefined,
  slot: SlotId,
  patch: SlotEdit
): MaterialEdit | undefined => {
  const next: SlotEdit = { ...edit?.slots?.[slot], ...patch };
  if (!next.off) delete next.off;
  if (next.uvSet === undefined || next.uvSet === (info.slots[slot]?.texCoord ?? 0)) delete next.uvSet;
  if (!next.image) delete next.image;
  return prune({ ...edit, slots: { ...edit?.slots, [slot]: next } });
};

// A value differs from the file
export const valueChanged = (edit: MaterialEdit | undefined, key: ValueKey) => edit?.values?.[key] !== undefined;
export const slotChanged = (edit: MaterialEdit | undefined, slot: SlotId) => edit?.slots?.[slot] !== undefined;
export const featureChanged = (edit: MaterialEdit | undefined, feature: Feature) =>
  edit?.features?.[feature] !== undefined;

// The edits with one material's replaced: empty edits are dropped
export const setEdit = (edits: MaterialEdits, key: string, edit: MaterialEdit | undefined): MaterialEdits => {
  const next = { ...edits };
  const pruned = edit && prune(edit);
  if (pruned) next[key] = pruned;
  else delete next[key];
  return next;
};

export const imagesIn = (edits: MaterialEdits): ReplacedImage[] =>
  Object.values(edits).flatMap((edit) =>
    Object.values(edit.slots ?? {}).flatMap((slot) => (slot?.image ? [slot.image] : []))
  );

// Images in `before` that `after` no longer uses (to free them)
export const droppedImages = (before: MaterialEdits[], after: MaterialEdits[]) => {
  const kept = new Set(after.flatMap(imagesIn).map((image) => image.id));
  const seen = new Set<string>();
  return before.flatMap(imagesIn).filter((image) => {
    if (kept.has(image.id) || seen.has(image.id)) return false;
    seen.add(image.id);
    return true;
  });
};

// Switching a part on: a starting value that shows something, if the file's
// would show nothing (a black sheen, no coat)
export const turnOnValues = (values: MaterialValues, feature: Feature): Partial<MaterialValues> => {
  switch (feature) {
    case 'emission':
      return values.emissive.every((v) => v === 0) ? { emissive: [1, 1, 1] } : {};
    case 'transmission':
      return values.transmission === 0 ? { transmission: 1 } : {};
    case 'clearcoat':
      return values.clearcoat === 0 ? { clearcoat: 1 } : {};
    case 'sheen':
      return values.sheenColor.every((v) => v === 0) ? { sheenColor: [1, 1, 1] } : {};
    default:
      return {};
  }
};

// ---- colours ----

const toByte = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
const srgbEncode = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const srgbDecode = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// Linear factors (as in the file) → "#rrggbb" in sRGB (as colour pickers,
// Blender and Substance show them)
export const linearToHex = (colour: Rgb) =>
  `#${colour.map((c) => toByte(srgbEncode(Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

// "#rrggbb" (sRGB) → linear factors, or null if unreadable. "#fff" works too
export const hexToLinear = (hex: string): Rgb | null => {
  let text = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(text)) text = text.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(text)) return null;
  return [0, 2, 4].map((i) => {
    const linear = srgbDecode(parseInt(text.slice(i, i + 2), 16) / 255);
    return Math.round(linear * 1e6) / 1e6;
  }) as Rgb;
};

export const formatLinear = (colour: Rgb) => colour.map((c) => c.toFixed(3)).join(', ');

// ---- numbers ----

export const formatFactor = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : '∞');

export const parseFactor = (text: string): number | null => {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) ? value : null;
};

// Attenuation distance: '∞' (or empty, "inf") is no absorption
export const parseDistance = (text: string): number | null => {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === '' || trimmed === '∞' || trimmed === 'inf' || trimmed === 'infinity') return Infinity;
  const value = parseFactor(trimmed);
  return value !== null && value > 0 ? value : null;
};

export const clampTo = (value: number, [min, max]: readonly [number, number]) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : value;

// Texture memory on the graphics card: RGBA 8-bit plus mipmaps (a third more)
export const gpuBytes = (width: number, height: number) => Math.round((width * height * 4 * 4) / 3);

export const isPowerOfTwo = (value: number) => value > 0 && (value & (value - 1)) === 0;

export const formatMime = (mimeType: string) => {
  const kind = mimeType.split('/')[1];
  return kind ? kind.replace('jpeg', 'jpg').toUpperCase() : 'Unknown';
};

// ---- channel views ----

export type ChannelView = 'lit' | 'baseColor' | 'metallic' | 'roughness' | 'normal' | 'occlusion' | 'emissive' | 'alpha' | 'uv';

export const CHANNEL_VIEWS: { id: ChannelView; label: string }[] = [
  { id: 'lit', label: 'Lit' },
  { id: 'baseColor', label: 'Base colour' },
  { id: 'metallic', label: 'Metallic' },
  { id: 'roughness', label: 'Roughness' },
  { id: 'normal', label: 'Normal' },
  { id: 'occlusion', label: 'Occlusion' },
  { id: 'emissive', label: 'Emissive' },
  { id: 'alpha', label: 'Alpha' },
  { id: 'uv', label: 'UV checker' },
];

export const CHANNEL_HINTS: Record<ChannelView, string> = {
  lit: 'The model as it renders.',
  baseColor: 'Base colour factor × texture × vertex colour, without light.',
  metallic: 'Metallic as shading uses it (factor × texture): black is dielectric, white is metal.',
  roughness: 'Roughness as shading uses it (factor × texture): black is glossy, white is matte.',
  normal: 'The shading normal in world space, normal map included (X red, Y green, Z blue).',
  occlusion: 'The occlusion texture at its strength: white is open, black is fully occluded.',
  emissive: 'Emitted light (colour × texture × strength), clipped at white.',
  alpha: 'Alpha as rendered: white is opaque. Opaque materials ignore alpha and show white.',
  uv: 'A numbered checker on the UV set: stretching, seams and flipped islands show. Magenta: the mesh has no such UV set.',
};

export interface ViewMode {
  channel: ChannelView;
  // for Base colour: one channel only
  isolate: Isolate;
  // for UV checker
  uvSet: number;
}

export const DEFAULT_VIEW: ViewMode = { channel: 'lit', isolate: 'rgb', uvSet: 0 };

// The channel view the eye on a property's row turns on
export const SLOT_VIEW: Partial<Record<SlotId, ChannelView>> = {
  baseColor: 'baseColor',
  metallic: 'metallic',
  roughness: 'roughness',
  normal: 'normal',
  occlusion: 'occlusion',
  emissive: 'emissive',
};

export const ISOLATES: { id: Isolate; label: string }[] = [
  { id: 'rgb', label: 'RGB' },
  { id: 'r', label: 'R' },
  { id: 'g', label: 'G' },
  { id: 'b', label: 'B' },
  { id: 'a', label: 'A' },
];

export const nextIsolate = (isolate: Isolate): Isolate => {
  const index = ISOLATES.findIndex((item) => item.id === isolate);
  return ISOLATES[(index + 1) % ISOLATES.length].id;
};

// three's attribute name for a UV set
export const uvAttribute = (set: number) => (set === 0 ? 'uv' : `uv${set}`);
