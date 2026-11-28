// The Mesh tab's numbers, worked out from plain arrays: no three.js, no
// glTF. Whatever the file format, a loaded mesh comes down to positions
// (x, y, z per vertex) and, optionally, an index (three per triangle).
//
// Polygons. Formats differ: glTF stores triangles only, OBJ / FBX / USD keep
// quads and n-gons. A loader that knows the real faces says so on the
// geometry while it triangulates:
//
//   geometry.userData.p3dPolygons = Uint32Array  // polygon id per triangle,
//                                                // in index order, ids 0..n-1
//
// Without it the polygons are estimated (estimatePolygons). A flat region
// of triangles makes one n-gon when it can't be anything else (flatPolygons:
// a fan with every corner on its rim, convex). Then two triangles make a
// quad when they share the longest edge of both, are nearly flat and convex.
// A wrong guess fails safe: the triangles stay as they are.

export type PolygonSource = 'file' | 'estimated';

// The key on BufferGeometry.userData holding a loader's polygon ids
export const POLYGONS_KEY = 'p3dPolygons';

const nextPowerOfTwo = (value: number) => {
  let size = 16;
  while (size < value) size *= 2;
  return size;
};

// ---- welding ----

export interface Welded {
  // the welded vertex each vertex is (0..count-1)
  remap: Uint32Array;
  count: number;
}

// Vertices at exactly the same position are one: what a 3D app calls a
// vertex. The GPU's vertices are split wherever a normal, UV or colour
// changes (seams, hard edges), so there are usually more of those
export function* weld(positions: Float32Array): Generator<void, Welded> {
  const vertices = Math.floor(positions.length / 3);
  const bits = new Uint32Array(positions.buffer, positions.byteOffset, vertices * 3);
  // -0 and 0 are the same place
  const word = (i: number) => (bits[i] === 0x80000000 ? 0 : bits[i]);
  const size = nextPowerOfTwo(vertices * 2);
  const mask = size - 1;
  const slots = new Int32Array(size).fill(-1);
  const remap = new Uint32Array(vertices);
  const firsts: number[] = [];
  let count = 0;
  for (let v = 0; v < vertices; v++) {
    const x = word(v * 3);
    const y = word(v * 3 + 1);
    const z = word(v * 3 + 2);
    let slot = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;
    for (;;) {
      const held = slots[slot];
      if (held === -1) {
        slots[slot] = count;
        firsts.push(v);
        remap[v] = count++;
        break;
      }
      const first = firsts[held];
      if (word(first * 3) === x && word(first * 3 + 1) === y && word(first * 3 + 2) === z) {
        remap[v] = held;
        break;
      }
      slot = (slot + 1) & mask;
    }
    if ((v & 0xffff) === 0xffff) yield;
  }
  return { remap, count };
}

// ---- edges ----

export interface Edges {
  edges: number;
  // used by one triangle: a hole's rim, or the border of an open sheet
  open: number;
  // used by more than two triangles: fins, internal faces
  nonManifold: number;
  // shared by two triangles that wind the same way along it: one of them
  // faces the other way (flipped normals)
  flipped: number;
  // triangles with two corners at the same place (no area, no edges)
  degenerate: number;
  // for each triangle edge (3 per triangle, edge e from corner e to e+1),
  // the edge of the triangle across it, or -1 (open or non-manifold)
  neighbour: Int32Array;
}

// The vertex (welded) at a triangle's corner
const corner = (remap: Uint32Array, index: ArrayLike<number> | null, triangle: number, k: number) =>
  remap[index ? index[triangle * 3 + k] : triangle * 3 + k];

export function* edgeTable(
  remap: Uint32Array,
  index: ArrayLike<number> | null,
  triangles: number
): Generator<void, Edges> {
  const halfEdges = triangles * 3;
  const size = nextPowerOfTwo(Math.ceil(halfEdges * 1.34));
  const mask = size - 1;
  const lows = new Uint32Array(size);
  const highs = new Uint32Array(size);
  // the first half-edge seen on each edge (+1, 0 = empty slot), and how
  // many triangles use it (up to 255)
  const firsts = new Int32Array(size);
  const uses = new Uint8Array(size);
  // the edge's two triangles wind the same way (counted in `flipped`)
  const flips = new Uint8Array(size);
  const neighbour = new Int32Array(halfEdges).fill(-1);
  let flipped = 0;
  let degenerate = 0;

  for (let t = 0; t < triangles; t++) {
    const a = corner(remap, index, t, 0);
    const b = corner(remap, index, t, 1);
    const c = corner(remap, index, t, 2);
    if (a === b || b === c || c === a) degenerate++;
    for (let e = 0; e < 3; e++) {
      const from = e === 0 ? a : e === 1 ? b : c;
      const to = e === 0 ? b : e === 1 ? c : a;
      if (from === to) continue;
      const low = from < to ? from : to;
      const high = from < to ? to : from;
      const half = t * 3 + e;
      let slot = (Math.imul(low, 73856093) ^ Math.imul(high, 19349663)) & mask;
      for (;;) {
        const first = firsts[slot];
        if (first === 0) {
          lows[slot] = low;
          highs[slot] = high;
          firsts[slot] = half + 1;
          uses[slot] = 1;
          break;
        }
        if (lows[slot] === low && highs[slot] === high) {
          const other = first - 1;
          if (uses[slot] === 1) {
            neighbour[half] = other;
            neighbour[other] = half;
            // the same direction on both sides: the windings disagree
            const otherTriangle = (other / 3) | 0;
            const otherFrom = corner(remap, index, otherTriangle, other % 3);
            if (otherFrom === from) {
              flips[slot] = 1;
              flipped++;
            }
          } else if (uses[slot] === 2) {
            // a third triangle: nobody is anybody's neighbour here, and
            // the edge is non-manifold, not flipped (which two triangles
            // came first says nothing about which one faces the wrong way)
            if (flips[slot]) {
              flips[slot] = 0;
              flipped--;
            }
            const second = neighbour[other];
            if (second >= 0) neighbour[second] = -1;
            neighbour[other] = -1;
          }
          if (uses[slot] < 255) uses[slot]++;
          break;
        }
        slot = (slot + 1) & mask;
      }
    }
    if ((t & 0x7fff) === 0x7fff) yield;
  }

  let edges = 0;
  let open = 0;
  let nonManifold = 0;
  for (let slot = 0; slot < size; slot++) {
    const used = uses[slot];
    if (!used) continue;
    edges++;
    if (used === 1) open++;
    else if (used > 2) nonManifold++;
  }
  return { edges, open, nonManifold, flipped, degenerate, neighbour };
}

// ---- polygons ----

// Under this angle between two triangles, a quad still counts as one face
// (exported quads are rarely perfectly flat)
export const QUAD_MAX_FOLD_DEGREES = 20;
const QUAD_MIN_COS = Math.cos((QUAD_MAX_FOLD_DEGREES * Math.PI) / 180);

const point = (positions: Float32Array, index: ArrayLike<number> | null, triangle: number, k: number) => {
  const v = index ? index[triangle * 3 + k] : triangle * 3 + k;
  return [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]] as const;
};

type P = readonly [number, number, number];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: P, b: P): P => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lengthSq = (a: P) => dot(a, a);

// Which of a triangle's edges is the longest (edge e from corner e to e+1)
const longestEdge = (positions: Float32Array, index: ArrayLike<number> | null, t: number) => {
  const p = [point(positions, index, t, 0), point(positions, index, t, 1), point(positions, index, t, 2)];
  let best = 0;
  let bestLength = -1;
  for (let e = 0; e < 3; e++) {
    const length = lengthSq(sub(p[(e + 1) % 3], p[e]));
    if (length > bestLength) {
      bestLength = length;
      best = e;
    }
  }
  return best;
};

// Two triangles across edge (p, q), with r and s the corners off it, make
// one flat-enough convex quad
const makesQuad = (p: P, q: P, r: P, s: P) => {
  const n1 = cross(sub(q, p), sub(r, p));
  const n2 = cross(sub(s, p), sub(q, p));
  const l1 = Math.sqrt(lengthSq(n1));
  const l2 = Math.sqrt(lengthSq(n2));
  if (!(l1 > 0) || !(l2 > 0)) return false;
  if (dot(n1, n2) / (l1 * l2) < QUAD_MIN_COS) return false;
  // convex: p and q lie on either side of the other diagonal r–s
  const n: P = [n1[0] + n2[0], n1[1] + n2[1], n1[2] + n2[2]];
  const side = (from: P, to: P, at: P) => dot(cross(sub(to, from), sub(at, from)), n);
  return side(r, s, p) * side(r, s, q) < 0;
};

export interface Polygons {
  // polygon id per triangle
  ids: Uint32Array;
  count: number;
}

// ---- n-gons ----

// glTF stores a modelled n-gon as a fan of triangles. A flat region of
// triangles is one polygon when it can only be one: a disc with every vertex
// on its rim (triangulating a polygon never adds a vertex inside it), convex,
// with no corner on a straight line. A flat strip of quads is a disc with
// every vertex on its rim too, but its quads meet the rim in straight
// corners, so it stays quads. Anything else is left to the quad rule

// How far a triangle may tilt from the region's first one
export const NGON_MAX_TILT_DEGREES = 1;
const NGON_MIN_COS = Math.cos((NGON_MAX_TILT_DEGREES * Math.PI) / 180);
// How far a rim vertex may stray from the region's plane, as a share of the
// region's size (a curved patch of a dense mesh is not flat)
const NGON_FLATNESS = 1e-4;
// A corner turning less than this (the sine of its angle) is straight
const NGON_MIN_TURN = 1e-3;

interface Region {
  // the triangles in it
  members: number[];
  // the first triangle's unit normal
  normal: P;
}

// The rim of a region as one loop of vertex positions (in winding order), or
// null when it isn't a disc with every vertex on its rim
const rimLoop = (
  region: Region,
  positions: Float32Array,
  index: ArrayLike<number> | null,
  remap: Uint32Array,
  neighbour: Int32Array,
  inRegion: Int32Array,
  id: number
) => {
  const next = new Map<number, number>();
  const at = new Map<number, number>();
  const vertices = new Set<number>();
  for (const t of region.members) {
    for (let e = 0; e < 3; e++) {
      const from = remap[index ? index[t * 3 + e] : t * 3 + e];
      vertices.add(from);
      const across = neighbour[t * 3 + e];
      if (across >= 0 && inRegion[(across / 3) | 0] === id) continue;
      // a rim edge: a vertex starts one at most (else the rim pinches)
      if (next.has(from)) return null;
      next.set(from, remap[index ? index[t * 3 + ((e + 1) % 3)] : t * 3 + ((e + 1) % 3)]);
      at.set(from, index ? index[t * 3 + e] : t * 3 + e);
    }
  }
  // a disc of T triangles with every vertex on its rim has T + 2 vertices,
  // all of them on one loop
  const count = vertices.size;
  if (region.members.length !== count - 2 || next.size !== count) return null;
  const start = next.keys().next().value as number;
  const loop: P[] = [];
  let vertex = start;
  do {
    const raw = at.get(vertex) as number;
    loop.push([positions[raw * 3], positions[raw * 3 + 1], positions[raw * 3 + 2]]);
    vertex = next.get(vertex) as number;
  } while (vertex !== start && loop.length <= count);
  return loop.length === count && vertex === start ? loop : null;
};

// The rim lies in one plane, turns the same way at every corner (convex) and
// never goes straight on
const isFlatConvex = (loop: P[], normal: P) => {
  let size = 0;
  let magnitude = 0;
  for (const p of loop) {
    size = Math.max(size, lengthSq(sub(p, loop[0])));
    magnitude = Math.max(magnitude, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  }
  // float positions far from the origin are only so exact
  const tolerance = Math.max(NGON_FLATNESS * Math.sqrt(size), 1e-6 * magnitude);
  for (const p of loop) {
    if (Math.abs(dot(sub(p, loop[0]), normal)) > tolerance) return false;
  }
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const c = loop[(i + 2) % loop.length];
    const d1 = sub(b, a);
    const d2 = sub(c, b);
    const turn = dot(cross(d1, d2), normal) / Math.sqrt(lengthSq(d1) * lengthSq(d2));
    if (!(turn > NGON_MIN_TURN)) return false;
  }
  return true;
};

// Marks the flat n-gons (three triangles or more) in `ids` and `done`, and
// returns how many polygons it made
function* flatPolygons(
  positions: Float32Array,
  index: ArrayLike<number> | null,
  remap: Uint32Array,
  triangles: number,
  neighbour: Int32Array,
  ids: Uint32Array,
  done: Uint8Array
): Generator<void, number> {
  const normals = new Float64Array(triangles * 3);
  // 0 for a triangle without area: never part of a region
  const usable = new Uint8Array(triangles);
  for (let t = 0; t < triangles; t++) {
    const p = point(positions, index, t, 0);
    const n = cross(sub(point(positions, index, t, 1), p), sub(point(positions, index, t, 2), p));
    const length = Math.sqrt(lengthSq(n));
    if (length > 0) {
      normals.set([n[0] / length, n[1] / length, n[2] / length], t * 3);
      usable[t] = 1;
    }
    if ((t & 0x7fff) === 0x7fff) yield;
  }
  // the region a triangle was grown into (each joins one at most)
  const inRegion = new Int32Array(triangles).fill(-1);
  let regions = 0;
  let count = 0;
  let work = 0;
  for (let seed = 0; seed < triangles; seed++) {
    if (!usable[seed] || inRegion[seed] >= 0) continue;
    const id = regions++;
    const normal: P = [normals[seed * 3], normals[seed * 3 + 1], normals[seed * 3 + 2]];
    const region: Region = { members: [], normal };
    const stack = [seed];
    inRegion[seed] = id;
    while (stack.length) {
      const t = stack.pop() as number;
      region.members.push(t);
      for (let e = 0; e < 3; e++) {
        const across = neighbour[t * 3 + e];
        if (across < 0) continue;
        const u = (across / 3) | 0;
        if (!usable[u] || inRegion[u] >= 0) continue;
        const cos = normals[u * 3] * normal[0] + normals[u * 3 + 1] * normal[1] + normals[u * 3 + 2] * normal[2];
        if (cos < NGON_MIN_COS) continue;
        inRegion[u] = id;
        stack.push(u);
      }
    }
    work += region.members.length;
    if (region.members.length >= 3) {
      const loop = rimLoop(region, positions, index, remap, neighbour, inRegion, id);
      if (loop && isFlatConvex(loop, normal)) {
        for (const t of region.members) {
          ids[t] = count;
          done[t] = 1;
        }
        count++;
      }
    }
    if (work > 0x7fff) {
      work = 0;
      yield;
    }
  }
  return count;
}

export function* estimatePolygons(
  positions: Float32Array,
  index: ArrayLike<number> | null,
  remap: Uint32Array,
  triangles: number,
  neighbour: Int32Array
): Generator<void, Polygons> {
  const ids = new Uint32Array(triangles);
  const done = new Uint8Array(triangles);
  let count = yield* flatPolygons(positions, index, remap, triangles, neighbour, ids, done);
  const longest = new Uint8Array(triangles);
  for (let t = 0; t < triangles; t++) {
    longest[t] = longestEdge(positions, index, t);
    if ((t & 0x7fff) === 0x7fff) yield;
  }
  for (let t = 0; t < triangles; t++) {
    if (done[t]) continue;
    done[t] = 1;
    ids[t] = count;
    const e = longest[t];
    const across = neighbour[t * 3 + e];
    if (across >= 0) {
      const u = (across / 3) | 0;
      if (!done[u] && longest[u] === across % 3) {
        const p = point(positions, index, t, e);
        const q = point(positions, index, t, (e + 1) % 3);
        const r = point(positions, index, t, (e + 2) % 3);
        const s = point(positions, index, u, (across + 2) % 3);
        if (makesQuad(p, q, r, s)) {
          done[u] = 1;
          ids[u] = count;
        }
      }
    }
    count++;
    if ((t & 0x7fff) === 0x7fff) yield;
  }
  return { ids, count };
}

// A loader's polygon ids, when they fit this geometry (else null)
export const filePolygons = (ids: unknown, triangles: number): Polygons | null => {
  if (!(ids instanceof Uint32Array) || ids.length !== triangles) return null;
  let max = -1;
  for (let i = 0; i < ids.length; i++) if (ids[i] > max) max = ids[i];
  if (max < 0) return { ids, count: 0 };
  const seen = new Uint8Array(max + 1);
  let count = 0;
  for (let i = 0; i < ids.length; i++) {
    if (!seen[ids[i]]) {
      seen[ids[i]] = 1;
      count++;
    }
  }
  return { ids, count };
};

// Which edges the wireframe draws, per triangle: bit e for edge e. An edge
// inside a polygon (both sides the same polygon) isn't drawn
export const polygonEdgeFlags = (ids: Uint32Array | null, neighbour: Int32Array, triangles: number) => {
  const flags = new Uint8Array(triangles);
  for (let t = 0; t < triangles; t++) {
    let bits = 0;
    for (let e = 0; e < 3; e++) {
      const across = neighbour[t * 3 + e];
      if (!ids || across < 0 || ids[(across / 3) | 0] !== ids[t]) bits |= 1 << e;
    }
    flags[t] = bits;
  }
  return flags;
};

// The barycentric coordinates the wireframe shader draws edges from, for a
// non-indexed copy of the triangles (3 vertices each). An edge that isn't
// drawn gets the coordinate that would reach 0 along it held at 1
export const wireBarycentrics = (flags: Uint8Array | null, triangles: number) => {
  const bary = new Float32Array(triangles * 9);
  for (let t = 0; t < triangles; t++) {
    const bits = flags ? flags[t] : 7;
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      bary[o + k] = 1;
      for (let e = 0; e < 3; e++) {
        // edge e runs from corner e to e + 1, opposite corner e + 2
        if (!(bits & (1 << e))) bary[o + ((e + 2) % 3)] = 1;
      }
    }
  }
  return bary;
};

// ---- one geometry ----

// The numbers of a geometry, or of one of its parts
export interface PartDetails {
  welded: number;
  edges: number;
  openEdges: number;
  nonManifoldEdges: number;
  flippedEdges: number;
  degenerateTriangles: number;
  polygons: number;
  polygonSource: PolygonSource;
}

export interface GeometryDetails extends PartDetails {
  // drawn edges per triangle, for the Polygons wireframe
  edgeFlags: Uint8Array;
  // one per range asked for (the material groups of an OBJ / FBX mesh)
  parts: PartDetails[];
}

// A run of the index (or of the vertices, without one): a material group
export interface Range {
  start: number;
  count: number;
}

// The triangles of a range as their own index
const rangeIndex = (index: ArrayLike<number> | null, first: number, triangles: number) => {
  if (index && ArrayBuffer.isView(index)) return (index as Uint32Array).subarray(first * 3, (first + triangles) * 3);
  if (index) return Array.prototype.slice.call(index, first * 3, (first + triangles) * 3) as number[];
  const own = new Uint32Array(triangles * 3);
  for (let i = 0; i < own.length; i++) own[i] = first * 3 + i;
  return own;
};

// A part taken alone: an edge it shares with another part is open here
function* partDetails(
  remap: Uint32Array,
  welded: number,
  index: ArrayLike<number> | null,
  total: number,
  range: Range,
  faces: Polygons,
  source: PolygonSource
): Generator<void, PartDetails> {
  const first = Math.min(total, Math.floor(range.start / 3));
  const triangles = Math.max(0, Math.min(total - first, Math.floor(range.count / 3)));
  const own = rangeIndex(index, first, triangles);
  const usedVertex = new Uint8Array(welded);
  let vertices = 0;
  for (let i = 0; i < own.length; i++) {
    const v = remap[own[i]];
    if (!usedVertex[v]) {
      usedVertex[v] = 1;
      vertices++;
    }
  }
  const usedPolygon = new Uint8Array(faces.count);
  let polygons = 0;
  for (let t = first; t < first + triangles; t++) {
    if (!usedPolygon[faces.ids[t]]) {
      usedPolygon[faces.ids[t]] = 1;
      polygons++;
    }
  }
  const edges = yield* edgeTable(remap, own, triangles);
  return {
    welded: vertices,
    edges: edges.edges,
    openEdges: edges.open,
    nonManifoldEdges: edges.nonManifold,
    flippedEdges: edges.flipped,
    degenerateTriangles: edges.degenerate,
    polygons,
    polygonSource: source,
  };
}

export function* analyzeGeometry(
  positions: Float32Array,
  index: ArrayLike<number> | null,
  polygons?: unknown,
  ranges: Range[] = []
): Generator<void, GeometryDetails> {
  const triangles = Math.floor((index ? index.length : positions.length / 3) / 3);
  const welded = yield* weld(positions);
  const edges = yield* edgeTable(welded.remap, index, triangles);
  const known = filePolygons(polygons, triangles);
  const faces = known ?? (yield* estimatePolygons(positions, index, welded.remap, triangles, edges.neighbour));
  const source: PolygonSource = known ? 'file' : 'estimated';
  const parts: PartDetails[] = [];
  for (const range of ranges) {
    parts.push(yield* partDetails(welded.remap, welded.count, index, triangles, range, faces, source));
  }
  return {
    welded: welded.count,
    edges: edges.edges,
    openEdges: edges.open,
    nonManifoldEdges: edges.nonManifold,
    flippedEdges: edges.flipped,
    degenerateTriangles: edges.degenerate,
    polygons: faces.count,
    polygonSource: source,
    edgeFlags: polygonEdgeFlags(faces.ids, edges.neighbour, triangles),
    parts,
  };
}

// Runs a generator a slice at a time, handing the page back between slices
// so a big model never freezes it
export const runChunked = <T>(
  work: Generator<void, T>,
  budgetMs = 12,
  now: () => number = () => performance.now(),
  later: (next: () => void) => void = (next) => setTimeout(next, 0)
): Promise<T> =>
  new Promise((resolve, reject) => {
    const slice = () => {
      try {
        const start = now();
        for (;;) {
          const step = work.next();
          if (step.done) {
            resolve(step.value);
            return;
          }
          if (now() - start >= budgetMs) break;
        }
        later(slice);
      } catch (error) {
        reject(error);
      }
    };
    slice();
  });

// ---- totals ----

export type DrawableKind = 'mesh' | 'line' | 'points';

// What the attributes say at once, without the edge pass
export interface GeometryFacts {
  gpuVertices: number;
  triangles: number;
  segments: number;
  points: number;
  normals: boolean;
  uvSets: number;
  tangents: boolean;
  colours: boolean;
  morphTargets: number;
}

// One thing drawn: a mesh, a line or a point cloud (a node of the tree)
export interface Drawable {
  kind: DrawableKind;
  // 1, or how many copies an instanced mesh draws
  instances: number;
  facts: GeometryFacts;
  details: PartDetails | null;
  drawCalls: number;
  // ids of the materials it uses
  materials: string[];
  bones: number;
  // a material with textures, but no UVs to place them
  texturedWithoutUv: boolean;
}

export interface MeshStats {
  meshes: number;
  lines: number;
  pointClouds: number;
  instances: number;
  drawCalls: number;
  materials: number;
  gpuVertices: number;
  triangles: number;
  segments: number;
  points: number;
  // null until every mesh's edge pass is done
  welded: number | null;
  edges: number | null;
  polygons: number | null;
  polygonSource: PolygonSource | 'mixed' | null;
  openEdges: number | null;
  nonManifoldEdges: number | null;
  flippedEdges: number | null;
  degenerateTriangles: number | null;
  // meshes lacking normals (drawn flat), textured meshes lacking UVs
  missingNormals: number;
  missingUvs: number;
  skinned: number;
  bones: number;
  morphTargets: number;
  uvSets: number;
  tangents: number;
  vertexColours: number;
}

// Totals over the drawables, as drawn: every copy of an instanced mesh, and
// a mesh used by several nodes once per node
export const summarize = (drawables: Drawable[]): MeshStats => {
  const materials = new Set<string>();
  const stats: MeshStats = {
    meshes: 0,
    lines: 0,
    pointClouds: 0,
    instances: 0,
    drawCalls: 0,
    materials: 0,
    gpuVertices: 0,
    triangles: 0,
    segments: 0,
    points: 0,
    welded: 0,
    edges: 0,
    polygons: 0,
    polygonSource: null,
    openEdges: 0,
    nonManifoldEdges: 0,
    flippedEdges: 0,
    degenerateTriangles: 0,
    missingNormals: 0,
    missingUvs: 0,
    skinned: 0,
    bones: 0,
    morphTargets: 0,
    uvSets: 0,
    tangents: 0,
    vertexColours: 0,
  };
  let detailed = true;
  const sources = new Set<PolygonSource>();
  for (const item of drawables) {
    const n = item.instances;
    const { facts } = item;
    if (item.kind === 'mesh') stats.meshes++;
    else if (item.kind === 'line') stats.lines++;
    else stats.pointClouds++;
    if (n > 1) stats.instances += n;
    stats.drawCalls += item.drawCalls;
    for (const id of item.materials) materials.add(id);
    stats.gpuVertices += facts.gpuVertices * n;
    stats.triangles += facts.triangles * n;
    stats.segments += facts.segments * n;
    stats.points += facts.points * n;
    stats.uvSets = Math.max(stats.uvSets, facts.uvSets);
    stats.morphTargets = Math.max(stats.morphTargets, facts.morphTargets);
    if (facts.tangents) stats.tangents++;
    if (facts.colours) stats.vertexColours++;
    if (item.bones) {
      stats.skinned++;
      stats.bones = Math.max(stats.bones, item.bones);
    }
    if (item.kind !== 'mesh') continue;
    if (!facts.normals) stats.missingNormals++;
    if (item.texturedWithoutUv) stats.missingUvs++;
    const d = item.details;
    if (!d) {
      detailed = false;
      continue;
    }
    sources.add(d.polygonSource);
    stats.welded = (stats.welded ?? 0) + d.welded * n;
    stats.edges = (stats.edges ?? 0) + d.edges * n;
    stats.polygons = (stats.polygons ?? 0) + d.polygons * n;
    stats.openEdges = (stats.openEdges ?? 0) + d.openEdges * n;
    stats.nonManifoldEdges = (stats.nonManifoldEdges ?? 0) + d.nonManifoldEdges * n;
    stats.flippedEdges = (stats.flippedEdges ?? 0) + d.flippedEdges * n;
    stats.degenerateTriangles = (stats.degenerateTriangles ?? 0) + d.degenerateTriangles * n;
  }
  stats.materials = materials.size;
  if (!detailed) {
    stats.welded = null;
    stats.edges = null;
    stats.polygons = null;
    stats.openEdges = null;
    stats.nonManifoldEdges = null;
    stats.flippedEdges = null;
    stats.degenerateTriangles = null;
  } else {
    stats.polygonSource = sources.size === 0 ? null : sources.size === 1 ? [...sources][0] : 'mixed';
  }
  return stats;
};
