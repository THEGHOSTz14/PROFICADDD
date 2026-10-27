import { BBox, Vec2 } from './vec';
import { Entity, Linetype, TEXT_FONT, TextEntity, flatten } from './entities';
import { Document } from './document';
import { View } from './view';
import { SnapMark, entityBox } from './snapping';

export interface Preview {
  /** Geometry already fixed by the tool, drawn as if committed. */
  entities: Entity[];
  /** Dashed guide from the last fixed point to the cursor. */
  rubber: Vec2[];
  /** Centre marker for circle and arc style tools. */
  anchor?: Vec2 | null;
}

export interface Marquee {
  a: Vec2;
  b: Vec2;
  /** Crossing selection when dragged right-to-left. */
  crossing: boolean;
}

export interface RenderState {
  view: View;
  doc: Document;
  showGrid: boolean;
  gridStep: number;
  selection: ReadonlySet<string>;
  hoverId: string | null;
  preview: Preview | null;
  snapMark: SnapMark | null;
  marquee: Marquee | null;
}

const PAPER = '#ffffff';
const GRID_MINOR = '#edf0f4';
const GRID_MAJOR = '#d5dce5';
const AXIS_X = '#e07a7a';
const AXIS_Y = '#7ab66a';
const INK = '#20262e';
const SELECTED = '#1f8fff';
const HOVER = '#f2a33c';
const RUBBER = '#2c7be0';
const MARK = '#d6336c';

/** Screen-space dash patterns, so a dashed layer reads the same at any zoom. */
export function linetypeDash(type: Linetype): number[] {
  switch (type) {
    case 'dashed':
      return [9, 5];
    case 'dotted':
      return [1.5, 4];
    case 'dashdot':
      return [12, 5, 2, 5];
    case 'centre':
      return [16, 5, 3, 5];
    case 'continuous':
      return [];
  }
}

/** Paper line weight in mm mapped to a device-independent pixel width. */
function weightToPixels(mm: number): number {
  return Math.min(12, Math.max(1.2, mm * 4.5));
}

export class Renderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(state: RenderState): void {
    const { ctx } = this;
    const { view } = state;
    const dpr = ctx.canvas.width / Math.max(1, view.width);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, view.width, view.height);

    if (state.showGrid) drawGrid(ctx, state, dpr);

    // Page boundary box — drawn behind entities so geometry is always visible.
    const pageBox = state.doc.pageBoundary();
    if (pageBox) {
      const a = view.toScreen(pageBox.min);
      const b = view.toScreen(pageBox.max);
      ctx.save();
      ctx.strokeStyle = '#c0a060';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
      ctx.restore();
    }

    const visible = view.visibleWorldBox();
    const tol = Math.max(view.pixelsToWorld(0.25), 1e-6);

    for (const e of state.doc.visibleEntities()) {
      if (!bboxIntersects(entityBox(e), visible)) continue;
      const layer = state.doc.layer(e.layerId);
      const selected = state.selection.has(e.id);
      const hovered = state.hoverId === e.id && !selected;
      this.drawEntity(e, {
        color: layer ? layer.color : INK,
        lineweight: layer ? layer.lineweight : 0.25,
        linetype: layer ? layer.linetype : 'continuous',
        view,
        tol,
        emphasis: selected ? SELECTED : hovered ? HOVER : null,
        selected,
      });
    }

    if (state.preview) this.drawPreview(state, tol);
    if (state.snapMark) drawSnapMark(ctx, state.snapMark, view);
    if (state.marquee) drawMarquee(ctx, state.marquee);

    ctx.restore();
  }

  private drawEntity(
    e: Entity,
    o: {
      color: string;
      lineweight: number;
      linetype: Linetype;
      view: View;
      tol: number;
      emphasis: string | null;
      selected: boolean;
    }
  ): void {
    const { ctx } = this;
    const { view } = o;
    ctx.save();
    ctx.strokeStyle = o.emphasis ?? e.color ?? o.color;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = weightToPixels(e.lineweight ?? o.lineweight) + (o.selected ? 1 : 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(linetypeDash(e.linetype ?? o.linetype));

    if (e.kind === 'text') {
      drawText(ctx, e, view);
      ctx.restore();
      return;
    }

    if (e.kind === 'circle') {
      const c = view.toScreen(e.center);
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(0.1, e.radius * view.zoom), 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.kind === 'arc') {
      const c = view.toScreen(e.center);
      ctx.beginPath();
      // World is +Y up and canvas is +Y down: negate angles and reverse direction.
      ctx.arc(c.x, c.y, Math.max(0.1, e.radius * view.zoom), -e.start, -e.end, true);
      ctx.stroke();
    } else if (e.kind === 'ellipse' && isOrthogonal(e.u, e.v)) {
      const c = view.toScreen(e.center);
      ctx.beginPath();
      ctx.ellipse(
        c.x,
        c.y,
        Math.hypot(e.u.x, e.u.y) * view.zoom,
        Math.hypot(e.v.x, e.v.y) * view.zoom,
        -Math.atan2(e.u.y, e.u.x),
        0,
        Math.PI * 2
      );
      ctx.stroke();
    } else {
      for (const chain of flatten(e, o.tol)) {
        if (chain.length < 2) continue;
        ctx.beginPath();
        const a = view.toScreen(chain[0]);
        ctx.moveTo(a.x, a.y);
        for (let i = 1; i < chain.length; i++) {
          const s = view.toScreen(chain[i]);
          ctx.lineTo(s.x, s.y);
        }
        if (e.kind === 'polyline' && e.closed) ctx.closePath();
        ctx.stroke();
      }
    }

    if (o.selected) drawHandles(ctx, e, view);
    ctx.restore();
  }

  private drawPreview(state: RenderState, tol: number): void {
    const { ctx } = this;
    const preview = state.preview;
    if (!preview) return;
    for (const e of preview.entities) {
      const layer = state.doc.layer(e.layerId);
      this.drawEntity(e, {
        color: layer ? layer.color : INK,
        lineweight: layer ? layer.lineweight : 0.25,
        linetype: layer ? layer.linetype : 'continuous',
        view: state.view,
        tol,
        emphasis: null,
        selected: false,
      });
    }
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.25;
    if (preview.rubber.length >= 2) {
      ctx.strokeStyle = RUBBER;
      ctx.beginPath();
      const a = state.view.toScreen(preview.rubber[0]);
      ctx.moveTo(a.x, a.y);
      for (let i = 1; i < preview.rubber.length; i++) {
        const s = state.view.toScreen(preview.rubber[i]);
        ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    }
    if (preview.anchor) {
      const s = state.view.toScreen(preview.anchor);
      ctx.setLineDash([]);
      ctx.strokeStyle = MARK;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, state: RenderState, dpr: number): void {
  const { view } = state;
  const step = state.gridStep;
  if (!(step > 0)) return;

  const spacingPx = view.worldToPixels(step);
  const box = view.visibleWorldBox();
  const nx0 = Math.ceil(box.min.x / step);
  const nx1 = Math.floor(box.max.x / step);
  const ny0 = Math.ceil(box.min.y / step);
  const ny1 = Math.floor(box.max.y / step);

  if (spacingPx >= 2.5 && nx1 - nx0 <= 4000 && ny1 - ny0 <= 4000) {
    // One pass for minor lines, one for every fifth, so a full-screen grid
    // costs two strokes instead of thousands of dots.
    for (const major of [false, true]) {
      const deviceWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.lineWidth = deviceWidth / dpr;
      ctx.strokeStyle = major ? GRID_MAJOR : GRID_MINOR;
      for (let i = nx0; i <= nx1; i++) {
        if (isMajor(i) !== major) continue;
        const x = crisp(view.toScreen({ x: i * step, y: 0 }).x, dpr, deviceWidth);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, view.height);
      }
      for (let i = ny0; i <= ny1; i++) {
        if (isMajor(i) !== major) continue;
        const y = crisp(view.toScreen({ x: 0, y: i * step }).y, dpr, deviceWidth);
        ctx.moveTo(0, y);
        ctx.lineTo(view.width, y);
      }
      ctx.stroke();
    }
  }

  const o = view.toScreen({ x: 0, y: 0 });
  ctx.lineWidth = 1 / dpr;
  ctx.strokeStyle = AXIS_X;
  ctx.beginPath();
  const ay = crisp(o.y, dpr, 1);
  ctx.moveTo(0, ay);
  ctx.lineTo(view.width, ay);
  ctx.stroke();
  ctx.strokeStyle = AXIS_Y;
  ctx.beginPath();
  const ax = crisp(o.x, dpr, 1);
  ctx.moveTo(ax, 0);
  ctx.lineTo(ax, view.height);
  ctx.stroke();
}

/** Every fifth line is emphasised. */
function isMajor(index: number): boolean {
  return ((index % 5) + 5) % 5 === 0;
}

/**
 * Put a stroke centre on the device pixel grid. Sub-pixel hairlines otherwise
 * smear across two rows and the whole grid looks grey and blurry.
 */
function crisp(value: number, dpr: number, deviceWidth: number): number {
  const px = value * dpr;
  return deviceWidth % 2 === 1 ? (Math.floor(px) + 0.5) / dpr : Math.round(px) / dpr;
}

function drawText(ctx: CanvasRenderingContext2D, t: TextEntity, view: View): void {
  const px = Math.max(1, t.height * view.zoom);
  ctx.font = TEXT_FONT.replace('%H%', String(px));
  ctx.textAlign = t.halign;
  ctx.textBaseline = t.valign === 'center' ? 'middle' : t.valign === 'top' ? 'top' : 'alphabetic';
  const s = view.toScreen(t.position);
  ctx.save();
  ctx.setLineDash([]);
  ctx.translate(s.x, s.y);
  ctx.rotate(-t.rotation);
  const lines = t.text.split('\n');
  const lh = px * 1.2;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 0, i * lh);
  ctx.restore();
}

function drawHandles(ctx: CanvasRenderingContext2D, e: Entity, view: View): void {
  const pts: Vec2[] = [];
  if (e.kind === 'line' || e.kind === 'rect') pts.push(e.a, e.b);
  else if (e.kind === 'polyline' || e.kind === 'spline') pts.push(...e.points);
  else if (e.kind === 'circle' || e.kind === 'arc' || e.kind === 'ellipse') pts.push(e.center);
  else if (e.kind === 'text') pts.push(e.position);

  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = SELECTED;
  ctx.lineWidth = 1.5;
  for (const p of pts) {
    const s = view.toScreen(p);
    ctx.beginPath();
    ctx.rect(s.x - 3, s.y - 3, 6, 6);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawSnapMark(ctx: CanvasRenderingContext2D, mark: SnapMark, view: View): void {
  const s = view.toScreen(mark.p);
  const r = 5.5;
  ctx.save();
  ctx.strokeStyle = MARK;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  switch (mark.kind) {
    case 'endpoint':
      ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
      break;
    case 'midpoint':
      ctx.moveTo(s.x, s.y - r);
      ctx.lineTo(s.x + r, s.y + r);
      ctx.lineTo(s.x - r, s.y + r);
      ctx.closePath();
      break;
    case 'center':
      ctx.moveTo(s.x, s.y - r * 1.4);
      ctx.lineTo(s.x, s.y + r * 1.4);
      ctx.moveTo(s.x - r * 1.4, s.y);
      ctx.lineTo(s.x + r * 1.4, s.y);
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      break;
    case 'intersection':
      ctx.moveTo(s.x - r, s.y - r);
      ctx.lineTo(s.x + r, s.y + r);
      ctx.moveTo(s.x + r, s.y - r);
      ctx.lineTo(s.x - r, s.y + r);
      break;
    case 'quadrant':
      ctx.moveTo(s.x, s.y - r);
      ctx.lineTo(s.x + r, s.y);
      ctx.lineTo(s.x, s.y + r);
      ctx.lineTo(s.x - r, s.y);
      ctx.closePath();
      break;
    case 'nearest':
    case 'grid':
      ctx.arc(s.x, s.y, r * 0.8, 0, Math.PI * 2);
      break;
  }
  ctx.stroke();
  ctx.restore();
}

function drawMarquee(ctx: CanvasRenderingContext2D, m: Marquee): void {
  ctx.save();
  ctx.setLineDash([5, 3]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = m.crossing ? '#3cb44b' : SELECTED;
  ctx.fillStyle = m.crossing ? 'rgba(60,180,75,.14)' : 'rgba(31,143,255,.14)';
  const x = Math.min(m.a.x, m.b.x);
  const y = Math.min(m.a.y, m.b.y);
  const w = Math.abs(m.b.x - m.a.x);
  const h = Math.abs(m.b.y - m.a.y);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function isOrthogonal(u: Vec2, v: Vec2): boolean {
  const l = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  if (l < 1e-12) return false;
  return Math.abs((u.x * v.x + u.y * v.y) / l) < 1e-6;
}

function bboxIntersects(a: BBox, b: BBox): boolean {
  if (!Number.isFinite(a.min.x) || !Number.isFinite(b.min.x)) return false;
  return a.max.x >= b.min.x && a.min.x <= b.max.x && a.max.y >= b.min.y && a.min.y <= b.max.y;
}
