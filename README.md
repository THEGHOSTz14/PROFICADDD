# OpenDraft — 2D CAD

A browser-based 2D drafting editor in plain TypeScript — no framework, no runtime
dependency, no npm install. Started as a "just for fun" way to find out how much of a CAD
editor is actually needed before it starts to feel like one.

Entities, layers, multi-page drawings, mutation-based undo and object snapping, rendered
to a 2D canvas.

## What's in it

- **Draw tools** — line, polyline, arc, circle, ellipse, rectangle, spline and text, each
  on a single-key shortcut (`L` `P` `A` `C` `E` `R` `S` `T`), with `V` for select
- **Modify tools** — move, copy, rotate, mirror, scale, offset, trim and erase (`M` `K`
  `O` `I` `F` `U` `B` `X`), plus delete and full undo / redo
- **Entities** — every entity carries an `EntityStyle` and a linetype; dash patterns are
  resolved at draw time by `linetypeDash`
- **Layers** — entities belong to a layer via `layerId`, the layer supplies a colour which
  an entity can override, and a layer manager handles add and delete
- **Sheets and units** — `PageManager` holds multiple named pages with a page size (A4 and
  friends) and a unit selector, and a boundary rectangle shows the sheet edges
- **Object snapping** — seven snap kinds: `endpoint`, `midpoint`, `center`, `quadrant`,
  `nearest`, `intersection` and `grid`, resolved by `snapPoint` / `entitiesNear` /
  `entityIntersections` and shown as on-canvas snap markers while you drag. Grid snap,
  OSnap and an Ortho mode are independent toggles with a configurable grid size
- **Selection and feedback** — click, rubber-band window via `Marquee`, or drag geometry
  directly; `Preview` ghosts the entity you are placing and the status bar reports the
  active tool, selection count and last length and angle
- **Export** — save the document, or export the drawing to **PNG, SVG or PDF**
- **Editor core** — `Editor` is UI-agnostic, driven by `EditorSettings` and `EditorHooks`;
  `src/main.ts` wires it to the DOM with plain `document.createElement` calls and imports
  nothing, which keeps the model testable on its own

**Live demo:** <https://theghostz14.github.io/PROFICADDD/>

## Build

```bash
bash build.sh
```

Type-checks with `tsc --noEmit -p tsconfig.json`, then bundles `src/main.ts` with esbuild
into `dist/bundle.js` (IIFE, ES2022, source map). Open `index.html` afterwards.

Both tools are vendored under `.tools/`, so there is nothing to install. If your shell has
no `node` on `PATH`, point the script at any Node-compatible binary:

```bash
NODE=/path/to/node bash build.sh
```

## Layout

| Path | Purpose |
| --- | --- |
| `index.html` | page shell, loads `dist/bundle.js` |
| `app.css` | UI styling |
| `src/main.ts` | DOM wiring, toolbar and canvas events |
| `src/core/document.ts` | document model |
| `src/core/editor.ts` | `Editor`, `EditorSettings`, `EditorHooks` |
| `src/core/entities.ts` | entity types, styles, linetypes, layers |
| `src/core/edits.ts` | edit operations |
| `src/core/history.ts` | mutation-based undo / redo |
| `src/core/pages.ts` | multi-page management |
| `src/core/renderer.ts` | canvas drawing, marquee and preview |
| `src/core/snapping.ts` | the seven snap kinds |
| `build.sh` | typecheck + bundle |

## Status

Personal project, still moving. The parts worth the attention are the snap resolution and
keeping undo cheap by storing mutations instead of whole documents.
