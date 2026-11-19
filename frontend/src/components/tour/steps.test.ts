import { describe, expect, it } from 'vitest'
import type { Me } from '../../api/auth'
import { STEPS, roleOf } from './steps'

const me = (o: Partial<Me>): Me => ({ id: 'u', email: 'a@b.c', displayName: 'A', status: 'ACTIVE', platformRole: 'USER', specialty: null, licenseCountry: null, verificationStatus: null, bio: null, rejectionReason: null, ...o })

describe('tour', () => {
  it('picks the role from the account', () => {
    expect(roleOf(null)).toBe('worker')
    expect(roleOf(me({}))).toBe('worker')
    expect(roleOf(me({ verificationStatus: 'APPROVED' }))).toBe('doctor')
    expect(roleOf(me({ platformRole: 'ADMIN', verificationStatus: 'APPROVED' }))).toBe('admin')
  })
  it('every role has a welcome card and an ending, and each target is a selector', () => {
    for (const steps of Object.values(STEPS)) {
      expect(steps[0].target).toBeUndefined()
      expect(steps.length).toBeGreaterThan(3)
      steps.forEach((s) => { expect(s.title).not.toBe(''); if (s.target) expect(() => document.createDocumentFragment().querySelector(s.target!)).not.toThrow() })
    }
  })
})
