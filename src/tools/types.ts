import { Vec2 } from '../core/vec';
import { Entity } from '../core/entities';
import { Document } from '../core/document';
import { Marquee, Preview } from '../core/renderer';
import { SnapResult } from '../core/snapping';
import { EditOutcome } from '../core/edits';

/**
 * The slice of the editor a tool is allowed to touch. Keeping this narrow means
 * tools never reach into DOM or renderer internals.
 */
export interface ToolKit {
  readonly doc: Document;
  readonly entities: readonly Entity[];
  readonly selection: ReadonlySet<string>;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  currentLayerId(): string;
  toScreen(world: Vec2): Vec2;
  snap(raw: Vec2): SnapResult;
  /** Nearest editable entity to a world point, or null. */
  pickAt(world: Vec2): Entity | null;
  setPreview(preview: Preview | null): void;
  setMarquee(marquee: Marquee | null): void;
  setPrompt(text: string): void;
  setStatus(text: string): void;
  /** Apply a mutation and record it as one undo step. */
  commit(label: string, outcome: Pick<EditOutcome, 'mutation' | 'message' | 'produced' | 'consumed'>): void;
  /** Insert finished geometry and stop the tool, unless it is repeatable. */
  insert(entities: Entity[], label: string): void;
  replaceSelection(ids: Iterable<string>): void;
  /** Window (false) or crossing (true) selection rectangle in screen space. */
  selectInRect(a: Vec2, b: Vec2, crossing: boolean): string[];
  addToSelection(id: string): void;
  toggleSelection(id: string): void;
  clearSelection(): void;
  /** Ask the UI for a string to place at p; the callback may never fire. */
  requestTextInsertion(at: Vec2, done: (text: string, height: number) => void): void;
  /** Base point for ortho and relative measurements. */
  setBase(p: Vec2 | null): void;
  getBase(): Vec2 | null;
  requestRender(): void;
  activateTool(id: string): void;
}

export interface Tool {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly cursor?: string;
  /** True when the tool stays active after producing geometry. */
  readonly repeatable?: boolean;
  /**
   * True for chain tools that hold uncommitted points. Switching away from one
   * finishes it instead of silently throwing the vertices away.
   */
  readonly flushOnExit?: boolean;
  onStart?(): void;
  /** `p` is snapped, `raw` is the unmodified cursor position in world space. */
  onMove?(p: Vec2, raw: Vec2): void;
  onDown?(p: Vec2, raw: Vec2): void;
  onUp?(p: Vec2, raw: Vec2): void;
  /** Return true when the tool consumed the key event. */
  onKey?(event: KeyboardEvent): boolean;
  /** Right-click or Enter. */
  onFinish?(): void;
  /** Escape. */
  onCancel?(): void;
}

export type ToolFactory = (kit: ToolKit) => Tool;
