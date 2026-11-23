'use client';

import { FC, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { isTyping } from './versions';

// Draco-compressed glbs (common from AI generators) need the decoder; Google
// hosts the versioned builds three's DRACOLoader expects
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

// Frees everything the GPU holds for the loaded model
const disposeObject = (root: THREE.Object3D) => {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
};

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Up to ~40k world-space vertex positions, enough to find the model's shape
const samplePoints = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
  });
  const total = meshes.reduce((sum, m) => sum + (m.geometry.attributes.position?.count || 0), 0);
  const stride = Math.max(1, Math.ceil(total / 40000));
  const points: THREE.Vector3[] = [];
  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position;
    if (!position) continue;
    for (let i = 0; i < position.count; i += stride) {
      points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
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
// from higher up, so the long side runs up the screen
const frameModel = (
  root: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls
) => {
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

  const portrait = camera.aspect < 1;
  const side = (portrait ? long : short)
    .clone()
    .applyAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(25));
  const pitch = THREE.MathUtils.degToRad(portrait ? 50 : 28);
  const toCamera = side.multiplyScalar(Math.cos(pitch)).addScaledVector(Y_AXIS, Math.sin(pitch)).normalize();
  const right = new THREE.Vector3().crossVectors(Y_AXIS, toCamera).normalize();
  const up = new THREE.Vector3().crossVectors(toCamera, right);

  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanH = tanV * camera.aspect;
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

  camera.position.copy(center).addScaledVector(toCamera, distance);
  camera.near = radius / 500;
  camera.far = (distance + radius) * 8;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.minDistance = radius * 0.02;
  controls.maxDistance = distance * 6;
  controls.update();
};

// Everything that lives as long as the viewer, whatever model it shows
interface Stage {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  scene: THREE.Scene;
  loader: GLTFLoader;
  model: THREE.Object3D | null;
  // bounding radius of the model shown, to tell whether the next one is of
  // a comparable size
  radius: number | null;
}

const boundingRadius = (root: THREE.Object3D) =>
  new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere()).radius || 1;

// A new version within this factor of the old one's size keeps the camera
// where it is, so flipping between versions shows what changed; beyond it
// the camera reframes (the new one would be lost or fill the screen)
const KEEP_CAMERA_RATIO = 3;

export const ModelViewer: FC<{ src: string; title: string }> = ({ src, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  // the file on screen, the one loading, the one that failed: set from the
  // loader's callbacks only
  const [shownSrc, setShownSrc] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ src: string; ratio: number | null } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // The renderer, camera and controls: created once, kept across models
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    // No tone mapping: baked / unlit colours (KHR_materials_unlit, cel looks)
    // must come out exactly as authored
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'block h-full w-full touch-none outline-none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Lit (PBR) models get a neutral studio environment plus one key light;
    // unlit materials ignore both
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(1, 2, 1.5);
    scene.add(keyLight);

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.01,
      1000
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    // the first touch or drag hands control to the visitor for good
    const stopAutoRotate = () => {
      controls.autoRotate = false;
    };
    controls.addEventListener('start', stopAutoRotate);

    const resize = () => {
      const width = container.clientWidth;
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
    const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
    const stage: Stage = { renderer, camera, controls, scene, loader, model: null, radius: null };
    stageRef.current = stage;

    // R puts the camera back where it started for this model
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'r' || event.key === 'R') && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target) && stage.model) {
        frameModel(stage.model, camera, controls);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      stageRef.current = null;
      window.removeEventListener('keydown', onKey);
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.removeEventListener('start', stopAutoRotate);
      controls.dispose();
      if (stage.model) {
        scene.remove(stage.model);
        disposeObject(stage.model);
      }
      environment.dispose();
      pmrem.dispose();
      draco.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    stageRef.current?.renderer.domElement.setAttribute('aria-label', `3D model: ${title}`);
  }, [title]);

  // The model: loaded whenever the file changes. The one on screen stays
  // until the new one is ready; a load that finishes after a newer request
  // (quick clicks through versions) is thrown away, never shown
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let cancelled = false;

    stage.loader.load(
      src,
      (gltf) => {
        if (cancelled) {
          disposeObject(gltf.scene);
          return;
        }
        const next = gltf.scene;
        const radius = boundingRadius(next);
        const previous = stage.model;
        if (previous) {
          stage.scene.remove(previous);
          disposeObject(previous);
        }
        stage.scene.add(next);
        const reframe =
          stage.radius === null ||
          radius / stage.radius > KEEP_CAMERA_RATIO ||
          stage.radius / radius > KEEP_CAMERA_RATIO;
        stage.model = next;
        stage.radius = radius;
        if (reframe) {
          frameModel(next, stage.camera, stage.controls);
        }
        setFailedSrc(null);
        setShownSrc(src);
      },
      (event) => {
        if (cancelled) return;
        setProgress({ src, ratio: event.total ? event.loaded / event.total : null });
      },
      (error) => {
        if (cancelled) return;
        console.error('Could not load the model', error);
        setFailedSrc(src);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [src]);

  const failed = failedSrc === src;
  const loading = shownSrc !== src && !failed;
  // a model is on screen already: the next one loads behind it
  const replacing = loading && shownSrc !== null;
  const ratio = progress?.src === src ? progress.ratio : null;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {loading && !replacing && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[12px]">
          <div className="h-[4px] w-[180px] overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${Math.round((ratio ?? 0.1) * 100)}%` }}
            />
          </div>
          <div className="text-[13px] text-textMuted">
            {ratio === null ? 'Loading model…' : `Loading model… ${Math.round(ratio * 100)}%`}
          </div>
        </div>
      )}
      {replacing && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] overflow-hidden bg-line/60"
          role="progressbar"
          aria-label="Loading this version"
          aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)}
        >
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${Math.round((ratio ?? 0.15) * 100)}%` }}
          />
        </div>
      )}
      {failed && (
        <div
          className={
            shownSrc
              ? 'pointer-events-none absolute inset-x-0 top-[56px] flex justify-center px-[16px]'
              : 'absolute inset-0 flex items-center justify-center px-[24px]'
          }
        >
          <div
            role="alert"
            className="max-w-[360px] rounded-control bg-bg/80 px-[12px] py-[8px] text-center text-[14px] text-danger"
          >
            {shownSrc
              ? 'This version could not be loaded. Check your connection and try again.'
              : 'This model could not be loaded. Check your connection and reload the page.'}
          </div>
        </div>
      )}
    </div>
  );
};
