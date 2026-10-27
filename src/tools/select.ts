import { Vec2, dist, matTranslate } from '../core/vec';
import { Entity, cloneEntity, transformEntity } from '../core/entities';
import { copyEntities, translateEntities } from '../core/edits';
import { Tool, ToolKit } from './types';

const DRAG_THRESHOLD_PX = 4;

type Mode = 'idle' | 'pending' | 'move' | 'marquee';

/**
 * Default tool: click or window-select, then drag geometry to move it.
 * Ctrl turns the drag into a copy; Shift adds to or removes from the selection.
 */
export class SelectTool implements Tool {
  readonly id = 'select';
  readonly label = 'Select';
  readonly hint = 'Select: click, drag a window, or drag geometry to move it';
  readonly cursor = 'default';

  private mode: Mode = 'idle';
  private base: Vec2 | null = null;
  private downScreen: Vec2 | null = null;
  private marqueeFrom: Vec2 | null = null;
  private dragTargets: Entity[] = [];
  private copyOnRelease = false;

  constructor(private readonly kit: ToolKit) {}

  onStart(): void {
    this.reset();
    this.kit.setPrompt(this.hint);
  }

  onCancel(): void {
    this.reset();
    this.kit.clearSelection();
  }

  onFinish(): void {
    this.reset();
    this.kit.clearSelection();
  }

  onDown(p: Vec2, raw: Vec2): void {
    const screen = this.kit.toScreen(raw);
    this.downScreen = screen;
    const hit = this.kit.pickAt(raw);

    if (hit) {
      if (this.kit.shiftKey) {
        this.kit.toggleSelection(hit.id);
        this.mode = 'idle';
        return;
      }
      if (!this.kit.selection.has(hit.id)) this.kit.replaceSelection([hit.id]);
      this.dragTargets = this.selectedEntities();
      this.base = p;
      this.copyOnRelease = this.kit.ctrlKey;
      this.mode = 'pending';
      return;
    }

    if (!this.kit.shiftKey) this.kit.clearSelection();
    this.marqueeFrom = screen;
    this.mode = 'marquee';
  }

  onMove(p: Vec2): void {
    if (this.mode === 'pending' && this.downScreen) {
      if (dist(this.kit.toScreen(p), this.downScreen) > DRAG_THRESHOLD_PX) this.mode = 'move';
    }
    if (this.mode === 'move' && this.base) {
      const delta = { x: p.x - this.base.x, y: p.y - this.base.y };
      this.kit.setPreview({
        entities: this.dragTargets.map((e) => transformEntity(cloneEntity(e), matTranslate(delta))),
        rubber: [],
        anchor: null,
      });
      this.kit.setStatus(`Move: ${fmt(delta.x)}, ${fmt(delta.y)}`);
      return;
    }
    if (this.mode === 'marquee' && this.marqueeFrom) {
      const to = this.kit.toScreen(p);
      this.kit.setMarquee({ a: this.marqueeFrom, b: to, crossing: to.x < this.marqueeFrom.x });
    }
  }

  onUp(p: Vec2): void {
    if (this.mode === 'move' && this.base) {
      const delta = { x: p.x - this.base.x, y: p.y - this.base.y };
      const ids = this.dragTargets.map((e) => e.id);
      if (Math.abs(delta.x) > 1e-9 || Math.abs(delta.y) > 1e-9) {
        if (this.copyOnRelease) {
          const outcome = copyEntities(this.kit.doc, ids, delta);
          this.kit.commit('Copy', outcome);
          if (outcome.produced) this.kit.replaceSelection(outcome.produced.map((e) => e.id));
        } else {
          this.kit.commit('Move', translateEntities(this.kit.doc, ids, delta));
        }
      }
    } else if (this.mode === 'marquee' && this.marqueeFrom) {
      const to = this.kit.toScreen(p);
      const hit = this.kit.selectInRect(this.marqueeFrom, to, to.x < this.marqueeFrom.x);
      if (this.kit.shiftKey) for (const id of hit) this.kit.addToSelection(id);
      else this.kit.replaceSelection(hit);
    }
    this.reset();
    this.kit.requestRender();
  }

  private selectedEntities(): Entity[] {
    const out: Entity[] = [];
    for (const id of this.kit.selection) {
      const e = this.kit.entities.find((x) => x.id === id);
      if (e) out.push(e);
    }
    return out;
  }

  private reset(): void {
    this.mode = 'idle';
    this.base = null;
    this.downScreen = null;
    this.marqueeFrom = null;
    this.dragTargets = [];
    this.copyOnRelease = false;
    this.kit.setPreview(null);
    this.kit.setMarquee(null);
  }
}

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}
