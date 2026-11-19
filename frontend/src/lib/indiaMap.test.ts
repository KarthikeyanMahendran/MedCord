import { describe, expect, it } from 'vitest'
import { dotGrid, inside, makeProjection } from './indiaMap'

describe('india map', () => {
  it('knows land from sea', () => {
    expect(inside(76.1, 11.7)).toBe(true)   // Wayanad
    expect(inside(77.2, 28.6)).toBe(true)   // Delhi
    expect(inside(75, 5)).toBe(false)       // south of the tip
    expect(inside(86, 12)).toBe(false)      // Bay of Bengal
    expect(inside(70, 15)).toBe(false)      // Arabian Sea
  })

  it('projects north above south and west left of east, inside the box', () => {
    const p = makeProjection(600, 640, 14)
    const delhi = p.project(77.2, 28.6), wayanad = p.project(76.1, 11.7), assam = p.project(94.6, 27.5)
    expect(delhi.y).toBeLessThan(wayanad.y)
    expect(assam.x).toBeGreaterThan(delhi.x)
    for (const pt of [delhi, wayanad, assam]) {
      expect(pt.x).toBeGreaterThanOrEqual(0); expect(pt.x).toBeLessThanOrEqual(600)
      expect(pt.y).toBeGreaterThanOrEqual(0); expect(pt.y).toBeLessThanOrEqual(640)
    }
  })

  it('fills the outline with dots, all within the box', () => {
    const p = makeProjection(600, 640, 14)
    const dots = dotGrid(p, 600, 640, 8)
    expect(dots.length).toBeGreaterThan(500)
    expect(dots.every((d) => d.x >= 0 && d.x <= 600 && d.y >= 0 && d.y <= 640)).toBe(true)
  })
})
