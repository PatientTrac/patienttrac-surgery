export type SharedProposalSourceApp = 'or' | 'revela' | 'surgery'

interface SharedProposalUrlInput {
  sourceApp: SharedProposalSourceApp
  patientId?: string | number | null
  encounterId?: string | number | null
  returnTo?: string
}

export function buildSharedProposalUrl(input: SharedProposalUrlInput): string {
  const base = (import.meta as any).env?.VITE_PATIENTTRAC_OR_URL || 'https://patienttracor.com'
  const url = new URL('/admin', base)
  url.searchParams.set('tab', 'proposals')
  url.searchParams.set('source_app', input.sourceApp)

  if (input.patientId !== undefined && input.patientId !== null && input.patientId !== '') {
    url.searchParams.set('patient_id', String(input.patientId))
  }

  if (input.encounterId !== undefined && input.encounterId !== null && input.encounterId !== '') {
    url.searchParams.set('encounter_id', String(input.encounterId))
  }

  if (input.returnTo) {
    url.searchParams.set('return_to', input.returnTo)
  }

  return url.toString()
}
