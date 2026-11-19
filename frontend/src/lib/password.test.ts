import { describe, expect, it } from 'vitest'
import { emailLooksValid, passwordChecks, passwordStrength, passwordValid } from './password'

describe('password rules', () => {
  it('matches the server rule', () => {
    expect(passwordValid('short1A')).toBe(false)
    expect(passwordValid('alllowercase123')).toBe(false)
    expect(passwordValid('ALLUPPERCASE123')).toBe(false)
    expect(passwordValid('NoDigitsHereAtAll')).toBe(false)
    expect(passwordValid('Str0ngPassw0rd')).toBe(true)
    expect(passwordValid('A1' + 'a'.repeat(80))).toBe(false)   // over 72
  })

  it('lists each rule with its state', () => {
    const c = passwordChecks('abcdefghij')
    expect(c.find((x) => x.id === 'length')?.ok).toBe(true)
    expect(c.find((x) => x.id === 'upper')?.ok).toBe(false)
    expect(c.find((x) => x.id === 'digit')?.ok).toBe(false)
  })

  it('gives a simple strength guide', () => {
    expect(passwordStrength('').score).toBe(0)
    expect(passwordStrength('abc').score).toBeLessThanOrEqual(2)
    expect(passwordStrength('Str0ngPass1').score).toBe(3)      // 11 characters: valid but not long
    expect(passwordStrength('Str0ng-Passw0rd-Long!').score).toBe(4)
    expect(passwordStrength('Str0ngPassw0rd').score).toBe(4)    // 14 characters counts as long
  })

  it('checks email shape', () => {
    expect(emailLooksValid('a@b.co')).toBe(true)
    expect(emailLooksValid(' kavitha@medcord.dev ')).toBe(true)
    expect(emailLooksValid('nope')).toBe(false)
    expect(emailLooksValid('a@b')).toBe(false)
  })
})
