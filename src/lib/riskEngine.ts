// ================================================================
// PatientTrac Revela — AI Risk Intelligence Engine
// ================================================================

export type RiskSeverity = 'critical' | 'warning' | 'info'
export type RiskCategory =
  | 'cardiovascular' | 'family-history' | 'substance-history'
  | 'surgical-history' | 'medication' | 'psychiatric' | 'oncology'
  | 'anesthesia' | 'social' | 'compliance' | 'wound-healing' | 'documentation'

export interface ClinicalFlag {
  id: string
  severity: RiskSeverity
  category: RiskCategory
  title: string
  description: string
  evidence: string[]
  requiredActions: FlagAction[]
  inquiryQuestions?: string[]
  blocksOR: boolean
  dismissed: boolean
  createdAt: string
}

export interface FlagAction {
  label: string
  type: 'order' | 'referral' | 'document' | 'protocol' | 'verify'
}

export interface RiskScore {
  composite: number
  cardiovascular: number
  substanceHistory: number
  surgicalHistory: number
  familyHistory: number
  medicationRisk: number
  psychiatricRisk: number
  anesthesiaRisk: number
  woundHealingRisk: number
  level: 'low' | 'moderate' | 'high' | 'critical'
}

export interface PatientRiskInput {
  bpSystolic?: number
  bpDiastolic?: number
  bmi?: number
  hasHypertension?: boolean
  hasDiabetes?: boolean
  priorAbdominalSurgeries?: string[]
  priorChestWallRadiation?: boolean
  multipleSurgeries?: number
  medications?: string[]
  onAnticoagulants?: boolean
  onSSRI?: boolean
  onACEInhibitor?: boolean
  smokingStatus?: 'never' | 'former' | 'current'
  alcoholUse?: 'none' | 'light' | 'moderate' | 'heavy' | 'undocumented'
  priorOpioidUse?: boolean | 'undocumented'
  recreationalDrugUse?: boolean | 'undocumented'
  familyCardiacHistory?: boolean
  familyCardiacAge?: number
  familyMalignantHyperthermia?: boolean
  familyCancerHistory?: string[]
  psychiatricStability?: 'stable' | 'unstable' | 'unknown'
  consentComplete?: boolean
  labsComplete?: boolean
}

export function generateClinicalFlags(input: PatientRiskInput): ClinicalFlag[] {
  const flags: ClinicalFlag[] = []
  const now = new Date().toISOString()
  let id = 1
  const mkId = () => `flag-${id++}`

  // ── CARDIOVASCULAR ──────────────────────────────────────────
  if ((input.bpSystolic && input.bpSystolic >= 160) || (input.bpDiastolic && input.bpDiastolic >= 100)) {
    flags.push({
      id: mkId(), severity: 'critical', category: 'cardiovascular', blocksOR: true, dismissed: false, createdAt: now,
      title: 'Severe hypertension — BP management required before OR',
      description: `BP ${input.bpSystolic}/${input.bpDiastolic} is Stage 2+ hypertension. Anesthesia risk is significantly elevated. Cardiology clearance required.`,
      evidence: [`BP: ${input.bpSystolic}/${input.bpDiastolic} mmHg`, 'Threshold: 160/100'],
      requiredActions: [
        { label: 'Cardiology referral', type: 'referral' },
        { label: 'Order echocardiogram', type: 'order' },
        { label: 'Document repeat readings', type: 'document' },
      ],
      inquiryQuestions: [
        'How long has the patient had elevated blood pressure?',
        'Is the patient compliant with antihypertensive medications?',
        'Any prior cardiac events, chest pain, or shortness of breath?',
      ],
    })
  } else if ((input.bpSystolic && input.bpSystolic >= 140) || (input.bpDiastolic && input.bpDiastolic >= 90)) {
    flags.push({
      id: mkId(), severity: 'warning', category: 'cardiovascular', blocksOR: false, dismissed: false, createdAt: now,
      title: 'Elevated BP — above safe surgical threshold of 140/90',
      description: `BP ${input.bpSystolic}/${input.bpDiastolic} exceeds safe surgical guideline. Optimize before OR scheduling.`,
      evidence: [`BP: ${input.bpSystolic}/${input.bpDiastolic}`, 'Surgical threshold: <140/90'],
      requiredActions: [
        { label: 'Anesthesia notification', type: 'protocol' },
        { label: 'Repeat BP check', type: 'document' },
      ],
      inquiryQuestions: ['Is this reading consistent with prior measurements?'],
    })
  }

  // ── FAMILY HISTORY ──────────────────────────────────────────
  if (input.familyMalignantHyperthermia) {
    flags.push({
      id: mkId(), severity: 'critical', category: 'anesthesia', blocksOR: true, dismissed: false, createdAt: now,
      title: 'Family history of malignant hyperthermia — TIVA protocol required',
      description: 'First-degree relative with MH. Triggering agents must be avoided. Dantrolene must be available. TIVA protocol required.',
      evidence: ['Family history: MH in first-degree relative'],
      requiredActions: [
        { label: 'TIVA protocol order', type: 'protocol' },
        { label: 'MH hotline consult', type: 'referral' },
        { label: 'Confirm dantrolene available', type: 'verify' },
      ],
      inquiryQuestions: [
        'Which relative was affected?',
        'Was MH confirmed by muscle biopsy or genetic testing?',
        'Has patient had general anesthesia without incident before?',
      ],
    })
  }

  if (input.familyCardiacHistory && input.familyCardiacAge && input.familyCardiacAge < 60) {
    flags.push({
      id: mkId(), severity: 'warning', category: 'family-history', blocksOR: false, dismissed: false, createdAt: now,
      title: `Premature family cardiac event at age ${input.familyCardiacAge}`,
      description: `First-degree relative with cardiac event at age ${input.familyCardiacAge}. Elevated inherited cardiovascular risk. Lipid panel and ECG required.`,
      evidence: [`Family cardiac event at age ${input.familyCardiacAge}`, 'Threshold: <60 years'],
      requiredActions: [
        { label: 'Fasting lipid panel', type: 'order' },
        { label: 'Resting 12-lead ECG', type: 'order' },
        { label: 'Cardiology consult', type: 'referral' },
      ],
      inquiryQuestions: [
        'What type of cardiac event? (MI, arrhythmia, sudden death)',
        'Are other siblings or children affected?',
        'Has the patient ever had a cardiac workup?',
      ],
    })
  }

  if (input.familyCancerHistory && input.familyCancerHistory.length > 0) {
    flags.push({
      id: mkId(), severity: 'info', category: 'family-history', blocksOR: false, dismissed: false, createdAt: now,
      title: 'Family cancer history — genetic counseling consideration',
      description: `Family history of ${input.familyCancerHistory.join(', ')}. Genetic counseling and hereditary cancer screening may be appropriate.`,
      evidence: [`Family cancer: ${input.familyCancerHistory.join(', ')}`],
      requiredActions: [
        { label: 'Genetic counseling referral', type: 'referral' },
        { label: 'Document family pedigree', type: 'document' },
      ],
      inquiryQuestions: [
        'How many first-degree relatives affected?',
        'Has patient had BRCA1/2 or Lynch syndrome testing?',
        'What types of cancer and at what ages?',
      ],
    })
  }

  // ── SUBSTANCE HISTORY ───────────────────────────────────────
  if (input.smokingStatus === 'current') {
    flags.push({
      id: mkId(), severity: 'critical', category: 'substance-history', blocksOR: true, dismissed: false, createdAt: now,
      title: 'Active smoker — flap failure risk 3–4× elevated',
      description: 'Active smoking reduces tissue oxygenation by 40%. For flap-based reconstruction this is a 3–4× failure risk. Cessation ≥6 weeks required before elective surgery.',
      evidence: ['Smoking status: current active smoker'],
      requiredActions: [
        { label: 'Cessation counseling', type: 'protocol' },
        { label: 'Nicotine replacement therapy', type: 'order' },
        { label: 'Reschedule — min 6 weeks post-cessation', type: 'protocol' },
      ],
      inquiryQuestions: [
        'How many cigarettes per day and for how many years?',
        'Has patient attempted cessation before?',
        'Is patient willing to commit to cessation program?',
      ],
    })
  } else if (input.smokingStatus === 'former') {
    flags.push({
      id: mkId(), severity: 'warning', category: 'substance-history', blocksOR: false, dismissed: false, createdAt: now,
      title: 'Former smoker — confirm cessation date and duration',
      description: 'Former smoking affects wound healing based on cessation duration. Confirm date of cessation and pack-year history for anesthesia risk.',
      evidence: ['Smoking status: former smoker'],
      requiredActions: [
        { label: 'Document cessation date', type: 'document' },
        { label: 'Document pack-year history', type: 'document' },
      ],
      inquiryQuestions: [
        'When exactly did the patient stop smoking?',
        'Total pack-year history?',
        'Any e-cigarette or vaping use currently?',
      ],
    })
  }

  if (input.alcoholUse === 'heavy') {
    flags.push({
      id: mkId(), severity: 'critical', category: 'substance-history', blocksOR: true, dismissed: false, createdAt: now,
      title: 'Heavy alcohol use — anesthesia dosing and withdrawal risk',
      description: 'Heavy alcohol use requires modified anesthesia dosing and poses withdrawal risk perioperatively. CIWA protocol may be needed. LFTs and INR required.',
      evidence: ['Alcohol use: heavy (15+ drinks/week)'],
      requiredActions: [
        { label: 'Liver function tests', type: 'order' },
        { label: 'INR / coagulation panel', type: 'order' },
        { label: 'CIWA protocol evaluation', type: 'protocol' },
        { label: 'Addiction medicine consult', type: 'referral' },
      ],
      inquiryQuestions: [
        'Exact number of drinks per day and last drink?',
        'Any prior alcohol withdrawal seizures or DTs?',
        'Current liver disease or jaundice?',
      ],
    })
  } else if (input.alcoholUse === 'undocumented') {
    flags.push({
      id: mkId(), severity: 'warning', category: 'substance-history', blocksOR: false, dismissed: false, createdAt: now,
      title: 'Alcohol use — frequency and quantity not documented',
      description: 'Patient reported alcohol use but quantity and frequency not recorded. AUDIT-C screening required before pre-op clearance.',
      evidence: ['Alcohol use: reported but not quantified'],
      requiredActions: [
        { label: 'AUDIT-C screening tool', type: 'document' },
        { label: 'Document drinks per week', type: 'document' },
      ],
      inquiryQuestions: [
        'How many drinks per week on average?',
        'Any recent increase in alcohol use?',
        'Date of last alcoholic drink?',
      ],
    })
  }

  if (input.priorOpioidUse) {
    flags.push({
      id: mkId(), severity: 'warning', category: 'substance-history', blocksOR: false, dismissed: false, createdAt: now,
      title: 'Prior opioid use — tolerance affects postoperative pain management',
      description: 'Opioid-tolerant patients require modified postoperative pain protocols. Risk of undertreated pain or hyperalgesia.',
      evidence: [`Prior opioid use: ${input.priorOpioidUse === 'undocumented' ? 'reported, not detailed' : 'documented'}`],
      requiredActions: [
        { label: 'Pain management consult', type: 'referral' },
        { label: 'Document opioid history', type: 'document' },
        { label: 'PDMP check', type: 'verify' },
      ],
      inquiryQuestions: [
        'What opioids, at what doses, and for how long?',
        'Currently on opioid therapy or MAT program?',
        'Any history of opioid use disorder or overdose?',
      ],
    })
  }

  if (input.recreationalDrugUse === 'undocumented') {
    flags.push({
      id: mkId(), severity: 'warning', category: 'substance-history', blocksOR: false, dismissed: false, createdAt: now,
      title: 'Recreational drug use — screening incomplete',
      description: 'Standard substance use screening is incomplete. Cocaine, meth, and cannabis all have significant anesthetic implications.',
      evidence: ['Recreational drug use: not formally screened'],
      requiredActions: [
        { label: 'Urine drug screen', type: 'order' },
        { label: 'DAST-10 screening', type: 'document' },
      ],
      inquiryQuestions: [
        'Any use of cocaine, methamphetamine, or stimulants?',
        'Cannabis use — frequency and last use?',
        'Any IV drug use history?',
      ],
    })
  }

  // ── SURGICAL HISTORY ────────────────────────────────────────
  if (input.priorChestWallRadiation) {
    flags.push({
      id: mkId(), severity: 'critical', category: 'oncology', blocksOR: false, dismissed: false, createdAt: now,
      title: 'Prior chest wall radiation — implant failure risk 3× elevated',
      description: 'Chest wall radiation causes tissue fibrosis. Implant-based reconstruction has 3× failure rate. DIEP or autologous flap preferred.',
      evidence: ['Prior chest wall radiation documented'],
      requiredActions: [
        { label: 'Request XRT records + dosimetry', type: 'order' },
        { label: 'Order CTA angiography — perforators', type: 'order' },
        { label: 'Plan DIEP flap approach', type: 'protocol' },
      ],
      inquiryQuestions: [
        'Total radiation dose and treatment dates?',
        'Which specific field was irradiated?',
        'Any skin changes or wound healing problems since radiation?',
      ],
    })
  }

  if (input.multipleSurgeries && input.multipleSurgeries >= 3) {
    flags.push({
      id: mkId(), severity: 'warning', category: 'surgical-history', blocksOR: false, dismissed: false, createdAt: now,
      title: `${input.multipleSurgeries} prior surgeries — anesthesia sensitivity and adhesion risk`,
      description: `Multiple prior surgeries increase risk of adhesions, altered anatomy, and cumulative anesthesia exposure.`,
      evidence: [`Prior surgical procedures: ${input.multipleSurgeries}`],
      requiredActions: [
        { label: 'Collect all operative reports', type: 'document' },
        { label: 'Anesthesia history review', type: 'protocol' },
      ],
      inquiryQuestions: [
        'Any prior anesthesia complications or reactions?',
        'Difficult intubation history?',
        'Any prior surgeries not listed in records?',
      ],
    })
  }

  // ── MEDICATIONS ─────────────────────────────────────────────
  if (input.onAnticoagulants) {
    flags.push({
      id: mkId(), severity: 'critical', category: 'medication', blocksOR: true, dismissed: false, createdAt: now,
      title: 'Anticoagulant therapy — bridge protocol required before OR',
      description: 'Warfarin patients require INR ≤1.5 and may need LMWH bridge therapy. NOAC patients require drug-specific hold period.',
      evidence: ['Anticoagulant therapy: active'],
      requiredActions: [
        { label: 'INR level if warfarin', type: 'order' },
        { label: 'Bridge therapy protocol', type: 'protocol' },
        { label: 'Hematology consult', type: 'referral' },
      ],
      inquiryQuestions: [
        'Which anticoagulant and at what dose?',
        'What is the indication for anticoagulation?',
        'History of clot or PE?',
      ],
    })
  }

  if (input.onSSRI) {
    flags.push({
      id: mkId(), severity: 'warning', category: 'medication', blocksOR: false, dismissed: false, createdAt: now,
      title: 'SSRI therapy — serotonin syndrome and bleeding risk',
      description: 'SSRIs cause platelet dysfunction and increased surgical bleeding. Opioid combination requires serotonin syndrome protocol.',
      evidence: ['SSRI: active prescription'],
      requiredActions: [
        { label: 'Anesthesia serotonin protocol', type: 'protocol' },
        { label: 'Platelet function assessment', type: 'order' },
      ],
      inquiryQuestions: ['Which SSRI and at what dose?', 'How long has patient been on SSRI?'],
    })
  }

  if (input.onACEInhibitor) {
    flags.push({
      id: mkId(), severity: 'warning', category: 'medication', blocksOR: false, dismissed: false, createdAt: now,
      title: 'ACE inhibitor — hold morning of surgery',
      description: 'ACE inhibitors must be held day-of-surgery. Intraoperative hypotension risk is significantly elevated if taken.',
      evidence: ['ACE inhibitor: active prescription'],
      requiredActions: [
        { label: 'Document hold instructions', type: 'document' },
        { label: 'Anesthesia notification', type: 'protocol' },
      ],
      inquiryQuestions: ['Does patient understand medication hold instructions?'],
    })
  }

  // ── WOUND HEALING ───────────────────────────────────────────
  if (input.bmi && input.bmi > 35) {
    flags.push({
      id: mkId(), severity: 'warning', category: 'wound-healing', blocksOR: false, dismissed: false, createdAt: now,
      title: `BMI ${Math.round(input.bmi)} — elevated wound complication risk`,
      description: `BMI >35 associated with increased wound dehiscence, seroma, infection, and flap necrosis. Nutritional optimization recommended.`,
      evidence: [`BMI: ${Math.round(input.bmi)}`, 'Threshold: BMI >35'],
      requiredActions: [
        { label: 'Nutritional assessment', type: 'order' },
        { label: 'Albumin / pre-albumin level', type: 'order' },
      ],
      inquiryQuestions: [
        'Has patient attempted weight loss prior to procedure?',
        'Any history of wound healing problems?',
        'Diabetic or nutritional deficiencies?',
      ],
    })
  }

  // ── PSYCHIATRIC ─────────────────────────────────────────────
  if (input.psychiatricStability === 'unstable') {
    flags.push({
      id: mkId(), severity: 'warning', category: 'psychiatric', blocksOR: false, dismissed: false, createdAt: now,
      title: 'Psychiatric instability — surgical readiness assessment needed',
      description: 'Unstable psychiatric status may affect surgical decision-making and postoperative compliance. Clearance recommended.',
      evidence: ['Psychiatric status: documented as unstable'],
      requiredActions: [
        { label: 'Psychiatric clearance', type: 'referral' },
        { label: 'Psychological readiness assessment', type: 'referral' },
      ],
      inquiryQuestions: [
        'Current medications and compliance?',
        'Any recent hospitalizations or crisis events?',
        'Support system stability?',
      ],
    })
  }

  // ── DOCUMENTATION ───────────────────────────────────────────
  if (!input.consentComplete) {
    flags.push({
      id: mkId(), severity: 'warning', category: 'documentation', blocksOR: true, dismissed: false, createdAt: now,
      title: 'Informed consent incomplete — cannot proceed to OR',
      description: 'Signed informed consent required before any surgical procedure.',
      evidence: ['Consent status: incomplete'],
      requiredActions: [
        { label: 'Generate consent document', type: 'document' },
        { label: 'Patient signature required', type: 'verify' },
      ],
    })
  }

  return flags
}

export function calculateRiskScore(input: PatientRiskInput, flags: ClinicalFlag[]): RiskScore {
  let cardiovascular = 0, substanceHistory = 0, surgicalHistory = 0
  let familyHistory = 0, medicationRisk = 0, psychiatricRisk = 0
  let anesthesiaRisk = 0, woundHealingRisk = 0

  if (input.bpSystolic && input.bpSystolic >= 160) cardiovascular += 35
  else if (input.bpSystolic && input.bpSystolic >= 140) cardiovascular += 20
  if (input.familyCardiacHistory && input.familyCardiacAge && input.familyCardiacAge < 60) {
    familyHistory += 25; cardiovascular += 10
  }
  if (input.smokingStatus === 'current') { substanceHistory += 40; woundHealingRisk += 30 }
  else if (input.smokingStatus === 'former') substanceHistory += 15
  if (input.alcoholUse === 'heavy') substanceHistory += 35
  else if (input.alcoholUse === 'undocumented') substanceHistory += 15
  if (input.priorOpioidUse) substanceHistory += 20
  if (input.recreationalDrugUse === 'undocumented') substanceHistory += 10
  if (input.priorChestWallRadiation) { surgicalHistory += 30; woundHealingRisk += 20 }
  if (input.multipleSurgeries && input.multipleSurgeries >= 3) surgicalHistory += 20
  if (input.onAnticoagulants) medicationRisk += 30
  if (input.onSSRI) medicationRisk += 15
  if (input.onACEInhibitor) medicationRisk += 10
  if (input.familyMalignantHyperthermia) anesthesiaRisk += 50
  if (input.psychiatricStability === 'unstable') psychiatricRisk += 25
  if (input.bmi && input.bmi > 35) woundHealingRisk += 25

  const cap = (v: number) => Math.min(100, Math.round(v))
  const scores = {
    cardiovascular: cap(cardiovascular),
    substanceHistory: cap(substanceHistory),
    surgicalHistory: cap(surgicalHistory),
    familyHistory: cap(familyHistory),
    medicationRisk: cap(medicationRisk),
    psychiatricRisk: cap(psychiatricRisk),
    anesthesiaRisk: cap(anesthesiaRisk),
    woundHealingRisk: cap(woundHealingRisk),
  }

  const composite = cap(
    scores.cardiovascular * 0.25 + scores.substanceHistory * 0.20 +
    scores.surgicalHistory * 0.15 + scores.familyHistory * 0.10 +
    scores.medicationRisk * 0.10 + scores.anesthesiaRisk * 0.10 +
    scores.woundHealingRisk * 0.07 + scores.psychiatricRisk * 0.03
  )

  const level: RiskScore['level'] =
    composite >= 70 ? 'critical' : composite >= 50 ? 'high' :
    composite >= 30 ? 'moderate' : 'low'

  return { composite, level, ...scores }
}

export function determineORClearance(
  flags: ClinicalFlag[], score: RiskScore
): 'clear' | 'conditional' | 'hold' | 'pending' {
  const hasBlockers = flags.some(f => f.blocksOR && !f.dismissed)
  if (hasBlockers) return 'hold'
  if (score.composite >= 50) return 'conditional'
  return 'clear'
}
