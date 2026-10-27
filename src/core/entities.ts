import {
  BBox,
  Vec2,
  EPS,
  TAU,
  add,
  angleOf,
  bboxEmpty,
  bboxExtend,
  bboxFromPoints,
  ccwSweep,
  clone,
  closestPointOnSegment,
  dist,
  distanceToSegment,
  matApply,
  matDeterminant,
  matIsUniform,
  matRotation,
  matScaleFactor,
  normalizeAngle,
  mul,
  polylineLength,
  rotatePoint,
  sub,
  Mat,
} from './vec';

export type Linetype = 'continuous' | 'dashed' | 'dotted' | 'dashdot' | 'centre';

export interface EntityStyle {
  /** Overrides the layer colour when set. */
  color?: string;
  /** Line weight in millimetres of paper, independent of zoom. */
  lineweight?: number;
  linetype?: Linetype;
}

export type EntityKind =
  | 'line'
  | 'polyline'
  | 'arc'
  | 'circle'
  | 'ellipse'
  | 'rect'
  | 'spline'
  | 'text';

export interface BaseEntity extends EntityStyle {
  id: string;
  kind: EntityKind;
  layerId: string;
}

export interface LineEntity extends BaseEntity {
  kind: 'line';
  a: Vec2;
  b: Vec2;
}

export interface PolylineEntity extends BaseEntity {
  kind: 'polyline';
  points: Vec2[];
  closed: boolean;
}

/** Counter-clockwise sweep from `start` to `end`. */
export interface ArcEntity extends BaseEntity {
  kind: 'arc';
  center: Vec2;
  radius: number;
  start: number;
  end: number;
}

export interface CircleEntity extends BaseEntity {
  kind: 'circle';
  center: Vec2;
  radius: number;
}

/** `u` and `v` are the semi-axis vectors, so any affine image stays expressible. */
export interface EllipseEntity extends BaseEntity {
  kind: 'ellipse';
  center: Vec2;
  u: Vec2;
  v: Vec2;
}

export interface RectEntity extends BaseEntity {
  kind: 'rect';
  a: Vec2;
  b: Vec2;
}

export interface SplineEntity extends BaseEntity {
  kind: 'spline';
  /** Control points of a cubic B-spline. */
  points: Vec2[];
}

export type TextHAlign = 'left' | 'center' | 'right';
export type TextVAlign = 'baseline' | 'center' | 'top';

export interface TextEntity extends BaseEntity {
  kind: 'text';
  position: Vec2;
  height: number;
  rotation: number;
  text: string;
  halign: TextHAlign;
  valign: TextVAlign;
}

export type Entity =
  | LineEntity
  | PolylineEntity
  | ArcEntity
  | CircleEntity
  | EllipseEntity
  | RectEntity
  | SplineEntity
  | TextEntity;

/** Font used for both screen text and SVG export so metrics stay consistent. */
export const TEXT_FONT = '600 %H%px "Segoe UI", system-ui, sans-serif';

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'e' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const KINDS: EntityKind[] = ['line', 'polyline', 'arc', 'circle', 'ellipse', 'rect', 'spline', 'text'];

export function isEntityKind(s: string): s is EntityKind {
  return (KINDS as string[]).includes(s);
}

export function cloneEntity(e: Entity): Entity {
  const copy = deepCopy(e) as Entity;
  copy.id = newId();
  return copy;
}

export function copyWithId(e: Entity, id: string): Entity {
  const copy = deepCopy(e) as Entity;
  copy.id = id;
  return copy;
}

function deepCopy<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

export function makeLine(layerId: string, a: Vec2, b: Vec2, style: EntityStyle = {}): LineEntity {
  return { id: newId(), kind: 'line', layerId, a: clone(a), b: clone(b), ...style };
}

export function makePolyline(
  layerId: string,
  points: Vec2[],
  closed: boolean,
  style: EntityStyle = {}
): PolylineEntity {
  return {
    id: newId(),
    kind: 'polyline',
    layerId,
    points: points.map(clone),
    closed,
    ...style,
  };
}

export function makeArc(
  layerId: string,
  center: Vec2,
  radius: number,
  start: number,
  end: number,
  style: EntityStyle = {}
): ArcEntity {
  return { id: newId(), kind: 'arc', layerId, center: clone(center), radius, start, end, ...style };
}

export function makeCircle(
  layerId: string,
  center: Vec2,
  radius: number,
  style: EntityStyle = {}
): CircleEntity {
  return { id: newId(), kind: 'circle', layerId, center: clone(center), radius, ...style };
}

export function makeEllipse(
  layerId: string,
  center: Vec2,
  u: Vec2,
  v: Vec2,
  style: EntityStyle = {}
): EllipseEntity {
  return { id: newId(), kind: 'ellipse', layerId, center: clone(center), u: clone(u), v: clone(v), ...style };
}

export function makeRect(layerId: string, a: Vec2, b: Vec2, style: EntityStyle = {}): RectEntity {
  return { id: newId(), kind: 'rect', layerId, a: clone(a), b: clone(b), ...style };
}

export function makeSpline(layerId: string, points: Vec2[], style: EntityStyle = {}): SplineEntity {
  return { id: newId(), kind: 'spline', layerId, points: points.map(clone), ...style };
}

export function makeText(
  layerId: string,
  position: Vec2,
  height: number,
  text: string,
  rotation = 0,
  style: EntityStyle = {}
): TextEntity {
  return {
    id: newId(),
    kind: 'text',
    layerId,
    position: clone(position),
    height,
    rotation,
    text,
    halign: 'left',
    valign: 'baseline',
    ...style,
  };
}

/** Sample count for an arc of `sweep` radians on a circle of `radius`. */
export function samplesForArc(radius: number, sweep: number, tol: number): number {
  if (radius <= 0) return 1;
  const t = Math.max(1e-9, Math.min(tol / radius, 1));
  const step = Math.sqrt(2 * t);
  return Math.max(2, Math.min(4000, Math.ceil(Math.abs(sweep) / step)));
}

/** Sample an ellipse defined by semi-axis vectors into a closed polyline. */
export function sampleEllipse(center: Vec2, u: Vec2, v: Vec2, tol: number): Vec2[] {
  const r = Math.max(Math.hypot(u.x, u.y), Math.hypot(v.x, v.y));
  const n = samplesForArc(r, TAU, tol);
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    out.push(add(center, { x: u.x * Math.cos(a) + v.x * Math.sin(a), y: u.y * Math.cos(a) + v.y * Math.sin(a) }));
  }
  return out;
}

export function sampleCircle(center: Vec2, radius: number, tol: number): Vec2[] {
  const n = samplesForArc(radius, TAU, tol);
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    out.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return out;
}

export function sampleArc(center: Vec2, radius: number, start: number, end: number, tol: number): Vec2[] {
  const sweep = ccwSweep(start, end);
  const n = samplesForArc(radius, sweep, tol);
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = start + (sweep * i) / n;
    out.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return out;
}

/**
 * Uniform cubic B-spline through the control points, with the ends pulled onto
 * the first and last control point so the curve passes through them.
 */
export function sampleSpline(points: Vec2[], tol: number): Vec2[] {
  const pts = points;
  if (pts.length < 2) return pts.map(clone);
  const ctrl: Vec2[] = [pts[0], ...pts, pts[pts.length - 1]];
  const segs = ctrl.length - 3;
  let maxLen = 0;
  for (let i = 0; i + 1 < pts.length; i++) maxLen = Math.max(maxLen, dist(pts[i], pts[i + 1]));
  const perSeg = Math.max(4, Math.min(200, Math.ceil(maxLen / Math.max(tol, 1e-6) / 4)));
  const out: Vec2[] = [];
  for (let s = 0; s < segs; s++) {
    const p0 = ctrl[s];
    const p1 = ctrl[s + 1];
    const p2 = ctrl[s + 2];
    const p3 = ctrl[s + 3];
    for (let i = 0; i <= perSeg; i++) {
      if (s > 0 && i === 0) continue;
      out.push(bsplineAt(p0, p1, p2, p3, i / perSeg));
    }
  }
  return out;
}

function bsplineAt(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const w0 = (1 - 3 * t + 3 * t2 - t3) / 6;
  const w1 = (4 - 6 * t2 + 3 * t3) / 6;
  const w2 = (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
  const w3 = t3 / 6;
  return {
    x: w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x,
    y: w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y,
  };
}

export function rectCorners(a: Vec2, b: Vec2): Vec2[] {
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
    { x: a.x, y: a.y },
  ];
}

/**
 * Flatten the entity into polyline chains for drawing, picking and export.
 * `tol` is the maximum allowed sagitta in world units.
 */
export function flatten(e: Entity, tol: number): Vec2[][] {
  switch (e.kind) {
    case 'line':
      return [[clone(e.a), clone(e.b)]];
    case 'polyline':
      if (e.points.length === 0) return [];
      return [e.points.map(clone)];
    case 'rect':
      return [rectCorners(e.a, e.b)];
    case 'arc':
      return [sampleArc(e.center, e.radius, e.start, e.end, tol)];
    case 'circle':
      return [sampleCircle(e.center, e.radius, tol)];
    case 'ellipse':
      return [sampleEllipse(e.center, e.u, e.v, tol)];
    case 'spline':
      return [sampleSpline(e.points, tol)];
    case 'text':
      return [];
  }
}

export function entityBBox(e: Entity, tol = 0.5): BBox {
  if (e.kind === 'text') return textBBox(e);
  let b = bboxEmpty();
  for (const chain of flatten(e, Math.max(tol, 1e-3))) for (const p of chain) b = bboxExtend(b, p);
  return b;
}

export function textBBox(t: TextEntity): BBox {
  const w = measureTextWidth(t.text, t.height);
  let x0 = 0;
  let x1 = w;
  if (t.halign === 'center') {
    x0 = -w / 2;
    x1 = w / 2;
  } else if (t.halign === 'right') {
    x0 = -w;
    x1 = 0;
  }
  let y0 = 0;
  let y1 = t.height;
  if (t.valign === 'baseline') {
    y0 = -t.height * 0.8;
    y1 = t.height * 0.2;
  } else if (t.valign === 'center') {
    y0 = -t.height / 2;
    y1 = t.height / 2;
  }
  const corners = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ].map((p) => rotatePoint(p, { x: 0, y: 0 }, t.rotation));
  return bboxFromPoints(corners.map((p) => add(p, t.position)));
}

export function measureTextWidth(text: string, height: number): number {
  // 0.58 of the cap height per character approximates Segoe UI at weight 600
  // without needing a live canvas context for hit-testing.
  const lines = text.split('\n');
  let longest = 0;
  for (const l of lines) longest = Math.max(longest, l.length);
  return longest * height * 0.58;
}

/** Distance from a point to the entity outline, in world units. */
export function distanceToEntity(e: Entity, p: Vec2, tol: number): number {
  if (e.kind === 'text') {
    const b = textBBox(e);
    if (
      p.x >= b.min.x &&
      p.x <= b.max.x &&
      p.y <= b.max.y &&
      p.y >= b.min.y
    ) {
      return 0;
    }
    const c = rectCorners(b.min, b.max);
    let best = Infinity;
    for (let i = 0; i < 4; i++) best = Math.min(best, distanceToSegment(p, c[i], c[i + 1]));
    return best;
  }
  let best = Infinity;
  for (const chain of flatten(e, tol)) {
    for (let i = 0; i + 1 < chain.length; i++) {
      best = Math.min(best, distanceToSegment(p, chain[i], chain[i + 1]));
    }
  }
  return best;
}

export type SnapPointKind = 'endpoint' | 'midpoint' | 'center' | 'quadrant';

export interface SnapPoint {
  kind: SnapPointKind;
  p: Vec2;
}

/** Object-snap points offered for this entity. */
export function entitySnapPoints(e: Entity): SnapPoint[] {
  switch (e.kind) {
    case 'line':
      return [
        { kind: 'endpoint', p: clone(e.a) },
        { kind: 'endpoint', p: clone(e.b) },
        { kind: 'midpoint', p: add(e.a, mul(sub(e.b, e.a), 0.5)) },
      ];
    case 'rect': {
      const c = rectCorners(e.a, e.b);
      const out: SnapPoint[] = [
        { kind: 'center', p: { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 } },
      ];
      for (let i = 0; i < 4; i++) {
        out.push({ kind: 'endpoint', p: clone(c[i]) });
        out.push({ kind: 'midpoint', p: { x: (c[i].x + c[i + 1].x) / 2, y: (c[i].y + c[i + 1].y) / 2 } });
      }
      return out;
    }
    case 'polyline': {
      const out: SnapPoint[] = e.points.map((p) => ({ kind: 'endpoint' as const, p: clone(p) }));
      const segs = e.closed ? e.points.length : e.points.length - 1;
      for (let i = 0; i < segs; i++) {
        const a = e.points[i];
        const b = e.points[(i + 1) % e.points.length];
        out.push({ kind: 'midpoint', p: add(a, mul(sub(b, a), 0.5)) });
      }
      return out;
    }
    case 'circle': {
      const c = e.center;
      return [
        { kind: 'center', p: clone(c) },
        { kind: 'quadrant', p: { x: c.x + e.radius, y: c.y } },
        { kind: 'quadrant', p: { x: c.x - e.radius, y: c.y } },
        { kind: 'quadrant', p: { x: c.x, y: c.y + e.radius } },
        { kind: 'quadrant', p: { x: c.x, y: c.y - e.radius } },
      ];
    }
    case 'arc': {
      const sweep = ccwSweep(e.start, e.end);
      const q = (a: number): Vec2 => ({
        x: e.center.x + e.radius * Math.cos(a),
        y: e.center.y + e.radius * Math.sin(a),
      });
      const out: SnapPoint[] = [
        { kind: 'center', p: clone(e.center) },
        { kind: 'endpoint', p: q(e.start) },
        { kind: 'endpoint', p: q(e.end) },
        { kind: 'midpoint', p: q(e.start + sweep / 2) },
      ];
      for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        if (ccwSweep(e.start, a) <= sweep) out.push({ kind: 'quadrant', p: q(a) });
      }
      return out;
    }
    case 'ellipse': {
      const c = e.center;
      return [
        { kind: 'center', p: clone(c) },
        { kind: 'endpoint', p: add(c, e.u) },
        { kind: 'endpoint', p: sub(c, e.u) },
        { kind: 'endpoint', p: add(c, e.v) },
        { kind: 'endpoint', p: sub(c, e.v) },
      ];
    }
    case 'spline':
      return e.points.map((p) => ({ kind: 'endpoint', p: clone(p) }));
    case 'text':
      return [{ kind: 'endpoint', p: clone(e.position) }];
  }
}

/** Closest point on the entity outline to p. */
export function closestOnEntity(e: Entity, p: Vec2, tol: number): Vec2 | null {
  if (e.kind === 'text') return null;
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const chain of flatten(e, tol)) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const c = closestPointOnSegment(p, chain[i], chain[i + 1]);
      const d = dist(p, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

export function transformEntity(e: Entity, m: Mat): Entity {
  const uniform = matIsUniform(m, 1e-7);
  const det = matDeterminant(m);
  const s = matScaleFactor(m);
  const rot = matRotation(m);

  switch (e.kind) {
    case 'line':
      return { ...e, a: matApply(m, e.a), b: matApply(m, e.b) };
    case 'polyline':
      return { ...e, points: e.points.map((p) => matApply(m, p)) };
    case 'rect': {
      const a = matApply(m, e.a);
      const b = matApply(m, e.b);
      const axisAligned =
        Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9;
      if (axisAligned) return { ...e, a, b };
      return toPolyline({ ...e, a, b });
    }
    case 'circle': {
      if (!uniform || s <= 0) return toPolyline(e);
      return { ...e, center: matApply(m, e.center), radius: e.radius * s };
    }
    case 'arc': {
      if (!uniform || s <= 0) return toPolyline(e);
      return {
        ...e,
        center: matApply(m, e.center),
        radius: e.radius * s,
        start: normalizeAngle(e.start + rot),
        end: normalizeAngle(e.end + rot),
      };
    }
    case 'ellipse': {
      const u = { x: m.a * e.u.x + m.c * e.u.y, y: m.b * e.u.x + m.d * e.u.y };
      const v = { x: m.a * e.v.x + m.c * e.v.y, y: m.b * e.v.x + m.d * e.v.y };
      return { ...e, center: matApply(m, e.center), u, v };
    }
    case 'spline':
      return { ...e, points: e.points.map((p) => matApply(m, p)) };
    case 'text': {
      const mirrored = det < 0;
      if (!uniform || mirrored) {
        // Text cannot be sheared; outline it instead of distorting it.
        return toPolyline(e);
      }
      return {
        ...e,
        position: matApply(m, e.position),
        height: e.height * s,
        rotation: e.rotation + rot,
      };
    }
  }
}

/** Convert any entity to the polyline chains that approximate it. */
export function toPolyline(e: Entity, tol = 0.05): PolylineEntity {
  const chains = flatten(e, tol);
  const first = chains[0] ?? [];
  const closed = e.kind === 'circle' || e.kind === 'ellipse' || e.kind === 'rect' || (e.kind === 'polyline' && e.closed);
  const pts = first.slice(0, closed && first.length > 1 ? first.length - 1 : first.length);
  return {
    id: e.id,
    kind: 'polyline',
    layerId: e.layerId,
    color: e.color,
    lineweight: e.lineweight,
    linetype: e.linetype,
    points: pts.map(clone),
    closed,
  };
}

export function entityLength(e: Entity, tol = 0.02): number {
  if (e.kind === 'text') return 0;
  let total = 0;
  for (const chain of flatten(e, tol)) {
    const closed = chain.length > 2 && dist(chain[0], chain[chain.length - 1]) < EPS;
    total += polylineLength(chain, closed);
  }
  return total;
}

/** Angle in degrees, useful for the status read-out while drawing. */
export function angleDegrees(a: Vec2, b: Vec2): number {
  return (angleOf(a, b) * 180) / Math.PI;
}
