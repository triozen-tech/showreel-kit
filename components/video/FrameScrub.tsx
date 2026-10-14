"use client";

import { useEffect, useRef } from "react";
import { getManifest, loadFrames, type FrameManifest } from "@/lib/frames";
import { chainAt } from "@/lib/chain";
import { prefersReducedMotion } from "@/lib/gsap";

/**
 * FrameScrub: a scroll-driven image sequence (frames from `npm run film-frames`), video-first engine.
 *  - `frames`: one folder ("/frames/x-v1") or several (V1..Vn): they play one after another along the same scroll
 *    with a crossfade on each join (lib/chain.ts).
 *  - Scroll: the section's own scroll range (pin it: tall section + sticky stage; progress runs while it crosses the
 *    screen) or explicit `start` / `end` page positions in px. Progress is read every frame, so the picture is a pure
 *    function of the scroll position: any speed, a stop or scrolling back give the same frame.
 *  - Eased: the shown position chases the target with time-based damping (`ease`, higher = snappier).
 *  - Alive when idle: a tiny breath (slow scale + drift) never stops, even with the scroll still.
 *  - Loads clip 1 in order (first frame draws at once), later clips start when the previous one is in.
 *  - `?static=1` draws one still frame (`stillAt`, 0..1) and nothing moves. The OS reduce-motion setting is ignored.
 *  - `hover`: pass `onHover` to get enter/leave, and `hoverNudge` (progress, e.g. 0.01) to push the picture on hover.
 */
export type FrameScrubProps = {
  frames: string | string[];
  /** Section whose scroll range drives it; default: the canvas's closest <section>, else its parent. */
  section?: React.RefObject<HTMLElement | null>;
  /** Explicit page scroll range in px (instead of the section). */
  start?: number;
  end?: number;
  fit?: "cover" | "contain";
  fade?: number;
  ease?: number;
  breath?: number;
  stillAt?: number;
  hoverNudge?: number;
  onHover?: (hovering: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
};

/** Like lib/frames drawFit but without clearing the canvas, so crossfaded layers stack. */
function drawFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, fit: "cover" | "contain") {
  const ir = img.naturalWidth / img.naturalHeight;
  const byWidth = fit === "cover" ? w / h > ir : w / h < ir;
  const dw = byWidth ? w : h * ir;
  const dh = byWidth ? w / ir : h;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export default function FrameScrub({
  frames, section, start, end, fit = "cover", fade = 0.04, ease = 9, breath = 1, stillAt = 0.12, hoverNudge = 0, onHover, className, style,
}: FrameScrubProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hovering = useRef(false);
  const folders = Array.isArray(frames) ? frames : [frames];
  const key = folders.join("|");

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const still = prefersReducedMotion();
    const fs = key.split("|");
    const mans: (FrameManifest | null)[] = fs.map(() => null);
    const sets: (ReturnType<typeof loadFrames> | null)[] = fs.map(() => null);
    let cancelled = false;
    let raf = 0;
    let dirty = true;
    let shown = -1; // eased progress; -1 = not placed yet
    let last = performance.now();

    // clips load one after the other: clip 1 first (its first frame draws at once), the rest when it is in
    const boot = (k: number) => {
      if (cancelled || k >= fs.length) return;
      getManifest(fs[k])
        .then((m) => {
          if (cancelled) return;
          mans[k] = m;
          sets[k] = loadFrames(fs[k], m, (loaded, total) => {
            dirty = true;
            if (loaded === total) boot(k + 1);
          });
        })
        .catch((e) => { console.warn(e.message); boot(k + 1); });
    };
    boot(0);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      dirty = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const el = () => section?.current ?? cv.closest("section") ?? cv.parentElement;
    const target = () => {
      if (still) return stillAt;
      const y = window.scrollY;
      if (start !== undefined && end !== undefined) return (y - start) / Math.max(1, end - start);
      const node = el();
      if (!node) return 0;
      const r = node.getBoundingClientRect();
      const run = r.height - window.innerHeight;
      return run > 1 ? -r.top / run : (window.innerHeight - r.top) / (window.innerHeight + r.height);
    };

    const draw = (time: number) => {
      const counts = mans.map((m) => m?.count ?? 0);
      if (counts.some((c) => !c)) {
        // not all manifests are in yet: play what exists as a chain of the known clips
        const known = counts.map((c, i) => [c, i]).filter(([c]) => c);
        if (!known.length) return;
        counts.splice(0, counts.length, ...known.map(([c]) => c));
        const idx = known.map(([, i]) => i);
        return paint(chainAt(counts, shown, fade).map((l) => ({ ...l, clip: idx[l.clip] })), time);
      }
      paint(chainAt(counts, shown, fade), time);
    };
    const paint = (layers: ReturnType<typeof chainAt>, time: number) => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      const t = time / 1000;
      // idle breath: slow scale + drift, never frozen (off in ?static=1)
      const b = still ? 0 : breath;
      const sc = 1 + 0.006 * b * (1 + Math.sin(t * 0.7)) / 2 + 0.004 * b;
      const dx = Math.sin(t * 0.45) * 0.0025 * b * cv.width;
      const dy = Math.cos(t * 0.37) * 0.002 * b * cv.height;
      ctx.save();
      ctx.translate(cv.width / 2 + dx, cv.height / 2 + dy);
      ctx.scale(sc, sc);
      ctx.translate(-cv.width / 2, -cv.height / 2);
      for (const l of layers) {
        const set = sets[l.clip];
        if (!set) continue;
        const f0 = Math.floor(l.frame), f1 = Math.min(f0 + 1, (mans[l.clip]!.count) - 1), m = l.frame - f0;
        ctx.globalAlpha = l.alpha;
        const a = set.get(f0);
        if (a) drawFit(ctx, a, cv.width, cv.height, fit);
        const bImg = m > 0.02 && f1 !== f0 ? set.get(f1) : undefined;
        if (bImg && bImg !== a) {
          ctx.globalAlpha = l.alpha * m;
          drawFit(ctx, bImg, cv.width, cv.height, fit);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const want = Math.min(1, Math.max(0, target() + (hovering.current ? hoverNudge : 0)));
      if (shown < 0 || still) shown = want;
      else shown += (want - shown) * (1 - Math.exp(-ease * dt));
      if (Math.abs(want - shown) < 1e-5) shown = want;
      if (still && !dirty) return;
      draw(now);
      dirty = false;
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      sets.forEach((s) => s?.cancel());
    };
  }, [key, section, start, end, fit, fade, ease, breath, stillAt, hoverNudge]);

  return (
    <canvas
      ref={canvas}
      className={className ?? "absolute inset-0 h-full w-full"}
      style={style}
      onPointerEnter={() => { hovering.current = true; onHover?.(true); }}
      onPointerLeave={() => { hovering.current = false; onHover?.(false); }}
    />
  );
}
