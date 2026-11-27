// What the Scene panel changes on the model a visitor is looking at: where
// it sits, how it is turned and how big it is. Visitor-side only (nothing
// is sent or saved; a reload starts over). Pure functions, shared by the
// panel and the viewer. glTF units are metres

export type Vec3 = [number, number, number];

export interface SceneTransform {
  // metres
  position: Vec3;
  // degrees, applied in XYZ order
  rotation: Vec3;
  // uniform factor
  scale: number;
}

// The world-space box of the model on screen, transform included. `src` is
// the file it was measured on: the previous model stays on screen while the
// next one loads, and its box must not drive the panel
export interface SceneBounds {
  src: string;
  min: Vec3;
  max: Vec3;
}

export const DEFAULT_TRANSFORM: SceneTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
};

export const MIN_SCALE = 0.001;
export const MAX_SCALE = 1000;

// keeps -0 and float dust (0.1 + 0.2) out of the fields
const tidy = (value: number) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
};

export const isDefault = (t: SceneTransform) =>
  t.scale === 1 && t.position.every((v) => v === 0) && t.rotation.every((v) => v === 0);

// An angle in (-180, 180]
export const normalizeDegrees = (degrees: number) => {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return tidy(wrapped === -180 ? 180 : wrapped);
};

export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

const center = (bounds: SceneBounds): Vec3 => [
  (bounds.min[0] + bounds.max[0]) / 2,
  (bounds.min[1] + bounds.max[1]) / 2,
  (bounds.min[2] + bounds.max[2]) / 2,
];

export const size = (bounds: SceneBounds): Vec3 => [
  bounds.max[0] - bounds.min[0],
  bounds.max[1] - bounds.min[1],
  bounds.max[2] - bounds.min[2],
];

// Moves the model so the middle of its box sits at the origin (the point
// the camera turns around when the model is framed)
export const centered = (t: SceneTransform, bounds: SceneBounds): SceneTransform => {
  const c = center(bounds);
  return { ...t, position: [tidy(t.position[0] - c[0]), tidy(t.position[1] - c[1]), tidy(t.position[2] - c[2])] };
};

// Moves the model up or down so the bottom of its box rests on y = 0
export const onFloor = (t: SceneTransform, bounds: SceneBounds): SceneTransform => ({
  ...t,
  position: [t.position[0], tidy(t.position[1] - bounds.min[1]), t.position[2]],
});

// A quarter turn about one axis (Y by default: the model turns in place)
export const rotateQuarter = (t: SceneTransform, axis: 0 | 1 | 2 = 1): SceneTransform => {
  const rotation = [...t.rotation] as Vec3;
  rotation[axis] = normalizeDegrees(rotation[axis] + 90);
  return { ...t, rotation };
};

// "1.2", "1.2 m", "-30cm", "15 mm" → metres; null for anything else
export const parseLength = (text: string): number | null => {
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*(m|cm|mm)?\s*$/i.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] || 'm').toLowerCase();
  return tidy(unit === 'cm' ? value / 100 : unit === 'mm' ? value / 1000 : value);
};

// "45", "45°", "-90 deg" → degrees in (-180, 180]; null for anything else
export const parseDegrees = (text: string): number | null => {
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*(°|deg)?\s*$/i.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? normalizeDegrees(value) : null;
};

// "1.5", "1.5x", "1.5×", "150%" → a factor within [MIN_SCALE, MAX_SCALE];
// null for anything else (zero and negatives included: the model would vanish
// or turn inside out)
export const parseScale = (text: string): number | null => {
  const match = /^\s*(\+?(?:\d+\.?\d*|\.\d+))\s*(x|×|%)?\s*$/i.exec(text);
  if (!match) return null;
  let value = Number(match[1]);
  if (match[2] === '%') value /= 100;
  if (!Number.isFinite(value) || value <= 0) return null;
  return tidy(clampScale(value));
};

// A length as the panel shows it: metres, or cm / mm for small models
export const formatLength = (metres: number) => {
  const abs = Math.abs(metres);
  if (abs === 0 || abs >= 0.1) return `${tidy(metres).toFixed(2)} m`;
  if (abs >= 0.01) return `${(metres * 100).toFixed(1)} cm`;
  return `${(metres * 1000).toFixed(1)} mm`;
};

export const formatDegrees = (degrees: number) => `${Number(tidy(degrees).toFixed(1))}°`;

export const formatScale = (scale: number) => `${Number(scale.toFixed(scale < 0.1 ? 3 : 2))}×`;

// "6.16 × 3.00 × 3.34 m" (width × height × depth), in the unit that suits
// the largest side
export const formatDimensions = (bounds: SceneBounds) => {
  const [x, y, z] = size(bounds);
  const largest = Math.max(x, y, z);
  const [factor, unit] = largest >= 0.1 ? [1, 'm'] : largest >= 0.01 ? [100, 'cm'] : [1000, 'mm'];
  const digits = unit === 'm' ? 2 : 1;
  return `${[x, y, z].map((v) => (v * factor).toFixed(digits)).join(' × ')} ${unit}`;
};

// How far one pixel of dragging on an X / Y / Z label moves the model:
// crossing 200 px moves it by its own largest side
export const positionDragStep = (bounds: SceneBounds | null) => {
  if (!bounds) return 0.01;
  const largest = Math.max(...size(bounds));
  return largest > 0 ? largest / 200 : 0.01;
};
