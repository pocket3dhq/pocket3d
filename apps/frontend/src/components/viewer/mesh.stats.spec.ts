import {
  analyzeGeometry,
  Drawable,
  edgeTable,
  runChunked,
  summarize,
  weld,
  wireBarycentrics,
} from './mesh.stats';

const run = <T>(work: Generator<void, T>): T => {
  for (;;) {
    const step = work.next();
    if (step.done) return step.value;
  }
};

// A unit cube as 12 triangles, outward winding, non-indexed (as OBJ loads)
const CUBE_FACES = [
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
];
const quadTriangles = (q: number[][]) => [q[0], q[1], q[2], q[0], q[2], q[3]];
const cube = () => new Float32Array(CUBE_FACES.flatMap(quadTriangles).flat());

describe('mesh stats', () => {
  it('welds a non-indexed cube to 8 vertices with 18 edges and 6 quads', () => {
    const positions = cube();
    expect(run(weld(positions)).count).toBe(8);
    const details = run(analyzeGeometry(positions, null));
    expect(details).toMatchObject({
      welded: 8,
      edges: 18,
      openEdges: 0,
      nonManifoldEdges: 0,
      flippedEdges: 0,
      degenerateTriangles: 0,
      polygons: 6,
      polygonSource: 'estimated',
    });
    // each triangle hides its diagonal: two of three edges drawn
    for (const bits of details.edgeFlags) expect([3, 5, 6]).toContain(bits);
  });

  it('counts open edges on a two-triangle plane', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const details = run(analyzeGeometry(positions, [0, 1, 2, 0, 2, 3]));
    expect(details).toMatchObject({ welded: 4, edges: 5, openEdges: 4, polygons: 1 });
  });

  it('finds non-manifold and flipped edges', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1]);
    const fin = run(edgeTable(new Uint32Array([0, 1, 2, 3, 4]), [0, 1, 2, 1, 0, 3, 0, 1, 4], 3));
    expect(fin.nonManifold).toBe(1);
    expect(fin.neighbour.every((n) => n === -1 || n >= 0)).toBe(true);
    const flipped = run(analyzeGeometry(positions, [0, 1, 2, 0, 1, 3]));
    expect(flipped.flippedEdges).toBe(1);
  });

  it('counts an edge with a third triangle as non-manifold, not flipped', () => {
    // the first two wind the same way along 0–1, then a third arrives
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1]);
    const fin = run(analyzeGeometry(positions, [0, 1, 2, 0, 1, 3, 1, 0, 4]));
    expect(fin.nonManifoldEdges).toBe(1);
    expect(fin.flippedEdges).toBe(0);
  });

  it('keeps a folded quad as two triangles', () => {
    // folded 90° along the diagonal
    const positions = new Float32Array([0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1]);
    const details = run(analyzeGeometry(positions, [0, 2, 1, 0, 1, 3]));
    expect(details.polygons).toBe(2);
  });

  // flat rings of vertices, z = 0
  const flat = (points: number[][]) => new Float32Array(points.flatMap(([x, y]) => [x, y, 0]));
  const drawnEdges = (flags: Uint8Array) =>
    [...flags].reduce((sum, bits) => sum + (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1), 0);
  const hexagon = Array.from({ length: 6 }, (_, k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]);

  it('rebuilds a flat fan as one n-gon', () => {
    const details = run(analyzeGeometry(flat(hexagon), [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]));
    expect(details.polygons).toBe(1);
    // the rim only: the fan's diagonals are hidden
    expect(drawnEdges(details.edgeFlags)).toBe(6);
  });

  it('keeps a flat strip of quads as quads', () => {
    // 3 quads in a row: every vertex is on the rim, but the rim runs straight where they meet
    const points = [0, 1, 2, 3].map((x) => [x, 0]).concat([0, 1, 2, 3].map((x) => [x, 1]));
    const index = [0, 1, 2].flatMap((i) => [i, i + 1, i + 5, i, i + 5, i + 4]);
    expect(run(analyzeGeometry(flat(points), index)).polygons).toBe(3);
  });

  it('keeps a fan around a middle vertex, and a concave fan, out of one n-gon', () => {
    const poked = run(analyzeGeometry(flat([...hexagon, [0, 0]]), [0, 1, 2, 3, 4, 5].flatMap((k) => [6, k, (k + 1) % 6])));
    expect(poked.polygons).toBeGreaterThan(1);
    // an L: its corner at (1, 1) turns the other way
    const ell = flat([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]);
    expect(run(analyzeGeometry(ell, [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5])).polygons).toBeGreaterThan(1);
  });

  it("uses a loader's polygon ids over the estimate", () => {
    // a pentagon fan of 3 triangles, one n-gon
    const positions = new Float32Array([0, 0, 0, 2, 0, 0, 3, 1, 0, 1, 2, 0, -1, 1, 0]);
    const index = [0, 1, 2, 0, 2, 3, 0, 3, 4];
    const details = run(analyzeGeometry(positions, index, new Uint32Array([0, 0, 0])));
    expect(details.polygonSource).toBe('file');
    expect(details.polygons).toBe(1);
    // the two fan diagonals are hidden: 5 drawn edges out of 9
    const drawn = [...details.edgeFlags].reduce((sum, bits) => sum + ((bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1)), 0);
    expect(drawn).toBe(5);
    // ids of the wrong length are ignored
    expect(run(analyzeGeometry(positions, index, new Uint32Array([0]))).polygonSource).toBe('estimated');
  });

  it('counts each material part alone', () => {
    // the cube's first two faces (4 triangles) and the other four (8)
    const indexed = run(analyzeGeometry(cube(), null, undefined, [{ start: 0, count: 12 }, { start: 12, count: 24 }]));
    expect(indexed.parts).toHaveLength(2);
    // two opposite faces: 8 vertices, 2 quads, 10 edges (8 of them open)
    expect(indexed.parts[0]).toMatchObject({ welded: 8, polygons: 2, edges: 10, openEdges: 8 });
    // the four faces around: a sleeve, open at both ends
    expect(indexed.parts[1]).toMatchObject({ welded: 8, polygons: 4, edges: 16, openEdges: 8, polygonSource: 'estimated' });
    // with an index, ranges are in index space
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 2, 0, 0, 2, 1, 0]);
    const index = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2]);
    const two = run(analyzeGeometry(positions, index, undefined, [{ start: 0, count: 6 }, { start: 6, count: 6 }]));
    expect(two.parts.map((part) => [part.welded, part.polygons, part.openEdges])).toEqual([
      [4, 1, 4],
      [4, 1, 4],
    ]);
    expect(two).toMatchObject({ welded: 6, polygons: 2, openEdges: 6 });
  });

  it('holds a hidden edge out of the barycentrics', () => {
    const all = wireBarycentrics(null, 1);
    expect([...all]).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    // edge 0 (corner 0 → 1) hidden: coordinate 2 pinned to 1
    const hidden = wireBarycentrics(new Uint8Array([0b110]), 1);
    expect([...hidden]).toEqual([1, 0, 1, 0, 1, 1, 0, 0, 1]);
  });

  it('adds up drawables, instances included, and waits for every edge pass', () => {
    const details = run(analyzeGeometry(cube(), null));
    const facts = { gpuVertices: 36, triangles: 12, segments: 0, points: 0, normals: true, uvSets: 1, tangents: false, colours: false, morphTargets: 0 };
    const mesh: Drawable = { kind: 'mesh', instances: 3, facts, details, drawCalls: 1, materials: ['a'], bones: 0, texturedWithoutUv: false };
    const stats = summarize([mesh, { ...mesh, instances: 1, materials: ['a', 'b'], drawCalls: 2 }]);
    expect(stats).toMatchObject({ meshes: 2, instances: 3, triangles: 48, welded: 32, edges: 72, polygons: 24, materials: 2, drawCalls: 3, polygonSource: 'estimated' });
    const pending = summarize([mesh, { ...mesh, details: null, facts: { ...facts, normals: false } }]);
    expect(pending.welded).toBeNull();
    expect(pending.missingNormals).toBe(1);
  });

  it('runs a long job in slices', async () => {
    function* job() {
      for (let i = 0; i < 5; i++) yield;
      return 'done';
    }
    let clock = 0;
    let slices = 0;
    const result = await runChunked(job(), 1, () => clock++, (next) => {
      slices++;
      next();
    });
    expect(result).toBe('done');
    expect(slices).toBeGreaterThan(0);
  });
});
