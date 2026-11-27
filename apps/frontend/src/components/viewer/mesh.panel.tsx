'use client';

import { FC, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Choice, IconButton, Section, Slider, Switch, useInfo } from './panel.controls';
import {
  ancestors,
  BOUNDS_MODES,
  clampMesh,
  expandedNodes,
  filterNodes,
  formatCount,
  formatExact,
  isHidden,
  isolate,
  MESH_INFO,
  MESH_LIMITS,
  MeshNode,
  MeshReport,
  MeshView,
  shownTriangles,
  showsWire,
  SURFACES,
  toggleHidden,
  WIRE_EDGES,
} from './mesh.settings';
import type { MeshStats } from './mesh.stats';
import type { InspectLimits } from './mesh.inspect';
import { formatDimensions, SceneBounds } from './scene.settings';

// From this many rows the list scrolls in its own box and draws only the
// rows in view
const WINDOW_FROM = 200;
const ROW_HEIGHT = 30;
const WINDOW_HEIGHT = 360;
// From this many objects the list gets a name filter
const FILTER_FROM = 20;

const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const EyeIcon: FC<{ open: boolean }> = ({ open }) => (
  <svg {...ICON}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {!open && <line x1="3" y1="3" x2="21" y2="21" />}
  </svg>
);

const FrameIcon = () => (
  <svg {...ICON}>
    <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IsolateIcon = () => (
  <svg {...ICON}>
    <rect x="8" y="8" width="8" height="8" rx="1" />
    <path d="M3 3h3M18 3h3M3 21h3M18 21h3M3 3v3M21 3v3M3 18v3M21 18v3" />
  </svg>
);

const plural = (count: number, one: string, many = `${one}s`) => `${formatExact(count)} ${count === 1 ? one : many}`;

const KIND_LABEL: Record<MeshNode['kind'], string> = {
  group: 'group',
  mesh: 'mesh',
  line: 'lines',
  points: 'points',
  part: 'material part',
};
const kindLabel = (node: MeshNode) => KIND_LABEL[node.kind];

// A count, short, with the exact number on hover
const Count: FC<{ value: number | null; approximate?: boolean }> = ({ value, approximate }) =>
  value === null ? (
    <span className="text-textMuted">…</span>
  ) : (
    <span title={formatExact(value)}>
      {approximate ? '≈ ' : ''}
      {formatCount(value)}
    </span>
  );

const StatRow: FC<{ label: string; info?: string; tone?: 'warn'; children: ReactNode }> = ({ label, info, tone, children }) => {
  const about = useInfo(label, info);
  return (
    <div className="flex flex-col gap-[4px]">
      <div className="flex min-h-[22px] items-center gap-[6px] text-[13px]">
        <span className={tone === 'warn' ? 'text-danger' : 'text-textColor/80'}>{label}</span>
        {about.button}
        <span className="ms-auto font-mono text-[12px] text-textColor">{children}</span>
      </div>
      {about.text}
    </div>
  );
};

// The numbers for the whole model or one part
const Stats: FC<{ stats: MeshStats; detailed: boolean; objects?: number; size?: string | null }> = ({
  stats,
  detailed,
  objects,
  size,
}) => {
  const approximate = stats.polygonSource === 'estimated' || stats.polygonSource === 'mixed';
  // open edges and missing normals are often on purpose (cards, planes,
  // faceted looks): shown, not flagged
  const checks: { label: string; value: number; info: string; flag?: boolean }[] = [
    { label: 'Open edges', value: stats.openEdges ?? 0, info: MESH_INFO.open },
    { label: 'Non-manifold edges', value: stats.nonManifoldEdges ?? 0, info: MESH_INFO.nonManifold, flag: true },
    { label: 'Flipped faces (edges)', value: stats.flippedEdges ?? 0, info: MESH_INFO.flipped, flag: true },
    { label: 'Faces without area', value: stats.degenerateTriangles ?? 0, info: MESH_INFO.degenerate, flag: true },
    { label: 'Meshes without normals', value: stats.missingNormals, info: MESH_INFO.missingNormals },
    { label: 'Textured without UVs', value: stats.missingUvs, info: MESH_INFO.missingUvs, flag: true },
  ].filter((check) => check.value > 0);
  const traits = [
    stats.uvSets > 0 && `${stats.uvSets} UV set${stats.uvSets > 1 ? 's' : ''}`,
    stats.tangents > 0 && 'tangents',
    stats.vertexColours > 0 && 'vertex colours',
    stats.skinned > 0 && `skinned (${stats.bones} bones)`,
    stats.morphTargets > 0 && `${stats.morphTargets} morph target${stats.morphTargets > 1 ? 's' : ''}`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-[2px]">
      <StatRow label="Vertices" info={MESH_INFO.vertexCount}>
        <Count value={stats.welded} />
        <span className="ms-[6px] text-textMuted" title={`${formatExact(stats.gpuVertices)} on the graphics card`}>
          GPU {formatCount(stats.gpuVertices)}
        </span>
      </StatRow>
      <StatRow label="Edges">
        <Count value={stats.edges} />
      </StatRow>
      <StatRow label="Polygons" info={MESH_INFO.polygons}>
        <Count value={stats.polygons} approximate={approximate} />
      </StatRow>
      <StatRow label="Triangles" info={MESH_INFO.totals}>
        <Count value={stats.triangles} />
      </StatRow>
      {stats.segments > 0 && (
        <StatRow label="Line segments">
          <Count value={stats.segments} />
        </StatRow>
      )}
      {stats.points > 0 && (
        <StatRow label="Points">
          <Count value={stats.points} />
        </StatRow>
      )}
      <div className="mt-[6px] flex flex-wrap gap-x-[12px] gap-y-[2px] font-mono text-[11px] text-textMuted">
        {objects !== undefined && <span>{plural(objects, 'object')}</span>}
        <span>{plural(stats.meshes, 'mesh', 'meshes')}</span>
        <span>{plural(stats.drawCalls, 'draw call')}</span>
        {stats.instances > 0 && <span>{plural(stats.instances, 'instance')}</span>}
        <span>{plural(stats.materials, 'material')}</span>
        {size && <span>{size}</span>}
      </div>
      {traits.length > 0 && <div className="font-mono text-[11px] text-textMuted">{traits.join(' · ')}</div>}
      <div className="mt-[8px] flex flex-col gap-[2px]">
        {checks.map((check) => (
          <StatRow key={check.label} label={check.label} info={check.info} tone={check.flag ? 'warn' : undefined}>
            <Count value={check.value} />
          </StatRow>
        ))}
        {detailed && checks.length === 0 && stats.meshes > 0 && (
          <p className="text-[12px] text-success">No open, non-manifold or flipped edges.</p>
        )}
        {!detailed && <p className="text-[12px] text-textMuted">Measuring the mesh…</p>}
      </div>
    </div>
  );
};

const Note: FC<{ children: ReactNode }> = ({ children }) => <p className="-mt-[8px] text-[12px] text-textMuted">{children}</p>;

// The Mesh tab: how the surfaces and the wireframe show, overlays (dots,
// normals, boxes), the numbers, and the object tree to select and hide
// parts. Everything for this visitor only
export const MeshPanel: FC<{
  report: MeshReport | null;
  view: MeshView;
  onView: (view: MeshView) => void;
  hidden: string[];
  onHidden: (hidden: string[]) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onFrame: (id: string) => void;
  limits: InspectLimits;
  bounds: SceneBounds | null;
}> = ({ report, view, onView, hidden, onHidden, selected, onSelect, onFrame, limits, bounds }) => {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const filterId = useId();
  const wire = showsWire(view);
  const nodes = report?.nodes ?? [];
  const selectedNode = selected === null ? null : nodes.find((node) => node.id === selected) ?? null;


  const setWire = (patch: Partial<MeshView['wire']>) => onView({ ...view, wire: { ...view.wire, ...patch } });
  const setNormals = (patch: Partial<MeshView['normals']>) => onView({ ...view, normals: { ...view.normals, ...patch } });

  // a selected part's parents open up
  const open = new Set([...collapsed].filter((id) => selected === null || !ancestors(selected).includes(id)));
  const listed = query ? filterNodes(nodes, query) : expandedNodes(nodes, open);
  // long lists draw only the rows in view (in their own scroll box)
  const windowed = listed.length > WINDOW_FROM;
  const from = windowed ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 10) : 0;
  const to = windowed ? Math.min(listed.length, from + Math.ceil(WINDOW_HEIGHT / ROW_HEIGHT) + 20) : listed.length;
  const rows = listed.slice(from, to);
  const selectedIndex = selected === null ? -1 : listed.findIndex((node) => node.id === selected);
  const total = report?.total.triangles ?? 0;
  const visible = hidden.length ? shownTriangles(nodes, hidden) : total;

  // a part picked on the model: its row comes into view
  useEffect(() => {
    if (selectedIndex < 0) return;
    const box = boxRef.current;
    if (windowed && box) {
      const top = selectedIndex * ROW_HEIGHT;
      if (top < box.scrollTop || top + ROW_HEIGHT > box.scrollTop + WINDOW_HEIGHT) box.scrollTop = top - WINDOW_HEIGHT / 2;
    } else if (selected !== null) {
      document.getElementById(`mesh-node-${selected}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [selected, selectedIndex, windowed]);

  const toggleCollapsed = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  // the selected node's numbers and actions
  const details = (node: MeshNode, indent: number) => (
    <div className="mb-[6px] mt-[2px] flex flex-col gap-[8px] rounded-control border border-line p-[10px]" style={{ marginInlineStart: indent }}>
      <div className="flex items-center gap-[2px]">
        <span className="me-auto min-w-0 truncate font-mono text-[11px] uppercase tracking-wider text-textMuted">
          {kindLabel(node)}
          {indent === 0 ? ` · ${node.name}` : ''}
        </span>
        <IconButton label="Frame this part (F)" onClick={() => onFrame(node.id)}>
          <FrameIcon />
        </IconButton>
        <IconButton label="Show only this part" onClick={() => onHidden(isolate(nodes, node.id))}>
          <IsolateIcon />
        </IconButton>
      </div>
      {node.kind === 'part' && <p className="text-[12px] leading-[1.45] text-textMuted">{MESH_INFO.part}</p>}
      <Stats stats={node.stats} detailed={!!report?.detailed} />
    </div>
  );

  const row = (node: MeshNode, inline: boolean) => {
    const isSelected = node.id === selected;
    const hiddenHere = isHidden(node.id, hidden);
    const own = hidden.includes(node.id);
    const folded = open.has(node.id) && !query;
    return (
      <li key={node.id} role="treeitem" aria-selected={isSelected} aria-expanded={node.hasChildren && !query ? !folded : undefined}>
        <div
          id={`mesh-node-${node.id}`}
          className={`group flex items-center gap-[4px] rounded-control pe-[2px] ${isSelected ? 'bg-accent/15' : 'hover:bg-textColor/[0.05]'}`}
          style={{ height: ROW_HEIGHT, paddingInlineStart: 6 + node.depth * 14 }}
        >
          {node.hasChildren && !query ? (
            <button
              type="button"
              onClick={() => toggleCollapsed(node.id)}
              aria-label={folded ? `Open ${node.name}` : `Fold ${node.name}`}
              className="flex h-[20px] w-[16px] shrink-0 items-center justify-center text-textMuted hover:text-textColor"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={folded ? '-rotate-90' : undefined}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          ) : (
            <span className="w-[16px] shrink-0" />
          )}
          <button
            type="button"
            onClick={() => onSelect(isSelected ? null : node.id)}
            title={`${node.name} (${kindLabel(node)})`}
            className={`min-w-0 flex-1 truncate text-start text-[13px] outline-none focus-visible:underline ${
              hiddenHere ? 'text-textMuted/60' : isSelected ? 'text-textColor' : node.kind === 'part' ? 'text-textColor/70' : 'text-textColor/85'
            }`}
          >
            {node.name}
          </button>
          <span className="shrink-0 font-mono text-[11px] text-textMuted" title={`${formatExact(node.stats.triangles)} triangles`}>
            {formatCount(node.stats.triangles)}
          </span>
          {node.kind === 'part' ? (
            // parts show and hide with their mesh
            <span className="w-[24px] shrink-0" />
          ) : (
            <button
              type="button"
              onClick={() => onHidden(toggleHidden(nodes, hidden, node.id))}
              aria-label={hiddenHere ? `Show ${node.name}` : `Hide ${node.name}`}
              aria-pressed={hiddenHere}
              title={hiddenHere ? 'Show (H)' : 'Hide (H)'}
              className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-control hover:bg-textColor/[0.08] ${
                own ? 'text-textColor' : hiddenHere ? 'text-textMuted/50' : 'text-textMuted hover:text-textColor'
              }`}
            >
              <EyeIcon open={!hiddenHere} />
            </button>
          )}
        </div>
        {inline && isSelected && details(node, 6 + node.depth * 14)}
      </li>
    );
  };

  return (
    <>
      <Section title="Display">
        <Choice label="Surface" info={MESH_INFO.surface} options={SURFACES} value={view.surface} onChange={(surface) => onView({ ...view, surface })} />
        {view.surface === 'orientation' && (
          <Note>
            <span className="me-[4px] inline-block h-[9px] w-[9px] rounded-[2px] bg-faceFront" /> front
            <span className="mx-[4px] ms-[12px] inline-block h-[9px] w-[9px] rounded-[2px] bg-faceBack" /> back
          </Note>
        )}
        <Switch
          label="Wireframe"
          checked={wire}
          disabled={view.surface === 'off'}
          onChange={(enabled) => setWire({ enabled })}
        />
        {wire && (
          <>
            <Choice label="Edges" info={MESH_INFO.edges} options={WIRE_EDGES} value={view.wire.edges} onChange={(edges) => setWire({ edges })} />
            {view.wire.edges === 'polygons' && report && !report.detailed && <Note>Finding the quads… triangles meanwhile.</Note>}
            <Switch label="Hidden edges" info={MESH_INFO.hidden} checked={view.wire.hidden} onChange={(hiddenEdges) => setWire({ hidden: hiddenEdges })} />
            <Slider
              label="Opacity"
              value={view.wire.opacity}
              min={MESH_LIMITS.opacity[0]}
              max={MESH_LIMITS.opacity[1]}
              step={0.05}
              reset={0.8}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={(opacity) => setWire({ opacity: clampMesh(opacity, MESH_LIMITS.opacity) })}
            />
          </>
        )}
        <Switch label="Vertices" info={MESH_INFO.vertices} checked={view.vertices} onChange={(vertices) => onView({ ...view, vertices })} />
        {view.vertices && limits.dots && (
          <Note>{selected === null ? 'Too many to show at once: select a part to see its vertices.' : 'Too many to show at once: only the selected part.'}</Note>
        )}
        <Switch label="Normals" info={MESH_INFO.normals} checked={view.normals.enabled} onChange={(enabled) => setNormals({ enabled })} />
        {view.normals.enabled && (
          <>
            {limits.normals && (
              <Note>{selected === null ? 'Too many to show at once: select a part to see its normals.' : 'Too many to show at once: only the selected part.'}</Note>
            )}
            <Slider
              label="Length"
              value={view.normals.length}
              min={MESH_LIMITS.normalLength[0]}
              max={MESH_LIMITS.normalLength[1]}
              step={0.005}
              reset={0.03}
              format={(value) => `${(value * 100).toFixed(1)}% of size`}
              onChange={(length) => setNormals({ length: clampMesh(length, MESH_LIMITS.normalLength) })}
            />
          </>
        )}
        <Choice label="Bounding box" info={MESH_INFO.bounds} options={BOUNDS_MODES} value={view.bounds} onChange={(mode) => onView({ ...view, bounds: mode })} />
        {view.bounds === 'selection' && selected === null && <Note>Select a part to see its box.</Note>}
      </Section>

      <Section title="Statistics">
        {report ? (
          <Stats stats={report.total} detailed={report.detailed} objects={nodes.length} size={bounds ? formatDimensions(bounds) : null} />
        ) : (
          <p className="text-[13px] text-textMuted">Loading…</p>
        )}
      </Section>

      <Section title="Objects">
        {nodes.length > FILTER_FROM && (
          <div>
            <label htmlFor={filterId} className="sr-only">
              Find an object by name
            </label>
            <input
              id={filterId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Find among ${nodes.length} objects`}
              autoComplete="off"
              className="h-[32px] w-full rounded-control border border-transparent bg-textColor/[0.06] px-[10px] text-[13px] text-textColor outline-none placeholder:text-textMuted focus:border-accent"
            />
          </div>
        )}
        {hidden.length > 0 && (
          <div className="-mt-[6px] flex items-center gap-[8px] text-[12px] text-textMuted">
            <span>
              Showing {formatCount(visible)} of {formatCount(total)} triangles
            </span>
            <button type="button" onClick={() => onHidden([])} className="ms-auto font-medium text-accent hover:underline">
              Show all
            </button>
          </div>
        )}
        {windowed ? (
          <>
            <div
              ref={boxRef}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              className="-mx-[6px] overflow-y-auto rounded-control border border-line"
              style={{ height: WINDOW_HEIGHT }}
            >
              <div className="relative" style={{ height: listed.length * ROW_HEIGHT }}>
                <ul
                  role="tree"
                  aria-label="Objects"
                  className="absolute inset-x-0 top-0"
                  style={{ transform: `translateY(${from * ROW_HEIGHT}px)` }}
                >
                  {rows.map((node) => row(node, false))}
                </ul>
              </div>
            </div>
            {selectedNode && details(selectedNode, 0)}
          </>
        ) : (
          <ul role="tree" aria-label="Objects" className="-mx-[6px] flex flex-col">
            {rows.map((node) => row(node, true))}
          </ul>
        )}
        {report && nodes.length === 0 && <p className="text-[13px] text-textMuted">Nothing to list.</p>}
      </Section>
    </>
  );
};
