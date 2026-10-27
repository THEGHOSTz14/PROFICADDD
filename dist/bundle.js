"use strict";
(() => {
  // src/core/vec.ts
  var v = (x, y) => ({ x, y });
  var clone = (a) => ({ x: a.x, y: a.y });
  var add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  var sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  var mul = (a, k) => ({ x: a.x * k, y: a.y * k });
  var dot = (a, b) => a.x * b.x + a.y * b.y;
  var cross = (a, b) => a.x * b.y - a.y * b.x;
  var len = (a) => Math.hypot(a.x, a.y);
  var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function norm(a) {
    const l = len(a);
    return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
  }
  function perp(a) {
    return { x: -a.y, y: a.x };
  }
  var EPS = 1e-9;
  var TAU = Math.PI * 2;
  function normalizeAngle(a) {
    const r = a % TAU;
    return r < 0 ? r + TAU : r;
  }
  function ccwSweep(a0, a1) {
    return normalizeAngle(a1 - a0);
  }
  function angleOf(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
  function rotatePoint(p, about, radians) {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const dx = p.x - about.x;
    const dy = p.y - about.y;
    return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
  }
  function bboxEmpty() {
    return { min: v(Infinity, Infinity), max: v(-Infinity, -Infinity) };
  }
  function bboxValid(b) {
    return b.min.x <= b.max.x && b.min.y <= b.max.y;
  }
  function bboxExtend(b, p) {
    return {
      min: v(Math.min(b.min.x, p.x), Math.min(b.min.y, p.y)),
      max: v(Math.max(b.max.x, p.x), Math.max(b.max.y, p.y))
    };
  }
  function bboxUnion(a, b) {
    return {
      min: v(Math.min(a.min.x, b.min.x), Math.min(a.min.y, b.min.y)),
      max: v(Math.max(a.max.x, b.max.x), Math.max(a.max.y, b.max.y))
    };
  }
  function bboxFromPoints(pts) {
    let b = bboxEmpty();
    for (const p of pts) b = bboxExtend(b, p);
    return b;
  }
  function bboxContains(b, p, slack = 0) {
    return p.x >= b.min.x - slack && p.x <= b.max.x + slack && p.y >= b.min.y - slack && p.y <= b.max.y + slack;
  }
  var matApply = (m, p) => ({
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f
  });
  var matTranslate = (t) => ({ a: 1, b: 0, c: 0, d: 1, e: t.x, f: t.y });
  function matRotate(radians, about) {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return {
      a: c,
      b: s,
      c: -s,
      d: c,
      e: about.x - c * about.x + s * about.y,
      f: about.y - s * about.x - c * about.y
    };
  }
  function matMirror(p, dir) {
    const u = norm(dir);
    const dx = u.x;
    const dy = u.y;
    const a = dx * dx - dy * dy;
    const b = 2 * dx * dy;
    return {
      a,
      b,
      c: b,
      d: -a,
      e: p.x - (a * p.x + b * p.y),
      f: p.y - (b * p.x - a * p.y)
    };
  }
  function matScale(k, about) {
    return { a: k, b: 0, c: 0, d: k, e: about.x - k * about.x, f: about.y - k * about.y };
  }
  var matDeterminant = (m) => m.a * m.d - m.b * m.c;
  function matScaleFactor(m) {
    const s1 = Math.hypot(m.a, m.b);
    const s2 = Math.hypot(m.c, m.d);
    return (s1 + s2) / 2;
  }
  var matRotation = (m) => Math.atan2(m.b, m.a);
  var matIsUniform = (m, tol = 1e-6) => {
    const s1 = Math.hypot(m.a, m.b);
    const s2 = Math.hypot(m.c, m.d);
    const skew = Math.abs(m.a * m.c + m.b * m.d);
    return Math.abs(s1 - s2) < tol && skew / (s1 * s2 || 1) < tol;
  };
  function distanceToSegment(p, a, b) {
    return dist(p, closestPointOnSegment(p, a, b));
  }
  function closestPointOnSegment(p, a, b) {
    const ab = sub(b, a);
    const l2 = dot(ab, ab);
    if (l2 < EPS) return clone(a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
    return add(a, mul(ab, t));
  }
  function segmentIntersect(p1, p2, p3, p4) {
    const d1 = sub(p2, p1);
    const d2 = sub(p4, p3);
    const den = cross(d1, d2);
    if (Math.abs(den) < EPS) return null;
    const r = sub(p3, p1);
    const t = cross(r, d2) / den;
    const u = cross(r, d1) / den;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return add(p1, mul(d1, t));
  }

  // src/core/entities.ts
  var TEXT_FONT = '600 %H%px "Segoe UI", system-ui, sans-serif';
  function newId() {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    return "e" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  var KINDS = ["line", "polyline", "arc", "circle", "ellipse", "rect", "spline", "text"];
  function isEntityKind(s) {
    return KINDS.includes(s);
  }
  function cloneEntity(e) {
    const copy = deepCopy(e);
    copy.id = newId();
    return copy;
  }
  function deepCopy(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function makeLine(layerId, a, b, style = {}) {
    return { id: newId(), kind: "line", layerId, a: clone(a), b: clone(b), ...style };
  }
  function makePolyline(layerId, points, closed, style = {}) {
    return {
      id: newId(),
      kind: "polyline",
      layerId,
      points: points.map(clone),
      closed,
      ...style
    };
  }
  function makeArc(layerId, center, radius, start, end, style = {}) {
    return { id: newId(), kind: "arc", layerId, center: clone(center), radius, start, end, ...style };
  }
  function makeCircle(layerId, center, radius, style = {}) {
    return { id: newId(), kind: "circle", layerId, center: clone(center), radius, ...style };
  }
  function makeEllipse(layerId, center, u, v2, style = {}) {
    return { id: newId(), kind: "ellipse", layerId, center: clone(center), u: clone(u), v: clone(v2), ...style };
  }
  function makeRect(layerId, a, b, style = {}) {
    return { id: newId(), kind: "rect", layerId, a: clone(a), b: clone(b), ...style };
  }
  function makeSpline(layerId, points, style = {}) {
    return { id: newId(), kind: "spline", layerId, points: points.map(clone), ...style };
  }
  function makeText(layerId, position, height, text, rotation = 0, style = {}) {
    return {
      id: newId(),
      kind: "text",
      layerId,
      position: clone(position),
      height,
      rotation,
      text,
      halign: "left",
      valign: "baseline",
      ...style
    };
  }
  function samplesForArc(radius, sweep, tol) {
    if (radius <= 0) return 1;
    const t = Math.max(1e-9, Math.min(tol / radius, 1));
    const step = Math.sqrt(2 * t);
    return Math.max(2, Math.min(4e3, Math.ceil(Math.abs(sweep) / step)));
  }
  function sampleEllipse(center, u, v2, tol) {
    const r = Math.max(Math.hypot(u.x, u.y), Math.hypot(v2.x, v2.y));
    const n = samplesForArc(r, TAU, tol);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      out.push(add(center, { x: u.x * Math.cos(a) + v2.x * Math.sin(a), y: u.y * Math.cos(a) + v2.y * Math.sin(a) }));
    }
    return out;
  }
  function sampleCircle(center, radius, tol) {
    const n = samplesForArc(radius, TAU, tol);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      out.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
    }
    return out;
  }
  function sampleArc(center, radius, start, end, tol) {
    const sweep = ccwSweep(start, end);
    const n = samplesForArc(radius, sweep, tol);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = start + sweep * i / n;
      out.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
    }
    return out;
  }
  function sampleSpline(points, tol) {
    const pts = points;
    if (pts.length < 2) return pts.map(clone);
    const ctrl = [pts[0], ...pts, pts[pts.length - 1]];
    const segs = ctrl.length - 3;
    let maxLen = 0;
    for (let i = 0; i + 1 < pts.length; i++) maxLen = Math.max(maxLen, dist(pts[i], pts[i + 1]));
    const perSeg = Math.max(4, Math.min(200, Math.ceil(maxLen / Math.max(tol, 1e-6) / 4)));
    const out = [];
    for (let s = 0; s < segs; s++) {
      const p0 = ctrl[s];
      const p1 = ctrl[s + 1];
      const p2 = ctrl[s + 2];
      const p3 = ctrl[s + 3];
      for (let i = 0; i <= perSeg; i++) {
        if (s > 0 && i === 0) continue;
        out.push(bsplineAt(p0, p1, p2, p3, i / perSeg));
      }
    }
    return out;
  }
  function bsplineAt(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const w0 = (1 - 3 * t + 3 * t2 - t3) / 6;
    const w1 = (4 - 6 * t2 + 3 * t3) / 6;
    const w2 = (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
    const w3 = t3 / 6;
    return {
      x: w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x,
      y: w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y
    };
  }
  function rectCorners(a, b) {
    return [
      { x: a.x, y: a.y },
      { x: b.x, y: a.y },
      { x: b.x, y: b.y },
      { x: a.x, y: b.y },
      { x: a.x, y: a.y }
    ];
  }
  function flatten(e, tol) {
    switch (e.kind) {
      case "line":
        return [[clone(e.a), clone(e.b)]];
      case "polyline":
        if (e.points.length === 0) return [];
        return [e.points.map(clone)];
      case "rect":
        return [rectCorners(e.a, e.b)];
      case "arc":
        return [sampleArc(e.center, e.radius, e.start, e.end, tol)];
      case "circle":
        return [sampleCircle(e.center, e.radius, tol)];
      case "ellipse":
        return [sampleEllipse(e.center, e.u, e.v, tol)];
      case "spline":
        return [sampleSpline(e.points, tol)];
      case "text":
        return [];
    }
  }
  function entityBBox(e, tol = 0.5) {
    if (e.kind === "text") return textBBox(e);
    let b = bboxEmpty();
    for (const chain of flatten(e, Math.max(tol, 1e-3))) for (const p of chain) b = bboxExtend(b, p);
    return b;
  }
  function textBBox(t) {
    const w = measureTextWidth(t.text, t.height);
    let x0 = 0;
    let x1 = w;
    if (t.halign === "center") {
      x0 = -w / 2;
      x1 = w / 2;
    } else if (t.halign === "right") {
      x0 = -w;
      x1 = 0;
    }
    let y0 = 0;
    let y1 = t.height;
    if (t.valign === "baseline") {
      y0 = -t.height * 0.8;
      y1 = t.height * 0.2;
    } else if (t.valign === "center") {
      y0 = -t.height / 2;
      y1 = t.height / 2;
    }
    const corners = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 }
    ].map((p) => rotatePoint(p, { x: 0, y: 0 }, t.rotation));
    return bboxFromPoints(corners.map((p) => add(p, t.position)));
  }
  function measureTextWidth(text, height) {
    const lines = text.split("\n");
    let longest = 0;
    for (const l of lines) longest = Math.max(longest, l.length);
    return longest * height * 0.58;
  }
  function distanceToEntity(e, p, tol) {
    if (e.kind === "text") {
      const b = textBBox(e);
      if (p.x >= b.min.x && p.x <= b.max.x && p.y <= b.max.y && p.y >= b.min.y) {
        return 0;
      }
      const c = rectCorners(b.min, b.max);
      let best2 = Infinity;
      for (let i = 0; i < 4; i++) best2 = Math.min(best2, distanceToSegment(p, c[i], c[i + 1]));
      return best2;
    }
    let best = Infinity;
    for (const chain of flatten(e, tol)) {
      for (let i = 0; i + 1 < chain.length; i++) {
        best = Math.min(best, distanceToSegment(p, chain[i], chain[i + 1]));
      }
    }
    return best;
  }
  function entitySnapPoints(e) {
    switch (e.kind) {
      case "line":
        return [
          { kind: "endpoint", p: clone(e.a) },
          { kind: "endpoint", p: clone(e.b) },
          { kind: "midpoint", p: add(e.a, mul(sub(e.b, e.a), 0.5)) }
        ];
      case "rect": {
        const c = rectCorners(e.a, e.b);
        const out = [
          { kind: "center", p: { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 } }
        ];
        for (let i = 0; i < 4; i++) {
          out.push({ kind: "endpoint", p: clone(c[i]) });
          out.push({ kind: "midpoint", p: { x: (c[i].x + c[i + 1].x) / 2, y: (c[i].y + c[i + 1].y) / 2 } });
        }
        return out;
      }
      case "polyline": {
        const out = e.points.map((p) => ({ kind: "endpoint", p: clone(p) }));
        const segs = e.closed ? e.points.length : e.points.length - 1;
        for (let i = 0; i < segs; i++) {
          const a = e.points[i];
          const b = e.points[(i + 1) % e.points.length];
          out.push({ kind: "midpoint", p: add(a, mul(sub(b, a), 0.5)) });
        }
        return out;
      }
      case "circle": {
        const c = e.center;
        return [
          { kind: "center", p: clone(c) },
          { kind: "quadrant", p: { x: c.x + e.radius, y: c.y } },
          { kind: "quadrant", p: { x: c.x - e.radius, y: c.y } },
          { kind: "quadrant", p: { x: c.x, y: c.y + e.radius } },
          { kind: "quadrant", p: { x: c.x, y: c.y - e.radius } }
        ];
      }
      case "arc": {
        const sweep = ccwSweep(e.start, e.end);
        const q = (a) => ({
          x: e.center.x + e.radius * Math.cos(a),
          y: e.center.y + e.radius * Math.sin(a)
        });
        const out = [
          { kind: "center", p: clone(e.center) },
          { kind: "endpoint", p: q(e.start) },
          { kind: "endpoint", p: q(e.end) },
          { kind: "midpoint", p: q(e.start + sweep / 2) }
        ];
        for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
          if (ccwSweep(e.start, a) <= sweep) out.push({ kind: "quadrant", p: q(a) });
        }
        return out;
      }
      case "ellipse": {
        const c = e.center;
        return [
          { kind: "center", p: clone(c) },
          { kind: "endpoint", p: add(c, e.u) },
          { kind: "endpoint", p: sub(c, e.u) },
          { kind: "endpoint", p: add(c, e.v) },
          { kind: "endpoint", p: sub(c, e.v) }
        ];
      }
      case "spline":
        return e.points.map((p) => ({ kind: "endpoint", p: clone(p) }));
      case "text":
        return [{ kind: "endpoint", p: clone(e.position) }];
    }
  }
  function closestOnEntity(e, p, tol) {
    if (e.kind === "text") return null;
    let best = null;
    let bestD = Infinity;
    for (const chain of flatten(e, tol)) {
      for (let i = 0; i + 1 < chain.length; i++) {
        const c = closestPointOnSegment(p, chain[i], chain[i + 1]);
        const d = dist(p, c);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    return best;
  }
  function transformEntity(e, m) {
    const uniform = matIsUniform(m, 1e-7);
    const det = matDeterminant(m);
    const s = matScaleFactor(m);
    const rot = matRotation(m);
    switch (e.kind) {
      case "line":
        return { ...e, a: matApply(m, e.a), b: matApply(m, e.b) };
      case "polyline":
        return { ...e, points: e.points.map((p) => matApply(m, p)) };
      case "rect": {
        const a = matApply(m, e.a);
        const b = matApply(m, e.b);
        const axisAligned = Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9;
        if (axisAligned) return { ...e, a, b };
        return toPolyline({ ...e, a, b });
      }
      case "circle": {
        if (!uniform || s <= 0) return toPolyline(e);
        return { ...e, center: matApply(m, e.center), radius: e.radius * s };
      }
      case "arc": {
        if (!uniform || s <= 0) return toPolyline(e);
        return {
          ...e,
          center: matApply(m, e.center),
          radius: e.radius * s,
          start: normalizeAngle(e.start + rot),
          end: normalizeAngle(e.end + rot)
        };
      }
      case "ellipse": {
        const u = { x: m.a * e.u.x + m.c * e.u.y, y: m.b * e.u.x + m.d * e.u.y };
        const v2 = { x: m.a * e.v.x + m.c * e.v.y, y: m.b * e.v.x + m.d * e.v.y };
        return { ...e, center: matApply(m, e.center), u, v: v2 };
      }
      case "spline":
        return { ...e, points: e.points.map((p) => matApply(m, p)) };
      case "text": {
        const mirrored = det < 0;
        if (!uniform || mirrored) {
          return toPolyline(e);
        }
        return {
          ...e,
          position: matApply(m, e.position),
          height: e.height * s,
          rotation: e.rotation + rot
        };
      }
    }
  }
  function toPolyline(e, tol = 0.05) {
    const chains = flatten(e, tol);
    const first = chains[0] ?? [];
    const closed = e.kind === "circle" || e.kind === "ellipse" || e.kind === "rect" || e.kind === "polyline" && e.closed;
    const pts = first.slice(0, closed && first.length > 1 ? first.length - 1 : first.length);
    return {
      id: e.id,
      kind: "polyline",
      layerId: e.layerId,
      color: e.color,
      lineweight: e.lineweight,
      linetype: e.linetype,
      points: pts.map(clone),
      closed
    };
  }

  // src/core/document.ts
  var PAPER_SIZES = {
    A4: { name: "A4", width: 297, height: 210 },
    A3: { name: "A3", width: 420, height: 297 },
    A2: { name: "A2", width: 594, height: 420 },
    A1: { name: "A1", width: 841, height: 594 },
    A0: { name: "A0", width: 1189, height: 841 },
    Letter: { name: "Letter", width: 279.4, height: 215.9 },
    Legal: { name: "Legal", width: 355.6, height: 215.9 },
    Tabloid: { name: "Tabloid", width: 431.8, height: 279.4 }
  };
  var DEFAULT_LAYER_COLORS = [
    "#e6194b",
    "#3cb44b",
    "#4363d8",
    "#f58231",
    "#911eb4",
    "#46f0f0",
    "#f032e6",
    "#bcf60c",
    "#d2f53c",
    "#00756f",
    "#555555"
  ];
  function defaultLayer(name, color, linetype = "continuous") {
    return { id: newId(), name, color, linetype, lineweight: 0.25, visible: true, locked: false };
  }
  var Document = class {
    name = "Untitled";
    units = "mm";
    layers = [];
    currentLayerId = "";
    /** Paper size key (A4, A3, etc.) or null for unbounded. */
    pageSize = "A4";
    /** Whether to draw the page boundary rectangle on screen. */
    showPageBoundary = true;
    list = [];
    index = /* @__PURE__ */ new Map();
    constructor() {
      this.reset();
    }
    reset() {
      const l0 = defaultLayer("0", "#20262e");
      const dims = defaultLayer("Dimensions", "#4363d8");
      const text = defaultLayer("Text", "#911eb4");
      const hidden = defaultLayer("Construction", "#8a939e", "dashed");
      this.layers = [l0, dims, text, hidden];
      this.currentLayerId = l0.id;
      this.list = [];
      this.index = /* @__PURE__ */ new Map();
      this.name = "Untitled";
      this.units = "mm";
      this.pageSize = "A4";
      this.showPageBoundary = true;
    }
    get currentLayer() {
      return this.layer(this.currentLayerId) ?? this.layers[0];
    }
    layer(id) {
      return this.layers.find((l) => l.id === id);
    }
    /** Layers a caller may still pick or draw on. */
    drawableLayerIds() {
      const s = /* @__PURE__ */ new Set();
      for (const l of this.layers) if (l.visible && !l.locked) s.add(l.id);
      return s;
    }
    addLayer(name) {
      const used = this.layers.length;
      const layer = defaultLayer(
        name ?? `Layer ${used + 1}`,
        DEFAULT_LAYER_COLORS[used % DEFAULT_LAYER_COLORS.length]
      );
      this.layers.push(layer);
      return layer;
    }
    renameLayer(id, name) {
      const l = this.layer(id);
      if (l) l.name = name;
    }
    updateLayer(id, patch) {
      const l = this.layer(id);
      if (l) Object.assign(l, patch);
    }
    removeLayer(id) {
      if (this.layers.length <= 1) return false;
      const i = this.layers.findIndex((l) => l.id === id);
      if (i < 0) return false;
      const [removed] = this.layers.splice(i, 1);
      const target = this.layers[0].id;
      for (const e of this.list) if (e.layerId === removed.id) e.layerId = target;
      if (this.currentLayerId === id) this.currentLayerId = target;
      return true;
    }
    all() {
      return this.list;
    }
    get(id) {
      return this.index.get(id);
    }
    has(id) {
      return this.index.has(id);
    }
    add(e) {
      this.list.push(e);
      this.index.set(e.id, e);
      return e;
    }
    addMany(entities) {
      for (const e of entities) this.add(e);
    }
    /** Replace an entity by id, keeping its paint order position. */
    replace(e) {
      const prev = this.index.get(e.id);
      if (!prev) {
        this.add(e);
        return;
      }
      const i = this.list.indexOf(prev);
      this.list[i] = e;
      this.index.set(e.id, e);
    }
    indexOf(id) {
      const e = this.index.get(id);
      return e ? this.list.indexOf(e) : -1;
    }
    /** Insert at a specific paint position; used when restoring undone deletes. */
    insertAt(i, e) {
      if (this.index.has(e.id)) return;
      const at = Math.max(0, Math.min(i, this.list.length));
      this.list.splice(at, 0, e);
      this.index.set(e.id, e);
    }
    removeOne(id) {
      const e = this.index.get(id);
      if (!e) return void 0;
      const i = this.list.indexOf(e);
      if (i >= 0) this.list.splice(i, 1);
      this.index.delete(id);
      return e;
    }
    remove(ids) {
      const out = [];
      for (const id of ids) {
        const e = this.removeOne(id);
        if (e) out.push(e);
      }
      return out;
    }
    clear() {
      this.list = [];
      this.index = /* @__PURE__ */ new Map();
    }
    count() {
      return this.list.length;
    }
    visibleEntities() {
      return this.list.filter((e) => {
        const l = this.layer(e.layerId);
        return !l || l.visible;
      });
    }
    /** Highest-painted visible entity within `radius` of p, or null. */
    pick(p, radius, filter) {
      let best = null;
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
    extents() {
      let b = bboxEmpty();
      for (const e of this.visibleEntities()) {
        const box = entityBBox(e);
        if (bboxValid(box)) b = bboxUnion(b, box);
      }
      return bboxValid(b) ? b : { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
    }
    /** Page boundary rectangle in world coordinates, centred on the origin. */
    pageBoundary() {
      if (!this.pageSize || !this.showPageBoundary) return null;
      const ps = PAPER_SIZES[this.pageSize];
      if (!ps) return null;
      const halfW = ps.width / 2;
      const halfH = ps.height / 2;
      return { min: { x: -halfW, y: -halfH }, max: { x: halfW, y: halfH } };
    }
    toJSON() {
      return {
        format: "opendraft",
        version: 1,
        name: this.name,
        units: this.units,
        layers: this.layers.map((l) => ({ ...l })),
        currentLayerId: this.layers.some((l) => l.id === this.currentLayerId) ? this.currentLayerId : this.layers[0].id,
        entities: this.list.map(reviveEntity),
        pageSize: this.pageSize,
        showPageBoundary: this.showPageBoundary
      };
    }
    loadJSON(json) {
      if (!json || json.format !== "opendraft" || !Array.isArray(json.layers)) {
        throw new Error("Not an OpenDraft file");
      }
      this.layers = json.layers.map((l) => ({
        id: String(l.id),
        name: String(l.name ?? "Layer"),
        color: String(l.color ?? "#20262e"),
        linetype: l.linetype ?? "continuous",
        lineweight: Number(l.lineweight ?? 0.25),
        visible: l.visible !== false,
        locked: l.locked === true
      }));
      if (this.layers.length === 0) this.layers.push(defaultLayer("0", "#20262e"));
      this.currentLayerId = this.layers.some((l) => l.id === json.currentLayerId) ? json.currentLayerId : this.layers[0].id;
      this.name = String(json.name ?? "Untitled");
      this.units = ["mm", "cm", "m", "in"].includes(json.units) ? json.units : "mm";
      this.pageSize = typeof json.pageSize === "string" && PAPER_SIZES[json.pageSize] ? json.pageSize : "A4";
      this.showPageBoundary = json.showPageBoundary !== false;
      this.clear();
      for (const raw of json.entities ?? []) {
        const e = reviveEntity(raw);
        if (e) this.add(e);
      }
    }
    /** Entities that should move when a layer changes colour, etc. */
    entitiesOnLayer(id) {
      return this.list.filter((e) => e.layerId === id);
    }
  };
  function reviveEntity(raw) {
    if (!raw || typeof raw !== "object") return null;
    const o = raw;
    if (typeof o.id !== "string" || typeof o.layerId !== "string") return null;
    if (!isEntityKind(String(o.kind))) return null;
    const style = {
      color: typeof o.color === "string" ? o.color : void 0,
      lineweight: typeof o.lineweight === "number" ? o.lineweight : void 0,
      linetype: typeof o.linetype === "string" ? o.linetype : void 0
    };
    const base = { id: o.id, layerId: o.layerId, ...style };
    const P = (x) => {
      if (!x || typeof x !== "object") return null;
      const p = x;
      return typeof p.x === "number" && typeof p.y === "number" ? { x: p.x, y: p.y } : null;
    };
    switch (o.kind) {
      case "line": {
        const a = P(o.a);
        const b = P(o.b);
        return a && b ? { kind: "line", ...base, a, b } : null;
      }
      case "polyline": {
        const pts = Array.isArray(o.points) ? o.points.map(P) : [];
        if (pts.length < 2 || pts.some((p) => !p)) return null;
        return {
          kind: "polyline",
          ...base,
          points: pts.map(clone),
          closed: o.closed === true
        };
      }
      case "spline": {
        const pts = Array.isArray(o.points) ? o.points.map(P) : [];
        if (pts.length < 2 || pts.some((p) => !p)) return null;
        return { kind: "spline", ...base, points: pts };
      }
      case "arc": {
        const c = P(o.center);
        if (!c || typeof o.radius !== "number" || typeof o.start !== "number" || typeof o.end !== "number") {
          return null;
        }
        return { kind: "arc", ...base, center: c, radius: o.radius, start: o.start, end: o.end };
      }
      case "circle": {
        const c = P(o.center);
        if (!c || typeof o.radius !== "number") return null;
        return { kind: "circle", ...base, center: c, radius: o.radius };
      }
      case "ellipse": {
        const c = P(o.center);
        const u = P(o.u);
        const vv = P(o.v);
        if (!c || !u || !vv) return null;
        return { kind: "ellipse", ...base, center: c, u, v: vv };
      }
      case "rect": {
        const a = P(o.a);
        const b = P(o.b);
        return a && b ? { kind: "rect", ...base, a, b } : null;
      }
      case "text": {
        const pos = P(o.position);
        if (!pos || typeof o.text !== "string" || typeof o.height !== "number") return null;
        return {
          kind: "text",
          ...base,
          position: pos,
          height: o.height,
          text: o.text,
          rotation: typeof o.rotation === "number" ? o.rotation : 0,
          halign: ["left", "center", "right"].includes(o.halign) ? o.halign : "left",
          valign: ["baseline", "center", "top"].includes(o.valign) ? o.valign : "baseline"
        };
      }
      default:
        return null;
    }
  }

  // src/core/view.ts
  var View = class {
    /** Pixels per world unit. */
    zoom = 1;
    /** Screen position of world origin. */
    pan = { x: 0, y: 0 };
    width = 1;
    height = 1;
    resize(width, height) {
      this.width = Math.max(1, width);
      this.height = Math.max(1, height);
    }
    toScreen(p) {
      return { x: this.pan.x + p.x * this.zoom, y: this.pan.y - p.y * this.zoom };
    }
    toWorld(p) {
      return { x: (p.x - this.pan.x) / this.zoom, y: (this.pan.y - p.y) / this.zoom };
    }
    /** A world length expressed in screen pixels. */
    worldToPixels(d) {
      return d * this.zoom;
    }
    /** A screen tolerance expressed in world units. */
    pixelsToWorld(d) {
      return d / this.zoom;
    }
    panByPixels(delta) {
      this.pan = { x: this.pan.x + delta.x, y: this.pan.y + delta.y };
    }
    zoomAt(factor, anchorScreen) {
      const before = this.toWorld(anchorScreen);
      const next = clampZoom(this.zoom * factor);
      if (next === this.zoom) return;
      this.zoom = next;
      const after = this.toScreen(before);
      this.pan = { x: this.pan.x + (anchorScreen.x - after.x), y: this.pan.y + (anchorScreen.y - after.y) };
    }
    setZoomAt(zoom, anchorScreen) {
      this.zoomAt(zoom / this.zoom, anchorScreen);
    }
    /** Centre the view on a world point. */
    centerOn(p) {
      this.pan = { x: this.width / 2 - p.x * this.zoom, y: this.height / 2 + p.y * this.zoom };
    }
    fitBox(box, paddingPx = 40) {
      const w = Math.max(box.max.x - box.min.x, 1e-6);
      const h = Math.max(box.max.y - box.min.y, 1e-6);
      const usableW = Math.max(1, this.width - paddingPx * 2);
      const usableH = Math.max(1, this.height - paddingPx * 2);
      this.zoom = clampZoom(Math.min(usableW / w, usableH / h));
      const center = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2 };
      this.centerOn(center);
    }
    visibleWorldBox() {
      const a = this.toWorld({ x: 0, y: 0 });
      const b = this.toWorld({ x: this.width, y: this.height });
      return {
        min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
        max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }
      };
    }
  };
  var MIN_ZOOM = 1e-4;
  var MAX_ZOOM = 1e6;
  var MM_PER_UNIT = { mm: 1, cm: 10, m: 1e3, in: 25.4 };
  var GRID_MIN_PX = 3;
  var GRID_MAX_PX = 160;
  var UNIT_MULTIPLES = [2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4];
  var UNIT_DIVISIONS = [0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
  function renderScale(dpr) {
    return Math.min(2, Math.max(dpr, 1.5));
  }
  function clampZoom(z) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }
  function unitGridStep(units, zoom, divisions = 1) {
    const mm = MM_PER_UNIT[units] ?? 1;
    const base = mm * Math.max(1, Math.round(divisions) || 1);
    const k = Math.max(zoom, 1e-9);
    if (base * k < GRID_MIN_PX) {
      for (const m of UNIT_MULTIPLES) if (base * m * k >= GRID_MIN_PX) return base * m;
      return base * UNIT_MULTIPLES[UNIT_MULTIPLES.length - 1];
    }
    if (base * k > GRID_MAX_PX) {
      for (const m of UNIT_DIVISIONS) if (base * m * k <= GRID_MAX_PX) return base * m;
      return base * UNIT_DIVISIONS[UNIT_DIVISIONS.length - 1];
    }
    return base;
  }
  function unitLength(units) {
    return MM_PER_UNIT[units] ?? 1;
  }

  // src/core/history.ts
  function emptyMutation() {
    return { added: [], removed: [], changed: [] };
  }
  function isEmptyMutation(m) {
    return m.added.length === 0 && m.removed.length === 0 && m.changed.length === 0;
  }
  function insertEntities(doc, entities) {
    const m = emptyMutation();
    for (const e of entities) {
      doc.add(e);
      m.added.push({ entity: e, index: doc.indexOf(e.id) });
    }
    return m;
  }
  function removeEntities(doc, ids) {
    const m = emptyMutation();
    for (const id of ids) {
      const entity = doc.get(id);
      if (!entity) continue;
      m.removed.push({ entity, index: doc.indexOf(id) });
      doc.removeOne(id);
    }
    return m;
  }
  function replaceEntities(doc, pairs) {
    const m = emptyMutation();
    for (const { before, after } of pairs) {
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      m.changed.push({ before, after });
      doc.replace(after);
    }
    return m;
  }
  function sortAscending(a) {
    return [...a].sort((x, y) => x.index - y.index);
  }
  function sortDescending(a) {
    return [...a].sort((x, y) => y.index - x.index);
  }
  function applyUndo(doc, m) {
    for (const p of sortDescending(m.added)) doc.removeOne(p.entity.id);
    for (const p of sortAscending(m.removed)) doc.insertAt(p.index, p.entity);
    for (const c of m.changed) doc.replace(c.before);
  }
  function applyRedo(doc, m) {
    for (const p of sortDescending(m.removed)) doc.removeOne(p.entity.id);
    for (const p of sortAscending(m.added)) doc.insertAt(p.index, p.entity);
    for (const c of m.changed) doc.replace(c.after);
  }
  var LIMIT = 200;
  var History = class {
    undoStack = [];
    redoStack = [];
    get canUndo() {
      return this.undoStack.length > 0;
    }
    get canRedo() {
      return this.redoStack.length > 0;
    }
    get undoLabel() {
      return this.undoStack.length ? this.undoStack[this.undoStack.length - 1].label : null;
    }
    get redoLabel() {
      return this.redoStack.length ? this.redoStack[this.redoStack.length - 1].label : null;
    }
    push(label, mutation) {
      if (isEmptyMutation(mutation)) return;
      this.undoStack.push({ label, mutation });
      if (this.undoStack.length > LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    undo(doc) {
      const entry = this.undoStack.pop();
      if (!entry) return null;
      applyUndo(doc, entry.mutation);
      this.redoStack.push(entry);
      return entry.label;
    }
    redo(doc) {
      const entry = this.redoStack.pop();
      if (!entry) return null;
      applyRedo(doc, entry.mutation);
      this.undoStack.push(entry);
      return entry.label;
    }
    clear() {
      this.undoStack = [];
      this.redoStack = [];
    }
    /** Drop everything the user could still revert, e.g. after opening a file. */
    depth() {
      return { undo: this.undoStack.length, redo: this.redoStack.length };
    }
  };

  // src/core/snapping.ts
  var MARK_PRIORITY = {
    endpoint: 0,
    intersection: 1,
    center: 2,
    quadrant: 3,
    midpoint: 4,
    nearest: 5,
    grid: 6
  };
  var OSNAP_PX = 8;
  var NEAREST_PX = 5;
  var GRID_PX = 8;
  function snapPoint(o) {
    const tol = o.view.pixelsToWorld(o.tolerancePx ?? OSNAP_PX);
    const nearestTol = o.view.pixelsToWorld(NEAREST_PX);
    const ignore = o.ignore && o.ignore.length ? new Set(o.ignore) : null;
    const marks = [];
    const near = [];
    if (o.osnapEnabled) {
      for (const e of entitiesNear(o.doc, o.raw, tol)) {
        if (ignore?.has(e.id)) continue;
        near.push(e);
        for (const sp of entitySnapPoints(e)) {
          if (dist(sp.p, o.raw) <= tol) marks.push(sp);
        }
        const c = closestOnEntity(e, o.raw, nearestTol);
        if (c && dist(c, o.raw) <= nearestTol) marks.push({ kind: "nearest", p: c });
      }
      if (!marks.length) {
        for (let i = 0; i < near.length; i++) {
          for (let j = i + 1; j < near.length; j++) {
            for (const p2 of entityIntersections(near[i], near[j])) {
              if (dist(p2, o.raw) <= tol) marks.push({ kind: "intersection", p: p2 });
            }
          }
        }
      }
    }
    let best = null;
    if (marks.length) {
      marks.sort((a, b) => {
        const d = dist(a.p, o.raw) - dist(b.p, o.raw);
        if (Math.abs(d) > 1e-9) return d;
        return MARK_PRIORITY[a.kind] - MARK_PRIORITY[b.kind];
      });
      best = marks[0];
    }
    let p = best ? best.p : o.raw;
    let ortho = false;
    if (!best) {
      if (o.gridEnabled && o.gridStep > 0) {
        const step = o.gridStep;
        const gridTol = Math.min(o.view.pixelsToWorld(GRID_PX), step * 0.35);
        const g = { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
        if (dist(g, p) <= gridTol) {
          p = g;
          best = { kind: "grid", p };
        }
      }
      if (o.orthoEnabled && o.base) {
        const d = sub(p, o.base);
        p = Math.abs(d.x) >= Math.abs(d.y) ? { x: p.x, y: o.base.y } : { x: o.base.x, y: p.y };
        ortho = true;
      }
    }
    return { p, mark: best, ortho };
  }
  function entitiesNear(doc, p, radius) {
    const out = [];
    for (const e of doc.all()) {
      const layer = doc.layer(e.layerId);
      if (layer && (!layer.visible || layer.locked)) continue;
      if (bboxContains(entityBox(e), p, radius)) out.push(e);
    }
    return out;
  }
  function entityBox(e) {
    let min = { x: Infinity, y: Infinity };
    let max = { x: -Infinity, y: -Infinity };
    const feed = (pt) => {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      min = { x: Math.min(min.x, pt.x), y: Math.min(min.y, pt.y) };
      max = { x: Math.max(max.x, pt.x), y: Math.max(max.y, pt.y) };
    };
    switch (e.kind) {
      case "line":
      case "rect":
        feed(e.a);
        feed(e.b);
        break;
      case "polyline":
      case "spline":
        for (const pt of e.points) feed(pt);
        break;
      case "circle":
      case "arc":
        feed({ x: e.center.x - e.radius, y: e.center.y - e.radius });
        feed({ x: e.center.x + e.radius, y: e.center.y + e.radius });
        break;
      case "ellipse":
        feed({ x: e.center.x - Math.abs(e.u.x) - Math.abs(e.v.x), y: e.center.y - Math.abs(e.u.y) - Math.abs(e.v.y) });
        feed({ x: e.center.x + Math.abs(e.u.x) + Math.abs(e.v.x), y: e.center.y + Math.abs(e.u.y) + Math.abs(e.v.y) });
        break;
      case "text": {
        const w = Math.max(...e.text.split("\n").map((s) => s.length)) * e.height * 0.6;
        feed(e.position);
        feed({ x: e.position.x + w, y: e.position.y + e.height });
        break;
      }
    }
    return { min, max };
  }
  var MAX_INTERSECTIONS = 32;
  function entityIntersections(a, b) {
    const out = [];
    for (const ca of flatten(a, 0.15)) {
      for (const cb of flatten(b, 0.15)) {
        for (let i = 0; i + 1 < ca.length && out.length < MAX_INTERSECTIONS; i++) {
          for (let j = 0; j + 1 < cb.length; j++) {
            const p = segmentIntersect(ca[i], ca[i + 1], cb[j], cb[j + 1]);
            if (p) out.push(p);
          }
        }
      }
    }
    return out;
  }

  // src/core/renderer.ts
  var PAPER = "#ffffff";
  var GRID_MINOR = "#edf0f4";
  var GRID_MAJOR = "#d5dce5";
  var AXIS_X = "#e07a7a";
  var AXIS_Y = "#7ab66a";
  var INK = "#20262e";
  var SELECTED = "#1f8fff";
  var HOVER = "#f2a33c";
  var RUBBER = "#2c7be0";
  var MARK = "#d6336c";
  function linetypeDash(type) {
    switch (type) {
      case "dashed":
        return [9, 5];
      case "dotted":
        return [1.5, 4];
      case "dashdot":
        return [12, 5, 2, 5];
      case "centre":
        return [16, 5, 3, 5];
      case "continuous":
        return [];
    }
  }
  function weightToPixels(mm) {
    return Math.min(12, Math.max(1.2, mm * 4.5));
  }
  var Renderer = class {
    constructor(ctx) {
      this.ctx = ctx;
    }
    render(state) {
      const { ctx } = this;
      const { view } = state;
      const dpr = ctx.canvas.width / Math.max(1, view.width);
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, view.width, view.height);
      if (state.showGrid) drawGrid(ctx, state, dpr);
      const pageBox = state.doc.pageBoundary();
      if (pageBox) {
        const a = view.toScreen(pageBox.min);
        const b = view.toScreen(pageBox.max);
        ctx.save();
        ctx.strokeStyle = "#c0a060";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.setLineDash([]);
        ctx.restore();
      }
      const visible = view.visibleWorldBox();
      const tol = Math.max(view.pixelsToWorld(0.25), 1e-6);
      for (const e of state.doc.visibleEntities()) {
        if (!bboxIntersects(entityBox(e), visible)) continue;
        const layer = state.doc.layer(e.layerId);
        const selected = state.selection.has(e.id);
        const hovered = state.hoverId === e.id && !selected;
        this.drawEntity(e, {
          color: layer ? layer.color : INK,
          lineweight: layer ? layer.lineweight : 0.25,
          linetype: layer ? layer.linetype : "continuous",
          view,
          tol,
          emphasis: selected ? SELECTED : hovered ? HOVER : null,
          selected
        });
      }
      if (state.preview) this.drawPreview(state, tol);
      if (state.snapMark) drawSnapMark(ctx, state.snapMark, view);
      if (state.marquee) drawMarquee(ctx, state.marquee);
      ctx.restore();
    }
    drawEntity(e, o) {
      const { ctx } = this;
      const { view } = o;
      ctx.save();
      ctx.strokeStyle = o.emphasis ?? e.color ?? o.color;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = weightToPixels(e.lineweight ?? o.lineweight) + (o.selected ? 1 : 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(linetypeDash(e.linetype ?? o.linetype));
      if (e.kind === "text") {
        drawText(ctx, e, view);
        ctx.restore();
        return;
      }
      if (e.kind === "circle") {
        const c = view.toScreen(e.center);
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(0.1, e.radius * view.zoom), 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.kind === "arc") {
        const c = view.toScreen(e.center);
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(0.1, e.radius * view.zoom), -e.start, -e.end, true);
        ctx.stroke();
      } else if (e.kind === "ellipse" && isOrthogonal(e.u, e.v)) {
        const c = view.toScreen(e.center);
        ctx.beginPath();
        ctx.ellipse(
          c.x,
          c.y,
          Math.hypot(e.u.x, e.u.y) * view.zoom,
          Math.hypot(e.v.x, e.v.y) * view.zoom,
          -Math.atan2(e.u.y, e.u.x),
          0,
          Math.PI * 2
        );
        ctx.stroke();
      } else {
        for (const chain of flatten(e, o.tol)) {
          if (chain.length < 2) continue;
          ctx.beginPath();
          const a = view.toScreen(chain[0]);
          ctx.moveTo(a.x, a.y);
          for (let i = 1; i < chain.length; i++) {
            const s = view.toScreen(chain[i]);
            ctx.lineTo(s.x, s.y);
          }
          if (e.kind === "polyline" && e.closed) ctx.closePath();
          ctx.stroke();
        }
      }
      if (o.selected) drawHandles(ctx, e, view);
      ctx.restore();
    }
    drawPreview(state, tol) {
      const { ctx } = this;
      const preview = state.preview;
      if (!preview) return;
      for (const e of preview.entities) {
        const layer = state.doc.layer(e.layerId);
        this.drawEntity(e, {
          color: layer ? layer.color : INK,
          lineweight: layer ? layer.lineweight : 0.25,
          linetype: layer ? layer.linetype : "continuous",
          view: state.view,
          tol,
          emphasis: null,
          selected: false
        });
      }
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.25;
      if (preview.rubber.length >= 2) {
        ctx.strokeStyle = RUBBER;
        ctx.beginPath();
        const a = state.view.toScreen(preview.rubber[0]);
        ctx.moveTo(a.x, a.y);
        for (let i = 1; i < preview.rubber.length; i++) {
          const s = state.view.toScreen(preview.rubber[i]);
          ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
      }
      if (preview.anchor) {
        const s = state.view.toScreen(preview.anchor);
        ctx.setLineDash([]);
        ctx.strokeStyle = MARK;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  };
  function drawGrid(ctx, state, dpr) {
    const { view } = state;
    const step = state.gridStep;
    if (!(step > 0)) return;
    const spacingPx = view.worldToPixels(step);
    const box = view.visibleWorldBox();
    const nx0 = Math.ceil(box.min.x / step);
    const nx1 = Math.floor(box.max.x / step);
    const ny0 = Math.ceil(box.min.y / step);
    const ny1 = Math.floor(box.max.y / step);
    if (spacingPx >= 2.5 && nx1 - nx0 <= 4e3 && ny1 - ny0 <= 4e3) {
      for (const major of [false, true]) {
        const deviceWidth = major ? 2 : 1;
        ctx.beginPath();
        ctx.lineWidth = deviceWidth / dpr;
        ctx.strokeStyle = major ? GRID_MAJOR : GRID_MINOR;
        for (let i = nx0; i <= nx1; i++) {
          if (isMajor(i) !== major) continue;
          const x = crisp(view.toScreen({ x: i * step, y: 0 }).x, dpr, deviceWidth);
          ctx.moveTo(x, 0);
          ctx.lineTo(x, view.height);
        }
        for (let i = ny0; i <= ny1; i++) {
          if (isMajor(i) !== major) continue;
          const y = crisp(view.toScreen({ x: 0, y: i * step }).y, dpr, deviceWidth);
          ctx.moveTo(0, y);
          ctx.lineTo(view.width, y);
        }
        ctx.stroke();
      }
    }
    const o = view.toScreen({ x: 0, y: 0 });
    ctx.lineWidth = 1 / dpr;
    ctx.strokeStyle = AXIS_X;
    ctx.beginPath();
    const ay = crisp(o.y, dpr, 1);
    ctx.moveTo(0, ay);
    ctx.lineTo(view.width, ay);
    ctx.stroke();
    ctx.strokeStyle = AXIS_Y;
    ctx.beginPath();
    const ax = crisp(o.x, dpr, 1);
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, view.height);
    ctx.stroke();
  }
  function isMajor(index) {
    return (index % 5 + 5) % 5 === 0;
  }
  function crisp(value, dpr, deviceWidth) {
    const px = value * dpr;
    return deviceWidth % 2 === 1 ? (Math.floor(px) + 0.5) / dpr : Math.round(px) / dpr;
  }
  function drawText(ctx, t, view) {
    const px = Math.max(1, t.height * view.zoom);
    ctx.font = TEXT_FONT.replace("%H%", String(px));
    ctx.textAlign = t.halign;
    ctx.textBaseline = t.valign === "center" ? "middle" : t.valign === "top" ? "top" : "alphabetic";
    const s = view.toScreen(t.position);
    ctx.save();
    ctx.setLineDash([]);
    ctx.translate(s.x, s.y);
    ctx.rotate(-t.rotation);
    const lines = t.text.split("\n");
    const lh = px * 1.2;
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 0, i * lh);
    ctx.restore();
  }
  function drawHandles(ctx, e, view) {
    const pts = [];
    if (e.kind === "line" || e.kind === "rect") pts.push(e.a, e.b);
    else if (e.kind === "polyline" || e.kind === "spline") pts.push(...e.points);
    else if (e.kind === "circle" || e.kind === "arc" || e.kind === "ellipse") pts.push(e.center);
    else if (e.kind === "text") pts.push(e.position);
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = SELECTED;
    ctx.lineWidth = 1.5;
    for (const p of pts) {
      const s = view.toScreen(p);
      ctx.beginPath();
      ctx.rect(s.x - 3, s.y - 3, 6, 6);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawSnapMark(ctx, mark, view) {
    const s = view.toScreen(mark.p);
    const r = 5.5;
    ctx.save();
    ctx.strokeStyle = MARK;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    switch (mark.kind) {
      case "endpoint":
        ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
        break;
      case "midpoint":
        ctx.moveTo(s.x, s.y - r);
        ctx.lineTo(s.x + r, s.y + r);
        ctx.lineTo(s.x - r, s.y + r);
        ctx.closePath();
        break;
      case "center":
        ctx.moveTo(s.x, s.y - r * 1.4);
        ctx.lineTo(s.x, s.y + r * 1.4);
        ctx.moveTo(s.x - r * 1.4, s.y);
        ctx.lineTo(s.x + r * 1.4, s.y);
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        break;
      case "intersection":
        ctx.moveTo(s.x - r, s.y - r);
        ctx.lineTo(s.x + r, s.y + r);
        ctx.moveTo(s.x + r, s.y - r);
        ctx.lineTo(s.x - r, s.y + r);
        break;
      case "quadrant":
        ctx.moveTo(s.x, s.y - r);
        ctx.lineTo(s.x + r, s.y);
        ctx.lineTo(s.x, s.y + r);
        ctx.lineTo(s.x - r, s.y);
        ctx.closePath();
        break;
      case "nearest":
      case "grid":
        ctx.arc(s.x, s.y, r * 0.8, 0, Math.PI * 2);
        break;
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawMarquee(ctx, m) {
    ctx.save();
    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = m.crossing ? "#3cb44b" : SELECTED;
    ctx.fillStyle = m.crossing ? "rgba(60,180,75,.14)" : "rgba(31,143,255,.14)";
    const x = Math.min(m.a.x, m.b.x);
    const y = Math.min(m.a.y, m.b.y);
    const w = Math.abs(m.b.x - m.a.x);
    const h = Math.abs(m.b.y - m.a.y);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
  function isOrthogonal(u, v2) {
    const l = Math.hypot(u.x, u.y) * Math.hypot(v2.x, v2.y);
    if (l < 1e-12) return false;
    return Math.abs((u.x * v2.x + u.y * v2.y) / l) < 1e-6;
  }
  function bboxIntersects(a, b) {
    if (!Number.isFinite(a.min.x) || !Number.isFinite(b.min.x)) return false;
    return a.max.x >= b.min.x && a.min.x <= b.max.x && a.max.y >= b.min.y && a.min.y <= b.max.y;
  }

  // src/core/edits.ts
  var NOTHING_SELECTED = "Nothing selected";
  var TOL = 0.05;
  function selectedEntities(doc, ids) {
    const out = [];
    for (const id of ids) {
      const e = doc.get(id);
      if (e) out.push(e);
    }
    return out;
  }
  function editable(doc, entities) {
    return entities.filter((e) => {
      const l = doc.layer(e.layerId);
      return !l || l.visible && !l.locked;
    });
  }
  function transformAll(doc, entities, m) {
    const pairs = entities.map((before) => ({ before, after: transformEntity(before, m) }));
    return replaceEntities(doc, pairs);
  }
  function translateEntities(doc, ids, delta) {
    const targets = editable(doc, selectedEntities(doc, ids));
    if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
    return { mutation: transformAll(doc, targets, matTranslate(delta)), message: `Moved ${targets.length}` };
  }
  function rotateEntities(doc, ids, about, radians) {
    const targets = editable(doc, selectedEntities(doc, ids));
    if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
    return { mutation: transformAll(doc, targets, matRotate(radians, about)), message: `Rotated ${targets.length}` };
  }
  function mirrorEntities(doc, ids, point, direction, keepOriginals = true) {
    const targets = editable(doc, selectedEntities(doc, ids));
    if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
    if (!keepOriginals) {
      return { mutation: transformAll(doc, targets, matMirror(point, direction)), message: `Mirrored ${targets.length}` };
    }
    const copies = targets.map((e) => transformEntity(cloneEntity(e), matMirror(point, direction)));
    return {
      mutation: insertEntities(doc, copies),
      message: `Copied and mirrored ${copies.length}`,
      produced: copies
    };
  }
  function scaleEntities(doc, ids, about, factor) {
    const targets = editable(doc, selectedEntities(doc, ids));
    if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
    if (!(factor > 0)) return { mutation: emptyMutation(), message: "Scale factor must be positive" };
    return {
      mutation: transformAll(doc, targets, matScale(factor, about)),
      message: `Scaled ${targets.length} by ${factor.toFixed(3)}`
    };
  }
  function copyEntities(doc, ids, delta) {
    const targets = selectedEntities(doc, ids);
    if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
    const copies = targets.map((e) => transformEntity(cloneEntity(e), matTranslate(delta)));
    return { mutation: insertEntities(doc, copies), message: `Copied ${copies.length}`, produced: copies };
  }
  function deleteEntities(doc, ids) {
    const targets = editable(doc, selectedEntities(doc, ids));
    if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
    return {
      mutation: removeEntities(doc, targets.map((e) => e.id)),
      message: `Deleted ${targets.length}`,
      consumed: targets.map((e) => e.id)
    };
  }
  function moveToLayer(doc, ids, layerId) {
    const targets = selectedEntities(doc, ids);
    if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
    const pairs = targets.map((before) => ({ before, after: { ...before, layerId } }));
    return { mutation: replaceEntities(doc, pairs), message: "Moved to layer" };
  }
  function offsetEntities(doc, ids, distance, side) {
    const targets = editable(doc, selectedEntities(doc, ids));
    if (!targets.length) return { mutation: emptyMutation(), message: NOTHING_SELECTED };
    const produced = [];
    const unsupported = [];
    for (const e of targets) {
      const o = offsetCopy(e, distance, side);
      if (o) produced.push(o);
      else unsupported.push(e.kind);
    }
    if (!produced.length) {
      return {
        mutation: emptyMutation(),
        message: `Offset cannot handle: ${[...new Set(unsupported)].join(", ") || "selection"}`
      };
    }
    return {
      mutation: insertEntities(doc, produced),
      message: `Offset ${produced.length}${unsupported.length ? `, ${unsupported.length} skipped` : ""}`,
      produced
    };
  }
  function offsetCopy(e, distance, side) {
    return offsetOne(e, distance, side);
  }
  function styleOf(e) {
    return { color: e.color, lineweight: e.lineweight, linetype: e.linetype };
  }
  function offsetOne(e, d, side) {
    switch (e.kind) {
      case "line":
        return offsetLine(e, d, side);
      case "circle": {
        const outward = dist(side, e.center) >= e.radius;
        const r = e.radius + (outward ? Math.abs(d) : -Math.abs(d));
        return r <= 1e-9 ? null : offsetCircle(e, r);
      }
      case "arc": {
        const outward = dist(side, e.center) >= e.radius;
        const r = e.radius + (outward ? Math.abs(d) : -Math.abs(d));
        return r <= 1e-9 ? null : { ...e, id: newId(), radius: r };
      }
      case "polyline":
        return offsetPolyline(e, d, side);
      case "rect":
        return offsetPolyline(rectAsPolyline(e), d, side);
      default:
        return null;
    }
  }
  function offsetCircle(e, radius) {
    return { ...e, id: newId(), radius };
  }
  function rectAsPolyline(r) {
    const points = [
      { x: r.a.x, y: r.a.y },
      { x: r.b.x, y: r.a.y },
      { x: r.b.x, y: r.b.y },
      { x: r.a.x, y: r.b.y }
    ];
    return { ...r, kind: "polyline", points, closed: true };
  }
  function sideNormal(dir, origin, side) {
    const n = perp(norm(dir));
    return dot(sub(side, origin), n) >= 0 ? n : mul(n, -1);
  }
  function offsetLine(e, d, side) {
    const o = mul(sideNormal(sub(e.b, e.a), e.a, side), Math.abs(d));
    return makeLine(e.layerId, add(e.a, o), add(e.b, o), styleOf(e));
  }
  function offsetPolyline(e, d, side) {
    const pts = e.points;
    if (pts.length < 2) return null;
    const first = sub(pts[1], pts[0]);
    if (dist(first, { x: 0, y: 0 }) < 1e-12) return null;
    const n = sideNormal(first, pts[0], side);
    const amount = Math.abs(d);
    const segCount = e.closed ? pts.length : pts.length - 1;
    const shifted = [];
    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const sn = sideNormal(sub(b, a), a, add(a, n));
      shifted.push({ a: add(a, mul(sn, amount)), b: add(b, mul(sn, amount)) });
    }
    const out = [];
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
  function mitreOrShared(prev, cur, amount) {
    const p = segmentIntersect(prev.a, prev.b, cur.a, cur.b);
    if (p && dist(p, cur.a) <= amount * 8) return p;
    return cur.a;
  }
  var LengthPath = class {
    constructor(pts, closed) {
      this.pts = pts;
      this.closed = closed;
      this.cum = [0];
      for (let i = 0; i + 1 < pts.length; i++) this.cum.push(this.cum[i] + dist(pts[i], pts[i + 1]));
      this.total = this.cum[this.cum.length - 1];
    }
    cum;
    total;
    pointAt(s) {
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
    paramOf(p) {
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
    slice(from, to) {
      const out = [this.pointAt(from)];
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      for (let i = 1; i < this.cum.length; i++) {
        if (this.cum[i] > lo && this.cum[i] < hi) out.push(clone(this.pts[i]));
      }
      out.push(this.pointAt(to));
      return dedupe(out);
    }
  };
  function mod(a, m) {
    return (a % m + m) % m;
  }
  function clamp(a, lo, hi) {
    return Math.min(hi, Math.max(lo, a));
  }
  function dedupe(pts) {
    const out = [];
    for (const p of pts) {
      if (!out.length || dist(out[out.length - 1], p) > 1e-9) out.push(p);
    }
    return out;
  }
  function planTrim(doc, cutterIds, targetId, click) {
    const target = doc.get(targetId);
    if (!target) return { ok: false, message: "Nothing to trim there" };
    const cutters = editable(doc, selectedEntities(doc, cutterIds));
    if (!cutters.length) return { ok: false, message: "Pick a cutting edge first" };
    const chains = flatten(target, TOL);
    if (chains.length !== 1 || chains[0].length < 2) {
      return { ok: false, message: "Trim needs a single-path target" };
    }
    const path = new LengthPath(chains[0], isClosedChain(chains[0]));
    if (path.total <= 1e-9) return { ok: false, message: "Target is degenerate" };
    const breaks = cutterBreaks(path, cutters);
    const sClick = path.paramOf(click);
    if (breaks.length === 0) return { ok: false, message: "No intersection to trim against" };
    let run = null;
    if (path.closed) {
      if (breaks.length < 2) return { ok: false, message: "Closed target needs two intersections" };
      const before = breaks.filter((b) => b < sClick).sort((a, b) => b - a)[0];
      const after = breaks.filter((b) => b > sClick).sort((a, b) => a - b)[0];
      const lo2 = before ?? Math.min(...breaks) - path.total;
      const hi2 = after ?? Math.max(...breaks) + path.total;
      if (lo2 < sClick && sClick < hi2) run = [lo2, hi2];
    } else {
      const bounds = [0, ...breaks.filter((b) => b > 0 && b < path.total), path.total].sort((a, b) => a - b);
      for (let i = 0; i + 1 < bounds.length; i++) {
        if (bounds[i] <= sClick && sClick <= bounds[i + 1]) {
          run = [bounds[i], bounds[i + 1]];
          break;
        }
      }
    }
    if (!run) return { ok: false, message: "Nothing to trim there" };
    const [lo, hi] = run;
    if (hi - lo < 1e-9) return { ok: false, message: "Nothing to trim there" };
    const remainders = [];
    if (path.closed) {
      remainders.push(path.slice(hi, lo + path.total));
    } else {
      if (lo > 1e-9) remainders.push(path.slice(0, lo));
      if (hi < path.total - 1e-9) remainders.push(path.slice(hi, path.total));
    }
    const replacement = remainders.filter((r) => r.length >= 2 && polylineSpan(r) > 1e-6).map((r, i) => rebuild(target, r, i === 0 ? target.id : newId()));
    return { ok: true, plan: { targetId, replacement } };
  }
  function trimAt(doc, cutterIds, targetId, click) {
    const result = planTrim(doc, cutterIds, targetId, click);
    if (!result.ok) return { mutation: emptyMutation(), message: result.message };
    const { plan } = result;
    const target = doc.get(plan.targetId);
    if (!target) return { mutation: emptyMutation(), message: "Nothing to trim there" };
    if (!plan.replacement.length) {
      return {
        mutation: removeEntities(doc, [plan.targetId]),
        message: "Removed trimmed geometry",
        consumed: [plan.targetId]
      };
    }
    const parts = [];
    for (const e of plan.replacement) {
      if (e.id === plan.targetId) parts.push(replaceEntities(doc, [{ before: target, after: e }]));
      else parts.push(insertEntities(doc, [e]));
    }
    const extras = plan.replacement.filter((e) => e.id !== plan.targetId);
    return {
      mutation: combineMutations(parts),
      message: "Trimmed",
      produced: extras.length ? extras : void 0
    };
  }
  function combineMutations(parts) {
    const out = emptyMutation();
    for (const p of parts) {
      out.added.push(...p.added);
      out.removed.push(...p.removed);
      out.changed.push(...p.changed);
    }
    return out;
  }
  function polylineSpan(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
    return d;
  }
  function isClosedChain(pts) {
    return pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-6;
  }
  function cutterBreaks(path, cutters) {
    const found = [];
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
    const unique = [...new Set(found.map((v2) => Math.round(v2 * 1e6) / 1e6))];
    return unique.sort((a, b) => a - b);
  }
  function rebuild(target, pts, id) {
    const style = styleOf(target);
    const clean = dedupe(pts);
    if (clean.length === 2 || clean.length > 2 && isStraight(clean)) {
      return { ...makeLine(target.layerId, clean[0], clean[clean.length - 1], style), id };
    }
    return { ...makePolyline(target.layerId, clean, false, style), id };
  }
  function isStraight(pts) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    const dir = sub(b, a);
    const l = dist(a, b);
    if (l < 1e-9) return true;
    for (let i = 1; i + 1 < pts.length; i++) {
      const d = dist(a, pts[i]);
      if (d < 1e-9) continue;
      const cross2 = Math.abs(dir.x * sub(pts[i], a).y - dir.y * sub(pts[i], a).x) / l;
      if (cross2 / d > 1e-4) return false;
    }
    return true;
  }

  // src/core/editor.ts
  var PICK_TOLERANCE_PX = 8;
  var Editor = class {
    constructor(canvas2) {
      this.canvas = canvas2;
      this.renderer = new Renderer(canvas2.getContext("2d"));
      this.installPointerHandlers();
      this.installWheelHandler();
      this.canvas.tabIndex = 0;
    }
    doc = new Document();
    view = new View();
    history = new History();
    selection = /* @__PURE__ */ new Set();
    settings = {
      grid: true,
      snap: true,
      osnap: true,
      ortho: false,
      gridDivisions: 1
    };
    hooks = {};
    /** Upper-case key -> tool id, filled in by the UI layer. */
    hotkeys = /* @__PURE__ */ new Map();
    tool = null;
    hoverId = null;
    preview = null;
    marquee = null;
    cursor = { x: 0, y: 0 };
    switchingTool = false;
    snapResult = null;
    renderer = null;
    factories = /* @__PURE__ */ new Map();
    base = null;
    frameRequested = false;
    panning = false;
    lastPointer = { x: 0, y: 0 };
    mods = { shift: false, ctrl: false, alt: false };
    /* ------------------------------------------------------------- registry -- */
    registerTool(id, factory) {
      this.factories.set(id, factory);
    }
    toolIds() {
      return [...this.factories.keys()];
    }
    toolLabel(id) {
      return this.factories.get(id)?.(this).label ?? id;
    }
    toolHint(id) {
      return this.factories.get(id)?.(this).hint ?? "";
    }
    activateTool(id) {
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
      this.canvas.style.cursor = this.tool.cursor ?? "crosshair";
      this.setPrompt(this.tool.hint);
      this.hooks.onToolChanged?.(id);
      this.tool.onStart?.();
      this.requestRender();
    }
    deactivateTool() {
      this.setBase(null);
      this.preview = null;
      this.marquee = null;
      this.tool = null;
      this.canvas.style.cursor = "crosshair";
      this.hooks.onToolChanged?.(null);
      this.requestRender();
    }
    /* ---------------------------------------------------------------- state -- */
    get entities() {
      return this.doc.all();
    }
    get shiftKey() {
      return this.mods.shift;
    }
    get ctrlKey() {
      return this.mods.ctrl;
    }
    toScreen(world) {
      return this.view.toScreen(world);
    }
    currentLayerId() {
      return this.doc.currentLayerId;
    }
    setBase(p) {
      this.base = p ? { x: p.x, y: p.y } : null;
    }
    getBase() {
      return this.base;
    }
    setPreview(preview) {
      this.preview = preview;
      this.requestRender();
    }
    setMarquee(marquee) {
      this.marquee = marquee;
      this.requestRender();
    }
    setPrompt(text) {
      this.hooks.onPrompt?.(text);
    }
    setStatus(text) {
      this.hooks.onStatus?.(text);
    }
    requestTextInsertion(at, done) {
      if (!this.hooks.onRequestText) {
        this.setStatus("Text entry is unavailable");
        this.activateTool("select");
        return;
      }
      this.hooks.onRequestText(at, done);
    }
    /* ------------------------------------------------------------ selection -- */
    replaceSelection(ids) {
      this.selection.clear();
      for (const id of ids) this.selection.add(id);
      this.hooks.onSelectionChanged?.(this.selection.size);
      this.requestRender();
    }
    addToSelection(id) {
      if (this.selection.add(id)) {
        this.hooks.onSelectionChanged?.(this.selection.size);
        this.requestRender();
      }
    }
    toggleSelection(id) {
      if (this.selection.has(id)) this.selection.delete(id);
      else this.selection.add(id);
      this.hooks.onSelectionChanged?.(this.selection.size);
      this.requestRender();
    }
    clearSelection() {
      if (!this.selection.size) return;
      this.selection.clear();
      this.hooks.onSelectionChanged?.(0);
      this.requestRender();
    }
    selectAll() {
      this.replaceSelection(this.doc.visibleEntities().map((e) => e.id));
    }
    selectedEntities() {
      const out = [];
      for (const id of this.selection) {
        const e = this.doc.get(id);
        if (e) out.push(e);
      }
      return out;
    }
    /** Select everything inside a screen rectangle; crossing mode touches. */
    selectInRect(a, b, crossing) {
      const wa = this.view.toWorld(a);
      const wb = this.view.toWorld(b);
      const box = {
        min: { x: Math.min(wa.x, wb.x), y: Math.min(wa.y, wb.y) },
        max: { x: Math.max(wa.x, wb.x), y: Math.max(wa.y, wb.y) }
      };
      const hit = [];
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
    outlineTouches(e, box) {
      const tol = this.view.pixelsToWorld(PICK_TOLERANCE_PX);
      for (const p of outlinePoints(e)) {
        if (bboxContains(box, p, tol)) return true;
      }
      return false;
    }
    /* ------------------------------------------------------------- geometry -- */
    pickAt(world, exclude) {
      const tol = this.view.pixelsToWorld(PICK_TOLERANCE_PX);
      return this.doc.pick(world, tol, (e) => e.id !== exclude);
    }
    /**
     * Grid spacing in world units. The drawn grid and the snap grid are always
     * the same number, so what the cursor lands on is what is on screen.
     */
    gridStep() {
      return unitGridStep(this.doc.units, this.view.zoom, this.settings.gridDivisions);
    }
    snap(raw) {
      return snapPoint({
        view: this.view,
        doc: this.doc,
        raw,
        gridEnabled: this.settings.snap,
        osnapEnabled: this.settings.osnap,
        orthoEnabled: this.settings.ortho,
        gridStep: this.gridStep(),
        base: this.base
      });
    }
    /* -------------------------------------------------------------- history -- */
    commit(label, outcome) {
      this.commitRaw(label, outcome.mutation);
      if (outcome.consumed) {
        for (const id of outcome.consumed) this.selection.delete(id);
        this.hooks.onSelectionChanged?.(this.selection.size);
      }
      if (outcome.message) this.setStatus(outcome.message);
    }
    commitRaw(label, mutation) {
      this.history.push(label, mutation);
      this.hooks.onHistoryChanged?.(this.history.canUndo, this.history.canRedo);
      this.requestRender();
    }
    insert(entities, label) {
      this.commit(label, { mutation: this.docInsert(entities), message: `${label} added` });
      if (!this.tool?.repeatable) {
        this.activateTool("select");
        return;
      }
      this.setBase(null);
      this.preview = null;
      this.marquee = null;
      this.tool.onStart?.();
      this.requestRender();
    }
    /** Adds to the document and returns the mutation for undo recording. */
    docInsert(entities) {
      const m = { added: [], removed: [], changed: [] };
      for (const e of entities) {
        this.doc.add(e);
        m.added.push({ entity: e, index: this.doc.indexOf(e.id) });
      }
      return m;
    }
    undo() {
      const label = this.history.undo(this.doc);
      if (!label) return;
      for (const id of [...this.selection]) if (!this.doc.has(id)) this.selection.delete(id);
      this.hooks.onSelectionChanged?.(this.selection.size);
      this.hooks.onHistoryChanged?.(this.history.canUndo, this.history.canRedo);
      this.setStatus(`Undo: ${label}`);
      this.requestRender();
    }
    redo() {
      const label = this.history.redo(this.doc);
      if (!label) return;
      this.hooks.onHistoryChanged?.(this.history.canUndo, this.history.canRedo);
      this.setStatus(`Redo: ${label}`);
      this.requestRender();
    }
    /* ----------------------------------------------------------------- view -- */
    fitToExtents() {
      const box = this.doc.extents();
      if (box.min.x === box.max.x && box.min.y === box.max.y) {
        this.view.zoom = 1;
        this.view.centerOn({ x: 0, y: 0 });
      } else {
        this.view.fitBox(box);
      }
      this.requestRender();
    }
    zoomBy(factor) {
      this.view.zoomAt(factor, { x: this.view.width / 2, y: this.view.height / 2 });
      this.requestRender();
    }
    /* ----------------------------------------------------------------- draw -- */
    requestRender() {
      if (this.frameRequested) return;
      this.frameRequested = true;
      requestAnimationFrame(() => {
        this.frameRequested = false;
        this.draw();
      });
    }
    resize(width, height, dpr) {
      this.view.resize(width, height);
      const scale = renderScale(dpr);
      this.canvas.width = Math.max(1, Math.round(width * scale));
      this.canvas.height = Math.max(1, Math.round(height * scale));
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.requestRender();
    }
    draw() {
      if (!this.renderer) return;
      const state = {
        view: this.view,
        doc: this.doc,
        showGrid: this.settings.grid,
        gridStep: this.gridStep(),
        selection: this.selection,
        hoverId: this.hoverId,
        preview: this.preview,
        snapMark: this.snapResult?.mark ?? null,
        marquee: this.marquee
      };
      this.renderer.render(state);
      this.hooks.onRendered?.();
    }
    /* --------------------------------------------------------------- input -- */
    screenOf(event) {
      const r = this.canvas.getBoundingClientRect();
      return { x: event.clientX - r.left, y: event.clientY - r.top };
    }
    installPointerHandlers() {
      this.canvas.addEventListener("pointerdown", (e) => {
        this.canvas.focus();
        this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey };
        const screen = this.screenOf(e);
        const world = this.view.toWorld(screen);
        this.lastPointer = screen;
        if (e.button === 1 || e.button === 0 && e.altKey) {
          this.panning = true;
          this.canvas.style.cursor = "grabbing";
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
      this.canvas.addEventListener("pointermove", (e) => {
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
        if (!this.tool || this.tool.id === "select") {
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
      this.canvas.addEventListener("pointerup", (e) => {
        if (this.panning) {
          this.panning = false;
          this.canvas.style.cursor = this.tool?.cursor ?? "crosshair";
          try {
            this.canvas.releasePointerCapture(e.pointerId);
          } catch {
          }
          return;
        }
        const screen = this.screenOf(e);
        const world = this.view.toWorld(screen);
        const snapped = this.snap(world);
        if (e.button === 0) this.tool?.onUp?.(snapped.p, world);
        this.requestRender();
      });
      this.canvas.addEventListener("pointerleave", () => {
        this.hoverId = null;
        this.snapResult = null;
        this.requestRender();
      });
      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    installWheelHandler() {
      this.canvas.addEventListener(
        "wheel",
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
    handleKey(event) {
      const e = event;
      const mod2 = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.key === "Escape") {
        e.preventDefault();
        this.cancelTool();
        return;
      }
      if (mod2 && key === "z") {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (mod2 && key === "y") {
        e.preventDefault();
        this.redo();
        return;
      }
      if (mod2 && key === "a") {
        e.preventDefault();
        this.selectAll();
        return;
      }
      if (mod2 && key === "f") {
        e.preventDefault();
        this.fitToExtents();
        return;
      }
      if (this.tool?.onKey?.(e)) {
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        this.finishTool();
        return;
      }
      if (!mod2 && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        this.deleteSelection();
        return;
      }
      if (!mod2 && e.key.length === 1) {
        const id = this.hotkeys.get(e.key.toUpperCase());
        if (id) {
          e.preventDefault();
          this.activateTool(id);
        }
      }
    }
    finishTool() {
      if (this.tool?.onFinish) this.tool.onFinish();
      else if (this.tool && this.tool.id !== "select") this.activateTool("select");
    }
    cancelTool() {
      if (this.tool?.onCancel) this.tool.onCancel();
      this.preview = null;
      this.marquee = null;
      this.setBase(null);
      this.activateTool("select");
      this.setStatus("Cancelled");
    }
    /* ------------------------------------------------------------ commands -- */
    deleteSelection() {
      if (!this.selection.size) {
        this.setStatus("Nothing selected");
        return;
      }
      this.commit("Delete", deleteEntities(this.doc, this.selection));
      this.clearSelection();
    }
  };
  function boxesOverlap(a, b) {
    return a.max.x >= b.min.x && a.min.x <= b.max.x && a.max.y >= b.min.y && a.min.y <= b.max.y;
  }
  function outlinePoints(e) {
    const b = entityBBox(e, 0.2);
    if (e.kind === "line") return [e.a, e.b];
    if (e.kind === "rect") return [e.a, e.b];
    if (e.kind === "polyline" || e.kind === "spline") return e.points;
    if (e.kind === "circle" || e.kind === "arc") {
      const c = e.center;
      const r = e.radius;
      const out = [c];
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2;
        out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
      }
      return out;
    }
    return [b.min, { x: b.max.x, y: b.min.y }, b.max, { x: b.min.x, y: b.max.y }];
  }

  // src/core/pages.ts
  var PageManager = class {
    pages = [];
    activeIndex = 0;
    constructor() {
      this.addPage("Page 1");
    }
    get activeDoc() {
      return this.pages[this.activeIndex].doc;
    }
    get activeId() {
      return this.pages[this.activeIndex].id;
    }
    get pagesInfo() {
      return this.pages.map((p) => ({ id: p.id, name: p.name }));
    }
    get count() {
      return this.pages.length;
    }
    addPage(name) {
      const id = "page-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      const doc = new Document();
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
    removePage(id) {
      if (this.pages.length <= 1) return false;
      const idx = this.pages.findIndex((p) => p.id === id);
      if (idx < 0) return false;
      this.pages.splice(idx, 1);
      if (this.activeIndex >= this.pages.length) this.activeIndex = this.pages.length - 1;
      return true;
    }
    setActive(id) {
      const idx = this.pages.findIndex((p) => p.id === id);
      if (idx < 0) return false;
      this.activeIndex = idx;
      return true;
    }
    renamePage(id, name) {
      const p = this.pages.find((x) => x.id === id);
      if (p) p.name = name;
    }
  };

  // src/tools/draw.ts
  function pv(entities, rubber = [], anchor = null) {
    return { entities, rubber, anchor };
  }
  function arcThroughThree(layer, start, via, end) {
    const center = circumcenter(start, via, end);
    if (!center) return null;
    const radius = dist(center, start);
    if (!(radius > 1e-9)) return null;
    const a0 = normalizeAngle(angleOf(center, start));
    const a1 = normalizeAngle(angleOf(center, end));
    const am = normalizeAngle(angleOf(center, via));
    return ccwSweep(a0, am) <= ccwSweep(a0, a1) ? makeArc(layer, center, radius, a0, a1) : makeArc(layer, center, radius, a1, a0);
  }
  function circumcenter(a, b, c) {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-12) return null;
    const a2 = a.x * a.x + a.y * a.y;
    const b2 = b.x * b.x + b.y * b.y;
    const c2 = c.x * c.x + c.y * c.y;
    return {
      x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
      y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
    };
  }
  function conjugateAxis(u, v2) {
    const n = norm(perp(u));
    return mul(n, dot(v2, n));
  }
  var LineTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    id = "line";
    label = "Line";
    hint = "Line: click the start point, Enter to finish";
    repeatable = true;
    flushOnExit = true;
    points = [];
    onStart() {
      this.points = [];
      this.kit.setPreview(null);
      this.kit.setBase(null);
      this.kit.setPrompt(this.hint);
    }
    onDown(p) {
      this.points.push(p);
      this.kit.setBase(p);
      this.kit.setPrompt("Line: click the next point, Enter to finish");
      this.onMove(p);
    }
    onMove(p) {
      if (!this.points.length) return;
      const fixed = this.points.slice(0, -1);
      const entities = [];
      for (let i = 0; i + 1 < fixed.length; i++) entities.push(makeLine(this.layer(), fixed[i], fixed[i + 1]));
      this.kit.setPreview(pv(entities, [this.points[this.points.length - 1], p]));
    }
    onFinish() {
      const out = [];
      for (let i = 0; i + 1 < this.points.length; i++) {
        out.push(makeLine(this.layer(), this.points[i], this.points[i + 1]));
      }
      this.onStart();
      if (out.length) this.kit.insert(out, "Line");
      else this.kit.setPrompt(this.hint);
    }
    onCancel() {
      this.onStart();
    }
    layer() {
      return this.kit.currentLayerId();
    }
  };
  var PolylineTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    id = "polyline";
    label = "Polyline";
    hint = "Polyline: click vertices, C closes, Backspace undoes, Enter finishes";
    repeatable = true;
    flushOnExit = true;
    points = [];
    closed = false;
    onStart() {
      this.points = [];
      this.closed = false;
      this.kit.setPreview(null);
      this.kit.setBase(null);
      this.kit.setPrompt(this.hint);
    }
    onDown(p) {
      this.points.push(p);
      this.kit.setBase(p);
      this.onMove(p);
    }
    onMove(p) {
      if (!this.points.length) return;
      const last = this.points[this.points.length - 1];
      const entities = this.points.length > 1 ? [makePolyline(this.layer(), this.points, false)] : [];
      const rubber = [last, p];
      if (this.closed && this.points.length > 2) rubber.push(this.points[0]);
      this.kit.setPreview(pv(entities, rubber));
    }
    onKey(e) {
      const k = e.key.toLowerCase();
      if (k === "c" && this.points.length > 2) {
        this.closed = true;
        this.onFinish();
        return true;
      }
      if (e.key === "Backspace" && this.points.length > 1) {
        this.points.pop();
        this.closed = false;
        const last = this.points[this.points.length - 1];
        this.kit.setBase(last);
        this.onMove(last);
        return true;
      }
      return false;
    }
    onFinish() {
      const count = this.points.length;
      const entity = count > 1 ? makePolyline(this.layer(), this.points, this.closed && count > 2) : null;
      this.onStart();
      if (entity) this.kit.insert([entity], "Polyline");
      else this.kit.setPrompt(this.hint);
    }
    onCancel() {
      this.onStart();
    }
    layer() {
      return this.kit.currentLayerId();
    }
  };
  var ArcTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    id = "arc";
    label = "Arc";
    hint = "Arc (3 points): click the start";
    repeatable = true;
    start = null;
    via = null;
    onStart() {
      this.start = null;
      this.via = null;
      this.kit.setPreview(null);
      this.kit.setBase(null);
      this.kit.setPrompt(this.hint);
    }
    onDown(p) {
      if (!this.start) {
        this.start = p;
        this.kit.setBase(p);
        this.kit.setPrompt("Arc: click a point the arc must pass through");
        return;
      }
      if (!this.via) {
        this.via = p;
        this.kit.setPrompt("Arc: click the end point");
        this.onMove(p);
        return;
      }
      const entity = arcThroughThree(this.layer(), this.start, this.via, p);
      const failed = !entity;
      this.onStart();
      if (entity) this.kit.insert([entity], "Arc");
      else if (failed) this.kit.setStatus("Arc: the three points are collinear");
    }
    onMove(p) {
      if (!this.start) {
        this.kit.setPreview(null);
        return;
      }
      if (!this.via) {
        this.kit.setPreview(pv([], [this.start, p], this.start));
        return;
      }
      const entity = arcThroughThree(this.layer(), this.start, this.via, p);
      this.kit.setPreview(entity ? pv([entity], [this.via, p], this.start) : pv([], [this.via, p]));
    }
    onFinish() {
      this.onStart();
    }
    onCancel() {
      this.onStart();
    }
    layer() {
      return this.kit.currentLayerId();
    }
  };
  var CircleTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    id = "circle";
    label = "Circle";
    hint = "Circle: click the centre, then the radius";
    repeatable = true;
    center = null;
    onStart() {
      this.center = null;
      this.kit.setPreview(null);
      this.kit.setBase(null);
      this.kit.setPrompt(this.hint);
    }
    onDown(p) {
      if (!this.center) {
        this.center = p;
        this.kit.setBase(p);
        this.kit.setPrompt("Circle: click the radius");
        return;
      }
      const radius = dist(this.center, p);
      const entity = radius > 1e-9 ? makeCircle(this.layer(), this.center, radius) : null;
      this.onStart();
      if (entity) this.kit.insert([entity], "Circle");
    }
    onMove(p) {
      if (!this.center) return;
      const radius = dist(this.center, p);
      const entities = radius > 1e-9 ? [makeCircle(this.layer(), this.center, radius)] : [];
      this.kit.setPreview(pv(entities, [this.center, p], this.center));
    }
    onFinish() {
      this.onStart();
    }
    onCancel() {
      this.onStart();
    }
    layer() {
      return this.kit.currentLayerId();
    }
  };
  var RectTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    id = "rect";
    label = "Rectangle";
    hint = "Rectangle: click the first corner";
    repeatable = true;
    a = null;
    onStart() {
      this.a = null;
      this.kit.setPreview(null);
      this.kit.setBase(null);
      this.kit.setPrompt(this.hint);
    }
    onDown(p) {
      if (!this.a) {
        this.a = p;
        this.kit.setBase(p);
        this.kit.setPrompt("Rectangle: click the opposite corner");
        return;
      }
      const entity = Math.abs(p.x - this.a.x) > 1e-9 && Math.abs(p.y - this.a.y) > 1e-9 ? makeRect(this.layer(), this.a, p) : null;
      this.onStart();
      if (entity) this.kit.insert([entity], "Rectangle");
    }
    onMove(p) {
      if (!this.a) return;
      const flat = Math.abs(p.x - this.a.x) < 1e-9 || Math.abs(p.y - this.a.y) < 1e-9;
      const entities = flat ? [] : [makeRect(this.layer(), this.a, p)];
      const rubber = flat ? [this.a, p] : [this.a, p];
      this.kit.setPreview(pv(entities, rubber, this.a));
    }
    onFinish() {
      this.onStart();
    }
    onCancel() {
      this.onStart();
    }
    layer() {
      return this.kit.currentLayerId();
    }
  };
  var EllipseTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    id = "ellipse";
    label = "Ellipse";
    hint = "Ellipse: click the centre";
    repeatable = true;
    center = null;
    u = null;
    onStart() {
      this.center = null;
      this.u = null;
      this.kit.setPreview(null);
      this.kit.setBase(null);
      this.kit.setPrompt(this.hint);
    }
    onDown(p) {
      if (!this.center) {
        this.center = p;
        this.kit.setBase(p);
        this.kit.setPrompt("Ellipse: click the end of the major axis");
        return;
      }
      if (!this.u) {
        const u = sub(p, this.center);
        if (dist(u, { x: 0, y: 0 }) < 1e-9) return;
        this.u = u;
        this.kit.setBase(p);
        this.kit.setPrompt("Ellipse: click the end of the minor axis");
        return;
      }
      const v2 = conjugateAxis(this.u, sub(p, this.center));
      if (dist(v2, { x: 0, y: 0 }) < 1e-9) {
        this.onStart();
        this.kit.setStatus("Ellipse: the second axis has no length");
        return;
      }
      const entity = makeEllipse(this.layer(), this.center, this.u, v2);
      this.onStart();
      this.kit.insert([entity], "Ellipse");
    }
    onMove(p) {
      if (!this.center) return;
      if (!this.u) {
        const u = sub(p, this.center);
        if (dist(u, { x: 0, y: 0 }) < 1e-9) {
          this.kit.setPreview(null);
          return;
        }
        const tentative = makeEllipse(this.layer(), this.center, u, conjugateAxis(u, mul(perp(u), 0.6)));
        this.kit.setPreview(pv([tentative], [this.center, p], this.center));
        return;
      }
      const v2 = conjugateAxis(this.u, sub(p, this.center));
      const entities = dist(v2, { x: 0, y: 0 }) < 1e-9 ? [] : [makeEllipse(this.layer(), this.center, this.u, v2)];
      this.kit.setPreview(pv(entities, [this.center, p], this.center));
    }
    onFinish() {
      this.onStart();
    }
    onCancel() {
      this.onStart();
    }
    layer() {
      return this.kit.currentLayerId();
    }
  };
  var SplineTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    id = "spline";
    label = "Spline";
    hint = "Spline: click points for the curve to pass near, Enter fits";
    repeatable = true;
    flushOnExit = true;
    points = [];
    onStart() {
      this.points = [];
      this.kit.setPreview(null);
      this.kit.setBase(null);
      this.kit.setPrompt(this.hint);
    }
    onDown(p) {
      this.points.push(p);
      this.kit.setBase(p);
      this.kit.setPrompt(`Spline: ${this.points.length} point(s) \u2014 Enter fits, Escape cancels`);
      this.onMove(p);
    }
    onMove(p) {
      const pts = [...this.points, p];
      const entities = pts.length >= 3 ? [makeSpline(this.layer(), pts)] : [];
      const rubber = pts.length === 2 ? pts : [];
      this.kit.setPreview(pv(entities, rubber));
    }
    onFinish() {
      const entity = this.points.length >= 2 ? makeSpline(this.layer(), this.points) : null;
      this.onStart();
      if (entity) this.kit.insert([entity], "Spline");
      else this.kit.setPrompt(this.hint);
    }
    onCancel() {
      this.onStart();
    }
    layer() {
      return this.kit.currentLayerId();
    }
  };
  var TextTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    id = "text";
    label = "Text";
    hint = "Text: click the insertion point";
    repeatable = true;
    onDown(p) {
      this.kit.setPreview(null);
      this.kit.requestTextInsertion(p, (text, height) => {
        if (!text.trim()) {
          this.kit.setPrompt(this.hint);
          return;
        }
        const entity = makeText(this.kit.currentLayerId(), p, Math.max(0.1, height), text);
        this.kit.insert([entity], "Text");
        this.kit.setStatus(`Added text: ${text.slice(0, 24)}`);
      });
    }
    onCancel() {
      this.kit.setPrompt(this.hint);
    }
  };

  // src/tools/modify.ts
  var DEG = 180 / Math.PI;
  function numberKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    if (/^[0-9]$/.test(e.key)) return e.key;
    if (e.key === ",") return ".";
    if (e.key === "." || e.key === "-") return e.key;
    return null;
  }
  var ModifyTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    ids = [];
    phase = "pick";
    typed = "";
    onStart() {
      this.typed = "";
      this.ids = [...this.kit.selection];
      this.phase = this.ids.length ? "points" : "pick";
      this.kit.setPreview(null);
      if (this.phase === "points") this.beginPoints();
      else this.kit.setPrompt(`${this.label}: select objects, then press Enter`);
    }
    onDown(p, raw) {
      if (this.phase === "pick") {
        const hit = this.kit.pickAt(raw);
        if (!hit) return;
        if (!this.ids.includes(hit.id)) this.ids.push(hit.id);
        this.kit.replaceSelection(this.ids);
        this.kit.setPrompt(`${this.ids.length} selected \u2014 Enter to continue`);
        return;
      }
      this.onPoint(p, raw);
    }
    onMove(p, raw) {
      if (this.phase === "points") this.onMovePoints(p, raw);
    }
    onFinish() {
      if (this.phase === "pick") {
        if (!this.ids.length) {
          this.kit.setStatus(`${this.label}: nothing selected`);
          return;
        }
        this.phase = "points";
        this.beginPoints();
        return;
      }
      if (this.typed) {
        const value = Number(this.typed);
        this.typed = "";
        if (Number.isFinite(value)) this.onTyped(value);
        else {
          this.kit.setStatus(`${this.label}: not a number`);
          this.restart();
        }
        return;
      }
      this.commitPoints();
    }
    onCancel() {
      this.restart();
    }
    onKey(e) {
      if (this.phase !== "points" || !this.acceptsTypedInput()) return false;
      const k = numberKey(e);
      if (!k) return false;
      if (k === "-" && this.typed.length) return false;
      if (k === "." && this.typed.includes(".")) return false;
      this.typed += k;
      this.kit.setPrompt(`${this.label}: ${this.typed}${this.typedHint()} \u2014 Enter applies it`);
      return true;
    }
    onMovePoints(_p, _raw) {
    }
    onTyped(_value) {
      this.kit.setStatus(`${this.label}: this step needs a point, not a number`);
    }
    acceptsTypedInput() {
      return false;
    }
    typedHint() {
      return "";
    }
    ghost(matrix, rubber = [], anchor = null) {
      this.kit.setPreview({
        entities: this.targets().map((e) => transformEntity(cloneEntity(e), matrix)),
        rubber,
        anchor
      });
    }
    targets() {
      const out = [];
      for (const id of this.ids) {
        const e = this.kit.entities.find((x) => x.id === id);
        if (e) out.push(e);
      }
      return out;
    }
    apply(label, outcome, reselect = false) {
      this.kit.setPreview(null);
      this.kit.commit(label, outcome);
      if (reselect && outcome.produced) this.kit.replaceSelection(outcome.produced.map((e) => e.id));
      this.restart();
    }
    restart() {
      this.kit.activateTool(this.id);
    }
  };
  var MoveTool = class extends ModifyTool {
    id = "move";
    label = "Move";
    hint = "Move: click a base point, then the destination";
    base = null;
    beginPoints() {
      this.base = null;
      this.kit.setPrompt("Move: specify the base point");
    }
    onPoint(p) {
      if (!this.base) {
        this.base = p;
        this.kit.setBase(p);
        this.kit.setPrompt("Move: specify the second point");
        return;
      }
      this.apply("Move", translateEntities(this.kit.doc, this.ids, sub(p, this.base)));
    }
    commitPoints() {
      this.kit.setStatus("Move needs two points");
      this.restart();
    }
    onMovePoints(p) {
      if (!this.base) {
        this.kit.setPreview(null);
        return;
      }
      const delta = sub(p, this.base);
      this.ghost(matTranslate(delta));
      this.kit.setStatus(`Move: ${delta.x.toFixed(3)}, ${delta.y.toFixed(3)}`);
    }
  };
  var CopyTool = class extends ModifyTool {
    id = "copy";
    label = "Copy";
    hint = "Copy: click a base point, then the destination";
    base = null;
    beginPoints() {
      this.base = null;
      this.kit.setPrompt("Copy: specify the base point");
    }
    onPoint(p) {
      if (!this.base) {
        this.base = p;
        this.kit.setBase(p);
        this.kit.setPrompt("Copy: specify the destination");
        return;
      }
      this.apply("Copy", copyEntities(this.kit.doc, this.ids, sub(p, this.base)), true);
    }
    commitPoints() {
      this.kit.setStatus("Copy needs two points");
      this.restart();
    }
    onMovePoints(p) {
      if (!this.base) return;
      const delta = sub(p, this.base);
      this.ghost(matTranslate(delta));
      this.kit.setStatus(`Copy: ${delta.x.toFixed(3)}, ${delta.y.toFixed(3)}`);
    }
  };
  var RotateTool = class extends ModifyTool {
    id = "rotate";
    label = "Rotate";
    hint = "Rotate: centre, reference point, target point \u2014 or type an angle";
    center = null;
    reference = null;
    acceptsTypedInput() {
      return true;
    }
    typedHint() {
      return " degrees";
    }
    beginPoints() {
      this.center = null;
      this.reference = null;
      this.kit.setPrompt("Rotate: specify the centre point");
    }
    /** Angle relative to the reference ray, as the cursor moves. */
    angleAt(p) {
      if (!this.center || !this.reference) return 0;
      return angleOf(this.center, p) - angleOf(this.center, this.reference);
    }
    onPoint(p) {
      if (!this.center) {
        this.center = p;
        this.kit.setBase(p);
        this.kit.setPrompt("Rotate: specify a reference angle point");
        return;
      }
      if (!this.reference) {
        if (dist(p, this.center) < 1e-9) {
          this.kit.setStatus("Rotate: the reference point is on the centre");
          return;
        }
        this.reference = p;
        this.kit.setPrompt("Rotate: specify the new angle point, or type degrees");
        return;
      }
      this.apply("Rotate", rotateEntities(this.kit.doc, this.ids, this.center, this.angleAt(p)));
    }
    onTyped(degrees) {
      if (!this.center) {
        this.kit.setStatus("Rotate: specify the centre first");
        return;
      }
      this.apply("Rotate", rotateEntities(this.kit.doc, this.ids, this.center, degrees / DEG));
    }
    commitPoints() {
      this.kit.setStatus("Rotate needs a centre and an angle point");
      this.restart();
    }
    onMovePoints(p) {
      if (!this.center || !this.reference) return;
      const radians = this.angleAt(p);
      this.ghost(matRotate(radians, this.center), [this.center, p], this.center);
      this.kit.setStatus(`Rotate: ${(radians * DEG).toFixed(2)}\xB0`);
    }
  };
  var MirrorTool = class extends ModifyTool {
    id = "mirror";
    label = "Mirror";
    hint = "Mirror: click two points on the mirror line (Shift mirrors in place)";
    a = null;
    beginPoints() {
      this.a = null;
      this.kit.setPrompt("Mirror: specify the first point of the mirror line");
    }
    onPoint(p) {
      if (!this.a) {
        this.a = p;
        this.kit.setBase(p);
        this.kit.setPrompt("Mirror: specify the second point of the mirror line");
        return;
      }
      const axis = sub(p, this.a);
      if (dist(axis, { x: 0, y: 0 }) < 1e-9) {
        this.kit.setStatus("Mirror: the two line points are the same");
        return;
      }
      const keep = !this.kit.shiftKey;
      this.apply(
        "Mirror",
        mirrorEntities(this.kit.doc, this.ids, this.a, axis, keep),
        keep
      );
    }
    commitPoints() {
      this.kit.setStatus("Mirror needs two line points");
      this.restart();
    }
    onMovePoints(p) {
      if (!this.a) return;
      const axis = sub(p, this.a);
      if (dist(axis, { x: 0, y: 0 }) < 1e-9) return;
      this.ghost(matMirror(this.a, axis), [this.a, p], this.a);
    }
  };
  var ScaleTool = class extends ModifyTool {
    id = "scale";
    label = "Scale";
    hint = "Scale: anchor, reference point, target point \u2014 or type a factor";
    anchor = null;
    reference = null;
    acceptsTypedInput() {
      return true;
    }
    typedHint() {
      return " factor";
    }
    beginPoints() {
      this.anchor = null;
      this.reference = null;
      this.kit.setPrompt("Scale: specify the anchor point");
    }
    onPoint(p) {
      if (!this.anchor) {
        this.anchor = p;
        this.kit.setBase(p);
        this.kit.setPrompt("Scale: specify the reference length point");
        return;
      }
      if (!this.reference) {
        if (dist(p, this.anchor) < 1e-9) {
          this.kit.setStatus("Scale: the reference point is on the anchor");
          return;
        }
        this.reference = p;
        this.kit.setPrompt("Scale: specify the new length, or type a factor");
        return;
      }
      const factor = dist(p, this.anchor) / dist(this.reference, this.anchor);
      this.apply("Scale", scaleEntities(this.kit.doc, this.ids, this.anchor, factor));
    }
    onTyped(factor) {
      if (!this.anchor) {
        this.kit.setStatus("Scale: specify the anchor first");
        return;
      }
      this.apply("Scale", scaleEntities(this.kit.doc, this.ids, this.anchor, factor));
    }
    commitPoints() {
      this.kit.setStatus("Scale needs an anchor, reference and target");
      this.restart();
    }
    onMovePoints(p) {
      if (!this.anchor || !this.reference) return;
      const reference = dist(this.reference, this.anchor);
      if (reference < 1e-9) return;
      const factor = dist(p, this.anchor) / reference;
      this.ghost(matScale(factor, this.anchor), [this.anchor, p], this.anchor);
      this.kit.setStatus(`Scale: ${factor.toFixed(4)}`);
    }
  };
  var OffsetTool = class extends ModifyTool {
    id = "offset";
    label = "Offset";
    hint = "Offset: pick curves, Enter, type or measure a distance, click the side";
    distance = null;
    anchor = null;
    acceptsTypedInput() {
      return true;
    }
    typedHint() {
      return " distance";
    }
    beginPoints() {
      this.distance = null;
      this.anchor = null;
      this.kit.setPrompt("Offset: type a distance, or click two points to measure it");
    }
    onPoint(p) {
      if (this.distance === null) {
        if (!this.anchor) {
          this.anchor = p;
          this.kit.setBase(p);
          this.kit.setPrompt("Offset: click the second point of the distance");
          return;
        }
        const measured = dist(p, this.anchor);
        if (measured < 1e-9) {
          this.kit.setStatus("Offset: the two points are the same");
          return;
        }
        this.distance = measured;
        this.anchor = null;
        this.kit.setPrompt(`Offset ${this.distance.toFixed(3)}: click the side for each curve`);
        return;
      }
      this.apply("Offset", offsetEntities(this.kit.doc, this.ids, this.distance, p), true);
    }
    onTyped(value) {
      if (value === 0) {
        this.kit.setStatus("Offset: distance must not be zero");
        return;
      }
      this.distance = Math.abs(value);
      this.kit.setPrompt(`Offset ${this.distance.toFixed(3)}: click the side for each curve`);
    }
    commitPoints() {
      if (this.distance === null) {
        this.kit.setStatus("Offset: specify a distance first");
        return;
      }
      this.kit.setStatus("Offset: click the side to place each copy");
    }
    /**
     * Preview every candidate copy. offsetCopy is pure, so nothing is written to
     * the document until the user commits a side.
     */
    onMovePoints(p) {
      if (this.distance === null) {
        if (this.anchor) {
          this.kit.setPreview({ entities: [], rubber: [this.anchor, p], anchor: this.anchor });
          this.kit.setStatus(`Offset distance: ${dist(p, this.anchor).toFixed(3)}`);
        }
        return;
      }
      const ghosts = [];
      for (const e of this.targets()) {
        const copy = offsetCopy(e, this.distance, p);
        if (copy) ghosts.push(copy);
      }
      this.kit.setPreview({ entities: ghosts, rubber: [], anchor: p });
    }
  };
  var TrimTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    id = "trim";
    label = "Trim";
    hint = "Trim: pick cutting edges, Enter, then click the parts to remove";
    repeatable = true;
    cutters = [];
    phase = "edges";
    onStart() {
      this.cutters = [];
      this.phase = "edges";
      this.kit.setPreview(null);
      this.kit.setPrompt(this.hint);
    }
    onDown(p, raw) {
      const hit = this.kit.pickAt(raw);
      if (!hit) return;
      if (this.phase === "edges") {
        if (hit.id && !this.cutters.includes(hit.id)) this.cutters.push(hit.id);
        this.kit.replaceSelection(this.cutters);
        this.kit.setPrompt(`${this.cutters.length} cutting edge(s) \u2014 Enter to start trimming`);
        return;
      }
      const outcome = trimAt(this.kit.doc, this.cutters, hit.id, p);
      this.kit.commit("Trim", outcome);
      if (outcome.produced) this.kit.addToSelection(outcome.produced[0].id);
    }
    onMove(p, raw) {
      if (this.phase !== "parts") return;
      const hit = this.kit.pickAt(raw);
      if (!hit || this.cutters.includes(hit.id)) {
        this.kit.setPreview(null);
        return;
      }
      const result = planTrim(this.kit.doc, this.cutters, hit.id, p);
      this.kit.setPreview({ entities: result.ok ? result.plan.replacement : [], rubber: [], anchor: null });
    }
    onFinish() {
      if (this.phase === "edges") {
        if (!this.cutters.length) {
          this.kit.setStatus("Trim: pick at least one cutting edge");
          return;
        }
        this.phase = "parts";
        this.kit.setPrompt("Trim: click the parts to remove, Enter or Escape to stop");
        return;
      }
      this.kit.setPreview(null);
      this.kit.activateTool("select");
    }
    onCancel() {
      this.kit.setPreview(null);
      this.kit.activateTool("select");
    }
  };
  var EraseTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    id = "erase";
    label = "Erase";
    hint = "Erase: click geometry to delete it";
    repeatable = true;
    onStart() {
      this.kit.setPrompt(this.hint);
    }
    onDown(_p, raw) {
      const hit = this.kit.pickAt(raw);
      if (!hit) return;
      this.kit.commit("Erase", deleteEntities(this.kit.doc, [hit.id]));
    }
    onFinish() {
      this.kit.activateTool("select");
    }
    onCancel() {
      this.kit.activateTool("select");
    }
  };

  // src/tools/select.ts
  var DRAG_THRESHOLD_PX = 4;
  var SelectTool = class {
    constructor(kit) {
      this.kit = kit;
    }
    id = "select";
    label = "Select";
    hint = "Select: click, drag a window, or drag geometry to move it";
    cursor = "default";
    mode = "idle";
    base = null;
    downScreen = null;
    marqueeFrom = null;
    dragTargets = [];
    copyOnRelease = false;
    onStart() {
      this.reset();
      this.kit.setPrompt(this.hint);
    }
    onCancel() {
      this.reset();
      this.kit.clearSelection();
    }
    onFinish() {
      this.reset();
      this.kit.clearSelection();
    }
    onDown(p, raw) {
      const screen = this.kit.toScreen(raw);
      this.downScreen = screen;
      const hit = this.kit.pickAt(raw);
      if (hit) {
        if (this.kit.shiftKey) {
          this.kit.toggleSelection(hit.id);
          this.mode = "idle";
          return;
        }
        if (!this.kit.selection.has(hit.id)) this.kit.replaceSelection([hit.id]);
        this.dragTargets = this.selectedEntities();
        this.base = p;
        this.copyOnRelease = this.kit.ctrlKey;
        this.mode = "pending";
        return;
      }
      if (!this.kit.shiftKey) this.kit.clearSelection();
      this.marqueeFrom = screen;
      this.mode = "marquee";
    }
    onMove(p) {
      if (this.mode === "pending" && this.downScreen) {
        if (dist(this.kit.toScreen(p), this.downScreen) > DRAG_THRESHOLD_PX) this.mode = "move";
      }
      if (this.mode === "move" && this.base) {
        const delta = { x: p.x - this.base.x, y: p.y - this.base.y };
        this.kit.setPreview({
          entities: this.dragTargets.map((e) => transformEntity(cloneEntity(e), matTranslate(delta))),
          rubber: [],
          anchor: null
        });
        this.kit.setStatus(`Move: ${fmt(delta.x)}, ${fmt(delta.y)}`);
        return;
      }
      if (this.mode === "marquee" && this.marqueeFrom) {
        const to = this.kit.toScreen(p);
        this.kit.setMarquee({ a: this.marqueeFrom, b: to, crossing: to.x < this.marqueeFrom.x });
      }
    }
    onUp(p) {
      if (this.mode === "move" && this.base) {
        const delta = { x: p.x - this.base.x, y: p.y - this.base.y };
        const ids = this.dragTargets.map((e) => e.id);
        if (Math.abs(delta.x) > 1e-9 || Math.abs(delta.y) > 1e-9) {
          if (this.copyOnRelease) {
            const outcome = copyEntities(this.kit.doc, ids, delta);
            this.kit.commit("Copy", outcome);
            if (outcome.produced) this.kit.replaceSelection(outcome.produced.map((e) => e.id));
          } else {
            this.kit.commit("Move", translateEntities(this.kit.doc, ids, delta));
          }
        }
      } else if (this.mode === "marquee" && this.marqueeFrom) {
        const to = this.kit.toScreen(p);
        const hit = this.kit.selectInRect(this.marqueeFrom, to, to.x < this.marqueeFrom.x);
        if (this.kit.shiftKey) for (const id of hit) this.kit.addToSelection(id);
        else this.kit.replaceSelection(hit);
      }
      this.reset();
      this.kit.requestRender();
    }
    selectedEntities() {
      const out = [];
      for (const id of this.kit.selection) {
        const e = this.kit.entities.find((x) => x.id === id);
        if (e) out.push(e);
      }
      return out;
    }
    reset() {
      this.mode = "idle";
      this.base = null;
      this.downScreen = null;
      this.marqueeFrom = null;
      this.dragTargets = [];
      this.copyOnRelease = false;
      this.kit.setPreview(null);
      this.kit.setMarquee(null);
    }
  };
  function fmt(n) {
    return (Math.round(n * 1e3) / 1e3).toString();
  }

  // src/tools/registry.ts
  var TOOL_INFO = [
    { id: "select", label: "Select", key: "V", group: "draw" },
    { id: "line", label: "Line", key: "L", group: "draw" },
    { id: "polyline", label: "Polyline", key: "P", group: "draw" },
    { id: "arc", label: "Arc", key: "A", group: "draw" },
    { id: "circle", label: "Circle", key: "C", group: "draw" },
    { id: "ellipse", label: "Ellipse", key: "E", group: "draw" },
    { id: "rect", label: "Rectangle", key: "R", group: "draw" },
    { id: "spline", label: "Spline", key: "S", group: "draw" },
    { id: "text", label: "Text", key: "T", group: "draw" },
    { id: "move", label: "Move", key: "M", group: "modify" },
    { id: "copy", label: "Copy", key: "K", group: "modify" },
    { id: "rotate", label: "Rotate", key: "O", group: "modify" },
    { id: "mirror", label: "Mirror", key: "I", group: "modify" },
    { id: "scale", label: "Scale", key: "F", group: "modify" },
    { id: "offset", label: "Offset", key: "U", group: "modify" },
    { id: "trim", label: "Trim", key: "B", group: "modify" },
    { id: "erase", label: "Erase", key: "X", group: "modify" }
  ];
  var FACTORIES = {
    select: (kit) => new SelectTool(kit),
    line: (kit) => new LineTool(kit),
    polyline: (kit) => new PolylineTool(kit),
    arc: (kit) => new ArcTool(kit),
    circle: (kit) => new CircleTool(kit),
    ellipse: (kit) => new EllipseTool(kit),
    rect: (kit) => new RectTool(kit),
    spline: (kit) => new SplineTool(kit),
    text: (kit) => new TextTool(kit),
    move: (kit) => new MoveTool(kit),
    copy: (kit) => new CopyTool(kit),
    rotate: (kit) => new RotateTool(kit),
    mirror: (kit) => new MirrorTool(kit),
    scale: (kit) => new ScaleTool(kit),
    offset: (kit) => new OffsetTool(kit),
    trim: (kit) => new TrimTool(kit),
    erase: (kit) => new EraseTool(kit)
  };
  function registerTools(register) {
    for (const [id, factory] of Object.entries(FACTORIES)) register(id, factory);
  }

  // src/io/files.ts
  function downloadText(filename, text, mime) {
    downloadBlob(filename, new Blob([text], { type: mime }));
  }
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4e3);
  }
  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(reader.error?.message ?? "Could not read the file"));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsText(file);
    });
  }

  // src/io/json.ts
  var FILE_EXTENSION = ".oddr";
  function documentFileName(doc) {
    const safe = (doc.name || "drawing").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "drawing";
    return `${safe}${FILE_EXTENSION}`;
  }
  function saveDocument(doc) {
    downloadText(documentFileName(doc), JSON.stringify(doc.toJSON(), null, 2), "application/json");
  }
  async function loadDocument(file, doc) {
    const text = await readTextFile(file);
    const parsed = JSON.parse(text);
    doc.loadJSON(parsed);
    return parsed;
  }

  // src/io/svg.ts
  function num(n) {
    const r = Math.round(n * 1e6) / 1e6;
    return Object.is(r, -0) ? "0" : String(r);
  }
  function styleAttrs(e, layer) {
    const stroke = e.color ?? layer?.color ?? "#000000";
    const weight = e.lineweight ?? layer?.lineweight ?? 0.25;
    const type = e.linetype ?? layer?.linetype ?? "continuous";
    const dash = {
      continuous: "",
      dashed: "9,5",
      dotted: "1.5,4",
      dashdot: "12,5,2,5",
      centre: "16,5,3,5"
    }[type];
    return `stroke="${stroke}" stroke-width="${num(weight * 4)}" fill="none" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}`;
  }
  function pathFromChain(chain, closed) {
    if (chain.length < 2) return "";
    let d = `M ${num(chain[0].x)} ${num(chain[0].y)}`;
    for (let i = 1; i < chain.length; i++) d += ` L ${num(chain[i].x)} ${num(chain[i].y)}`;
    return d + (closed ? " Z" : "");
  }
  function toSvg(doc) {
    const box = doc.extents();
    const margin = Math.max((box.max.x - box.min.x) * 0.02, 2);
    const min = { x: box.min.x - margin, y: box.min.y - margin };
    const max = { x: box.max.x + margin, y: box.max.y + margin };
    const w = Math.max(1, max.x - min.x);
    const h = Math.max(1, max.y - min.y);
    const parts = [];
    for (const e of doc.visibleEntities()) {
      const layer = doc.layer(e.layerId);
      if (layer && !layer.visible) continue;
      const attrs = styleAttrs(e, layer);
      if (e.kind === "text") {
        parts.push(
          `<text x="${num(e.position.x)}" y="${num(e.position.y)}" transform="scale(1,-1)" font-family="'Segoe UI', system-ui, sans-serif" font-weight="600" font-size="${num(e.height)}" fill="${e.color ?? layer?.color ?? "#000000"}" text-anchor="${e.halign}" dominant-baseline="${e.valign === "center" ? "middle" : e.valign === "top" ? "hanging" : "alphabetic"}">${escapeXml(
            e.text.replace(/\n/g, " ")
          )}</text>`
        );
        continue;
      }
      if (e.kind === "circle") {
        parts.push(`<circle cx="${num(e.center.x)}" cy="${num(e.center.y)}" r="${num(e.radius)}" ${attrs}/>`);
        continue;
      }
      if (e.kind === "arc") {
        const sweepCCW = ((e.end - e.start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const large = sweepCCW > Math.PI ? 1 : 0;
        const x0 = e.center.x + e.radius * Math.cos(e.start);
        const y0 = e.center.y + e.radius * Math.sin(e.start);
        const x1 = e.center.x + e.radius * Math.cos(e.end);
        const y1 = e.center.y + e.radius * Math.sin(e.end);
        parts.push(
          `<path d="M ${num(x0)} ${num(y0)} A ${num(e.radius)} ${num(e.radius)} 0 ${large} 0 ${num(x1)} ${num(y1)}" ${attrs}/>`
        );
        continue;
      }
      const closed = e.kind === "polyline" ? e.closed : e.kind === "rect" || e.kind === "ellipse";
      for (const chain of flatten(e, Math.max(w, h) / 2e3)) {
        parts.push(`<path d="${pathFromChain(chain, closed)}" ${attrs}/>`);
      }
    }
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${num(w)}" height="${num(h)}" viewBox="${num(min.x)} ${num(-max.y)} ${num(w)} ${num(h)}">
<rect x="${num(min.x)}" y="${num(-max.y)}" width="${num(w)}" height="${num(h)}" fill="#ffffff"/>
<g transform="scale(1,-1)">
${parts.join("\n")}
</g>
</svg>
`;
    return { text, box };
  }
  function escapeXml(s) {
    return s.replace(
      /[<>&'"]/g,
      (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;"
    );
  }

  // src/io/png.ts
  function renderToCanvas(doc, options = {}) {
    const maxSide = options.maxSide ?? 1600;
    const box = doc.extents();
    const w = Math.max(box.max.x - box.min.x, 1e-6);
    const h = Math.max(box.max.y - box.min.y, 1e-6);
    const scale = Math.min(maxSide / w, maxSide / h);
    const pxW = Math.max(1, Math.round(w * scale));
    const pxH = Math.max(1, Math.round(h * scale));
    const canvas2 = document.createElement("canvas");
    canvas2.width = pxW;
    canvas2.height = pxH;
    const ctx = canvas2.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available in this browser");
    const view = new View();
    view.resize(pxW, pxH);
    view.zoom = scale;
    view.pan = { x: -box.min.x * scale, y: box.max.y * scale };
    const renderer = new Renderer(ctx);
    renderer.render({
      view,
      doc,
      showGrid: false,
      gridStep: 1,
      selection: /* @__PURE__ */ new Set(),
      hoverId: null,
      preview: null,
      snapMark: null,
      marquee: null
    });
    return canvas2;
  }
  function toPngBlob(doc, options = {}) {
    const canvas2 = renderToCanvas(doc, options);
    return new Promise((resolve, reject) => {
      canvas2.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG encoding failed"));
      }, "image/png");
    });
  }

  // src/io/pdf.ts
  async function blobToBase64(blob) {
    const buf = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  async function toPdfBlob(doc) {
    const canvas2 = renderToCanvas(doc, { maxSide: 2400 });
    const jpegBlob = await new Promise((resolve, reject) => {
      canvas2.toBlob(
        (b) => b ? resolve(b) : reject(new Error("JPEG encoding failed")),
        "image/jpeg",
        0.92
      );
    });
    const jpegBase64 = await blobToBase64(jpegBlob);
    const imgW = canvas2.width;
    const imgH = canvas2.height;
    const mmToPt = 72 / 25.4;
    const PAPER_SIZES_MM = {
      A4: [210, 297],
      A3: [297, 420],
      A2: [420, 594],
      A1: [594, 841],
      A0: [841, 1189],
      Letter: [215.9, 279.4],
      Legal: [215.9, 355.6],
      Tabloid: [279.4, 431.8]
    };
    let pageW;
    let pageH;
    if (doc.pageSize && PAPER_SIZES_MM[doc.pageSize]) {
      const dims = PAPER_SIZES_MM[doc.pageSize];
      pageW = dims[0] * mmToPt;
      pageH = dims[1] * mmToPt;
    } else {
      const margin = 20;
      const scale = Math.min(1, 600 / Math.max(imgW, imgH));
      pageW = imgW * scale + margin * 2;
      pageH = imgH * scale + margin * 2;
    }
    const parts = [];
    let nextId = 1;
    function addObj(content) {
      const id = nextId++;
      parts.push({ id, content });
      return id;
    }
    const catalogId = addObj("<< /Type /Catalog /Pages 2 0 R >>");
    addObj("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    addObj(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>`
    );
    const contentStream = `q ${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm /Im1 Do Q`;
    addObj(`<< /Length ${contentStream.length} >>
stream
${contentStream}
endstream`);
    addObj(
      `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBase64.length * 3 / 4} >>
stream
${atob(jpegBase64)}
endstream`
    );
    let body = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets = [];
    for (const part of parts) {
      offsets.push(body.length);
      body += `${part.id} 0 obj
${part.content}
endobj
`;
    }
    const xrefStart = body.length;
    body += `xref
0 ${nextId}
0000000000 65535 f 
`;
    for (const off of offsets) {
      body += `${String(off).padStart(10, "0")} 00000 n 
`;
    }
    body += `trailer
<< /Size ${nextId} /Root ${catalogId} 0 R >>
startxref
${xrefStart}
%%EOF`;
    return new Blob([body], { type: "application/pdf" });
  }

  // src/main.ts
  function el(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing #${id} in index.html`);
    return node;
  }
  var canvas = el("view");
  var wrap = el("canvasWrap");
  var pageTabsContainer = el("pageTabs");
  var editor = new Editor(canvas);
  var pageMgr = new PageManager();
  registerTools((id, factory) => editor.registerTool(id, factory));
  for (const info of TOOL_INFO) editor.hotkeys.set(info.key, info.id);
  Object.defineProperty(editor, "doc", {
    get() {
      return pageMgr.activeDoc;
    },
    configurable: true
  });
  var statTool = el("statTool");
  var statSel = el("statSel");
  var statMsg = el("statMsg");
  var coords = el("coords");
  var gridInfo = el("gridInfo");
  var prompt = el("prompt");
  var layerSelect = el("layerSelect");
  var unitSelect = el("unitSelect");
  var pageSizeSelect = el("pageSizeSelect");
  var chkPageBoundary = el("chkPageBoundary");
  var gridStepInput = el("gridStep");
  var fileInput = el("fileInput");
  function buildPalette() {
    const groups = [
      { host: el("toolButtons"), group: "draw" },
      { host: el("modifyButtons"), group: "modify" }
    ];
    for (const { host, group } of groups) {
      host.textContent = "";
      for (const info of TOOL_INFO.filter((t) => t.group === group)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tool";
        button.dataset.tool = info.id;
        button.title = `${info.label} (${info.key}) \u2014 ${editor.toolHint(info.id)}`;
        const name = document.createElement("span");
        name.textContent = info.label;
        const key = document.createElement("span");
        key.className = "key";
        key.textContent = info.key;
        button.append(name, key);
        button.addEventListener("click", () => editor.activateTool(info.id));
        host.appendChild(button);
      }
    }
  }
  function refreshLayerList() {
    const previous = layerSelect.value;
    layerSelect.textContent = "";
    for (const layer of editor.doc.layers) {
      const option = document.createElement("option");
      option.value = layer.id;
      option.textContent = layer.name + (layer.locked ? " (locked)" : layer.visible ? "" : " (hidden)");
      option.style.color = layer.color;
      layerSelect.appendChild(option);
    }
    layerSelect.value = editor.doc.layers.some((l) => l.id === previous) ? previous : editor.doc.currentLayerId;
    layerSelect.value = editor.doc.currentLayerId;
  }
  function refreshToolHighlight() {
    for (const button of document.querySelectorAll(".tool")) {
      button.classList.toggle("active", button.dataset.tool === editor.tool?.id);
    }
    statTool.textContent = editor.tool ? `${editor.tool.label}` : "Ready";
  }
  function refreshHistoryButtons() {
    el("btnUndo").disabled = !editor.history.canUndo;
    el("btnRedo").disabled = !editor.history.canRedo;
  }
  function setToggles() {
    el("chkGrid").checked = editor.settings.grid;
    el("chkSnap").checked = editor.settings.snap;
    el("chkOsnap").checked = editor.settings.osnap;
    el("chkOrtho").checked = editor.settings.ortho;
    gridStepInput.value = String(editor.settings.gridDivisions);
    refreshGridInfo();
  }
  function refreshGridInfo() {
    const v2 = editor.gridStep() / unitLength(editor.doc.units);
    const text = `Grid ${String(Math.round(v2 * 1e3) / 1e3)} ${editor.doc.units}`;
    if (gridInfo.textContent !== text) gridInfo.textContent = text;
  }
  editor.hooks = {
    onStatus: (text) => {
      statMsg.textContent = text;
    },
    onPrompt: (text) => {
      prompt.textContent = text;
    },
    onCursor: (p, mark) => {
      coords.textContent = `${p.x.toFixed(2)}, ${p.y.toFixed(2)}${mark ? `  [${mark}]` : ""}`;
    },
    onSelectionChanged: (count) => {
      statSel.textContent = `${count} selected`;
    },
    onHistoryChanged: () => refreshHistoryButtons(),
    onToolChanged: () => refreshToolHighlight(),
    onRendered: () => refreshGridInfo(),
    onRequestText: (at, done) => openTextEditor(at, done)
  };
  function openTextEditor(at, done) {
    const existing = document.getElementById("textInput");
    if (existing) existing.remove();
    const height = Math.max(editor.gridStep(), 1) * 0.8;
    const screen = editor.toScreen(at);
    const input = document.createElement("input");
    input.id = "textInput";
    input.type = "text";
    input.placeholder = "text";
    input.style.cssText = `position:absolute;left:${wrapLeft(screen).left}px;top:${screen.y - 10}px;font-size:${Math.min(42, Math.max(12, height * editor.view.zoom))}px;background:rgba(255,255,255,.9);border:1px solid #2c7be0;border-radius:3px;padding:1px 4px;min-width:120px;outline:none;color:#20262e;z-index:5;`;
    let settled = false;
    const finish = (commit) => {
      if (settled) return;
      settled = true;
      const value = input.value;
      input.remove();
      editor.setPrompt(commit ? "" : "Text cancelled");
      if (commit) done(value, height);
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    wrap.appendChild(input);
    input.focus();
  }
  function wrapLeft(screen) {
    const max = Math.max(4, editor.view.width - 180);
    return { left: Math.min(Math.max(4, screen.x), max) };
  }
  el("btnNew").addEventListener("click", () => {
    if (editor.doc.count() > 0 && !window.confirm("Discard the current drawing?")) return;
    while (pageMgr.count > 1) pageMgr.removePage(pageMgr.pagesInfo[1].id);
    editor.doc.reset();
    editor.history.clear();
    editor.clearSelection();
    editor.setBase(null);
    editor.setPreview(null);
    refreshLayerList();
    unitSelect.value = editor.doc.units;
    pageSizeSelect.value = editor.doc.pageSize ?? "";
    chkPageBoundary.checked = editor.doc.showPageBoundary;
    renderPageTabs();
    editor.view.zoom = 1;
    editor.view.centerOn({ x: 0, y: 0 });
    editor.setStatus("New drawing");
    editor.requestRender();
    refreshHistoryButtons();
  });
  el("btnOpen").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const json = await loadDocument(file, editor.doc);
      editor.doc.name = json.name ?? file.name;
      editor.history.clear();
      editor.clearSelection();
      unitSelect.value = editor.doc.units;
      pageSizeSelect.value = editor.doc.pageSize ?? "";
      chkPageBoundary.checked = editor.doc.showPageBoundary;
      refreshLayerList();
      editor.fitToExtents();
      editor.setStatus(`Opened ${file.name} (${editor.doc.count()} entities)`);
      refreshHistoryButtons();
    } catch (err) {
      editor.setStatus(`Open failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      fileInput.value = "";
    }
  });
  el("btnSave").addEventListener("click", () => {
    saveDocument(editor.doc);
    editor.setStatus(`Saved ${documentFileName(editor.doc)}`);
  });
  el("btnPng").addEventListener("click", async () => {
    try {
      const blob = await toPngBlob(editor.doc, { maxSide: 2e3 });
      downloadBlob(`${editor.doc.name || "drawing"}.png`, blob);
      editor.setStatus("Exported PNG");
    } catch (err) {
      editor.setStatus(`PNG failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  el("btnSvg").addEventListener("click", () => {
    try {
      const { text } = toSvg(editor.doc);
      downloadText(`${editor.doc.name || "drawing"}.svg`, text, "image/svg+xml");
      editor.setStatus("Exported SVG");
    } catch (err) {
      editor.setStatus(`SVG failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  el("btnPdf").addEventListener("click", async () => {
    try {
      const blob = await toPdfBlob(editor.doc);
      downloadBlob(`${editor.doc.name || "drawing"}.pdf`, blob);
      editor.setStatus("Exported PDF");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("PDF export failed:", err);
      editor.setStatus(`PDF failed: ${msg}`);
    }
  });
  el("btnUndo").addEventListener("click", () => editor.undo());
  el("btnRedo").addEventListener("click", () => editor.redo());
  el("btnDelete").addEventListener("click", () => editor.deleteSelection());
  el("btnZoomIn").addEventListener("click", () => editor.zoomBy(1.4));
  el("btnZoomOut").addEventListener("click", () => editor.zoomBy(1 / 1.4));
  el("btnFit").addEventListener("click", () => editor.fitToExtents());
  layerSelect.addEventListener("change", () => {
    const id = layerSelect.value;
    if (editor.selection.size) {
      editor.commit("Layer change", moveToLayer(editor.doc, editor.selection, id));
    }
    editor.doc.currentLayerId = id;
    editor.setStatus(`Current layer: ${editor.doc.layer(id)?.name ?? id}`);
  });
  el("btnLayerAdd").addEventListener("click", () => {
    const layer = editor.doc.addLayer();
    editor.doc.currentLayerId = layer.id;
    refreshLayerList();
    editor.setStatus(`Added layer ${layer.name}`);
  });
  el("btnLayerDel").addEventListener("click", () => {
    const id = layerSelect.value;
    const layer = editor.doc.layer(id);
    if (!layer) return;
    const count = editor.doc.entitiesOnLayer(id).length;
    const warning = count ? `${count} entity/entities will move to the first layer.` : "";
    if (!window.confirm(`Delete layer "${layer.name}"? ${warning}`)) return;
    if (editor.doc.removeLayer(id)) {
      refreshLayerList();
      editor.setStatus(`Deleted layer ${layer.name}`);
      editor.requestRender();
    } else {
      editor.setStatus("At least one layer must remain");
    }
  });
  pageSizeSelect.addEventListener("change", () => {
    const val = pageSizeSelect.value || null;
    editor.doc.pageSize = val;
    editor.requestRender();
    editor.setStatus(val ? `Page: ${val}` : "Page: unbounded");
  });
  chkPageBoundary.addEventListener("change", () => {
    editor.doc.showPageBoundary = chkPageBoundary.checked;
    editor.requestRender();
  });
  var LINETYPES = ["continuous", "dashed", "dotted", "dashdot", "centre"];
  var LINEWEIGHTS = [0.05, 0.09, 0.1, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 1, 1.4, 2];
  var layerModal = el("layerModal");
  var layerRows = el("layerRows");
  function renderLayerRows() {
    layerRows.textContent = "";
    for (const layer of editor.doc.layers) {
      const row = document.createElement("tr");
      row.appendChild(radioCell(layer));
      row.appendChild(checkCell(layer.visible, (v2) => {
        editor.doc.updateLayer(layer.id, { visible: v2 });
        refreshLayerList();
        editor.requestRender();
      }));
      row.appendChild(checkCell(layer.locked, (v2) => {
        editor.doc.updateLayer(layer.id, { locked: v2 });
        refreshLayerList();
      }));
      row.appendChild(nameCell(layer));
      row.appendChild(colorCell(layer));
      row.appendChild(selectCell(LINETYPES, layer.linetype, (v2) => {
        editor.doc.updateLayer(layer.id, { linetype: v2 });
        editor.requestRender();
      }));
      row.appendChild(selectCell(LINEWEIGHTS.map(String), String(layer.lineweight), (v2) => {
        editor.doc.updateLayer(layer.id, { lineweight: Number(v2) });
        editor.requestRender();
      }));
      row.appendChild(deleteCell(layer));
      layerRows.appendChild(row);
    }
  }
  function cell(body) {
    const td = document.createElement("td");
    td.appendChild(body);
    return td;
  }
  function radioCell(layer) {
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "currentLayer";
    input.checked = editor.doc.currentLayerId === layer.id;
    input.title = `Draw on ${layer.name}`;
    input.addEventListener("change", () => {
      editor.doc.currentLayerId = layer.id;
      refreshLayerList();
      renderLayerRows();
      editor.setStatus(`Current layer: ${layer.name}`);
    });
    return cell(input);
  }
  function checkCell(checked, onChange) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    return cell(input);
  }
  function nameCell(layer) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = layer.name;
    input.addEventListener("change", () => {
      editor.doc.renameLayer(layer.id, input.value.trim() || layer.name);
      refreshLayerList();
      renderLayerRows();
    });
    return cell(input);
  }
  function colorCell(layer) {
    const input = document.createElement("input");
    input.type = "color";
    input.value = layer.color;
    input.addEventListener("input", () => {
      editor.doc.updateLayer(layer.id, { color: input.value });
      editor.requestRender();
    });
    input.addEventListener("change", () => refreshLayerList());
    return cell(input);
  }
  function selectCell(options, value, onChange) {
    const select = document.createElement("select");
    for (const o of options) {
      const option = document.createElement("option");
      option.value = o;
      option.textContent = o;
      select.appendChild(option);
    }
    select.value = options.includes(value) ? value : options[0];
    select.addEventListener("change", () => onChange(select.value));
    return cell(select);
  }
  function deleteCell(layer) {
    const button = document.createElement("button");
    button.className = "row-del";
    button.title = `Delete ${layer.name}`;
    button.textContent = "\xD7";
    button.addEventListener("click", () => {
      const count = editor.doc.entitiesOnLayer(layer.id).length;
      const warning = count ? ` ${count} entities will move to the first layer.` : "";
      if (!window.confirm(`Delete layer "${layer.name}"?${warning}`)) return;
      editor.doc.removeLayer(layer.id);
      refreshLayerList();
      renderLayerRows();
      editor.requestRender();
      editor.setStatus(`Deleted layer ${layer.name}`);
    });
    return cell(button);
  }
  el("btnLayerManager").addEventListener("click", () => {
    renderLayerRows();
    layerModal.hidden = false;
  });
  el("btnLayerNew").addEventListener("click", () => {
    const layer = editor.doc.addLayer();
    editor.doc.currentLayerId = layer.id;
    refreshLayerList();
    renderLayerRows();
    editor.setStatus(`Added layer ${layer.name}`);
  });
  el("btnLayerClose").addEventListener("click", () => {
    layerModal.hidden = true;
    canvas.focus();
  });
  layerModal.addEventListener("pointerdown", (e) => {
    if (e.target === layerModal) layerModal.hidden = true;
  });
  unitSelect.addEventListener("change", () => {
    editor.doc.units = unitSelect.value;
    editor.setStatus(`Units: ${editor.doc.units}`);
    refreshGridInfo();
    editor.requestRender();
  });
  for (const [id, key] of [
    ["chkGrid", "grid"],
    ["chkSnap", "snap"],
    ["chkOsnap", "osnap"],
    ["chkOrtho", "ortho"]
  ]) {
    el(id).addEventListener("change", (e) => {
      editor.settings[key] = e.target.checked;
      editor.setStatus(`${key}: ${editor.settings[key] ? "on" : "off"}`);
      editor.requestRender();
    });
  }
  gridStepInput.addEventListener("change", () => {
    const value = Math.round(Number(gridStepInput.value));
    if (!(value >= 1)) {
      gridStepInput.value = String(editor.settings.gridDivisions);
      editor.setStatus("Grid must be at least one unit");
      return;
    }
    editor.settings.gridDivisions = value;
    refreshGridInfo();
    editor.requestRender();
  });
  window.addEventListener("keydown", (e) => {
    if (!layerModal.hidden) {
      if (e.key === "Escape") layerModal.hidden = true;
      return;
    }
    const target = e.target;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    editor.handleKey(e);
  });
  function syncSize() {
    const rect = wrap.getBoundingClientRect();
    editor.resize(rect.width, rect.height, window.devicePixelRatio || 1);
  }
  new ResizeObserver(syncSize).observe(wrap);
  function renderPageTabs() {
    pageTabsContainer.textContent = "";
    for (const info of pageMgr.pagesInfo) {
      const tab = document.createElement("button");
      tab.className = "page-tab" + (info.id === pageMgr.activeId ? " active" : "");
      tab.title = info.name;
      const label = document.createElement("span");
      label.textContent = info.name;
      label.addEventListener("click", () => {
        pageMgr.setActive(info.id);
        onSwitchPage();
      });
      tab.appendChild(label);
      if (pageMgr.count > 1) {
        const close = document.createElement("span");
        close.className = "tab-close";
        close.textContent = "\xD7";
        close.title = `Close ${info.name}`;
        close.addEventListener("click", (e) => {
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
    const addBtn = document.createElement("button");
    addBtn.id = "btnAddPage";
    addBtn.textContent = "+";
    addBtn.title = "Add page";
    addBtn.addEventListener("click", () => {
      pageMgr.addPage();
      renderPageTabs();
      onSwitchPage();
    });
    pageTabsContainer.appendChild(addBtn);
  }
  function onSwitchPage() {
    editor.history.clear();
    editor.clearSelection();
    editor.setBase(null);
    editor.setPreview(null);
    refreshLayerList();
    unitSelect.value = editor.doc.units;
    pageSizeSelect.value = editor.doc.pageSize ?? "";
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
  syncSize();
  editor.view.zoom = 4;
  editor.view.centerOn({ x: 0, y: 0 });
  editor.activateTool("select");
  editor.setStatus("OpenDraft ready \u2014 press a tool key or pick one from the palette");
  editor.requestRender();
})();
//# sourceMappingURL=bundle.js.map
