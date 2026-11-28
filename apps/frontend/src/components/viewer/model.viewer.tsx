'use client';

import { FC, RefObject, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { isTyping } from './versions';
import { DEFAULT_TRANSFORM, isDefault, SceneBounds, SceneTransform } from './scene.settings';
import { CameraView, DEFAULT_LOOK, LookStatus, ViewLook } from './look.settings';
import { coveredInset, setInset, setProjection, viewModel } from './camera';
import { preciseBox } from './bounds';
import { DEFAULT_VIEW, Isolate, MaterialEdits, MaterialsReport, SlotId, ViewMode } from './material.settings';
import { disposeMaterialIndex, indexMaterials, materialKeyFor, refreshMaterials, textureForSlot } from './materials';
import { DEFAULT_MESH_VIEW, isRawSurface, MeshReport, MeshView } from './mesh.settings';
import {
  applyInspection,
  applySurface,
  disposeMeshIndex,
  ensureDetails,
  indexMeshes,
  InspectLimits,
  InspectState,
  meshReport,
  objectFor,
  PRIMITIVE_KEY,
  pickAt,
  refreshBoxes,
} from './mesh.inspect';
import { readTexture, TexturePicture } from './texture.preview';
import {
  applyLook,
  createStage,
  disposeObject,
  disposeStage,
  fitToModel,
  loadEnvironment,
  prepareModel,
  renderStage,
  resizeStage,
  showEnvironment,
  Stage,
} from './stage';

// The bounding radius and longest side of a model as authored
const measureModel = (root: THREE.Object3D) => {
  const box = preciseBox(root);
  const side = box.getSize(new THREE.Vector3());
  return {
    radius: box.getBoundingSphere(new THREE.Sphere()).radius || 1,
    size: Math.max(side.x, side.y, side.z) || 1,
  };
};

// A new version within this factor of the old one's size keeps the camera
// where it is, so flipping between versions shows what changed; beyond it
// the camera reframes (the new one would be lost or fill the screen)
const KEEP_CAMERA_RATIO = 3;

// Wraps a loaded scene so the Scene settings turn and scale it about the
// middle of its box (not the file's origin, which can be far away): the
// holder sits at that middle, the scene inside is shifted back by it, so
// with no settings everything is exactly where the file put it
const makeHolder = (scene: THREE.Object3D) => {
  const pivot = preciseBox(scene).getCenter(new THREE.Vector3());
  if (!Number.isFinite(pivot.x + pivot.y + pivot.z)) pivot.set(0, 0, 0);
  const offset = new THREE.Group();
  offset.position.copy(pivot).negate();
  offset.add(scene);
  const holder = new THREE.Group();
  holder.userData.pivot = pivot;
  holder.add(offset);
  return holder;
};

// Applies the Scene panel's settings to the model's holder group
const applyTransform = (holder: THREE.Object3D, transform: SceneTransform) => {
  const pivot = holder.userData.pivot as THREE.Vector3;
  holder.position.fromArray(transform.position).add(pivot);
  holder.rotation.set(
    THREE.MathUtils.degToRad(transform.rotation[0]),
    THREE.MathUtils.degToRad(transform.rotation[1]),
    THREE.MathUtils.degToRad(transform.rotation[2]),
    'XYZ'
  );
  holder.scale.setScalar(transform.scale);
  holder.updateMatrixWorld(true);
};

const measure = (holder: THREE.Object3D, src: string): SceneBounds => {
  const box = preciseBox(holder);
  return { src, min: box.min.toArray(), max: box.max.toArray() };
};

// A request to move the camera: each new `n` puts it on the model (or on
// one of its parts, `object`, a Mesh tab id) from `view` (fit is the
// opening three-quarter framing, as R does)
export interface FrameRequest {
  view: CameraView;
  n: number;
  object?: string;
}

const NO_FRAME: FrameRequest = { view: 'fit', n: 0 };
const NO_EDITS: MaterialEdits = {};
const NOTHING_HIDDEN: string[] = [];
const NO_COVERS: readonly (HTMLElement | null)[] = [];

// A click on the model, while the Mesh tab picks: the part under it (null:
// none) and its material in the Materials tab
export interface MeshPick {
  id: string | null;
  material: string | null;
}

// A press that moves less than this (in pixels) is a click, not an orbit
const CLICK_SLOP = 4;

// What the Materials tab asks of the viewer: a picture of the texture in a
// material's slot (of the file `src`), or null when there is none
export type TextureReader = (
  src: string,
  material: string,
  slot: SlotId,
  isolate: Isolate,
  maxSize: number
) => Promise<TexturePicture | null>;

export interface ViewerHandle {
  textureImage: TextureReader;
}

// `transform` (optional) is the visitor's Scene settings for this file;
// `onBounds` hears the model's box whenever a model or its settings change.
// `look` is the visitor's camera and lighting settings, `onLookStatus` hears
// about environment downloads. Each new `frame` moves the camera (after
// jumps like "centre" or "rest on the floor", or a camera view).
// `materialEdits` (for this file) and `view` are the Materials tab's;
// `onMaterials` hears what the file's materials are once it loads, and
// `inspectorRef` lets the tab ask for pictures of textures. Without these
// props (the dashboard) the viewer looks as it always has.
// The Mesh tab's: `meshView` (how surfaces, wireframe and overlays show),
// `hiddenObjects` and `selectedObject` (ids for this file), `inspectMeshes`
// (the tab is open: its numbers are worked out and clicks pick parts),
// `onMeshes` hears the file's objects and numbers, `onPick` the clicks,
// `onMeshLimits` when there are too many vertices for every dot or normal.
// `covers` are the panels laid over the viewer (null: closed): the model is
// framed and centred in the room they leave
export const ModelViewer: FC<{
  src: string;
  title: string;
  transform?: SceneTransform;
  onBounds?: (bounds: SceneBounds) => void;
  frame?: FrameRequest;
  look?: ViewLook;
  onLookStatus?: (status: LookStatus) => void;
  materialEdits?: MaterialEdits;
  view?: ViewMode;
  onMaterials?: (report: MaterialsReport) => void;
  inspectorRef?: RefObject<ViewerHandle | null>;
  meshView?: MeshView;
  hiddenObjects?: string[];
  selectedObject?: string | null;
  inspectMeshes?: boolean;
  onMeshes?: (report: MeshReport) => void;
  onPick?: (pick: MeshPick) => void;
  onMeshLimits?: (limits: InspectLimits) => void;
  covers?: readonly (HTMLElement | null)[];
}> = ({
  src,
  title,
  transform = DEFAULT_TRANSFORM,
  onBounds,
  frame = NO_FRAME,
  look = DEFAULT_LOOK,
  onLookStatus,
  materialEdits = NO_EDITS,
  view = DEFAULT_VIEW,
  onMaterials,
  inspectorRef,
  meshView = DEFAULT_MESH_VIEW,
  hiddenObjects = NOTHING_HIDDEN,
  selectedObject = null,
  inspectMeshes = false,
  onMeshes,
  onPick,
  onMeshLimits,
  covers = NO_COVERS,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  // the file on screen, the one loading, the one that failed: set from the
  // loader's callbacks only
  const [shownSrc, setShownSrc] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ src: string; ratio: number | null } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // the latest settings and listeners, for the loader's callbacks
  const transformRef = useRef(transform);
  const onBoundsRef = useRef(onBounds);
  const onLookStatusRef = useRef(onLookStatus);
  const editsRef = useRef(materialEdits);
  const viewRef = useRef(view);
  const onMaterialsRef = useRef(onMaterials);
  const inspectRef = useRef<InspectState>({ view: meshView, hidden: hiddenObjects, selected: selectedObject });
  const inspectMeshesRef = useRef(inspectMeshes);
  const onMeshesRef = useRef(onMeshes);
  const onPickRef = useRef(onPick);
  const onMeshLimitsRef = useRef(onMeshLimits);
  // the file the stage's material index describes
  const materialsSrcRef = useRef<string | null>(null);
  const framedRef = useRef(frame.n);
  const statusRef = useRef<LookStatus>({ loading: null, failed: null, maxShadowQuality: 1024 });
  useEffect(() => {
    transformRef.current = transform;
    onBoundsRef.current = onBounds;
    onLookStatusRef.current = onLookStatus;
    editsRef.current = materialEdits;
    viewRef.current = view;
    onMaterialsRef.current = onMaterials;
    inspectRef.current = { view: meshView, hidden: hiddenObjects, selected: selectedObject };
    inspectMeshesRef.current = inspectMeshes;
    onMeshesRef.current = onMeshes;
    onPickRef.current = onPick;
    onMeshLimitsRef.current = onMeshLimits;
  });

  const report = (patch: Partial<LookStatus>) => {
    statusRef.current = { ...statusRef.current, ...patch };
    onLookStatusRef.current?.(statusRef.current);
  };

  // The renderer, cameras and controls: created once, kept across models
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stage = createStage(container);
    stageRef.current = stage;
    const { renderer, controls } = stage;

    // the first touch or drag hands control to the visitor for good (and
    // the camera is theirs: a panel opening no longer reframes it)
    const stopAutoRotate = () => {
      controls.autoRotate = false;
      stage.framed = null;
    };
    controls.addEventListener('start', stopAutoRotate);

    const observer = new ResizeObserver(() =>
      resizeStage(stage, container.clientWidth, container.clientHeight)
    );
    observer.observe(container);

    renderer.setAnimationLoop(() => renderStage(stage));

    // R puts the camera back where it started for this model
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'r' || event.key === 'R') && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target) && stage.model) {
        viewModel(stage.model, stage, 'fit');
      }
    };
    window.addEventListener('keydown', onKey);

    // While the Mesh tab is open, a click (not a drag) picks the part under it
    const canvas = renderer.domElement;
    let press: { x: number; y: number; id: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      press = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = press;
      press = null;
      if (!start || start.id !== event.pointerId || !inspectMeshesRef.current || !stage.meshes) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const hit = pickAt(stage.meshes, stage.active, ndc);
      const material = hit && stage.materials ? materialKeyFor(stage.materials, hit.object, hit.materialIndex) : null;
      onPickRef.current?.({ id: hit?.id ?? null, material });
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    statusRef.current = {
      ...statusRef.current,
      maxShadowQuality: Math.min(4096, renderer.capabilities.maxTextureSize),
    };
    onLookStatusRef.current?.(statusRef.current);

    return () => {
      stageRef.current = null;
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.removeEventListener('start', stopAutoRotate);
      disposeStage(stage);
    };
  }, []);

  useEffect(() => {
    stageRef.current?.renderer.domElement.setAttribute('aria-label', `3D model: ${title}`);
  }, [title]);

  // What the panels cover, whenever they open, close or change size
  useEffect(() => {
    const stage = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container) return;
    const panels = covers.filter((panel): panel is HTMLElement => !!panel);
    const fit = () =>
      setInset(stage, coveredInset(container.getBoundingClientRect(), panels.map((panel) => panel.getBoundingClientRect())));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    for (const panel of panels) observer.observe(panel);
    return () => observer.disconnect();
  }, [covers]);

  // The model: loaded whenever the file changes. The one on screen stays
  // until the new one is ready; a load that finishes after a newer request
  // (quick clicks through versions) is thrown away, never shown
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let cancelled = false;

    stage.loader.load(
      src,
      (gltf) => {
        if (cancelled) {
          disposeObject(gltf.scene);
          return;
        }
        const next = makeHolder(gltf.scene);
        prepareModel(stage, next);
        // the camera decision compares files as authored, before settings
        const { radius, size } = measureModel(next);
        applyTransform(next, transformRef.current);
        const previous = stage.model;
        // the Mesh tab's looks sit over the materials: they come off first
        if (stage.meshes) disposeMeshIndex(stage.meshes);
        if (stage.materials) disposeMaterialIndex(stage.materials);
        if (previous) {
          stage.scene.remove(previous);
          disposeObject(previous);
        }
        const materials = indexMaterials(gltf);
        // an unlit material's PBR textures arrive later: the edits apply again
        // a mesh with several primitives loads as one three mesh each (named
        // by three, not the file): the Mesh tab lists them by material
        for (const [object, mapping] of gltf.parser.associations) {
          const { primitives, nodes } = mapping as { primitives?: number; nodes?: number };
          if (primitives !== undefined && nodes === undefined && object instanceof THREE.Object3D) {
            object.userData[PRIMITIVE_KEY] = true;
          }
        }
        const meshes = indexMeshes(gltf.scene);
        materials.onLoaded = () => {
          if (stage.materials !== materials) return;
          refreshMaterials(materials, editsRef.current, viewRef.current);
          if (stage.meshes === meshes) applySurface(meshes, inspectRef.current.view);
        };
        stage.materials = materials;
        stage.meshes = meshes;
        materialsSrcRef.current = src;
        refreshMaterials(materials, editsRef.current, viewRef.current);
        stage.scene.add(next);
        const reframe =
          stage.radius === null ||
          radius / stage.radius > KEEP_CAMERA_RATIO ||
          stage.radius / radius > KEEP_CAMERA_RATIO;
        stage.model = next;
        stage.radius = radius;
        stage.size = size;
        if (reframe) {
          viewModel(next, stage, 'fit');
        }
        fitToModel(stage);
        if (!isDefault(transformRef.current)) stage.controls.autoRotate = false;
        onMeshLimitsRef.current?.(applyInspection(meshes, inspectRef.current, next, stage.inspection, size));
        stage.hiddenKey = inspectRef.current.hidden.join(',');
        onBoundsRef.current?.(measure(next, src));
        onMaterialsRef.current?.({ src, ...materials.report });
        onMeshesRef.current?.(meshReport(meshes, src));
        setFailedSrc(null);
        setShownSrc(src);
      },
      (event) => {
        if (cancelled) return;
        setProgress({ src, ratio: event.total ? event.loaded / event.total : null });
      },
      (error) => {
        if (cancelled) return;
        console.error('Could not load the model', error);
        setFailedSrc(src);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [src]);

  // The Scene settings, as the visitor changes them. Only once the model on
  // screen is this file: the previous one keeps its own until replaced.
  // Touching them hands control to the visitor (auto-rotate stops), as does
  // asking for a camera view
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage?.model || shownSrc !== src) return;
    applyTransform(stage.model, transform);
    fitToModel(stage);
    if (!isDefault(transform)) stage.controls.autoRotate = false;
    if (stage.meshes) refreshBoxes(stage.meshes, inspectRef.current, stage.model, stage.inspection);
    if (framedRef.current !== frame.n) {
      framedRef.current = frame.n;
      stage.controls.autoRotate = false;
      const part = frame.object && stage.meshes ? objectFor(stage.meshes, frame.object) : null;
      viewModel(part ?? stage.model, stage, frame.view);
    }
    onBoundsRef.current?.(measure(stage.model, src));
  }, [transform, frame, shownSrc, src]);

  // The Materials tab's edits and channel view. Like the Scene settings,
  // only once the model on screen is this file
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage?.materials || shownSrc !== src) return;
    refreshMaterials(stage.materials, materialEdits, view);
    // the Mesh tab's surface look goes back over the new materials
    if (stage.meshes) applySurface(stage.meshes, inspectRef.current.view);
  }, [materialEdits, view, shownSrc, src]);

  // The Mesh tab's view, hidden parts and selection, for the file on screen
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage?.meshes || !stage.model || shownSrc !== src) return;
    const limits = applyInspection(
      stage.meshes,
      { view: meshView, hidden: hiddenObjects, selected: selectedObject },
      stage.model,
      stage.inspection,
      stage.size
    );
    // hidden parts drop out of the ground's occlusion (the ground itself
    // stays under the whole model)
    const hiddenKey = hiddenObjects.join(',');
    if (stage.hiddenKey !== hiddenKey) {
      stage.hiddenKey = hiddenKey;
      fitToModel(stage);
    }
    onMeshLimitsRef.current?.(limits);
  }, [meshView, hiddenObjects, selectedObject, shownSrc, src]);

  // The welded vertices, edges, polygons and checks: worked out (a slice at
  // a time) once the Mesh tab opens, or the polygon wireframe needs them
  const needsDetails = inspectMeshes || (meshView.wire.edges === 'polygons' && (meshView.wire.enabled || meshView.surface === 'off'));
  useEffect(() => {
    const stage = stageRef.current;
    const meshes = stage?.meshes;
    if (!stage || !meshes || !needsDetails || shownSrc !== src || meshes.detailed) return;
    ensureDetails(meshes)
      .then(() => {
        if (stageRef.current !== stage || stage.meshes !== meshes || !stage.model) return;
        onMeshesRef.current?.(meshReport(meshes, src));
        // the polygon wireframe can hide its diagonals now
        applyInspection(meshes, inspectRef.current, stage.model, stage.inspection, stage.size);
      })
      .catch((error) => console.error('Could not measure the mesh', error));
  }, [needsDetails, shownSrc, src]);

  // A channel view (or the Mesh tab's front/back and off surfaces) shows raw
  // values: no ground, shadows or ambient occlusion over them (the
  // visitor's lighting comes back with Lit / Shaded)
  const inspecting = view.channel !== 'lit' || isRawSurface(meshView.surface);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || stage.inspecting === inspecting) return;
    stage.inspecting = inspecting;
    applyLook(stage, stage.look);
  }, [inspecting]);

  useEffect(() => {
    if (!inspectorRef) return;
    inspectorRef.current = {
      textureImage: async (file, material, slot, isolate, maxSize) => {
        const stage = stageRef.current;
        const index = stage?.materials;
        if (!stage || !index || materialsSrcRef.current !== file) return null;
        const texture = await textureForSlot(index, material, slot, editsRef.current[material]);
        // the model may have changed meanwhile
        if (!texture || stageRef.current !== stage || stage.materials !== index) return null;
        return readTexture(stage.renderer, texture, isolate, maxSize);
      },
    };
    return () => {
      inspectorRef.current = null;
    };
  }, [inspectorRef]);

  // The camera projection and lighting, as the visitor changes them
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    setProjection(stage, look.projection);
    applyLook(stage, look);
  }, [look]);

  // A newly picked environment: shown at once if it's here already,
  // otherwise downloaded first (the current one stays meanwhile; a pick
  // that's been replaced by another is dropped when it arrives)
  const environment = look.environment.id;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (showEnvironment(stage, environment)) {
      if (statusRef.current.loading || statusRef.current.failed) report({ loading: null, failed: null });
      return;
    }
    let cancelled = false;
    report({ loading: environment, failed: null });
    loadEnvironment(stage, environment)
      .then(() => {
        if (cancelled) return;
        showEnvironment(stage, environment);
        report({ loading: null });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Could not load the environment', error);
        report({ loading: null, failed: environment });
      });
    return () => {
      cancelled = true;
    };
  }, [environment]);

  const failed = failedSrc === src;
  const loading = shownSrc !== src && !failed;
  // a model is on screen already: the next one loads behind it
  const replacing = loading && shownSrc !== null;
  const ratio = progress?.src === src ? progress.ratio : null;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {loading && !replacing && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[12px]">
          <div className="h-[4px] w-[180px] overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${Math.round((ratio ?? 0.1) * 100)}%` }}
            />
          </div>
          <div className="text-[13px] text-textMuted">
            {ratio === null ? 'Loading model…' : `Loading model… ${Math.round(ratio * 100)}%`}
          </div>
        </div>
      )}
      {replacing && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] overflow-hidden bg-line/60"
          role="progressbar"
          aria-label="Loading this version"
          aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)}
        >
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${Math.round((ratio ?? 0.15) * 100)}%` }}
          />
        </div>
      )}
      {failed && (
        <div
          className={
            shownSrc
              ? 'pointer-events-none absolute inset-x-0 top-[56px] flex justify-center px-[16px]'
              : 'absolute inset-0 flex items-center justify-center px-[24px]'
          }
        >
          <div
            role="alert"
            className="max-w-[360px] rounded-control bg-bg/80 px-[12px] py-[8px] text-center text-[14px] text-danger"
          >
            {shownSrc
              ? 'This version could not be loaded. Check your connection and try again.'
              : 'This model could not be loaded. Check your connection and reload the page.'}
          </div>
        </div>
      )}
    </div>
  );
};
