// SPDX-License-Identifier: MIT
// Sun and Earth directions in the Moon's body-fixed frame, from Astronomy Engine (MIT).
import * as Astronomy from "astronomy-engine";

export const D = Math.PI / 180;

const rz = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]]; };
const rx = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]]; };
export const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// J2000 equatorial (EQJ) -> Moon body-fixed, IAU convention: Rz(W) · Rx(90° − δ) · Rz(90° + α)
const toBody = (v, ax) => rz(rx(rz(v, (90 + ax.ra * 15) * D), (90 - ax.dec) * D), ax.spin * D);

/** Unit vectors from the Moon's centre toward the Sun and Earth, in Moon-fixed axes (x: 0°E, z: north pole). */
export function ephemeris(date) {
  const t = Astronomy.MakeTime(date);
  const s = Astronomy.GeoVector(Astronomy.Body.Sun, t, true);
  const m = Astronomy.GeoMoon(t);
  const ax = Astronomy.RotationAxis(Astronomy.Body.Moon, t);
  return {
    sun: norm(toBody([s.x - m.x, s.y - m.y, s.z - m.z], ax)),
    earth: norm(toBody([-m.x, -m.y, -m.z], ax)),
    illum: Astronomy.Illumination(Astronomy.Body.Moon, t).phase_fraction,
    phaseAngle: Astronomy.MoonPhase(t),
  };
}

export const latlon = (v) => [Math.asin(v[2]) / D, Math.atan2(v[1], v[0]) / D];

export function enu(latDeg, lonDeg) {
  const a = latDeg * D, b = lonDeg * D, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  return { up: [ca * cb, ca * sb, sa], east: [-sb, cb, 0], north: [-sa * cb, -sa * sb, ca] };
}

/** Elevation and azimuth (degrees, azimuth clockwise from north) of a direction seen from a site. */
export function horizontal(v, frame) {
  const el = Math.asin(Math.max(-1, Math.min(1, dot(v, frame.up)))) / D;
  let az = Math.atan2(dot(v, frame.east), dot(v, frame.north)) / D;
  if (az < 0) az += 360;
  return { el, az };
}

export function phaseName(angle) {
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  return names[Math.round(angle / 45) % 8];
}
