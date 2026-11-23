'use client';

import { DragEvent, FC, FormEvent, useId, useState } from 'react';
import { useSWRConfig } from 'swr';
import { apiFetch } from '@pocket3d/frontend/lib/api';
import {
  BUTTON_BASE,
  BUTTON_VARIANTS,
  Button,
} from '@pocket3d/frontend/components/ui/button';
import { Card } from '@pocket3d/frontend/components/ui/card';
import { Field } from '@pocket3d/frontend/components/ui/field';
import { Notice } from '@pocket3d/frontend/components/ui/notice';
import { CopyButton } from '@pocket3d/frontend/components/dashboard/copy.button';
import {
  checkCover,
  checkModel,
  formatSize,
  MAX_COVER_MB,
  MAX_MB,
  sendUpload,
  TITLE_MAX_LENGTH,
  uploadError,
} from '@pocket3d/frontend/components/upload/upload.client';

type State =
  | { step: 'pick' }
  | { step: 'uploading'; progress: number }
  | {
      step: 'done';
      url: string;
      title: string;
      version?: number;
      draft?: boolean;
      live?: number | null;
    };

// What the server answered for a new version
interface UploadAnswer {
  url?: string;
  title?: string;
  version?: number;
  status?: 'draft' | 'published';
  live?: number | null;
}

const NOTE_MAX_LENGTH = 280;

const NOT_GLB =
  'pocket3d takes .glb files only. Export or convert the model to .glb (binary glTF), then upload that file.';

// Publishing from the dashboard. The dashboard API only takes JSON, so the
// file doesn't go through it: POST /assets/upload-link returns a single-use
// upload link for this account, and the file goes straight to that link,
// the same upload path (and checks) as the CLI's upload links. With `model`,
// the link (and so the upload) adds the next version of that model: same
// link, live at once, or a private draft
export const UploadModel: FC<{
  model?: { id: string; title: string };
  onDone?: (version: number) => void;
}> = ({ model, onDone }) => {
  const inputId = useId();
  const coverId = useId();
  const draftId = useId();
  const { mutate } = useSWRConfig();
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<State>({ step: 'pick' });

  const reset = () => {
    setFile(null);
    setCover(null);
    setTitle('');
    setNote('');
    setDraft(false);
    setProblem(null);
    setState({ step: 'pick' });
  };

  const chooseModel = async (picked?: File | null) => {
    if (!picked) {
      return;
    }
    const issue = await checkModel(picked, NOT_GLB);
    setProblem(issue);
    setFile(issue ? null : picked);
  };

  const chooseCover = (picked?: File | null) => {
    if (!picked) {
      setCover(null);
      return;
    }
    const issue = checkCover(picked);
    setProblem(issue);
    setCover(issue ? null : picked);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    chooseModel(event.dataTransfer.files?.[0]);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      return;
    }
    setProblem(null);
    setState({ step: 'uploading', progress: 0 });
    let path: string;
    try {
      // asked for right before sending, so it can't expire on an open tab
      const link = await apiFetch<{ url: string }>('/assets/upload-link', {
        method: 'POST',
        body: model
          ? { model: model.id, draft, ...(note.trim() ? { note: note.trim() } : {}) }
          : title.trim()
          ? { title: title.trim() }
          : {},
      });
      path = new URL(link.url, window.location.origin).pathname;
    } catch (err) {
      setProblem((err as Error).message);
      setState({ step: 'pick' });
      return;
    }
    const result = await sendUpload(
      path,
      { file, title: model ? undefined : title.trim(), cover },
      (progress) => setState({ step: 'uploading', progress })
    );
    const answer = result.body as UploadAnswer | null;
    if (result.status === 201 && answer?.url) {
      setState({
        step: 'done',
        url: answer.url,
        title: answer.title || title || file.name,
        version: answer.version,
        draft: answer.status === 'draft',
        live: answer.live,
      });
      // the list, the storage meter and the model page
      mutate((key) => typeof key === 'string' && key.startsWith('/assets'));
      if (model && answer.version) {
        onDone?.(answer.version);
      }
      return;
    }
    // the link is spent, but a new one is made on the next try: keep the form
    setProblem(uploadError(result));
    setState({ step: 'pick' });
  };

  if (state.step === 'done' && model) {
    return (
      <Card title={state.draft ? `Draft v${state.version} saved` : `v${state.version} is live`}>
        <Notice tone="info">
          {state.draft
            ? `Only you can see it. People with the link still see v${state.live}: publish the draft from its menu when it's ready.`
            : 'People with the link see it now. Same link as before:'}
        </Notice>
        {!state.draft && (
          <div className="break-all rounded-control border border-line bg-bgInner px-[12px] py-[10px] font-mono text-[14px]">
            {state.url}
          </div>
        )}
        <div className="flex flex-wrap gap-[8px]">
          {!state.draft && <CopyButton value={state.url} label="Copy link" />}
          <Button variant="ghost" onClick={reset}>
            Upload another version
          </Button>
        </div>
      </Card>
    );
  }

  if (state.step === 'done') {
    return (
      <Card title="Published">
        <Notice tone="info">
          “{state.title}” is live. Anyone with this link can open it:
        </Notice>
        <div className="break-all rounded-control border border-line bg-bgInner px-[12px] py-[10px] font-mono text-[14px]">
          {state.url}
        </div>
        <div className="flex flex-wrap gap-[8px]">
          <CopyButton value={state.url} label="Copy link" />
          <a
            href={state.url}
            target="_blank"
            rel="noopener"
            className={`${BUTTON_BASE} ${BUTTON_VARIANTS.primary}`}
          >
            Open the model
          </a>
          <Button variant="ghost" onClick={reset}>
            Publish another
          </Button>
        </div>
      </Card>
    );
  }

  const uploading = state.step === 'uploading';
  const progress = uploading ? state.progress : 0;
  return (
    <Card
      title={model ? 'Upload a new version' : 'Publish a model'}
      description={
        model
          ? `Same link: it replaces what people see of “${model.title}”, and the current version stays in the history.`
          : undefined
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-[16px]">
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-[6px] rounded-panel border border-dashed px-[16px] py-[20px] text-center transition ${
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
                Drop a .glb here
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
            onChange={(event) => chooseModel(event.target.files?.[0])}
          />
        </label>

        <Notice>{problem}</Notice>

        {file && (
          <>
            {model ? (
              <>
                <Field
                  label="What changed (optional)"
                  hint="Shown with this version in the history."
                  value={note}
                  maxLength={NOTE_MAX_LENGTH}
                  disabled={uploading}
                  onChange={(event) => setNote(event.target.value)}
                />
                <label htmlFor={draftId} className="flex cursor-pointer items-start gap-[10px] text-[14px]">
                  <input
                    id={draftId}
                    type="checkbox"
                    checked={draft}
                    disabled={uploading}
                    onChange={(event) => setDraft(event.target.checked)}
                    className="mt-[3px] accent-accent"
                  />
                  <span>
                    Save as a draft
                    <span className="block text-[12px] text-textMuted">
                      Only you can see it until you publish it; people with the link keep seeing the live version.
                    </span>
                  </span>
                </label>
              </>
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
            <div className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-textMuted">
                Cover image (optional)
              </span>
              <div className="flex flex-wrap items-center gap-[10px]">
                {/* a styled label instead of the browser's own file button,
                    whose text follows the browser's language */}
                <label
                  htmlFor={coverId}
                  className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40`}
                >
                  {cover ? 'Change image' : 'Choose an image'}
                  <input
                    id={coverId}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={uploading}
                    // cleared on open, so the same image can be picked again after "Remove"
                    onClick={(event) => {
                      event.currentTarget.value = '';
                    }}
                    onChange={(event) => chooseCover(event.target.files?.[0])}
                  />
                </label>
                {cover && (
                  <>
                    <span className="break-all text-[14px]">
                      {cover.name}{' '}
                      <span className="text-textMuted">
                        · {formatSize(cover.size)}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      disabled={uploading}
                      onClick={() => setCover(null)}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
              <p className="text-[12px] text-textMuted">
                PNG, JPEG or WebP up to {MAX_COVER_MB} MB, shown when the link
                is shared (1200×630 works best).
              </p>
            </div>
          </>
        )}

        {uploading ? (
          <div className="flex flex-col gap-[6px]" role="status">
            <div className="h-[8px] overflow-hidden rounded-full bg-bg">
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
          <Button type="submit" disabled={!file} className="self-start">
            {model ? (draft ? 'Save draft' : 'Publish version') : 'Publish'}
          </Button>
        )}
      </form>
    </Card>
  );
};
