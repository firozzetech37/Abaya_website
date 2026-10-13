'use client';

import { Loader2, X } from 'lucide-react';
import * as React from 'react';
import { FileDropzone } from '@/components/file-dropzone';
import { strings } from '@/content/strings';
import { errorMessage } from '@/lib/api-client';
import { type UploadPurpose, uploadImage } from '@/lib/upload';
import { cn } from '@/lib/utils';

interface Photo {
  key: string;
  name: string;
  preview: string;
  status: 'uploading' | 'done' | 'error';
  path?: string;
  error?: string;
}

/**
 * Uploads each chosen image straight away (signed URL, private bucket) and
 * reports the storage paths of the finished ones to the parent.
 */
export function PhotoPicker({
  purpose,
  via = 'admin',
  multiple = false,
  max = 10,
  onChange,
  onBusyChange,
  id,
}: {
  purpose: UploadPurpose;
  /** Workshop stations upload through /v1/workshop/uploads. */
  via?: 'admin' | 'workshop';
  multiple?: boolean;
  max?: number;
  onChange: (paths: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  id?: string;
}) {
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const photosRef = React.useRef<Photo[]>([]);

  function commit(next: Photo[]) {
    photosRef.current = next;
    setPhotos(next);
    onChange(next.filter((p) => p.status === 'done' && p.path).map((p) => p.path!));
    onBusyChange?.(next.some((p) => p.status === 'uploading'));
  }

  React.useEffect(
    () => () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.preview);
    },
    [],
  );

  async function add(files: File[]) {
    const room = multiple ? Math.max(0, max - photosRef.current.length) : 1;
    const chosen = files.slice(0, room);
    const base = multiple ? photosRef.current : [];
    if (!multiple) for (const p of photosRef.current) URL.revokeObjectURL(p.preview);
    const added: Photo[] = chosen.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      preview: URL.createObjectURL(f),
      status: 'uploading',
    }));
    commit([...base, ...added]);
    await Promise.all(
      chosen.map(async (file, i) => {
        const key = added[i]!.key;
        try {
          const path = await uploadImage(file, purpose, via);
          commit(
            photosRef.current.map((p) => (p.key === key ? { ...p, status: 'done', path } : p)),
          );
        } catch (e) {
          commit(
            photosRef.current.map((p) =>
              p.key === key ? { ...p, status: 'error', error: errorMessage(e) } : p,
            ),
          );
        }
      }),
    );
  }

  function remove(key: string) {
    const p = photosRef.current.find((x) => x.key === key);
    if (p) URL.revokeObjectURL(p.preview);
    commit(photosRef.current.filter((x) => x.key !== key));
  }

  const canAdd = multiple ? photos.length < max : photos.length === 0;

  return (
    <div className="space-y-2">
      {photos.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <li
              key={p.key}
              className={cn(
                'relative size-20 overflow-hidden rounded-md border bg-neutral-100',
                p.status === 'error' ? 'border-danger' : 'border-border',
              )}
            >
              {/* Local blob preview of the chosen file. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={p.name} className="size-full object-cover" />
              {p.status === 'uploading' ? (
                <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <Loader2
                    className="size-5 animate-spin text-accent-700"
                    aria-label={strings.common.uploading}
                  />
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => remove(p.key)}
                className="absolute right-0.5 top-0.5 rounded-full bg-white/90 p-0.5 shadow"
                aria-label={`${strings.common.remove} ${p.name}`}
              >
                <X className="size-3.5" />
              </button>
              {p.status === 'error' ? <span className="sr-only">{p.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {photos.some((p) => p.status === 'error') ? (
        <p role="alert" className="text-xs text-danger">
          {photos.find((p) => p.status === 'error')?.error ?? strings.common.uploadFailed}
        </p>
      ) : null}
      {canAdd ? (
        <FileDropzone id={id} multiple={multiple} onFiles={(f) => void add(f)} className="py-4" />
      ) : null}
    </div>
  );
}
