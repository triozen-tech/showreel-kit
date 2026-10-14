# Video-first engine

Scroll plays video. Frames are images, the picture is a pure function of scroll (any speed, back and forward).

1. **Frames**: `npm run film-frames -- --src raw/v1.mp4 --name <slug>-v1 --fps 24 --fmt webp --width 1600`
   (`--count N` for an exact frame count, `--fmt jpg`, `--start/--end`, `--quality`, `--delogo ""` to skip the Flow mark paint-out).
   Output: `public/frames/<name>/frame_0001.webp …` + `manifest.json` `{count, ext, width, height, pad, prefix, fps, times}`.
   Config-driven mode (`site/frames.json`, video time, phone sets) still works: `npm run film-frames [clip]`.
2. **One clip**: `<FrameScrub frames="/frames/<slug>-v1" />` inside a tall section with a sticky stage.
3. **Chain V1..Vn**: `<FrameScrub frames={["/frames/s-v1","/frames/s-v2"]} fade={0.04} />`; each clip gets a share of the scroll
   proportional to its frame count, with a crossfade on the join. `chainAt(counts, p, fade)` in `lib/chain.ts` is the pure helper.
4. Props: `section` / `start`+`end` (scroll range), `ease` (damping), `breath` (idle drift, 0 = off), `stillAt`, `hoverNudge`, `onHover`.
5. `?static=1` = one still frame, no motion. The OS reduce-motion setting is never read.
6. Test page: `/lab/scrub` (needs frames named `_test-v1`, `_test-v2`).
7. Size: a single file over 50 MB goes through Git LFS; 100 MB is GitHub's hard limit. No total repo-size rule.
