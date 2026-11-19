export interface PhiFinding {
  category: string
  label: string
  start: number
  end: number
  replacement: string
}

export interface PhiScanResult {
  hasPhi: boolean
  findings: PhiFinding[]
  categories: string[]
  redactedText: string
}

export const PHI_CATEGORY_LABELS: Record<string, string> = {
  MRN_ID: 'MRN / Patient ID',
  NATIONAL_ID: 'SSN / National ID',
  DOB: 'Date of Birth',
  EMAIL: 'Email',
  PHONE: 'Phone',
  PATIENT_NAME: 'Patient Name',
  BED_ROOM: 'Bed / Room',
  RESTRICTED_TERM: 'Restricted Term',
}

interface Rule {
  category: string
  label: string
  regex: RegExp
  replacement: string
}

const RULES: Rule[] = [
  {
    category: 'MRN_ID',
    label: 'Medical Record / Patient ID',
    regex: /\b(?:MRN|UHID|Medical\s+Record(?:\s+No\.?|\s*#)?|Patient\s+ID|Chart\s*#?)\s*[:#-]?[ \t]*[A-Z0-9-]{4,16}\b/gi,
    replacement: '[MRN REDACTED]',
  },
  {
    category: 'NATIONAL_ID',
    label: 'SSN / National ID',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[ID REDACTED]',
  },
  {
    category: 'NATIONAL_ID',
    label: 'Aadhaar / National ID',
    regex: /\b[2-9]\d{3}[\s-]\d{4}[\s-]\d{4}\b/g,
    replacement: '[ID REDACTED]',
  },
  {
    category: 'DOB',
    label: 'Date of Birth',
    regex: /\b(?:DOB|Date\s+of\s+Birth|D\.O\.B\.?)\s*[:-]?\s*(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi,
    replacement: '[DOB REDACTED]',
  },
  {
    category: 'EMAIL',
    label: 'Email address',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[EMAIL REDACTED]',
  },
  {
    category: 'PHONE',
    label: 'Phone number',
    regex: /(?:\+\d{1,3}[\s.-]?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b|\b(?:phone|ph|tel|mob|mobile|cell)\s*[:#-]?\s*\+?\d[\d\s().-]{7,15}\d\b)/gi,
    replacement: '[PHONE REDACTED]',
  },
  {
    category: 'PATIENT_NAME',
    label: 'Patient name',
    regex: /\b(?:Patient|Pt\.?)\s*[:-]\s*[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,2}\b/g,
    replacement: 'Patient: [NAME REDACTED]',
  },
  {
    category: 'PATIENT_NAME',
    label: 'Patient name',
    regex: /\b(?:Mr|Mrs|Ms|Miss)\.\s+[A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}\b/g,
    replacement: '[PATIENT NAME REDACTED]',
  },
  {
    category: 'BED_ROOM',
    label: 'Bed / Room number',
    regex: /\b(?:Bed|Room|Rm\.?)\s*#?\s*\d{1,4}[A-Z]?(?:\s*,?\s*Ward\s+[A-Z0-9-]+)?\b/gi,
    replacement: '[ROOM/BED REDACTED]',
  },
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Instant client-side PHI & restricted-term scanner mirroring backend PhiDetector.java.
 * Never flags clinician honorifics like "Dr. Priya Raman".
 */
export function scanPhi(text: string, blockedTerms: string[] = []): PhiScanResult {
  if (!text || !text.trim()) {
    return { hasPhi: false, findings: [], categories: [], redactedText: text }
  }

  const raw: PhiFinding[] = []
  for (const r of RULES) {
    const re = new RegExp(r.regex.source, r.regex.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      raw.push({
        category: r.category,
        label: r.label,
        start: m.index,
        end: m.index + m[0].length,
        replacement: r.replacement,
      })
    }
  }

  for (const term of blockedTerms) {
    const clean = term.trim()
    if (!clean) continue
    const re = new RegExp(`(?<!\\w)${escapeRegex(clean)}(?!\\w)`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      raw.push({
        category: 'RESTRICTED_TERM',
        label: 'Restricted term',
        start: m.index,
        end: m.index + m[0].length,
        replacement: '[REDACTED]',
      })
    }
  }

  if (raw.length === 0) {
    return { hasPhi: false, findings: [], categories: [], redactedText: text }
  }

  raw.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
  const merged: PhiFinding[] = []
  let cursor = -1
  for (const f of raw) {
    if (f.start >= cursor) {
      merged.push(f)
      cursor = f.end
    }
  }

  let redactedText = ''
  let pos = 0
  const catSet = new Set<string>()
  for (const f of merged) {
    redactedText += text.slice(pos, f.start) + f.replacement
    pos = f.end
    catSet.add(f.category)
  }
  redactedText += text.slice(pos)

  return {
    hasPhi: true,
    findings: merged,
    categories: [...catSet],
    redactedText,
  }
}
