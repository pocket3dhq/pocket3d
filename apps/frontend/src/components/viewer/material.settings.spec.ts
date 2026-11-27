import {
  clampTo,
  describeMaterials,
  droppedImages,
  effectiveFeatures,
  effectiveValues,
  formatFactor,
  formatMime,
  gpuBytes,
  GltfJson,
  hexToLinear,
  isEdited,
  isPowerOfTwo,
  linearToHex,
  MaterialEdits,
  nextIsolate,
  parseDistance,
  parseFactor,
  RANGES,
  ReplacedImage,
  setEdit,
  slotState,
  SPEC_DEFAULTS,
  turnOnValues,
  uvAttribute,
  withFeature,
  withSlot,
  withValue,
} from './material.settings';

// A file with one of each case the panel cares about
const FILE: GltfJson = {
  materials: [
    {
      name: 'Helmet',
      pbrMetallicRoughness: {
        baseColorFactor: [0.5, 0.25, 1, 0.8],
        baseColorTexture: { index: 0 },
        metallicRoughnessTexture: { index: 1 },
        metallicFactor: 0.2,
      },
      normalTexture: { index: 2, scale: 0.5 },
      occlusionTexture: { index: 1, strength: 0.7 },
      emissiveTexture: { index: 3, texCoord: 1 },
      emissiveFactor: [1, 0.5, 0],
      extensions: { KHR_materials_emissive_strength: { emissiveStrength: 4 } },
      alphaMode: 'BLEND',
      doubleSided: true,
    },
    {
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0, extensions: { KHR_texture_transform: { offset: [0.5, 0], scale: [2, 2], rotation: Math.PI / 2 } } },
        metallicRoughnessTexture: { index: 4 },
      },
      occlusionTexture: { index: 1 },
      extensions: { KHR_materials_unlit: {} },
      alphaMode: 'MASK',
      alphaCutoff: 0.3,
    },
    {
      name: 'Glass',
      extensions: {
        KHR_materials_transmission: { transmissionFactor: 0.9 },
        KHR_materials_volume: { thicknessFactor: 0.1, attenuationColor: [1, 0.5, 0.5] },
        KHR_materials_ior: { ior: 1.45 },
        KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatNormalTexture: { index: 2, scale: 0.3 } },
        KHR_materials_sheen: { sheenColorFactor: [1, 1, 1], sheenRoughnessFactor: 0.4 },
        KHR_materials_specular: { specularFactor: 0.5 },
        KHR_materials_dispersion: { dispersion: 0.2 },
      },
    },
    // nonsense from a broken exporter: nothing may throw
    { name: 42, pbrMetallicRoughness: { baseColorFactor: 'red', metallicFactor: null }, alphaMode: 'WHAT', normalTexture: { index: -1 } },
  ],
  meshes: [
    {
      primitives: [
        { attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2 }, material: 0 },
        { attributes: { POSITION: 3, TEXCOORD_0: 4 }, material: 1 },
      ],
    },
    { primitives: [{ attributes: { POSITION: 5 }, material: 0 }, { attributes: { POSITION: 6 } }] },
    { primitives: [{ attributes: { POSITION: 7, TEXCOORD_0: 8, TEXCOORD_1: 9 }, material: 2 }] },
  ],
  textures: [
    { source: 0, sampler: 0 },
    { source: 1, name: 'ORM' },
    { source: 2 },
    { source: 3, extensions: { EXT_texture_webp: { source: 4 } } },
    { source: 1, sampler: 1 },
  ],
  images: [
    { bufferView: 0, mimeType: 'image/png', name: 'albedo' },
    { bufferView: 1, mimeType: 'image/jpeg' },
    { uri: 'data:image/png;base64,AAAA' },
    { uri: 'textures/emit.png' },
    { bufferView: 2, mimeType: 'image/webp' },
  ],
  bufferViews: [{ byteLength: 1000 }, { byteLength: 2000 }, { byteLength: 3000 }],
  samplers: [{ wrapS: 33071, wrapT: 33071, magFilter: 9728, minFilter: 9728 }, { wrapS: 10497, wrapT: 33648 }],
};

const report = describeMaterials(FILE);
const [helmet, unlit, glass, broken, fallback] = report.materials;

const image = (id: string): ReplacedImage => ({ id, name: `${id}.png`, width: 4, height: 4, bitmap: {} as ImageBitmap });

describe('describeMaterials', () => {
  it('reads the values as written, linear, with the spec defaults for the rest', () => {
    expect(helmet.name).toBe('Helmet');
    expect(helmet.values).toMatchObject({
      baseColor: [0.5, 0.25, 1],
      opacity: 0.8,
      metallic: 0.2,
      // not written: the spec's 1
      roughness: 1,
      normalScale: 0.5,
      occlusionStrength: 0.7,
      emissive: [1, 0.5, 0],
      emissiveStrength: 4,
      alphaMode: 'BLEND',
      doubleSided: true,
      unlit: false,
      attenuationDistance: Infinity,
      ior: 1.5,
    });
    expect(helmet.features).toEqual({
      emission: true,
      transmission: false,
      ior: false,
      volume: false,
      clearcoat: false,
      sheen: false,
    });
  });

  it('finds the texture slots, their UV set and transform', () => {
    expect(helmet.slots.baseColor).toMatchObject({ texture: 0, texCoord: 0, transform: null });
    expect(helmet.slots.metallic?.texture).toBe(1);
    expect(helmet.slots.roughness?.texture).toBe(1);
    expect(helmet.slots.emissive).toMatchObject({ texture: 3, texCoord: 1 });
    expect(helmet.slots.emissive?.def).toEqual({ index: 3, texCoord: 1 });
    expect(unlit.slots.baseColor?.transform).toEqual({ offset: [0.5, 0], scale: [2, 2], rotation: 90 });
    expect(unlit.extensions).toEqual(['KHR_materials_unlit', 'KHR_texture_transform']);
  });

  it('tells a packed occlusion-roughness-metallic image from separate ones', () => {
    // same texture
    expect(helmet.packed).toBe(true);
    // another texture, same image (different sampler)
    expect(unlit.packed).toBe(true);
    expect(glass.packed).toBe(false);
  });

  it('keeps the PBR fallback values of an unlit material, and its alpha mode', () => {
    expect(unlit.name).toBe('Material 1');
    expect(unlit.values).toMatchObject({ unlit: true, alphaMode: 'MASK', alphaCutoff: 0.3, metallic: 1, roughness: 1 });
  });

  it('reads the physical extensions and lists the ones it does not edit', () => {
    expect(glass.values).toMatchObject({
      transmission: 0.9,
      thickness: 0.1,
      attenuationColor: [1, 0.5, 0.5],
      attenuationDistance: Infinity,
      ior: 1.45,
      clearcoat: 1,
      clearcoatNormalScale: 0.3,
      sheenColor: [1, 1, 1],
      sheenRoughness: 0.4,
    });
    expect(glass.features).toMatchObject({ transmission: true, volume: true, ior: true, clearcoat: true, sheen: true, emission: false });
    expect(glass.slots.clearcoatNormal?.texture).toBe(2);
    expect(glass.extras).toEqual([
      { label: 'Specular', value: '0.5' },
      { label: 'Specular colour', value: '#FFFFFF' },
      { label: 'Dispersion', value: '0.2' },
    ]);
  });

  it('survives a broken material', () => {
    expect(broken.name).toBe('Material 3');
    expect(broken.values).toMatchObject({ baseColor: [1, 1, 1], metallic: 1, alphaMode: 'OPAQUE' });
    expect(broken.slots).toEqual({});
    expect(describeMaterials({ materials: 'x', meshes: [null, { primitives: 'y' }] } as unknown as GltfJson)).toEqual({
      materials: [],
      textures: {},
    });
  });

  it('counts what uses each material, and the UV sets all of its primitives have', () => {
    expect(helmet).toMatchObject({ meshes: 2, primitives: 2, uvSets: 0 });
    expect(unlit).toMatchObject({ meshes: 1, primitives: 1, uvSets: 1 });
    expect(glass).toMatchObject({ meshes: 1, primitives: 1, uvSets: 2 });
    expect(broken).toMatchObject({ meshes: 0, primitives: 0 });
  });

  it('adds the default material for primitives without one', () => {
    expect(fallback).toMatchObject({ key: 'default', index: null, name: 'Default material', primitives: 1 });
    expect(fallback.values).toEqual(SPEC_DEFAULTS);
    expect(describeMaterials({ materials: [{}], meshes: [{ primitives: [{ attributes: {}, material: 0 }] }] }).materials).toHaveLength(1);
  });

  it('describes textures: name, format, size in the file, sampler', () => {
    expect(report.textures[0]).toEqual({ index: 0, name: 'albedo', mimeType: 'image/png', bytes: 1000, sampler: 'Clamp · Nearest' });
    expect(report.textures[1]).toMatchObject({ name: 'ORM', mimeType: 'image/jpeg', bytes: 2000, sampler: 'Repeat · Linear mipmaps' });
    expect(report.textures[2]).toMatchObject({ name: 'Texture 2', mimeType: 'image/png', bytes: 3 });
    // the WebP extension's image is the one loaded
    expect(report.textures[3]).toMatchObject({ mimeType: 'image/webp', bytes: 3000 });
    expect(report.textures[4].sampler).toBe('Repeat × Mirror · Linear mipmaps');
  });
});

describe('edits', () => {
  it('keeps only what differs from the file', () => {
    let edit = withValue(helmet, undefined, 'roughness', 0.4);
    expect(edit).toEqual({ values: { roughness: 0.4 } });
    expect(isEdited(edit)).toBe(true);
    expect(effectiveValues(helmet, edit).roughness).toBe(0.4);
    edit = withValue(helmet, edit, 'roughness', 1);
    expect(edit).toBeUndefined();
    expect(isEdited(edit)).toBe(false);
    // colours compare by value
    expect(withValue(helmet, undefined, 'baseColor', [0.5, 0.25, 1])).toBeUndefined();
  });

  it('switches parts on and off against the file', () => {
    const edit = withFeature(helmet, undefined, 'emission', false);
    expect(effectiveFeatures(helmet, edit).emission).toBe(false);
    expect(withFeature(helmet, edit, 'emission', true)).toBeUndefined();
  });

  it('turns a texture off, moves it to another UV set, replaces it, and back', () => {
    let edit = withSlot(helmet, undefined, 'normal', { off: true });
    expect(slotState(helmet, edit, 'normal')).toMatchObject({ off: true, present: false });
    edit = withSlot(helmet, edit, 'normal', { off: false });
    expect(edit).toBeUndefined();

    edit = withSlot(helmet, undefined, 'emissive', { uvSet: 0 });
    expect(slotState(helmet, edit, 'emissive').uvSet).toBe(0);
    // back to the file's set: no edit
    expect(withSlot(helmet, edit, 'emissive', { uvSet: 1 })).toBeUndefined();

    const picture = image('a');
    edit = withSlot(helmet, undefined, 'sheenColor', { image: picture });
    expect(slotState(helmet, edit, 'sheenColor')).toMatchObject({ present: true, image: picture, file: undefined });
    expect(withSlot(helmet, edit, 'sheenColor', { image: undefined })).toBeUndefined();
  });

  it('drops empty materials from the edits', () => {
    const edits: MaterialEdits = setEdit({}, '0', withValue(helmet, undefined, 'metallic', 1));
    expect(edits).toEqual({ '0': { values: { metallic: 1 } } });
    expect(setEdit(edits, '0', withValue(helmet, edits['0'], 'metallic', 0.2))).toEqual({});
  });

  it('finds the replaced images no longer used, once each', () => {
    const a = image('a');
    const b = image('b');
    const before: MaterialEdits[] = [
      { '0': { slots: { baseColor: { image: a }, normal: { image: b } } } },
      { '1': { slots: { baseColor: { image: a } } } },
    ];
    const after: MaterialEdits[] = [{ '0': { slots: { normal: { image: b } } } }, {}];
    expect(droppedImages(before, after)).toEqual([a]);
    expect(droppedImages(before, before)).toEqual([]);
  });

  it('starts a part that would show nothing with a visible value', () => {
    expect(turnOnValues(SPEC_DEFAULTS, 'sheen')).toEqual({ sheenColor: [1, 1, 1] });
    expect(turnOnValues(SPEC_DEFAULTS, 'clearcoat')).toEqual({ clearcoat: 1 });
    expect(turnOnValues(SPEC_DEFAULTS, 'emission')).toEqual({ emissive: [1, 1, 1] });
    expect(turnOnValues(glass.values, 'sheen')).toEqual({});
    expect(turnOnValues(SPEC_DEFAULTS, 'ior')).toEqual({});
  });
});

describe('colours and numbers', () => {
  it('shows linear factors as sRGB hex, and reads hex back to linear', () => {
    expect(linearToHex([1, 1, 1])).toBe('#FFFFFF');
    expect(linearToHex([0, 0, 0])).toBe('#000000');
    // linear 0.5 is sRGB 188
    expect(linearToHex([0.5, 0.5, 0.5])).toBe('#BCBCBC');
    // out of range is clipped
    expect(linearToHex([2, -1, 0])).toBe('#FF0000');
    const linear = hexToLinear('#bcbcbc');
    expect(linear?.[0]).toBeCloseTo(0.5029, 3);
    expect(hexToLinear('fff')).toEqual([1, 1, 1]);
    expect(hexToLinear('#12345')).toBeNull();
    expect(hexToLinear('nope')).toBeNull();
  });

  it('formats and reads factors and distances', () => {
    expect(formatFactor(0.456)).toBe('0.46');
    expect(formatFactor(Infinity)).toBe('∞');
    expect(parseFactor(' 0,5 ')).toBe(0.5);
    expect(parseFactor('')).toBeNull();
    expect(parseFactor('abc')).toBeNull();
    expect(parseDistance('∞')).toBe(Infinity);
    expect(parseDistance('')).toBe(Infinity);
    expect(parseDistance('inf')).toBe(Infinity);
    expect(parseDistance('2.5')).toBe(2.5);
    expect(parseDistance('0')).toBeNull();
    expect(parseDistance('-1')).toBeNull();
    expect(clampTo(3, RANGES.ior)).toBe(2.333);
    expect(clampTo(Infinity, RANGES.factor)).toBe(Infinity);
  });

  it('estimates texture memory and flags odd sizes', () => {
    // 1k RGBA with mipmaps ≈ 5.3 MB
    expect(gpuBytes(1024, 1024)).toBe(5592405);
    expect(isPowerOfTwo(2048)).toBe(true);
    expect(isPowerOfTwo(1000)).toBe(false);
    expect(formatMime('image/jpeg')).toBe('JPG');
    expect(formatMime('')).toBe('Unknown');
  });

  it('cycles channels and names UV attributes as three does', () => {
    expect(nextIsolate('rgb')).toBe('r');
    expect(nextIsolate('a')).toBe('rgb');
    expect(uvAttribute(0)).toBe('uv');
    expect(uvAttribute(2)).toBe('uv2');
  });
});
