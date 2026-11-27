// Everything the viewer draws besides the model: renderer, cameras,
// environment and key light, ground and shadows, ambient occlusion. The
// visitor's look settings (look.settings.ts) are applied here.
//
// With DEFAULT_LOOK the picture must stay exactly as it always was:
// NoToneMapping + sRGB output (unlit / baked-colour models render exactly as
// authored), the RoomEnvironment studio, one key light, a transparent canvas
// over the page's stage, no post-processing

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Cameras, updateOrthoFrustum } from './camera';
import { GroundOcclusion } from './ground.occlusion';
import {
  brightestDirection,
  DEFAULT_LOOK,
  EnvironmentId,
  environmentPreset,
  exposureFactor,
  isHexColour,
  rotateY,
  shadowRadius,
  STUDIO_LIGHT_DIRECTION,
  ToneMappingId,
  ViewLook,
} from './look.settings';
import type { Vec3 } from './scene.settings';
import { disposeMaterialIndex, MaterialIndex } from './materials';
import { disposePainter } from './texture.preview';
import { disposeMeshIndex, InspectionGroups, isOverlay, MeshIndex } from './mesh.inspect';

// Draco-compressed glbs (common from AI generators) need the decoder; Google
// hosts the versioned builds three's DRACOLoader expects
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

const TONE_MAPPING: Record<ToneMappingId, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  linear: THREE.LinearToneMapping,
};

// The visible floor's colour (a dark grey, lit like the model) and how far
// the virtual ground spreads around the model, in model radii
const GROUND_COLOUR = 0x3a3a3a;
const GROUND_SPREAD = 3;

interface LoadedEnvironment {
  // prefiltered, for lighting
  lighting: THREE.Texture;
  // the picture itself, for the background
  background: THREE.Texture;
  // where the key light comes from, before the visitor's rotation
  light: Vec3;
}

interface Occlusion {
  composer: EffectComposer;
  gtao: GTAOPass;
  camera: THREE.Camera;
}

export interface Stage extends Cameras {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  loader: GLTFLoader;
  draco: DRACOLoader;
  pmrem: THREE.PMREMGenerator;
  keyLight: THREE.DirectionalLight;
  // The virtual ground: an invisible plane at the model's base that shows
  // only the key light's shadow (as dark as the visitor asks, however
  // bright the environment), the sky's occlusion on it, and optionally a
  // visible floor under both (lit, fading out at the edge)
  ground: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
  shadowCatcher: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>;
  groundOcclusion: GroundOcclusion;
  // whether the model's meshes receive the key light's shadows now
  selfShadows: boolean;
  // RoomEnvironment's prefiltered texture: the default lighting
  studio: THREE.Texture;
  environments: Map<EnvironmentId, LoadedEnvironment>;
  // the environment on screen (a newly picked one shows once it has loaded)
  environment: EnvironmentId;
  occlusion: Occlusion | null;
  look: ViewLook;
  // a group holding the loaded scene: the visitor's Scene settings move,
  // turn and scale the group, never the file's own nodes
  model: THREE.Object3D | null;
  // bounding radius of the model shown, to tell whether the next one is of
  // a comparable size
  radius: number | null;
  // the model's materials, for the Materials tab
  materials: MaterialIndex | null;
  // the model's objects and geometry, for the Mesh tab, and where its dots,
  // normals and boxes are drawn (outside the model: its box stays its own)
  meshes: MeshIndex | null;
  inspection: InspectionGroups;
  // the parts the Mesh tab hides, as a key: the ground's occlusion is
  // baked again when it changes
  hiddenKey: string;
  // a channel view (roughness, normals...) is on: the picture shows raw
  // values, so no ground, shadows or ambient occlusion over them
  inspecting: boolean;
  // false once disposed: a late environment download is then thrown away
  alive: boolean;
}

// Frees everything the GPU holds for the loaded model
export const disposeObject = (root: THREE.Object3D) => {
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

// A white disc fading to nothing at the edge, as the ground's alpha
const fadeTexture = () => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'white');
    gradient.addColorStop(0.35, 'white');
    gradient.addColorStop(1, 'black');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
};

export const createStage = (container: HTMLElement): Stage => {
  const width = container.clientWidth;
  const height = Math.max(container.clientHeight, 1);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  // No tone mapping by default: baked / unlit colours (KHR_materials_unlit,
  // cel looks) must come out exactly as authored
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // on, but nothing is drawn into it until the key light casts shadows
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'block h-full w-full touch-none outline-none';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Lit (PBR) models get a neutral studio environment plus one key light;
  // unlit materials ignore both
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = studio;
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.fromArray(STUDIO_LIGHT_DIRECTION);
  keyLight.shadow.intensity = DEFAULT_LOOK.shadows.intensity;
  scene.add(keyLight, keyLight.target);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 96),
    new THREE.MeshStandardMaterial({
      color: GROUND_COLOUR,
      roughness: 1,
      metalness: 0,
      transparent: true,
      alphaMap: fadeTexture(),
      depthWrite: false,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.visible = false;
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShadowMaterial({ opacity: 1, depthWrite: false })
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.receiveShadow = true;
  shadowCatcher.visible = false;
  shadowCatcher.renderOrder = 1;
  const groundOcclusion = new GroundOcclusion();
  scene.add(ground, groundOcclusion.display, shadowCatcher);

  // moved with the model each frame (its matrix is the holder's)
  const inspection: InspectionGroups = { model: new THREE.Group(), world: new THREE.Group() };
  inspection.model.matrixAutoUpdate = false;
  scene.add(inspection.model, inspection.world);

  const perspective = new THREE.PerspectiveCamera(40, width / height, 0.01, 1000);
  const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  orthographic.userData.height = 2;
  updateOrthoFrustum(orthographic, width / height);

  const controls = new OrbitControls(perspective, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;

  const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
  const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);

  const stage: Stage = {
    renderer,
    scene,
    loader,
    draco,
    pmrem,
    keyLight,
    ground,
    shadowCatcher,
    groundOcclusion,
    selfShadows: false,
    studio,
    environments: new Map(),
    environment: 'studio',
    occlusion: null,
    look: DEFAULT_LOOK,
    perspective,
    orthographic,
    active: perspective,
    controls,
    model: null,
    radius: null,
    materials: null,
    meshes: null,
    inspection,
    hiddenKey: '',
    inspecting: false,
    alive: true,
  };
  return stage;
};

export const renderStage = (stage: Stage) => {
  stage.controls.update();
  if (stage.model && stage.inspection.model.children.length) {
    stage.inspection.model.matrix.copy(stage.model.matrixWorld);
    stage.inspection.model.matrixWorldNeedsUpdate = true;
  }
  stage.groundOcclusion.step(stage.renderer, stage.scene);
  // a channel view shows raw values: drawn straight, past the ambient
  // occlusion (kept meanwhile: a new pass would have new noise)
  if (stage.occlusion && !stage.inspecting) stage.occlusion.composer.render();
  else stage.renderer.render(stage.scene, stage.active);
};

export const resizeStage = (stage: Stage, width: number, height: number) => {
  const aspect = width / Math.max(height, 1);
  stage.renderer.setSize(width, height, false);
  stage.perspective.aspect = aspect;
  stage.perspective.updateProjectionMatrix();
  updateOrthoFrustum(stage.orthographic, aspect);
  stage.occlusion?.composer.setSize(width, height);
};

const disposeOcclusion = (stage: Stage) => {
  if (!stage.occlusion) return;
  stage.occlusion.gtao.dispose();
  stage.occlusion.composer.dispose();
  stage.occlusion = null;
};

export const disposeStage = (stage: Stage) => {
  stage.alive = false;
  disposeOcclusion(stage);
  stage.controls.dispose();
  // the Mesh tab's looks come off first: they sit over the materials
  if (stage.meshes) {
    disposeMeshIndex(stage.meshes);
    stage.meshes = null;
  }
  if (stage.materials) {
    disposeMaterialIndex(stage.materials);
    stage.materials = null;
  }
  disposePainter(stage.renderer);
  if (stage.model) {
    stage.scene.remove(stage.model);
    disposeObject(stage.model);
  }
  for (const environment of stage.environments.values()) {
    environment.lighting.dispose();
    environment.background.dispose();
  }
  stage.ground.geometry.dispose();
  stage.ground.material.alphaMap?.dispose();
  stage.ground.material.dispose();
  stage.shadowCatcher.geometry.dispose();
  stage.shadowCatcher.material.dispose();
  stage.groundOcclusion.dispose();
  stage.keyLight.shadow.map?.dispose();
  stage.studio.dispose();
  stage.pmrem.dispose();
  stage.draco.dispose();
  stage.renderer.dispose();
  stage.renderer.domElement.remove();
};

// A newly loaded model casts shadows (free while no light casts any), and
// receives them while the visitor has shadows on
export const prepareModel = (stage: Stage, root: THREE.Object3D) => {
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh && !isOverlay(node)) {
      node.castShadow = true;
      node.receiveShadow = stage.selfShadows;
    }
  });
};

const setSelfShadows = (stage: Stage, on: boolean) => {
  if (stage.selfShadows === on) return;
  stage.selfShadows = on;
  stage.model?.traverse((node) => {
    if ((node as THREE.Mesh).isMesh && !isOverlay(node)) node.receiveShadow = on;
  });
};

// Fetches one of the bundled HDRIs, once: prefiltered for lighting, kept
// as-is for the background, and its brightest spot found for the key light
export const loadEnvironment = async (stage: Stage, id: EnvironmentId) => {
  if (id === 'studio' || stage.environments.has(id)) return;
  const preset = environmentPreset(id);
  if (!preset.file) return;
  const texture = await new HDRLoader().loadAsync(preset.file);
  if (!stage.alive || stage.environments.has(id)) {
    texture.dispose();
    return;
  }
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const { data, width, height } = texture.image as { data: Uint16Array; width: number; height: number };
  const half = THREE.DataUtils.fromHalfFloat;
  const light = brightestDirection(width, height, (x, y) => {
    const i = (y * width + x) * 4;
    return 0.2126 * half(data[i]) + 0.7152 * half(data[i + 1]) + 0.0722 * half(data[i + 2]);
  });
  const lighting = stage.pmrem.fromEquirectangular(texture).texture;
  stage.environments.set(id, { lighting, background: texture, light });
};

// Shows a loaded environment (the studio always is)
export const showEnvironment = (stage: Stage, id: EnvironmentId) => {
  if (id !== 'studio' && !stage.environments.has(id)) return false;
  stage.environment = id;
  applyLook(stage, stage.look);
  return true;
};

// The model's box in the world, or null before one loads
const modelBox = (stage: Stage) => {
  if (!stage.model) return null;
  const box = new THREE.Box3().setFromObject(stage.model);
  return box.isEmpty() ? null : box;
};

// Puts the ground under the model, fits the shadow camera around it and
// sizes the occlusion to it: after a load, and after the visitor moves,
// turns or scales the model
export const fitToModel = (stage: Stage) => {
  const box = modelBox(stage);
  const { ground } = stage.look;
  if (!box || !stage.model) {
    stage.groundOcclusion.update(null, ground.ao.blur);
    return;
  }
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;

  // a hair below the model, so a flat base doesn't flicker against it
  const floor = box.min.y - radius * 0.001;
  stage.ground.position.set(center.x, floor, center.z);
  stage.ground.scale.setScalar(radius * GROUND_SPREAD * 2);
  stage.shadowCatcher.position.set(center.x, floor + radius * 0.0005, center.z);
  stage.shadowCatcher.scale.setScalar(radius * GROUND_SPREAD * 2);

  placeKeyLight(stage, center, radius);
  sizeOcclusion(stage, radius);

  const occlusion = ground.enabled && ground.ao.enabled;
  stage.groundOcclusion.update(
    occlusion
      ? {
          model: stage.model,
          center,
          floor,
          radius,
          cone: ground.ao.cone,
          resolution: ground.ao.resolution,
          shown: stage.hiddenKey,
        }
      : null,
    ground.ao.blur
  );
};

const lightDirection = (stage: Stage): Vec3 => {
  const base =
    stage.environment === 'studio'
      ? STUDIO_LIGHT_DIRECTION
      : stage.environments.get(stage.environment)?.light ?? STUDIO_LIGHT_DIRECTION;
  return rotateY(base, stage.look.environment.rotation);
};

// The key light keeps its direction; for shadows it stands just outside the
// model, looking at its centre, with a shadow camera that holds the model
// and the shadow it throws on the floor
const placeKeyLight = (stage: Stage, center: THREE.Vector3, radius: number) => {
  const { keyLight } = stage;
  const direction = new THREE.Vector3().fromArray(lightDirection(stage)).normalize();
  keyLight.target.position.copy(center);
  keyLight.position.copy(center).addScaledVector(direction, radius * 4);
  keyLight.target.updateMatrixWorld();
  const camera = keyLight.shadow.camera;
  const reach = radius * 2.5;
  camera.left = -reach;
  camera.right = reach;
  camera.top = reach;
  camera.bottom = -reach;
  camera.near = radius * 0.5;
  camera.far = radius * 8;
  camera.updateProjectionMatrix();
  // biases in world units: about a shadow texel
  const texel = (reach * 2) / keyLight.shadow.mapSize.x;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = texel * 1.5;
};

const sizeOcclusion = (stage: Stage, radius: number) => {
  if (!stage.occlusion) return;
  const { ao } = stage.look;
  const reach = ao.radius * radius;
  // intensity: the first half fades the occlusion in, the second half
  // deepens it (GTAO's power, up to 3)
  stage.occlusion.gtao.updateGtaoMaterial({
    radius: reach,
    thickness: ao.thickness * reach,
    samples: ao.samples,
    scale: Math.max(1, 1 + (ao.intensity - 0.5) * 4),
  });
  stage.occlusion.gtao.updatePdMaterial({ radius: ao.denoise });
  stage.occlusion.gtao.blendIntensity = Math.min(1, ao.intensity * 2);
};

// The post-processing chain for ambient occlusion, only while it's on: the
// scene renders into a multisampled target, GTAO darkens it, the output pass
// applies tone mapping and sRGB (as the renderer does without it). Rebuilt
// when the camera changes (the pass is compiled for one projection)
const syncOcclusion = (stage: Stage, enabled: boolean) => {
  if (!enabled) {
    disposeOcclusion(stage);
    return;
  }
  if (stage.occlusion?.camera === stage.active) return;
  disposeOcclusion(stage);
  const { renderer, scene, active } = stage;
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, active));
  const gtao = new GTAOPass(scene, active, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
  stage.occlusion = { composer, gtao, camera: active };
};

const setShadowQuality = (light: THREE.DirectionalLight, quality: number) => {
  if (light.shadow.mapSize.x === quality) return;
  light.shadow.mapSize.set(quality, quality);
  light.shadow.map?.dispose();
  light.shadow.map = null;
};

// Applies the visitor's look (all but the camera projection, which
// camera.ts switches, and the environment, which shows once loaded)
export const applyLook = (stage: Stage, look: ViewLook) => {
  stage.look = look;
  const { renderer, scene, keyLight } = stage;
  const preset = environmentPreset(stage.environment);
  const loaded = stage.environments.get(stage.environment);
  const exposure = exposureFactor(look.environment.exposure);
  const rotation = THREE.MathUtils.degToRad(look.environment.rotation);

  renderer.toneMapping = TONE_MAPPING[look.toneMapping];

  scene.environment = loaded?.lighting ?? stage.studio;
  scene.environmentIntensity = preset.intensity * exposure;
  scene.environmentRotation.set(0, rotation, 0);
  keyLight.intensity = preset.light * exposure;

  const { background } = look;
  if (background.mode === 'colour' && isHexColour(background.colour)) {
    scene.background = new THREE.Color(background.colour);
  } else if (background.mode === 'environment') {
    scene.background = loaded?.background ?? stage.studio;
    scene.backgroundIntensity = background.intensity;
    scene.backgroundBlurriness = background.blur;
    scene.backgroundRotation.set(0, rotation, 0);
  } else {
    scene.background = null;
  }

  const { shadows, ground } = look;
  const groundShadows = ground.enabled && ground.castShadows;
  // the key light casts for the model, the ground, or both; the model
  // receives them only with shadows on
  keyLight.castShadow = shadows.enabled || groundShadows;
  setSelfShadows(stage, shadows.enabled);
  setShadowQuality(keyLight, shadows.quality);
  keyLight.shadow.intensity = shadows.intensity;
  const showGround = ground.enabled && !stage.inspecting;
  stage.shadowCatcher.visible = groundShadows && !stage.inspecting;
  stage.shadowCatcher.material.opacity = ground.intensity;
  stage.ground.visible = showGround && ground.floor;
  stage.groundOcclusion.display.visible = showGround && ground.ao.enabled;
  stage.groundOcclusion.display.material.opacity = ground.intensity;
  // softness: the PCF filter's radius, in shadow texels (so a finer map
  // also gives a crisper edge)
  keyLight.shadow.radius = shadowRadius(shadows.softness);

  syncOcclusion(stage, look.ao.enabled);
  fitToModel(stage);
};
