import { describe, expect, it } from 'vitest'
import { scanPhi } from './phiDetector'

describe('scanPhi', () => {
  it('detects and redacts common clinical PHI without flagging doctors', () => {
    const input = 'Dr. Priya Raman evaluated Patient: John Doe, MRN 482910, DOB 04/12/1978, phone 555-234-5678, Bed 4B.'
    const res = scanPhi(input)

    expect(res.hasPhi).toBe(true)
    expect(res.categories).toEqual(expect.arrayContaining(['PATIENT_NAME', 'MRN_ID', 'DOB', 'PHONE', 'BED_ROOM']))
    expect(res.redactedText).toContain('Dr. Priya Raman')
    expect(res.redactedText).not.toContain('John Doe')
    expect(res.redactedText).not.toContain('482910')
    expect(res.redactedText).not.toContain('04/12/1978')
    expect(res.redactedText).not.toContain('555-234-5678')
    expect(res.redactedText).not.toContain('Bed 4B')
  })

  it('passes clean de-identified clinical notes untouched', () => {
    const clean = '62M presenting with acute chest pain, ST-elevation V2-V4, troponin 1.4 ng/mL.'
    const res = scanPhi(clean)

    expect(res.hasPhi).toBe(false)
    expect(res.findings).toHaveLength(0)
    expect(res.redactedText).toBe(clean)
  })

  it('flags and redacts custom community restricted terms', () => {
    const res = scanPhi('Transferred from Mercy Ward 7 for cath lab', ['Mercy Ward 7'])

    expect(res.hasPhi).toBe(true)
    expect(res.categories).toEqual(['RESTRICTED_TERM'])
    expect(res.redactedText).toContain('[REDACTED]')
    expect(res.redactedText).not.toContain('Mercy Ward 7')
  })
})
