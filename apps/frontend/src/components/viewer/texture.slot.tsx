'use client';

import { FC, ReactNode, useEffect, useRef, useState } from 'react';
import { formatSize } from './download';
import {
  formatMime,
  gpuBytes,
  isPowerOfTwo,
  isSrgbSlot,
  Isolate,
  ISOLATES,
  ReplacedImage,
  SLOT_CHANNEL,
  SLOT_LABEL,
  SlotId,
  SlotState,
  TextureFacts,
} from './material.settings';
import type { TexturePicture } from './texture.preview';
import { Chip, Segmented } from './panel.controls';

const CHANNEL_NAME: Record<Isolate, string> = { rgb: 'colour', r: 'red', g: 'green', b: 'blue', a: 'alpha' };

// Asks the viewer for a picture of this slot's texture
export type PictureLoader = (isolate: Isolate, maxSize: number) => Promise<TexturePicture | null>;

// Images a visitor may drop in: decoded in the browser, never sent anywhere
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_SIZE = 8192;
export const IMAGE_TYPES = 'image/png,image/jpeg,image/webp';

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

// Decodes a picked file as it is stored: no colour conversion, alpha not
// premultiplied (as the model's own textures are)
export const readImageFile = async (file: File): Promise<ReplacedImage> => {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('This image is over 64 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  } catch {
    throw new Error('This file could not be read as a PNG, JPEG or WebP image.');
  }
  if (bitmap.width > MAX_IMAGE_SIZE || bitmap.height > MAX_IMAGE_SIZE) {
    bitmap.close();
    throw new Error(`This image is larger than ${MAX_IMAGE_SIZE} × ${MAX_IMAGE_SIZE} pixels.`);
  }
  return { id: newId(), name: file.name, width: bitmap.width, height: bitmap.height, bitmap };
};

// Loads a picture whenever `revision` changes; null while loading or when
// there is none
const usePicture = (load: PictureLoader | null, isolate: Isolate, maxSize: number, revision: string) => {
  const [state, setState] = useState<{ key: string; picture: TexturePicture | null } | null>(null);
  const key = `${revision}|${isolate}|${maxSize}`;
  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    load(isolate, maxSize)
      .then((picture) => {
        if (!cancelled) setState({ key, picture });
      })
      .catch((error) => {
        console.error('Could not draw the texture', error);
        if (!cancelled) setState({ key, picture: null });
      });
    return () => {
      cancelled = true;
    };
    // `load` changes every render; the revision says when the texture does
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { picture: state?.key === key ? state.picture : null, ready: state?.key === key };
};

const PictureCanvas: FC<{ picture: TexturePicture | null; className: string; label: string }> = ({
  picture,
  className,
  label,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !picture) return;
    canvas.width = picture.data.width;
    canvas.height = picture.data.height;
    canvas.getContext('2d')?.putImageData(picture.data, 0, 0);
  }, [picture]);
  return <canvas ref={ref} role="img" aria-label={label} className={className} />;
};

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// A property's texture, as in LePoly: the picture (click to look closer) or
// a dashed + to add one
export const TextureSlot: FC<{
  slot: SlotId;
  state: SlotState;
  load: PictureLoader;
  // the channel the thumbnail shows
  isolate: Isolate;
  revision: string;
  open: boolean;
  onToggle: () => void;
  onAdd: (image: ReplacedImage) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  // the texture holds several properties (occlusion R, roughness G, metallic B)
  packed?: boolean;
}> = ({ slot, state, load, isolate, revision, open, onToggle, onAdd, onError, disabled, packed }) => {
  const input = useRef<HTMLInputElement>(null);
  const filled = state.present || state.off;
  const { picture } = usePicture(filled && !state.off ? load : null, isolate, 96, revision);
  const label = SLOT_LABEL[slot];
  // a single-channel property (metallic B, roughness G, occlusion R...) says
  // which channel of its texture it reads; the albedo has its own chip
  const reads = SLOT_CHANNEL[slot];
  const channel = reads === 'rgb' ? '' : reads.toUpperCase();
  const channelNote = channel ? ` (reads its ${CHANNEL_NAME[reads]} channel${packed ? ', packed texture' : ''})` : '';

  if (!filled) {
    return (
      <>
        <button
          type="button"
          disabled={disabled}
          title={`Add a ${label.toLowerCase()} texture (only on your screen)`}
          aria-label={`Add a ${label.toLowerCase()} texture`}
          onClick={() => input.current?.click()}
          className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-control border border-dashed border-textMuted/40 text-textMuted outline-none hover:border-textMuted hover:text-textColor focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-textMuted/40"
        >
          <PlusIcon />
        </button>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) readImageFile(file).then(onAdd, (error: Error) => onError(error.message));
          }}
        />
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={open}
      title={state.off ? `${label} texture: off` : `${label} texture${channelNote}: look closer`}
      aria-label={`${label} texture${state.off ? ', off' : channelNote}: look closer`}
      className={`relative h-[40px] w-[40px] shrink-0 overflow-hidden rounded-control border bg-textColor/[0.06] outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40 ${
        open ? 'border-accent' : 'border-line hover:border-textMuted'
      }`}
    >
      {!state.off && <PictureCanvas picture={picture} label="" className="h-full w-full object-cover" />}
      {state.off && (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-textMuted">
          off
        </span>
      )}
      {channel && !state.off && (
        <span
          aria-hidden
          className="absolute bottom-0 end-0 rounded-tl-[3px] bg-bg/85 px-[3px] font-mono text-[9px] font-semibold leading-[13px] text-textColor"
        >
          {channel}
        </span>
      )}
    </button>
  );
};

const Fact: FC<{ term: string; children: ReactNode }> = ({ term, children }) => (
  <>
    <dt className="text-textMuted">{term}</dt>
    <dd className="min-w-0 truncate text-end font-mono text-textColor/90">{children}</dd>
  </>
);

// What the file says about a slot's texture, and a bigger look at it: one
// channel at a time, replace it with an image, switch it off, restore it
export const TexturePreview: FC<{
  slot: SlotId;
  state: SlotState;
  facts: TextureFacts | null;
  load: PictureLoader;
  revision: string;
  packed: boolean;
  uvSets: number;
  changed: boolean;
  disabled?: boolean;
  onUvSet: (uvSet: number) => void;
  onReplace: (image: ReplacedImage) => void;
  onOff: (off: boolean) => void;
  onRestore: () => void;
  onError: (message: string) => void;
}> = ({ slot, state, facts, load, revision, packed, uvSets, changed, disabled, onUvSet, onReplace, onOff, onRestore, onError }) => {
  const input = useRef<HTMLInputElement>(null);
  const [isolate, setIsolate] = useState<Isolate>(SLOT_CHANNEL[slot]);
  const { picture, ready } = usePicture(state.off ? null : load, isolate, 640, revision);
  const label = SLOT_LABEL[slot];
  const width = state.image?.width ?? picture?.width ?? 0;
  const height = state.image?.height ?? picture?.height ?? 0;
  const transform = !state.image ? state.file?.transform : null;
  const reads = SLOT_CHANNEL[slot];
  const ormSlot = slot === 'metallic' || slot === 'roughness' || slot === 'occlusion';

  return (
    <div className="flex flex-col gap-[10px] rounded-control border border-line bg-bg/40 p-[10px]">
      {state.off ? (
        <p className="text-[12px] text-textMuted">This texture is off: the property uses its value alone.</p>
      ) : (
        <>
          <div className="flex min-h-[120px] items-center justify-center overflow-hidden rounded-control bg-bg">
            {ready && !picture ? (
              <p className="p-[16px] text-center text-[12px] text-textMuted">This texture can't be shown.</p>
            ) : (
              <PictureCanvas
                picture={picture}
                label={`${label} texture, ${isolate === 'rgb' ? 'colour' : `${isolate.toUpperCase()} channel`}`}
                className="block max-h-[300px] w-full object-contain"
              />
            )}
          </div>
          <Segmented label={`${label} texture channel`} options={ISOLATES} value={isolate} onChange={setIsolate} />
          {reads !== 'rgb' && (
            <p className="-mt-[4px] text-[12px] text-textMuted">
              {label} reads the {reads.toUpperCase()} channel
              {packed && ormSlot ? ' of a packed texture: occlusion R, roughness G, metallic B.' : '.'}
            </p>
          )}
        </>
      )}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[12px] gap-y-[4px] text-[12px]">
        {state.image ? (
          <Fact term="Image">{state.image.name}</Fact>
        ) : (
          facts && <Fact term="Texture">{facts.name}</Fact>
        )}
        {width > 0 && (
          <Fact term="Size">
            {width} × {height}
            {(!isPowerOfTwo(width) || !isPowerOfTwo(height)) && <span className="text-textMuted"> · not a power of two</span>}
          </Fact>
        )}
        {!state.image && facts && <Fact term="Format">{formatMime(facts.mimeType)}</Fact>}
        {!state.image && facts && facts.bytes !== null && <Fact term="In the file">{formatSize(facts.bytes)}</Fact>}
        {width > 0 && <Fact term="On the GPU">≈ {formatSize(gpuBytes(width, height))}</Fact>}
        <Fact term="Colour space">{isSrgbSlot(slot) ? 'sRGB' : 'Linear (data)'}</Fact>
        {!state.image && facts && <Fact term="Sampler">{facts.sampler}</Fact>}
        {transform && (
          <Fact term="Transform">
            offset {transform.offset.map((v) => v.toFixed(2)).join(', ')} · scale{' '}
            {transform.scale.map((v) => v.toFixed(2)).join(', ')} · {Math.round(transform.rotation)}°
          </Fact>
        )}
        <dt className="self-center text-textMuted">UV set</dt>
        <dd className="flex justify-end gap-[4px]">
          {Array.from({ length: Math.max(1, uvSets) }, (_, set) => (
            <Chip
              key={set}
              label={`UV${set}`}
              title={`Read this texture through UV set ${set}`}
              active={state.uvSet === set}
              disabled={disabled || uvSets <= 1}
              onClick={() => onUvSet(set)}
            />
          ))}
        </dd>
      </dl>

      {state.image && <p className="text-[12px] text-textMuted">Your image, only on your screen: nothing is uploaded.</p>}

      <div className="flex flex-wrap gap-[6px]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="h-[28px] rounded-control bg-textColor/[0.08] px-[10px] text-[12px] text-textColor outline-none hover:bg-textColor/[0.12] focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Replace…
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onOff(!state.off)}
          className="h-[28px] rounded-control bg-textColor/[0.08] px-[10px] text-[12px] text-textColor outline-none hover:bg-textColor/[0.12] focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state.off ? 'Turn on' : 'Turn off'}
        </button>
        {changed && (
          <button
            type="button"
            onClick={onRestore}
            className="ms-auto h-[28px] px-[4px] text-[12px] font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {state.file ? 'Restore original' : 'Remove'}
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) readImageFile(file).then(onReplace, (error: Error) => onError(error.message));
          }}
        />
      </div>
    </div>
  );
};
