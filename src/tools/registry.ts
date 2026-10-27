import { ArcTool, CircleTool, EllipseTool, LineTool, PolylineTool, RectTool, SplineTool, TextTool } from './draw';
import { CopyTool, EraseTool, MirrorTool, MoveTool, OffsetTool, RotateTool, ScaleTool, TrimTool } from './modify';
import { SelectTool } from './select';
import { Tool, ToolFactory, ToolKit } from './types';

export interface ToolInfo {
  id: string;
  label: string;
  key: string;
  group: 'draw' | 'modify';
}

/** Order and shortcuts for the palette. */
export const TOOL_INFO: ToolInfo[] = [
  { id: 'select', label: 'Select', key: 'V', group: 'draw' },
  { id: 'line', label: 'Line', key: 'L', group: 'draw' },
  { id: 'polyline', label: 'Polyline', key: 'P', group: 'draw' },
  { id: 'arc', label: 'Arc', key: 'A', group: 'draw' },
  { id: 'circle', label: 'Circle', key: 'C', group: 'draw' },
  { id: 'ellipse', label: 'Ellipse', key: 'E', group: 'draw' },
  { id: 'rect', label: 'Rectangle', key: 'R', group: 'draw' },
  { id: 'spline', label: 'Spline', key: 'S', group: 'draw' },
  { id: 'text', label: 'Text', key: 'T', group: 'draw' },
  { id: 'move', label: 'Move', key: 'M', group: 'modify' },
  { id: 'copy', label: 'Copy', key: 'K', group: 'modify' },
  { id: 'rotate', label: 'Rotate', key: 'O', group: 'modify' },
  { id: 'mirror', label: 'Mirror', key: 'I', group: 'modify' },
  { id: 'scale', label: 'Scale', key: 'F', group: 'modify' },
  { id: 'offset', label: 'Offset', key: 'U', group: 'modify' },
  { id: 'trim', label: 'Trim', key: 'B', group: 'modify' },
  { id: 'erase', label: 'Erase', key: 'X', group: 'modify' },
];

const FACTORIES: Record<string, ToolFactory> = {
  select: (kit: ToolKit) => new SelectTool(kit),
  line: (kit: ToolKit) => new LineTool(kit),
  polyline: (kit: ToolKit) => new PolylineTool(kit),
  arc: (kit: ToolKit) => new ArcTool(kit),
  circle: (kit: ToolKit) => new CircleTool(kit),
  ellipse: (kit: ToolKit) => new EllipseTool(kit),
  rect: (kit: ToolKit) => new RectTool(kit),
  spline: (kit: ToolKit) => new SplineTool(kit),
  text: (kit: ToolKit) => new TextTool(kit),
  move: (kit: ToolKit) => new MoveTool(kit),
  copy: (kit: ToolKit) => new CopyTool(kit),
  rotate: (kit: ToolKit) => new RotateTool(kit),
  mirror: (kit: ToolKit) => new MirrorTool(kit),
  scale: (kit: ToolKit) => new ScaleTool(kit),
  offset: (kit: ToolKit) => new OffsetTool(kit),
  trim: (kit: ToolKit) => new TrimTool(kit),
  erase: (kit: ToolKit) => new EraseTool(kit),
};

export function registerTools(register: (id: string, factory: ToolFactory) => void): void {
  for (const [id, factory] of Object.entries(FACTORIES)) register(id, factory);
}

export function toolByKey(key: string): string | null {
  const upper = key.toUpperCase();
  const found = TOOL_INFO.find((t) => t.key === upper);
  return found ? found.id : null;
}

export type { Tool };
