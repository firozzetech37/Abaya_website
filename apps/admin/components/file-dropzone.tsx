'use client';

import { Upload } from 'lucide-react';
import * as React from 'react';
import { strings } from '@/content/strings';
import { ACCEPTED_IMAGE_TYPES } from '@/lib/upload';
import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  hint?: string;
  className?: string;
  id?: string;
}

/** Drag-and-drop or click/keyboard to choose images. */
export function FileDropzone({ onFiles, multiple = true, disabled, busy, label, hint, className, id }: FileDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  function take(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    onFiles(multiple ? files : files.slice(0, 1));
  }

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
        dragging ? 'border-accent-500 bg-accent-50' : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400',
        (disabled || busy) && 'pointer-events-none opacity-60',
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files);
      }}
    >
      <Upload className="size-5 text-neutral-500" aria-hidden />
      <button
        type="button"
        id={id}
        className="text-sm font-medium text-accent-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? strings.common.uploading : (label ?? strings.common.dropHere)}
      </button>
      <p className="text-xs text-muted">{hint ?? strings.common.dropHint}</p>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple={multiple}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
