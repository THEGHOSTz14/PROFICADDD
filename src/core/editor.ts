import { Vec2, bboxContains } from './vec';
import { Entity, entityBBox } from './entities';
import { Document } from './document';
import { View, renderScale, unitGridStep } from './view';
import { History, Mutation } from './history';
import { Marquee, Preview, Renderer, RenderState } from './renderer';
import { SnapResult, entityBox, snapPoint } from './snapping';
import { EditOutcome, deleteEntities } from './edits';
import { Tool, ToolFactory, ToolKit } from '../tools/types';

export interface EditorSettings {
  grid: boolean;
  /** Snap the cursor to nearby grid crossings. */
  snap: boolean;
  osnap: boolean;
  ortho: boolean;
  /** Grid box size in document units: 1 means one box is one unit. */
  gridDivisions: number;
}

export interface EditorHooks {
  onStatus?(text: string): void;
  onCursor?(p: Vec2, mark: string | null): void;
  onPrompt?(text: string): void;
  onSelectionChanged?(count: number): void;
  onHistoryChanged?(canUndo: boolean, canRedo: boolean): void;
  onToolChanged?(id: string | null): void;
  /** Fired after a frame is painted; the grid step follows zoom, so the HUD
   *  needs to re-read it whenever the view changes. */
  onRendered?(): void;
  /** The UI owns text entry widgets; tools ask for a string and get a callback. */
  onRequestText?(at: Vec2, done: (text: string, height: number) => void): void;
}

const PICK_TOLERANCE_PX = 8;

export class Editor implements ToolKit {
  readonly doc = new Document();
  readonly view = new View();
  readonly history = new History();
  readonly selection = new Set<string>();
  readonly settings: EditorSettings = {
    grid: true,
    snap: true,
    osnap: true,
    ortho: false,
    gridDivisions: 1,
  };

  hooks: EditorHooks = {};
  /** Upper-case key -> tool id, filled in by the UI layer. */
  readonly hotkeys = new Map<string, string>();
  tool: Tool | null = null;
  hoverId: string | null = null;
  preview: Preview | null = null;
  marquee: Marquee | null = null;
  cursor: Vec2 = { x: 0, y: 0 };
  private switchingTool = false;
  snapResult: SnapResult | null = null;

  private renderer: Renderer | null = null;
  private factories = new Map<string, ToolFactory>();
  private base: Vec2 | null = null;
  private frameRequested = false;
  private panning = false;
  private lastPointer: Vec2 = { x: 0, y: 0 };
  private mods = { shift: false, ctrl: false, alt: false };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas.getContext('2d')!);
    this.installPointerHandlers();
    this.installWheelHandler();
    this.canvas.tabIndex = 0;
  }

  /* ------------------------------------------------------------- registry -- */

  registerTool(id: string, factory: ToolFactory): void {
    this.factories.set(id, factory);
  }

  toolIds(): string[] {
    return [...this.factories.keys()];
  }

  toolLabel(id: string): string {
    return this.factories.get(id)?.(this).label ?? id;
  }

  toolHint(id: string): string {
    return this.factories.get(id)?.(this).hint ?? '';
  }

  activateTool(id: string): void {
    if (this.tool?.id === id || this.switchingTool) return;
    const previous = this.tool;
    this.switchingTool = true;
    try {
      if (previous?.flushOnExit) previous.onFinish?.();
    } finally {
      this.switchingTool = false;
    }
    const factory = this.factories.get(id);
    if (!factory) return;
    this.setBase(null);
    this.preview = null;
    this.marquee = null;
    this.tool = factory(this);
    this.canvas.style.cursor = this.tool.cursor ?? 'crosshair';
    this.setPrompt(this.tool.hint);
    this.hooks.onToolChanged?.(id);
    this.tool.onStart?.();
    this.requestRender();
  }

  deactivateTool(): void {
    this.setBase(null);
    this.preview = null;
    this.marquee = null;
    this.tool = null;
    this.canvas.style.cursor = 'crosshair';
    this.hooks.onToolChanged?.(null);
    this.requestRender();
  }

  /* ---------------------------------------------------------------- state -- */

  get entities(): readonly Entity[] {
    return this.doc.all();
  }

  get shiftKey(): boolean {
    return this.mods.shift;
  }

  get ctrlKey(): boolean {
    return this.mods.ctrl;
  }

  toScreen(world: Vec2): Vec2 {
    return this.view.toScreen(world);
  }

  currentLayerId(): string {
    return this.doc.currentLayerId;
  }

  setBase(p: Vec2 | null): void {
    this.base = p ? { x: p.x, y: p.y } : null;
  }

  getBase(): Vec2 | null {
    return this.base;
  }

  setPreview(preview: Preview | null): void {
    this.preview = preview;
    this.requestRender();
  }

  setMarquee(marquee: Marquee | null): void {
    this.marquee = marquee;
    this.requestRender();
  }

  setPrompt(text: string): void {
    this.hooks.onPrompt?.(text);
  }

  setStatus(text: string): void {
    this.hooks.onStatus?.(text);
  }

  requestTextInsertion(at: Vec2, done: (text: string, height: number) => void): void {
    if (!this.hooks.onRequestText) {
      this.setStatus('Text entry is unavailable');
      this.activateTool('select');
      return;
    }
    this.hooks.onRequestText(at, done);
  }

  /* ------------------------------------------------------------ selection -- */

  replaceSelection(ids: Iterable<string>): void {
    this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.hooks.onSelectionChanged?.(this.selection.size);
    this.requestRender();
  }

  addToSelection(id: string): void {
    if (this.selection.add(id)) {
      this.hooks.onSelectionChanged?.(this.selection.size);
      this.requestRender();
    }
  }

  toggleSelection(id: string): void {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.hooks.onSelectionChanged?.(this.selection.size);
    this.requestRender();
  }

  clearSelection(): void {
    if (!this.selection.size) return;
    this.selection.clear();
    this.hooks.onSelectionChanged?.(0);
    this.requestRender();
  }

  selectAll(): void {
    this.replaceSelection(this.doc.visibleEntities().map((e) => e.id));
  }

  selectedEntities(): Entity[] {
    const out: Entity[] = [];
    for (const id of this.selection) {
      const e = this.doc.get(id);
      if (e) out.push(e);
    }
    return out;
  }

  /** Select everything inside a screen rectangle; crossing mode touches. */
  selectInRect(a: Vec2, b: Vec2, crossing: boolean): string[] {
    const wa = this.view.toWorld(a);
    const wb = this.view.toWorld(b);
    const box = {
      min: { x: Math.min(wa.x, wb.x), y: Math.min(wa.y, wb.y) },
      max: { x: Math.max(wa.x, wb.x), y: Math.max(wa.y, wb.y) },
    };
    const hit: string[] = [];
    for (const e of this.doc.visibleEntities()) {
      const l = this.doc.layer(e.layerId);
      if (l?.locked) continue;
      const eb = entityBox(e);
      if (crossing) {
        if (boxesOverlap(eb, box) || this.outlineTouches(e, box)) hit.push(e.id);
      } else if (box.min.x <= eb.min.x && box.max.x >= eb.max.x && box.min.y <= eb.min.y && box.max.y >= eb.max.y) {
        hit.push(e.id);
      }
    }
    return hit;
  }

  private outlineTouches(e: Entity, box: { min: Vec2; max: Vec2 }): boolean {
    const tol = this.view.pixelsToWorld(PICK_TOLERANCE_PX);
    for (const p of outlinePoints(e)) {
      if (bboxContains(box, p, tol)) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------- geometry -- */

  pickAt(world: Vec2, exclude?: string): Entity | null {
    const tol = this.view.pixelsToWorld(PICK_TOLERANCE_PX);
    return this.doc.pick(world, tol, (e) => e.id !== exclude);
  }

  /**
   * Grid spacing in world units. The drawn grid and the snap grid are always
   * the same number, so what the cursor lands on is what is on screen.
   */
  gridStep(): number {
    return unitGridStep(this.doc.units, this.view.zoom, this.settings.gridDivisions);
  }

  snap(raw: Vec2): SnapResult {
    return snapPoint({
      view: this.view,
      doc: this.doc,
      raw,
      gridEnabled: this.settings.snap,
      osnapEnabled: this.settings.osnap,
      orthoEnabled: this.settings.ortho,
      gridStep: this.gridStep(),
      base: this.base,
    });
  }

  /* -------------------------------------------------------------- history -- */

  commit(label: string, outcome: Pick<EditOutcome, 'mutation' | 'message' | 'produced' | 'consumed'>): void {
    this.commitRaw(label, outcome.mutation);
    if (outcome.consumed) {
      for (const id of outcome.consumed) this.selection.delete(id);
      this.hooks.onSelectionChanged?.(this.selection.size);
    }
    if (outcome.message) this.setStatus(outcome.message);
  }

  commitRaw(label: string, mutation: Mutation): void {
    this.history.push(label, mutation);
    this.hooks.onHistoryChanged?.(this.history.canUndo, this.history.canRedo);
    this.requestRender();
  }

  insert(entities: Entity[], label: string): void {
    this.commit(label, { mutation: this.docInsert(entities), message: `${label} added` });
    if (!this.tool?.repeatable) {
      this.activateTool('select');
      return;
    }
    // Repeatable tools re-arm from scratch so they can keep drafting.
    this.setBase(null);
    this.preview = null;
    this.marquee = null;
    this.tool.onStart?.();
    this.requestRender();
  }

  /** Adds to the document and returns the mutation for undo recording. */
  private docInsert(entities: Entity[]): Mutation {
    const m: Mutation = { added: [], removed: [], changed: [] };
    for (const e of entities) {
      this.doc.add(e);
      m.added.push({ entity: e, index: this.doc.indexOf(e.id) });
    }
    return m;
  }

  undo(): void {
    const label = this.history.undo(this.doc);
    if (!label) return;
    for (const id of [...this.selection]) if (!this.doc.has(id)) this.selection.delete(id);
    this.hooks.onSelectionChanged?.(this.selection.size);
    this.hooks.onHistoryChanged?.(this.history.canUndo, this.history.canRedo);
    this.setStatus(`Undo: ${label}`);
    this.requestRender();
  }

  redo(): void {
    const label = this.history.redo(this.doc);
    if (!label) return;
    this.hooks.onHistoryChanged?.(this.history.canUndo, this.history.canRedo);
    this.setStatus(`Redo: ${label}`);
    this.requestRender();
  }

  /* ----------------------------------------------------------------- view -- */

  fitToExtents(): void {
    const box = this.doc.extents();
    if (box.min.x === box.max.x && box.min.y === box.max.y) {
      this.view.zoom = 1;
      this.view.centerOn({ x: 0, y: 0 });
    } else {
      this.view.fitBox(box);
    }
    this.requestRender();
  }

  zoomBy(factor: number): void {
    this.view.zoomAt(factor, { x: this.view.width / 2, y: this.view.height / 2 });
    this.requestRender();
  }

  /* ----------------------------------------------------------------- draw -- */

  requestRender(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.draw();
    });
  }

  resize(width: number, height: number, dpr: number): void {
    this.view.resize(width, height);
    const scale = renderScale(dpr);
    this.canvas.width = Math.max(1, Math.round(width * scale));
    this.canvas.height = Math.max(1, Math.round(height * scale));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.requestRender();
  }

  draw(): void {
    if (!this.renderer) return;
    const state: RenderState = {
      view: this.view,
      doc: this.doc,
      showGrid: this.settings.grid,
      gridStep: this.gridStep(),
      selection: this.selection,
      hoverId: this.hoverId,
      preview: this.preview,
      snapMark: this.snapResult?.mark ?? null,
      marquee: this.marquee,
    };
    this.renderer.render(state);
    this.hooks.onRendered?.();
  }

  /* --------------------------------------------------------------- input -- */

  private screenOf(event: PointerEvent | WheelEvent | MouseEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }

  private installPointerHandlers(): void {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.focus();
      this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey };
      const screen = this.screenOf(e);
      const world = this.view.toWorld(screen);
      this.lastPointer = screen;
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this.panning = true;
        this.canvas.style.cursor = 'grabbing';
        this.canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      const snapped = this.snap(world);
      this.snapResult = snapped;
      this.cursor = snapped.p;
      if (e.button === 2) {
        this.finishTool();
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      this.canvas.setPointerCapture(e.pointerId);
      this.tool?.onDown?.(snapped.p, world);
      this.requestRender();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey };
      const screen = this.screenOf(e);
      const world = this.view.toWorld(screen);
      if (this.panning) {
        this.view.panByPixels({ x: screen.x - this.lastPointer.x, y: screen.y - this.lastPointer.y });
        this.lastPointer = screen;
        this.requestRender();
        return;
      }
      this.lastPointer = screen;
      const snapped = this.snap(world);
      this.snapResult = snapped;
      this.cursor = snapped.p;
      this.hooks.onCursor?.(snapped.p, snapped.mark?.kind ?? null);
      if (!this.tool || this.tool.id === 'select') {
        const near = this.pickAt(world);
        const id = near?.id ?? null;
        if (id !== this.hoverId) {
          this.hoverId = id;
          this.requestRender();
        }
      }
      this.tool?.onMove?.(snapped.p, world);
      this.requestRender();
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (this.panning) {
        this.panning = false;
        this.canvas.style.cursor = this.tool?.cursor ?? 'crosshair';
        try {
          this.canvas.releasePointerCapture(e.pointerId);
        } catch {
          /* capture may already be gone */
        }
        return;
      }
      const screen = this.screenOf(e);
      const world = this.view.toWorld(screen);
      const snapped = this.snap(world);
      if (e.button === 0) this.tool?.onUp?.(snapped.p, world);
      this.requestRender();
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.hoverId = null;
      this.snapResult = null;
      this.requestRender();
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private installWheelHandler(): void {
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const screen = this.screenOf(e);
        const factor = Math.pow(1.0015, -e.deltaY);
        this.view.zoomAt(factor, screen);
        this.requestRender();
      },
      { passive: false }
    );
  }

  /**
   * Single keyboard entry point. The UI forwards window key events here so
   * hotkeys, tool keys and edit shortcuts can never fire twice.
   */
  handleKey(event: KeyboardEvent): void {
    const e = event;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancelTool();
      return;
    }
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && key === 'a') {
      e.preventDefault();
      this.selectAll();
      return;
    }
    if (mod && key === 'f') {
      e.preventDefault();
      this.fitToExtents();
      return;
    }
    // Tools see the key first so they can own numeric entry on Enter.
    if (this.tool?.onKey?.(e)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.finishTool();
      return;
    }
    if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      this.deleteSelection();
      return;
    }
    if (!mod && e.key.length === 1) {
      const id = this.hotkeys.get(e.key.toUpperCase());
      if (id) {
        e.preventDefault();
        this.activateTool(id);
      }
    }
  }

  finishTool(): void {
    if (this.tool?.onFinish) this.tool.onFinish();
    else if (this.tool && this.tool.id !== 'select') this.activateTool('select');
  }

  cancelTool(): void {
    if (this.tool?.onCancel) this.tool.onCancel();
    this.preview = null;
    this.marquee = null;
    this.setBase(null);
    this.activateTool('select');
    this.setStatus('Cancelled');
  }

  /* ------------------------------------------------------------ commands -- */

  deleteSelection(): void {
    if (!this.selection.size) {
      this.setStatus('Nothing selected');
      return;
    }
    this.commit('Delete', deleteEntities(this.doc, this.selection));
    this.clearSelection();
  }
}

function boxesOverlap(
  a: { min: Vec2; max: Vec2 },
  b: { min: Vec2; max: Vec2 }
): boolean {
  return a.max.x >= b.min.x && a.min.x <= b.max.x && a.max.y >= b.min.y && a.min.y <= b.max.y;
}

function outlinePoints(e: Entity): Vec2[] {
  const b = entityBBox(e, 0.2);
  if (e.kind === 'line') return [e.a, e.b];
  if (e.kind === 'rect') return [e.a, e.b];
  if (e.kind === 'polyline' || e.kind === 'spline') return e.points;
  if (e.kind === 'circle' || e.kind === 'arc') {
    const c = e.center;
    const r = e.radius;
    const out: Vec2[] = [c];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
    return out;
  }
  return [b.min, { x: b.max.x, y: b.min.y }, b.max, { x: b.min.x, y: b.max.y }];
}

