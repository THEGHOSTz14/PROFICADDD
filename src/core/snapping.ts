import { BBox, Vec2, bboxContains, dist, segmentIntersect, sub } from './vec';
import { Entity, closestOnEntity, entitySnapPoints, flatten } from './entities';
import { Document } from './document';
import { View } from './view';

export type SnapMarkKind =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'quadrant'
  | 'nearest'
  | 'intersection'
  | 'grid';

export interface SnapMark {
  kind: SnapMarkKind;
  p: Vec2;
}

export interface SnapResult {
  p: Vec2;
  mark: SnapMark | null;
  /** True when the point was constrained by ortho mode. */
  ortho: boolean;
}

export interface SnapOptions {
  view: View;
  doc: Document;
  /** Raw cursor position in world coordinates. */
  raw: Vec2;
  gridEnabled: boolean;
  osnapEnabled: boolean;
  orthoEnabled: boolean;
  gridStep: number;
  /** Last picked point; ortho is measured from here. */
  base?: Vec2 | null;
  /** Entity ids to skip, typically the one being edited. */
  ignore?: string[];
  /** Tolerance in screen pixels. */
  tolerancePx?: number;
}

/** Lower number wins when two marks are the same distance from the cursor. */
const MARK_PRIORITY: Record<SnapMarkKind, number> = {
  endpoint: 0,
  intersection: 1,
  center: 2,
  quadrant: 3,
  midpoint: 4,
  nearest: 5,
  grid: 6,
};

/** Object snaps keep a short reach so a click stays where it was aimed. */
const OSNAP_PX = 8;
const NEAREST_PX = 5;
const GRID_PX = 8;

export function snapPoint(o: SnapOptions): SnapResult {
  const tol = o.view.pixelsToWorld(o.tolerancePx ?? OSNAP_PX);
  const nearestTol = o.view.pixelsToWorld(NEAREST_PX);
  const ignore = o.ignore && o.ignore.length ? new Set(o.ignore) : null;
  const marks: SnapMark[] = [];
  const near: Entity[] = [];

  if (o.osnapEnabled) {
    for (const e of entitiesNear(o.doc, o.raw, tol)) {
      if (ignore?.has(e.id)) continue;
      near.push(e);
      for (const sp of entitySnapPoints(e)) {
        if (dist(sp.p, o.raw) <= tol) marks.push(sp);
      }
      const c = closestOnEntity(e, o.raw, nearestTol);
      if (c && dist(c, o.raw) <= nearestTol) marks.push({ kind: 'nearest', p: c });
    }
    // Intersections cost a pair-wise outline sweep, so only look for them once
    // nothing closer has claimed the cursor.
    if (!marks.length) {
      for (let i = 0; i < near.length; i++) {
        for (let j = i + 1; j < near.length; j++) {
          for (const p of entityIntersections(near[i], near[j])) {
            if (dist(p, o.raw) <= tol) marks.push({ kind: 'intersection', p });
          }
        }
      }
    }
  }

  let best: SnapMark | null = null;
  if (marks.length) {
    marks.sort((a, b) => {
      const d = dist(a.p, o.raw) - dist(b.p, o.raw);
      if (Math.abs(d) > 1e-9) return d;
      return MARK_PRIORITY[a.kind] - MARK_PRIORITY[b.kind];
    });
    best = marks[0];
  }

  let p = best ? best.p : o.raw;
  let ortho = false;

  if (!best) {
    // Grid snap is magnetic, not absolute: the cursor only jumps to a crossing
    // when it is already on top of one. The reach is capped below half a box so
    // a fine grid cannot grab every point in view.
    if (o.gridEnabled && o.gridStep > 0) {
      const step = o.gridStep;
      const gridTol = Math.min(o.view.pixelsToWorld(GRID_PX), step * 0.35);
      const g = { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
      if (dist(g, p) <= gridTol) {
        p = g;
        best = { kind: 'grid', p };
      }
    }
    if (o.orthoEnabled && o.base) {
      const d = sub(p, o.base);
      p = Math.abs(d.x) >= Math.abs(d.y) ? { x: p.x, y: o.base.y } : { x: o.base.x, y: p.y };
      ortho = true;
    }
  }

  return { p, mark: best, ortho };
}

/** Visible, unlocked entities whose bounding box is within reach of p. */
export function entitiesNear(doc: Document, p: Vec2, radius: number): Entity[] {
  const out: Entity[] = [];
  for (const e of doc.all()) {
    const layer = doc.layer(e.layerId);
    if (layer && (!layer.visible || layer.locked)) continue;
    if (bboxContains(entityBox(e), p, radius)) out.push(e);
  }
  return out;
}

export function entityBox(e: Entity): BBox {
  let min = { x: Infinity, y: Infinity };
  let max = { x: -Infinity, y: -Infinity };
  const feed = (pt: Vec2): void => {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    min = { x: Math.min(min.x, pt.x), y: Math.min(min.y, pt.y) };
    max = { x: Math.max(max.x, pt.x), y: Math.max(max.y, pt.y) };
  };
  switch (e.kind) {
    case 'line':
    case 'rect':
      feed(e.a);
      feed(e.b);
      break;
    case 'polyline':
    case 'spline':
      for (const pt of e.points) feed(pt);
      break;
    case 'circle':
    case 'arc':
      feed({ x: e.center.x - e.radius, y: e.center.y - e.radius });
      feed({ x: e.center.x + e.radius, y: e.center.y + e.radius });
      break;
    case 'ellipse':
      feed({ x: e.center.x - Math.abs(e.u.x) - Math.abs(e.v.x), y: e.center.y - Math.abs(e.u.y) - Math.abs(e.v.y) });
      feed({ x: e.center.x + Math.abs(e.u.x) + Math.abs(e.v.x), y: e.center.y + Math.abs(e.u.y) + Math.abs(e.v.y) });
      break;
    case 'text': {
      const w = Math.max(...e.text.split('\n').map((s) => s.length)) * e.height * 0.6;
      feed(e.position);
      feed({ x: e.position.x + w, y: e.position.y + e.height });
      break;
    }
  }
  return { min, max };
}

const MAX_INTERSECTIONS = 32;

/** Points where the outlines of two entities cross. */
export function entityIntersections(a: Entity, b: Entity): Vec2[] {
  const out: Vec2[] = [];
  for (const ca of flatten(a, 0.15)) {
    for (const cb of flatten(b, 0.15)) {
      for (let i = 0; i + 1 < ca.length && out.length < MAX_INTERSECTIONS; i++) {
        for (let j = 0; j + 1 < cb.length; j++) {
          const p = segmentIntersect(ca[i], ca[i + 1], cb[j], cb[j + 1]);
          if (p) out.push(p);
        }
      }
    }
  }
  return out;
}
