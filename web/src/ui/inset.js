// SPDX-License-Identifier: MIT
// Orientation window for the 3D site view: a small overhead map of the slice, drawn like the home map with 0°
// (the Earth side) at the top. It shows the shaded topography, the 200 m site grid, the region edge, the chosen site
// and a wedge for where the 3D camera stands and looks, so the 3D view can be related to 0° / Earth.
// Map coordinates are polar stereographic metres (src/polar.js): +y is toward 0°, as on the home map.

const SIZE = 160; // CSS px; drawn at device resolution
const SUN = "#f2b84b";

export class OrientationInset {
  /** @param {HTMLElement} root  an element holding a <canvas class="inset-map"> and a <canvas class="inset-view"> */
  constructor(root) {
    this.root = root;
    this.base = root.querySelector(".inset-map");
    this.over = root.querySelector(".inset-view");
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.base, this.over]) { c.width = c.height = SIZE * this.dpr; c.style.width = c.style.height = `${SIZE}px`; }
    this.patch = null;
  }

  /** Map metres -> canvas px for the current slice. */
  px(x, y) {
    const { center, sizeM } = this.patch, k = (SIZE * this.dpr) / sizeM;
    return [(x - (center.x - sizeM / 2)) * k, ((center.y + sizeM / 2) - y) * k];
  }

  /**
   * Draw the slice: hillshade (light from the upper left, like the 2D maps) cut to the region outline, the site grid
   * (200 m cells, or 1 km lines when cells would be under 4 px), the region edge and the chosen site.
   * @param {{sample:(x:number,y:number)=>number, center:{x:number,y:number}, sizeM:number, grid:object, outline?:number[][]}} p
   */
  setPatch(p) {
    this.patch = p;
    const { sample, center, sizeM, grid, outline } = p, W = SIZE * this.dpr, g = this.base.getContext("2d");
    const N = 128, step = sizeM / N, img = g.createImageData(N, N);
    const lx = -Math.SQRT1_2 * Math.cos(0.61), ly = Math.SQRT1_2 * Math.cos(0.61), lz = Math.sin(0.61); // az 315°, 35° high
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = center.x - sizeM / 2 + (i + 0.5) * step, y = center.y + sizeM / 2 - (j + 0.5) * step;
      const gx = (sample(x + step, y) - sample(x - step, y)) / (2 * step), gy = (sample(x, y + step) - sample(x, y - step)) / (2 * step);
      const n = Math.hypot(gx, gy, 1), shade = Math.max(0, (-gx * lx - gy * ly + lz) / n);
      const v = Math.round(40 + 190 * shade), o = (j * N + i) * 4;
      img.data.set([v, v * 0.98, v * 0.94, 255], o);
    }
    const tmp = Object.assign(document.createElement("canvas"), { width: N, height: N });
    tmp.getContext("2d").putImageData(img, 0, 0);
    g.clearRect(0, 0, W, W);
    g.save();
    if (outline && outline.length > 2) { g.beginPath(); outline.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](...this.px(x, y))); g.closePath(); g.clip(); }
    g.imageSmoothingEnabled = true;
    g.drawImage(tmp, 0, 0, W, W);
    // site grid
    const cellPx = (200 / sizeM) * W, every = cellPx >= 4 ? 200 : 1000, e = grid.extent;
    g.strokeStyle = "rgba(15,16,20,.45)"; g.lineWidth = this.dpr * 0.6;
    g.beginPath();
    for (let x = Math.ceil(e.xmin / every) * every; x <= e.xmax; x += every) { const [a, b] = this.px(x, e.ymax), [, d] = this.px(x, e.ymin); g.moveTo(a, b); g.lineTo(a, d); }
    for (let y = Math.ceil(e.ymin / every) * every; y <= e.ymax; y += every) { const [a, b] = this.px(e.xmin, y), [c] = this.px(e.xmax, y); g.moveTo(a, b); g.lineTo(c, b); }
    g.stroke();
    g.restore();
    if (outline && outline.length > 2) {
      g.strokeStyle = SUN; g.lineWidth = this.dpr * 1.2;
      g.beginPath(); outline.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](...this.px(x, y))); g.closePath(); g.stroke();
    }
    // chosen site
    const [sx, sy] = this.px(center.x, center.y), s = Math.max(3 * this.dpr, (200 / sizeM) * W);
    g.strokeStyle = "#fff"; g.lineWidth = this.dpr * 1.5;
    g.strokeRect(sx - s / 2, sy - s / 2, s, s);
  }

  /**
   * Draw where the 3D camera stands and looks: `cam` and `target` are three.js positions relative to the slice
   * centre (x = map x, z = −map y). `fov` is the camera's horizontal field of view in degrees.
   */
  setView(cam, target, fov) {
    const g = this.over.getContext("2d"), W = SIZE * this.dpr;
    g.clearRect(0, 0, W, W);
    if (!this.patch) return;
    const { center } = this.patch;
    const [cx, cy] = this.px(center.x + cam.x, center.y - cam.z), [tx, ty] = this.px(center.x + target.x, center.y - target.z);
    const ang = Math.atan2(ty - cy, tx - cx), half = ((fov / 2) * Math.PI) / 180, R = W * 1.5;
    g.fillStyle = "rgba(255,255,255,.16)"; g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = this.dpr;
    g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + R * Math.cos(ang - half), cy + R * Math.sin(ang - half));
    g.lineTo(cx + R * Math.cos(ang + half), cy + R * Math.sin(ang + half));
    g.closePath(); g.fill(); g.stroke();
    // camera position, pulled inside the frame if it stands beyond the slice
    const m = 6 * this.dpr, px = Math.min(W - m, Math.max(m, cx)), py = Math.min(W - m, Math.max(m, cy));
    g.fillStyle = "#fff"; g.beginPath(); g.arc(px, py, 3.5 * this.dpr, 0, 2 * Math.PI); g.fill();
  }
}
