// Pictures of a model's textures for the Materials tab, drawn by the
// viewer's own renderer: the texture is already on the graphics card, so
// this works for any format, and reads its values exactly. A 2D canvas would
// lose the colour under transparent pixels (it premultiplies alpha).
// sRGB textures are re-encoded, so the picture shows the stored values

import * as THREE from 'three';
import type { Isolate } from './material.settings';

const ISOLATE_MODE: Record<Isolate, number> = { rgb: 0, r: 1, g: 2, b: 3, a: 4 };

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform int mode;
uniform bool srgb;
uniform bool flip;
varying vec2 vUv;

vec3 encode( vec3 c ) {
  return mix( c * 12.92, pow( c, vec3( 1.0 / 2.4 ) ) * 1.055 - 0.055, step( vec3( 0.0031308 ), c ) );
}

void main() {
  // the target's first row (bottom) is read first, as the image's top row:
  // a glTF texture (flipY false) has its top row at v = 0
  vec2 uv = flip ? vec2( vUv.x, 1.0 - vUv.y ) : vUv;
  vec4 texel = texture2D( map, uv );
  vec3 c = srgb ? encode( texel.rgb ) : texel.rgb;
  vec3 colour = mode == 1 ? vec3( c.r ) : mode == 2 ? vec3( c.g ) : mode == 3 ? vec3( c.b ) : mode == 4 ? vec3( texel.a ) : c;
  gl_FragColor = vec4( colour, 1.0 );
}
`;

interface Painter {
  scene: THREE.Scene;
  camera: THREE.Camera;
  material: THREE.ShaderMaterial;
  quad: THREE.Mesh;
}

const painters = new WeakMap<THREE.WebGLRenderer, Painter>();

const painterFor = (renderer: THREE.WebGLRenderer) => {
  let painter = painters.get(renderer);
  if (!painter) {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { map: { value: null }, mode: { value: 0 }, srgb: { value: false }, flip: { value: false } },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    painter = { scene, camera: new THREE.Camera(), material, quad };
    painters.set(renderer, painter);
  }
  return painter;
};

export const disposePainter = (renderer: THREE.WebGLRenderer) => {
  const painter = painters.get(renderer);
  if (!painter) return;
  painter.material.dispose();
  painter.quad.geometry.dispose();
  painters.delete(renderer);
};

export interface TexturePicture {
  data: ImageData;
  // the texture's own size
  width: number;
  height: number;
}

const sizeOf = (texture: THREE.Texture) => {
  const image = texture.image as { width?: number; height?: number } | null;
  return { width: image?.width ?? 0, height: image?.height ?? 0 };
};

// The texture (or one of its channels, as grey) at most `maxSize` pixels
// wide or high, keeping its proportions; null while its image isn't there
export const readTexture = (
  renderer: THREE.WebGLRenderer,
  texture: THREE.Texture,
  isolate: Isolate,
  maxSize: number
): TexturePicture | null => {
  const { width, height } = sizeOf(texture);
  if (!width || !height) return null;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const painter = painterFor(renderer);
  const { uniforms } = painter.material;
  uniforms.map.value = texture;
  uniforms.mode.value = ISOLATE_MODE[isolate];
  uniforms.srgb.value = THREE.ColorManagement.getTransfer(texture.colorSpace) === THREE.SRGBTransfer;
  uniforms.flip.value = texture.flipY;

  const target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
  const previous = renderer.getRenderTarget();
  const pixels = new Uint8Array(w * h * 4);
  try {
    renderer.setRenderTarget(target);
    renderer.render(painter.scene, painter.camera);
    renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
  } finally {
    renderer.setRenderTarget(previous);
    uniforms.map.value = null;
    target.dispose();
  }
  return { data: new ImageData(new Uint8ClampedArray(pixels.buffer), w, h), width, height };
};
