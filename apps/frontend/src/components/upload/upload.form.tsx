'use client';

import { DragEvent, FC, FormEvent, useEffect, useId, useState } from 'react';
import { Button } from '@pocket3d/frontend/components/ui/button';
import { Field } from '@pocket3d/frontend/components/ui/field';
import { Notice } from '@pocket3d/frontend/components/ui/notice';
import { CopyButton } from '@pocket3d/frontend/components/dashboard/copy.button';

// Same cap as ASSET_UPLOAD_RULES.file on the backend, which enforces it
const MAX_MB = 95;
const TITLE_MAX_LENGTH = 120;

type State =
  | { step: 'pick' }
  | { step: 'uploading'; progress: number }
  | { step: 'done'; url: string; title: string }
  | { step: 'failed'; message: string };

// The backend sniffs the real type too, but the link is used up as soon as
// the upload starts: catching a wrong file here keeps the link usable
const checkFile = async (file: File): Promise<string | null> => {
  if (!file.name.toLowerCase().endsWith('.glb')) {
    return 'pocket3d takes .glb files only. Ask your assistant to convert the model to .glb, then upload that file.';
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return `This file is over ${MAX_MB} MB, the most pocket3d takes.`;
  }
  const head = new DataView(await file.slice(0, 8).arrayBuffer());
  const isGlb =
    head.byteLength === 8 && head.getUint32(0, false) === 0x676c5446 /* "glTF" */ && head.getUint32(4, true) === 2;
  return isGlb ? null : "This file isn't a valid .glb (binary glTF 2.0) model.";
};

// XMLHttpRequest rather than fetch: it reports upload progress
const send = (token: string, file: File, title: string, onProgress: (ratio: number) => void) =>
  new Promise<{ status: number; body: { url?: string; title?: string; message?: string | string[] } | null }>(
    (resolve) => {
      const data = new FormData();
      if (title) {
        data.append('title', title);
      }
      data.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/public/v1/uploads/${encodeURIComponent(token)}`);
      xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
      xhr.onload = () => {
        let body = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          // proxy error page
        }
        resolve({ status: xhr.status, body });
      };
      xhr.onerror = () => resolve({ status: 0, body: null });
      xhr.send(data);
    }
  );

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const minutesLeft = (expiresAt: string, now: number) => Math.ceil((new Date(expiresAt).getTime() - now) / 60000);

export const UploadForm: FC<{ token: string; title: string | null; expiresAt: string }> = ({
  token,
  title: ticketTitle,
  expiresAt,
}) => {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(ticketTitle || '');
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
    const issue = await checkFile(picked);
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
    const { status, body } = await send(token, file, title.trim(), (progress) =>
      setState({ step: 'uploading', progress })
    );
    if (status === 201 && body?.url) {
      setState({ step: 'done', url: body.url, title: body.title || title });
      return;
    }
    const reason =
      status === 410
        ? 'This link was already used or expired.'
        : status === 0
        ? 'The upload was cut off (network error).'
        : (Array.isArray(body?.message) ? body?.message.join(', ') : body?.message) || `The upload failed (${status}).`;
    setState({ step: 'failed', message: reason });
  };

  if (state.step === 'done') {
    return (
      <div className="flex flex-col gap-[16px]">
        <Notice tone="info">“{state.title}” is published. Anyone with this link can open it:</Notice>
        <div className="break-all rounded-[10px] border border-line bg-bgInner px-[12px] py-[10px] font-mono text-[14px]">
          {state.url}
        </div>
        <div className="flex gap-[8px]">
          <CopyButton value={state.url} label="Copy link" />
          <a
            href={state.url}
            className="inline-flex items-center rounded-[10px] bg-accent px-[14px] py-[9px] text-[14px] font-semibold text-accentText hover:opacity-90"
          >
            Open the model
          </a>
        </div>
        <p className="text-[14px] text-textMuted">You can close this page. Your assistant can find the model too.</p>
      </div>
    );
  }

  if (state.step === 'failed') {
    return (
      <div className="flex flex-col gap-[12px]">
        <Notice>{state.message}</Notice>
        <p className="text-[14px] text-textMuted">
          Upload links work only once, so this one can't be used again. Ask your assistant for a new upload link.
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
        className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-[6px] rounded-[14px] border-2 border-dashed px-[16px] py-[24px] text-center transition ${
          dragging ? 'border-accent bg-accent/10' : 'border-line bg-bgInner/60 hover:border-textMuted'
        }`}
      >
        {file ? (
          <>
            <span className="break-all text-[15px] font-semibold">{file.name}</span>
            <span className="text-[13px] text-textMuted">
              {formatSize(file.size)} · click to choose another file
            </span>
          </>
        ) : (
          <>
            <span className="text-[15px] font-semibold">Drop your .glb here</span>
            <span className="text-[13px] text-textMuted">or click to choose it (up to {MAX_MB} MB)</span>
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

      <Field
        label="Title (optional)"
        hint="Shown on the viewer page and in link previews. Defaults to the file name."
        value={title}
        maxLength={TITLE_MAX_LENGTH}
        disabled={uploading}
        onChange={(event) => setTitle(event.target.value)}
      />

      {uploading ? (
        <div className="flex flex-col gap-[6px]" role="status">
          <div className="h-[8px] overflow-hidden rounded-full bg-bgInner">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="text-[13px] text-textMuted">
            {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Publishing…'}
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
          : `This link works once${left !== null ? ` and expires in ${left} min` : ''}.`}
      </p>
    </form>
  );
};
