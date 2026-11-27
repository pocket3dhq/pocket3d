'use client';

import { FC } from 'react';
import {
  AO_SAMPLES,
  BackgroundMode,
  channelsToHex,
  clamp,
  DEFAULT_LOOK,
  ENVIRONMENTS,
  environmentPreset,
  formatEv,
  formatPercent,
  formatResolution,
  formatTimes,
  GROUND_AO_RESOLUTIONS,
  isHexColour,
  LIMITS,
  LookStatus,
  SHADOW_QUALITIES,
  ShadowQuality,
  TONE_MAPPINGS,
  ViewLook,
} from './look.settings';
import { formatDegrees } from './scene.settings';
import { Choice, Section, Segmented, SelectField, Slider, Switch } from './panel.controls';

const BACKGROUNDS: { id: BackgroundMode; label: string }[] = [
  { id: 'stage', label: 'Stage' },
  { id: 'colour', label: 'Colour' },
  { id: 'environment', label: 'Environment' },
];

const TONE_MAPPING_HINTS: Record<ViewLook['toneMapping'], string> = {
  none: 'Colours exactly as in the file, as the author made them.',
  agx: 'Applies to the whole picture, unlit materials included.',
  neutral: 'Applies to the whole picture, unlit materials included.',
  aces: 'Applies to the whole picture, unlit materials included.',
  linear: 'Light values straight to the screen, clipped at white: the same picture as None (exposure acts on the lights).',
};

const times = formatTimes;
const twoDecimals = (value: number) => value.toFixed(2);
const pixels = (value: number) => (value === 0 ? 'Off' : `${value} px`);

// The page's own backdrop colour, to start the colour picker from
const stageColour = () =>
  channelsToHex(getComputedStyle(document.documentElement).getPropertyValue('--p3d-stage-top')) || '#000000';

// What each less obvious setting does, behind its ⓘ
const INFO = {
  modelShadows:
    'The key light\'s shadows on the model itself, one part shading another. Shadows on the floor are under Virtual ground.',
  softness: 'How soft the shadow edges are. 1× is the default; a higher resolution also gives a crisper edge.',
  shadowIntensity: 'How dark the shadows are, on the model and on the ground.',
  shadowResolution: 'The size of the shadow map: higher is sharper and more detailed, and heavier on the graphics card.',
  ground:
    'An invisible floor at the base of the model. It shows only what falls on it: the key light\'s shadow and the sky\'s occlusion.',
  castShadows: 'The key light\'s shadow on the ground. Its softness and resolution are set under Shadow.',
  groundIntensity: 'How dark the shadow and the occlusion on the ground are.',
  floor: 'A dark floor under the shadows, so the ground shows on any background.',
  groundAo:
    'The soft dark patch under the model where it hides the sky from the floor, so the model sits on the ground whatever the light.',
  cone:
    'Where the sky light comes from, measured from straight up. 90° is the whole sky: a wide, soft patch around the model. Smaller angles keep the light overhead, so the patch stays tight under the footprint.',
  aoResolution: 'The size of the occlusion texture: higher keeps more detail near the contact points, and takes longer to work out.',
  blurNoise:
    'Smooths the occlusion. It is built from 128 light directions: little blur shows their steps, more blur gives a smoother, softer patch.',
  modelAo:
    'Screen-space occlusion on the model itself: darkens creases and the contacts between its parts. Worked out every frame, for what is on screen.',
};

// The Lighting tab: environment, tone mapping, background, shadow, virtual
// ground (with its ambient occlusion), ambient occlusion on the model.
// Changes apply at once, on this screen only
export const LightingPanel: FC<{
  look: ViewLook;
  status: LookStatus;
  onChange: (look: ViewLook) => void;
}> = ({ look, status, onChange }) => {
  const { environment, background, shadows, ground, ao } = look;
  const setEnvironment = (patch: Partial<ViewLook['environment']>) =>
    onChange({ ...look, environment: { ...environment, ...patch } });
  const setBackground = (patch: Partial<ViewLook['background']>) =>
    onChange({ ...look, background: { ...background, ...patch } });
  const setShadows = (patch: Partial<ViewLook['shadows']>) =>
    onChange({ ...look, shadows: { ...shadows, ...patch } });
  const setGround = (patch: Partial<ViewLook['ground']>) => onChange({ ...look, ground: { ...ground, ...patch } });
  const setGroundAo = (patch: Partial<ViewLook['ground']['ao']>) =>
    onChange({ ...look, ground: { ...ground, ao: { ...ground.ao, ...patch } } });
  const setAo = (patch: Partial<ViewLook['ao']>) => onChange({ ...look, ao: { ...ao, ...patch } });

  const qualities = SHADOW_QUALITIES.filter((q) => q <= status.maxShadowQuality).map((q) => ({
    id: q as ShadowQuality,
    label: formatResolution(q),
  }));
  const aoResolutions = GROUND_AO_RESOLUTIONS.map((r) => ({ id: r, label: formatResolution(r) }));
  // the shadow settings matter once the key light casts, on the model or the ground
  const casting = shadows.enabled || (ground.enabled && ground.castShadows);
  const groundAoOn = ground.enabled && ground.ao.enabled;

  return (
    <div className="flex flex-col gap-[22px]">
      <Section title="Environment">
        <div className="grid grid-cols-3 gap-[6px]" role="group" aria-label="Environment">
          {ENVIRONMENTS.map((preset) => {
            const selected = environment.id === preset.id;
            const loading = status.loading === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                aria-busy={loading || undefined}
                onClick={() => setEnvironment({ id: preset.id })}
                className={`flex h-[34px] items-center justify-center gap-[6px] truncate rounded-control border px-[6px] text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  selected
                    ? 'border-accent bg-accent/10 text-textColor'
                    : 'border-transparent bg-textColor/[0.06] text-textMuted hover:text-textColor'
                }`}
              >
                {loading && (
                  <span aria-hidden className="h-[10px] w-[10px] shrink-0 animate-spin rounded-full border-2 border-textMuted border-t-transparent" />
                )}
                {preset.label}
              </button>
            );
          })}
        </div>
        {status.failed && (
          <p role="alert" className="-mt-[8px] text-[12px] text-danger">
            {environmentPreset(status.failed).label} could not be loaded. Check your connection and pick it again.
          </p>
        )}
        <Slider
          label="Rotation"
          value={environment.rotation}
          min={LIMITS.rotation[0]}
          max={LIMITS.rotation[1]}
          step={1}
          format={formatDegrees}
          reset={0}
          onChange={(rotation) => setEnvironment({ rotation })}
        />
        <Slider
          label="Exposure"
          value={environment.exposure}
          min={LIMITS.exposure[0]}
          max={LIMITS.exposure[1]}
          step={0.1}
          format={formatEv}
          reset={0}
          onChange={(exposure) => setEnvironment({ exposure: clamp(Math.round(exposure * 10) / 10, LIMITS.exposure) })}
        />
      </Section>

      <Section title="Tone mapping">
        <SelectField
          label="Tone mapping"
          options={TONE_MAPPINGS}
          value={look.toneMapping}
          onChange={(toneMapping) => onChange({ ...look, toneMapping })}
        />
        <p className="-mt-[8px] text-[12px] text-textMuted">
          {TONE_MAPPING_HINTS[look.toneMapping]}
        </p>
      </Section>

      <Section title="Background">
        <Segmented
          label="Background"
          options={BACKGROUNDS}
          value={background.mode}
          onChange={(mode) =>
            setBackground(mode === 'colour' && !isHexColour(background.colour) ? { mode, colour: stageColour() } : { mode })
          }
        />
        {background.mode === 'colour' && (
          <label className="flex items-center gap-[10px] text-[14px] text-textColor/80">
            Colour
            <span className="ms-auto font-mono text-[12px] text-textMuted">{background.colour}</span>
            <input
              type="color"
              value={isHexColour(background.colour) ? background.colour : '#000000'}
              onChange={(event) => setBackground({ colour: event.target.value })}
              className="h-[28px] w-[40px] cursor-pointer rounded-control border border-line bg-transparent"
            />
          </label>
        )}
        {background.mode === 'environment' && (
          <>
            <Slider
              label="Intensity"
              value={background.intensity}
              min={LIMITS.backgroundIntensity[0]}
              max={LIMITS.backgroundIntensity[1]}
              step={0.05}
              format={times}
              reset={DEFAULT_LOOK.background.intensity}
              onChange={(intensity) => setBackground({ intensity })}
            />
            <Slider
              label="Blur"
              value={background.blur}
              min={LIMITS.blur[0]}
              max={LIMITS.blur[1]}
              step={0.01}
              format={formatPercent}
              reset={DEFAULT_LOOK.background.blur}
              onChange={(blur) => setBackground({ blur })}
            />
          </>
        )}
      </Section>

      <Section title="Shadow">
        <Switch
          label="Shadows on the model"
          info={INFO.modelShadows}
          checked={shadows.enabled}
          onChange={(enabled) => setShadows({ enabled })}
        />
        <Slider
          label="Softness"
          info={INFO.softness}
          value={shadows.softness}
          min={LIMITS.softness[0]}
          max={LIMITS.softness[1]}
          step={0.05}
          format={times}
          reset={DEFAULT_LOOK.shadows.softness}
          disabled={!casting}
          onChange={(softness) => setShadows({ softness })}
        />
        <Slider
          label="Intensity"
          info={INFO.shadowIntensity}
          value={shadows.intensity}
          min={LIMITS.shadowIntensity[0]}
          max={LIMITS.shadowIntensity[1]}
          step={0.01}
          format={twoDecimals}
          reset={DEFAULT_LOOK.shadows.intensity}
          disabled={!casting}
          onChange={(intensity) => setShadows({ intensity })}
        />
        <Choice
          label="Resolution"
          info={INFO.shadowResolution}
          options={qualities}
          value={shadows.quality}
          disabled={!casting}
          onChange={(quality) => setShadows({ quality })}
        />
      </Section>

      <Section title="Virtual ground">
        <Switch label="Virtual ground" info={INFO.ground} checked={ground.enabled} onChange={(enabled) => setGround({ enabled })} />
        <Switch
          label="Cast shadows"
          info={INFO.castShadows}
          checked={ground.castShadows}
          disabled={!ground.enabled}
          onChange={(castShadows) => setGround({ castShadows })}
        />
        <Slider
          label="Intensity"
          info={INFO.groundIntensity}
          value={ground.intensity}
          min={LIMITS.groundIntensity[0]}
          max={LIMITS.groundIntensity[1]}
          step={0.01}
          format={twoDecimals}
          reset={DEFAULT_LOOK.ground.intensity}
          disabled={!ground.enabled}
          onChange={(intensity) => setGround({ intensity })}
        />
        <Switch
          label="Show a floor"
          info={INFO.floor}
          checked={ground.floor}
          disabled={!ground.enabled}
          onChange={(floor) => setGround({ floor })}
        />
        <div className="flex flex-col gap-[16px] border-s-2 border-line ps-[12px]">
          <Switch
            label="Ambient occlusion"
            info={INFO.groundAo}
            checked={ground.ao.enabled}
            disabled={!ground.enabled}
            onChange={(enabled) => setGroundAo({ enabled })}
          />
          <Slider
            label="Cone angle"
            info={INFO.cone}
            value={ground.ao.cone}
            min={LIMITS.cone[0]}
            max={LIMITS.cone[1]}
            step={1}
            format={formatDegrees}
            reset={DEFAULT_LOOK.ground.ao.cone}
            disabled={!groundAoOn}
            ends={['Overhead', 'Whole sky']}
            onChange={(cone) => setGroundAo({ cone })}
          />
          <Choice
            label="Resolution"
            info={INFO.aoResolution}
            options={aoResolutions}
            value={ground.ao.resolution}
            disabled={!groundAoOn}
            onChange={(resolution) => setGroundAo({ resolution })}
          />
          <Slider
            label="Blur noise"
            info={INFO.blurNoise}
            value={ground.ao.blur}
            min={LIMITS.groundBlur[0]}
            max={LIMITS.groundBlur[1]}
            step={0.25}
            format={twoDecimals}
            reset={DEFAULT_LOOK.ground.ao.blur}
            disabled={!groundAoOn}
            onChange={(blur) => setGroundAo({ blur })}
          />
        </div>
        {ground.enabled && !ground.floor && background.mode === 'stage' && (
          <p className="-mt-[4px] text-[12px] text-textMuted">
            The ground's shadows are dark: they show best with a floor or a lighter background.
          </p>
        )}
      </Section>

      <Section title="Model ambient occlusion">
        <Switch label="Ambient occlusion" info={INFO.modelAo} checked={ao.enabled} onChange={(enabled) => setAo({ enabled })} />
        <Slider
          label="Intensity"
          value={ao.intensity}
          min={LIMITS.aoIntensity[0]}
          max={LIMITS.aoIntensity[1]}
          step={0.01}
          format={formatPercent}
          reset={DEFAULT_LOOK.ao.intensity}
          disabled={!ao.enabled}
          onChange={(intensity) => setAo({ intensity })}
        />
        <Slider
          label="Radius"
          value={ao.radius}
          min={LIMITS.aoRadius[0]}
          max={LIMITS.aoRadius[1]}
          step={0.01}
          format={formatPercent}
          reset={DEFAULT_LOOK.ao.radius}
          disabled={!ao.enabled}
          ends={['Contact', 'Wide']}
          onChange={(radius) => setAo({ radius })}
        />
        <Slider
          label="Thickness"
          value={ao.thickness}
          min={LIMITS.aoThickness[0]}
          max={LIMITS.aoThickness[1]}
          step={0.05}
          format={times}
          reset={DEFAULT_LOOK.ao.thickness}
          disabled={!ao.enabled}
          onChange={(thickness) => setAo({ thickness })}
        />
        <Slider
          label="Denoise"
          value={ao.denoise}
          min={LIMITS.aoDenoise[0]}
          max={LIMITS.aoDenoise[1]}
          step={1}
          format={pixels}
          reset={DEFAULT_LOOK.ao.denoise}
          disabled={!ao.enabled}
          onChange={(denoise) => setAo({ denoise })}
        />
        <div className="flex flex-col gap-[6px]">
          <span className="text-[14px] text-textColor/80">Samples</span>
          <Segmented
            label="Samples"
            options={AO_SAMPLES.map((samples) => ({ id: samples, label: String(samples) }))}
            value={ao.samples}
            disabled={!ao.enabled}
            onChange={(samples) => setAo({ samples })}
          />
        </div>
        <p className="-mt-[8px] text-[12px] text-textMuted">Darkens unlit materials too. Heavier on phones.</p>
      </Section>
    </div>
  );
};
