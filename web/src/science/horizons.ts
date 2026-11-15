/** Horizons: per-site Horizon Elevation over 360° of azimuth (data-contract §6.1). */

export interface HorizonsSidecar {
  dtype: string;
  byte_order: string;
  shape: [number, number];
  scale: number;
  azimuth_start_deg: number;
  azimuth_step_deg: number;
  compression?: string;
  delta_axis?: string;
}

/** Stored values (int16, already un-delta'd); degrees = value × scale. */
export interface Horizons {
  nSites: number;
  nAzimuths: number;
  scale: number;
  values: Int16Array; // [nSites × nAzimuths], row-major
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Unpacks horizons.bin.gz: gunzip (unless a host already did), then a running sum along each row. */
export async function decodeHorizons(bytes: Uint8Array, sidecar: HorizonsSidecar): Promise<Horizons> {
  const [nSites, nAzimuths] = sidecar.shape;
  if (sidecar.dtype !== "int16" || sidecar.byte_order !== "little") throw new Error("Horizons must be little-endian int16");
  if (sidecar.azimuth_start_deg !== 0 || sidecar.azimuth_step_deg * nAzimuths !== 360) {
    throw new Error("Horizon azimuths must cover 0-360° from 0");
  }
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b; // a host may have sent Content-Encoding: gzip
  const raw = sidecar.compression === "gzip" && isGzip ? await gunzip(bytes) : bytes;
  if (raw.byteLength !== nSites * nAzimuths * 2) throw new Error(`Horizons: expected ${nSites}×${nAzimuths} int16 values`);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const values = new Int16Array(nSites * nAzimuths);
  const delta = sidecar.delta_axis === "azimuth";
  for (let s = 0; s < nSites; s++) {
    let acc = 0;
    for (let k = 0; k < nAzimuths; k++) {
      const i = s * nAzimuths + k;
      const v = view.getInt16(i * 2, true);
      acc = delta ? acc + v : v;
      values[i] = acc;
    }
  }
  return { nSites, nAzimuths, scale: sidecar.scale, values };
}

/** One site's Horizon Elevations in degrees, column k at azimuth k × 360 / nAzimuths. */
export function horizonsRow(h: Horizons, site: number): Float64Array {
  const row = new Float64Array(h.nAzimuths);
  for (let k = 0; k < h.nAzimuths; k++) row[k] = h.values[site * h.nAzimuths + k] * h.scale;
  return row;
}
