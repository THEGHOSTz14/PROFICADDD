import {
  Mat,
  Vec2,
  add,
  closestPointOnSegment,
  clone,
  dist,
  dot,
  matMirror,
  matRotate,
  matScale,
  matTranslate,
  mul,
  norm,
  perp,
  segmentIntersect,
  sub,
} from './vec';
import {
  Entity,
  LineEntity,
  PolylineEntity,
  RectEntity,
  cloneEntity,
  flatten,
  makeLine,
  makePolyline,
  newId,
  transformEntity,
} from './entities';
import { Document } from './document';
import { Change, Mutation, emptyMutation, insertEntities, removeEntities, replaceEntities } from './history';

export interface EditOutcome {
  mutation: Mutation;
  /** Shown in the status bar; how a tool reports "nothing to do". */
  message?: string;
  /** Entities the operation created, for follow-up selection. */
  produced?: Entity[];
  /** Ids the operation removed from the selection. */
  consumed?: string[];
}

const NOTHING_SELECTED = 'Nothing selected';
const TOL = 0.05;

function selectedEntities(doc: Document, ids: Iterable<string>): Entity[] {
  const out: Entity[] = [];
  for (const id of ids) {
    const e = doc.get(id);
    if (e) out.push(e);
  }
  return out;
}

function editable(doc: Document, entities: Entity[]): Entity[] {
  return entities.filter((e) => {
    const l = doc.layer(e.layerId);
    return !l || (l.visible && !l.locked);
  });
}

function transformAll(doc: Document, entities: Entity[], m: Mat): Mutation {
  const pairs: Change[] = entities.map((before) => ({ before, after: transformEntity(before, m) }));
  return replaceEntities(doc, pairs);
}

export function translateEntities(doc: Document, ids: Iterable<string>, delta: Vec2): EditOutcome {
  const targets = editable(doc, selectedEntities(doc, ids));
  if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
  return { mutation: transformAll(doc, targets, matTranslate(delta)), message: `Moved ${targets.length}` };
}

export function rotateEntities(
  doc: Document,
  ids: Iterable<string>,
  about: Vec2,
  radians: number
): EditOutcome {
  const targets = editable(doc, selectedEntities(doc, ids));
  if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
  return { mutation: transformAll(doc, targets, matRotate(radians, about)), message: `Rotated ${targets.length}` };
}

export function mirrorEntities(
  doc: Document,
  ids: Iterable<string>,
  point: Vec2,
  direction: Vec2,
  keepOriginals = true
): EditOutcome {
  const targets = editable(doc, selectedEntities(doc, ids));
  if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
  if (!keepOriginals) {
    return { mutation: transformAll(doc, targets, matMirror(point, direction)), message: `Mirrored ${targets.length}` };
  }
  const copies = targets.map((e) => transformEntity(cloneEntity(e), matMirror(point, direction)));
  return {
    mutation: insertEntities(doc, copies),
    message: `Copied and mirrored ${copies.length}`,
    produced: copies,
  };
}

export function scaleEntities(
  doc: Document,
  ids: Iterable<string>,
  about: Vec2,
  factor: number
): EditOutcome {
  const targets = editable(doc, selectedEntities(doc, ids));
  if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
  if (!(factor > 0)) return { mutation: emptyMutation(), message: 'Scale factor must be positive' };
  return {
    mutation: transformAll(doc, targets, matScale(factor, about)),
    message: `Scaled ${targets.length} by ${factor.toFixed(3)}`,
  };
}

/** Duplicate and move the copies; the originals stay put. */
export function copyEntities(doc: Document, ids: Iterable<string>, delta: Vec2): EditOutcome {
  const targets = selectedEntities(doc, ids);
  if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
  const copies = targets.map((e) => transformEntity(cloneEntity(e), matTranslate(delta)));
  return { mutation: insertEntities(doc, copies), message: `Copied ${copies.length}`, produced: copies };
}

export function deleteEntities(doc: Document, ids: Iterable<string>): EditOutcome {
  const targets = editable(doc, selectedEntities(doc, ids));
  if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
  return {
    mutation: removeEntities(doc, targets.map((e) => e.id)),
    message: `Deleted ${targets.length}`,
    consumed: targets.map((e) => e.id),
  };
}

export function moveToLayer(doc: Document, ids: Iterable<string>, layerId: string): EditOutcome {
  const targets = selectedEntities(doc, ids);
  if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
  const pairs: Change[] = targets.map((before) => ({ before, after: { ...before, layerId } }));
  return { mutation: replaceEntities(doc, pairs), message: 'Moved to layer' };
}

export function setStyle(
  doc: Document,
  ids: Iterable<string>,
  style: { color?: string; lineweight?: number; linetype?: RectEntity['linetype'] }
): EditOutcome {
  const targets = selectedEntities(doc, ids);
  if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
  const pairs: Change[] = targets.map((before) => {
    const after = { ...before };
    if (style.color !== undefined) after.color = style.color;
    if (style.lineweight !== undefined) after.lineweight = style.lineweight;
    if (style.linetype !== undefined) after.linetype = style.linetype;
    return { before, after };
  });
  return { mutation: replaceEntities(doc, pairs), message: 'Changed style' };
}

/** Offset distance magnitude is used with `side` to choose the direction. */
export function offsetEntities(
  doc: Document,
  ids: Iterable<string>,
  distance: number,
  side: Vec2
): EditOutcome {
  const targets = editable(doc, selectedEntities(doc, ids));
  if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
  const produced: Entity[] = [];
  const unsupported: string[] = [];
  for (const e of targets) {
    const o = offsetCopy(e, distance, side);
    if (o) produced.push(o);
    else unsupported.push(e.kind);
  }
  if (!produced.length) {
    return {
      mutation: emptyMutation(),
      message: `Offset cannot handle: ${[...new Set(unsupported)].join(', ') || 'selection'}`,
    };
  }
  return {
    mutation: insertEntities(doc, produced),
    message: `Offset ${produced.length}${unsupported.length ? `, ${unsupported.length} skipped` : ''}`,
    produced,
  };
}

/** Pure offset: build the copy without touching the document. */
export function offsetCopy(e: Entity, distance: number, side: Vec2): Entity | null {
  return offsetOne(e, distance, side);
}

function styleOf(e: Entity): { color?: string; lineweight?: number; linetype?: RectEntity['linetype'] } {
  return { color: e.color, lineweight: e.lineweight, linetype: e.linetype };
}

function offsetOne(e: Entity, d: number, side: Vec2): Entity | null {
  switch (e.kind) {
    case 'line':
      return offsetLine(e, d, side);
    case 'circle': {
      const outward = dist(side, e.center) >= e.radius;
      const r = e.radius + (outward ? Math.abs(d) : -Math.abs(d));
      return r <= 1e-9 ? null : offsetCircle(e, r);
    }
    case 'arc': {
      const outward = dist(side, e.center) >= e.radius;
      const r = e.radius + (outward ? Math.abs(d) : -Math.abs(d));
      return r <= 1e-9 ? null : { ...e, id: newId(), radius: r };
    }
    case 'polyline':
      return offsetPolyline(e, d, side);
    case 'rect':
      return offsetPolyline(rectAsPolyline(e), d, side);
    default:
      return null;
  }
}

function offsetCircle(e: Entity & { kind: 'circle' }, radius: number): Entity {
  return { ...e, id: newId(), radius };
}

function rectAsPolyline(r: RectEntity): PolylineEntity {
  const points = [
    { x: r.a.x, y: r.a.y },
    { x: r.b.x, y: r.a.y },
    { x: r.b.x, y: r.b.y },
    { x: r.a.x, y: r.b.y },
  ];
  return { ...r, kind: 'polyline', points, closed: true };
}

function sideNormal(dir: Vec2, origin: Vec2, side: Vec2): Vec2 {
  const n = perp(norm(dir));
  return dot(sub(side, origin), n) >= 0 ? n : mul(n, -1);
}

function offsetLine(e: LineEntity, d: number, side: Vec2): LineEntity {
  const o = mul(sideNormal(sub(e.b, e.a), e.a, side), Math.abs(d));
  return makeLine(e.layerId, add(e.a, o), add(e.b, o), styleOf(e));
}

/**
 * Mitre offset: shift each segment, then intersect neighbours to find the
 * offset vertex. Parallel neighbours keep their shared shifted point.
 */
function offsetPolyline(e: PolylineEntity, d: number, side: Vec2): PolylineEntity | null {
  const pts = e.points;
  if (pts.length < 2) return null;
  const first = sub(pts[1], pts[0]);
  if (dist(first, { x: 0, y: 0 }) < 1e-12) return null;
  const n = sideNormal(first, pts[0], side);
  const amount = Math.abs(d);
  const segCount = e.closed ? pts.length : pts.length - 1;
  const shifted: { a: Vec2; b: Vec2 }[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const sn = sideNormal(sub(b, a), a, add(a, n));
    shifted.push({ a: add(a, mul(sn, amount)), b: add(b, mul(sn, amount)) });
  }
  const out: Vec2[] = [];
  for (let i = 0; i < segCount; i++) {
    const cur = shifted[i];
    if (e.closed) {
      const prev = shifted[(i - 1 + segCount) % segCount];
      out.push(mitreOrShared(prev, cur, amount));
    } else {
      if (i === 0) out.push(cur.a);
      const next = shifted[i + 1];
      out.push(next ? mitreOrShared(cur, next, amount) : cur.b);
    }
  }
  if (out.length < 2 || out.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  return makePolyline(e.layerId, out, e.closed, styleOf(e));
}

function mitreOrShared(prev: { a: Vec2; b: Vec2 }, cur: { a: Vec2; b: Vec2 }, amount: number): Vec2 {
  const p = segmentIntersect(prev.a, prev.b, cur.a, cur.b);
  if (p && dist(p, cur.a) <= amount * 8) return p;
  return cur.a;
}

/* ------------------------------------------------------------------ trim -- */

/** A path measured by arc length, which is what trimming needs to reason about. */
class LengthPath {
  readonly cum: number[];
  readonly total: number;
  constructor(readonly pts: Vec2[], readonly closed: boolean) {
    this.cum = [0];
    for (let i = 0; i + 1 < pts.length; i++) this.cum.push(this.cum[i] + dist(pts[i], pts[i + 1]));
    this.total = this.cum[this.cum.length - 1];
  }

  pointAt(s: number): Vec2 {
    if (this.total <= 0) return clone(this.pts[0]);
    const wrapped = this.closed ? mod(s, this.total) : clamp(s, 0, this.total);
    let i = 0;
    while (i + 1 < this.cum.length - 1 && this.cum[i + 1] < wrapped) i++;
    const a = this.pts[i];
    const b = this.pts[Math.min(i + 1, this.pts.length - 1)];
    const segLen = this.cum[Math.min(i + 1, this.cum.length - 1)] - this.cum[i];
    const t = segLen > 1e-12 ? (wrapped - this.cum[i]) / segLen : 0;
    return add(a, mul(sub(b, a), t));
  }

  /** Length parameter of the point on the path nearest p. */
  paramOf(p: Vec2): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i + 1 < this.pts.length; i++) {
      const c = closestPointOnSegment(p, this.pts[i], this.pts[i + 1]);
      const d = dist(p, c);
      if (d < bestD) {
        bestD = d;
        best = this.cum[i] + dist(this.pts[i], c);
      }
    }
    return best;
  }

  /** Sample the path between two length parameters (inclusive). */
  slice(from: number, to: number): Vec2[] {
    const out: Vec2[] = [this.pointAt(from)];
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let i = 1; i < this.cum.length; i++) {
      if (this.cum[i] > lo && this.cum[i] < hi) out.push(clone(this.pts[i]));
    }
    out.push(this.pointAt(to));
    return dedupe(out);
  }
}

function mod(a: number, m: number): number {
  return ((a % m) + m) % m;
}

function clamp(a: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, a));
}

function dedupe(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    if (!out.length || dist(out[out.length - 1], p) > 1e-9) out.push(p);
  }
  return out;
}

export interface TrimPlan {
  targetId: string;
  /** Entities that replace the target; empty means the target is removed. */
  replacement: Entity[];
}

export type TrimResult = { ok: true; plan: TrimPlan } | { ok: false; message: string };

/**
 * Work out what trimming would produce, without touching the document. Tools
 * call this for rubber-band previews; `trimAt` applies it.
 */
export function planTrim(
  doc: Document,
  cutterIds: string[],
  targetId: string,
  click: Vec2
): TrimResult {
  const target = doc.get(targetId);
  if (!target) return { ok: false, message: 'Nothing to trim there' };
  const cutters = editable(doc, selectedEntities(doc, cutterIds));
  if (!cutters.length) return { ok: false, message: 'Pick a cutting edge first' };

  const chains = flatten(target, TOL);
  if (chains.length !== 1 || chains[0].length < 2) {
    return { ok: false, message: 'Trim needs a single-path target' };
  }
  const path = new LengthPath(chains[0], isClosedChain(chains[0]));
  if (path.total <= 1e-9) return { ok: false, message: 'Target is degenerate' };

  const breaks = cutterBreaks(path, cutters);
  const sClick = path.paramOf(click);
  if (breaks.length === 0) return { ok: false, message: 'No intersection to trim against' };

  let run: [number, number] | null = null;
  if (path.closed) {
    if (breaks.length < 2) return { ok: false, message: 'Closed target needs two intersections' };
    const before = breaks.filter((b) => b < sClick).sort((a, b) => b - a)[0];
    const after = breaks.filter((b) => b > sClick).sort((a, b) => a - b)[0];
    const lo = before ?? Math.min(...breaks) - path.total;
    const hi = after ?? Math.max(...breaks) + path.total;
    if (lo < sClick && sClick < hi) run = [lo, hi];
  } else {
    const bounds = [0, ...breaks.filter((b) => b > 0 && b < path.total), path.total].sort((a, b) => a - b);
    for (let i = 0; i + 1 < bounds.length; i++) {
      if (bounds[i] <= sClick && sClick <= bounds[i + 1]) {
        run = [bounds[i], bounds[i + 1]];
        break;
      }
    }
  }
  if (!run) return { ok: false, message: 'Nothing to trim there' };
  const [lo, hi] = run;
  if (hi - lo < 1e-9) return { ok: false, message: 'Nothing to trim there' };

  const remainders: Vec2[][] = [];
  if (path.closed) {
    remainders.push(path.slice(hi, lo + path.total));
  } else {
    if (lo > 1e-9) remainders.push(path.slice(0, lo));
    if (hi < path.total - 1e-9) remainders.push(path.slice(hi, path.total));
  }

  const replacement = remainders
    .filter((r) => r.length >= 2 && polylineSpan(r) > 1e-6)
    .map((r, i) => rebuild(target, r, i === 0 ? target.id : newId()));

  return { ok: true, plan: { targetId, replacement } };
}

export function trimAt(doc: Document, cutterIds: string[], targetId: string, click: Vec2): EditOutcome {
  const result = planTrim(doc, cutterIds, targetId, click);
  if (!result.ok) return { mutation: emptyMutation(), message: result.message };
  const { plan } = result;
  const target = doc.get(plan.targetId);
  if (!target) return { mutation: emptyMutation(), message: 'Nothing to trim there' };

  if (!plan.replacement.length) {
    return {
      mutation: removeEntities(doc, [plan.targetId]),
      message: 'Removed trimmed geometry',
      consumed: [plan.targetId],
    };
  }

  const parts: Mutation[] = [];
  for (const e of plan.replacement) {
    if (e.id === plan.targetId) parts.push(replaceEntities(doc, [{ before: target, after: e }]));
    else parts.push(insertEntities(doc, [e]));
  }
  const extras = plan.replacement.filter((e) => e.id !== plan.targetId);
  return {
    mutation: combineMutations(parts),
    message: 'Trimmed',
    produced: extras.length ? extras : undefined,
  };
}

function combineMutations(parts: Mutation[]): Mutation {
  const out = emptyMutation();
  for (const p of parts) {
    out.added.push(...p.added);
    out.removed.push(...p.removed);
    out.changed.push(...p.changed);
  }
  return out;
}

function polylineSpan(pts: Vec2[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
  return d;
}

function isClosedChain(pts: Vec2[]): boolean {
  return pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-6;
}

/** Length parameters where the path crosses any cutter. */
function cutterBreaks(path: LengthPath, cutters: Entity[]): number[] {
  const found: number[] = [];
  for (const c of cutters) {
    for (const chain of flatten(c, TOL)) {
      for (let i = 0; i + 1 < path.pts.length; i++) {
        for (let j = 0; j + 1 < chain.length; j++) {
          const p = segmentIntersect(path.pts[i], path.pts[i + 1], chain[j], chain[j + 1]);
          if (p) found.push(path.cum[i] + dist(path.pts[i], p));
        }
      }
    }
  }
  const unique = [...new Set(found.map((v) => Math.round(v * 1e6) / 1e6))];
  return unique.sort((a, b) => a - b);
}

/** Rebuild a trimmed run, keeping it a line when the run is straight. */
function rebuild(target: Entity, pts: Vec2[], id: string): Entity {
  const style = styleOf(target);
  const clean = dedupe(pts);
  if (clean.length === 2 || (clean.length > 2 && isStraight(clean))) {
    return { ...makeLine(target.layerId, clean[0], clean[clean.length - 1], style), id };
  }
  return { ...makePolyline(target.layerId, clean, false, style), id };
}

function isStraight(pts: Vec2[]): boolean {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dir = sub(b, a);
  const l = dist(a, b);
  if (l < 1e-9) return true;
  for (let i = 1; i + 1 < pts.length; i++) {
    const d = dist(a, pts[i]);
    if (d < 1e-9) continue;
    const cross = Math.abs(dir.x * sub(pts[i], a).y - dir.y * sub(pts[i], a).x) / l;
    if (cross / d > 1e-4) return false;
  }
  return true;
}

/** Distance of the nearest point on an entity outline, for tool read-outs. */
export function outlineDistance(doc: Document, id: string, p: Vec2): number {
  const e = doc.get(id);
  if (!e) return Infinity;
  let best = Infinity;
  for (const chain of flatten(e, TOL)) {
    for (let i = 0; i + 1 < chain.length; i++) {
      best = Math.min(best, dist(p, closestPointOnSegment(p, chain[i], chain[i + 1])));
    }
  }
  return best;
}
