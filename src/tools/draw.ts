import { Vec2, angleOf, ccwSweep, dist, mul, norm, normalizeAngle, perp, dot, sub } from '../core/vec';
import {
  Entity,
  makeArc,
  makeCircle,
  makeEllipse,
  makeLine,
  makePolyline,
  makeRect,
  makeSpline,
  makeText,
} from '../core/entities';
import { Preview } from '../core/renderer';
import { Tool, ToolKit } from './types';

function pv(entities: Entity[], rubber: Vec2[] = [], anchor: Vec2 | null = null): Preview {
  return { entities, rubber, anchor };
}

/**
 * Circle through three points, expressed as the arc from `start` to `end` that
 * passes through `via`. Null when the three points are collinear.
 */
function arcThroughThree(layer: string, start: Vec2, via: Vec2, end: Vec2): Entity | null {
  const center = circumcenter(start, via, end);
  if (!center) return null;
  const radius = dist(center, start);
  if (!(radius > 1e-9)) return null;
  const a0 = normalizeAngle(angleOf(center, start));
  const a1 = normalizeAngle(angleOf(center, end));
  const am = normalizeAngle(angleOf(center, via));
  // Keep the direction that contains the middle point.
  return ccwSweep(a0, am) <= ccwSweep(a0, a1)
    ? makeArc(layer, center, radius, a0, a1)
    : makeArc(layer, center, radius, a1, a0);
}

function circumcenter(a: Vec2, b: Vec2, c: Vec2): Vec2 | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

/** Project `v` onto the line perpendicular to `u` through the origin. */
function conjugateAxis(u: Vec2, v: Vec2): Vec2 {
  const n = norm(perp(u));
  return mul(n, dot(v, n));
}

/* ------------------------------------------------------------------ line -- */

export class LineTool implements Tool {
  readonly id = 'line';
  readonly label = 'Line';
  readonly hint = 'Line: click the start point, Enter to finish';
  readonly repeatable = true;
  readonly flushOnExit = true;
  private points: Vec2[] = [];

  constructor(private readonly kit: ToolKit) {}

  onStart(): void {
    this.points = [];
    this.kit.setPreview(null);
    this.kit.setBase(null);
    this.kit.setPrompt(this.hint);
  }

  onDown(p: Vec2): void {
    this.points.push(p);
    this.kit.setBase(p);
    this.kit.setPrompt('Line: click the next point, Enter to finish');
    this.onMove(p);
  }

  onMove(p: Vec2): void {
    if (!this.points.length) return;
    const fixed = this.points.slice(0, -1);
    const entities: Entity[] = [];
    for (let i = 0; i + 1 < fixed.length; i++) entities.push(makeLine(this.layer(), fixed[i], fixed[i + 1]));
    this.kit.setPreview(pv(entities, [this.points[this.points.length - 1], p]));
  }

  onFinish(): void {
    const out: Entity[] = [];
    for (let i = 0; i + 1 < this.points.length; i++) {
      out.push(makeLine(this.layer(), this.points[i], this.points[i + 1]));
    }
    this.onStart();
    if (out.length) this.kit.insert(out, 'Line');
    else this.kit.setPrompt(this.hint);
  }

  onCancel(): void {
    this.onStart();
  }

  private layer(): string {
    return this.kit.currentLayerId();
  }
}

/* -------------------------------------------------------------- polyline -- */

export class PolylineTool implements Tool {
  readonly id = 'polyline';
  readonly label = 'Polyline';
  readonly hint = 'Polyline: click vertices, C closes, Backspace undoes, Enter finishes';
  readonly repeatable = true;
  readonly flushOnExit = true;
  private points: Vec2[] = [];
  private closed = false;

  constructor(private readonly kit: ToolKit) {}

  onStart(): void {
    this.points = [];
    this.closed = false;
    this.kit.setPreview(null);
    this.kit.setBase(null);
    this.kit.setPrompt(this.hint);
  }

  onDown(p: Vec2): void {
    this.points.push(p);
    this.kit.setBase(p);
    this.onMove(p);
  }

  onMove(p: Vec2): void {
    if (!this.points.length) return;
    const last = this.points[this.points.length - 1];
    const entities =
      this.points.length > 1 ? [makePolyline(this.layer(), this.points, false)] : [];
    const rubber: Vec2[] = [last, p];
    if (this.closed && this.points.length > 2) rubber.push(this.points[0]);
    this.kit.setPreview(pv(entities, rubber));
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === 'c' && this.points.length > 2) {
      this.closed = true;
      this.onFinish();
      return true;
    }
    if (e.key === 'Backspace' && this.points.length > 1) {
      this.points.pop();
      this.closed = false;
      const last = this.points[this.points.length - 1];
      this.kit.setBase(last);
      this.onMove(last);
      return true;
    }
    return false;
  }

  onFinish(): void {
    const count = this.points.length;
    const entity = count > 1 ? makePolyline(this.layer(), this.points, this.closed && count > 2) : null;
    this.onStart();
    if (entity) this.kit.insert([entity], 'Polyline');
    else this.kit.setPrompt(this.hint);
  }

  onCancel(): void {
    this.onStart();
  }

  private layer(): string {
    return this.kit.currentLayerId();
  }
}

/* ------------------------------------------------------------------- arc -- */

export class ArcTool implements Tool {
  readonly id = 'arc';
  readonly label = 'Arc';
  readonly hint = 'Arc (3 points): click the start';
  readonly repeatable = true;
  private start: Vec2 | null = null;
  private via: Vec2 | null = null;

  constructor(private readonly kit: ToolKit) {}

  onStart(): void {
    this.start = null;
    this.via = null;
    this.kit.setPreview(null);
    this.kit.setBase(null);
    this.kit.setPrompt(this.hint);
  }

  onDown(p: Vec2): void {
    if (!this.start) {
      this.start = p;
      this.kit.setBase(p);
      this.kit.setPrompt('Arc: click a point the arc must pass through');
      return;
    }
    if (!this.via) {
      this.via = p;
      this.kit.setPrompt('Arc: click the end point');
      this.onMove(p);
      return;
    }
    const entity = arcThroughThree(this.layer(), this.start, this.via, p);
    const failed = !entity;
    this.onStart();
    if (entity) this.kit.insert([entity], 'Arc');
    else if (failed) this.kit.setStatus('Arc: the three points are collinear');
  }

  onMove(p: Vec2): void {
    if (!this.start) {
      this.kit.setPreview(null);
      return;
    }
    if (!this.via) {
      this.kit.setPreview(pv([], [this.start, p], this.start));
      return;
    }
    const entity = arcThroughThree(this.layer(), this.start, this.via, p);
    this.kit.setPreview(entity ? pv([entity], [this.via as Vec2, p], this.start) : pv([], [this.via as Vec2, p]));
  }

  onFinish(): void {
    this.onStart();
  }

  onCancel(): void {
    this.onStart();
  }

  private layer(): string {
    return this.kit.currentLayerId();
  }
}

/* ---------------------------------------------------------------- circle -- */

export class CircleTool implements Tool {
  readonly id = 'circle';
  readonly label = 'Circle';
  readonly hint = 'Circle: click the centre, then the radius';
  readonly repeatable = true;
  private center: Vec2 | null = null;

  constructor(private readonly kit: ToolKit) {}

  onStart(): void {
    this.center = null;
    this.kit.setPreview(null);
    this.kit.setBase(null);
    this.kit.setPrompt(this.hint);
  }

  onDown(p: Vec2): void {
    if (!this.center) {
      this.center = p;
      this.kit.setBase(p);
      this.kit.setPrompt('Circle: click the radius');
      return;
    }
    const radius = dist(this.center, p);
    const entity = radius > 1e-9 ? makeCircle(this.layer(), this.center, radius) : null;
    this.onStart();
    if (entity) this.kit.insert([entity], 'Circle');
  }

  onMove(p: Vec2): void {
    if (!this.center) return;
    const radius = dist(this.center, p);
    const entities = radius > 1e-9 ? [makeCircle(this.layer(), this.center, radius)] : [];
    this.kit.setPreview(pv(entities, [this.center, p], this.center));
  }

  onFinish(): void {
    this.onStart();
  }

  onCancel(): void {
    this.onStart();
  }

  private layer(): string {
    return this.kit.currentLayerId();
  }
}

/* ------------------------------------------------------------------ rect -- */

export class RectTool implements Tool {
  readonly id = 'rect';
  readonly label = 'Rectangle';
  readonly hint = 'Rectangle: click the first corner';
  readonly repeatable = true;
  private a: Vec2 | null = null;

  constructor(private readonly kit: ToolKit) {}

  onStart(): void {
    this.a = null;
    this.kit.setPreview(null);
    this.kit.setBase(null);
    this.kit.setPrompt(this.hint);
  }

  onDown(p: Vec2): void {
    if (!this.a) {
      this.a = p;
      this.kit.setBase(p);
      this.kit.setPrompt('Rectangle: click the opposite corner');
      return;
    }
    const entity =
      Math.abs(p.x - this.a.x) > 1e-9 && Math.abs(p.y - this.a.y) > 1e-9
        ? makeRect(this.layer(), this.a, p)
        : null;
    this.onStart();
    if (entity) this.kit.insert([entity], 'Rectangle');
  }

  onMove(p: Vec2): void {
    if (!this.a) return;
    const flat = Math.abs(p.x - this.a.x) < 1e-9 || Math.abs(p.y - this.a.y) < 1e-9;
    const entities = flat ? [] : [makeRect(this.layer(), this.a, p)];
    const rubber = flat ? [this.a, p] : [this.a, p];
    this.kit.setPreview(pv(entities, rubber, this.a));
  }

  onFinish(): void {
    this.onStart();
  }

  onCancel(): void {
    this.onStart();
  }

  private layer(): string {
    return this.kit.currentLayerId();
  }
}

/* --------------------------------------------------------------- ellipse -- */

export class EllipseTool implements Tool {
  readonly id = 'ellipse';
  readonly label = 'Ellipse';
  readonly hint = 'Ellipse: click the centre';
  readonly repeatable = true;
  private center: Vec2 | null = null;
  private u: Vec2 | null = null;

  constructor(private readonly kit: ToolKit) {}

  onStart(): void {
    this.center = null;
    this.u = null;
    this.kit.setPreview(null);
    this.kit.setBase(null);
    this.kit.setPrompt(this.hint);
  }

  onDown(p: Vec2): void {
    if (!this.center) {
      this.center = p;
      this.kit.setBase(p);
      this.kit.setPrompt('Ellipse: click the end of the major axis');
      return;
    }
    if (!this.u) {
      const u = sub(p, this.center);
      if (dist(u, { x: 0, y: 0 }) < 1e-9) return;
      this.u = u;
      this.kit.setBase(p);
      this.kit.setPrompt('Ellipse: click the end of the minor axis');
      return;
    }
    const v = conjugateAxis(this.u, sub(p, this.center));
    if (dist(v, { x: 0, y: 0 }) < 1e-9) {
      this.onStart();
      this.kit.setStatus('Ellipse: the second axis has no length');
      return;
    }
    const entity = makeEllipse(this.layer(), this.center, this.u, v);
    this.onStart();
    this.kit.insert([entity], 'Ellipse');
  }

  onMove(p: Vec2): void {
    if (!this.center) return;
    if (!this.u) {
      const u = sub(p, this.center);
      if (dist(u, { x: 0, y: 0 }) < 1e-9) {
        this.kit.setPreview(null);
        return;
      }
      const tentative = makeEllipse(this.layer(), this.center, u, conjugateAxis(u, mul(perp(u), 0.6)));
      this.kit.setPreview(pv([tentative], [this.center, p], this.center));
      return;
    }
    const v = conjugateAxis(this.u, sub(p, this.center));
    const entities = dist(v, { x: 0, y: 0 }) < 1e-9 ? [] : [makeEllipse(this.layer(), this.center, this.u, v)];
    this.kit.setPreview(pv(entities, [this.center, p], this.center));
  }

  onFinish(): void {
    this.onStart();
  }

  onCancel(): void {
    this.onStart();
  }

  private layer(): string {
    return this.kit.currentLayerId();
  }
}

/* --------------------------------------------------------------- spline -- */

export class SplineTool implements Tool {
  readonly id = 'spline';
  readonly label = 'Spline';
  readonly hint = 'Spline: click points for the curve to pass near, Enter fits';
  readonly repeatable = true;
  readonly flushOnExit = true;
  private points: Vec2[] = [];

  constructor(private readonly kit: ToolKit) {}

  onStart(): void {
    this.points = [];
    this.kit.setPreview(null);
    this.kit.setBase(null);
    this.kit.setPrompt(this.hint);
  }

  onDown(p: Vec2): void {
    this.points.push(p);
    this.kit.setBase(p);
    this.kit.setPrompt(`Spline: ${this.points.length} point(s) — Enter fits, Escape cancels`);
    this.onMove(p);
  }

  onMove(p: Vec2): void {
    const pts = [...this.points, p];
    const entities = pts.length >= 3 ? [makeSpline(this.layer(), pts)] : [];
    const rubber = pts.length === 2 ? pts : [];
    this.kit.setPreview(pv(entities, rubber));
  }

  onFinish(): void {
    const entity = this.points.length >= 2 ? makeSpline(this.layer(), this.points) : null;
    this.onStart();
    if (entity) this.kit.insert([entity], 'Spline');
    else this.kit.setPrompt(this.hint);
  }

  onCancel(): void {
    this.onStart();
  }

  private layer(): string {
    return this.kit.currentLayerId();
  }
}

/* ------------------------------------------------------------------ text -- */

export class TextTool implements Tool {
  readonly id = 'text';
  readonly label = 'Text';
  readonly hint = 'Text: click the insertion point';
  readonly repeatable = true;

  constructor(private readonly kit: ToolKit) {}

  onDown(p: Vec2): void {
    this.kit.setPreview(null);
    this.kit.requestTextInsertion(p, (text, height) => {
      if (!text.trim()) {
        this.kit.setPrompt(this.hint);
        return;
      }
      const entity = makeText(this.kit.currentLayerId(), p, Math.max(0.1, height), text);
      this.kit.insert([entity], 'Text');
      this.kit.setStatus(`Added text: ${text.slice(0, 24)}`);
    });
  }

  onCancel(): void {
    this.kit.setPrompt(this.hint);
  }
}
