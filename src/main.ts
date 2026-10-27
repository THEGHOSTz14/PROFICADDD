import { Vec2 } from './core/vec';
import { Editor } from './core/editor';
import { Layer } from './core/document';
import { unitLength } from './core/view';
import { PageManager } from './core/pages';
import { TOOL_INFO, registerTools } from './tools/registry';
import { moveToLayer } from './core/edits';
import { documentFileName, loadDocument, saveDocument } from './io/json';
import { downloadBlob, downloadText } from './io/files';
import { toSvg } from './io/svg';
import { toPngBlob } from './io/png';
import { toPdfBlob } from './io/pdf';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in index.html`);
  return node as T;
}

const canvas = el<HTMLCanvasElement>('view');
const wrap = el<HTMLDivElement>('canvasWrap');
const pageTabsContainer = el<HTMLDivElement>('pageTabs');
const editor = new Editor(canvas);
const pageMgr = new PageManager();
registerTools((id, factory) => editor.registerTool(id, factory));
for (const info of TOOL_INFO) editor.hotkeys.set(info.key, info.id);

// Expose the active document through the editor.
Object.defineProperty(editor, 'doc', {
  get() { return pageMgr.activeDoc; },
  configurable: true,
});

const statTool = el('statTool');
const statSel = el('statSel');
const statMsg = el('statMsg');
const coords = el('coords');
const gridInfo = el('gridInfo');
const prompt = el('prompt');
const layerSelect = el<HTMLSelectElement>('layerSelect');
const unitSelect = el<HTMLSelectElement>('unitSelect');
const pageSizeSelect = el<HTMLSelectElement>('pageSizeSelect');
const chkPageBoundary = el<HTMLInputElement>('chkPageBoundary');
const gridStepInput = el<HTMLInputElement>('gridStep');
const fileInput = el<HTMLInputElement>('fileInput');

/* ------------------------------------------------------------- palette -- */

function buildPalette(): void {
  const groups: { host: HTMLElement; group: 'draw' | 'modify' }[] = [
    { host: el('toolButtons'), group: 'draw' },
    { host: el('modifyButtons'), group: 'modify' },
  ];
  for (const { host, group } of groups) {
    host.textContent = '';
    for (const info of TOOL_INFO.filter((t) => t.group === group)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tool';
      button.dataset.tool = info.id;
      button.title = `${info.label} (${info.key}) — ${editor.toolHint(info.id)}`;
      const name = document.createElement('span');
      name.textContent = info.label;
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = info.key;
      button.append(name, key);
      button.addEventListener('click', () => editor.activateTool(info.id));
      host.appendChild(button);
    }
  }
}

/* ------------------------------------------------------------ controls -- */

function refreshLayerList(): void {
  const previous = layerSelect.value;
  layerSelect.textContent = '';
  for (const layer of editor.doc.layers) {
    const option = document.createElement('option');
    option.value = layer.id;
    option.textContent = layer.name + (layer.locked ? ' (locked)' : layer.visible ? '' : ' (hidden)');
    option.style.color = layer.color;
    layerSelect.appendChild(option);
  }
  layerSelect.value = editor.doc.layers.some((l) => l.id === previous) ? previous : editor.doc.currentLayerId;
  layerSelect.value = editor.doc.currentLayerId;
}

function refreshToolHighlight(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('.tool')) {
    button.classList.toggle('active', button.dataset.tool === editor.tool?.id);
  }
  statTool.textContent = editor.tool ? `${editor.tool.label}` : 'Ready';
}

function refreshHistoryButtons(): void {
  el<HTMLButtonElement>('btnUndo').disabled = !editor.history.canUndo;
  el<HTMLButtonElement>('btnRedo').disabled = !editor.history.canRedo;
}

function setToggles(): void {
  el<HTMLInputElement>('chkGrid').checked = editor.settings.grid;
  el<HTMLInputElement>('chkSnap').checked = editor.settings.snap;
  el<HTMLInputElement>('chkOsnap').checked = editor.settings.osnap;
  el<HTMLInputElement>('chkOrtho').checked = editor.settings.ortho;
  gridStepInput.value = String(editor.settings.gridDivisions);
  refreshGridInfo();
}

/** Grid boxes are whole document units, so report them in those units. */
function refreshGridInfo(): void {
  const v = editor.gridStep() / unitLength(editor.doc.units);
  const text = `Grid ${String(Math.round(v * 1000) / 1000)} ${editor.doc.units}`;
  if (gridInfo.textContent !== text) gridInfo.textContent = text;
}

editor.hooks = {
  onStatus: (text) => {
    statMsg.textContent = text;
  },
  onPrompt: (text) => {
    prompt.textContent = text;
  },
  onCursor: (p: Vec2, mark) => {
    coords.textContent = `${p.x.toFixed(2)}, ${p.y.toFixed(2)}${mark ? `  [${mark}]` : ''}`;
  },
  onSelectionChanged: (count) => {
    statSel.textContent = `${count} selected`;
  },
  onHistoryChanged: () => refreshHistoryButtons(),
  onToolChanged: () => refreshToolHighlight(),
  onRendered: () => refreshGridInfo(),
  onRequestText: (at, done) => openTextEditor(at, done),
};

/* --------------------------------------------------------- text overlay -- */

function openTextEditor(at: Vec2, done: (text: string, height: number) => void): void {
  const existing = document.getElementById('textInput');
  if (existing) existing.remove();

  const height = Math.max(editor.gridStep(), 1) * 0.8;
  const screen = editor.toScreen(at);
  const input = document.createElement('input');
  input.id = 'textInput';
  input.type = 'text';
  input.placeholder = 'text';
  input.style.cssText =
    `position:absolute;left:${wrapLeft(screen).left}px;top:${screen.y - 10}px;` +
    `font-size:${Math.min(42, Math.max(12, height * editor.view.zoom))}px;` +
    'background:rgba(255,255,255,.9);border:1px solid #2c7be0;border-radius:3px;padding:1px 4px;' +
    'min-width:120px;outline:none;color:#20262e;z-index:5;';
  let settled = false;
  const finish = (commit: boolean): void => {
    if (settled) return;
    settled = true;
    const value = input.value;
    input.remove();
    editor.setPrompt(commit ? '' : 'Text cancelled');
    if (commit) done(value, height);
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  wrap.appendChild(input);
  input.focus();
}

function wrapLeft(screen: Vec2): { left: number } {
  // Keep the box on-screen when the insertion point sits near the right edge.
  const max = Math.max(4, editor.view.width - 180);
  return { left: Math.min(Math.max(4, screen.x), max) };
}

/* ------------------------------------------------------------- bindings -- */

el<HTMLButtonElement>('btnNew').addEventListener('click', () => {
  if (editor.doc.count() > 0 && !window.confirm('Discard the current drawing?')) return;
  // Reset page manager to a single fresh page.
  while (pageMgr.count > 1) pageMgr.removePage(pageMgr.pagesInfo[1].id);
  editor.doc.reset();
  editor.history.clear();
  editor.clearSelection();
  editor.setBase(null);
  editor.setPreview(null);
  refreshLayerList();
  unitSelect.value = editor.doc.units;
  pageSizeSelect.value = editor.doc.pageSize ?? '';
  chkPageBoundary.checked = editor.doc.showPageBoundary;
  renderPageTabs();
  editor.view.zoom = 1;
  editor.view.centerOn({ x: 0, y: 0 });
  editor.setStatus('New drawing');
  editor.requestRender();
  refreshHistoryButtons();
});

el<HTMLButtonElement>('btnOpen').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const json = await loadDocument(file, editor.doc);
    editor.doc.name = json.name ?? file.name;
    editor.history.clear();
    editor.clearSelection();
    unitSelect.value = editor.doc.units;
    pageSizeSelect.value = editor.doc.pageSize ?? '';
    chkPageBoundary.checked = editor.doc.showPageBoundary;
    refreshLayerList();
    editor.fitToExtents();
    editor.setStatus(`Opened ${file.name} (${editor.doc.count()} entities)`);
    refreshHistoryButtons();
  } catch (err) {
    editor.setStatus(`Open failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    fileInput.value = '';
  }
});

el<HTMLButtonElement>('btnSave').addEventListener('click', () => {
  saveDocument(editor.doc);
  editor.setStatus(`Saved ${documentFileName(editor.doc)}`);
});

el<HTMLButtonElement>('btnPng').addEventListener('click', async () => {
  try {
    const blob = await toPngBlob(editor.doc, { maxSide: 2000 });
    downloadBlob(`${editor.doc.name || 'drawing'}.png`, blob);
    editor.setStatus('Exported PNG');
  } catch (err) {
    editor.setStatus(`PNG failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

el<HTMLButtonElement>('btnSvg').addEventListener('click', () => {
  try {
    const { text } = toSvg(editor.doc);
    downloadText(`${editor.doc.name || 'drawing'}.svg`, text, 'image/svg+xml');
    editor.setStatus('Exported SVG');
  } catch (err) {
    editor.setStatus(`SVG failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

el<HTMLButtonElement>('btnPdf').addEventListener('click', async () => {
  try {
    const blob = await toPdfBlob(editor.doc);
    downloadBlob(`${editor.doc.name || 'drawing'}.pdf`, blob);
    editor.setStatus('Exported PDF');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('PDF export failed:', err);
    editor.setStatus(`PDF failed: ${msg}`);
  }
});

el<HTMLButtonElement>('btnUndo').addEventListener('click', () => editor.undo());
el<HTMLButtonElement>('btnRedo').addEventListener('click', () => editor.redo());
el<HTMLButtonElement>('btnDelete').addEventListener('click', () => editor.deleteSelection());
el<HTMLButtonElement>('btnZoomIn').addEventListener('click', () => editor.zoomBy(1.4));
el<HTMLButtonElement>('btnZoomOut').addEventListener('click', () => editor.zoomBy(1 / 1.4));
el<HTMLButtonElement>('btnFit').addEventListener('click', () => editor.fitToExtents());

layerSelect.addEventListener('change', () => {
  const id = layerSelect.value;
  if (editor.selection.size) {
    editor.commit('Layer change', moveToLayer(editor.doc, editor.selection, id));
  }
  editor.doc.currentLayerId = id;
  editor.setStatus(`Current layer: ${editor.doc.layer(id)?.name ?? id}`);
});

el<HTMLButtonElement>('btnLayerAdd').addEventListener('click', () => {
  const layer = editor.doc.addLayer();
  editor.doc.currentLayerId = layer.id;
  refreshLayerList();
  editor.setStatus(`Added layer ${layer.name}`);
});

el<HTMLButtonElement>('btnLayerDel').addEventListener('click', () => {
  const id = layerSelect.value;
  const layer = editor.doc.layer(id);
  if (!layer) return;
  const count = editor.doc.entitiesOnLayer(id).length;
  const warning = count ? `${count} entity/entities will move to the first layer.` : '';
  if (!window.confirm(`Delete layer "${layer.name}"? ${warning}`)) return;
  if (editor.doc.removeLayer(id)) {
    refreshLayerList();
    editor.setStatus(`Deleted layer ${layer.name}`);
    editor.requestRender();
  } else {
    editor.setStatus('At least one layer must remain');
  }
});

pageSizeSelect.addEventListener('change', () => {
  const val = pageSizeSelect.value || null;
  editor.doc.pageSize = val;
  editor.requestRender();
  editor.setStatus(val ? `Page: ${val}` : 'Page: unbounded');
});

chkPageBoundary.addEventListener('change', () => {
  editor.doc.showPageBoundary = chkPageBoundary.checked;
  editor.requestRender();
});

const LINETYPES = ['continuous', 'dashed', 'dotted', 'dashdot', 'centre'] as const;
const LINEWEIGHTS = [0.05, 0.09, 0.1, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.4, 2.0];

const layerModal = el<HTMLDivElement>('layerModal');
const layerRows = el<HTMLTableSectionElement>('layerRows');

function renderLayerRows(): void {
  layerRows.textContent = '';
  for (const layer of editor.doc.layers) {
    const row = document.createElement('tr');
    row.appendChild(radioCell(layer));
    row.appendChild(checkCell(layer.visible, (v) => {
      editor.doc.updateLayer(layer.id, { visible: v });
      refreshLayerList();
      editor.requestRender();
    }));
    row.appendChild(checkCell(layer.locked, (v) => {
      editor.doc.updateLayer(layer.id, { locked: v });
      refreshLayerList();
    }));
    row.appendChild(nameCell(layer));
    row.appendChild(colorCell(layer));
    row.appendChild(selectCell(LINETYPES, layer.linetype, (v) => {
      editor.doc.updateLayer(layer.id, { linetype: v as (typeof LINETYPES)[number] });
      editor.requestRender();
    }));
    row.appendChild(selectCell(LINEWEIGHTS.map(String), String(layer.lineweight), (v) => {
      editor.doc.updateLayer(layer.id, { lineweight: Number(v) });
      editor.requestRender();
    }));
    row.appendChild(deleteCell(layer));
    layerRows.appendChild(row);
  }
}

function cell(body: HTMLElement): HTMLTableCellElement {
  const td = document.createElement('td');
  td.appendChild(body);
  return td;
}

function radioCell(layer: Layer): HTMLTableCellElement {
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'currentLayer';
  input.checked = editor.doc.currentLayerId === layer.id;
  input.title = `Draw on ${layer.name}`;
  input.addEventListener('change', () => {
    editor.doc.currentLayerId = layer.id;
    refreshLayerList();
    renderLayerRows();
    editor.setStatus(`Current layer: ${layer.name}`);
  });
  return cell(input);
}

function checkCell(checked: boolean, onChange: (value: boolean) => void): HTMLTableCellElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return cell(input);
}

function nameCell(layer: Layer): HTMLTableCellElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = layer.name;
  input.addEventListener('change', () => {
    editor.doc.renameLayer(layer.id, input.value.trim() || layer.name);
    refreshLayerList();
    renderLayerRows();
  });
  return cell(input);
}

function colorCell(layer: Layer): HTMLTableCellElement {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = layer.color;
  input.addEventListener('input', () => {
    editor.doc.updateLayer(layer.id, { color: input.value });
    editor.requestRender();
  });
  input.addEventListener('change', () => refreshLayerList());
  return cell(input);
}

function selectCell(options: readonly string[], value: string, onChange: (value: string) => void): HTMLTableCellElement {
  const select = document.createElement('select');
  for (const o of options) {
    const option = document.createElement('option');
    option.value = o;
    option.textContent = o;
    select.appendChild(option);
  }
  select.value = options.includes(value) ? value : options[0];
  select.addEventListener('change', () => onChange(select.value));
  return cell(select);
}

function deleteCell(layer: Layer): HTMLTableCellElement {
  const button = document.createElement('button');
  button.className = 'row-del';
  button.title = `Delete ${layer.name}`;
  button.textContent = '\u00d7';
  button.addEventListener('click', () => {
    const count = editor.doc.entitiesOnLayer(layer.id).length;
    const warning = count ? ` ${count} entities will move to the first layer.` : '';
    if (!window.confirm(`Delete layer "${layer.name}"?${warning}`)) return;
    editor.doc.removeLayer(layer.id);
    refreshLayerList();
    renderLayerRows();
    editor.requestRender();
    editor.setStatus(`Deleted layer ${layer.name}`);
  });
  return cell(button);
}

el<HTMLButtonElement>('btnLayerManager').addEventListener('click', () => {
  renderLayerRows();
  layerModal.hidden = false;
});

el<HTMLButtonElement>('btnLayerNew').addEventListener('click', () => {
  const layer = editor.doc.addLayer();
  editor.doc.currentLayerId = layer.id;
  refreshLayerList();
  renderLayerRows();
  editor.setStatus(`Added layer ${layer.name}`);
});

el<HTMLButtonElement>('btnLayerClose').addEventListener('click', () => {
  layerModal.hidden = true;
  canvas.focus();
});

layerModal.addEventListener('pointerdown', (e) => {
  if (e.target === layerModal) layerModal.hidden = true;
});

unitSelect.addEventListener('change', () => {
  editor.doc.units = unitSelect.value as typeof editor.doc.units;
  editor.setStatus(`Units: ${editor.doc.units}`);
  refreshGridInfo();
  editor.requestRender();
});

for (const [id, key] of [
  ['chkGrid', 'grid'],
  ['chkSnap', 'snap'],
  ['chkOsnap', 'osnap'],
  ['chkOrtho', 'ortho'],
] as const) {
  el<HTMLInputElement>(id).addEventListener('change', (e) => {
    editor.settings[key] = (e.target as HTMLInputElement).checked;
    editor.setStatus(`${key}: ${editor.settings[key] ? 'on' : 'off'}`);
    editor.requestRender();
  });
}

gridStepInput.addEventListener('change', () => {
  const value = Math.round(Number(gridStepInput.value));
  if (!(value >= 1)) {
    gridStepInput.value = String(editor.settings.gridDivisions);
    editor.setStatus('Grid must be at least one unit');
    return;
  }
  editor.settings.gridDivisions = value;
  refreshGridInfo();
  editor.requestRender();
});

window.addEventListener('keydown', (e) => {
  if (!layerModal.hidden) {
    if (e.key === 'Escape') layerModal.hidden = true;
    return;
  }
  const target = e.target as HTMLElement | null;
  if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
  editor.handleKey(e);
});

/* ---------------------------------------------------------------- launch -- */

function syncSize(): void {
  const rect = wrap.getBoundingClientRect();
  editor.resize(rect.width, rect.height, window.devicePixelRatio || 1);
}

new ResizeObserver(syncSize).observe(wrap);

/* ----------------------------------------------------------- page tabs -- */

function renderPageTabs(): void {
  pageTabsContainer.textContent = '';
  for (const info of pageMgr.pagesInfo) {
    const tab = document.createElement('button');
    tab.className = 'page-tab' + (info.id === pageMgr.activeId ? ' active' : '');
    tab.title = info.name;
    const label = document.createElement('span');
    label.textContent = info.name;
    label.addEventListener('click', () => {
      pageMgr.setActive(info.id);
      onSwitchPage();
    });
    tab.appendChild(label);
    if (pageMgr.count > 1) {
      const close = document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '\u00d7';
      close.title = `Close ${info.name}`;
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.confirm(`Close ${info.name}?`)) {
          pageMgr.removePage(info.id);
          renderPageTabs();
          onSwitchPage();
        }
      });
      tab.appendChild(close);
    }
    pageTabsContainer.appendChild(tab);
  }
  const addBtn = document.createElement('button');
  addBtn.id = 'btnAddPage';
  addBtn.textContent = '+';
  addBtn.title = 'Add page';
  addBtn.addEventListener('click', () => {
    pageMgr.addPage();
    renderPageTabs();
    onSwitchPage();
  });
  pageTabsContainer.appendChild(addBtn);
}

function onSwitchPage(): void {
  // Reset editor state for the new page.
  editor.history.clear();
  editor.clearSelection();
  editor.setBase(null);
  editor.setPreview(null);
  refreshLayerList();
  unitSelect.value = editor.doc.units;
  pageSizeSelect.value = editor.doc.pageSize ?? '';
  chkPageBoundary.checked = editor.doc.showPageBoundary;
  editor.fitToExtents();
  editor.requestRender();
  refreshHistoryButtons();
}

buildPalette();
refreshLayerList();
setToggles();
refreshHistoryButtons();
renderPageTabs();
// The view needs real pixel dimensions before it can centre anything.
syncSize();
editor.view.zoom = 4;
editor.view.centerOn({ x: 0, y: 0 });
editor.activateTool('select');
editor.setStatus('OpenDraft ready — press a tool key or pick one from the palette');
editor.requestRender();
