// SPDX-License-Identifier: MIT
// Lightweight 3D view of one slice of a region's 200 m site grid, drawn with three.js (MIT).
// The slice is a square of terrain centred on the selected site; heights come from any regular grid
// (the 80 m LOLA region DEM in the app, or the team's 200 m site heights in the preview).
// Map coordinates are south polar stereographic metres (src/polar.js). three.js axes: X = map x,
// Z = -map y, Y = up.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { prefersReducedMotion, easeInOutCubic, easeOutCubic, phase, SLICE_FIT_MARGIN, SCENE_BG } from "./transition.js";

const AMBER = 0xf2b84b;

/** Catmull-Rom (bicubic) sampler over a regular grid. x0/y0 is the centre of the top-left sample; rows run toward -y. */
export function gridSampler({ x0, y0, px, w, h, H }) {
  const at = (r, c) => H[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))];
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  return (x, y) => {
    const fc = (x - x0) / px, fr = (y0 - y) / px;
    const c = Math.floor(fc), r = Math.floor(fr), tc = fc - c, tr = fr - r;
    const row = (rr) => cr(at(rr, c - 1), at(rr, c), at(rr, c + 1), at(rr, c + 2), tc);
    return cr(row(r - 1), row(r), row(r + 1), row(r + 2), tr);
  };
}

/** Sun direction in three.js axes from azimuth (deg clockwise from north) and elevation at map longitude lonDeg. */
export function sunVector(azDeg, elDeg, lonDeg) {
  const a = (azDeg * Math.PI) / 180, e = (elDeg * Math.PI) / 180, l = (lonDeg * Math.PI) / 180;
  const n = [Math.sin(l), Math.cos(l)], ea = [Math.cos(l), -Math.sin(l)]; // local north / east on the map
  const dx = Math.cos(e) * (Math.sin(a) * ea[0] + Math.cos(a) * n[0]);
  const dy = Math.cos(e) * (Math.sin(a) * ea[1] + Math.cos(a) * n[1]);
  return new THREE.Vector3(dx, Math.sin(e), -dy).normalize();
}

export class PatchView {
  /** `inset` (optional): an OrientationInset (src/ui/inset.js), kept in step with the slice and the camera. */
  constructor(container, { onHover, onPick, inset } = {}) {
    this.container = container;
    this.onHover = onHover;
    this.onPick = onPick;
    this.inset = inset;
    this.exag = 1;
    this.mode = "sun"; // sun | relief | slope | texture
    this.sun = { dir: new THREE.Vector3(0.5, 0.6, 0.3).normalize(), vis: 1 };

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    r.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_BG);
    this.camera = new THREE.PerspectiveCamera(40, 1, 10, 200000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = (86 * Math.PI) / 180;
    // The view angle is locked to the one the slice opens with: drag pans, scroll zooms, nothing rotates.
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener("change", () => (this.dirty = true));

    this.ambient = new THREE.HemisphereLight(0xcfd6ff, 0x1a1712, 0.1);
    this.light = new THREE.DirectionalLight(0xfff4e2, 2.6);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(4096, 4096);
    this.light.shadow.radius = 3;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 6;
    this.scene.add(this.ambient, this.light, this.light.target);

    this.overlay = new THREE.Group();
    this.scene.add(this.overlay);
    this.hoverLine = null;

    this.ray = new THREE.Raycaster();
    let down = null;
    const el = r.domElement;
    el.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener("pointerup", (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        const cell = this.cellAtEvent(e);
        if (cell && this.onPick) this.onPick(cell);
      }
      down = null;
    });
    el.addEventListener("pointermove", (e) => {
      if (e.buttons) return;
      const cell = this.cellAtEvent(e);
      if ((cell && cell.id) !== (this.hovered && this.hovered.id)) {
        this.hovered = cell;
        this.drawHover(cell);
        if (this.onHover) this.onHover(cell);
      }
    });
    el.addEventListener("pointerleave", () => { this.hovered = null; this.drawHover(null); if (this.onHover) this.onHover(null); });

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.controls.update() || this.dirty) {
        this.dirty = false;
        r.render(this.scene, this.camera);
        if (this.inset && this.p) {
          const hfov = (2 * Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect) * 180) / Math.PI;
          this.inset.setView(this.camera.position, this.controls.target, hfov);
        }
      }
    };
    loop();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  /**
   * @param {object} p
   * @param {(x:number,y:number)=>number} p.sample  height (m) at map x/y
   * @param {{x:number,y:number,id:string}} p.center selected site (map metres)
   * @param {number} p.sizeM   slice width (m)
   * @param {object} p.grid    siteGrid() of the region
   * @param {number[][]} [p.outline] region corners (map metres)
   * @param {{image:CanvasImageSource, extent:number[]}} [p.texture] optional image draped in "texture" mode
   * @param {boolean} [p.keepCamera]
   */
  setPatch(p) {
    this.p = p;
    const { sample, center, sizeM } = p;
    const S = 200, half = sizeM / 2;
    const xs = (i) => center.x - half + (i / S) * sizeM, ys = (j) => center.y + half - (j / S) * sizeM;
    const H = new Float32Array((S + 1) * (S + 1));
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
      const v = sample(xs(i), ys(j));
      H[j * (S + 1) + i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    this.H = H; this.S = S; this.h0 = lo; this.relief = hi - lo;

    const geo = new THREE.PlaneGeometry(sizeM, sizeM, S, S);
    geo.rotateX(-Math.PI / 2); // plane now lies in X/Z; vertex order: rows from -Z (map north... top) to +Z
    this.geo = geo;
    this.applyHeights();

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.map?.dispose();
      this.mesh.material.alphaMap?.dispose();
      this.mesh.material.dispose();
      this.mesh.customDepthMaterial?.dispose();
    }
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }));
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
    this.buildMask();
    this.buildTexture();
    this.inset?.setPatch(p);
    this.drawOverlay();

    const shadowHalf = half * 1.5;
    Object.assign(this.light.shadow.camera, { left: -shadowHalf, right: shadowHalf, top: shadowHalf, bottom: -shadowHalf, near: 1, far: sizeM * 6 });
    this.light.shadow.camera.updateProjectionMatrix();
    this.applyLight();

    this.stopIntro();
    if (!p.keepCamera || !this.framed) {
      const cy = (sample(center.x, center.y) - this.h0) * this.exag;
      this.controls.target.set(0, cy, 0);
      const d = sizeM * 1.15;
      this.camera.position.set(-0.35 * d, cy + 0.55 * d, 0.75 * d);
      this.controls.minDistance = 200;
      this.controls.maxDistance = sizeM * 4;
      this.framed = true;
      if (p.intro) this.playIntro();
    }
    this.dirty = true;
  }

  /**
   * Hand-off from the 2D map: start straight overhead on a flattened slice (the map's last frame, which the map
   * lines up with this canvas), then at once tilt and swing into the default oblique view while the relief rises
   * to the set exaggeration. Any pointer or wheel input on the canvas jumps to the final
   * frame; the controls stay on, so that first drag already pans.
   */
  playIntro() {
    if (prefersReducedMotion()) return;
    this.resize(); // the canvas may have just been shown
    const target = this.controls.target.clone();
    const end = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(target));
    // Overhead distance that fits the whole slice, as the map's last view box does.
    const half = this.p.sizeM / 2, tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    const fitDist = Math.max(half / tanV, half / (tanV * this.camera.aspect)) * SLICE_FIT_MARGIN;
    const top = new THREE.Spherical(fitDist, 0.0001, 0); // theta 0: camera on +Z, so map north is up as on the map
    const dTheta = Math.atan2(Math.sin(end.theta - top.theta), Math.cos(end.theta - top.theta)); // shortest turn
    const ms = 2200, t0 = performance.now(), sph = new THREE.Spherical();
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      // No hold: the relief starts rising and the camera starts tilting at once, under the map's short cross-fade,
      // so the motion carries straight on from the map's zoom.
      const reliefK = easeOutCubic(phase(t, 0, 0.7)), tiltK = easeInOutCubic(t);
      const heightScale = 0.03 + 0.97 * reliefK;
      this.mesh.scale.y = this.overlay.scale.y = heightScale;
      sph.set(top.radius + (end.radius - top.radius) * tiltK, top.phi + (end.phi - top.phi) * tiltK, top.theta + dTheta * tiltK);
      const tgt = target.clone();
      tgt.y *= heightScale;
      this.controls.target.copy(tgt);
      this.camera.position.setFromSpherical(sph).add(tgt);
      this.camera.lookAt(tgt);
      this.dirty = true;
      if (t < 1) this.introRaf = requestAnimationFrame(frame);
      else this.stopIntro();
    };
    this.introEnd = { target, end };
    this.introSkip = () => this.stopIntro();
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.introSkip, { once: true });
    el.addEventListener("wheel", this.introSkip, { once: true, passive: true });
    frame(t0);
  }
  stopIntro() {
    if (!this.introEnd) return;
    cancelAnimationFrame(this.introRaf);
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.introSkip);
    el.removeEventListener("wheel", this.introSkip);
    const { target, end } = this.introEnd;
    this.introEnd = null;
    this.mesh.scale.y = this.overlay.scale.y = 1;
    this.controls.target.copy(target);
    this.camera.position.setFromSpherical(end).add(target);
    this.controls.update();
    this.dirty = true;
  }

  applyHeights() {
    const pos = this.geo.attributes.position, H = this.H;
    for (let k = 0; k < pos.count; k++) pos.setY(k, (H[k] - this.h0) * this.exag);
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }

  setExag(v) {
    if (!this.p) { this.exag = v; return; }
    this.stopIntro();
    const k = v / this.exag;
    this.exag = v;
    this.applyHeights();
    const dy = this.controls.target.y * (k - 1);
    this.controls.target.y += dy;
    this.camera.position.y += dy;
    this.drawOverlay();
    this.drawHover(this.hovered);
    this.dirty = true;
  }

  setMode(m) { this.mode = m; if (this.p) { this.buildTexture(); this.applyLight(); } }

  /** dir: THREE.Vector3 toward the Sun (three.js axes); vis: 0..1 share of the solar disc above the far horizon. */
  setSun(dir, vis = 1) { this.sun = { dir, vis }; this.applyLight(); }

  applyLight() {
    const half = this.p ? this.p.sizeM / 2 : 1000;
    let dir, k, amb;
    if (this.mode === "sun") {
      dir = this.sun.dir.clone();
      const up = Math.max(0, dir.y);
      k = 2.8 * this.sun.vis * Math.min(1, (up + 0.01) / 0.02);
      amb = 0.06;
      if (dir.y < 0.02) dir.y = 0.02; // keep the light usable for the shadow map when the Sun grazes the horizon
    } else {
      // Relief light from the map's upper left, 35 deg high (same as the 2D hillshade); slope/texture keep it soft.
      dir = new THREE.Vector3(-Math.SQRT1_2 * Math.cos(0.61), Math.sin(0.61), -Math.SQRT1_2 * Math.cos(0.61)).normalize();
      k = this.mode === "relief" ? 2.4 : this.mode === "slope" ? 1.6 : 0;
      amb = this.mode === "texture" ? 0 : this.mode === "slope" ? 0.9 : 0.25;
    }
    this.light.intensity = k;
    this.light.castShadow = this.mode === "sun" || this.mode === "relief";
    this.ambient.intensity = amb;
    this.light.position.copy(dir.multiplyScalar(half * 3));
    this.light.target.position.set(0, 0, 0);
    if (this.mesh) {
      const m = this.mesh.material;
      const unlit = this.mode === "texture";
      if (unlit !== (m.type === "MeshBasicMaterial")) {
        const map = m.map;
        this.mesh.material = unlit ? new THREE.MeshBasicMaterial({ map }) : new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
        m.dispose();
      }
    }
    this.dirty = true;
  }

  /**
   * Cut the terrain to the region: an alpha mask (white inside the region outline, black outside, same mapping as
   * the colour texture) with alphaTest, so a slice wider than the region shows nothing past its edge. The shadow
   * pass gets the same mask, or the cut-away ground would still cast shadows.
   */
  buildMask() {
    const { center, sizeM, outline } = this.p, half = sizeM / 2;
    if (!outline || outline.length < 3) return;
    const T = 2048, c = document.createElement("canvas");
    c.width = c.height = T;
    const g = c.getContext("2d");
    const toPx = (x, y) => [((x - (center.x - half)) / sizeM) * T, (((center.y + half) - y) / sizeM) * T];
    g.fillStyle = "#000"; g.fillRect(0, 0, T, T);
    g.fillStyle = "#fff";
    g.beginPath();
    outline.forEach(([x, y], i) => { const [px, py] = toPx(x, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.closePath();
    g.fill();
    const mask = new THREE.CanvasTexture(c);
    const m = this.mesh.material;
    m.alphaMap = mask;
    m.alphaTest = 0.5;
    m.needsUpdate = true;
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: mask, alphaTest: 0.5 });
  }

  /** Base colour texture: grey, slope classes or the supplied image, with the 200 m grid drawn over it. */
  buildTexture() {
    const { center, sizeM, grid, texture } = this.p, half = sizeM / 2;
    const T = 2048, c = document.createElement("canvas");
    c.width = c.height = T;
    const g = c.getContext("2d");
    const toPx = (x, y) => [((x - (center.x - half)) / sizeM) * T, (((center.y + half) - y) / sizeM) * T];
    if (this.mode === "texture" && texture) {
      const [x0, y0, x1, y1] = texture.extent; // left, bottom, right, top
      const [a, b] = toPx(x0, y1), [cc, d] = toPx(x1, y0);
      g.fillStyle = "#222"; g.fillRect(0, 0, T, T);
      g.imageSmoothingQuality = "high";
      g.drawImage(texture.image, a, b, cc - a, d - b);
    } else if (this.mode === "slope") {
      const N = 256, img = g.createImageData(N, N), step = sizeM / N;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = center.x - half + (i + 0.5) * step, y = center.y + half - (j + 0.5) * step, s = 100;
        const gx = (this.p.sample(x + s, y) - this.p.sample(x - s, y)) / (2 * s), gy = (this.p.sample(x, y + s) - this.p.sample(x, y - s)) / (2 * s);
        const deg = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI, o = (j * N + i) * 4;
        const col = deg < 5 ? [70, 170, 110] : deg < 10 ? [215, 200, 80] : [205, 70, 60]; // over NASA's 10° limit: red
        img.data.set([...col, 255], o);
      }
      const tmp = document.createElement("canvas"); tmp.width = tmp.height = N;
      tmp.getContext("2d").putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, T, T);
    } else {
      g.fillStyle = "#a19e97"; g.fillRect(0, 0, T, T);
    }
    // grid lines on 200 m cell edges
    const e = grid.extent;
    g.strokeStyle = this.mode === "texture" ? "rgba(255,255,255,.28)" : "rgba(20,20,24,.35)";
    g.lineWidth = Math.max(1, T / (sizeM / 200) / 60);
    g.beginPath();
    for (let x = Math.max(e.xmin, Math.ceil((center.x - half) / 200) * 200); x <= Math.min(e.xmax, center.x + half); x += 200) {
      const [px, py0] = toPx(x, Math.min(e.ymax, center.y + half)), [, py1] = toPx(x, Math.max(e.ymin, center.y - half));
      g.moveTo(px, py0); g.lineTo(px, py1);
    }
    for (let y = Math.max(e.ymin, Math.ceil((center.y - half) / 200) * 200); y <= Math.min(e.ymax, center.y + half); y += 200) {
      const [px0, py] = toPx(Math.max(e.xmin, center.x - half), y), [px1] = toPx(Math.min(e.xmax, center.x + half), y);
      g.moveTo(px0, py); g.lineTo(px1, py);
    }
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const old = this.mesh.material.map;
    this.mesh.material.map = tex;
    this.mesh.material.needsUpdate = true;
    if (old) old.dispose();
    this.dirty = true;
  }

  /** A polyline draped on the terrain through map points. */
  drape(pts, color, lift = 3) {
    const { center } = this.p;
    const v = pts.map(([x, y]) => new THREE.Vector3(x - center.x, (this.p.sample(x, y) - this.h0) * this.exag + lift * this.exag, -(y - center.y)));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(v), new THREE.LineBasicMaterial({ color, depthTest: true }));
    line.renderOrder = 2;
    return line;
  }
  cellLoop(cell, n = 12, h = 100) {
    const pts = [], cs = [[-h, h], [h, h], [h, -h], [-h, -h]];
    for (let i = 0; i < 4; i++) {
      const [a, b] = cs[i], [c, d] = cs[(i + 1) % 4];
      for (let k = 0; k < n; k++) pts.push([cell.x + a + ((c - a) * k) / n, cell.y + b + ((d - b) * k) / n]);
    }
    pts.push(pts[0]);
    return pts;
  }
  drawOverlay() {
    this.overlay.traverse((o) => { if (o === this.overlay) return; o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
    this.overlay.clear();
    const { center, outline, sizeM } = this.p, half = sizeM / 2;
    this.overlay.add(this.drape(this.cellLoop(center), 0xffffff, 4));
    const circle = Array.from({ length: 65 }, (_, i) => { const a = (i / 64) * 2 * Math.PI; return [center.x + 100 * Math.sin(a), center.y + 100 * Math.cos(a)]; });
    this.overlay.add(this.drape(circle, AMBER, 5));
    if (outline) {
      // region boundary, clipped to the slice
      for (let i = 0; i < outline.length; i++) {
        const [x0, y0] = outline[i], [x1, y1] = outline[(i + 1) % outline.length], pts = [];
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 50);
        for (let k = 0; k <= n; k++) {
          const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
          if (Math.abs(x - center.x) <= half && Math.abs(y - center.y) <= half) pts.push([x, y]);
        }
        if (pts.length > 1) this.overlay.add(this.drape(pts, AMBER, 6));
      }
    }
    // Top 10 sites, as on the region map: the square filled in its coverage colour with a white edge, and a pin
    // with its rank number that is drawn over the terrain, so each one stays visible from any angle.
    const pinH = sizeM * 0.05, tag = sizeM * 0.045;
    for (const [i, m] of (this.marks || []).entries()) {
      const { cell } = m;
      if (Math.abs(cell.x - center.x) > half || Math.abs(cell.y - center.y) > half) continue;
      const color = new THREE.Color(m.color), x = cell.x - center.x, z = -(cell.y - center.y);
      this.overlay.add(this.drapedSquare(cell, color));
      if (cell.id !== center.id) this.overlay.add(this.drape(this.cellLoop(cell), 0xffffff, 4));
      const base = (this.p.sample(cell.x, cell.y) - this.h0) * this.exag;
      const pin = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, base, z), new THREE.Vector3(x, base + pinH, z)]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      pin.renderOrder = 2;
      const label = this.rankTag(m.rank ?? i + 1, m.color);
      label.position.set(x, base + pinH, z);
      label.scale.set(tag, tag, 1);
      this.overlay.add(pin, label);
    }
    this.dirty = true;
  }
  /** A 200 m site square laid on the terrain, filled with `color`. */
  drapedSquare(cell, color) {
    const { center } = this.p, n = 8, geo = new THREE.PlaneGeometry(200, 200, n, n);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const mx = cell.x + pos.getX(k), my = cell.y - pos.getZ(k);
      pos.setXYZ(k, mx - center.x, (this.p.sample(mx, my) - this.h0) * this.exag + 2 * this.exag, -(my - center.y));
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.renderOrder = 1;
    return mesh;
  }
  /** A round tag with a rank number, always facing the camera and drawn over the terrain. */
  rankTag(rank, color) {
    const S = 64, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 3, 0, 2 * Math.PI);
    g.fillStyle = color; g.fill();
    g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke();
    g.fillStyle = "#fff"; g.font = `700 ${rank > 9 ? 26 : 32}px system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(rank), S / 2, S / 2 + 1);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true }));
    sprite.center.set(0.5, 0); // sits on top of its pin
    sprite.renderOrder = 3;
    return sprite;
  }
  /** Highlight sites (e.g. the top 10): [{ cell, color, rank? }]. Redrawn with the slice. */
  setMarks(marks) {
    this.marks = marks;
    if (this.p) this.drawOverlay();
  }
  drawHover(cell) {
    if (this.hoverLine) { this.scene.remove(this.hoverLine); this.hoverLine.geometry.dispose(); this.hoverLine = null; }
    if (cell && this.p && cell.id !== this.p.center.id) { this.hoverLine = this.drape(this.cellLoop(cell), AMBER, 4); this.scene.add(this.hoverLine); }
    this.dirty = true;
  }

  cellAtEvent(e) {
    if (!this.mesh) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObject(this.mesh)[0];
    if (!hit) return null;
    return this.p.grid.cellAt(hit.point.x + this.p.center.x, this.p.center.y - hit.point.z);
  }

  dispose() { cancelAnimationFrame(this.raf); this.renderer.dispose(); }
}
