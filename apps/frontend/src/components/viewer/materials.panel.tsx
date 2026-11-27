'use client';

import { FC, ReactNode, useId, useState } from 'react';
import {
  AlphaMode,
  CHANNEL_HINTS,
  CHANNEL_VIEWS,
  ChannelView,
  clampTo,
  effectiveFeatures,
  effectiveValues,
  Feature,
  featureChanged,
  formatFactor,
  formatLinear,
  hexToLinear,
  isEdited,
  ISOLATES,
  linearToHex,
  MaterialEdit,
  MaterialEdits,
  MaterialInfo,
  MaterialsReport,
  MaterialValues,
  nextIsolate,
  parseDistance,
  parseFactor,
  RANGES,
  Rgb,
  setEdit,
  SLOT_CHANNEL,
  SLOT_VIEW,
  slotChanged,
  SlotEdit,
  SlotId,
  slotState,
  turnOnValues,
  valueChanged,
  ValueKey,
  ViewMode,
  withFeature,
  withSlot,
  withValue,
} from './material.settings';
import { Chip, ColourField, IconButton, Section, Segmented, SelectField, SliderField, Toggle, useInfo, ValueField } from './panel.controls';
import { PictureLoader, TexturePreview, TextureSlot } from './texture.slot';
import type { TextureReader } from './model.viewer';

const ALPHA_MODES: { id: AlphaMode; label: string }[] = [
  { id: 'OPAQUE', label: 'Opaque' },
  { id: 'MASK', label: 'Mask' },
  { id: 'BLEND', label: 'Blend' },
];

// What the less obvious properties do, behind their ⓘ
const INFO = {
  doubleSided: 'Draws the back of each face too. Off, faces seen from behind are invisible (as glTF renders them).',
  unlit: 'Shows the base colour as is, without light or shading (KHR_materials_unlit), as for baked or toon looks.',
  albedo: 'The base colour: the factor times the texture (and vertex colours). Its alpha is the opacity.',
  metallic: 'Factor × the texture\'s blue channel. 0 is a dielectric (plastic, wood), 1 a bare metal.',
  roughness: 'Factor × the texture\'s green channel. 0 is mirror-like, 1 fully matte.',
  normal: 'Surface detail from a tangent-space normal map. The switch turns the map off to compare; the value scales it.',
  occlusion: 'Darkens ambient light in crevices, from the texture\'s red channel. The value is its strength.',
  opacity: 'The base colour\'s alpha (factor × texture alpha). Opaque ignores it; Mask cuts out below the cutoff; Blend mixes.',
  cutoff: 'With Mask, pixels with less alpha than this are not drawn.',
  transmission: 'Light passing through the surface, as in glass or thin plastic (KHR_materials_transmission).',
  ior: 'Index of refraction: 1.5 for glass and most plastics, 1.33 for water. Changes reflections too.',
  volume: 'A solid inside the surface: refraction through its thickness, tinted over distance (KHR_materials_volume). Shows through transmission.',
  attenuationDistance: 'How far light travels inside before it takes the attenuation colour. ∞: no tint.',
  clearcoat: 'A clear varnish layer over the material, as on car paint (KHR_materials_clearcoat).',
  sheen: 'The soft rim light of fabrics like velvet (KHR_materials_sheen).',
  emissive: 'Light the surface gives off itself: colour × texture × strength (KHR_materials_emissive_strength).',
};

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const InfinityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <path d="M18.2 8.2a4 4 0 1 1 0 7.6C15 14.6 9 9.4 5.8 8.2a4 4 0 1 0 0 7.6C9 14.6 15 9.4 18.2 8.2z" />
  </svg>
);

// One property: its name (with ⓘ, a dot when changed, the eye that shows
// it on the model, its on/off switch), then its texture and value
const Row: FC<{
  label: string;
  info?: string;
  changed?: boolean;
  onReset?: () => void;
  eye?: { on: boolean; onClick: () => void };
  toggle?: { checked: boolean; onChange: (on: boolean) => void; disabled?: boolean };
  disabled?: boolean;
  indent?: boolean;
  children?: ReactNode;
  below?: ReactNode;
}> = ({ label, info, changed, onReset, eye, toggle, disabled, indent, children, below }) => {
  const id = useId();
  const about = useInfo(label, info);
  return (
    <div className={`flex flex-col gap-[8px] ${indent ? 'border-s-2 border-line ps-[12px]' : ''}`}>
      <div className="flex min-h-[28px] items-center gap-[6px]">
        <span id={id} className={`text-[14px] text-textColor/80 ${disabled ? 'opacity-50' : ''}`}>
          {label}
        </span>
        {about.button}
        {changed && (
          <button
            type="button"
            onClick={onReset}
            title="Changed from the file: click to restore"
            aria-label={`Restore ${label.toLowerCase()} from the file`}
            className="flex h-[18px] w-[18px] items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-accent" />
          </button>
        )}
        <span className="ms-auto flex items-center gap-[6px]">
          {eye && (
            <IconButton label={eye.on ? 'Back to the lit model' : `Show ${label.toLowerCase()} on the model`} pressed={eye.on} onClick={eye.onClick}>
              <EyeIcon />
            </IconButton>
          )}
          {toggle && (
            <span className={toggle.disabled ? 'opacity-50' : undefined}>
              <Toggle checked={toggle.checked} onChange={toggle.onChange} disabled={toggle.disabled} labelledBy={id} />
            </span>
          )}
        </span>
      </div>
      {about.text}
      {children && <div className={`flex min-w-0 items-center gap-[10px] ${disabled ? 'opacity-60' : ''}`}>{children}</div>}
      {below}
    </div>
  );
};

// A material flag as in LePoly: the switch, then its name
const Flag: FC<{
  label: string;
  info: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  changed: boolean;
  onReset: () => void;
}> = ({ label, info, checked, onChange, changed, onReset }) => {
  const id = useId();
  const about = useInfo(label, info);
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-center gap-[8px]">
        <Toggle checked={checked} onChange={onChange} labelledBy={id} />
        <span id={id} className="whitespace-nowrap text-[14px] text-textColor/80">
          {label}
        </span>
        {about.button}
        {changed && (
          <button
            type="button"
            onClick={onReset}
            title="Changed from the file: click to restore"
            aria-label={`Restore ${label.toLowerCase()} from the file`}
            className="flex h-[18px] w-[18px] items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-accent" />
          </button>
        )}
      </div>
      {about.text}
    </div>
  );
};

const Note: FC<{ children: ReactNode }> = ({ children }) => (
  <p className="-mt-[6px] text-[12px] text-textMuted">{children}</p>
);

const badges = (info: MaterialInfo) =>
  [
    info.values.unlit && 'Unlit',
    info.values.alphaMode === 'BLEND' && 'Blend',
    info.values.alphaMode === 'MASK' && 'Mask',
    info.values.doubleSided && 'Double sided',
    info.packed && 'ORM',
  ].filter(Boolean) as string[];

const meshes = (count: number) => `${count} mesh${count === 1 ? '' : 'es'}`;

// The Materials tab: pick a material, see and change what the file says
// about it (on this screen only), and show one channel on the whole model
export const MaterialsPanel: FC<{
  // null while the model loads
  report: MaterialsReport | null;
  edits: MaterialEdits;
  onEdits: (edits: MaterialEdits) => void;
  view: ViewMode;
  onView: (view: ViewMode) => void;
  readTexture: TextureReader;
  // the material picked (kept by the page, so changing tabs keeps it);
  // null or unknown: the first one
  selected: string | null;
  onSelect: (key: string) => void;
}> = ({ report, edits, onEdits, view, onView, readTexture, selected, onSelect }) => {
  const [openSlot, setOpenSlot] = useState<SlotId | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!report) return <p className="text-[13px] text-textMuted">Loading the materials…</p>;
  if (!report.materials.length) return <p className="text-[13px] text-textMuted">This model has no materials.</p>;

  const info = report.materials.find((material) => material.key === selected) ?? report.materials[0];
  const edit = edits[info.key];
  const values = effectiveValues(info, edit);
  const features = effectiveFeatures(info, edit);
  const unlit = values.unlit;
  const maxUvSets = Math.max(1, ...report.materials.map((material) => material.uvSets));

  const update = (next: MaterialEdit | undefined) => onEdits(setEdit(edits, info.key, next));
  const setValue = <K extends ValueKey>(key: K, value: MaterialValues[K]) => update(withValue(info, edit, key, value));
  const resetValue = (key: ValueKey) => setValue(key, info.values[key]);
  const setFeature = (feature: Feature, on: boolean) => {
    let next = withFeature(info, edit, feature, on);
    if (on) {
      for (const [key, value] of Object.entries(turnOnValues(values, feature)) as [ValueKey, MaterialValues[ValueKey]][]) {
        next = withValue(info, next, key, value);
      }
    }
    update(next);
  };
  const setSlot = (slot: SlotId, patch: SlotEdit, base = edit) => withSlot(info, base, slot, patch);
  const restoreSlot = (slot: SlotId, base = edit) => withSlot(info, base, slot, { off: undefined, uvSet: undefined, image: undefined });

  const showChannel = (channel: ChannelView) =>
    onView({ ...view, channel: view.channel === channel ? 'lit' : channel });

  // a property's texture: its thumbnail, and its closer look when open
  const texture = (slot: SlotId, disabled?: boolean) => {
    const state = slotState(info, edit, slot);
    const revision = [report.src, info.key, slot, state.image?.id ?? '', state.uvSet, state.off].join('|');
    const load: PictureLoader = (isolate, maxSize) => readTexture(report.src, info.key, slot, isolate, maxSize);
    const open = openSlot === slot;
    return {
      state,
      thumb: (
        <TextureSlot
          slot={slot}
          state={state}
          load={load}
          isolate={slot === 'baseColor' ? view.isolate : SLOT_CHANNEL[slot]}
          revision={revision}
          open={open}
          disabled={disabled}
          packed={info.packed && (slot === 'metallic' || slot === 'roughness' || slot === 'occlusion')}
          onToggle={() => setOpenSlot(open ? null : slot)}
          onAdd={(image) => {
            update(setSlot(slot, { image, off: undefined }));
            setOpenSlot(slot);
          }}
          onError={setError}
        />
      ),
      preview: open ? (
        <TexturePreview
          slot={slot}
          state={state}
          facts={state.file ? report.textures[state.file.texture] ?? null : null}
          load={load}
          revision={revision}
          packed={info.packed}
          uvSets={info.uvSets}
          changed={slotChanged(edit, slot)}
          disabled={disabled}
          onUvSet={(uvSet) => update(setSlot(slot, { uvSet }))}
          onReplace={(image) => update(setSlot(slot, { image, off: undefined }))}
          onOff={(off) => update(setSlot(slot, { off }))}
          onRestore={() => {
            if (!state.file) setOpenSlot(null);
            update(restoreSlot(slot));
          }}
          onError={setError}
        />
      ) : null,
    };
  };

  const factor = (
    name: string,
    key: ValueKey,
    options: { disabled?: boolean; range?: readonly [number, number]; limits?: readonly [number, number]; step?: number } = {}
  ) => {
    const [min, max] = options.range ?? RANGES.factor;
    return (
      <SliderField
        name={name}
        value={values[key] as number}
        min={min}
        max={max}
        step={options.step ?? 0.01}
        limits={options.limits ?? options.range ?? RANGES.factor}
        format={formatFactor}
        parse={parseFactor}
        reset={info.values[key] as number}
        disabled={options.disabled}
        onChange={(value) => setValue(key, value as never)}
      />
    );
  };

  const colour = (name: string, key: 'baseColor' | 'emissive' | 'attenuationColor' | 'sheenColor', disabled?: boolean) => (
    <ColourField
      name={name}
      hex={linearToHex(values[key])}
      title={`Linear: ${formatLinear(values[key])}`}
      disabled={disabled}
      onChange={(hex) => {
        const linear = hexToLinear(hex);
        if (linear) setValue(key, linear as Rgb);
      }}
    />
  );

  const eye = (slot: SlotId) => {
    const channel = SLOT_VIEW[slot];
    return channel ? { on: view.channel === channel, onClick: () => showChannel(channel) } : undefined;
  };

  // A property with a texture and a number (metallic, roughness...)
  const textured = (
    label: string,
    slot: SlotId,
    key: ValueKey,
    options: { disabled?: boolean; indent?: boolean; info?: string; range?: readonly [number, number]; limits?: readonly [number, number] } = {}
  ) => {
    const { thumb, preview } = texture(slot, options.disabled);
    return (
      <Row
        label={label}
        info={options.info}
        indent={options.indent}
        disabled={options.disabled}
        changed={valueChanged(edit, key) || slotChanged(edit, slot)}
        onReset={() => update(restoreSlot(slot, withValue(info, edit, key, info.values[key] as never)))}
        eye={eye(slot)}
        below={preview}
      >
        {thumb}
        {factor(label, key, options)}
      </Row>
    );
  };

  // A property whose switch turns its texture off (normal, occlusion)
  const mapSwitch = (label: string, slot: SlotId, key: ValueKey, about: string, range: readonly [number, number]) => {
    const { state, thumb, preview } = texture(slot, unlit);
    const hasTexture = !!state.file || !!state.image;
    return (
      <Row
        label={label}
        info={about}
        disabled={unlit}
        changed={valueChanged(edit, key) || slotChanged(edit, slot)}
        onReset={() => update(restoreSlot(slot, withValue(info, edit, key, info.values[key] as never)))}
        eye={eye(slot)}
        toggle={{
          checked: state.present,
          disabled: unlit || !hasTexture,
          onChange: (on) => update(setSlot(slot, { off: !on })),
        }}
        below={preview}
      >
        {thumb}
        {factor(label, key, { disabled: unlit || !state.present, range })}
      </Row>
    );
  };

  const featureToggle = (feature: Feature, disabled?: boolean) => ({
    checked: features[feature],
    disabled,
    onChange: (on: boolean) => setFeature(feature, on),
  });

  const albedo = texture('baseColor');
  const emissive = texture('emissive', unlit || !features.emission);
  const sheenColour = texture('sheenColor', unlit || !features.sheen);
  const usage = [
    info.primitives ? `Used by ${meshes(info.meshes)}` : 'Not used by any mesh',
    info.index !== null ? `glTF #${info.index}` : 'No material in the file',
  ].join(' · ');
  const uvChipSets = Math.max(1, info.uvSets);

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-[12px]">
        <div className="flex items-center gap-[10px]">
          <span
            aria-hidden
            className="h-[22px] w-[22px] shrink-0 rounded-full border border-line"
            style={{ backgroundColor: linearToHex(values.baseColor) }}
          />
          <select
            aria-label="Material"
            value={info.key}
            onChange={(event) => {
              onSelect(event.target.value);
              setOpenSlot(null);
              setError(null);
            }}
            className="h-[36px] min-w-0 flex-1 rounded-control border border-transparent bg-textColor/[0.06] px-[8px] text-[14px] text-textColor outline-none focus:border-accent"
          >
            {report.materials.map((material) => (
              <option key={material.key} value={material.key} className="bg-bgInner">
                {material.name}
                {isEdited(edits[material.key]) ? ' • changed' : ''}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[12px] text-textMuted">
          {usage}
          {report.materials.length > 1 && ` · ${report.materials.length} materials`}
        </p>
        {(badges(info).length > 0 || info.extensions.length > 0) && (
          <ul className="flex flex-wrap gap-[4px]" aria-label="About this material">
            {badges(info).map((badge) => (
              <li key={badge} className="rounded-control bg-textColor/[0.08] px-[6px] py-[2px] text-[11px] text-textColor/80">
                {badge}
              </li>
            ))}
            {info.extensions.map((name) => (
              <li key={name} className="rounded-control bg-textColor/[0.04] px-[6px] py-[2px] font-mono text-[10px] text-textMuted">
                {name}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-start gap-x-[20px] gap-y-[10px]">
          <Flag
            label="Double sided"
            info={INFO.doubleSided}
            checked={values.doubleSided}
            onChange={(on) => setValue('doubleSided', on)}
            changed={valueChanged(edit, 'doubleSided')}
            onReset={() => resetValue('doubleSided')}
          />
          <Flag
            label="Unlit"
            info={INFO.unlit}
            checked={values.unlit}
            onChange={(on) => setValue('unlit', on)}
            changed={valueChanged(edit, 'unlit')}
            onReset={() => resetValue('unlit')}
          />
        </div>
        {unlit && <Note>Unlit: only the base colour and alpha show. Switch Unlit off to light it with its PBR values.</Note>}
        {error && (
          <div role="alert" className="flex items-start gap-[8px] text-[12px] text-danger">
            <p className="flex-1">{error}</p>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="text-textMuted hover:text-textColor">
              ×
            </button>
          </div>
        )}
      </div>

      <Section title="Channel view">
        <SelectField
          label="Show"
          options={CHANNEL_VIEWS}
          value={view.channel}
          onChange={(channel) => onView({ ...view, channel })}
        />
        <Note>{CHANNEL_HINTS[view.channel]}</Note>
        {view.channel === 'baseColor' && (
          <Segmented
            label="Base colour channel"
            options={ISOLATES}
            value={view.isolate}
            onChange={(isolate) => onView({ ...view, isolate })}
          />
        )}
        {view.channel === 'uv' && maxUvSets > 1 && (
          <Segmented
            label="UV set"
            options={Array.from({ length: maxUvSets }, (_, set) => ({ id: set, label: `UV${set}` }))}
            value={Math.min(view.uvSet, maxUvSets - 1)}
            onChange={(uvSet) => onView({ ...view, uvSet })}
          />
        )}
        {view.channel !== 'lit' && view.channel !== 'baseColor' && view.channel !== 'alpha' && view.channel !== 'uv' &&
          report.materials.some((material) => effectiveValues(material, edits[material.key]).unlit) && (
            <Note>Unlit materials have no such channel: they show flat.</Note>
          )}
      </Section>

      <Section title="Base surface">
        <Row
          label="Albedo"
          info={INFO.albedo}
          changed={valueChanged(edit, 'baseColor') || slotChanged(edit, 'baseColor')}
          onReset={() => update(restoreSlot('baseColor', withValue(info, edit, 'baseColor', info.values.baseColor)))}
          eye={eye('baseColor')}
          below={albedo.preview}
        >
          {albedo.thumb}
          {colour('Albedo', 'baseColor')}
          <span className="ms-auto flex gap-[4px]">
            <Chip
              label={ISOLATES.find((item) => item.id === view.isolate)?.label ?? 'RGB'}
              title="Albedo channel: RGB, R, G, B or A (also on the model in the Base colour view)"
              active={view.isolate !== 'rgb'}
              onClick={() => onView({ ...view, isolate: nextIsolate(view.isolate) })}
            />
            <Chip
              label={`UV${albedo.state.uvSet}`}
              title={uvChipSets > 1 ? 'The UV set the albedo texture reads: click for the next' : 'The UV set the albedo texture reads (the meshes have one)'}
              active={slotChanged(edit, 'baseColor') && albedo.state.uvSet !== (albedo.state.file?.texCoord ?? 0)}
              onClick={
                uvChipSets > 1 && albedo.state.present
                  ? () => update(setSlot('baseColor', { uvSet: (albedo.state.uvSet + 1) % uvChipSets }))
                  : undefined
              }
            />
          </span>
        </Row>
        {textured('Metallic', 'metallic', 'metallic', { disabled: unlit, info: INFO.metallic })}
        {textured('Roughness', 'roughness', 'roughness', { disabled: unlit, info: INFO.roughness })}
        {mapSwitch('Normal', 'normal', 'normalScale', INFO.normal, RANGES.normalScale)}
        {mapSwitch('Occlusion', 'occlusion', 'occlusionStrength', INFO.occlusion, RANGES.factor)}
        {info.packed && !unlit && <Note>Occlusion, roughness and metallic share one packed texture (R, G, B).</Note>}
      </Section>

      <Section title="Transparency">
        <Row
          label="Mode"
          changed={valueChanged(edit, 'alphaMode')}
          onReset={() => resetValue('alphaMode')}
        >
          <div className="flex-1">
            <Segmented label="Alpha mode" options={ALPHA_MODES} value={values.alphaMode} onChange={(mode) => setValue('alphaMode', mode)} />
          </div>
        </Row>
        <Row
          label="Opacity"
          info={INFO.opacity}
          changed={valueChanged(edit, 'opacity')}
          onReset={() => resetValue('opacity')}
          eye={{ on: view.channel === 'alpha', onClick: () => showChannel('alpha') }}
          disabled={values.alphaMode === 'OPAQUE'}
        >
          {factor('Opacity', 'opacity', { disabled: values.alphaMode === 'OPAQUE' })}
        </Row>
        {values.alphaMode === 'OPAQUE' ? (
          <Note>Opaque ignores alpha: pick Mask or Blend to use it. Texture alpha is the albedo&apos;s A channel.</Note>
        ) : (
          <Note>Texture alpha is the albedo&apos;s A channel (see it with the A chip).</Note>
        )}
        {values.alphaMode === 'MASK' && (
          <Row label="Cutoff" info={INFO.cutoff} changed={valueChanged(edit, 'alphaCutoff')} onReset={() => resetValue('alphaCutoff')}>
            {factor('Cutoff', 'alphaCutoff')}
          </Row>
        )}
        <Row
          label="Transmission"
          info={INFO.transmission}
          changed={featureChanged(edit, 'transmission')}
          onReset={() => update(withFeature(info, edit, 'transmission', info.features.transmission))}
          toggle={featureToggle('transmission', unlit)}
        />
        {features.transmission &&
          textured('Amount', 'transmission', 'transmission', { disabled: unlit, indent: true })}
        <Row
          label="IOR"
          info={INFO.ior}
          changed={featureChanged(edit, 'ior') || valueChanged(edit, 'ior')}
          onReset={() => update(withValue(info, withFeature(info, edit, 'ior', info.features.ior), 'ior', info.values.ior))}
          toggle={featureToggle('ior', unlit)}
          disabled={unlit || !features.ior}
        >
          {factor('IOR', 'ior', { disabled: unlit || !features.ior, range: RANGES.ior })}
        </Row>
        <Row
          label="Volume"
          info={INFO.volume}
          changed={featureChanged(edit, 'volume')}
          onReset={() => update(withFeature(info, edit, 'volume', info.features.volume))}
          toggle={featureToggle('volume', unlit)}
        />
        {features.volume && (
          <>
            {textured('Thickness', 'thickness', 'thickness', {
              disabled: unlit,
              indent: true,
              range: RANGES.thicknessSlider,
              limits: RANGES.thickness,
            })}
            <Row
              label="Attenuation colour"
              indent
              disabled={unlit}
              changed={valueChanged(edit, 'attenuationColor')}
              onReset={() => resetValue('attenuationColor')}
            >
              {colour('Attenuation colour', 'attenuationColor', unlit)}
            </Row>
            <Row
              label="Attenuation distance"
              info={INFO.attenuationDistance}
              indent
              disabled={unlit}
              changed={valueChanged(edit, 'attenuationDistance')}
              onReset={() => resetValue('attenuationDistance')}
            >
              <div className="min-w-0 flex-1">
                <ValueField
                  compact
                  name="Attenuation distance"
                  value={values.attenuationDistance}
                  format={formatFactor}
                  parse={(text) => {
                    const parsed = parseDistance(text);
                    return parsed === null ? null : clampTo(parsed, RANGES.attenuationDistance);
                  }}
                  disabled={unlit}
                  onChange={(value) => setValue('attenuationDistance', value)}
                  step={(value, direction) =>
                    Number.isFinite(value) ? Math.max(0.01, Math.round((value + direction * 0.1) * 100) / 100) : value
                  }
                  drag={(start) => start}
                />
              </div>
              <IconButton
                label="No absorption (∞)"
                pressed={!Number.isFinite(values.attenuationDistance)}
                disabled={unlit}
                onClick={() => setValue('attenuationDistance', Infinity)}
              >
                <InfinityIcon />
              </IconButton>
            </Row>
            {!features.transmission && <Note>Volume shows only through transmission.</Note>}
          </>
        )}
      </Section>

      <Section title="Coat & sheen">
        <Row
          label="Clearcoat"
          info={INFO.clearcoat}
          changed={featureChanged(edit, 'clearcoat')}
          onReset={() => update(withFeature(info, edit, 'clearcoat', info.features.clearcoat))}
          toggle={featureToggle('clearcoat', unlit)}
        />
        {features.clearcoat && (
          <>
            {textured('Coat', 'clearcoat', 'clearcoat', { disabled: unlit, indent: true })}
            {textured('Roughness', 'clearcoatRoughness', 'clearcoatRoughness', { disabled: unlit, indent: true })}
            {textured('Normal', 'clearcoatNormal', 'clearcoatNormalScale', {
              disabled: unlit,
              indent: true,
              range: RANGES.normalScale,
            })}
          </>
        )}
        <Row
          label="Sheen"
          info={INFO.sheen}
          changed={featureChanged(edit, 'sheen')}
          onReset={() => update(withFeature(info, edit, 'sheen', info.features.sheen))}
          toggle={featureToggle('sheen', unlit)}
        />
        {features.sheen && (
          <>
            <Row
              label="Colour"
              indent
              disabled={unlit}
              changed={valueChanged(edit, 'sheenColor') || slotChanged(edit, 'sheenColor')}
              onReset={() => update(restoreSlot('sheenColor', withValue(info, edit, 'sheenColor', info.values.sheenColor)))}
              below={sheenColour.preview}
            >
              {sheenColour.thumb}
              {colour('Sheen colour', 'sheenColor', unlit)}
            </Row>
            {textured('Roughness', 'sheenRoughness', 'sheenRoughness', { disabled: unlit, indent: true })}
          </>
        )}
      </Section>

      <Section title="Emission">
        <Row
          label="Emissive"
          info={INFO.emissive}
          changed={featureChanged(edit, 'emission') || valueChanged(edit, 'emissive') || slotChanged(edit, 'emissive')}
          onReset={() =>
            update(
              restoreSlot(
                'emissive',
                withValue(info, withFeature(info, edit, 'emission', info.features.emission), 'emissive', info.values.emissive)
              )
            )
          }
          eye={eye('emissive')}
          toggle={featureToggle('emission', unlit)}
          disabled={unlit || !features.emission}
          below={emissive.preview}
        >
          {emissive.thumb}
          {colour('Emissive colour', 'emissive', unlit || !features.emission)}
        </Row>
        <Row
          label="Strength"
          indent
          disabled={unlit || !features.emission}
          changed={valueChanged(edit, 'emissiveStrength')}
          onReset={() => resetValue('emissiveStrength')}
        >
          {factor('Emissive strength', 'emissiveStrength', {
            disabled: unlit || !features.emission,
            range: RANGES.emissiveSlider,
            limits: RANGES.emissiveStrength,
          })}
        </Row>
      </Section>

      {info.extras.length > 0 && (
        <Section title="Also in this material">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[12px] gap-y-[6px] text-[13px]">
            {info.extras.map((extra) => (
              <div key={extra.label} className="contents">
                <dt className="text-textMuted">{extra.label}</dt>
                <dd className="text-end font-mono text-textColor/90">{extra.value}</dd>
              </div>
            ))}
          </dl>
          <Note>Shown as in the file; not editable here.</Note>
        </Section>
      )}

      <div className="flex items-start gap-[12px] border-t border-line pt-[12px] text-[12px] text-textMuted">
        <p className="flex-1">Only on your screen: nothing is saved or uploaded.</p>
        <div className="flex shrink-0 flex-col items-end gap-[4px]">
          {isEdited(edit) && (
            <button
              type="button"
              onClick={() => {
                setOpenSlot(null);
                update(undefined);
              }}
              className="font-medium text-accent hover:underline"
            >
              Reset material
            </button>
          )}
          {Object.keys(edits).length > (isEdited(edit) ? 1 : 0) && (
            <button
              type="button"
              onClick={() => {
                setOpenSlot(null);
                onEdits({});
              }}
              className="font-medium text-accent hover:underline"
            >
              Reset all materials
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
