import { Document } from './document';

export interface PageInfo {
  id: string;
  name: string;
}

/**
 * Manages multiple pages (each a separate Document) within one session.
 * The active page's document is exposed as `activeDoc`.
 */
export class PageManager {
  private pages: { id: string; doc: Document; name: string }[] = [];
  private activeIndex = 0;

  constructor() {
    this.addPage('Page 1');
  }

  get activeDoc(): Document {
    return this.pages[this.activeIndex].doc;
  }

  get activeId(): string {
    return this.pages[this.activeIndex].id;
  }

  get pagesInfo(): PageInfo[] {
    return this.pages.map((p) => ({ id: p.id, name: p.name }));
  }

  get count(): number {
    return this.pages.length;
  }

  addPage(name?: string): string {
    const id = 'page-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const doc = new Document();
    // Inherit settings from the current active page.
    const src = this.pages[this.activeIndex];
    if (src) {
      doc.pageSize = src.doc.pageSize;
      doc.showPageBoundary = src.doc.showPageBoundary;
      doc.units = src.doc.units;
      doc.layers = src.doc.layers.map((l) => ({ ...l }));
      doc.currentLayerId = src.doc.currentLayerId;
    }
    this.pages.push({ id, doc, name: name ?? `Page ${this.pages.length + 1}` });
    this.activeIndex = this.pages.length - 1;
    return id;
  }

  removePage(id: string): boolean {
    if (this.pages.length <= 1) return false;
    const idx = this.pages.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    this.pages.splice(idx, 1);
    if (this.activeIndex >= this.pages.length) this.activeIndex = this.pages.length - 1;
    return true;
  }

  setActive(id: string): boolean {
    const idx = this.pages.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    this.activeIndex = idx;
    return true;
  }

  renamePage(id: string, name: string): void {
    const p = this.pages.find((x) => x.id === id);
    if (p) p.name = name;
  }
}
