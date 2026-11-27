import {
  brightestDirection,
  channelsToHex,
  clamp,
  coneDirections,
  DEFAULT_LOOK,
  distanceForOrthoHeight,
  environmentPreset,
  ENVIRONMENTS,
  exposureFactor,
  fitDistance,
  formatEv,
  formatPercent,
  formatResolution,
  isDefaultLighting,
  isHexColour,
  LIMITS,
  orthoHeightForDistance,
  rotateY,
  shadowRadius,
  viewBasis,
} from './look.settings';

const close = (actual: number[], expected: number[], digits = 6) =>
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], digits));

describe('look settings', () => {
  it('starts from today\'s look: studio, no tone mapping, stage, nothing extra', () => {
    expect(DEFAULT_LOOK.projection).toBe('perspective');
    expect(DEFAULT_LOOK.environment).toEqual({ id: 'studio', rotation: 0, exposure: 0 });
    expect(DEFAULT_LOOK.toneMapping).toBe('none');
    expect(DEFAULT_LOOK.background.mode).toBe('stage');
    expect(DEFAULT_LOOK.shadows.enabled).toBe(false);
    expect(DEFAULT_LOOK.ground.enabled).toBe(false);
    expect(DEFAULT_LOOK.ao.enabled).toBe(false);
    // the studio keeps the key light it always had
    expect(environmentPreset('studio')).toMatchObject({ file: null, intensity: 1, light: 1.2 });
  });

  it('knows the untouched lighting, whatever the projection', () => {
    expect(isDefaultLighting(DEFAULT_LOOK)).toBe(true);
    expect(isDefaultLighting({ ...DEFAULT_LOOK, projection: 'orthographic' })).toBe(true);
    expect(isDefaultLighting({ ...DEFAULT_LOOK, toneMapping: 'agx' })).toBe(false);
    expect(isDefaultLighting({ ...DEFAULT_LOOK, ao: { ...DEFAULT_LOOK.ao, enabled: true } })).toBe(false);
    expect(isDefaultLighting({ ...DEFAULT_LOOK, ground: { ...DEFAULT_LOOK.ground, enabled: true } })).toBe(false);
    expect(
      isDefaultLighting({ ...DEFAULT_LOOK, ground: { ...DEFAULT_LOOK.ground, ao: { ...DEFAULT_LOOK.ground.ao, cone: 45 } } })
    ).toBe(false);
    expect(isDefaultLighting({ ...DEFAULT_LOOK, environment: { ...DEFAULT_LOOK.environment, rotation: 10 } })).toBe(false);
  });

  it('lists every bundled environment once, each with a file', () => {
    const ids = ENVIRONMENTS.map((env) => env.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const env of ENVIRONMENTS.filter((e) => e.id !== 'studio')) {
      expect(env.file).toMatch(/^\/environments\/[a-z0-9_]+\.hdr$/);
    }
  });

  it('doubles the light per EV step and formats EV', () => {
    expect(exposureFactor(0)).toBe(1);
    expect(exposureFactor(1)).toBe(2);
    expect(exposureFactor(-2)).toBe(0.25);
    expect(formatEv(0)).toBe('0.0 EV');
    expect(formatEv(0.5)).toBe('+0.5 EV');
    expect(formatEv(-1.26)).toBe('-1.3 EV');
    expect(formatEv(-0.01)).toBe('0.0 EV');
    expect(formatPercent(0.305)).toBe('31%');
  });

  it('clamps to the limits', () => {
    expect(clamp(5, LIMITS.exposure)).toBe(3);
    expect(clamp(-5, LIMITS.exposure)).toBe(-3);
    expect(clamp(0.4, LIMITS.blur)).toBe(0.4);
  });

  it('reads colour channels from the stylesheet', () => {
    expect(channelsToHex('24 24 24')).toBe('#181818');
    expect(channelsToHex(' 0 128 255 ')).toBe('#0080ff');
    expect(channelsToHex('256 0 0')).toBe('');
    expect(channelsToHex('red')).toBe('');
    expect(isHexColour('#0080ff')).toBe(true);
    expect(isHexColour('#08f')).toBe(false);
    expect(isHexColour('')).toBe(false);
  });

  it('looks at the front from +Z and keeps a defined up from the top', () => {
    close(viewBasis('front').direction, [0, 0, 1]);
    close(viewBasis('front').right, [1, 0, 0]);
    close(viewBasis('left').direction, [-1, 0, 0]);
    close(viewBasis('left').right, [0, 0, 1]);
    const top = viewBasis('top');
    // straight down, leaning a hair to the front so +Y orbiting still works
    expect(top.direction[1]).toBeCloseTo(1, 5);
    expect(top.direction[2]).toBeGreaterThan(0);
    close(top.up, [0, 0, -1]);
    close(top.right, [1, 0, 0]);
    close(viewBasis('bottom').right, [1, 0, 0]);
  });

  it('backs off until the box fits, in width or in height', () => {
    // a 2 × 2 × 2 cube seen from the front with a 90° view on a square screen:
    // the face is 1 wide at half, so 1 / tan(45°) = 1 beyond the front face
    expect(fitDistance([1, 1, 1], 'front', 90, 1, 1)).toBeCloseTo(2, 6);
    // a narrow screen: the width decides
    expect(fitDistance([1, 1, 1], 'front', 90, 0.5, 1)).toBeCloseTo(3, 6);
    // a box long in X on a wide (2:1) screen: from the right its length is
    // depth (4 + its 1 high side), from the front it's width (2 deep + 4 / 2)
    expect(fitDistance([4, 1, 2], 'right', 90, 2, 1)).toBeCloseTo(4 + 1, 6);
    expect(fitDistance([4, 1, 2], 'front', 90, 2, 1)).toBeCloseTo(2 + 2, 6);
  });

  it('keeps the model the same size when switching projection', () => {
    const height = orthoHeightForDistance(10, 40);
    expect(height).toBeCloseTo(2 * 10 * Math.tan((20 * Math.PI) / 180), 9);
    expect(distanceForOrthoHeight(height, 40)).toBeCloseTo(10, 9);
  });

  it('finds the sun in an equirectangular image', () => {
    const width = 64;
    const height = 32;
    // a bright texel a quarter of the way across, 30° above the horizon
    const sunX = 16;
    const sunY = Math.round(height / 2 - (30 / 180) * height) - 1;
    const direction = brightestDirection(width, height, (x, y) => (x === sunX && y === sunY ? 100 : 1), 1);
    const latitude = Math.PI / 2 - ((sunY + 0.5) / height) * Math.PI;
    const phi = ((sunX + 0.5) / width - 0.5) * 2 * Math.PI;
    close(direction, [Math.cos(phi) * Math.cos(latitude), Math.sin(latitude), Math.sin(phi) * Math.cos(latitude)]);
    expect(Math.hypot(...direction)).toBeCloseTo(1, 9);
  });

  it('keeps the light off the horizon and off the zenith', () => {
    const atHorizon = brightestDirection(64, 32, (x, y) => (y === 16 ? 10 : 1), 1);
    expect(Math.asin(atHorizon[1])).toBeCloseTo((20 * Math.PI) / 180, 6);
    const overhead = brightestDirection(64, 32, (x, y) => (y === 2 ? 1000 : 1), 1);
    expect(Math.asin(overhead[1])).toBeCloseTo((75 * Math.PI) / 180, 6);
  });

  it('turns a direction about the vertical axis like three\'s rotation.y', () => {
    // rotation.y = +90° takes +X to -Z
    close(rotateY([1, 0, 0], 90), [0, 0, -1]);
    close(rotateY([0, 0, 1], 90), [1, 0, 0]);
    close(rotateY([0, 1, 0], 45), [0, 1, 0]);
    close(rotateY([1, 2, 3], 0), [1, 2, 3]);
  });

  it('names resolutions the way pickers do', () => {
    expect(formatResolution(256)).toBe('256');
    expect(formatResolution(1024)).toBe('1k');
    expect(formatResolution(4096)).toBe('4k');
  });

  it('keeps the default shadow edge at 1× softness', () => {
    expect(shadowRadius(1)).toBeCloseTo(3.5, 9);
    expect(shadowRadius(0)).toBe(1);
    expect(shadowRadius(3)).toBeLessThanOrEqual(10);
  });

  it('spreads the sky directions inside the cone, from straight up', () => {
    for (const cone of [0, 30, 90]) {
      const directions = coneDirections(64, cone);
      expect(directions).toHaveLength(64);
      for (const d of directions) {
        expect(Math.hypot(...d)).toBeCloseTo(1, 9);
        // never below the horizon, never wider than the cone
        expect(d[1]).toBeGreaterThanOrEqual(0);
        expect((Math.acos(Math.min(1, d[1])) * 180) / Math.PI).toBeLessThanOrEqual(cone + 1e-6);
      }
    }
    // a zero cone is light from straight overhead only
    for (const d of coneDirections(8, 0)) expect(d[1]).toBeCloseTo(1, 9);
    // the whole sky reaches close to the horizon, all the way round
    const wide = coneDirections(64, 90);
    expect(Math.min(...wide.map((d) => d[1]))).toBeLessThan(0.15);
    const mean = wide.reduce((m, d) => [m[0] + d[0] / 64, m[1] + d[2] / 64], [0, 0]);
    expect(Math.hypot(mean[0], mean[1])).toBeLessThan(0.05);
  });

  it('gives the same directions every time (no flicker when recomputed)', () => {
    expect(coneDirections(16, 60)).toEqual(coneDirections(16, 60));
  });
});
