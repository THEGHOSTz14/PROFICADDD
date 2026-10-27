import { Mat, Vec2, angleOf, dist, matMirror, matRotate, matScale, matTranslate, sub } from '../core/vec';
import { Entity, cloneEntity, transformEntity } from '../core/entities';
import {
  EditOutcome,
  copyEntities,
  deleteEntities,
  mirrorEntities,
  offsetCopy,
  offsetEntities,
  planTrim,
  rotateEntities,
  scaleEntities,
  trimAt,
  translateEntities,
} from '../core/edits';
import { Tool, ToolKit } from './types';

const DEG = 180 / Math.PI;

function numberKey(e: KeyboardEvent): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (/^[0-9]$/.test(e.key)) return e.key;
  if (e.key === ',') return '.';
  if (e.key === '.' || e.key === '-') return e.key;
  return null;
}

/**
 * Shared flow for the modify tools: optionally pick objects, then click the
 * defining points. Enter advances picking to point entry, Escape restarts.
 */
abstract class ModifyTool implements Tool {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly hint: string;

  protected ids: string[] = [];
  protected phase: 'pick' | 'points' = 'pick';
  protected typed = '';

  constructor(protected readonly kit: ToolKit) {}

  onStart(): void {
    this.typed = '';
    this.ids = [...this.kit.selection];
    this.phase = this.ids.length ? 'points' : 'pick';
    this.kit.setPreview(null);
    if (this.phase === 'points') this.beginPoints();
    else this.kit.setPrompt(`${this.label}: select objects, then press Enter`);
  }

  onDown(p: Vec2, raw: Vec2): void {
    if (this.phase === 'pick') {
      const hit = this.kit.pickAt(raw);
      if (!hit) return;
      if (!this.ids.includes(hit.id)) this.ids.push(hit.id);
      this.kit.replaceSelection(this.ids);
      this.kit.setPrompt(`${this.ids.length} selected — Enter to continue`);
      return;
    }
    this.onPoint(p, raw);
  }

  onMove(p: Vec2, raw: Vec2): void {
    if (this.phase === 'points') this.onMovePoints(p, raw);
  }

  onFinish(): void {
    if (this.phase === 'pick') {
      if (!this.ids.length) {
        this.kit.setStatus(`${this.label}: nothing selected`);
        return;
      }
      this.phase = 'points';
      this.beginPoints();
      return;
    }
    if (this.typed) {
      const value = Number(this.typed);
      this.typed = '';
      if (Number.isFinite(value)) this.onTyped(value);
      else {
        this.kit.setStatus(`${this.label}: not a number`);
        this.restart();
      }
      return;
    }
    this.commitPoints();
  }

  onCancel(): void {
    this.restart();
  }

  onKey(e: KeyboardEvent): boolean {
    if (this.phase !== 'points' || !this.acceptsTypedInput()) return false;
    const k = numberKey(e);
    if (!k) return false;
    if (k === '-' && this.typed.length) return false;
    if (k === '.' && this.typed.includes('.')) return false;
    this.typed += k;
    this.kit.setPrompt(`${this.label}: ${this.typed}${this.typedHint()} — Enter applies it`);
    return true;
  }

  protected abstract beginPoints(): void;
  protected abstract onPoint(p: Vec2, raw: Vec2): void;
  protected abstract commitPoints(): void;

  protected onMovePoints(_p: Vec2, _raw: Vec2): void {
    /* tools with a rubber band override this */
  }

  protected onTyped(_value: number): void {
    this.kit.setStatus(`${this.label}: this step needs a point, not a number`);
  }

  protected acceptsTypedInput(): boolean {
    return false;
  }

  protected typedHint(): string {
    return '';
  }

  protected ghost(matrix: Mat, rubber: Vec2[] = [], anchor: Vec2 | null = null): void {
    this.kit.setPreview({
      entities: this.targets().map((e) => transformEntity(cloneEntity(e), matrix)),
      rubber,
      anchor,
    });
  }

  protected targets(): Entity[] {
    const out: Entity[] = [];
    for (const id of this.ids) {
      const e = this.kit.entities.find((x) => x.id === id);
      if (e) out.push(e);
    }
    return out;
  }

  protected apply(label: string, outcome: EditOutcome, reselect = false): void {
    this.kit.setPreview(null);
    this.kit.commit(label, outcome);
    if (reselect && outcome.produced) this.kit.replaceSelection(outcome.produced.map((e) => e.id));
    this.restart();
  }

  protected restart(): void {
    this.kit.activateTool(this.id);
  }
}

/* ------------------------------------------------------------------ move -- */

export class MoveTool extends ModifyTool {
  readonly id = 'move';
  readonly label = 'Move';
  readonly hint = 'Move: click a base point, then the destination';
  private base: Vec2 | null = null;

  protected beginPoints(): void {
    this.base = null;
    this.kit.setPrompt('Move: specify the base point');
  }

  protected onPoint(p: Vec2): void {
    if (!this.base) {
      this.base = p;
      this.kit.setBase(p);
      this.kit.setPrompt('Move: specify the second point');
      return;
    }
    this.apply('Move', translateEntities(this.kit.doc, this.ids, sub(p, this.base)));
  }

  protected commitPoints(): void {
    this.kit.setStatus('Move needs two points');
    this.restart();
  }

  protected override onMovePoints(p: Vec2): void {
    if (!this.base) {
      this.kit.setPreview(null);
      return;
    }
    const delta = sub(p, this.base);
    this.ghost(matTranslate(delta));
    this.kit.setStatus(`Move: ${delta.x.toFixed(3)}, ${delta.y.toFixed(3)}`);
  }
}

/* ------------------------------------------------------------------ copy -- */

export class CopyTool extends ModifyTool {
  readonly id = 'copy';
  readonly label = 'Copy';
  readonly hint = 'Copy: click a base point, then the destination';
  private base: Vec2 | null = null;

  protected beginPoints(): void {
    this.base = null;
    this.kit.setPrompt('Copy: specify the base point');
  }

  protected onPoint(p: Vec2): void {
    if (!this.base) {
      this.base = p;
      this.kit.setBase(p);
      this.kit.setPrompt('Copy: specify the destination');
      return;
    }
    this.apply('Copy', copyEntities(this.kit.doc, this.ids, sub(p, this.base)), true);
  }

  protected commitPoints(): void {
    this.kit.setStatus('Copy needs two points');
    this.restart();
  }

  protected override onMovePoints(p: Vec2): void {
    if (!this.base) return;
    const delta = sub(p, this.base);
    this.ghost(matTranslate(delta));
    this.kit.setStatus(`Copy: ${delta.x.toFixed(3)}, ${delta.y.toFixed(3)}`);
  }
}

/* ---------------------------------------------------------------- rotate -- */

export class RotateTool extends ModifyTool {
  readonly id = 'rotate';
  readonly label = 'Rotate';
  readonly hint = 'Rotate: centre, reference point, target point — or type an angle';
  private center: Vec2 | null = null;
  private reference: Vec2 | null = null;

  override acceptsTypedInput(): boolean {
    return true;
  }

  protected override typedHint(): string {
    return ' degrees';
  }

  protected beginPoints(): void {
    this.center = null;
    this.reference = null;
    this.kit.setPrompt('Rotate: specify the centre point');
  }

  /** Angle relative to the reference ray, as the cursor moves. */
  private angleAt(p: Vec2): number {
    if (!this.center || !this.reference) return 0;
    return angleOf(this.center, p) - angleOf(this.center, this.reference);
  }

  protected onPoint(p: Vec2): void {
    if (!this.center) {
      this.center = p;
      this.kit.setBase(p);
      this.kit.setPrompt('Rotate: specify a reference angle point');
      return;
    }
    if (!this.reference) {
      if (dist(p, this.center) < 1e-9) {
        this.kit.setStatus('Rotate: the reference point is on the centre');
        return;
      }
      this.reference = p;
      this.kit.setPrompt('Rotate: specify the new angle point, or type degrees');
      return;
    }
    this.apply('Rotate', rotateEntities(this.kit.doc, this.ids, this.center, this.angleAt(p)));
  }

  protected override onTyped(degrees: number): void {
    if (!this.center) {
      this.kit.setStatus('Rotate: specify the centre first');
      return;
    }
    this.apply('Rotate', rotateEntities(this.kit.doc, this.ids, this.center, degrees / DEG));
  }

  protected commitPoints(): void {
    this.kit.setStatus('Rotate needs a centre and an angle point');
    this.restart();
  }

  protected override onMovePoints(p: Vec2): void {
    if (!this.center || !this.reference) return;
    const radians = this.angleAt(p);
    this.ghost(matRotate(radians, this.center), [this.center, p], this.center);
    this.kit.setStatus(`Rotate: ${(radians * DEG).toFixed(2)}°`);
  }
}

/* ---------------------------------------------------------------- mirror -- */

export class MirrorTool extends ModifyTool {
  readonly id = 'mirror';
  readonly label = 'Mirror';
  readonly hint = 'Mirror: click two points on the mirror line (Shift mirrors in place)';
  private a: Vec2 | null = null;

  protected beginPoints(): void {
    this.a = null;
    this.kit.setPrompt('Mirror: specify the first point of the mirror line');
  }

  protected onPoint(p: Vec2): void {
    if (!this.a) {
      this.a = p;
      this.kit.setBase(p);
      this.kit.setPrompt('Mirror: specify the second point of the mirror line');
      return;
    }
    const axis = sub(p, this.a);
    if (dist(axis, { x: 0, y: 0 }) < 1e-9) {
      this.kit.setStatus('Mirror: the two line points are the same');
      return;
    }
    const keep = !this.kit.shiftKey;
    this.apply(
      'Mirror',
      mirrorEntities(this.kit.doc, this.ids, this.a, axis, keep),
      keep
    );
  }

  protected commitPoints(): void {
    this.kit.setStatus('Mirror needs two line points');
    this.restart();
  }

  protected override onMovePoints(p: Vec2): void {
    if (!this.a) return;
    const axis = sub(p, this.a);
    if (dist(axis, { x: 0, y: 0 }) < 1e-9) return;
    this.ghost(matMirror(this.a, axis), [this.a, p], this.a);
  }
}

/* ----------------------------------------------------------------- scale -- */

export class ScaleTool extends ModifyTool {
  readonly id = 'scale';
  readonly label = 'Scale';
  readonly hint = 'Scale: anchor, reference point, target point — or type a factor';
  private anchor: Vec2 | null = null;
  private reference: Vec2 | null = null;

  override acceptsTypedInput(): boolean {
    return true;
  }

  protected override typedHint(): string {
    return ' factor';
  }

  protected beginPoints(): void {
    this.anchor = null;
    this.reference = null;
    this.kit.setPrompt('Scale: specify the anchor point');
  }

  protected onPoint(p: Vec2): void {
    if (!this.anchor) {
      this.anchor = p;
      this.kit.setBase(p);
      this.kit.setPrompt('Scale: specify the reference length point');
      return;
    }
    if (!this.reference) {
      if (dist(p, this.anchor) < 1e-9) {
        this.kit.setStatus('Scale: the reference point is on the anchor');
        return;
      }
      this.reference = p;
      this.kit.setPrompt('Scale: specify the new length, or type a factor');
      return;
    }
    const factor = dist(p, this.anchor) / dist(this.reference, this.anchor);
    this.apply('Scale', scaleEntities(this.kit.doc, this.ids, this.anchor, factor));
  }

  protected override onTyped(factor: number): void {
    if (!this.anchor) {
      this.kit.setStatus('Scale: specify the anchor first');
      return;
    }
    this.apply('Scale', scaleEntities(this.kit.doc, this.ids, this.anchor, factor));
  }

  protected commitPoints(): void {
    this.kit.setStatus('Scale needs an anchor, reference and target');
    this.restart();
  }

  protected override onMovePoints(p: Vec2): void {
    if (!this.anchor || !this.reference) return;
    const reference = dist(this.reference, this.anchor);
    if (reference < 1e-9) return;
    const factor = dist(p, this.anchor) / reference;
    this.ghost(matScale(factor, this.anchor), [this.anchor, p], this.anchor);
    this.kit.setStatus(`Scale: ${factor.toFixed(4)}`);
  }
}

/* ---------------------------------------------------------------- offset -- */

export class OffsetTool extends ModifyTool {
  readonly id = 'offset';
  readonly label = 'Offset';
  readonly hint = 'Offset: pick curves, Enter, type or measure a distance, click the side';
  private distance: number | null = null;
  private anchor: Vec2 | null = null;

  override acceptsTypedInput(): boolean {
    return true;
  }

  protected override typedHint(): string {
    return ' distance';
  }

  protected beginPoints(): void {
    this.distance = null;
    this.anchor = null;
    this.kit.setPrompt('Offset: type a distance, or click two points to measure it');
  }

  protected onPoint(p: Vec2): void {
    if (this.distance === null) {
      if (!this.anchor) {
        this.anchor = p;
        this.kit.setBase(p);
        this.kit.setPrompt('Offset: click the second point of the distance');
        return;
      }
      const measured = dist(p, this.anchor);
      if (measured < 1e-9) {
        this.kit.setStatus('Offset: the two points are the same');
        return;
      }
      this.distance = measured;
      this.anchor = null;
      this.kit.setPrompt(`Offset ${this.distance.toFixed(3)}: click the side for each curve`);
      return;
    }
    this.apply('Offset', offsetEntities(this.kit.doc, this.ids, this.distance, p), true);
  }

  protected override onTyped(value: number): void {
    if (value === 0) {
      this.kit.setStatus('Offset: distance must not be zero');
      return;
    }
    this.distance = Math.abs(value);
    this.kit.setPrompt(`Offset ${this.distance.toFixed(3)}: click the side for each curve`);
  }

  protected commitPoints(): void {
    if (this.distance === null) {
      this.kit.setStatus('Offset: specify a distance first');
      return;
    }
    this.kit.setStatus('Offset: click the side to place each copy');
  }

  /**
   * Preview every candidate copy. offsetCopy is pure, so nothing is written to
   * the document until the user commits a side.
   */
  protected override onMovePoints(p: Vec2): void {
    if (this.distance === null) {
      if (this.anchor) {
        this.kit.setPreview({ entities: [], rubber: [this.anchor, p], anchor: this.anchor });
        this.kit.setStatus(`Offset distance: ${dist(p, this.anchor).toFixed(3)}`);
      }
      return;
    }
    const ghosts: Entity[] = [];
    for (const e of this.targets()) {
      const copy = offsetCopy(e, this.distance, p);
      if (copy) ghosts.push(copy);
    }
    this.kit.setPreview({ entities: ghosts, rubber: [], anchor: p });
  }
}

/* ----------------------------------------------------------------- trim -- */

/**
 * Trim differs from the other modify tools: the first picks are cutting edges,
 * then every click removes the stretch of geometry around it.
 */
export class TrimTool implements Tool {
  readonly id = 'trim';
  readonly label = 'Trim';
  readonly hint = 'Trim: pick cutting edges, Enter, then click the parts to remove';
  readonly repeatable = true;

  private cutters: string[] = [];
  private phase: 'edges' | 'parts' = 'edges';

  constructor(private readonly kit: ToolKit) {}

  onStart(): void {
    this.cutters = [];
    this.phase = 'edges';
    this.kit.setPreview(null);
    this.kit.setPrompt(this.hint);
  }

  onDown(p: Vec2, raw: Vec2): void {
    const hit = this.kit.pickAt(raw);
    if (!hit) return;
    if (this.phase === 'edges') {
      if (hit.id && !this.cutters.includes(hit.id)) this.cutters.push(hit.id);
      this.kit.replaceSelection(this.cutters);
      this.kit.setPrompt(`${this.cutters.length} cutting edge(s) — Enter to start trimming`);
      return;
    }
    const outcome = trimAt(this.kit.doc, this.cutters, hit.id, p);
    this.kit.commit('Trim', outcome);
    if (outcome.produced) this.kit.addToSelection(outcome.produced[0].id);
  }

  onMove(p: Vec2, raw: Vec2): void {
    if (this.phase !== 'parts') return;
    const hit = this.kit.pickAt(raw);
    if (!hit || this.cutters.includes(hit.id)) {
      this.kit.setPreview(null);
      return;
    }
    const result = planTrim(this.kit.doc, this.cutters, hit.id, p);
    this.kit.setPreview({ entities: result.ok ? result.plan.replacement : [], rubber: [], anchor: null });
  }

  onFinish(): void {
    if (this.phase === 'edges') {
      if (!this.cutters.length) {
        this.kit.setStatus('Trim: pick at least one cutting edge');
        return;
      }
      this.phase = 'parts';
      this.kit.setPrompt('Trim: click the parts to remove, Enter or Escape to stop');
      return;
    }
    this.kit.setPreview(null);
    this.kit.activateTool('select');
  }

  onCancel(): void {
    this.kit.setPreview(null);
    this.kit.activateTool('select');
  }
}

/* ---------------------------------------------------------------- erase -- */

export class EraseTool implements Tool {
  readonly id = 'erase';
  readonly label = 'Erase';
  readonly hint = 'Erase: click geometry to delete it';
  readonly repeatable = true;

  constructor(private readonly kit: ToolKit) {}

  onStart(): void {
    this.kit.setPrompt(this.hint);
  }

  onDown(_p: Vec2, raw: Vec2): void {
    const hit = this.kit.pickAt(raw);
    if (!hit) return;
    this.kit.commit('Erase', deleteEntities(this.kit.doc, [hit.id]));
  }

  onFinish(): void {
    this.kit.activateTool('select');
  }

  onCancel(): void {
    this.kit.activateTool('select');
  }
}
