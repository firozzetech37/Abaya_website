'use client';

import { useEffect, useRef } from 'react';

/** Device pixels per CSS pixel the cloth draws at (also used by scripts/render-curtain-still.mjs). */
export const CLOTH_SCALE = { desktop: 1.5, phone: 0.75 } as const;

/** What the loader animates each frame; the cloth reads it, never owns it. */
export interface CurtainMotion {
  /** 0 closed → 1 gathered to the sides (eased). */
  open: number;
  /** A brief tightening of the folds just before the pull, 0 → 1 → 0. */
  tug: number;
  /** 0 → 1 over the last moments: the gathered panels are drawn off into the wings. */
  fade: number;
}

/**
 * Two velvet curtains drawn by one fragment shader (no geometry): pinch-pleated at the heading,
 * falling into wide uneven folds lit from the upper left, a velvet sheen at the grazing angles,
 * deep valleys, a twisted gold braid down each leading edge and a fringe of swinging threads
 * along the hem. While closed the cloth breathes in a draught and leans towards the pointer,
 * and a hover sends a ripple out. Gathering compresses the folds and lets the leading edge lag;
 * the gap simply shows the page beyond, with no light or glow of its own.
 * Calls `onReady` after the first frame (so the pre-rendered still underneath can hand over)
 * and `onUnsupported` where WebGL is missing. `scripts/render-curtain-still.mjs` renders the
 * closed curtain from this same shader into public/curtain/*.webp.
 */
export function CurtainCloth({ motion, onReady, onUnsupported }: { motion: React.MutableRefObject<CurtainMotion>; onReady: () => void; onUnsupported: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: 0.5, y: 0.5 });
  const ripple = useRef({ x: 0.5, y: 0.5, at: -10 });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = el.getContext('webgl', { premultipliedAlpha: false, antialias: false, alpha: true });
    if (!gl) {
      onUnsupported();
      return;
    }
    const program = gl.createProgram()!;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      gl.attachShader(program, sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) as boolean;
    };
    const ok = compile(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}') && compile(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.linkProgram(program);
    if (!ok || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
      onUnsupported();
      return;
    }
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(program, name);
    const uRes = u('u_res');
    const uTime = u('u_time');
    const uOpen = u('u_open');
    const uTug = u('u_tug');
    const uFade = u('u_fade');
    const uPointer = u('u_pointer');
    const uRipple = u('u_ripple');
    const uScale = u('u_scale');
    const uStill = u('u_still');

    // Phones draw at 0.75×, everything else at up to 1.5×: the cloth is soft anyway. The stills in
    // public/curtain are rendered at these same scales so the handover is pixel-for-pixel.
    const scale = Math.min(window.devicePixelRatio || 1, window.innerWidth < 640 ? CLOTH_SCALE.phone : CLOTH_SCALE.desktop);
    const resize = () => {
      el.width = Math.round(el.clientWidth * scale);
      el.height = Math.round(el.clientHeight * scale);
      gl.viewport(0, 0, el.width, el.height);
    };
    gl.uniform1f(uScale, scale);
    gl.uniform1f(uStill, 0);
    resize();
    window.addEventListener('resize', resize);

    const start = performance.now() / 1000;
    const onMove = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = 1 - e.clientY / window.innerHeight;
      pointer.current = { x, y };
      // A ripple from the spot under the pointer, at most every 150 ms.
      const now = performance.now() / 1000 - start;
      if (now - ripple.current.at > 0.15) ripple.current = { x, y, at: now };
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    let frame = 0;
    let first = true;
    const draw = () => {
      const t = performance.now() / 1000 - start;
      const m = motion.current;
      gl.uniform2f(uRes, el.width, el.height);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uOpen, m.open);
      gl.uniform1f(uTug, m.tug);
      gl.uniform1f(uFade, m.fade);
      gl.uniform2f(uPointer, pointer.current.x, pointer.current.y);
      gl.uniform3f(uRipple, ripple.current.x, ripple.current.y, ripple.current.at);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (first) {
        first = false;
        onReady();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [motion, onReady, onUnsupported]);

  return <canvas ref={canvas} aria-hidden className="curtain-cloth absolute inset-0 h-full w-full" />;
}

const FRAGMENT = /* glsl */ `
precision highp float;
uniform vec2 u_res; uniform float u_time; uniform float u_open; uniform float u_tug; uniform float u_fade;
uniform vec2 u_pointer; uniform vec3 u_ripple;
uniform float u_scale;   // device pixels per CSS pixel (so thread pitch etc. match across screens and the pre-rendered still)
uniform float u_still;   // 1 when rendering the still image: no per-pixel grain (it would not compress)
const vec3 BASE  = vec3(0.45, 0.12, 0.17);   // burgundy velvet
const vec3 DEEP  = vec3(0.15, 0.035, 0.065); // the valleys
const vec3 GOLD  = vec3(0.84, 0.66, 0.30);
const vec3 GOLDL = vec3(0.99, 0.91, 0.68);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  float t = u_time;
  // The cloth wakes gently: its motion starts from the still's pose (time 0) and eases in over the first seconds,
  // so the hand-over from the pre-rendered still is seamless.
  float te = t * smoothstep(0.0, 2.5, t);
  float o = u_open;
  float y = uv.y;
  // Closed, the right drape lies over the left at the centre seam; each panel gathers to a narrow bunch.
  float seam = 0.012 * (1.0 - o);
  bool left = uv.x < 0.5 - seam;
  float w = mix(0.512, 0.055, o);
  // At the very end the gathered bunch is drawn off into the wings.
  float xr = (left ? uv.x : 1.0 - uv.x) + u_fade * 0.1;   // distance in from the wall
  float u = clamp(xr / w, 0.0, 1.0);                   // 0 at the wall, 1 at the leading edge
  float inside = step(xr, w);
  float pull = o * (1.0 - o) * 4.0;                    // strongest mid-gather

  // ---- cloth motion: breathing in a draught (the hem swings most), the pointer's lean, a ripple, the drag of the pull
  float breathe = sin(y * 2.6 + te * 0.7 + xr * 1.5) * 0.045 + sin(y * 6.5 - te * 1.1 + xr * 5.0) * 0.02;
  breathe *= 0.2 + 0.8 * (1.0 - y);
  float lean = (u_pointer.x - 0.5) * 0.07 * (1.0 - y);
  float d = distance(vec2(uv.x * aspect, y), vec2(u_ripple.x * aspect, u_ripple.y));
  float age = t - u_ripple.z;
  float ripple = age > 0.0 && age < 2.5 ? sin(d * 26.0 - age * 8.0) * exp(-d * 3.2) * exp(-age * 1.7) * 0.06 : 0.0;
  float drag = (pull * 0.08 + u_tug * 0.03) * (1.0 - y) * u;

  // ---- folds: pinch-pleated at the heading, wide uneven folds below, compressing as the panel gathers
  float folds = mix(7.0, 24.0, o) + u_tug * 1.5;
  float heading = smoothstep(0.78, 1.0, y);
  float un = u + 0.025 * sin(u * 19.0 + 1.7) + 0.015 * sin(u * 41.0 + 0.4);
  float phase = un * folds * 6.2832 * (1.0 + 0.9 * heading)
              + (breathe + lean + ripple + drag) * 7.0
              + 0.35 * sin(y * 2.2 + u * 2.0)
              + o * 2.0;
  float amp = 0.65 + 0.35 * sin(un * 5.3 + 0.7) * sin(un * 2.1 + y);   // some folds deep, some shallow
  float profile = cos(phase) * amp;                     // +1 on a ridge, -1 in a valley
  float slope = -sin(phase) * amp;

  // ---- lighting: a key light upper left, a soft fill from the centre, velvet sheen at the grazing angles
  vec3 n = normalize(vec3(slope * 1.6, 0.25, 1.0));
  vec3 keyDir = normalize(vec3(-0.5, 0.6, 0.65));
  vec3 fillDir = normalize(vec3(left ? 1.0 : -1.0, 0.1, 0.5));
  float diff = max(dot(n, keyDir), 0.0);
  float fill = max(dot(n, fillDir), 0.0) * 0.15;
  float rim = pow(1.0 - abs(n.z), 1.6);
  float ao = 0.55 + 0.45 * smoothstep(-1.0, 0.6, profile);
  vec3 col = mix(DEEP, BASE, ao);
  col *= 0.45 + 0.75 * diff;
  col += BASE * fill * 0.6 * vec3(1.0, 0.9, 0.8);
  col += vec3(0.95, 0.75, 0.7) * rim * 0.22 * ao;
  col += vec3(1.0, 0.9, 0.85) * pow(max(dot(reflect(-keyDir, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0) * 0.12;
  col *= mix(0.95 + 0.1 * noise(gl_FragCoord.xy * 0.9), 1.0, u_still);   // the pile
  // A slow sheen passing over the velvet while the curtains hang closed
  float sheenX = 0.5 + 0.62 * sin(te * 0.22);
  col += vec3(1.0, 0.9, 0.84) * 0.07 * exp(-pow((uv.x - sheenX) / 0.14, 2.0)) * (0.4 + 0.6 * max(profile, 0.0)) * (1.0 - o);
  col *= mix(0.96 + 0.08 * (hash(floor(gl_FragCoord.xy / 1.3)) - 0.5), 1.0, u_still);   // the weave
  col *= 0.7 + 0.3 * smoothstep(1.0, 0.86, y);                        // under the valance
  col *= 0.8 + 0.2 * smoothstep(0.0, 0.18, y);                        // towards the floor
  col *= 1.0 - 0.45 * smoothstep(0.9, 1.0, u) * (1.0 - 0.7 * o);      // the leading edge turns away
  col *= 1.0 - 0.4 * smoothstep(0.1, 0.0, u);                         // gathered against the wall
  col *= 1.0 - 0.55 * (left ? 1.0 : 0.0) * exp(-max(0.5 - seam - uv.x, 0.0) / 0.012) * (1.0 - o);   // the right drape's shadow on the left

  // ---- the twisted gold braid down the leading edge
  float braidW = 0.011 / w;
  float braid = smoothstep(1.0 - braidW, 1.0 - braidW + 0.003 / w, u);
  float braidTex = 0.6 + 0.4 * sin(y * 220.0 + sin(y * 40.0) * 2.0);
  col = mix(col, GOLD * braidTex * (0.7 + 0.3 * diff), braid * 0.92);

  // ---- hem tape and fringe: threads hanging to the floor, swinging a beat behind the cloth
  float hemTop = 0.085 + 0.012 * profile + breathe * 0.3 + u_tug * 0.012;
  float cssW = u_res.x / max(u_scale, 0.5);
  // A fixed number of strands across the stage (fewer on phones), so the still and the live cloth share them whatever the width.
  float strands = cssW < 864.0 ? 60.0 : 131.0;
  float pitch = cssW / strands;                          // CSS px between strands
  float threadId = floor(xr * cssW / pitch);
  float tj = hash(vec2(threadId, 1.0));
  float threadSway = sin(te * 1.6 + threadId * 0.9 + y * 5.0) * 0.0022 * (1.0 + pull * 2.5);
  float threadX = fract(xr * cssW / pitch + threadSway * cssW / pitch);
  float thread = smoothstep(0.08, 0.4, threadX) * smoothstep(0.92, 0.6, threadX);
  thread *= 0.75 + 0.25 * sin(y * 90.0 + threadId * 1.3 + te * 1.2);   // the twist of each strand
  float len = hemTop * (0.86 + 0.14 * tj);
  float inFringe = smoothstep(hemTop, hemTop - 0.003, y) * step(hemTop - len, y);
  vec3 fringeCol = mix(GOLD * 0.75, GOLDL, thread * (0.45 + 0.55 * tj)) * (0.8 + 0.2 * profile);
  col = mix(col, mix(GOLD * 0.3, fringeCol, thread), inFringe);
  float band = smoothstep(0.009, 0.0, abs(y - hemTop - 0.004));
  col = mix(col, GOLD * (0.8 + 0.3 * sin(xr * 170.0)) * (0.7 + 0.3 * diff), band);

  // ---- the gap: nothing of its own; the cloth simply draws aside and the page beyond shows through
  float alpha = inside * (1.0 - smoothstep(0.75, 1.0, u_fade));
  gl_FragColor = vec4(col, alpha);
}
`;
