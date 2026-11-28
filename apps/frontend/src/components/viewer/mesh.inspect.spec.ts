import * as THREE from 'three';
import { applySurface, disposeMeshIndex, ensureDetails, indexMeshes, meshReport, pickAt, PRIMITIVE_KEY } from './mesh.inspect';
import { DEFAULT_MESH_VIEW, MeshView } from './mesh.settings';
import { POLYGONS_KEY } from './mesh.stats';

// The three-side tests use what a loader of any format hands over: plain
// three objects (no glTF parser), as OBJ / FBX / USD meshes will be

// A 1×1 quad as two triangles, indexed
const quad = () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
};

// Two quads side by side, non-indexed (as OBJLoader gives), in two
// material groups
const twoMaterials = () => {
  const p = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...p, ...p.map((v, i) => (i % 3 === 0 ? v + 1 : v))], 3));
  geometry.addGroup(0, 6, 0);
  geometry.addGroup(6, 6, 1);
  const red = new THREE.MeshBasicMaterial({ name: 'Red' });
  const blue = new THREE.MeshBasicMaterial({ name: 'Blue' });
  return new THREE.Mesh(geometry, [red, blue]);
};

const scene = (...objects: THREE.Object3D[]) => {
  const root = new THREE.Group();
  root.add(...objects);
  root.updateMatrixWorld(true);
  return root;
};

describe('mesh inspection (three side)', () => {
  it('lists material parts under their mesh, each counted alone', async () => {
    const mesh = twoMaterials();
    // as three's glTF loader names it: made safe, the original kept aside
    mesh.name = 'Sign_board';
    mesh.userData.name = 'Sign board';
    const index = indexMeshes(scene(mesh));
    await ensureDetails(index);
    const report = meshReport(index, 'file');
    expect(report.nodes.map((node) => [node.id, node.name, node.kind])).toEqual([
      ['0', 'Sign board', 'mesh'],
      ['0/~0', 'Red', 'part'],
      ['0/~1', 'Blue', 'part'],
    ]);
    const [whole, red] = report.nodes;
    expect(whole.stats).toMatchObject({ triangles: 4, welded: 6, polygons: 2, drawCalls: 2, materials: 2 });
    expect(red.stats).toMatchObject({ triangles: 2, gpuVertices: 6, welded: 4, polygons: 1, drawCalls: 1, materials: 1, openEdges: 4 });
    // the whole model counts the mesh once, not its parts again
    expect(report.total.triangles).toBe(4);
  });

  it('reads interleaved and quantized positions', async () => {
    // x, y, z, pad as int16, normalized (KHR_mesh_quantization, Meshopt)
    const values = new Int16Array([0, 0, 0, 0, 32767, 0, 0, 0, 32767, 32767, 0, 0, 0, 32767, 0, 0]);
    const interleaved = new THREE.InterleavedBuffer(values, 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0, true));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const index = indexMeshes(scene(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())));
    await ensureDetails(index);
    expect(meshReport(index, 'file').total).toMatchObject({ welded: 4, edges: 5, polygons: 1, openEdges: 4 });
  });

  it("takes a loader's polygons over the estimate", async () => {
    const geometry = quad();
    // a folded pair would never be estimated as one face; the file says it is
    geometry.getAttribute('position').setZ(3, 1);
    geometry.userData[POLYGONS_KEY] = new Uint32Array([0, 0]);
    const index = indexMeshes(scene(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())));
    await ensureDetails(index);
    expect(meshReport(index, 'file').total).toMatchObject({ polygons: 1, polygonSource: 'file' });
  });

  it('counts instances and leaves out empty nodes', () => {
    const instanced = new THREE.InstancedMesh(quad(), new THREE.MeshBasicMaterial(), 5);
    const empty = new THREE.Group();
    empty.add(new THREE.Object3D());
    const report = meshReport(indexMeshes(scene(instanced, empty)), 'file');
    expect(report.nodes).toHaveLength(1);
    expect(report.total).toMatchObject({ instances: 5, triangles: 10, drawCalls: 1 });
  });

  it('lists the primitives of a glTF mesh by their material', () => {
    // as GLTFLoader gives a node whose mesh has two primitives
    const node = new THREE.Group();
    node.name = 'Hand_Hours';
    node.userData.name = 'Hand Hours';
    const primitive = (name: string, material: string) => {
      const mesh = new THREE.Mesh(quad(), new THREE.MeshBasicMaterial({ name: material }));
      mesh.name = name;
      mesh.userData[PRIMITIVE_KEY] = true;
      return mesh;
    };
    node.add(primitive('Hand_Hours_1', 'Hand Plastic'), primitive('Hand_Hours_2', ''));
    // a mesh of its own keeps its name, whatever its material
    const own = new THREE.Mesh(quad(), new THREE.MeshBasicMaterial({ name: 'Steel' }));
    own.name = 'Crown';
    const names = meshReport(indexMeshes(scene(node, own)), 'file').nodes.map((item) => item.name);
    expect(names).toEqual(['Hand Hours', 'Hand Plastic', 'Hand_Hours_2', 'Crown']);
  });

  it('swaps surfaces over any material and puts them back', () => {
    const phong = new THREE.MeshPhongMaterial();
    const mesh = new THREE.Mesh(quad(), phong);
    const parts = twoMaterials();
    const [red, blue] = parts.material as THREE.Material[];
    const index = indexMeshes(scene(mesh, parts));
    const view = (surface: MeshView['surface']): MeshView => ({ ...DEFAULT_MESH_VIEW, surface });

    applySurface(index, view('solid'));
    expect(mesh.material).not.toBe(phong);
    expect((mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial).toBe(true);
    expect((parts.material as THREE.Material[]).every((material) => material !== red && material !== blue)).toBe(true);

    // something else (the Materials tab) sets a slot meanwhile: it's kept
    const edited = new THREE.MeshBasicMaterial();
    (parts.material as THREE.Material[])[1] = edited;
    applySurface(index, view('orientation'));
    applySurface(index, view('shaded'));
    expect(mesh.material).toBe(phong);
    expect(parts.material).toEqual([red, edited]);

    applySurface(index, view('off'));
    disposeMeshIndex(index);
    expect(mesh.material).toBe(phong);
  });

  it('picks the part under the pointer', () => {
    const parts = twoMaterials();
    const index = indexMeshes(scene(parts));
    const camera = new THREE.OrthographicCamera(0, 2, 1, 0, 0.1, 10);
    camera.position.set(0, 0, 5);
    camera.updateMatrixWorld(true);
    // left half: the first quad (Red), right half: the second (Blue)
    expect(pickAt(index, camera, new THREE.Vector2(-0.5, 0))?.id).toBe('0/~0');
    expect(pickAt(index, camera, new THREE.Vector2(0.5, 0))?.id).toBe('0/~1');
    expect(pickAt(index, camera, new THREE.Vector2(0.5, 0))?.materialIndex).toBe(1);
  });
});
