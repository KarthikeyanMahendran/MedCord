/** Mirrors the server rule: 10-72 characters with a lower-case letter, an upper-case letter and a digit. */
export interface PasswordCheck { id: 'length' | 'lower' | 'upper' | 'digit'; label: string; ok: boolean }

export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { id: 'length', label: 'At least 10 characters', ok: pw.length >= 10 && pw.length <= 72 },
    { id: 'lower', label: 'A lower-case letter', ok: /[a-z]/.test(pw) },
    { id: 'upper', label: 'An upper-case letter', ok: /[A-Z]/.test(pw) },
    { id: 'digit', label: 'A number', ok: /\d/.test(pw) },
  ]
}

export const passwordValid = (pw: string) => passwordChecks(pw).every((c) => c.ok)

/** 0 (empty) to 4 (strong). Only a guide: the checks above are the real rule. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: '' }
  const met = passwordChecks(pw).filter((c) => c.ok).length
  let score = met
  if (met === 4 && (pw.length >= 14 || /[^A-Za-z0-9]/.test(pw))) score = 4
  else if (met === 4) score = 3
  else score = Math.min(met, 2)
  const label = ['', 'Too weak', 'Weak', 'Good', 'Strong'][score]
  return { score: score as 0 | 1 | 2 | 3 | 4, label }
}

export const emailLooksValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim())
