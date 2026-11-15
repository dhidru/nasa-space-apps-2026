// SPDX-License-Identifier: MIT
// Sun and Earth directions in the Moon's body-fixed frame. Inside the years covered by the team's SPICE
// positions (site-data/ephemeris, MOON_ME, LT+S) those are used; elsewhere Astronomy Engine (MIT).
// Illumination and phase always come from Astronomy Engine.
import * as Astronomy from "astronomy-engine";

export const D = Math.PI / 180;

const rz = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]]; };
const rx = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]]; };
export const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// J2000 equatorial (EQJ) -> Moon body-fixed, IAU convention: Rz(W) · Rx(90° − δ) · Rz(90° + α)
const toBody = (v, ax) => rz(rx(rz(v, (90 + ax.ra * 15) * D), (90 - ax.dec) * D), ax.spin * D);

let team = null;
/** Use the team's positions (src/teamdata.js loadPositions) wherever they cover the date. */
export function useTeamPositions(p) { team = p; }

/**
 * Unit vectors from the Moon's centre toward the Sun and Earth, in Moon-fixed axes (x: 0°E, z: north pole).
 * With team positions, also the raw vectors in km (sunKm, earthKm) for directions seen from a site.
 */
export function ephemeris(date) {
  const t = Astronomy.MakeTime(date);
  const tp = team && team.at(date);
  if (tp) {
    return {
      sun: norm(tp.sunKm), earth: norm(tp.earthKm), sunKm: tp.sunKm, earthKm: tp.earthKm, source: "team",
      illum: Astronomy.Illumination(Astronomy.Body.Moon, t).phase_fraction,
      phaseAngle: Astronomy.MoonPhase(t),
    };
  }
  const s = Astronomy.GeoVector(Astronomy.Body.Sun, t, true);
  const m = Astronomy.GeoMoon(t);
  const ax = Astronomy.RotationAxis(Astronomy.Body.Moon, t);
  return {
    sun: norm(toBody([s.x - m.x, s.y - m.y, s.z - m.z], ax)),
    earth: norm(toBody([-m.x, -m.y, -m.z], ax)),
    illum: Astronomy.Illumination(Astronomy.Body.Moon, t).phase_fraction,
    phaseAngle: Astronomy.MoonPhase(t),
    source: "astronomy-engine",
  };
}

/**
 * Sun and Earth unit vectors as seen from a site at height hM above the 1,737.4 km sphere (contract §6.2:
 * body − site position). Without km vectors, falls back to the Moon-centred directions.
 */
export function fromSite(eph, latDeg, lonDeg, hM = 0) {
  if (!eph.sunKm) return { sun: eph.sun, earth: eph.earth };
  const r = 1737.4 + hM / 1000, u = enu(latDeg, lonDeg).up, p = [u[0] * r, u[1] * r, u[2] * r];
  const sub = (b) => norm([b[0] - p[0], b[1] - p[1], b[2] - p[2]]);
  return { sun: sub(eph.sunKm), earth: sub(eph.earthKm) };
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
