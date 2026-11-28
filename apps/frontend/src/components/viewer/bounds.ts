// A model's box as it really is, from its vertices. three's quick
// Box3.setFromObject turns each mesh's own box instead, so the box grows with
// every rotation that isn't a quarter turn (a file's own, or the visitor's
// Scene settings): the Mesh tab's boxes and the size shown would be too big,
// the ground would float under the model
//
// Plain meshes, lines and points (most models) are read straight from their
// position arrays, so a few million vertices take a few milliseconds.
// Skinned and morphing meshes go through three's getVertexPosition (bones
// and morphs applied). The Mesh tab's overlays are skipped: they only copy
// the meshes they sit on

import * as THREE from 'three';

// Beyond this many vertices (copies counted), an instanced mesh is boxed per
// copy from its geometry's own (exact) box, turned: a little bigger when
// copies are rotated, but never millions of points
const MAX_INSTANCED_POINTS = 4_000_000;

// The positions as x, y, z floats: quantized or interleaved ones read out
// once (KHR_mesh_quantization, Meshopt)
const packed = new WeakMap<THREE.BufferAttribute | THREE.InterleavedBufferAttribute, Float32Array>();
const positionsOf = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
  if (
    attribute instanceof THREE.BufferAttribute &&
    attribute.array instanceof Float32Array &&
    attribute.itemSize === 3 &&
    !attribute.normalized &&
    attribute.array.length >= attribute.count * 3
  ) {
    return attribute.array;
  }
  let out = packed.get(attribute);
  if (!out) {
    out = new Float32Array(attribute.count * 3);
    for (let i = 0; i < attribute.count; i++) {
      out[i * 3] = attribute.getX(i);
      out[i * 3 + 1] = attribute.getY(i);
      out[i * 3 + 2] = attribute.getZ(i);
    }
    packed.set(attribute, out);
  }
  return out;
};

// Grows `box` by `count` points of `positions`, each moved by `matrix`
const expandByPoints = (box: THREE.Box3, positions: Float32Array, count: number, matrix: THREE.Matrix4) => {
  const e = matrix.elements;
  let minX = box.min.x;
  let minY = box.min.y;
  let minZ = box.min.z;
  let maxX = box.max.x;
  let maxY = box.max.y;
  let maxZ = box.max.z;
  for (let i = 0, j = 0; i < count; i++, j += 3) {
    const x = positions[j];
    const y = positions[j + 1];
    const z = positions[j + 2];
    const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
    const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  }
  box.min.set(minX, minY, minZ);
  box.max.set(maxX, maxY, maxZ);
};

const _point = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _instance = new THREE.Matrix4();
const _box = new THREE.Box3();

// Bones or morphs move the vertices from where the arrays have them
const isDeformed = (object: THREE.Mesh) =>
  !!(object as THREE.SkinnedMesh).isSkinnedMesh ||
  (!!object.geometry.morphAttributes.position?.length && !!object.morphTargetInfluences?.some((influence) => influence !== 0));

const expandByObject = (box: THREE.Box3, object: THREE.Object3D) => {
  const drawn = object as THREE.Mesh | THREE.Line | THREE.Points;
  const geometry = drawn.geometry as THREE.BufferGeometry | undefined;
  const position = geometry?.getAttribute?.('position');
  if (!geometry || !position) return;
  const mesh = drawn as THREE.Mesh;
  const instanced = drawn as THREE.InstancedMesh;

  if (instanced.isInstancedMesh) {
    const positions = positionsOf(position);
    if (instanced.count * position.count <= MAX_INSTANCED_POINTS) {
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, _instance);
        expandByPoints(box, positions, position.count, _matrix.multiplyMatrices(instanced.matrixWorld, _instance));
      }
    } else {
      const local = new THREE.Box3();
      expandByPoints(local, positions, position.count, _matrix.identity());
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, _instance);
        box.union(_box.copy(local).applyMatrix4(_matrix.multiplyMatrices(instanced.matrixWorld, _instance)));
      }
    }
    return;
  }

  const batched = drawn as unknown as THREE.BatchedMesh;
  if (batched.isBatchedMesh) {
    // rare: its own box, turned
    if (!batched.boundingBox) batched.computeBoundingBox();
    if (batched.boundingBox) box.union(_box.copy(batched.boundingBox).applyMatrix4(batched.matrixWorld));
    return;
  }

  if (mesh.isMesh && isDeformed(mesh)) {
    for (let i = 0; i < position.count; i++) {
      mesh.getVertexPosition(i, _point);
      box.expandByPoint(_point.applyMatrix4(mesh.matrixWorld));
    }
    return;
  }

  expandByPoints(box, positionsOf(position), position.count, drawn.matrixWorld);
};

// The world box of `root` and everything in it, from the vertices
export const preciseBox = (root: THREE.Object3D, target = new THREE.Box3()) => {
  target.makeEmpty();
  root.updateWorldMatrix(true, true);
  const visit = (object: THREE.Object3D) => {
    // the Mesh tab's wireframe copies (mesh.inspect.ts OVERLAY_KEY)
    if (object.userData.p3dOverlay) return;
    expandByObject(target, object);
    for (const child of object.children) visit(child);
  };
  visit(root);
  return target;
};
