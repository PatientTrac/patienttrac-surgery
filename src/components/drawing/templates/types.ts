// ================================================================
// PatientTrac Surgery — anatomical template shared types & palette
// Base anatomical references by Servier Medical Art
// (smart.servier.com) CC BY 4.0
// ================================================================

export interface TemplateView {
  name: string
  svg: string
  aspectRatio: number
}

export interface TemplateGroup {
  label: string
  views: TemplateView[]
}

export type TemplateSet = Record<string, TemplateGroup>

// Shared illustration palette — keep every specialty pack on these
// tokens so the library reads as one hand.
export const SKIN = '#F4C5A3'
export const SKIN2 = '#E8A87C'
export const SKIN_STROKE = '#8B5A3C'
export const GUIDE = 'rgba(0,180,200,0.6)'
export const LANDMARK = '#4A90D9'
export const REF_LINE = 'rgba(0,212,255,0.25)'

// Organ tones (viscera packs)
export const ORGAN = '#EDAFA2'
export const ORGAN2 = '#DE8E7E'
export const ORGAN_STROKE = '#A95F4F'
export const BILE = '#A8C97A'
export const BILE_STROKE = '#6E8F4E'

export const toDataUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
