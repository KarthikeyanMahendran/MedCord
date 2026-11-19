/** Coarse outline of India as [lon, lat]. Only used to draw a dotted map, never for measurement. */
export const OUTLINE: [number, number][] = [
  [74.3, 34.5], [77.8, 35.5], [79, 32], [81, 30.2], [84, 28.5], [88, 27.2], [88.5, 26.6], [92, 27.8], [96, 28.3], [97, 27], [95, 25],
  [93.5, 22], [92.2, 23.5], [91.3, 22.5], [89, 22], [87, 21.5], [85, 19.5], [82, 16.5], [80.3, 15.5], [80.3, 13], [79.8, 10.3], [78.2, 8.1],
  [77.5, 8.1], [76.3, 9.5], [75.3, 12], [74.4, 14.8], [73.5, 17], [72.8, 19.3], [72.8, 21], [70.5, 20.8], [69, 22.3], [70.2, 22.9],
  [68.2, 23.7], [70, 25.5], [71, 27.5], [73.5, 29.5], [74.5, 31.5],
]
export const LON0 = 68, LON1 = 97.5, LAT0 = 8, LAT1 = 35.8
/** Longitude is squeezed by cos(latitude) so the shape does not look stretched. */
export const KX = Math.cos((22 * Math.PI) / 180)

/** Point-in-polygon (ray casting). */
export function inside(lon: number, lat: number): boolean {
  let c = false
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i], [xj, yj] = OUTLINE[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

export interface Projection {
  scale: number
  width: number
  height: number
  project: (lon: number, lat: number) => { x: number; y: number }
}

/** Fit the map into a w x h box, centred, with optional padding. */
export function makeProjection(w: number, h: number, pad = 0): Projection {
  const spanX = (LON1 - LON0) * KX, spanY = LAT1 - LAT0
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY)
  const ox = (w - spanX * scale) / 2, oy = (h - spanY * scale) / 2
  return {
    scale, width: spanX * scale, height: spanY * scale,
    project: (lon, lat) => ({ x: ox + (lon - LON0) * KX * scale, y: oy + (LAT1 - lat) * scale }),
  }
}

/** Dot centres (in the projection's pixel space) that fall inside the outline. */
export function dotGrid(p: Projection, w: number, h: number, step: number): { x: number; y: number }[] {
  const spanX = (LON1 - LON0) * KX, spanY = LAT1 - LAT0
  const ox = (w - spanX * p.scale) / 2, oy = (h - spanY * p.scale) / 2
  const out: { x: number; y: number }[] = []
  for (let y = oy; y < oy + p.height; y += step) {
    for (let x = ox; x < ox + p.width; x += step) {
      if (inside(LON0 + (x - ox) / (KX * p.scale), LAT1 - (y - oy) / p.scale)) out.push({ x, y })
    }
  }
  return out
}
