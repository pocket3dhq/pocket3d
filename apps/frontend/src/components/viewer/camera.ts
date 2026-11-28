// Where the camera goes: the three-quarter framing a model opens with (and
// R), the six axis views, and the switch between perspective and
// orthographic. Every placement is worked out as a perspective distance
// first; the orthographic camera then gets the view height that perspective
// camera would see at that distance, so both show the model the same size.
//
// Panels laid over the canvas (Adjust, versions) leave the model less room:
// the picture's centre moves to the middle of what's left (a view offset,
// so orbiting still turns about the model) and framing fits the model there

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  CameraView,
  distanceForOrthoHeight,
  fitDistance,
  orthoHeightForDistance,
  Projection,
  viewBasis,
} from './look.settings';
import type { Vec3 } from './scene.settings';
import { preciseBox } from './bounds';

// How far panels cover the canvas from each edge, in pixels
export interface ViewInset {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const NO_INSET: ViewInset = { left: 0, right: 0, top: 0, bottom: 0 };

export interface Cameras {
  perspective: THREE.PerspectiveCamera;
  orthographic: THREE.OrthographicCamera;
  // the one rendering, and the one the orbit controls drive
  active: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  controls: OrbitControls;
  // the canvas in pixels, and how much of it panels cover
  viewport: { width: number; height: number };
  inset: ViewInset;
  // the last framing (opening, R, F, a camera view) while the visitor
  // hasn't moved the camera since: a panel opening or closing frames it
  // again in the room left
  framed: { root: THREE.Object3D; view: CameraView } | null;
}

// Panels covering less than this share of the canvas's width or height
// leave it alone: beyond it there'd be no room left to frame in
const MAX_INSET_SHARE = 0.7;

// What each panel (a rectangle, like the canvas, in page pixels) takes from
// the canvas: the side that leaves the larger free rectangle. A panel down
// the right leaves the left, a bottom sheet leaves the top
export const coveredInset = (canvas: DOMRectReadOnly, panels: DOMRectReadOnly[]): ViewInset => {
  const inset = { ...NO_INSET };
  for (const panel of panels) {
    const left = Math.max(panel.left, canvas.left);
    const right = Math.min(panel.right, canvas.right);
    const top = Math.max(panel.top, canvas.top);
    const bottom = Math.min(panel.bottom, canvas.bottom);
    if (right <= left || bottom <= top) continue;
    const options: { side: keyof ViewInset; room: number; covered: number }[] = [
      { side: 'right', room: (left - canvas.left) * canvas.height, covered: canvas.right - left },
      { side: 'left', room: (canvas.right - right) * canvas.height, covered: right - canvas.left },
      { side: 'bottom', room: (top - canvas.top) * canvas.width, covered: canvas.bottom - top },
      { side: 'top', room: (canvas.bottom - bottom) * canvas.width, covered: bottom - canvas.top },
    ];
    const best = options.reduce((a, b) => (b.room > a.room ? b : a));
    inset[best.side] = Math.max(inset[best.side], best.covered);
  }
  return inset;
};

// The inset framing works with: none along an axis panels cover too much of
const usableInset = ({ viewport: { width, height }, inset }: Cameras): ViewInset => {
  const across = inset.left + inset.right <= width * MAX_INSET_SHARE;
  const down = inset.top + inset.bottom <= height * MAX_INSET_SHARE;
  return {
    left: across ? inset.left : 0,
    right: across ? inset.right : 0,
    top: down ? inset.top : 0,
    bottom: down ? inset.bottom : 0,
  };
};

// Moves the picture's centre to the middle of the canvas panels leave free
export const applyInset = (cameras: Cameras) => {
  const { width, height } = cameras.viewport;
  const { left, right, top, bottom } = usableInset(cameras);
  for (const camera of [cameras.perspective, cameras.orthographic]) {
    if (!left && !right && !top && !bottom) camera.clearViewOffset();
    else camera.setViewOffset(width, height, (right - left) / 2, (bottom - top) / 2, width, height);
  }
};

// The lens of the free part of the canvas: what a camera with only that
// rectangle would see (same focal length)
const freeLens = (cameras: Cameras) => {
  const { width, height } = cameras.viewport;
  const { left, right, top, bottom } = usableInset(cameras);
  const wide = width > 0 ? (width - left - right) / width : 1;
  const tall = height > 0 ? (height - top - bottom) / height : 1;
  const tanV = Math.tan(THREE.MathUtils.degToRad(cameras.perspective.fov) / 2) * tall;
  const aspect = (cameras.perspective.aspect * wide) / tall;
  return { tanV, tanH: tanV * aspect, aspect, fov: THREE.MathUtils.radToDeg(2 * Math.atan(tanV)) };
};

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// The orthographic camera's frustum: `userData.height` world units tall (at
// zoom 1), as wide as the screen's aspect makes it
export const updateOrthoFrustum = (camera: THREE.OrthographicCamera, aspect: number) => {
  const height = (camera.userData.height as number) || 1;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.left = (-height / 2) * aspect;
  camera.right = (height / 2) * aspect;
  camera.updateProjectionMatrix();
};

// Puts the camera `distance` away from `target` along `direction` (a
// perspective distance; see the top of the file). The perspective camera is
// always placed too, so switching back finds it where this view wants it
const place = (
  cameras: Cameras,
  target: THREE.Vector3,
  direction: THREE.Vector3,
  distance: number,
  radius: number
) => {
  const { perspective, orthographic, controls } = cameras;
  perspective.position.copy(target).addScaledVector(direction, distance);
  perspective.near = radius / 500;
  perspective.far = (distance + radius) * 8;
  perspective.updateProjectionMatrix();

  // the orthographic camera stands well clear of the model: its distance
  // changes nothing on screen, only what gets clipped
  const away = Math.max(distance, radius * 3);
  orthographic.userData.height = orthoHeightForDistance(distance, perspective.fov);
  orthographic.zoom = 1;
  orthographic.position.copy(target).addScaledVector(direction, away);
  orthographic.near = radius / 500;
  orthographic.far = (away + radius) * 8;
  updateOrthoFrustum(orthographic, perspective.aspect);

  controls.target.copy(target);
  controls.minDistance = radius * 0.02;
  controls.maxDistance = distance * 6;
  controls.minZoom = 1 / 6;
  controls.maxZoom = 50;
  controls.update();
};

// Up to ~40k world-space vertex positions, enough to find the model's shape
const samplePoints = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    // the Mesh tab's wireframe copies would only count the same points twice
    if ((node as THREE.Mesh).isMesh && !node.userData.p3dOverlay) meshes.push(node as THREE.Mesh);
  });
  // an instanced mesh draws its geometry once per instance, each placed by
  // its own matrix (EXT_mesh_gpu_instancing)
  const copies = (mesh: THREE.Mesh) => {
    const instanced = mesh as THREE.InstancedMesh;
    if (!instanced.isInstancedMesh) return [mesh.matrixWorld];
    return Array.from({ length: instanced.count }, (_, i) => {
      const matrix = new THREE.Matrix4();
      instanced.getMatrixAt(i, matrix);
      return matrix.premultiply(mesh.matrixWorld);
    });
  };
  const placed = meshes.map((mesh) => ({ mesh, matrices: copies(mesh) }));
  const total = placed.reduce((sum, { mesh, matrices }) => sum + (mesh.geometry.attributes.position?.count || 0) * matrices.length, 0);
  const stride = Math.max(1, Math.ceil(total / 40000));
  const points: THREE.Vector3[] = [];
  for (const { mesh, matrices } of placed) {
    const position = mesh.geometry.attributes.position;
    if (!position) continue;
    for (const matrix of matrices) {
      for (let i = 0; i < position.count; i += stride) {
        points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix));
      }
    }
  }
  return points;
};

// The model's long horizontal direction (principal axis of its footprint),
// so a road laid out diagonally is framed along its real length
const longAxis = (points: THREE.Vector3[]) => {
  let mx = 0;
  let mz = 0;
  for (const p of points) {
    mx += p.x;
    mz += p.z;
  }
  mx /= points.length;
  mz /= points.length;
  let cxx = 0;
  let czz = 0;
  let cxz = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dz = p.z - mz;
    cxx += dx * dx;
    czz += dz * dz;
    cxz += dx * dz;
  }
  const angle = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
};

// Puts the camera three-quarters from above, at the distance where the
// model's box (oriented along its long axis) just fits the view. Landscape
// screens look across the long side; portrait screens (phones) look along it
// from higher up, so the long side runs up the screen. With `along`, the
// camera keeps that direction (a panel opened: only the distance changes)
const frameModel = (root: THREE.Object3D, cameras: Cameras, along?: THREE.Vector3) => {
  const points = samplePoints(root);
  if (!points.length) return;

  const long = longAxis(points);
  const short = new THREE.Vector3().crossVectors(Y_AXIS, long);
  const axes = [long, Y_AXIS, short];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    axes.forEach((axis, k) => {
      const d = p.dot(axis);
      if (d < min[k]) min[k] = d;
      if (d > max[k]) max[k] = d;
    });
  }
  const center = new THREE.Vector3();
  const half: number[] = [];
  axes.forEach((axis, k) => {
    center.addScaledVector(axis, (min[k] + max[k]) / 2);
    half.push((max[k] - min[k]) / 2);
  });
  const radius = Math.hypot(half[0], half[1], half[2]) || 1;

  const { tanV, tanH, aspect } = freeLens(cameras);
  const portrait = aspect < 1;
  const side = (portrait ? long : short)
    .clone()
    .applyAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(25));
  const pitch = THREE.MathUtils.degToRad(portrait ? 50 : 28);
  const toCamera = along ?? side.multiplyScalar(Math.cos(pitch)).addScaledVector(Y_AXIS, Math.sin(pitch)).normalize();
  // straight down (or up) has no horizon to take right from
  const right = new THREE.Vector3().crossVectors(Math.abs(toCamera.y) > 0.999 ? short : Y_AXIS, toCamera).normalize();
  const up = new THREE.Vector3().crossVectors(toCamera, right);

  const margin = 1.1;
  let distance = 0;
  for (let i = 0; i < 8; i++) {
    const corner = new THREE.Vector3()
      .addScaledVector(long, i & 1 ? half[0] : -half[0])
      .addScaledVector(Y_AXIS, i & 2 ? half[1] : -half[1])
      .addScaledVector(short, i & 4 ? half[2] : -half[2]);
    // the corner's depth in front of the camera is distance - (corner · toCamera)
    const needed =
      Math.max(Math.abs(corner.dot(right)) / tanH, Math.abs(corner.dot(up)) / tanV) * margin +
      corner.dot(toCamera);
    distance = Math.max(distance, needed);
  }

  place(cameras, center, toCamera, distance, radius);
};

// Looks at the model straight along one axis, at the distance where its box
// fits the screen
const axisView = (root: THREE.Object3D, cameras: Cameras, view: Exclude<CameraView, 'fit'>) => {
  const box = preciseBox(root);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const radius = half.length() || 1;
  const lens = freeLens(cameras);
  const distance = fitDistance(half.toArray() as Vec3, view, lens.fov, lens.aspect);
  const direction = new THREE.Vector3().fromArray(viewBasis(view).direction);
  place(cameras, center, direction, distance, radius);
};

export const viewModel = (root: THREE.Object3D, cameras: Cameras, view: CameraView) => {
  if (view === 'fit') frameModel(root, cameras);
  else axisView(root, cameras, view);
  cameras.framed = { root, view };
};

// Takes the panels' new inset. A framing the visitor hasn't moved away from
// is fitted again in the room left, looking the same way (the auto-rotation
// carries on from where it is)
export const setInset = (cameras: Cameras, inset: ViewInset) => {
  const { left, right, top, bottom } = cameras.inset;
  if (inset.left === left && inset.right === right && inset.top === top && inset.bottom === bottom) return;
  cameras.inset = inset;
  applyInset(cameras);
  const framed = cameras.framed;
  // a model swapped out meanwhile is no longer in the scene
  if (!framed?.root.parent) return;
  if (framed.view === 'fit') {
    const along = cameras.active.position.clone().sub(cameras.controls.target);
    if (along.lengthSq() > 0) frameModel(framed.root, cameras, along.normalize());
  } else {
    axisView(framed.root, cameras, framed.view);
  }
};

// Switches the camera the visitor looks through, keeping the view: same
// spot, same direction, the model the same size on screen. False when it
// was that camera already
export const setProjection = (cameras: Cameras, projection: Projection) => {
  const { perspective, orthographic, controls } = cameras;
  const next = projection === 'orthographic' ? orthographic : perspective;
  if (cameras.active === next) return false;
  const target = controls.target;

  if (next === orthographic) {
    const offset = perspective.position.clone().sub(target);
    const distance = offset.length() || 1;
    const radius = perspective.near * 500;
    const away = Math.max(distance, radius * 3);
    orthographic.userData.height = orthoHeightForDistance(distance, perspective.fov);
    orthographic.zoom = 1;
    orthographic.position.copy(target).addScaledVector(offset.normalize(), away);
    orthographic.near = perspective.near;
    orthographic.far = (away + radius) * 8;
    updateOrthoFrustum(orthographic, perspective.aspect);
  } else {
    const offset = orthographic.position.clone().sub(target).normalize();
    const height = ((orthographic.userData.height as number) || 1) / orthographic.zoom;
    const distance = Math.min(
      Math.max(distanceForOrthoHeight(height, perspective.fov), controls.minDistance),
      controls.maxDistance
    );
    perspective.position.copy(target).addScaledVector(offset, distance);
    perspective.updateProjectionMatrix();
  }

  cameras.active = next;
  controls.object = next;
  controls.update();
  return true;
};
