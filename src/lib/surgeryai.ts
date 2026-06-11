// All AI calls for surgery go through Netlify functions — never direct from browser

export interface SurgicalFlag {
  category: string
  severity: 'critical' | 'warning' | 'info'
  finding: string
  action: string
}

export interface OperativeNoteDraft {
  preOpDiagnosis: string
  postOpDiagnosis: string
  procedure: string
  surgeon: string
  anesthesia: string
  findings: string
  description: string
  complications: string
  drains: string
  specimens: string
  closingCounts: string
}

export async function getSurgicalFlags(patientData: Record<string, unknown>): Promise<SurgicalFlag[]> {
  try {
    const res = await fetch('/.netlify/functions/ai-surgical-flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientData }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.flags ?? []
  } catch {
    return []
  }
}

export async function generateOperativeNote(input: {
  procedure: string
  approach: string
  findings: string
  complications: string
  implants?: string
  specimens?: string
}): Promise<OperativeNoteDraft | null> {
  try {
    const res = await fetch('/.netlify/functions/ai-operative-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
