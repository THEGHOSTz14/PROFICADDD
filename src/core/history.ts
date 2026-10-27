import { Entity } from './entities';
import { Document } from './document';

export interface Placed {
  entity: Entity;
  /** Index in the document's paint order, so redo restores z-order. */
  index: number;
}

export interface Change {
  before: Entity;
  after: Entity;
}

/** The complete, reversible record of one user action. */
export interface Mutation {
  added: Placed[];
  removed: Placed[];
  changed: Change[];
}

export function emptyMutation(): Mutation {
  return { added: [], removed: [], changed: [] };
}

export function isEmptyMutation(m: Mutation): boolean {
  return m.added.length === 0 && m.removed.length === 0 && m.changed.length === 0;
}

export function insertEntities(doc: Document, entities: Entity[]): Mutation {
  const m = emptyMutation();
  for (const e of entities) {
    doc.add(e);
    m.added.push({ entity: e, index: doc.indexOf(e.id) });
  }
  return m;
}

export function removeEntities(doc: Document, ids: Iterable<string>): Mutation {
  const m = emptyMutation();
  for (const id of ids) {
    const entity = doc.get(id);
    if (!entity) continue;
    m.removed.push({ entity, index: doc.indexOf(id) });
    doc.removeOne(id);
  }
  return m;
}

/** Apply each `after` to the document and record it against its `before`. */
export function replaceEntities(doc: Document, pairs: Change[]): Mutation {
  const m = emptyMutation();
  for (const { before, after } of pairs) {
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    m.changed.push({ before, after });
    doc.replace(after);
  }
  return m;
}

export function merge(...parts: Mutation[]): Mutation {
  const out = emptyMutation();
  for (const p of parts) {
    out.added.push(...p.added);
    out.removed.push(...p.removed);
    out.changed.push(...p.changed);
  }
  return out;
}

function sortAscending(a: Placed[]): Placed[] {
  return [...a].sort((x, y) => x.index - y.index);
}

function sortDescending(a: Placed[]): Placed[] {
  return [...a].sort((x, y) => y.index - x.index);
}

export function applyUndo(doc: Document, m: Mutation): void {
  for (const p of sortDescending(m.added)) doc.removeOne(p.entity.id);
  for (const p of sortAscending(m.removed)) doc.insertAt(p.index, p.entity);
  for (const c of m.changed) doc.replace(c.before);
}

export function applyRedo(doc: Document, m: Mutation): void {
  for (const p of sortDescending(m.removed)) doc.removeOne(p.entity.id);
  for (const p of sortAscending(m.added)) doc.insertAt(p.index, p.entity);
  for (const c of m.changed) doc.replace(c.after);
}

export interface HistoryEntry {
  label: string;
  mutation: Mutation;
}

const LIMIT = 200;

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | null {
    return this.undoStack.length ? this.undoStack[this.undoStack.length - 1].label : null;
  }

  get redoLabel(): string | null {
    return this.redoStack.length ? this.redoStack[this.redoStack.length - 1].label : null;
  }

  push(label: string, mutation: Mutation): void {
    if (isEmptyMutation(mutation)) return;
    this.undoStack.push({ label, mutation });
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(doc: Document): string | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    applyUndo(doc, entry.mutation);
    this.redoStack.push(entry);
    return entry.label;
  }

  redo(doc: Document): string | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    applyRedo(doc, entry.mutation);
    this.undoStack.push(entry);
    return entry.label;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Drop everything the user could still revert, e.g. after opening a file. */
  depth(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }
}
