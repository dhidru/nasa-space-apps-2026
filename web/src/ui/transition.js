// SPDX-License-Identifier: MIT
// Shared pieces of the map -> 3D hand-off (src/ui/mapview.js flyTo, src/ui/patchview.js playIntro).

/** The user asked the system for less motion: skip the animations and jump to their last frame. */
export const prefersReducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/** Cubic ease-in-out on 0..1. */
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Cubic ease-out on 0..1. */
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
/** Clamp (t - start) / span to 0..1: the progress of a phase that runs from start to start + span. */
export const phase = (t, start, span) => Math.min(1, Math.max(0, (t - start) / span));

/** Margin around the slice square in both the map's last frame and the 3D view's first (overhead) frame. */
export const SLICE_FIT_MARGIN = 1.04;
/** 3D scene background; the same colour as --scene-bg in style.css, so the map can fade into it. */
export const SCENE_BG = 0x050608;
