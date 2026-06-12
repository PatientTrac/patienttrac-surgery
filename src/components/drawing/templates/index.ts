// ================================================================
// Specialty template registry — each specialty pack is a separate
// lazy-loaded chunk so adding packs never grows the main bundle.
// ================================================================

import type { TemplateSet } from './types'

export type { TemplateView, TemplateGroup, TemplateSet } from './types'
export { toDataUri } from './types'

export interface SpecialtyPack {
  label: string
  load: () => Promise<TemplateSet>
}

export const SPECIALTIES: Record<string, SpecialtyPack> = {
  'general-surgery': {
    label: 'General Surgery',
    load: () => import('./general-surgery').then(m => m.TEMPLATES),
  },
  // Phase 2+: orthopedics, cardiothoracic, ent, urology, neurosurgery
}

export const DEFAULT_SPECIALTY = 'general-surgery'
