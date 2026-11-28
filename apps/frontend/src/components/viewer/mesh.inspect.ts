// The Mesh tab on the three.js side: the object tree and its numbers, the
// surface looks (solid, front/back, off), the wireframe, vertex dots,
// normals, bounding boxes, picking and hiding parts.
//
// It reads only the three object graph (never the glTF JSON), so any loader
// works: OBJ, FBX or USD meshes come out the same. A loader that knows the
// real faces adds polygon ids on the geometry (mesh.stats.ts, POLYGONS_KEY).
//
// The loaded materials and geometry are never changed. Overlays are extra
// objects: the wireframe is a copy of each mesh (same class, so skinned,
// morphing and instanced meshes keep matching) added as its child; dots,
// normals and boxes live in the stage's inspection groups, outside the model
// so its box (ground, framing) never changes. With DEFAULT_MESH_VIEW nothing
// here exists and the picture is as it always was.

import * as THREE from 'three';
import { preciseBox } from './bounds';
import {
  analyzeGeometry,
  Drawable,
  DrawableKind,
  GeometryDetails,
  GeometryFacts,
  POLYGONS_KEY,
  runChunked,
  summarize,
  wireBarycentrics,
} from './mesh.stats';
import {
  hideTarget,
  isWithin,
  MAX_DOTS,
  MAX_NORMALS,
  MeshNode,
  MeshReport,
  MeshView,
  NodeKind,
  parsePartId,
  partId,
  showsWire,
  Surface,
  WireEdges,
} from './mesh.settings';

// Marks the objects made here (stage traversals and picks skip them)
export const OVERLAY_KEY = 'p3dOverlay';

// Marks a mesh that is one material's share of a mesh in the file (glTF: a
// primitive of a mesh with several, which three loads as one mesh each under
// the node). three makes its name up ("Hand_Hours_1"): it's listed by its
// material's name instead
export const PRIMITIVE_KEY = 'p3dPrimitive';
export const isOverlay = (object: THREE.Object3D) => !!object.userData[OVERLAY_KEY];

type DrawObject = THREE.Mesh | THREE.Line | THREE.Points;

interface Item {
  id: string;
  object: THREE.Object3D;
  name: string;
  depth: number;
  parent: string | null;
  kind: NodeKind;
  hasChildren: boolean;
  // as the file has it (a file can hide a node itself)
  visible: boolean;
}

interface Draw {
  id: string;
  object: DrawObject;
  drawable: Drawable;
}

// One material group of a mesh with several (the tree lists them)
interface Part {
  id: string;
  draw: Draw;
  group: number;
  drawable: Drawable;
}

// A mesh drawn in parts: several material groups, with a material list
// (three draws a mesh with one material whole, whatever its groups say)
const groupsOf = (object: DrawObject) =>
  (object as THREE.Mesh).isMesh && Array.isArray(object.material) && object.geometry.groups.length > 1
    ? object.geometry.groups
    : [];

interface Wire {
  geometry: THREE.BufferGeometry;
  // the edges its barycentrics draw now
  edges: WireEdges | null;
  // its attributes are the source's own (a non-indexed source): disposing
  // it would free the source's buffers
  shared: boolean;
}

interface Surfaces {
  // the materials a mesh had before an override, per slot
  stored: WeakMap<THREE.Mesh, { list: THREE.Material[]; array: boolean }>;
  ours: WeakSet<object>;
  clay: Map<string, THREE.MeshStandardMaterial>;
  orientation: THREE.MeshBasicMaterial | null;
  depth: THREE.MeshBasicMaterial | null;
  invisible: THREE.MeshBasicMaterial | null;
  surface: Surface;
}

// The colours of the overlays, from the page's CSS variables
interface Palette {
  wire: THREE.Color;
  selection: THREE.Color;
  vertex: THREE.Color;
  normal: THREE.Color;
  bbox: THREE.Color;
  clay: THREE.Color;
  front: THREE.Color;
  back: THREE.Color;
}

export interface InspectionGroups {
  // follows the model's holder (the visitor's Scene settings): dots, normals
  model: THREE.Group;
  // world space: boxes
  world: THREE.Group;
}

export interface MeshIndex {
  root: THREE.Object3D;
  items: Item[];
  byId: Map<string, Item>;
  draws: Draw[];
  byObject: Map<THREE.Object3D, Draw>;
  parts: Part[];
  details: Map<THREE.BufferGeometry, GeometryDetails>;
  pending: Promise<void> | null;
  detailed: boolean;
  wires: Map<THREE.BufferGeometry, Wire>;
  overlays: Map<THREE.Mesh, THREE.Mesh>;
  wireMaterial: THREE.MeshBasicMaterial | null;
  selectedMaterial: THREE.MeshBasicMaterial | null;
  surfaces: Surfaces;
  palette: Palette;
  dots: { key: string; object: THREE.Object3D } | null;
  normals: { key: string; object: THREE.Object3D } | null;
  boxes: THREE.LineSegments | null;
  hidden: string[];
  alive: boolean;
}

// ---- colours ----

const cssColour = (name: string, fallback: string) => {
  const raw = typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(`--p3d-${name}`);
  const [r, g, b] = (raw.trim() || fallback).split(/\s+/).map(Number);
  return new THREE.Color().setRGB((r || 0) / 255, (g || 0) / 255, (b || 0) / 255, THREE.SRGBColorSpace);
};

// the fallbacks only matter if a variable goes missing (colors.scss holds them)
const readPalette = (): Palette => ({
  wire: cssColour('wire', '230 230 230'),
  selection: cssColour('accent', '0 128 255'),
  vertex: cssColour('vertex', '255 150 60'),
  normal: cssColour('normal', '70 215 230'),
  bbox: cssColour('bbox', '250 204 21'),
  clay: cssColour('clay', '128 128 128'),
  front: cssColour('face-front', '70 120 230'),
  back: cssColour('face-back', '220 60 60'),
});

// ---- the tree ----

const isDrawable = (object: THREE.Object3D): object is DrawObject =>
  !isOverlay(object) &&
  ((object as THREE.Mesh).isMesh || (object as THREE.Line).isLine || (object as THREE.Points).isPoints) &&
  !!(object as THREE.Mesh).geometry?.getAttribute('position');

const drawKind = (object: DrawObject): DrawableKind =>
  (object as THREE.Mesh).isMesh ? 'mesh' : (object as THREE.Line).isLine ? 'line' : 'points';

const materialList = (object: DrawObject): THREE.Material[] =>
  (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean);

const UV_NAMES = ['uv', 'uv1', 'uv2', 'uv3'];

const hasTexture = (material: THREE.Material) =>
  Object.values(material).some((value) => value instanceof THREE.Texture);

const elementCount = (geometry: THREE.BufferGeometry) =>
  geometry.index ? geometry.index.count : geometry.getAttribute('position').count;

const factsOf = (object: DrawObject, kind: DrawableKind): GeometryFacts => {
  const geometry = object.geometry;
  const count = elementCount(geometry);
  const line = object as THREE.Line;
  const segments =
    kind !== 'line'
      ? 0
      : (line as THREE.LineSegments).isLineSegments
        ? Math.floor(count / 2)
        : (line as THREE.LineLoop).isLineLoop
          ? count
          : Math.max(0, count - 1);
  return {
    gpuVertices: geometry.getAttribute('position').count,
    triangles: kind === 'mesh' ? Math.floor(count / 3) : 0,
    segments,
    points: kind === 'points' ? count : 0,
    normals: !!geometry.getAttribute('normal'),
    uvSets: UV_NAMES.filter((name) => geometry.getAttribute(name)).length,
    tangents: !!geometry.getAttribute('tangent'),
    colours: !!geometry.getAttribute('color'),
    morphTargets: geometry.morphAttributes.position?.length ?? 0,
  };
};

const drawableOf = (object: DrawObject): Drawable => {
  const kind = drawKind(object);
  const facts = factsOf(object, kind);
  const materials = materialList(object);
  const skinned = object as THREE.SkinnedMesh;
  return {
    kind,
    instances: (object as THREE.InstancedMesh).isInstancedMesh ? (object as THREE.InstancedMesh).count : 1,
    facts,
    details: null,
    drawCalls: Array.isArray(object.material) ? Math.max(1, object.geometry.groups.length) : 1,
    materials: materials.map((material) => material.uuid),
    bones: skinned.isSkinnedMesh ? skinned.skeleton?.bones.length ?? 0 : 0,
    texturedWithoutUv: kind === 'mesh' && facts.uvSets === 0 && materials.some(hasTexture),
  };
};

// A part's own numbers: its triangles, the vertices it uses, its material
const partDrawable = (draw: Draw, group: THREE.GeometryGroup): Drawable => {
  const geometry = draw.object.geometry;
  const position = geometry.getAttribute('position');
  const start = Math.max(0, group.start);
  const end = Math.min(elementCount(geometry), group.start + group.count);
  const used = new Uint8Array(position.count);
  let vertices = 0;
  for (let i = start; i < end; i++) {
    const v = geometry.index ? geometry.index.getX(i) : i;
    if (!used[v]) {
      used[v] = 1;
      vertices++;
    }
  }
  const material = Array.isArray(draw.object.material) ? draw.object.material[group.materialIndex ?? 0] : draw.object.material;
  const facts = { ...draw.drawable.facts, gpuVertices: vertices, triangles: Math.floor(Math.max(0, end - start) / 3) };
  return {
    ...draw.drawable,
    facts,
    details: null,
    drawCalls: 1,
    materials: material ? [material.uuid] : [],
    texturedWithoutUv: facts.uvSets === 0 && !!material && hasTexture(material),
  };
};

const partName = (object: DrawObject, group: THREE.GeometryGroup, number: number) => {
  const material = Array.isArray(object.material) ? object.material[group.materialIndex ?? 0] : object.material;
  return material?.name || `Part ${number}`;
};

// The name as the file wrote it: three's glTF loader makes object names
// safe for animation paths ("Crate 7" → "Crate_7") and keeps the original
// in userData.name. A primitive goes by its material's name
const displayName = (object: THREE.Object3D) => {
  if (typeof object.userData.name === 'string' && object.userData.name) return object.userData.name;
  if (object.userData[PRIMITIVE_KEY]) {
    const material = (object as THREE.Mesh).material;
    const name = (Array.isArray(material) ? material[0] : material)?.name;
    if (name) return name;
  }
  return object.name;
};

const fallbackName = (object: THREE.Object3D, kind: NodeKind, number: number) => {
  if ((object as THREE.SkinnedMesh).isSkinnedMesh) return `Skinned mesh ${number}`;
  if ((object as THREE.InstancedMesh).isInstancedMesh) return `Instanced mesh ${number}`;
  return `${kind === 'group' ? 'Group' : kind === 'mesh' ? 'Mesh' : kind === 'line' ? 'Line' : 'Points'} ${number}`;
};

// Walks the loaded scene: every node that holds something drawn, with ids
// made of child indices (stable for one file). Bones, lights and cameras
// with nothing drawn under them are left out
export const indexMeshes = (root: THREE.Object3D): MeshIndex => {
  const items: Item[] = [];
  const draws: Draw[] = [];
  const parts: Part[] = [];
  let unnamed = 0;

  const visit = (object: THREE.Object3D, id: string, depth: number, parent: string | null): boolean => {
    const drawable = isDrawable(object);
    const at = items.length;
    const item: Item = {
      id,
      object,
      name: displayName(object),
      depth,
      parent,
      kind: drawable ? drawKind(object) : 'group',
      hasChildren: false,
      visible: object.visible,
    };
    items.push(item);
    const partsAt = parts.length;
    if (drawable) {
      const draw: Draw = { id, object, drawable: drawableOf(object) };
      draws.push(draw);
      groupsOf(object).forEach((group, g) => {
        const own = partId(id, g);
        items.push({
          id: own,
          object,
          name: partName(object, group, g + 1),
          depth: depth + 1,
          parent: id,
          kind: 'part',
          hasChildren: false,
          visible: true,
        });
        parts.push({ id: own, draw, group: g, drawable: partDrawable(draw, group) });
        item.hasChildren = true;
      });
    }
    let holds = drawable;
    object.children.forEach((child, i) => {
      if (visit(child, `${id}/${i}`, depth + 1, id)) {
        holds = true;
        item.hasChildren = true;
      }
    });
    if (!holds) {
      items.length = at;
      parts.length = partsAt;
    }
    else if (!item.name) item.name = fallbackName(object, item.kind, ++unnamed);
    return holds;
  };
  root.children.forEach((child, i) => visit(child, String(i), 0, null));

  return {
    root,
    items,
    byId: new Map(items.map((item) => [item.id, item])),
    draws,
    byObject: new Map(draws.map((draw) => [draw.object, draw])),
    parts,
    details: new Map(),
    pending: null,
    detailed: draws.every((draw) => draw.drawable.kind !== 'mesh'),
    wires: new Map(),
    overlays: new Map(),
    wireMaterial: null,
    selectedMaterial: null,
    surfaces: {
      stored: new WeakMap(),
      ours: new WeakSet(),
      clay: new Map(),
      orientation: null,
      depth: null,
      invisible: null,
      surface: 'shaded',
    },
    palette: readPalette(),
    dots: null,
    normals: null,
    boxes: null,
    hidden: [],
    alive: true,
  };
};

export const meshReport = (index: MeshIndex, src: string): MeshReport => {
  const byNode = new Map<string, Drawable[]>();
  for (const draw of index.draws) {
    const parts = draw.id.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const id = parts.slice(0, i).join('/');
      const list = byNode.get(id);
      if (list) list.push(draw.drawable);
      else byNode.set(id, [draw.drawable]);
    }
  }
  for (const part of index.parts) byNode.set(part.id, [part.drawable]);
  const nodes: MeshNode[] = index.items.map((item) => ({
    id: item.id,
    name: item.name,
    depth: item.depth,
    parent: item.parent,
    kind: item.kind,
    hasChildren: item.hasChildren,
    stats: summarize(byNode.get(item.id) ?? []),
  }));
  return { src, nodes, total: summarize(index.draws.map((draw) => draw.drawable)), detailed: index.detailed };
};

export const objectFor = (index: MeshIndex, id: string) => index.byId.get(id)?.object ?? null;

// ---- the edge pass ----

// Positions as packed floats: quantized (KHR_mesh_quantization) and
// interleaved (Meshopt) ones are read out
const packedPositions = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
  if (
    attribute instanceof THREE.BufferAttribute &&
    attribute.array instanceof Float32Array &&
    attribute.itemSize === 3 &&
    !attribute.normalized &&
    attribute.array.length === attribute.count * 3
  ) {
    return attribute.array;
  }
  const out = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    out[i * 3] = attribute.getX(i);
    out[i * 3 + 1] = attribute.getY(i);
    out[i * 3 + 2] = attribute.getZ(i);
  }
  return out;
};

function* allDetails(index: MeshIndex): Generator<void, void> {
  // a geometry's parts are asked for when some mesh draws it in parts
  const geometries = new Map<THREE.BufferGeometry, THREE.GeometryGroup[]>();
  for (const draw of index.draws) {
    if (draw.drawable.kind !== 'mesh') continue;
    const groups = groupsOf(draw.object);
    if (!geometries.has(draw.object.geometry) || groups.length) geometries.set(draw.object.geometry, groups);
  }
  for (const [geometry, groups] of geometries) {
    if (!index.alive) return;
    const positions = packedPositions(geometry.getAttribute('position'));
    const details = yield* analyzeGeometry(
      positions,
      geometry.index?.array ?? null,
      geometry.userData[POLYGONS_KEY],
      groups.map((group) => ({ start: group.start, count: group.count }))
    );
    index.details.set(geometry, details);
    yield;
  }
}

// Welded vertices, edges, polygons and checks for every mesh: worked out
// once, a slice at a time
export const ensureDetails = (index: MeshIndex) => {
  if (!index.pending) {
    index.pending = runChunked(allDetails(index)).then(() => {
      if (!index.alive) return;
      for (const draw of index.draws) {
        if (draw.drawable.kind === 'mesh') draw.drawable.details = index.details.get(draw.object.geometry) ?? null;
      }
      for (const part of index.parts) {
        part.drawable.details = index.details.get(part.draw.object.geometry)?.parts[part.group] ?? null;
      }
      index.detailed = true;
    });
  }
  return index.pending;
};

// ---- visibility ----

const setHidden = (index: MeshIndex, hidden: string[]) => {
  if (index.hidden === hidden) return;
  index.hidden = hidden;
  // a part is its mesh: it shows and hides with it
  for (const item of index.items) {
    if (item.kind !== 'part') item.object.visible = item.visible && !hidden.includes(item.id);
  }
};

// Shown on screen: itself and everything above it up to the file's root
const shown = (index: MeshIndex, object: THREE.Object3D) => {
  for (let node: THREE.Object3D | null = object; node && node !== index.root; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
};

// ---- surfaces ----

const own = <T extends THREE.Material>(index: MeshIndex, material: T) => {
  index.surfaces.ours.add(material);
  return material;
};

const clayFor = (index: MeshIndex, side: THREE.Side, flat: boolean) => {
  const key = `${side}:${flat}`;
  let clay = index.surfaces.clay.get(key);
  if (!clay) {
    clay = own(index, new THREE.MeshStandardMaterial({ color: index.palette.clay, roughness: 0.65, metalness: 0, side, flatShading: flat }));
    index.surfaces.clay.set(key, clay);
  }
  return clay;
};

// Front faces one colour, back faces another, shaded by how much they face
// the camera (from screen-space derivatives: works without normals)
const orientationMaterial = (index: MeshIndex) => {
  if (!index.surfaces.orientation) {
    const material = own(index, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }));
    const { front, back } = index.palette;
    const vec = (c: THREE.Color) => `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`;
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying vec3 vP3dView;\n${shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvP3dView = mvPosition.xyz;'
      )}`;
      shader.fragmentShader = `varying vec3 vP3dView;\n${shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        vec3 p3dNormal = normalize( cross( dFdx( vP3dView ), dFdy( vP3dView ) ) );
        float p3dShade = 0.45 + 0.55 * abs( dot( p3dNormal, normalize( -vP3dView ) ) );
        vec3 p3dColour = gl_FrontFacing ? ${vec(front)} : ${vec(back)};
        gl_FragColor = vec4( sRGBTransferOETF( vec4( p3dColour * p3dShade, 1.0 ) ).rgb, 1.0 );`
      )}`;
    };
    material.customProgramCacheKey = () => 'p3d-orientation';
    index.surfaces.orientation = material;
  }
  return index.surfaces.orientation;
};

// Off, with the hidden edges hidden: the surfaces only hide what's behind
const depthMaterial = (index: MeshIndex) =>
  (index.surfaces.depth ??= own(index, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })));

const invisibleMaterial = (index: MeshIndex) =>
  (index.surfaces.invisible ??= own(index, new THREE.MeshBasicMaterial({ visible: false })));

const surfaceFor = (index: MeshIndex, mesh: THREE.Mesh, material: THREE.Material, surface: Surface, seeThrough: boolean) => {
  switch (surface) {
    case 'solid':
      return clayFor(index, material.side, !mesh.geometry.getAttribute('normal'));
    case 'orientation':
      return orientationMaterial(index);
    default:
      return seeThrough ? invisibleMaterial(index) : depthMaterial(index);
  }
};

// Puts the surface look on every mesh, over whatever material it has now
// (loaded, edited by the Materials tab, or another loader's own): run it
// after the Materials tab applies its edits. Shaded puts back what was there
export const applySurface = (index: MeshIndex, view: MeshView) => {
  if (!index.alive) return;
  const { surfaces } = index;
  const surface = view.surface;
  surfaces.surface = surface;
  for (const draw of index.draws) {
    if (draw.drawable.kind !== 'mesh') continue;
    const mesh = draw.object as THREE.Mesh;
    const array = Array.isArray(mesh.material);
    const current = array ? (mesh.material as THREE.Material[]) : [mesh.material as THREE.Material];
    const stored = surfaces.stored.get(mesh);
    if (surface === 'shaded') {
      if (!stored) continue;
      // a slot the Materials tab set meanwhile keeps its new material
      const list = current.map((material, i) => (surfaces.ours.has(material) ? stored.list[i] ?? material : material));
      mesh.material = stored.array ? list : list[0];
      surfaces.stored.delete(mesh);
      continue;
    }
    const list = current.map((material, i) => (surfaces.ours.has(material) ? stored?.list[i] ?? material : material));
    surfaces.stored.set(mesh, { list, array: stored?.array ?? array });
    const looks = list.map((material) => surfaceFor(index, mesh, material, surface, view.wire.hidden));
    if (array) {
      const same = current.length === looks.length && current.every((material, i) => material === looks[i]);
      if (!same) {
        surfaces.ours.add(looks);
        mesh.material = looks;
      }
    } else if (mesh.material !== looks[0]) {
      mesh.material = looks[0];
    }
  }
};

// ---- wireframe ----

// Lines drawn in the fragment shader from barycentric coordinates: about a
// pixel wide, smooth, on the triangles of a copy of the mesh (so skinning,
// morphs and instancing apply as they do to the mesh). Edges a polygon hides
// have their coordinate held at 1 (mesh.stats.ts wireBarycentrics)
const makeWireMaterial = (colour: THREE.Color) => {
  const material = new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute vec3 p3dBary;\nvarying vec3 vP3dBary;\n${shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvP3dBary = p3dBary;'
    )}`;
    shader.fragmentShader = `varying vec3 vP3dBary;\n${shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      // distance to the nearest drawn edge, in pixels (a held coordinate
      // never changes, so it is never near)
      vec3 p3dPixels = vP3dBary / max( fwidth( vP3dBary ), vec3( 1e-6 ) );
      float p3dNear = min( min( p3dPixels.x, p3dPixels.y ), p3dPixels.z );
      // a light core with a thin dark halo: it reads on dark and light surfaces
      float p3dCore = 1.0 - smoothstep( 0.4, 1.2, p3dNear );
      float p3dHalo = ( 1.0 - smoothstep( 1.2, 2.4, p3dNear ) ) * 0.45;
      float p3dAlpha = p3dCore + ( 1.0 - p3dCore ) * p3dHalo;
      if ( p3dAlpha * diffuseColor.a < 0.01 ) discard;
      gl_FragColor = vec4( gl_FragColor.rgb * p3dCore / p3dAlpha, p3dAlpha * diffuseColor.a );`
    )}`;
  };
  material.customProgramCacheKey = () => 'p3d-wire';
  return material;
};

// The wireframe's copy of a geometry: one vertex per triangle corner (so
// each triangle has its own barycentrics). A non-indexed source is that
// already: its attributes are shared, not copied
const wireFor = (index: MeshIndex, source: THREE.BufferGeometry, edges: WireEdges) => {
  let wire = index.wires.get(source);
  if (!wire) {
    let geometry: THREE.BufferGeometry;
    const shared = !source.index;
    if (shared) {
      geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
      geometry.morphAttributes = source.morphAttributes;
      geometry.morphTargetsRelative = source.morphTargetsRelative;
    } else {
      geometry = source.toNonIndexed();
    }
    // one material slot per part, so the selected part can stand out
    geometry.groups = source.groups.map((group, i) => ({ start: group.start, count: group.count, materialIndex: i }));
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('p3dBary', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    wire = { geometry, edges: null, shared };
    index.wires.set(source, wire);
  }
  // Polygons need the edge pass; until it's done the triangles show
  const flags = edges === 'polygons' ? index.details.get(source)?.edgeFlags ?? null : null;
  const want: WireEdges = flags ? 'polygons' : 'triangles';
  if (wire.edges !== want) {
    const bary = wire.geometry.getAttribute('p3dBary') as THREE.BufferAttribute;
    const triangles = Math.floor(bary.count / 3);
    (bary.array as Float32Array).set(wireBarycentrics(flags, triangles));
    bary.needsUpdate = true;
    wire.edges = want;
  }
  return wire.geometry;
};

const makeOverlay = (mesh: THREE.Mesh, geometry: THREE.BufferGeometry, material: THREE.Material) => {
  const overlay = mesh.clone(false) as THREE.Mesh;
  overlay.geometry = geometry;
  overlay.material = material;
  overlay.name = '';
  overlay.position.set(0, 0, 0);
  overlay.quaternion.identity();
  overlay.scale.set(1, 1, 1);
  overlay.visible = true;
  overlay.castShadow = false;
  overlay.receiveShadow = false;
  overlay.renderOrder = 10;
  overlay.userData = { [OVERLAY_KEY]: true };
  const instanced = mesh as THREE.InstancedMesh;
  if (instanced.isInstancedMesh) (overlay as THREE.InstancedMesh).instanceMatrix = instanced.instanceMatrix;
  // the same array: a morph animation moves both
  if (mesh.morphTargetInfluences) overlay.morphTargetInfluences = mesh.morphTargetInfluences;
  mesh.add(overlay);
  return overlay;
};

// Selected: itself or inside the selected node (a selected part: only
// that part of its mesh, see syncWire)
const selectedDraws = (index: MeshIndex, selected: string | null) =>
  new Set(selected === null ? [] : index.draws.filter((draw) => isWithin(draw.id, selected)).map((draw) => draw.object));

const syncWire = (index: MeshIndex, view: MeshView, selected: string | null) => {
  const wireOn = showsWire(view);
  const picked = selectedDraws(index, selected);
  const pickedPart = selected === null ? null : parsePartId(selected);
  const partMesh = pickedPart ? index.byId.get(pickedPart.mesh)?.object ?? null : null;
  if (!wireOn && !picked.size && !partMesh && !index.overlays.size) return;
  const wireMaterial = (index.wireMaterial ??= makeWireMaterial(index.palette.wire));
  const selectedMaterial = (index.selectedMaterial ??= makeWireMaterial(index.palette.selection));
  wireMaterial.opacity = view.wire.opacity;
  selectedMaterial.opacity = 1;
  for (const material of [wireMaterial, selectedMaterial]) material.depthTest = !view.wire.hidden;
  for (const draw of index.draws) {
    if (draw.drawable.kind !== 'mesh') continue;
    const mesh = draw.object as THREE.Mesh;
    const isPicked = picked.has(mesh);
    const hasPickedPart = partMesh === mesh;
    let overlay = index.overlays.get(mesh);
    if (!wireOn && !isPicked && !hasPickedPart) {
      if (overlay) overlay.visible = false;
      continue;
    }
    const geometry = wireFor(index, mesh.geometry, view.wire.edges);
    const groups = groupsOf(mesh).length ? geometry.groups.length : 0;
    // per part: the selected one stands out, the others are the wireframe
    // (or nothing, with the wireframe off)
    const material: THREE.Material | THREE.Material[] = groups
      ? Array.from({ length: groups }, (_, g) =>
          isPicked || (hasPickedPart && pickedPart?.group === g)
            ? selectedMaterial
            : wireOn
              ? wireMaterial
              : invisibleMaterial(index)
        )
      : isPicked
        ? selectedMaterial
        : wireMaterial;
    if (!overlay) {
      overlay = makeOverlay(mesh, geometry, wireMaterial);
      index.overlays.set(mesh, overlay);
    }
    overlay.material = material;
    overlay.visible = true;
  }
};

// ---- dots and normals ----

const instanceMatrices = (object: DrawObject, limit: number) => {
  const instanced = object as THREE.InstancedMesh;
  if (!instanced.isInstancedMesh) return [new THREE.Matrix4()];
  const list: THREE.Matrix4[] = [];
  for (let i = 0; i < Math.min(instanced.count, limit); i++) {
    const matrix = new THREE.Matrix4();
    instanced.getMatrixAt(i, matrix);
    list.push(matrix);
  }
  return list;
};

// The meshes to draw dots or normals for: the shown ones, or only the
// selection when the whole model has too many
const pointMeshes = (index: MeshIndex, selected: string | null, max: number) => {
  const meshes = index.draws.filter((draw) => draw.drawable.kind === 'mesh' && shown(index, draw.object));
  const total = (list: Draw[]) =>
    list.reduce((sum, draw) => sum + draw.drawable.facts.gpuVertices * draw.drawable.instances, 0);
  if (total(meshes) <= max) return { meshes, limited: false };
  const target = selected === null ? null : hideTarget(selected);
  const picked = target === null ? [] : meshes.filter((draw) => isWithin(draw.id, target));
  return { meshes: total(picked) <= max ? picked : [], limited: true };
};

// Where each vertex is as drawn (morphs and skinning applied), in the
// holder's space so the visitor's Scene settings move them with the model
// How many vertices forEachVertex visits
const vertexTotal = (draws: Draw[]) =>
  draws.reduce((sum, draw) => sum + draw.drawable.facts.gpuVertices * Math.min(draw.drawable.instances, MAX_INSTANCES), 0);

const MAX_INSTANCES = 4096;

const forEachVertex = (
  draw: Draw,
  toHolder: THREE.Matrix4,
  visit: (position: THREE.Vector3, normal: THREE.Vector3 | null) => void,
  withNormals: boolean
) => {
  const mesh = draw.object as THREE.Mesh;
  const geometry = mesh.geometry;
  const positionAttribute = geometry.getAttribute('position');
  const normalAttribute = geometry.getAttribute('normal');
  const skinned = mesh as THREE.SkinnedMesh;
  const isSkinned = !!skinned.isSkinnedMesh && !!skinned.skeleton;
  const base = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (const instance of instanceMatrices(mesh, MAX_INSTANCES)) {
    const matrix = new THREE.Matrix4().multiplyMatrices(toHolder, mesh.matrixWorld).multiply(instance);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < positionAttribute.count; i++) {
      // morphs (a plain mesh's getVertexPosition), then the bones
      THREE.Mesh.prototype.getVertexPosition.call(mesh, i, base);
      let n: THREE.Vector3 | null = null;
      if (withNormals && normalAttribute) {
        normal.fromBufferAttribute(normalAttribute, i);
        if (isSkinned) {
          // skinning is affine per vertex: it moves a direction as the
          // difference of two moved points
          tip.copy(base).add(normal);
          skinned.applyBoneTransform(i, tip);
        }
      }
      if (isSkinned) skinned.applyBoneTransform(i, base);
      if (withNormals && normalAttribute) {
        if (isSkinned) normal.copy(tip).sub(base);
        n = normal.applyMatrix3(normalMatrix).normalize();
      }
      base.applyMatrix4(matrix);
      visit(base, n);
    }
  }
};

const holderInverse = (holder: THREE.Object3D) => {
  holder.updateMatrixWorld(true);
  return holder.matrixWorld.clone().invert();
};

const disposeHelper = (object: THREE.Object3D | null | undefined) => {
  if (!object) return;
  object.removeFromParent();
  const helper = object as THREE.LineSegments;
  helper.geometry?.dispose();
  (helper.material as THREE.Material | undefined)?.dispose();
};

// A small bias towards the camera, so dots on a surface aren't half hidden
// in it (points ignore polygonOffset)
const biasTowardsCamera = (material: THREE.Material, key: string) => {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\ngl_Position.z -= 2e-4 * gl_Position.w;'
    );
  };
  material.customProgramCacheKey = () => key;
};

const syncDots = (index: MeshIndex, view: MeshView, selected: string | null, holder: THREE.Object3D, group: THREE.Group) => {
  if (!view.vertices) {
    disposeHelper(index.dots?.object);
    index.dots = null;
    return false;
  }
  const { meshes, limited } = pointMeshes(index, selected, MAX_DOTS);
  const key = `${meshes.map((draw) => draw.id).join(',')}:${view.wire.hidden}`;
  if (index.dots?.key === key) return limited;
  disposeHelper(index.dots?.object);
  const toHolder = holderInverse(holder);
  const positions = new Float32Array(vertexTotal(meshes) * 3);
  let at = 0;
  for (const draw of meshes) {
    forEachVertex(
      draw,
      toHolder,
      (p) => {
        positions[at++] = p.x;
        positions[at++] = p.y;
        positions[at++] = p.z;
      },
      false
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: index.palette.vertex,
    size: 3,
    sizeAttenuation: false,
    toneMapped: false,
    depthTest: !view.wire.hidden,
  });
  biasTowardsCamera(material, 'p3d-dots');
  const dots = new THREE.Points(geometry, material);
  dots.renderOrder = 11;
  dots.userData = { [OVERLAY_KEY]: true };
  group.add(dots);
  index.dots = { key, object: dots };
  return limited;
};

const syncNormals = (
  index: MeshIndex,
  view: MeshView,
  selected: string | null,
  holder: THREE.Object3D,
  group: THREE.Group,
  size: number
) => {
  if (!view.normals.enabled) {
    disposeHelper(index.normals?.object);
    index.normals = null;
    return false;
  }
  const { meshes, limited } = pointMeshes(index, selected, MAX_NORMALS);
  const length = view.normals.length * size;
  const key = `${meshes.map((draw) => draw.id).join(',')}:${length}:${view.wire.hidden}`;
  if (index.normals?.key === key) return limited;
  disposeHelper(index.normals?.object);
  const toHolder = holderInverse(holder);
  const positions = new Float32Array(vertexTotal(meshes) * 6);
  let at = 0;
  for (const draw of meshes) {
    forEachVertex(
      draw,
      toHolder,
      (p, n) => {
        if (!n) return;
        positions.set([p.x, p.y, p.z, p.x + n.x * length, p.y + n.y * length, p.z + n.z * length], at);
        at += 6;
      },
      true
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // meshes without normals leave the end unused
  geometry.setDrawRange(0, at / 3);
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: index.palette.normal, toneMapped: false, depthTest: !view.wire.hidden })
  );
  lines.renderOrder = 11;
  lines.userData = { [OVERLAY_KEY]: true };
  group.add(lines);
  index.normals = { key, object: lines };
  return limited;
};

// ---- bounding boxes ----

const BOX_EDGES = [0, 1, 1, 3, 3, 2, 2, 0, 4, 5, 5, 7, 7, 6, 6, 4, 0, 4, 1, 5, 2, 6, 3, 7];
const MAX_BOXES = 2000;

const pushBox = (positions: number[], box: THREE.Box3) => {
  if (box.isEmpty()) return;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
    i & 1 ? box.max.x : box.min.x,
    i & 2 ? box.max.y : box.min.y,
    i & 4 ? box.max.z : box.min.z,
  ]);
  for (const corner of BOX_EDGES) positions.push(...corners[corner]);
};

// World-aligned boxes: rebuilt whenever the model moves (cheap: from the
// geometry's own boxes)
const syncBoxes = (index: MeshIndex, view: MeshView, selected: string | null, holder: THREE.Object3D, group: THREE.Group) => {
  disposeHelper(index.boxes);
  index.boxes = null;
  if (view.bounds === 'off') return;
  holder.updateMatrixWorld(true);
  const positions: number[] = [];
  if (view.bounds === 'model') {
    pushBox(positions, preciseBox(holder));
  } else if (view.bounds === 'selection') {
    const object = selected === null ? null : objectFor(index, selected);
    if (object) pushBox(positions, preciseBox(object));
  } else {
    const draws = index.draws.filter((draw) => shown(index, draw.object)).slice(0, MAX_BOXES);
    for (const draw of draws) pushBox(positions, preciseBox(draw.object));
  }
  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const boxes = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: index.palette.bbox, toneMapped: false }));
  boxes.renderOrder = 11;
  boxes.userData = { [OVERLAY_KEY]: true };
  group.add(boxes);
  index.boxes = boxes;
};

// ---- applying ----

export interface InspectState {
  view: MeshView;
  hidden: string[];
  selected: string | null;
}

// What the panel says when a model has too many vertices for every dot or
// normal: only the selection's are drawn
export interface InspectLimits {
  dots: boolean;
  normals: boolean;
}

// Puts the Mesh tab's view on the model. `holder` is the group the
// visitor's Scene settings move, `size` the model's longest side as
// authored (normals are a share of it)
export const applyInspection = (
  index: MeshIndex,
  state: InspectState,
  holder: THREE.Object3D,
  groups: InspectionGroups,
  size: number
): InspectLimits => {
  if (!index.alive) return { dots: false, normals: false };
  setHidden(index, state.hidden);
  applySurface(index, state.view);
  syncWire(index, state.view, state.selected);
  const dots = syncDots(index, state.view, state.selected, holder, groups.model);
  const normals = syncNormals(index, state.view, state.selected, holder, groups.model, size);
  syncBoxes(index, state.view, state.selected, holder, groups.world);
  return { dots, normals };
};

// Only the boxes depend on where the model is in the world
export const refreshBoxes = (index: MeshIndex, state: InspectState, holder: THREE.Object3D, groups: InspectionGroups) => {
  if (index.alive) syncBoxes(index, state.view, state.selected, holder, groups.world);
};

// ---- picking ----

const raycaster = new THREE.Raycaster();

export interface Pick {
  id: string;
  object: THREE.Mesh;
  // the slot of a multi-material mesh hit, or null
  materialIndex: number | null;
}

// The shown mesh under a point of the screen (normalized device coordinates)
export const pickAt = (index: MeshIndex, camera: THREE.Camera, ndc: THREE.Vector2): Pick | null => {
  const targets = index.draws.filter((draw) => draw.drawable.kind === 'mesh' && shown(index, draw.object)).map((draw) => draw.object);
  raycaster.setFromCamera(ndc, camera);
  for (const hit of raycaster.intersectObjects(targets, false)) {
    const draw = index.byObject.get(hit.object);
    if (!draw) continue;
    const mesh = draw.object as THREE.Mesh;
    // a mesh in parts: the part holding the face hit
    const groups = groupsOf(mesh);
    const at = (hit.faceIndex ?? -1) * 3;
    const group = groups.findIndex((item) => at >= item.start && at < item.start + item.count);
    return {
      id: group >= 0 ? partId(draw.id, group) : draw.id,
      object: mesh,
      materialIndex: Array.isArray(mesh.material) ? hit.face?.materialIndex ?? null : null,
    };
  }
  return null;
};

// ---- disposing ----

const nothingShown: MeshView = {
  surface: 'shaded',
  wire: { enabled: false, edges: 'triangles', hidden: false, opacity: 1 },
  vertices: false,
  normals: { enabled: false, length: 0 },
  bounds: 'off',
};

// Puts the meshes' own materials back and frees everything made here. Run
// before the model itself is disposed (or the Materials tab's index)
export const disposeMeshIndex = (index: MeshIndex) => {
  applySurface(index, nothingShown);
  index.alive = false;
  for (const item of index.items) if (item.kind !== 'part') item.object.visible = item.visible;
  for (const overlay of index.overlays.values()) overlay.removeFromParent();
  index.overlays.clear();
  for (const wire of index.wires.values()) {
    // a shared one's buffers are the model's own: freed with the model
    if (!wire.shared) wire.geometry.dispose();
  }
  index.wires.clear();
  index.wireMaterial?.dispose();
  index.selectedMaterial?.dispose();
  for (const clay of index.surfaces.clay.values()) clay.dispose();
  index.surfaces.orientation?.dispose();
  index.surfaces.depth?.dispose();
  index.surfaces.invisible?.dispose();
  disposeHelper(index.dots?.object);
  disposeHelper(index.normals?.object);
  disposeHelper(index.boxes);
  index.dots = null;
  index.normals = null;
  index.boxes = null;
};

