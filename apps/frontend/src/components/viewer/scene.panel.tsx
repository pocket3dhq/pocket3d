'use client';

import { FC, KeyboardEvent } from 'react';
import { IconButton, RowHeading, Section, Segmented, ValueField } from './panel.controls';
import { LightingPanel } from './lighting.panel';
import { MaterialsPanel } from './materials.panel';
import { MeshPanel } from './mesh.panel';
import { isDefaultMeshView, MeshReport, MeshView } from './mesh.settings';
import type { InspectLimits } from './mesh.inspect';
import type { MaterialEdits, MaterialsReport, ViewMode } from './material.settings';
import type { TextureReader } from './model.viewer';
import { CAMERA_VIEWS, CameraView, DEFAULT_LOOK, isDefaultLighting, LookStatus, Projection, ViewLook } from './look.settings';
import {
  centered,
  clampScale,
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
  Vec3,
} from './scene.settings';

const AXES = ['X', 'Y', 'Z'] as const;
const AXIS_COLOUR = ['text-axisX', 'text-axisY', 'text-axisZ'];

const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const CrosshairIcon = () => (
  <svg {...ICON}>
    <circle cx="12" cy="12" r="8" />
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
  </svg>
);

const FloorIcon = () => (
  <svg {...ICON}>
    <path d="M12 3v12" />
    <polyline points="7 10 12 15 17 10" />
    <path d="M5 20h14" />
  </svg>
);

const ResetIcon = () => (
  <svg {...ICON}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 3 3 8 8 8" />
  </svg>
);

const RotateIcon = () => (
  <svg {...ICON}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <polyline points="21 3 21 8 16 8" />
  </svg>
);

const ScaleIcon = () => (
  <svg {...ICON}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-8 8" />
    <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
  </svg>
);

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
};

const withAxis = (vector: Vec3, axis: number, value: number): Vec3 => {
  const next = [...vector] as Vec3;
  next[axis] = value;
  return next;
};

// The Adjust panel. Scene: moves, turns and scales the model (per version)
// and points the camera. Lighting: environment, tone mapping, background,
// ground, shadows, ambient occlusion (one look for every version).
// Materials: inspect and try changes to the materials (per version), show
// one channel on the model. Mesh: wireframe and surface looks, the
// geometry's numbers, the object tree to select and hide parts (per
// version). All of it for the visitor only. `bounds` is the box of the model on screen, or
// null while this version loads (the tools that need it wait). `reframe`
// asks the viewer to put the camera back on the model: centre, floor and
// Reset all can move it out of sight
export type AdjustTab = 'scene' | 'lighting' | 'materials' | 'mesh';
const TABS: { id: AdjustTab; label: string }[] = [
  { id: 'scene', label: 'Scene' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'materials', label: 'Materials' },
  { id: 'mesh', label: 'Mesh' },
];

const PROJECTIONS: { id: Projection; label: string }[] = [
  { id: 'perspective', label: 'Perspective' },
  { id: 'orthographic', label: 'Orthographic' },
];

export const ScenePanel: FC<{
  transform: SceneTransform;
  bounds: SceneBounds | null;
  onChange: (transform: SceneTransform, reframe?: boolean) => void;
  look: ViewLook;
  lookStatus: LookStatus;
  onLookChange: (look: ViewLook) => void;
  onView: (view: CameraView) => void;
  onClose: () => void;
  materials: MaterialsReport | null;
  materialEdits: MaterialEdits;
  onMaterialEdits: (edits: MaterialEdits) => void;
  channelView: ViewMode;
  onChannelView: (view: ViewMode) => void;
  readTexture: TextureReader;
  selectedMaterial: string | null;
  onSelectMaterial: (key: string) => void;
  tab: AdjustTab;
  onTab: (tab: AdjustTab) => void;
  meshReport: MeshReport | null;
  meshView: MeshView;
  onMeshView: (view: MeshView) => void;
  hiddenObjects: string[];
  onHiddenObjects: (hidden: string[]) => void;
  selectedObject: string | null;
  onSelectObject: (id: string | null) => void;
  onFrameObject: (id: string) => void;
  meshLimits: InspectLimits;
}> = ({
  transform,
  bounds,
  onChange,
  look,
  lookStatus,
  onLookChange,
  onView,
  onClose,
  materials,
  materialEdits,
  onMaterialEdits,
  channelView,
  onChannelView,
  readTexture,
  selectedMaterial,
  onSelectMaterial,
  tab,
  onTab: setTab,
  meshReport,
  meshView,
  onMeshView,
  hiddenObjects,
  onHiddenObjects,
  selectedObject,
  onSelectObject,
  onFrameObject,
  meshLimits,
}) => {
  const loading = bounds === null;
  const moveStep = positionDragStep(bounds);
  // ↑ / ↓ moves by a round amount near a hundredth of the model's size
  const keyStep = 10 ** Math.round(Math.log10(moveStep * 2));

  const set = (patch: Partial<SceneTransform>) => onChange({ ...transform, ...patch });
  const samePosition = transform.position.every((v) => v === 0);
  const sameRotation = transform.rotation.every((v) => v === 0);

  // ← / → move between the tabs, as a tab list should
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    document.getElementById(`scene-tab-${next.id}`)?.focus();
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-[10px] border-b border-line px-[16px]">
        <div role="tablist" aria-label="Adjust" className="flex gap-[14px]" onKeyDown={onTabKey}>
          {TABS.map((t) => {
            const selected = t.id === tab;
            return (
              <button
                key={t.id}
                id={`scene-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`scene-tabpanel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 pb-[10px] pt-[12px] text-[15px] font-semibold outline-none focus-visible:text-accent ${
                  selected ? 'border-accent text-textColor' : 'border-transparent text-textMuted hover:text-textColor'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the Adjust panel"
          className="ms-auto flex h-[28px] w-[28px] items-center justify-center rounded-control text-textMuted hover:bg-textColor/[0.08] hover:text-textColor"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      {tab === 'scene' ? (
        <div id="scene-tabpanel-scene" role="tabpanel" aria-labelledby="scene-tab-scene" className="flex flex-col gap-[22px] p-[16px]">
          <Section title="Model orientation">
          <div className="flex flex-col gap-[8px]">
            <RowHeading label="Position" unit="meters">
              <IconButton label="Centre the model" disabled={loading} onClick={() => bounds && onChange(centered(transform, bounds), true)}>
                <CrosshairIcon />
              </IconButton>
              <IconButton label="Rest the model on the floor" disabled={loading} onClick={() => bounds && onChange(onFloor(transform, bounds), true)}>
                <FloorIcon />
              </IconButton>
              <IconButton label="Reset the position" disabled={samePosition} onClick={() => set({ position: DEFAULT_TRANSFORM.position })}>
                <ResetIcon />
              </IconButton>
            </RowHeading>
            <div className="grid grid-cols-3 gap-[6px]">
              {AXES.map((axis, i) => (
                <ValueField
                  key={axis}
                  label={axis}
                  name={`Position ${axis}`}
                  labelClass={AXIS_COLOUR[i]}
                  value={transform.position[i]}
                  format={formatLength}
                  parse={parseLength}
                  disabled={loading}
                  onChange={(value) => set({ position: withAxis(transform.position, i, value) })}
                  step={(value, direction) => round(value + direction * keyStep, 4)}
                  drag={(start, dx) => round(start + dx * moveStep, 4)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-[8px]">
            <RowHeading label="Rotation" unit="deg">
              <IconButton label="Turn a quarter (90°)" disabled={loading} onClick={() => onChange(rotateQuarter(transform))}>
                <RotateIcon />
              </IconButton>
              <IconButton label="Reset the rotation" disabled={sameRotation} onClick={() => set({ rotation: DEFAULT_TRANSFORM.rotation })}>
                <ResetIcon />
              </IconButton>
            </RowHeading>
            <div className="grid grid-cols-3 gap-[6px]">
              {AXES.map((axis, i) => (
                <ValueField
                  key={axis}
                  label={axis}
                  name={`Rotation ${axis}`}
                  labelClass={AXIS_COLOUR[i]}
                  value={transform.rotation[i]}
                  format={formatDegrees}
                  parse={parseDegrees}
                  disabled={loading}
                  stepper
                  onChange={(value) => set({ rotation: withAxis(transform.rotation, i, value) })}
                  step={(value, direction) => normalizeDegrees(Math.round(value / 15) * 15 + direction * 15)}
                  drag={(start, dx) => normalizeDegrees(Math.round(start + dx))}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-[8px]">
            <RowHeading label="Scale">
              <span className="me-[4px] font-mono text-[12px] text-textMuted">
                {bounds ? formatDimensions(bounds) : '…'}
              </span>
              <IconButton label="Reset the scale" disabled={transform.scale === 1} onClick={() => set({ scale: 1 })}>
                <ResetIcon />
              </IconButton>
            </RowHeading>
            <ValueField
              wide
              label={
                <>
                  <ScaleIcon />
                  <span className="text-[14px] text-textColor">Uniform</span>
                </>
              }
              name="Uniform scale"
              labelClass="text-textMuted"
              value={transform.scale}
              format={formatScale}
              parse={parseScale}
              disabled={loading}
              onChange={(scale) => set({ scale })}
              step={(value, direction) => round(clampScale(value * (direction === 1 ? 1.1 : 1 / 1.1)), 3)}
              drag={(start, dx) => round(clampScale(start * Math.exp(dx * 0.01)), 3)}
            />
          </div>
          </Section>

          <Section title="Camera">
            <Segmented
              label="Projection"
              options={PROJECTIONS}
              value={look.projection}
              onChange={(projection) => onLookChange({ ...look, projection })}
            />
            <div className="grid grid-cols-4 gap-[6px]" role="group" aria-label="Camera views">
              {CAMERA_VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  disabled={loading}
                  onClick={() => onView(view.id)}
                  title={view.id === 'fit' ? 'Frame the model (R)' : `View from the ${view.label.toLowerCase()}`}
                  className="h-[32px] truncate rounded-control bg-textColor/[0.06] px-[4px] text-[12px] text-textMuted outline-none hover:text-textColor focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {view.label}
                </button>
              ))}
            </div>
          </Section>

          <div className="flex items-start gap-[12px] border-t border-line pt-[12px] text-[12px] text-textMuted">
            <p className="flex-1">Only on your screen: nothing is saved. Press R to reframe the camera.</p>
            {!isDefault(transform) && (
              <button type="button" onClick={() => onChange(DEFAULT_TRANSFORM, true)} className="shrink-0 font-medium text-accent hover:underline">
                Reset all
              </button>
            )}
          </div>
        </div>
      ) : tab === 'mesh' ? (
        <div id="scene-tabpanel-mesh" role="tabpanel" aria-labelledby="scene-tab-mesh" className="flex flex-col gap-[22px] p-[16px]">
          <MeshPanel
            report={meshReport}
            view={meshView}
            onView={onMeshView}
            hidden={hiddenObjects}
            onHidden={onHiddenObjects}
            selected={selectedObject}
            onSelect={onSelectObject}
            onFrame={onFrameObject}
            limits={meshLimits}
            bounds={bounds}
          />
          <div className="flex items-start gap-[12px] border-t border-line pt-[12px] text-[12px] text-textMuted">
            <p className="flex-1">Only on your screen: nothing is saved. Click a part of the model to select it · F frames it · H hides it.</p>
            {(!isDefaultMeshView(meshView) || hiddenObjects.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  onMeshView({ ...meshView, surface: 'shaded', wire: { ...meshView.wire, enabled: false }, vertices: false, normals: { ...meshView.normals, enabled: false }, bounds: 'off' });
                  onHiddenObjects([]);
                }}
                className="shrink-0 font-medium text-accent hover:underline"
              >
                Reset mesh view
              </button>
            )}
          </div>
        </div>
      ) : tab === 'materials' ? (
        <div id="scene-tabpanel-materials" role="tabpanel" aria-labelledby="scene-tab-materials" className="flex flex-col gap-[22px] p-[16px]">
          <MaterialsPanel
            report={materials}
            edits={materialEdits}
            onEdits={onMaterialEdits}
            view={channelView}
            onView={onChannelView}
            readTexture={readTexture}
            selected={selectedMaterial}
            onSelect={onSelectMaterial}
          />
        </div>
      ) : (
        <div id="scene-tabpanel-lighting" role="tabpanel" aria-labelledby="scene-tab-lighting" className="flex flex-col gap-[22px] p-[16px]">
          <LightingPanel look={look} status={lookStatus} onChange={onLookChange} />
          <div className="flex items-start gap-[12px] border-t border-line pt-[12px] text-[12px] text-textMuted">
            <p className="flex-1">Only on your screen: nothing is saved.</p>
            {!isDefaultLighting(look) && (
              <button
                type="button"
                onClick={() => onLookChange({ ...DEFAULT_LOOK, projection: look.projection })}
                className="shrink-0 font-medium text-accent hover:underline"
              >
                Reset lighting
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
