'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Camera, RefreshCw, RotateCcw, SwitchCamera, Timer, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStrings } from '@/components/i18n/locale-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TIMERS = [0, 3, 10] as const;
type Facing = 'user' | 'environment';

/** Can this browser open the camera inside the page? (Needs HTTPS or localhost.) */
export const canUseCamera = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * "Take a photo" for the try-on: the camera inside the page, with a full-body outline to stand in,
 * front or back camera, and a self-timer (3 or 10 seconds) so she can prop the phone up and step
 * back. She sees the still and keeps it or retakes it. The photo is only kept in this tab until
 * she presses "Try it on" (like a chosen photo). The camera stops as soon as the window closes.
 */
export function CameraCapture({ open, onClose, onPhoto, onChooseInstead }: { open: boolean; onClose: () => void; onPhoto: (file: File) => void; onChooseInstead: () => void }) {
  const { tryOn } = useStrings();
  const t = tryOn.camera;
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>('environment');
  const [state, setState] = useState<'starting' | 'live' | 'denied'>('starting');
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(3);
  const [count, setCount] = useState(0);
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [cameras, setCameras] = useState(1);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  }, []);

  // Start (or switch) the camera while the window is open and no still is shown.
  useEffect(() => {
    if (!open || shot) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop());
        stop();
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        setState('live');
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setCameras(devices.filter((d) => d.kind === 'videoinput').length || 1);
      })
      .catch(() => !cancelled && setState('denied'));
    return () => {
      cancelled = true;
    };
  }, [open, facing, shot, stop]);

  // Stop the camera when the window closes.
  useEffect(() => {
    if (!open) stop();
    return stop;
  }, [open, stop]);

  const snap = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // The preview of the front camera is mirrored; the photo is not (as she really looks).
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setShot({ file, url: URL.createObjectURL(blob) });
        stop();
      },
      'image/jpeg',
      0.92,
    );
  }, [stop]);

  // The self-timer counts down, then takes the photo.
  useEffect(() => {
    if (count <= 0) return;
    const id = window.setTimeout(() => {
      if (count === 1) snap();
      setCount((c) => c - 1);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [count, snap]);

  const close = () => {
    setCount(0);
    setState('starting');
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    stop();
    onClose();
  };
  const retake = () => {
    setState('starting');
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[60] mx-auto flex max-w-md flex-col bg-neutral-950 text-white focus:outline-none sm:inset-y-6 sm:overflow-hidden sm:rounded-[1.75rem]"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <DialogPrimitive.Title className="font-display text-xl">{t.title}</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label={t.close} className="inline-flex size-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div className="relative mx-3 flex-1 overflow-hidden rounded-2xl bg-black">
            {shot ? (
              // eslint-disable-next-line @next/next/no-img-element -- her photo, from memory only
              <img src={shot.url} alt="" className="size-full object-contain" />
            ) : (
              <>
                <video ref={video} playsInline muted className={cn('size-full object-cover', facing === 'user' && '-scale-x-100')} />
                {/* The full-body outline to stand in */}
                {state === 'live' && (
                  <svg aria-hidden viewBox="0 0 100 160" className="pointer-events-none absolute inset-0 m-auto h-[88%] w-auto text-gold-200/80" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 2.5">
                    <circle cx="50" cy="16" r="9" />
                    <path d="M33 34c4-6 30-6 34 0l6 30-6 2-3-20v56l4 52H55l-5-44-5 44H32l4-52V46l-3 20-6-2 6-30Z" />
                  </svg>
                )}
                {state === 'starting' && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">{t.starting}</p>}
                {state === 'denied' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                    <p className="text-sm leading-relaxed text-white/80">{t.denied}</p>
                    <Button variant="gold" onClick={onChooseInstead}>
                      {t.chooseInstead}
                    </Button>
                  </div>
                )}
                {count > 0 && (
                  <span aria-live="assertive" className="absolute inset-0 flex items-center justify-center font-display text-8xl text-gold-100 drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
                    {count}
                  </span>
                )}
              </>
            )}
          </div>

          {shot ? (
            <div className="flex gap-3 p-4">
              <Button variant="secondary" className="flex-1 border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={retake}>
                <RotateCcw aria-hidden />
                {t.retake}
              </Button>
              <Button
                variant="gold"
                className="flex-1"
                onClick={() => {
                  onPhoto(shot.file);
                  setShot(null);
                  setState('starting');
                  onClose();
                }}
              >
                {t.use}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              <p className="text-center text-xs text-white/70">{t.hint}</p>
              <div className="flex items-center justify-between">
                {/* Self-timer */}
                <div role="radiogroup" aria-label={t.timer} className="flex items-center gap-1 rounded-full bg-white/10 p-1">
                  <Timer className="mx-1 size-4 text-gold-200" aria-hidden />
                  {TIMERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={timer === s}
                      onClick={() => setTimer(s)}
                      className={cn('h-8 min-w-9 rounded-full px-2 text-xs font-medium', timer === s ? 'bg-gold-300 text-accent-950' : 'text-white/80 hover:bg-white/10')}
                    >
                      {s === 0 ? t.timerOff : `${s}s`}
                    </button>
                  ))}
                </div>
                {/* Shutter */}
                <button
                  type="button"
                  disabled={state !== 'live' || count > 0}
                  onClick={() => (timer ? setCount(timer) : snap())}
                  aria-label={t.capture}
                  className="flex size-16 items-center justify-center rounded-full border-4 border-white bg-[linear-gradient(160deg,#E9D49A_0%,#CCA24A_55%,#B48734_100%)] text-accent-950 shadow-lg transition-transform active:scale-95 disabled:opacity-40"
                >
                  <Camera className="size-6" aria-hidden />
                </button>
                {/* Front / back camera */}
                <button
                  type="button"
                  disabled={cameras < 2 && facing === 'environment' ? false : state !== 'live'}
                  onClick={() => {
                    setState('starting');
                    setFacing((f) => (f === 'user' ? 'environment' : 'user'));
                  }}
                  aria-label={t.switchCamera}
                  className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
                >
                  {cameras > 1 ? <SwitchCamera className="size-5" aria-hidden /> : <RefreshCw className="size-5" aria-hidden />}
                </button>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
