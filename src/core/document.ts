import { BBox, Vec2, bboxEmpty, bboxUnion, bboxValid, clone } from './vec';
import { Entity, EntityStyle, Linetype, distanceToEntity, entityBBox, isEntityKind, newId } from './entities';

export interface Layer {
  id: string;
  name: string;
  color: string;
  linetype: Linetype;
  /** Paper line weight in mm; 0 means hairline. */
  lineweight: number;
  visible: boolean;
  locked: boolean;
}

export type Units = 'mm' | 'cm' | 'm' | 'in';

/** Standard paper sizes in world units (based on current document units). */
export interface PageSize {
  name: string;
  width: number;
  height: number;
}

export const PAPER_SIZES: Record<string, PageSize> = {
  A4: { name: 'A4', width: 297, height: 210 },
  A3: { name: 'A3', width: 420, height: 297 },
  A2: { name: 'A2', width: 594, height: 420 },
  A1: { name: 'A1', width: 841, height: 594 },
  A0: { name: 'A0', width: 1189, height: 841 },
  Letter: { name: 'Letter', width: 279.4, height: 215.9 },
  Legal: { name: 'Legal', width: 355.6, height: 215.9 },
  Tabloid: { name: 'Tabloid', width: 431.8, height: 279.4 },
};

export interface DocJson {
  format: 'opendraft';
  version: 1;
  name: string;
  units: Units;
  layers: Layer[];
  currentLayerId: string;
  entities: Entity[];
  /** Active paper size key from PAPER_SIZES, or null for unbounded drawing. */
  pageSize?: string | null;
  /** Whether to show the page boundary rectangle on screen. */
  showPageBoundary?: boolean;
}

export const DEFAULT_LAYER_COLORS = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#46f0f0',
  '#f032e6',
  '#bcf60c',
  '#d2f53c',
  '#00756f',
  '#555555',
];

function defaultLayer(name: string, color: string, linetype: Linetype = 'continuous'): Layer {
  return { id: newId(), name, color, linetype, lineweight: 0.25, visible: true, locked: false };
}

export class Document {
  name = 'Untitled';
  units: Units = 'mm';
  layers: Layer[] = [];
  currentLayerId = '';
  /** Paper size key (A4, A3, etc.) or null for unbounded. */
  pageSize: string | null = 'A4';
  /** Whether to draw the page boundary rectangle on screen. */
  showPageBoundary = true;
  private list: Entity[] = [];
  private index = new Map<string, Entity>();

  constructor() {
    this.reset();
  }

  reset(): void {
    const l0 = defaultLayer('0', '#20262e');
    const dims = defaultLayer('Dimensions', '#4363d8');
    const text = defaultLayer('Text', '#911eb4');
    const hidden = defaultLayer('Construction', '#8a939e', 'dashed');
    this.layers = [l0, dims, text, hidden];
    this.currentLayerId = l0.id;
    this.list = [];
    this.index = new Map();
    this.name = 'Untitled';
    this.units = 'mm';
    this.pageSize = 'A4';
    this.showPageBoundary = true;
  }

  get currentLayer(): Layer {
    return this.layer(this.currentLayerId) ?? this.layers[0];
  }

  layer(id: string): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  /** Layers a caller may still pick or draw on. */
  drawableLayerIds(): Set<string> {
    const s = new Set<string>();
    for (const l of this.layers) if (l.visible && !l.locked) s.add(l.id);
    return s;
  }

  addLayer(name?: string): Layer {
    const used = this.layers.length;
    const layer = defaultLayer(
      name ?? `Layer ${used + 1}`,
      DEFAULT_LAYER_COLORS[used % DEFAULT_LAYER_COLORS.length]
    );
    this.layers.push(layer);
    return layer;
  }

  renameLayer(id: string, name: string): void {
    const l = this.layer(id);
    if (l) l.name = name;
  }

  updateLayer(id: string, patch: Partial<Omit<Layer, 'id'>>): void {
    const l = this.layer(id);
    if (l) Object.assign(l, patch);
  }

  removeLayer(id: string): boolean {
    if (this.layers.length <= 1) return false;
    const i = this.layers.findIndex((l) => l.id === id);
    if (i < 0) return false;
    const [removed] = this.layers.splice(i, 1);
    // Entities always live somewhere: fall back to the first remaining layer.
    const target = this.layers[0].id;
    for (const e of this.list) if (e.layerId === removed.id) e.layerId = target;
    if (this.currentLayerId === id) this.currentLayerId = target;
    return true;
  }

  all(): readonly Entity[] {
    return this.list;
  }

  get(id: string): Entity | undefined {
    return this.index.get(id);
  }

  has(id: string): boolean {
    return this.index.has(id);
  }

  add(e: Entity): Entity {
    this.list.push(e);
    this.index.set(e.id, e);
    return e;
  }

  addMany(entities: Entity[]): void {
    for (const e of entities) this.add(e);
  }

  /** Replace an entity by id, keeping its paint order position. */
  replace(e: Entity): void {
    const prev = this.index.get(e.id);
    if (!prev) {
      this.add(e);
      return;
    }
    const i = this.list.indexOf(prev);
    this.list[i] = e;
    this.index.set(e.id, e);
  }

  indexOf(id: string): number {
    const e = this.index.get(id);
    return e ? this.list.indexOf(e) : -1;
  }

  /** Insert at a specific paint position; used when restoring undone deletes. */
  insertAt(i: number, e: Entity): void {
    if (this.index.has(e.id)) return;
    const at = Math.max(0, Math.min(i, this.list.length));
    this.list.splice(at, 0, e);
    this.index.set(e.id, e);
  }

  removeOne(id: string): Entity | undefined {
    const e = this.index.get(id);
    if (!e) return undefined;
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    this.index.delete(id);
    return e;
  }

  remove(ids: Iterable<string>): Entity[] {
    const out: Entity[] = [];
    for (const id of ids) {
      const e = this.removeOne(id);
      if (e) out.push(e);
    }
    return out;
  }

  clear(): void {
    this.list = [];
    this.index = new Map();
  }

  count(): number {
    return this.list.length;
  }

  visibleEntities(): Entity[] {
    return this.list.filter((e) => {
      const l = this.layer(e.layerId);
      return !l || l.visible;
    });
  }

  /** Highest-painted visible entity within `radius` of p, or null. */
  pick(p: Vec2, radius: number, filter?: (e: Entity) => boolean): Entity | null {
    let best: Entity | null = null;
    let bestScore = Infinity;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const l = this.layer(e.layerId);
      if (l && (!l.visible || l.locked)) continue;
      if (filter && !filter(e)) continue;
      const d = distanceToEntity(e, p, 0.4);
      if (d <= radius && d < bestScore) {
        best = e;
        bestScore = d;
      }
      if (d === 0) break;
    }
    return best;
  }

  extents(): BBox {
    let b = bboxEmpty();
    for (const e of this.visibleEntities()) {
      const box = entityBBox(e);
      if (bboxValid(box)) b = bboxUnion(b, box);
    }
    return bboxValid(b) ? b : { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  }

  /** Page boundary rectangle in world coordinates, centred on the origin. */
  pageBoundary(): BBox | null {
    if (!this.pageSize || !this.showPageBoundary) return null;
    const ps = PAPER_SIZES[this.pageSize];
    if (!ps) return null;
    const halfW = ps.width / 2;
    const halfH = ps.height / 2;
    return { min: { x: -halfW, y: -halfH }, max: { x: halfW, y: halfH } };
  }

  toJSON(): DocJson {
    return {
      format: 'opendraft',
      version: 1,
      name: this.name,
      units: this.units,
      layers: this.layers.map((l) => ({ ...l })),
      currentLayerId: this.layers.some((l) => l.id === this.currentLayerId)
        ? this.currentLayerId
        : this.layers[0].id,
      entities: this.list.map(reviveEntity) as Entity[],
      pageSize: this.pageSize,
      showPageBoundary: this.showPageBoundary,
    };
  }

  loadJSON(json: DocJson): void {
    if (!json || json.format !== 'opendraft' || !Array.isArray(json.layers)) {
      throw new Error('Not an OpenDraft file');
    }
    this.layers = json.layers.map((l) => ({
      id: String(l.id),
      name: String(l.name ?? 'Layer'),
      color: String(l.color ?? '#20262e'),
      linetype: (l.linetype ?? 'continuous') as Linetype,
      lineweight: Number(l.lineweight ?? 0.25),
      visible: l.visible !== false,
      locked: l.locked === true,
    }));
    if (this.layers.length === 0) this.layers.push(defaultLayer('0', '#20262e'));
    this.currentLayerId = this.layers.some((l) => l.id === json.currentLayerId)
      ? json.currentLayerId
      : this.layers[0].id;
    this.name = String(json.name ?? 'Untitled');
    this.units = (['mm', 'cm', 'm', 'in'] as Units[]).includes(json.units) ? json.units : 'mm';
    this.pageSize = typeof json.pageSize === 'string' && PAPER_SIZES[json.pageSize] ? json.pageSize : 'A4';
    this.showPageBoundary = json.showPageBoundary !== false;
    this.clear();
    for (const raw of json.entities ?? []) {
      const e = reviveEntity(raw);
      if (e) this.add(e);
    }
  }

  /** Entities that should move when a layer changes colour, etc. */
  entitiesOnLayer(id: string): Entity[] {
    return this.list.filter((e) => e.layerId === id);
  }
}

/**
 * Validate untrusted JSON into an Entity, dropping anything malformed rather
 * than letting a bad file crash the renderer.
 */
function reviveEntity(raw: unknown): Entity | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.layerId !== 'string') return null;
  if (!isEntityKind(String(o.kind))) return null;
  const style: EntityStyle = {
    color: typeof o.color === 'string' ? o.color : undefined,
    lineweight: typeof o.lineweight === 'number' ? o.lineweight : undefined,
    linetype: typeof o.linetype === 'string' ? (o.linetype as Linetype) : undefined,
  };
  const base = { id: o.id, layerId: o.layerId, ...style };
  const P = (x: unknown): Vec2 | null => {
    if (!x || typeof x !== 'object') return null;
    const p = x as Record<string, unknown>;
    return typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null;
  };
  switch (o.kind) {
    case 'line': {
      const a = P(o.a);
      const b = P(o.b);
      return a && b ? { kind: 'line', ...base, a, b } : null;
    }
    case 'polyline': {
      const pts = Array.isArray(o.points) ? o.points.map(P) : [];
      if (pts.length < 2 || pts.some((p) => !p)) return null;
      return {
        kind: 'polyline',
        ...base,
        points: (pts as Vec2[]).map(clone),
        closed: o.closed === true,
      };
    }
    case 'spline': {
      const pts = Array.isArray(o.points) ? o.points.map(P) : [];
      if (pts.length < 2 || pts.some((p) => !p)) return null;
      return { kind: 'spline', ...base, points: pts as Vec2[] };
    }
    case 'arc': {
      const c = P(o.center);
      if (!c || typeof o.radius !== 'number' || typeof o.start !== 'number' || typeof o.end !== 'number') {
        return null;
      }
      return { kind: 'arc', ...base, center: c, radius: o.radius, start: o.start, end: o.end };
    }
    case 'circle': {
      const c = P(o.center);
      if (!c || typeof o.radius !== 'number') return null;
      return { kind: 'circle', ...base, center: c, radius: o.radius };
    }
    case 'ellipse': {
      const c = P(o.center);
      const u = P(o.u);
      const vv = P(o.v);
      if (!c || !u || !vv) return null;
      return { kind: 'ellipse', ...base, center: c, u, v: vv };
    }
    case 'rect': {
      const a = P(o.a);
      const b = P(o.b);
      return a && b ? { kind: 'rect', ...base, a, b } : null;
    }
    case 'text': {
      const pos = P(o.position);
      if (!pos || typeof o.text !== 'string' || typeof o.height !== 'number') return null;
      return {
        kind: 'text',
        ...base,
        position: pos,
        height: o.height,
        text: o.text,
        rotation: typeof o.rotation === 'number' ? o.rotation : 0,
        halign: (['left', 'center', 'right'] as const).includes(o.halign as never)
          ? (o.halign as 'left' | 'center' | 'right')
          : 'left',
        valign: (['baseline', 'center', 'top'] as const).includes(o.valign as never)
          ? (o.valign as 'baseline' | 'center' | 'top')
          : 'baseline',
      };
    }
    default:
      return null;
  }
}
