// Chain helper: plays clips V1..Vn one after another along ONE scroll progress (0..1), crossfading on every join.
// Pure function of the progress, so any scroll speed, a stop or scrolling back gives the same picture.

export type ChainLayer = { clip: number; frame: number; alpha: number };

/**
 * chainAt(counts, p, fade) → the layers to draw (1 layer, or 2 during a join; draw in order, each with its alpha).
 *  counts  frame count of each clip
 *  p       scroll progress 0..1 over the whole chain; each clip gets a share of it proportional to its frame count
 *  fade    crossfade length as a fraction of the whole chain (default 0.04); the join is centred on the clip boundary
 * `frame` is fractional (0..count-1): draw floor/ceil blended for smoothness.
 */
export function chainAt(counts: number[], p: number, fade = 0.04): ChainLayer[] {
  const n = counts.length;
  const total = counts.reduce((a, b) => a + b, 0);
  const x = Math.min(1, Math.max(0, p));
  const edges: number[] = [0];
  counts.forEach((c) => edges.push(edges[edges.length - 1] + c / total));
  let i = edges.findIndex((e, k) => k > 0 && x <= e) - 1;
  if (i < 0) i = n - 1;
  const at = (clip: number, q: number): ChainLayer => {
    const span = edges[clip + 1] - edges[clip];
    const t = Math.min(1, Math.max(0, (q - edges[clip]) / span));
    return { clip, frame: t * (counts[clip] - 1), alpha: 1 };
  };
  const half = fade / 2;
  const layers: ChainLayer[] = [];
  const nextEdge = edges[i + 1];
  const prevEdge = edges[i];
  if (i < n - 1 && x > nextEdge - half) {
    const m = (x - (nextEdge - half)) / fade;
    const s = m * m * (3 - 2 * m);
    layers.push(at(i, x), { ...at(i + 1, x), alpha: s });
  } else if (i > 0 && x < prevEdge + half) {
    const m = (x - (prevEdge - half)) / fade;
    const s = m * m * (3 - 2 * m);
    layers.push(at(i - 1, x), { ...at(i, x), alpha: s });
  } else layers.push(at(i, x));
  return layers;
}
