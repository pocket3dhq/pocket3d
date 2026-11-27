// Ambient occlusion on the virtual ground: the soft dark patch under a model
// where it hides the sky from the floor. Worked out once, not every frame:
// the model's shadow is drawn onto a floor plane from SAMPLES directions
// inside the cone of sky light (look.settings coneDirections), and the
// average of those shadows is how much sky each point of the floor misses.
// A few directions per frame, so a heavy model doesn't freeze the page; the
// patch shows at once and settles in a fraction of a second. Then blurred
// (the "blur noise" setting) and faded out towards its edge, and shown on
// the ground as a darkening. Nothing is redone until the model, its
// placement, the cone or the resolution change

import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { coneDirections } from './look.settings';

const SAMPLES = 128;
const PER_FRAME = 8;
// how far the patch can reach around the model, in model radii
export const GROUND_AO_SPREAD = 2;
// the floor plane is drawn on its own layer: the bake camera sees only it,
// the light's shadow camera only the model
const PLANE_LAYER = 1;
const CASTER_LAYER = 2;

export interface GroundOcclusionTarget {
  // the model's group, moved into the bake scene for each step
  model: THREE.Object3D;
  // the model's box centre and the floor's height, in the world
  center: THREE.Vector3;
  floor: number;
  // the model's bounding radius
  radius: number;
  cone: number;
  resolution: number;
  // which of its parts are shown (the Mesh tab hides some): a change bakes again
  shown?: string;
}

const blurShader = {
  uniforms: {
    tInput: { value: null as THREE.Texture | null },
    direction: { value: new THREE.Vector2(1, 0) },
    // blur radius in texels
    radius: { value: 2 },
    // makes a partial sum read as a full average while samples are added
    scale: { value: 1 },
    // fade towards the edge of the plane (second pass only)
    fade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tInput;
    uniform vec2 direction;
    uniform float radius;
    uniform float scale;
    uniform float fade;
    varying vec2 vUv;
    void main() {
      vec2 texel = direction / vec2(textureSize(tInput, 0));
      float sum = 0.0;
      float total = 0.0;
      for (int i = -6; i <= 6; i++) {
        float x = float(i) / 6.0;
        float weight = exp(-x * x * 2.0);
        sum += texture2D(tInput, vUv + texel * x * radius).r * weight;
        total += weight;
      }
      float value = sum / total * scale;
      float edge = 1.0 - smoothstep(0.6, 1.0, length(vUv - 0.5) * 2.0);
      value *= mix(1.0, edge, fade);
      gl_FragColor = vec4(vec3(value), 1.0);
    }
  `,
};

export class GroundOcclusion {
  // the darkening shown in the viewer's scene
  readonly display: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private readonly scene = new THREE.Scene();
  private readonly light = new THREE.DirectionalLight(0xffffff, 1);
  private readonly plane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>;
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  private readonly blurMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(blurShader.uniforms),
    vertexShader: blurShader.vertexShader,
    fragmentShader: blurShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  private readonly quad = new FullScreenQuad(this.blurMaterial);
  private sum: THREE.WebGLRenderTarget | null = null;
  private across: THREE.WebGLRenderTarget | null = null;
  private result: THREE.WebGLRenderTarget | null = null;
  private target: GroundOcclusionTarget | null = null;
  private key = '';
  private directions: THREE.Vector3[] = [];
  private done = 0;
  private blur = 2;
  private blurred = false;

  constructor() {
    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false })
    );
    display.rotation.x = -Math.PI / 2;
    display.renderOrder = 1;
    display.visible = false;
    this.display = display;

    // each direction adds 1 / SAMPLES where the floor is in the model's shadow
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({
        color: 0xffffff,
        opacity: 1 / SAMPLES,
        depthWrite: false,
        depthTest: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
      })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    plane.layers.set(PLANE_LAYER);
    this.plane = plane;

    this.light.castShadow = true;
    // three only lights (and casts from) lights the camera's layers see
    this.light.layers.enable(PLANE_LAYER);
    this.light.shadow.bias = 0;
    this.light.shadow.normalBias = 0;
    // each direction's shadow a little soft, so 128 of them blend smoothly
    this.light.shadow.radius = 2;
    // a shadow camera layer besides 0 makes three use its layers (0: the
    // model) rather than the bake camera's (the plane only)
    this.light.shadow.camera.layers.enable(CASTER_LAYER);
    this.camera.layers.set(PLANE_LAYER);
    // looking straight down, with -Z up: the target's u runs along +X and v
    // along -Z, as the display plane's texture does
    this.camera.up.set(0, 0, -1);
    this.scene.add(this.light, this.light.target, plane);
  }

  // Asks for the occlusion of this model as placed now (null: none). Only a
  // change of model, placement, shown parts, cone or resolution starts over
  update(target: GroundOcclusionTarget | null, blur: number) {
    if (blur !== this.blur) {
      this.blur = blur;
      this.blurred = false;
    }
    if (!target) {
      this.target = null;
      this.key = '';
      return;
    }
    const matrix = target.model.matrixWorld.elements.map((v) => v.toFixed(5)).join(',');
    const key = [target.model.uuid, matrix, target.shown ?? '', target.cone, target.resolution].join('|');
    this.target = target;
    if (key === this.key) return;
    this.key = key;
    this.done = 0;
    this.blurred = false;
    this.directions = coneDirections(SAMPLES, target.cone).map((d) => new THREE.Vector3(...d));

    const half = target.radius * GROUND_AO_SPREAD;
    for (const mesh of [this.plane, this.display]) {
      mesh.position.set(target.center.x, target.floor, target.center.z);
      mesh.scale.setScalar(half * 2);
    }
    // a hair above the shadow plane, so both show
    this.display.position.y += target.radius * 0.001;
    this.camera.left = -half;
    this.camera.right = half;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.near = target.radius * 0.01;
    this.camera.far = target.radius * 2;
    this.camera.position.set(target.center.x, target.floor + target.radius, target.center.z);
    this.camera.lookAt(target.center.x, target.floor, target.center.z);
    this.camera.updateProjectionMatrix();

    const shadow = this.light.shadow;
    if (shadow.mapSize.x !== target.resolution) {
      shadow.mapSize.set(target.resolution, target.resolution);
      shadow.map?.dispose();
      shadow.map = null;
    }
    // the shadow camera holds the model's sphere, and reaches back past the
    // far side of the floor patch for light coming in low
    shadow.camera.left = -target.radius;
    shadow.camera.right = target.radius;
    shadow.camera.top = target.radius;
    shadow.camera.bottom = -target.radius;
    shadow.camera.near = target.radius * 0.5;
    shadow.camera.far = target.radius * (3 + GROUND_AO_SPREAD * 2);
    shadow.camera.updateProjectionMatrix();

    if (this.sum?.width !== target.resolution) {
      this.sum?.dispose();
      this.across?.dispose();
      this.result?.dispose();
      const make = () =>
        new THREE.WebGLRenderTarget(target.resolution, target.resolution, {
          type: THREE.HalfFloatType,
          depthBuffer: false,
        });
      this.sum = make();
      this.across = make();
      this.result = make();
      this.display.material.alphaMap = this.result.texture;
      this.display.material.needsUpdate = true;
    }
  }

  // Adds a few directions (or just redoes the blur); true when it drew
  // anything. Called before each frame
  step(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const target = this.target;
    if (!target || !this.sum || (this.done >= SAMPLES && this.blurred)) return false;

    const previousTarget = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    renderer.autoClear = false;

    if (this.done < SAMPLES) {
      if (this.done === 0) {
        renderer.setRenderTarget(this.sum);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false);
      }
      // the model joins the bake scene for a moment (an object has one
      // parent); its place in the world doesn't change
      const parent = target.model.parent;
      this.scene.add(target.model);
      renderer.setRenderTarget(this.sum);
      const end = Math.min(SAMPLES, this.done + PER_FRAME);
      for (; this.done < end; this.done++) {
        const direction = this.directions[this.done];
        this.light.position.copy(target.center).addScaledVector(direction, target.radius * 2);
        this.light.target.position.copy(target.center);
        this.light.updateMatrixWorld();
        this.light.target.updateMatrixWorld();
        renderer.render(this.scene, this.camera);
      }
      (parent ?? scene).add(target.model);
    }

    // blur across, then down (fading the edge), into the texture shown. The
    // blur is in texels of a 256 texture, so a setting smooths as much at
    // every resolution (a finer one keeps more detail where it isn't blurred)
    this.blurMaterial.uniforms.radius.value = this.blur * (target.resolution / 256);
    this.blurMaterial.uniforms.scale.value = SAMPLES / Math.max(1, this.done);
    this.blurMaterial.uniforms.tInput.value = this.sum.texture;
    this.blurMaterial.uniforms.direction.value.set(1, 0);
    this.blurMaterial.uniforms.fade.value = 0;
    renderer.setRenderTarget(this.across);
    this.quad.render(renderer);
    this.blurMaterial.uniforms.tInput.value = this.across!.texture;
    this.blurMaterial.uniforms.direction.value.set(0, 1);
    this.blurMaterial.uniforms.scale.value = 1;
    this.blurMaterial.uniforms.fade.value = 1;
    renderer.setRenderTarget(this.result);
    this.quad.render(renderer);
    this.blurred = this.done >= SAMPLES;

    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = autoClear;
    renderer.setClearColor(clearColor, clearAlpha);
    return true;
  }

  dispose() {
    this.sum?.dispose();
    this.across?.dispose();
    this.result?.dispose();
    this.light.shadow.map?.dispose();
    this.light.dispose();
    this.plane.geometry.dispose();
    this.plane.material.dispose();
    this.display.geometry.dispose();
    this.display.material.dispose();
    this.blurMaterial.dispose();
    this.quad.dispose();
  }
}
