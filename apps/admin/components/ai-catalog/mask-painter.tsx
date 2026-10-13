'use client';

import { Eraser } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { strings } from '@/content/strings';

const t = strings.aiCatalog;

export interface MaskPainterHandle {
  /** The painted area as a black/white PNG the size of the source image, or null if nothing painted. */
  toFile: () => Promise<File | null>;
  clear: () => void;
}

/**
 * Paint over the part of the image to change. FASHN's edit mask: white = change here,
 * black = keep; it must be the same size as the source image, so the canvas uses the
 * image's natural size (the image itself is never drawn, so it stays a plain signed link).
 */
export const MaskPainter = React.forwardRef<
  MaskPainterHandle,
  { src: string; onPaintedChange?: (painted: boolean) => void }
>(function MaskPainter({ src, onPaintedChange }, ref) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const [brush, setBrush] = React.useState(6);
  const drawing = React.useRef(false);
  const painted = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  };

  const stroke = (to: { x: number; y: number }) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !size) return;
    ctx.strokeStyle = 'rgba(225, 29, 72, 0.55)';
    ctx.fillStyle = 'rgba(225, 29, 72, 0.55)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = (brush / 100) * size.w;
    const from = last.current ?? to;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    last.current = to;
    if (!painted.current) {
      painted.current = true;
      onPaintedChange?.(true);
    }
  };

  React.useImperativeHandle(ref, () => ({
    clear() {
      const c = canvas.current;
      c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
      painted.current = false;
      onPaintedChange?.(false);
    },
    async toFile() {
      const c = canvas.current;
      if (!c || !painted.current) return null;
      // Black everywhere, white where painted.
      const out = document.createElement('canvas');
      out.width = c.width;
      out.height = c.height;
      const ctx = out.getContext('2d')!;
      ctx.drawImage(c, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, out.width, out.height);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
      return blob ? new File([blob], 'mask.png', { type: 'image/png' }) : null;
    },
  }));

  return (
    <div className="space-y-2">
      <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-lg ring-1 ring-border">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL; sizes the canvas */}
        <img
          src={src}
          alt=""
          className="block w-full select-none"
          draggable={false}
          onLoad={(e) =>
            setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
        />
        {size ? (
          <canvas
            ref={canvas}
            width={size.w}
            height={size.h}
            className="absolute inset-0 size-full cursor-crosshair touch-none"
            onPointerDown={(e) => {
              drawing.current = true;
              last.current = null;
              e.currentTarget.setPointerCapture(e.pointerId);
              stroke(point(e));
            }}
            onPointerMove={(e) => drawing.current && stroke(point(e))}
            onPointerUp={() => {
              drawing.current = false;
              last.current = null;
            }}
          />
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <Label htmlFor="brush" className="shrink-0">
          {t.brush}
        </Label>
        <input
          id="brush"
          type="range"
          min={2}
          max={16}
          value={brush}
          onChange={(e) => setBrush(Number(e.target.value))}
          className="w-full accent-accent-700"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            const c = canvas.current;
            c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
            painted.current = false;
            onPaintedChange?.(false);
          }}
        >
          <Eraser className="size-4" aria-hidden /> {t.clearMask}
        </Button>
      </div>
    </div>
  );
});
