// ================================================================
// PatientTrac Surgery — Medical icon set
// Custom line-art SVGs, 24px grid, 1.5 stroke, currentColor.
// Stage icons (flow lanes) + module marks (drawer/module headers).
// ================================================================

import React from 'react'

interface IconProps {
  size?: number
  color?: string
  strokeWidth?: number
  style?: React.CSSProperties
}

function Svg({ size = 16, color = 'currentColor', strokeWidth = 1.5, style, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }} aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// ── Stage icons ─────────────────────────────────────────────────

/** Pre-Op — patient on a gurney */
export function IconGurney(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6.75" cy="7.75" r="1.75" />
      <path d="M10 8.75 H17.5 L20.5 10.25" />
      <path d="M3 11.5 H21" />
      <path d="M6 11.5 V15.5 M18 11.5 V15.5" />
      <circle cx="6" cy="17.75" r="1.4" />
      <circle cx="18" cy="17.75" r="1.4" />
    </Svg>
  )
}

/** In OR — surgical lamp over the field */
export function IconOrLamp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.5 V5" />
      <path d="M7 10 A5 5 0 0 1 17 10" />
      <path d="M6.25 10 H17.75" />
      <path d="M8.75 13 L7.75 15.5" />
      <path d="M12 13.5 V16" />
      <path d="M15.25 13 L16.25 15.5" />
      <path d="M5 20 H19" />
    </Svg>
  )
}

/** PACU — vitals monitor with ECG trace */
export function IconVitalsMonitor(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="12" rx="1.5" />
      <path d="M6.5 10.5 H9 L10.5 7.75 L12.5 13.25 L14 10.5 H17.5" />
      <path d="M12 16.5 V19.5" />
      <path d="M8.75 19.5 H15.25" />
    </Svg>
  )
}

/** Ward / ICU — hospital bed, patient resting */
export function IconHospitalBed(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6 V18" />
      <path d="M21 10.5 V18" />
      <path d="M3 13.5 H21" />
      <circle cx="7.25" cy="10.25" r="1.75" />
      <path d="M10 12 H16 L18.5 13.5" />
    </Svg>
  )
}

/** Discharge — doorway with exit arrow */
export function IconDischargeDoor(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.5 3.5 H20 V20.5 H13.5" />
      <path d="M3.5 12 H11" />
      <path d="M8 8.75 L11.25 12 L8 15.25" />
    </Svg>
  )
}

// ── Module marks (richer, for drawer & module headers) ──────────

/** Pre-Operative — clipboard with vitals trace */
export function MarkPreOp(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="4" width="14" height="17.5" rx="2" />
      <rect x="9.25" y="2.25" width="5.5" height="3.5" rx="1" />
      <path d="M8.25 9.75 H15.75" />
      <path d="M8 15 H10 L11.25 12.5 L12.75 17 L14 15 H16" />
    </Svg>
  )
}

/** Operative — scalpel under theatre light */
export function MarkOperative(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19.5 4.5 L10.5 13.5" />
      <path d="M10.5 13.5 C8.5 16.5 6 18.5 3.5 19.75 C5.75 17 7.5 14.5 10.5 13.5 Z" />
      <path d="M14.5 3.25 L15.5 1.75" />
      <path d="M18 7.5 L21 6.75" />
      <path d="M20.25 10.5 L22.25 11.25" />
    </Svg>
  )
}

/** Post-Operative — recovering heart with pulse */
export function MarkPostOp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20.25 C5.5 15.25 4.25 11 6.5 8.5 C8.5 6.25 11 6.75 12 9 C13 6.75 15.5 6.25 17.5 8.5 C19.75 11 18.5 15.25 12 20.25 Z" />
      <path d="M7.5 12.25 H10 L11.25 10.25 L12.75 14.25 L14 12.25 H16.5" />
    </Svg>
  )
}

// ── Stage → icon mapping ────────────────────────────────────────

export type FlowStageKey = 'preop' | 'inor' | 'pacu' | 'ward' | 'discharge'

export const STAGE_ICONS: Record<FlowStageKey, (p: IconProps) => React.JSX.Element> = {
  preop: IconGurney,
  inor: IconOrLamp,
  pacu: IconVitalsMonitor,
  ward: IconHospitalBed,
  discharge: IconDischargeDoor,
}

export const MODULE_MARKS: Record<FlowStageKey, (p: IconProps) => React.JSX.Element> = {
  preop: MarkPreOp,
  inor: MarkOperative,
  pacu: MarkPostOp,
  ward: MarkPostOp,
  discharge: MarkPostOp,
}
