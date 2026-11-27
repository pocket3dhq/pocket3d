import {
  centered,
  DEFAULT_TRANSFORM,
  formatDegrees,
  formatDimensions,
  formatLength,
  formatScale,
  isDefault,
  normalizeDegrees,
  onFloor,
  parseDegrees,
  parseLength,
  parseScale,
  positionDragStep,
  rotateQuarter,
  SceneBounds,
  SceneTransform,
} from './scene.settings';

const bounds = (min: [number, number, number], max: [number, number, number]): SceneBounds => ({
  src: '/model.glb',
  min,
  max,
});

describe('scene settings helpers', () => {
  it('knows the untouched transform', () => {
    expect(isDefault(DEFAULT_TRANSFORM)).toBe(true);
    expect(isDefault({ ...DEFAULT_TRANSFORM, scale: 2 })).toBe(false);
    expect(isDefault({ ...DEFAULT_TRANSFORM, rotation: [0, 90, 0] })).toBe(false);
    expect(isDefault({ ...DEFAULT_TRANSFORM, position: [0, 0, 0.5] })).toBe(false);
  });

  it('centres the box on the origin and rests it on the floor', () => {
    const t: SceneTransform = { position: [1, 2, 3], rotation: [0, 0, 0], scale: 1 };
    const box = bounds([0.5, 1, -1], [2.5, 4, 1]);
    expect(centered(t, box).position).toEqual([-0.5, -0.5, 3]);
    expect(onFloor(t, box).position).toEqual([1, 1, 3]);
    // already there: nothing moves
    expect(onFloor({ ...t, position: [0, 0, 0] }, bounds([-1, 0, -1], [1, 2, 1])).position).toEqual([0, 0, 0]);
  });

  it('turns a quarter at a time and keeps angles in (-180, 180]', () => {
    let t = DEFAULT_TRANSFORM;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      t = rotateQuarter(t);
      seen.push(t.rotation[1]);
    }
    expect(seen).toEqual([90, 180, -90, 0]);
    expect(rotateQuarter(DEFAULT_TRANSFORM, 0).rotation).toEqual([90, 0, 0]);
    expect(normalizeDegrees(-180)).toBe(180);
    expect(normalizeDegrees(540)).toBe(180);
    expect(normalizeDegrees(-450)).toBe(-90);
  });

  it('reads lengths in m, cm and mm', () => {
    expect(parseLength('1.2')).toBe(1.2);
    expect(parseLength(' -0.55 m ')).toBe(-0.55);
    expect(parseLength('120cm')).toBe(1.2);
    expect(parseLength('15 mm')).toBe(0.015);
    expect(parseLength('.5')).toBe(0.5);
    for (const bad of ['', 'abc', '1 km', '1e3', 'Infinity', '1..2', '--1']) {
      expect(parseLength(bad)).toBeNull();
    }
  });

  it('reads angles and wraps them', () => {
    expect(parseDegrees('45')).toBe(45);
    expect(parseDegrees('-90°')).toBe(-90);
    expect(parseDegrees('270 deg')).toBe(-90);
    expect(parseDegrees('nope')).toBeNull();
  });

  it('reads a positive scale factor within bounds', () => {
    expect(parseScale('1.5')).toBe(1.5);
    expect(parseScale('2x')).toBe(2);
    expect(parseScale('1.37×')).toBe(1.37);
    expect(parseScale('150%')).toBe(1.5);
    expect(parseScale('99999')).toBe(1000);
    expect(parseScale('0.0000001')).toBe(0.001);
    for (const bad of ['0', '-2', '', 'big']) {
      expect(parseScale(bad)).toBeNull();
    }
  });

  it('formats lengths, angles, scales and dimensions', () => {
    expect(formatLength(-0.55)).toBe('-0.55 m');
    expect(formatLength(0)).toBe('0.00 m');
    expect(formatLength(0.042)).toBe('4.2 cm');
    expect(formatLength(0.003)).toBe('3.0 mm');
    expect(formatDegrees(90)).toBe('90°');
    expect(formatDegrees(12.345)).toBe('12.3°');
    expect(formatScale(1.37)).toBe('1.37×');
    expect(formatScale(1)).toBe('1×');
    expect(formatScale(0.005)).toBe('0.005×');
    expect(formatDimensions(bounds([0, 0, 0], [6.16, 3, 3.34]))).toBe('6.16 × 3.00 × 3.34 m');
    expect(formatDimensions(bounds([0, 0, 0], [0.05, 0.02, 0.03]))).toBe('5.0 × 2.0 × 3.0 cm');
  });

  it('scales label dragging with the model size', () => {
    expect(positionDragStep(null)).toBe(0.01);
    expect(positionDragStep(bounds([0, 0, 0], [4, 1, 2]))).toBe(0.02);
  });
});
