// How the visitor looks at the model: camera projection and views, the
// lighting environment, tone mapping, background, ground, shadows and
// ambient occlusion. Like the Scene settings, visitor-side only: nothing is
// sent or saved, a reload starts over. Pure (no three.js), shared by the
// panel and the viewer's stage

import type { Vec3 } from './scene.settings';

export type Projection = 'perspective' | 'orthographic';

export type ToneMappingId = 'none' | 'agx' | 'neutral' | 'aces' | 'linear';

export const TONE_MAPPINGS: { id: ToneMappingId; label: string }[] = [
  { id: 'none', label: 'None (as authored)' },
  { id: 'agx', label: 'AgX' },
  { id: 'neutral', label: 'Khronos PBR Neutral' },
  { id: 'aces', label: 'ACES Filmic' },
  { id: 'linear', label: 'Linear' },
];

export type EnvironmentId = 'studio' | 'photo-studio' | 'outdoor' | 'sunset' | 'warehouse' | 'city-night';

export interface EnvironmentPreset {
  id: EnvironmentId;
  label: string;
  // a CC0 HDRI served from /environments, or null for the procedural studio
  file: string | null;
  // the environment's own brightness, and the key light's (the light that
  // casts the shadows) before exposure
  intensity: number;
  light: number;
}

// The studio is today's look (three's RoomEnvironment + one key light). The
// others are Poly Haven HDRIs (CC0), loaded only when picked; their key
// light points at the brightest part of the sky (see brightestDirection)
export const ENVIRONMENTS: EnvironmentPreset[] = [
  { id: 'studio', label: 'Studio', file: null, intensity: 1, light: 1.2 },
  { id: 'photo-studio', label: 'Photo studio', file: '/environments/brown_photostudio_02_1k.hdr', intensity: 1, light: 0.6 },
  { id: 'outdoor', label: 'Outdoor', file: '/environments/kloofendal_48d_partly_cloudy_puresky_1k.hdr', intensity: 1, light: 0.8 },
  { id: 'sunset', label: 'Sunset', file: '/environments/venice_sunset_1k.hdr', intensity: 1, light: 0.8 },
  { id: 'warehouse', label: 'Warehouse', file: '/environments/empty_warehouse_01_1k.hdr', intensity: 1, light: 0.5 },
  { id: 'city-night', label: 'City night', file: '/environments/shanghai_bund_1k.hdr', intensity: 1.5, light: 0.4 },
];

export const environmentPreset = (id: EnvironmentId) => ENVIRONMENTS.find((env) => env.id === id) ?? ENVIRONMENTS[0];

// The studio's key light, as it has always been: up, right and in front
export const STUDIO_LIGHT_DIRECTION: Vec3 = [1, 2, 1.5];

// What the viewer tells the panel: an environment downloading or failed,
// and the largest shadow map this device can draw
export interface LookStatus {
  loading: EnvironmentId | null;
  failed: EnvironmentId | null;
  maxShadowQuality: number;
}

export type BackgroundMode = 'stage' | 'colour' | 'environment';

export const SHADOW_QUALITIES = [256, 512, 1024, 2048, 4096] as const;
export type ShadowQuality = (typeof SHADOW_QUALITIES)[number];

export const GROUND_AO_RESOLUTIONS = [256, 512, 1024, 2048] as const;
export type GroundAoResolution = (typeof GROUND_AO_RESOLUTIONS)[number];

export const AO_SAMPLES = [8, 16, 32] as const;
export type AoSamples = (typeof AO_SAMPLES)[number];

// "1k" for 1024, as resolution pickers usually say it
export const formatResolution = (size: number) => (size >= 1024 ? `${size / 1024}k` : String(size));

export interface ViewLook {
  projection: Projection;
  environment: {
    id: EnvironmentId;
    // degrees about the vertical axis; the key light turns with it
    rotation: number;
    // EV: scales the environment and the lights (×2 per step), never the
    // image, so unlit colours never change with it
    exposure: number;
  };
  toneMapping: ToneMappingId;
  background: {
    // stage: the page's own backdrop (the canvas stays transparent)
    mode: BackgroundMode;
    // #rrggbb, '' until the visitor picks Colour
    colour: string;
    intensity: number;
    // 0..1
    blur: number;
  };
  // the key light's shadows, on the model itself (and on the virtual ground
  // when it casts them)
  shadows: {
    enabled: boolean;
    // ×: 1 is the default edge, 0 the sharpest, 3 the softest
    softness: number;
    // 0..1
    intensity: number;
    // the shadow map's size in texels
    quality: ShadowQuality;
  };
  // an invisible floor at the model's base that shows only what falls on it:
  // the key light's shadow and the sky's occlusion
  ground: {
    enabled: boolean;
    // the key light's shadow on the ground
    castShadows: boolean;
    // how dark everything on the ground is, 0..1
    intensity: number;
    // a visible floor too (a dark disc fading out), not only the shadows
    floor: boolean;
    // ambient occlusion on the ground: how much of the sky each point of
    // the floor can't see because the model is in the way
    ao: {
      enabled: boolean;
      // half-angle of the cone of sky light, from straight up: 90° is the
      // whole sky (wide, soft), small is light from overhead (tight, under
      // the footprint)
      cone: number;
      // the occlusion texture's size in texels
      resolution: GroundAoResolution;
      // blur radius, in texels of a 256 texture (so it smooths as much at
      // every resolution), smoothing the sampling noise
      blur: number;
    };
  };
  // screen-space ambient occlusion on the model itself (GTAO)
  ao: {
    enabled: boolean;
    // 0..1: up to 0.5 fades the occlusion in, beyond deepens it
    intensity: number;
    // how far occlusion reaches, as a share of the model's size: small is
    // contact shadows in creases, large is broad darkening
    radius: number;
    // how thick surfaces are assumed to be, relative to the radius
    thickness: number;
    // blur radius in pixels (0: raw, noisy)
    denoise: number;
    samples: AoSamples;
  };
}

export const DEFAULT_LOOK: ViewLook = {
  projection: 'perspective',
  environment: { id: 'studio', rotation: 0, exposure: 0 },
  toneMapping: 'none',
  background: { mode: 'stage', colour: '', intensity: 1, blur: 0 },
  shadows: { enabled: false, softness: 1, intensity: 0.6, quality: 1024 },
  ground: {
    enabled: false,
    castShadows: true,
    intensity: 1,
    floor: false,
    ao: { enabled: true, cone: 90, resolution: 512, blur: 2 },
  },
  ao: { enabled: false, intensity: 0.6, radius: 0.25, thickness: 1, denoise: 8, samples: 16 },
};

export const LIMITS = {
  rotation: [-180, 180],
  exposure: [-3, 3],
  backgroundIntensity: [0, 2],
  blur: [0, 1],
  softness: [0, 3],
  shadowIntensity: [0, 1],
  groundIntensity: [0, 1],
  cone: [0, 90],
  groundBlur: [0, 8],
  aoIntensity: [0, 1],
  aoRadius: [0.02, 1],
  aoThickness: [0.1, 3],
  aoDenoise: [0, 20],
} as const;

// The PCF filter radius, in shadow texels, for a softness (×). 1× is the
// edge the viewer has by default; three filters with 5 samples a pixel, so
// beyond ~10 texels the edge turns grainy
export const shadowRadius = (softness: number) => 1 + 2.5 * softness;

export const clamp = (value: number, [min, max]: readonly [number, number]) =>
  Math.min(max, Math.max(min, value));

// The lighting settings only (projection is a camera setting, kept apart so
// "Reset lighting" leaves the camera alone)
export const isDefaultLighting = (look: ViewLook) =>
  JSON.stringify({ ...look, projection: null }) === JSON.stringify({ ...DEFAULT_LOOK, projection: null });

export const exposureFactor = (ev: number) => 2 ** ev;

export const formatEv = (ev: number) => {
  const rounded = Math.round(ev * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${(rounded === 0 ? 0 : rounded).toFixed(1)} EV`;
};

export const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

export const formatTimes = (value: number) => `${value.toFixed(2)}×`;

// "24 24 24" (a colours.scss channel triple) → "#181818"; '' if unreadable
export const channelsToHex = (channels: string) => {
  const parts = channels.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 3 || parts.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return '';
  return `#${parts.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export const isHexColour = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

// ---- camera views ----

export type CameraView = 'fit' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export const CAMERA_VIEWS: { id: CameraView; label: string }[] = [
  { id: 'fit', label: 'Fit' },
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
];

// Where the camera sits, seen from the model (glTF: +Y up, +Z the front),
// and which way is up on screen. Top and bottom lean a hair towards the
// front so the orbit controls (which turn about +Y) keep a defined up: the
// front of the model ends up at the bottom of the screen, as in Blender
const AXIS_VIEWS: Record<Exclude<CameraView, 'fit'>, { direction: Vec3; up: Vec3 }> = {
  front: { direction: [0, 0, 1], up: [0, 1, 0] },
  back: { direction: [0, 0, -1], up: [0, 1, 0] },
  right: { direction: [1, 0, 0], up: [0, 1, 0] },
  left: { direction: [-1, 0, 0], up: [0, 1, 0] },
  top: { direction: [0, 1, 0], up: [0, 0, -1] },
  bottom: { direction: [0, -1, 0], up: [0, 0, 1] },
};

const TILT = 1e-3;

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

// The camera's direction (from the model's centre), and its right and up
// axes on screen, for one of the six axis views
export const viewBasis = (view: Exclude<CameraView, 'fit'>) => {
  const { direction, up } = AXIS_VIEWS[view];
  const right = cross(up, direction);
  const offset: Vec3 =
    view === 'top' || view === 'bottom' ? [direction[0], direction[1], TILT] : [...direction];
  const length = Math.hypot(...offset);
  return { direction: offset.map((v) => v / length) as Vec3, right, up };
};

// Half the box's extent seen along an axis (the box is axis-aligned)
const extentAlong = (half: Vec3, axis: Vec3) =>
  Math.abs(half[0] * axis[0]) + Math.abs(half[1] * axis[1]) + Math.abs(half[2] * axis[2]);

// How far from the box's centre a perspective camera looking at it from
// `view` must sit for the whole box to fit, with `margin` to spare
export const fitDistance = (
  half: Vec3,
  view: Exclude<CameraView, 'fit'>,
  fovDegrees: number,
  aspect: number,
  margin = 1.1
) => {
  const { direction, right, up } = viewBasis(view);
  const tanV = Math.tan((fovDegrees * Math.PI) / 360);
  const tanH = tanV * aspect;
  const needed = Math.max(extentAlong(half, up) / tanV, extentAlong(half, right) / tanH) * margin;
  return extentAlong(half, direction) + (needed || 1);
};

// An orthographic view as tall (in world units) as a perspective camera with
// this vertical field of view sees at `distance`: switching between the two
// keeps the model the same size on screen
export const orthoHeightForDistance = (distance: number, fovDegrees: number) =>
  2 * distance * Math.tan((fovDegrees * Math.PI) / 360);

export const distanceForOrthoHeight = (height: number, fovDegrees: number) =>
  height / (2 * Math.tan((fovDegrees * Math.PI) / 360));

// ---- environments ----

// The direction of the brightest patch of an equirectangular image (rows top
// to bottom, as an HDR file stores them), in three's world space: three maps
// u = atan2(z, x) / 2π + 0.5 and v = asin(y) / π + 0.5. `luminance(x, y)`
// reads one texel. Rows are weighted by their area on the sphere, so the
// stretched poles don't win. The elevation is kept between 20° and 75°: a
// light at the horizon or straight overhead casts useless shadows
export const brightestDirection = (
  width: number,
  height: number,
  luminance: (x: number, y: number) => number,
  stride = 2
): Vec3 => {
  let best = -Infinity;
  let bestX = 0;
  let bestY = 0;
  for (let y = 0; y < height; y += stride) {
    const latitude = Math.PI / 2 - ((y + 0.5) / height) * Math.PI;
    const weight = Math.cos(latitude);
    for (let x = 0; x < width; x += stride) {
      const value = luminance(x, y) * weight;
      if (value > best) {
        best = value;
        bestX = x;
        bestY = y;
      }
    }
  }
  const phi = ((bestX + 0.5) / width - 0.5) * 2 * Math.PI;
  const rawLatitude = Math.PI / 2 - ((bestY + 0.5) / height) * Math.PI;
  const latitude = Math.min((75 * Math.PI) / 180, Math.max((20 * Math.PI) / 180, rawLatitude));
  return [Math.cos(phi) * Math.cos(latitude), Math.sin(latitude), Math.sin(phi) * Math.cos(latitude)];
};

// Turns a direction about the vertical axis (positive: counter-clockwise
// seen from above, as three's rotation.y)
export const rotateY = ([x, y, z]: Vec3, degrees: number): Vec3 => {
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
};

// ---- ground ambient occlusion ----

// The directions the sky light comes from for the ground's occlusion:
// `count` of them inside a cone of `coneDegrees` (half-angle) around straight
// up, spread evenly (a stratified spiral, the same every time, so the result
// doesn't flicker when it's recomputed) and denser towards the top, as sky
// light falls on a floor (cosine-weighted)
export const coneDirections = (count: number, coneDegrees: number): Vec3[] => {
  const maxSin = Math.sin((Math.min(90, Math.max(0, coneDegrees)) * Math.PI) / 180);
  const golden = (Math.sqrt(5) - 1) / 2;
  const directions: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const sinTheta = Math.sqrt((i + 0.5) / count) * maxSin;
    const cosTheta = Math.sqrt(1 - sinTheta * sinTheta);
    const phi = 2 * Math.PI * ((i * golden) % 1);
    directions.push([Math.cos(phi) * sinTheta, cosTheta, Math.sin(phi) * sinTheta]);
  }
  return directions;
};
