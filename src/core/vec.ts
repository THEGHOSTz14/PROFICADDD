export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const clone = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function norm(a: Vec2): Vec2 {
  const l = len(a);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function perp(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x };
}

export const EPS = 1e-9;

export const TAU = Math.PI * 2;

/** Normalise an angle into [0, 2pi). */
export function normalizeAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

/** Signed sweep travelling counter-clockwise from a0 to a1, in [0, 2pi). */
export function ccwSweep(a0: number, a1: number): number {
  return normalizeAngle(a1 - a0);
}

/** Angle of the vector from a to b. */
export function angleOf(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function rotatePoint(p: Vec2, about: Vec2, radians: number): Vec2 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const dx = p.x - about.x;
  const dy = p.y - about.y;
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
}

export interface BBox {
  min: Vec2;
  max: Vec2;
}

export function bboxEmpty(): BBox {
  return { min: v(Infinity, Infinity), max: v(-Infinity, -Infinity) };
}

export function bboxValid(b: BBox): boolean {
  return b.min.x <= b.max.x && b.min.y <= b.max.y;
}

export function bboxExtend(b: BBox, p: Vec2): BBox {
  return {
    min: v(Math.min(b.min.x, p.x), Math.min(b.min.y, p.y)),
    max: v(Math.max(b.max.x, p.x), Math.max(b.max.y, p.y)),
  };
}

export function bboxUnion(a: BBox, b: BBox): BBox {
  return {
    min: v(Math.min(a.min.x, b.min.x), Math.min(a.min.y, b.min.y)),
    max: v(Math.max(a.max.x, b.max.x), Math.max(a.max.y, b.max.y)),
  };
}

export function bboxFromPoints(pts: Vec2[]): BBox {
  let b = bboxEmpty();
  for (const p of pts) b = bboxExtend(b, p);
  return b;
}

export function bboxSize(b: BBox): Vec2 {
  return v(b.max.x - b.min.x, b.max.y - b.min.y);
}

export function bboxCenter(b: BBox): Vec2 {
  return v((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2);
}

export function bboxContains(b: BBox, p: Vec2, slack = 0): boolean {
  return (
    p.x >= b.min.x - slack &&
    p.x <= b.max.x + slack &&
    p.y >= b.min.y - slack &&
    p.y <= b.max.y + slack
  );
}

/**
 * Affine matrix in column form: | a c e |
 *                              | b d f |
 *                              | 0 0 1 |
 */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const matIdentity = (): Mat => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export const matApply = (m: Mat, p: Vec2): Vec2 => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
});

export function matMultiply(m: Mat, n: Mat): Mat {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export const matTranslate = (t: Vec2): Mat => ({ a: 1, b: 0, c: 0, d: 1, e: t.x, f: t.y });

export function matRotate(radians: number, about: Vec2): Mat {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return {
    a: c,
    b: s,
    c: -s,
    d: c,
    e: about.x - c * about.x + s * about.y,
    f: about.y - s * about.x - c * about.y,
  };
}

/** Mirror in the infinite line through `p` with direction `dir`. */
export function matMirror(p: Vec2, dir: Vec2): Mat {
  const u = norm(dir);
  const dx = u.x;
  const dy = u.y;
  // Reflection matrix about a line through the origin, then translated back.
  const a = dx * dx - dy * dy;
  const b = 2 * dx * dy;
  return {
    a,
    b,
    c: b,
    d: -a,
    e: p.x - (a * p.x + b * p.y),
    f: p.y - (b * p.x - a * p.y),
  };
}

export function matScale(k: number, about: Vec2): Mat {
  return { a: k, b: 0, c: 0, d: k, e: about.x - k * about.x, f: about.y - k * about.y };
}

export function matScaleXY(sx: number, sy: number, about: Vec2): Mat {
  return {
    a: sx,
    b: 0,
    c: 0,
    d: sy,
    e: about.x - sx * about.x,
    f: about.y - sy * about.y,
  };
}

export const matDeterminant = (m: Mat): number => m.a * m.d - m.b * m.c;

/** Uniform scale factor represented by a matrix (absolute, ignores flip). */
export function matScaleFactor(m: Mat): number {
  const s1 = Math.hypot(m.a, m.b);
  const s2 = Math.hypot(m.c, m.d);
  return (s1 + s2) / 2;
}

/** Rotation represented by a matrix, derived from its first column. */
export const matRotation = (m: Mat): number => Math.atan2(m.b, m.a);

export const matIsUniform = (m: Mat, tol = 1e-6): boolean => {
  const s1 = Math.hypot(m.a, m.b);
  const s2 = Math.hypot(m.c, m.d);
  const skew = Math.abs(m.a * m.c + m.b * m.d);
  return Math.abs(s1 - s2) < tol && skew / (s1 * s2 || 1) < tol;
};

export function matInvert(m: Mat): Mat {
  const det = matDeterminant(m);
  if (Math.abs(det) < 1e-15) return matIdentity();
  const id = 1 / det;
  return {
    a: m.d * id,
    b: -m.b * id,
    c: -m.c * id,
    d: m.a * id,
    e: (m.c * m.f - m.d * m.e) * id,
    f: (m.b * m.e - m.a * m.f) * id,
  };
}

/** Shortest distance from point p to segment ab. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return dist(p, closestPointOnSegment(p, a, b));
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return clone(a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return add(a, mul(ab, t));
}

/** Intersection of two infinite lines; null when parallel. */
export function lineLineIntersection(
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  p4: Vec2
): Vec2 | null {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const den = cross(d1, d2);
  if (Math.abs(den) < EPS) return null;
  const t = cross(sub(p3, p1), d2) / den;
  return add(p1, mul(d1, t));
}

/** Intersection parameters of segment p1..p2 against segment p3..p4. */
export function segmentIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const den = cross(d1, d2);
  if (Math.abs(den) < EPS) return null;
  const r = sub(p3, p1);
  const t = cross(r, d2) / den;
  const u = cross(r, d1) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return add(p1, mul(d1, t));
}

export function polylineLength(pts: Vec2[], closed: boolean): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) total += dist(pts[pts.length - 1], pts[0]);
  return total;
}

/** Shoelace area of a closed polygon; absolute value. */
export function polygonArea(pts: Vec2[]): number {
  if (pts.length < 3) return 0;
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    acc += p.x * q.y - q.x * p.y;
  }
  return Math.abs(acc) / 2;
}

export function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}
