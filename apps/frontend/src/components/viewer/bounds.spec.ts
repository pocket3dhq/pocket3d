import * as THREE from 'three';
import { preciseBox } from './bounds';

// An octahedron's six corners (±1 on each axis): its own box is the cube
// ±1, so a quarter of a quarter turn shows the difference
const octahedron = () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1], 3)
  );
  geometry.setIndex([0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5]);
  return geometry;
};

const turned = (object: THREE.Object3D) => {
  object.rotation.z = Math.PI / 4;
  return object;
};

describe('preciseBox', () => {
  it('fits the vertices of a turned mesh, not its turned box', () => {
    const mesh = turned(new THREE.Mesh(octahedron()));
    const box = preciseBox(mesh);
    // the corners on X and Y end up at ±cos 45°
    expect(box.max.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(box.max.y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(box.max.z).toBeCloseTo(1, 5);
    // three's quick box: the cube turned, √2 wide
    expect(new THREE.Box3().setFromObject(mesh).max.x).toBeCloseTo(Math.SQRT2, 5);
  });

  it('follows parents, scale and every copy of an instanced mesh', () => {
    const instanced = new THREE.InstancedMesh(octahedron(), new THREE.MeshBasicMaterial(), 2);
    instanced.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-5, 0, 0));
    instanced.setMatrixAt(1, new THREE.Matrix4().makeTranslation(5, 0, 0));
    const parent = new THREE.Group();
    parent.scale.setScalar(2);
    parent.add(instanced);
    const box = preciseBox(parent);
    expect(box.min.x).toBeCloseTo(-12, 5);
    expect(box.max.x).toBeCloseTo(12, 5);
    expect(box.max.y).toBeCloseTo(2, 5);
  });

  it('reads quantized positions and skips the Mesh tab overlays', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Int16Array([0, 0, 0, 32767, 16383, 0]), 3, true));
    const mesh = new THREE.Mesh(geometry);
    const overlay = new THREE.Mesh(octahedron());
    overlay.position.set(100, 0, 0);
    overlay.userData.p3dOverlay = true;
    mesh.add(overlay);
    const box = preciseBox(mesh);
    expect(box.max.x).toBeCloseTo(1, 4);
    expect(box.max.y).toBeCloseTo(0.5, 4);
  });

  it('is empty without vertices', () => {
    expect(preciseBox(new THREE.Group()).isEmpty()).toBe(true);
  });
});
