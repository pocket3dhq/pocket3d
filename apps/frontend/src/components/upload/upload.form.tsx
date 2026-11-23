'use client';

import { DragEvent, FC, FormEvent, useEffect, useId, useState } from 'react';
import {
  BUTTON_BASE,
  BUTTON_VARIANTS,
  Button,
} from '@pocket3d/frontend/components/ui/button';
import { Field } from '@pocket3d/frontend/components/ui/field';
import { Notice } from '@pocket3d/frontend/components/ui/notice';
import { CopyButton } from '@pocket3d/frontend/components/dashboard/copy.button';
import {
  checkModel,
  formatSize,
  MAX_MB,
  sendUpload,
  TITLE_MAX_LENGTH,
  uploadError,
} from '@pocket3d/frontend/components/upload/upload.client';

type State =
  | { step: 'pick' }
  | { step: 'uploading'; progress: number }
  | { step: 'done'; url: string; title: string; version?: number; draft?: boolean }
  | { step: 'failed'; message: string };

const NOT_GLB =
  'pocket3d takes .glb files only. Ask your assistant to convert the model to .glb, then upload that file.';

const minutesLeft = (expiresAt: string, now: number) =>
  Math.ceil((new Date(expiresAt).getTime() - now) / 60000);

export const UploadForm: FC<{
  token: string;
  title: string | null;
  expiresAt: string;
  // set: the link adds a version (or a draft) to a model, which keeps its title
  version?: { draft: boolean; note: string | null };
}> = ({ token, title: ticketTitle, expiresAt, version }) => {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(ticketTitle || '');
  const [note, setNote] = useState(version?.note || '');
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<State>({ step: 'pick' });
  // set after mount, so the server and the browser render the same thing
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const left = now === null ? null : minutesLeft(expiresAt, now);
  const expired = left !== null && left <= 0;

  const choose = async (picked?: File | null) => {
    if (!picked) {
      return;
    }
    const issue = await checkModel(picked, NOT_GLB);
    setProblem(issue);
    setFile(issue ? null : picked);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files?.[0]);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || expired) {
      return;
    }
    setState({ step: 'uploading', progress: 0 });
    const result = await sendUpload(
      `/api/public/v1/uploads/${encodeURIComponent(token)}`,
      version ? { file, note: note.trim() } : { file, title: title.trim() },
      (progress) => setState({ step: 'uploading', progress })
    );
    if (result.status === 201 && result.body?.url) {
      setState({
        step: 'done',
        url: result.body.url,
        title: result.body.title || title,
        version: result.body.version,
        draft: result.body.status === 'draft',
      });
      return;
    }
    const reason = uploadError(result);
    setState({ step: 'failed', message: reason });
  };

  if (state.step === 'done' && state.draft) {
    return (
      <div className="flex flex-col gap-[16px]">
        <Notice tone="info">
          Draft v{state.version} of “{state.title}” is saved. It stays private until the owner publishes it from their
          dashboard.
        </Notice>
        <p className="text-[14px] text-textMuted">You can close this page. Your assistant can find the draft too.</p>
      </div>
    );
  }

  if (state.step === 'done') {
    return (
      <div className="flex flex-col gap-[16px]">
        <Notice tone="info">
          {state.version && state.version > 1
            ? `v${state.version} of “${state.title}” is live at the same link:`
            : `“${state.title}” is published. Anyone with this link can open it:`}
        </Notice>
        <div className="break-all rounded-control border border-line bg-bgInner px-[12px] py-[10px] font-mono text-[14px]">
          {state.url}
        </div>
        <div className="flex gap-[8px]">
          <CopyButton value={state.url} label="Copy link" />
          <a
            href={state.url}
            className={`${BUTTON_BASE} ${BUTTON_VARIANTS.primary}`}
          >
            Open the model
          </a>
        </div>
        <p className="text-[14px] text-textMuted">
          You can close this page. Your assistant can find the model too.
        </p>
      </div>
    );
  }

  if (state.step === 'failed') {
    return (
      <div className="flex flex-col gap-[12px]">
        <Notice>{state.message}</Notice>
        <p className="text-[14px] text-textMuted">
          Upload links work only once, so this one can't be used again. Ask your
          assistant for a new upload link.
        </p>
      </div>
    );
  }

  const uploading = state.step === 'uploading';
  const progress = state.step === 'uploading' ? state.progress : 0;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-[16px]">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-[6px] rounded-panel border border-dashed px-[16px] py-[24px] text-center transition ${
          dragging
            ? 'border-accent bg-accent/10'
            : 'border-textColor/20 bg-bgInner/50 hover:border-textColor/40'
        }`}
      >
        {file ? (
          <>
            <span className="break-all text-[15px] font-semibold">
              {file.name}
            </span>
            <span className="text-[13px] text-textMuted">
              {formatSize(file.size)} · click to choose another file
            </span>
          </>
        ) : (
          <>
            <span className="text-[15px] font-semibold">
              Drop your .glb here
            </span>
            <span className="text-[13px] text-textMuted">
              or click to choose it (up to {MAX_MB} MB)
            </span>
          </>
        )}
        <input
          id={inputId}
          type="file"
          accept=".glb,model/gltf-binary"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </label>

      <Notice>{problem}</Notice>

      {version ? (
        <Field
          label="What changed (optional)"
          hint="Shown with this version in the model's history."
          value={note}
          maxLength={280}
          disabled={uploading}
          onChange={(event) => setNote(event.target.value)}
        />
      ) : (
        <Field
          label="Title (optional)"
          hint="Shown on the viewer page and in link previews. Defaults to the file name."
          value={title}
          maxLength={TITLE_MAX_LENGTH}
          disabled={uploading}
          onChange={(event) => setTitle(event.target.value)}
        />
      )}

      {uploading ? (
        <div className="flex flex-col gap-[6px]" role="status">
          <div className="h-[8px] overflow-hidden rounded-full bg-bgInner">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="text-[13px] text-textMuted">
            {progress < 1
              ? `Uploading… ${Math.round(progress * 100)}%`
              : 'Publishing…'}
          </span>
        </div>
      ) : (
        <Button type="submit" disabled={!file || expired}>
          Publish
        </Button>
      )}

      <p className="text-[13px] text-textMuted">
        {expired
          ? 'This link expired. Ask your assistant for a new one.'
          : `This link works once${
              left !== null ? ` and expires in ${left} min` : ''
            }.`}
      </p>
    </form>
  );
};
