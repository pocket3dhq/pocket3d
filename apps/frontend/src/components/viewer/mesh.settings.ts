// The Mesh tab's settings and what it shows about the model's geometry:
// pure, no three.js. The visitor's choices are theirs only, never saved.
// The numbers come from mesh.stats.ts, worked out by mesh.inspect.ts

import type { DrawableKind, MeshStats } from './mesh.stats';

// How the model's surfaces are drawn. Shaded: as authored (with the
// Materials tab's edits). Solid: one clay colour, lit, no textures.
// Facing: front faces one colour, back faces another (both sides drawn).
// Off: no surfaces, only what the wireframe and other overlays show
export type Surface = 'shaded' | 'solid' | 'orientation' | 'off';
export type WireEdges = 'polygons' | 'triangles';
export type BoundsMode = 'off' | 'model' | 'selection' | 'every';

export interface MeshView {
  surface: Surface;
  wire: {
    enabled: boolean;
    edges: WireEdges;
    // edges behind the surfaces show too (see-through)
    hidden: boolean;
    opacity: number;
  };
  vertices: boolean;
  // normal length is a fraction of the model's longest side
  normals: { enabled: boolean; length: number };
  bounds: BoundsMode;
}

// Everything off: the picture is exactly what it is without the tab
export const DEFAULT_MESH_VIEW: MeshView = {
  surface: 'shaded',
  wire: { enabled: false, edges: 'polygons', hidden: false, opacity: 0.8 },
  vertices: false,
  normals: { enabled: false, length: 0.03 },
  bounds: 'off',
};

export const MESH_LIMITS = {
  opacity: [0.1, 1] as const,
  normalLength: [0.005, 0.2] as const,
};

// Beyond these many vertices (instances counted), dots and normals are only
// drawn for the selection: millions of them would stall the page
export const MAX_DOTS = 2_000_000;
export const MAX_NORMALS = 500_000;

export const SURFACES: { id: Surface; label: string }[] = [
  { id: 'shaded', label: 'Shaded' },
  { id: 'solid', label: 'Solid' },
  { id: 'orientation', label: 'Facing' },
  { id: 'off', label: 'Off' },
];

export const SURFACE_LABEL: Record<Surface, string> = {
  shaded: 'Shaded',
  solid: 'Solid',
  orientation: 'Front and back faces',
  off: 'Wireframe',
};

export const WIRE_EDGES: { id: WireEdges; label: string }[] = [
  { id: 'polygons', label: 'Polygons' },
  { id: 'triangles', label: 'Triangles' },
];

export const BOUNDS_MODES: { id: BoundsMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'model', label: 'Model' },
  { id: 'selection', label: 'Selection' },
  { id: 'every', label: 'Every' },
];

export const isDefaultMeshView = (view: MeshView) =>
  view.surface === DEFAULT_MESH_VIEW.surface &&
  !view.wire.enabled &&
  !view.vertices &&
  !view.normals.enabled &&
  view.bounds === 'off';

// The wireframe is on screen: asked for, or the only thing left with
// surfaces off
export const showsWire = (view: MeshView) => view.wire.enabled || view.surface === 'off';

// A raw view: no ground, shadows or ambient occlusion over it
export const isRawSurface = (surface: Surface) => surface === 'orientation' || surface === 'off';

export const clampMesh = (value: number, [min, max]: readonly [number, number]) =>
  Math.min(max, Math.max(min, value));

// 999 · 12.4k · 124k · 1.24M
export const formatCount = (value: number) => {
  if (value < 1000) return String(value);
  const [scaled, unit] = value < 1e6 ? [value / 1e3, 'k'] : value < 1e9 ? [value / 1e6, 'M'] : [value / 1e9, 'B'];
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return `${Number(scaled.toFixed(digits))}${unit}`;
};

export const formatExact = (value: number) => value.toLocaleString('en-US');

// ---- the object tree ----

// A part: one material group of a mesh that has several (OBJ / FBX meshes
// often do; glTF splits them into meshes of their own)
export type NodeKind = 'group' | DrawableKind | 'part';

// The id of a mesh's part `group`: "~" never starts a child index
export const partId = (meshId: string, group: number) => `${meshId}/~${group}`;

// A part's mesh and group, or null for any other id
export const parsePartId = (id: string) => {
  const match = /^(.*)\/~(\d+)$/.exec(id);
  return match ? { mesh: match[1], group: Number(match[2]) } : null;
};

// Parts are shown and hidden with their mesh
export const hideTarget = (id: string) => parsePartId(id)?.mesh ?? id;

export interface MeshNode {
  // the path of child indices from the file's root, e.g. "0/2/1" (a part:
  // "0/2/1/~0")
  id: string;
  name: string;
  depth: number;
  parent: string | null;
  kind: NodeKind;
  hasChildren: boolean;
  stats: MeshStats;
}

export interface MeshReport {
  // the file it describes
  src: string;
  nodes: MeshNode[];
  total: MeshStats;
  // the edge pass (welded vertices, edges, polygons, checks) is done
  detailed: boolean;
}

// `id` itself or something inside it
export const isWithin = (id: string, ancestor: string) => id === ancestor || id.startsWith(`${ancestor}/`);

// Hidden itself, or inside something hidden
export const isHidden = (id: string, hidden: readonly string[]) => hidden.some((item) => isWithin(id, item));

export const ancestors = (id: string) => {
  const parts = id.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
};

// Hides everything but `id` (its parents stay shown, its contents too):
// the fewest ids that do it. A part isolates its mesh
export const isolate = (nodes: readonly MeshNode[], id: string) => {
  const target = hideTarget(id);
  const above = new Set(ancestors(target));
  return nodes
    .filter(
      (node) =>
        node.kind !== 'part' &&
        node.id !== target &&
        !above.has(node.id) &&
        (node.parent === null || above.has(node.parent))
    )
    .map((node) => node.id);
};

// Shows or hides one node. Showing something inside a hidden parent
// shows the parent too, hiding its other contents instead
export const toggleHidden = (nodes: readonly MeshNode[], hidden: readonly string[], target: string) => {
  const id = hideTarget(target);
  if (hidden.includes(id)) return hidden.filter((item) => item !== id);
  if (!isHidden(id, hidden)) return [...hidden.filter((item) => !isWithin(item, id)), id];
  // shown inside a hidden parent: unhide the chain, hide the siblings along it
  const chain = [...ancestors(id), id];
  let next = [...hidden];
  // from the highest hidden step down, each step's other contents get hidden
  let opened = false;
  for (const step of chain.slice(0, -1)) {
    if (next.includes(step)) {
      next = next.filter((item) => item !== step);
      opened = true;
    }
    if (opened) {
      for (const node of nodes) {
        if (node.parent === step && node.kind !== 'part' && !chain.includes(node.id)) next.push(node.id);
      }
    }
  }
  return next;
};

// The triangles on screen with these hidden: leaves only, so nothing counts twice
export const shownTriangles = (nodes: readonly MeshNode[], hidden: readonly string[]) =>
  nodes.reduce(
    (sum, node) => (node.kind === 'mesh' && !isHidden(node.id, hidden) ? sum + ownTriangles(nodes, node) : sum),
    0
  );

// A mesh's triangles without its children's (a mesh node can hold others;
// its parts are its own triangles, not more)
const ownTriangles = (nodes: readonly MeshNode[], node: MeshNode) =>
  node.stats.triangles -
  nodes
    .filter((child) => child.parent === node.id && child.kind !== 'part')
    .reduce((sum, child) => sum + child.stats.triangles, 0);

// Nodes whose name matches, and their parents (so the tree still reads)
export const filterNodes = (nodes: readonly MeshNode[], query: string) => {
  const text = query.trim().toLowerCase();
  if (!text) return [...nodes];
  const keep = new Set<string>();
  for (const node of nodes) {
    if (node.name.toLowerCase().includes(text)) {
      keep.add(node.id);
      for (const parent of ancestors(node.id)) keep.add(parent);
    }
  }
  return nodes.filter((node) => keep.has(node.id));
};

// Nodes under a collapsed one are left out
export const expandedNodes = (nodes: readonly MeshNode[], collapsed: ReadonlySet<string>) =>
  nodes.filter((node) => !ancestors(node.id).some((parent) => collapsed.has(parent)));

// ---- explanations (the ⓘ) ----

export const MESH_INFO = {
  surface:
    'Shaded draws the materials as authored. Solid draws every surface in one clay colour, so the shape reads without textures. Facing colours the side of each face you see: blue is its front, red its back (a red patch on a closed model is a flipped face). Off leaves only the wireframe.',
  edges:
    "Polygons hides the edges inside each quad or n-gon so the mesh looks as modelled. glTF files store triangles only, so pocket3d rebuilds the faces: flat triangle pairs become quads, and a flat convex fan with every corner on its rim becomes one n-gon (marked ≈). Triangles shows every edge the graphics card draws.",
  hidden: 'Shows the edges behind the model too, as if it were glass.',
  vertices: 'A dot on every vertex.',
  normals:
    "A short line out of each vertex along its normal, the direction its shading faces. Lines pointing inwards show flipped normals. Their length is a share of the model's longest side.",
  bounds: 'The box the model, the selected part, or every part fits in, along the X / Y / Z axes.',
  vertexCount:
    'Vertices as a 3D app counts them: points at the same place count once. The graphics card splits a vertex wherever a UV seam or hard edge meets it, so it holds more (the smaller number).',
  polygons: 'Faces as modelled: quads and n-gons count once. ≈: rebuilt from the triangles (glTF stores triangles only).',
  totals: 'Counted as drawn: every copy of an instanced mesh, and a mesh used in several places once per place.',
  open: "Edges used by one face only: a hole's rim or the border of an open surface. Fine on planes and cards, a gap on a closed model.",
  nonManifold: 'Edges shared by more than two faces: fins or faces inside the model. 3D printing and booleans need none.',
  flipped: 'Edges between two faces that point opposite ways: one of them is flipped (Facing shows it red).',
  degenerate: 'Faces with no area: two of their corners are at the same place.',
  missingNormals: 'Meshes without normals: they render faceted.',
  missingUvs: 'Meshes whose material has a texture but no UVs to place it: the texture shows as one flat colour.',
  part: 'One material of a mesh that uses several. Its numbers count it alone: an edge it shares with another part counts as open here. It shows and hides with its mesh.',
};
