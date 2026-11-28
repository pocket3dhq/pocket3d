'use client';

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FrameRequest, MeshPick, ModelViewer, TextureReader, ViewerHandle } from './model.viewer';
import { VersionsPanel } from './versions.panel';
import { canPrefetch, isTyping, neighbours, PanelVersion, shortDate, versionHref } from './versions';
import { downloadFile, downloadFileName, firstViewInTab, formatSize, sendStat } from './download';
import { AdjustTab, ScenePanel } from './scene.panel';
import { DEFAULT_MESH_VIEW, MeshReport, MeshView, SURFACE_LABEL, toggleHidden } from './mesh.settings';
import type { InspectLimits } from './mesh.inspect';
import { DEFAULT_TRANSFORM, SceneBounds, SceneTransform } from './scene.settings';
import { DEFAULT_LOOK, LookStatus, ViewLook } from './look.settings';
import { CHANNEL_VIEWS, DEFAULT_VIEW, droppedImages, imagesIn, MaterialEdits, MaterialsReport, ViewMode } from './material.settings';

const NO_EDITS: MaterialEdits = {};
const NOTHING_HIDDEN: string[] = [];

// phones show panels as bottom sheets: only one at a time
const isPhone = () => window.matchMedia('(max-width: 639px)').matches;

// The public viewer (/m/<id>): the model, its title, and when it has more
// than one published version, the history to click through. Everything it
// shows comes from the server render (published versions only), so
// switching versions never asks the API anything and the model URL always
// comes from that list, never from the address bar. When the owner allows
// it, a Download button saves the version on screen. Adjust opens the panel
// where the visitor moves, turns and scales the model (per version), points
// the camera and sets the lighting (for every version), inspects and tries
// changes to the materials (per version) and shows one channel of them on
// the model, and inspects the geometry: wireframe, surface looks, numbers,
// parts to select and hide (per version), on their own screen only, never
// saved
export const ViewerWithVersions: FC<{
  id: string;
  title: string;
  live: number;
  shown: number;
  // ?v= named a version that is deleted or not public: the live one is shown
  missing?: number;
  versions: PanelVersion[];
  allowDownload?: boolean;
}> = ({ id, title, live, shown: initialShown, missing, versions, allowDownload }) => {
  const [shown, setShown] = useState(initialShown);
  // open when the link named a version: it was shared to show that one
  const [open, setOpen] = useState(initialShown !== live || missing !== undefined);
  const [notice, setNotice] = useState(missing);
  const [copied, setCopied] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const prefetched = useRef(new Set<string>());
  const [adjustOpen, setAdjustOpen] = useState(false);
  // the visitor's Scene settings, per version number
  const [transforms, setTransforms] = useState<Record<number, SceneTransform>>({});
  const [bounds, setBounds] = useState<SceneBounds | null>(null);
  const [frame, setFrame] = useState<FrameRequest>({ view: 'fit', n: 0 });
  // the visitor's camera and lighting settings, one for every version
  const [look, setLook] = useState<ViewLook>(DEFAULT_LOOK);
  const [lookStatus, setLookStatus] = useState<LookStatus>({ loading: null, failed: null, maxShadowQuality: 4096 });
  // the visitor's material edits, per version, and the channel view (one
  // for every version); what the file on screen says about its materials
  const [materialEdits, setMaterialEdits] = useState<Record<number, MaterialEdits>>({});
  const [channelView, setChannelView] = useState<ViewMode>(DEFAULT_VIEW);
  const [materials, setMaterials] = useState<MaterialsReport | null>(null);
  // the material open in the Materials tab, kept while the page is open
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);
  const [adjustTab, setAdjustTab] = useState<AdjustTab>('scene');
  // the Mesh tab: one view for every version; hidden parts and the selected
  // one per version (ids belong to one file); what the file on screen holds
  const [meshView, setMeshView] = useState<MeshView>(DEFAULT_MESH_VIEW);
  const [hiddenObjects, setHiddenObjects] = useState<Record<number, string[]>>({});
  const [selectedObjects, setSelectedObjects] = useState<Record<number, string | null>>({});
  const [meshReport, setMeshReport] = useState<MeshReport | null>(null);
  const [meshLimits, setMeshLimits] = useState<InspectLimits>({ dots: false, normals: false });
  // the panels over the model (null: closed), so it's framed beside them
  const [versionsPanel, setVersionsPanel] = useState<HTMLElement | null>(null);
  const [adjustPanel, setAdjustPanel] = useState<HTMLElement | null>(null);
  const covers = useMemo(() => [versionsPanel, adjustPanel], [versionsPanel, adjustPanel]);
  const inspectorRef = useRef<ViewerHandle | null>(null);
  const readTexture = useCallback<TextureReader>(
    (...args) => inspectorRef.current?.textureImage(...args) ?? Promise.resolve(null),
    []
  );
  const editsRef = useRef(materialEdits);
  useEffect(() => {
    editsRef.current = materialEdits;
  });
  // images the visitor dropped in are freed once nothing uses them
  useEffect(
    () => () => {
      for (const image of Object.values(editsRef.current).flatMap(imagesIn)) image.bitmap.close();
    },
    []
  );

  const base = `/m/${id}`;
  const current = versions.find((version) => version.number === shown) || versions[0];
  const hasHistory = versions.length > 1;
  const transform = transforms[current.number] ?? DEFAULT_TRANSFORM;
  const currentEdits = materialEdits[current.number] ?? NO_EDITS;
  const currentHidden = hiddenObjects[current.number] ?? NOTHING_HIDDEN;
  const currentSelected = selectedObjects[current.number] ?? null;
  const currentMeshes = meshReport?.src === current.path ? meshReport : null;
  // clicks pick parts only while the Mesh tab is in front
  const meshTabOpen = adjustOpen && adjustTab === 'mesh';

  const setHidden = (hidden: string[]) => setHiddenObjects((all) => ({ ...all, [current.number]: hidden }));
  const selectObject = (id: string | null) => setSelectedObjects((all) => ({ ...all, [current.number]: id }));
  const frameObject = (id: string) => setFrame((value) => ({ view: 'fit', n: value.n + 1, object: id }));

  // One thing replaces the surfaces at a time: a channel view (Materials)
  // or a Mesh surface look; the wireframe and overlays stay with either
  const showChannel = (next: ViewMode) => {
    setChannelView(next);
    if (next.channel !== 'lit' && meshView.surface !== 'shaded') setMeshView({ ...meshView, surface: 'shaded' });
  };
  const showMeshView = (next: MeshView) => {
    setMeshView(next);
    if (next.surface !== 'shaded' && channelView.channel !== 'lit') setChannelView({ ...channelView, channel: 'lit' });
  };

  const onPick = (pick: MeshPick) => {
    selectObject(pick.id);
    if (pick.material) setSelectedMaterial(pick.material);
  };

  const editMaterials = (edits: MaterialEdits) => {
    const next = { ...materialEdits, [current.number]: edits };
    for (const image of droppedImages(Object.values(materialEdits), Object.values(next))) image.bitmap.close();
    setMaterialEdits(next);
  };

  const toggleVersions = () => {
    if (!open && isPhone()) setAdjustOpen(false);
    setOpen(!open);
  };
  const toggleAdjust = () => {
    if (!adjustOpen && isPhone()) setOpen(false);
    setAdjustOpen(!adjustOpen);
  };

  const select = useCallback(
    (number: number) => {
      setShown(number);
      setNotice(undefined);
      // the address bar follows, so the link can be copied as is
      window.history.replaceState(null, '', versionHref(base, number, live));
    },
    [base, live]
  );

  // Warms the browser cache (files never change at their URL), only for
  // files small enough not to cost a phone plan
  const prefetch = useCallback(
    (number: number) => {
      const version = versions.find((item) => item.number === number);
      const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
      if (!version || prefetched.current.has(version.path) || !canPrefetch(version.fileSize, saveData)) return;
      prefetched.current.add(version.path);
      fetch(version.path)
        .then((res) => res.arrayBuffer())
        .catch(() => prefetched.current.delete(version.path));
    },
    [versions]
  );

  useEffect(() => {
    document.title = shown === live ? `${title} · pocket3d` : `${title} · v${shown} · pocket3d`;
    if (!hasHistory) return;
    const { newer, older } = neighbours(versions, shown);
    if (newer) prefetch(newer);
    if (older) prefetch(older);
  }, [shown, live, title, hasHistory, versions, prefetch]);

  // One view per visit (not per reload or version switch). Automated
  // browsers don't count
  useEffect(() => {
    if (navigator.webdriver || !firstViewInTab(id)) return;
    sendStat(id, 'views');
  }, [id]);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    sendStat(id, 'downloads');
    try {
      await downloadFile(current.path, downloadFileName(title, current.number, live));
    } finally {
      setDownloading(false);
    }
  };

  // [ and ] step through versions from anywhere on the page
  useEffect(() => {
    if (!hasHistory) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.key !== '[' && event.key !== ']') || event.metaKey || event.ctrlKey || isTyping(event.target)) return;
      const { newer, older } = neighbours(versions, shown);
      const next = event.key === ']' ? newer : older;
      if (next) select(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasHistory, versions, shown, select]);

  // In the Mesh tab: F frames the selected part, H hides or shows it,
  // Alt+H shows everything, Escape lets go of the selection
  const meshKeys = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    meshKeys.current = (event) => {
      if (!meshTabOpen || event.metaKey || event.ctrlKey || isTyping(event.target)) return;
      if (event.code === 'KeyH' && event.altKey) {
        event.preventDefault();
        setHidden([]);
      } else if (event.altKey) {
        return;
      } else if (event.code === 'KeyF' && currentSelected !== null) {
        frameObject(currentSelected);
      } else if (event.code === 'KeyH' && currentSelected !== null && currentMeshes) {
        setHidden(toggleHidden(currentMeshes.nodes, currentHidden, currentSelected));
      } else if (event.key === 'Escape' && currentSelected !== null) {
        selectObject(null);
      }
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => meshKeys.current(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const copyLink = (number: number) => {
    navigator.clipboard?.writeText(`${window.location.origin}${versionHref(base, number, live)}`).then(() => {
      setCopied(number);
      setTimeout(() => setCopied((value) => (value === number ? null : value)), 1500);
    });
  };

  return (
    <>
      <ModelViewer
        src={current.path}
        title={title}
        transform={transform}
        onBounds={setBounds}
        frame={frame}
        look={look}
        onLookStatus={setLookStatus}
        materialEdits={currentEdits}
        view={channelView}
        onMaterials={setMaterials}
        inspectorRef={inspectorRef}
        meshView={meshView}
        hiddenObjects={currentHidden}
        selectedObject={currentSelected}
        inspectMeshes={meshTabOpen}
        onMeshes={setMeshReport}
        onPick={onPick}
        onMeshLimits={setMeshLimits}
        covers={covers}
      />
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-[10px] p-[16px]">
        <h1 className="min-w-0 truncate text-[16px] font-semibold text-textColor drop-shadow">{title}</h1>
        {hasHistory && (
          <button
            type="button"
            onClick={toggleVersions}
            aria-expanded={open}
            aria-controls="versions-panel"
            className="pointer-events-auto flex shrink-0 items-center gap-[4px] rounded-control border border-line bg-bgInner/80 px-[8px] py-[3px] font-mono text-[12px] text-textColor backdrop-blur hover:border-textColor/30"
          >
            <span className={shown === live ? 'text-success' : undefined}>v{shown}</span>
            <span className="sr-only">, show the versions</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={open ? 'rotate-180' : undefined}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={toggleAdjust}
          aria-expanded={adjustOpen}
          aria-controls="scene-panel"
          className={`pointer-events-auto ms-auto flex shrink-0 items-center gap-[6px] rounded-control border bg-bgInner/80 px-[10px] py-[5px] font-mono text-[12px] text-textColor backdrop-blur hover:border-textColor/30 ${
            adjustOpen ? 'border-accent' : 'border-line'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="9" cy="6" r="2" className="fill-bgInner" />
            <circle cx="15" cy="12" r="2" className="fill-bgInner" />
            <circle cx="8" cy="18" r="2" className="fill-bgInner" />
          </svg>
          <span className="max-sm:sr-only">Adjust</span>
        </button>
        {allowDownload && (
          <button
            type="button"
            onClick={download}
            aria-busy={downloading || undefined}
            title={`Download ${downloadFileName(title, current.number, live)} (${formatSize(current.fileSize)})`}
            className="pointer-events-auto flex shrink-0 items-center gap-[6px] rounded-control border border-line bg-bgInner/80 px-[10px] py-[5px] font-mono text-[12px] text-textColor backdrop-blur hover:border-textColor/30 disabled:opacity-60"
            disabled={downloading}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v12" />
              <polyline points="7 10 12 15 17 10" />
              <path d="M5 21h14" />
            </svg>
            <span className="max-sm:sr-only">{downloading ? 'Downloading…' : 'Download'}</span>
            <span className="text-textMuted max-sm:hidden">{formatSize(current.fileSize)}</span>
          </button>
        )}
      </header>

      {(notice !== undefined || shown !== live) && (
        <div className="pointer-events-none absolute inset-x-0 top-[52px] flex justify-center px-[16px]">
          <div
            role="status"
            className="pointer-events-auto flex max-w-full items-center gap-[8px] rounded-control border border-line bg-bgInner/90 px-[10px] py-[6px] text-[12px] text-textMuted backdrop-blur"
          >
            {notice !== undefined ? (
              <>
                <span>
                  v{notice} isn't available · showing the live version (v{live})
                </span>
                <button type="button" onClick={() => setNotice(undefined)} className="text-textColor hover:underline" aria-label="Dismiss">
                  ×
                </button>
              </>
            ) : (
              <>
                <span className="truncate">
                  v{shown} · {shortDate(current.createdAt)} · not the live version
                </span>
                <button type="button" onClick={() => select(live)} className="shrink-0 font-medium text-accent hover:underline">
                  See live
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {channelView.channel !== 'lit' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[16px] flex justify-center px-[16px]">
          <div
            role="status"
            className="pointer-events-auto flex items-center gap-[10px] rounded-control border border-line bg-bgInner/90 px-[10px] py-[6px] text-[12px] text-textMuted backdrop-blur"
          >
            <span>
              Showing <span className="text-textColor">{CHANNEL_VIEWS.find((item) => item.id === channelView.channel)?.label}</span>
            </span>
            <button
              type="button"
              onClick={() => setChannelView({ ...channelView, channel: 'lit' })}
              className="font-medium text-accent hover:underline"
            >
              Back to lit
            </button>
          </div>
        </div>
      )}

      {meshView.surface !== 'shaded' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[16px] flex justify-center px-[16px]">
          <div
            role="status"
            className="pointer-events-auto flex items-center gap-[10px] rounded-control border border-line bg-bgInner/90 px-[10px] py-[6px] text-[12px] text-textMuted backdrop-blur"
          >
            <span>
              Showing <span className="text-textColor">{SURFACE_LABEL[meshView.surface]}</span>
            </span>
            <button
              type="button"
              onClick={() => setMeshView({ ...meshView, surface: 'shaded' })}
              className="font-medium text-accent hover:underline"
            >
              Back to shaded
            </button>
          </div>
        </div>
      )}

      {hasHistory && open && (
        <aside
          ref={setVersionsPanel}
          id="versions-panel"
          aria-label="Versions"
          className="fixed inset-x-0 bottom-0 z-10 max-h-[60vh] overflow-y-auto rounded-t-panel border-t border-line bg-bgInner/95 p-[8px] pb-[20px] backdrop-blur sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-[16px] sm:top-[56px] sm:max-h-[calc(100%-120px)] sm:w-[300px] sm:rounded-panel sm:border sm:pb-[8px]"
        >
          {/* phones: the sheet closes from its corner (desktop: the v3 chip) */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute end-[14px] top-[12px] z-10 bg-bgInner px-[4px] text-[13px] text-textMuted hover:text-textColor sm:hidden"
          >
            Close
          </button>
          <VersionsPanel
            versions={versions}
            live={live}
            shown={shown}
            onSelect={select}
            onPrefetch={prefetch}
            actions={(version) => [
              {
                label: copied === version.number ? 'Copied' : 'Copy link to this version',
                onSelect: () => copyLink(version.number),
              },
            ]}
          />
        </aside>
      )}

      {adjustOpen && (
        <aside
          ref={setAdjustPanel}
          id="scene-panel"
          aria-label="Adjust the view"
          className="fixed inset-x-0 bottom-0 z-10 max-h-[60vh] overflow-y-auto rounded-t-panel border-t border-line bg-bgInner/95 backdrop-blur [color-scheme:dark] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-[16px] sm:top-[56px] sm:max-h-[calc(100%-120px)] sm:w-[340px] sm:rounded-panel sm:border"
        >
          <ScenePanel
            transform={transform}
            bounds={bounds?.src === current.path ? bounds : null}
            onChange={(next, reframe) => {
              setTransforms((all) => ({ ...all, [current.number]: next }));
              if (reframe) setFrame((value) => ({ view: 'fit', n: value.n + 1 }));
            }}
            look={look}
            lookStatus={lookStatus}
            onLookChange={setLook}
            onView={(view) => setFrame((value) => ({ view, n: value.n + 1 }))}
            onClose={() => setAdjustOpen(false)}
            materials={materials?.src === current.path ? materials : null}
            materialEdits={currentEdits}
            onMaterialEdits={editMaterials}
            channelView={channelView}
            onChannelView={showChannel}
            readTexture={readTexture}
            selectedMaterial={selectedMaterial}
            onSelectMaterial={setSelectedMaterial}
            tab={adjustTab}
            onTab={setAdjustTab}
            meshReport={currentMeshes}
            meshView={meshView}
            onMeshView={showMeshView}
            hiddenObjects={currentHidden}
            onHiddenObjects={setHidden}
            selectedObject={currentSelected}
            onSelectObject={selectObject}
            onFrameObject={frameObject}
            meshLimits={meshLimits}
          />
        </aside>
      )}
    </>
  );
};
