/**
 * Caprini VTE Risk Assessment Component
 * PatientTracSurg — reusable across all surgical forms
 *
 * Reference: Caprini JA. Thromb Haemost. 2005;94:750-757.
 *            Updated 2010 model with AAOS/ACCP arthroplasty-specific guidance.
 *
 * Usage:
 *   CapriniVTE.render('containerId')
 *   CapriniVTE.getScore()    → { score, riskLevel, recommendation }
 *   CapriniVTE.getData()     → full serializable object for persistence
 */

const CapriniVTE = (() => {

    // Risk factors: [label, points, groupId]
    const FACTORS = [
        // 1-point factors
        { id: 'age_41_60',       label: 'Age 41–60 years',                                    pts: 1, group: 'patient' },
        { id: 'minor_surgery',   label: 'Minor surgery planned',                               pts: 1, group: 'surgery' },
        { id: 'hx_major_surgery',label: 'Major surgery in past month',                         pts: 1, group: 'hx' },
        { id: 'varicose_veins',  label: 'Varicose veins',                                      pts: 1, group: 'hx' },
        { id: 'ibd',             label: 'Inflammatory bowel disease',                           pts: 1, group: 'hx' },
        { id: 'swollen_legs',    label: 'Swollen legs (current)',                               pts: 1, group: 'exam' },
        { id: 'obesity',         label: 'Obesity (BMI >25)',                                    pts: 1, group: 'exam' },
        { id: 'acute_mi',        label: 'Acute myocardial infarction',                          pts: 1, group: 'hx' },
        { id: 'chf',             label: 'Congestive heart failure (<1 month)',                  pts: 1, group: 'hx' },
        { id: 'copd_lung',       label: 'COPD / serious lung disease',                          pts: 1, group: 'hx' },
        { id: 'sepsis',          label: 'Sepsis (<1 month)',                                    pts: 1, group: 'hx' },
        { id: 'immobilizing_cast',label: 'Immobilizing plaster cast (<1 month)',                pts: 1, group: 'hx' },
        { id: 'oral_contraceptives',label: 'Oral contraceptives / hormone replacement',        pts: 1, group: 'meds' },
        { id: 'pregnancy',       label: 'Pregnancy or post-partum (<1 month)',                  pts: 1, group: 'patient' },
        { id: 'unexplained_stillbirth',label: 'History of unexplained stillborn/recurrent spontaneous abortion/premature birth with pre-eclampsia', pts: 1, group: 'hx' },
        { id: 'bed_rest',        label: 'Patient currently confined to bed',                    pts: 1, group: 'exam' },
        // 2-point factors
        { id: 'age_61_74',       label: 'Age 61–74 years',                                    pts: 2, group: 'patient' },
        { id: 'arthroscopy',     label: 'Arthroscopic surgery',                                 pts: 2, group: 'surgery' },
        { id: 'malignancy',      label: 'Malignancy (present or previous)',                     pts: 2, group: 'hx' },
        { id: 'major_surgery',   label: 'Major surgery (>45 min)',                             pts: 2, group: 'surgery' },
        { id: 'laparoscopic',    label: 'Laparoscopic surgery (>45 min)',                       pts: 2, group: 'surgery' },
        { id: 'confined_72h',    label: 'Patient confined to bed >72 hours',                   pts: 2, group: 'exam' },
        { id: 'immobilizing_cast_long',label: 'Immobilizing cast (>1 month)',                  pts: 2, group: 'hx' },
        { id: 'central_venous',  label: 'Central venous access',                               pts: 2, group: 'surgery' },
        // 3-point factors
        { id: 'age_75_plus',     label: 'Age ≥75 years',                                       pts: 3, group: 'patient' },
        { id: 'hx_dvt_pe',       label: 'History of DVT/PE',                                   pts: 3, group: 'hx' },
        { id: 'family_hx_dvt',   label: 'Family history of DVT/PE',                            pts: 3, group: 'hx' },
        { id: 'factor_v_leiden', label: 'Factor V Leiden positive',                             pts: 3, group: 'labs' },
        { id: 'prothrombin_mutation',label: 'Prothrombin 20210A mutation',                      pts: 3, group: 'labs' },
        { id: 'lupus_anticoag',  label: 'Lupus anticoagulant / anticardiolipin antibodies',     pts: 3, group: 'labs' },
        { id: 'elevated_hcy',    label: 'Elevated serum homocysteine',                          pts: 3, group: 'labs' },
        { id: 'heparin_hit',     label: 'Heparin-induced thrombocytopenia (HIT)',               pts: 3, group: 'hx' },
        { id: 'elevated_platelets',label: 'Elevated factor VIII, XI, or platelets',             pts: 3, group: 'labs' },
        // 5-point factors
        { id: 'stroke',          label: 'Stroke (<1 month)',                                    pts: 5, group: 'hx' },
        { id: 'elective_hip_knee',label: 'Elective major lower extremity arthroplasty',         pts: 5, group: 'surgery' },
        { id: 'hip_pelvis_leg_fracture',label: 'Hip, pelvis, or leg fracture (<1 month)',       pts: 5, group: 'hx' },
        { id: 'acute_spinal_cord',label: 'Acute spinal cord injury / paralysis (<1 month)',     pts: 5, group: 'hx' },
        { id: 'multiple_trauma', label: 'Multiple trauma (<1 month)',                           pts: 5, group: 'hx' },
    ];

    const GROUPS = {
        patient: 'Patient Characteristics',
        surgery: 'Surgery & Procedure',
        exam:    'Physical Examination',
        hx:      'Medical History',
        meds:    'Medications',
        labs:    'Laboratory / Thrombophilia',
    };

    function getRiskLevel(score) {
        if (score <= 1)  return { level: 'Low',       color: '#10b981', pct: '< 0.5%',  recommendation: 'Early ambulation only. No pharmacological prophylaxis required.' };
        if (score <= 2)  return { level: 'Moderate',  color: '#f59e0b', pct: '~1.5%',   recommendation: 'Mechanical prophylaxis (IPC). Consider LMWH or UFH if no contraindication per ACCP.' };
        if (score <= 4)  return { level: 'High',      color: '#f97316', pct: '~3%',     recommendation: 'Pharmacological prophylaxis (LMWH/UFH) + IPC. Continue 10–14 days. Consider extended prophylaxis for arthroplasty.' };
        return             { level: 'Very High',    color: '#ef4444', pct: '~6%',     recommendation: 'Pharmacological prophylaxis (LMWH/UFH or fondaparinux) + IPC mandatory. Extended prophylaxis (28–35 days) recommended for THA/TKA. Consider hematology consult for thrombophilia workup.' };
    }

    function getHTML() {
        const groups = Object.entries(GROUPS);
        let sectionsHTML = groups.map(([gid, gtitle]) => {
            const factors = FACTORS.filter(f => f.group === gid);
            return `
            <div style="margin-bottom:16px;">
                <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.45);margin-bottom:8px;">${gtitle}</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:6px;">
                    ${factors.map(f => `
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:7px 10px;font-size:0.88rem;transition:background 0.15s;"
                        onmouseover="this.style.background='rgba(201,169,110,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                        <input type="checkbox" id="caprini_${f.id}" value="${f.pts}"
                            onchange="CapriniVTE._recalc()"
                            style="accent-color:#c9a96e;width:15px;height:15px;cursor:pointer;">
                        <span style="flex:1;">${f.label}</span>
                        <span style="background:rgba(201,169,110,0.15);border:1px solid rgba(201,169,110,0.3);padding:1px 7px;border-radius:10px;font-size:0.78rem;color:#c9a96e;white-space:nowrap;">+${f.pts}</span>
                    </label>`).join('')}
                </div>
            </div>`;
        }).join('');

        return `
<div style="font-family:inherit;">
    <div style="display:grid;grid-template-columns:1fr auto;align-items:start;gap:20px;margin-bottom:20px;">
        <div>
            <p style="opacity:0.65;font-size:0.85rem;line-height:1.5;margin:0;">
                Select all applicable risk factors. Score auto-calculates.
                Reference: Caprini (2010) / AAOS-ACCP arthroplasty VTE guidelines.
            </p>
        </div>
        <!-- Score card -->
        <div id="caprini_score_card" style="min-width:180px;background:rgba(15,25,45,0.8);border:2px solid rgba(255,255,255,0.15);border-radius:12px;padding:16px;text-align:center;">
            <div style="font-size:0.75rem;opacity:0.6;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;">Caprini Score</div>
            <div id="caprini_score_value" style="font-size:2.5rem;font-weight:700;color:#c9a96e;line-height:1;">0</div>
            <div id="caprini_risk_level" style="font-size:0.9rem;font-weight:600;margin-top:6px;color:#10b981;">Low Risk</div>
            <div id="caprini_risk_pct" style="font-size:0.75rem;opacity:0.6;margin-top:2px;">VTE risk: &lt;0.5%</div>
        </div>
    </div>

    ${sectionsHTML}

    <!-- Prophylaxis plan -->
    <div id="caprini_recommendation" style="background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:14px;margin-top:4px;margin-bottom:16px;">
        <div style="font-size:0.8rem;font-weight:700;color:#10b981;margin-bottom:6px;">RECOMMENDED PROPHYLAXIS</div>
        <div id="caprini_rec_text" style="font-size:0.88rem;line-height:1.5;opacity:0.85;">Early ambulation only. No pharmacological prophylaxis required.</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:4px;">
        <div>
            <label style="font-size:0.8rem;opacity:0.7;display:block;margin-bottom:4px;">Prophylaxis Ordered</label>
            <select id="caprini_prophylaxis_ordered" style="width:100%;background:rgba(20,30,50,0.9);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px;color:#fff;font-size:0.88rem;">
                <option value="">— Select —</option>
                <option value="none_ambulation">None — early ambulation only</option>
                <option value="ipc_only">IPC (compression devices) only</option>
                <option value="teds_only">TEDs/compression stockings only</option>
                <option value="ipc_plus_lmwh">IPC + LMWH</option>
                <option value="ipc_plus_ufh">IPC + UFH (unfractionated heparin)</option>
                <option value="lmwh_only">LMWH (enoxaparin) only</option>
                <option value="fondaparinux">Fondaparinux</option>
                <option value="oral_anticoagulant">Oral anticoagulant (rivaroxaban/apixaban)</option>
                <option value="contraindicated_bleeding">Pharmacological contraindicated — high bleeding risk</option>
            </select>
        </div>
        <div>
            <label style="font-size:0.8rem;opacity:0.7;display:block;margin-bottom:4px;">Duration</label>
            <select id="caprini_prophylaxis_duration" style="width:100%;background:rgba(20,30,50,0.9);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px;color:#fff;font-size:0.88rem;">
                <option value="">— Select —</option>
                <option value="inpatient_only">Inpatient only</option>
                <option value="10_14_days">10–14 days</option>
                <option value="28_35_days">28–35 days (extended — THA/TKA)</option>
                <option value="3_months">3 months</option>
                <option value="indefinite">Indefinite (prior VTE/thrombophilia)</option>
            </select>
        </div>
        <div>
            <label style="font-size:0.8rem;opacity:0.7;display:block;margin-bottom:4px;">Prophylaxis Notes</label>
            <input type="text" id="caprini_prophylaxis_notes" placeholder="Agent, dose, start time, contraindications..."
                style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px;color:#fff;font-size:0.88rem;">
        </div>
    </div>
</div>`;
    }

    function render(containerId) {
        const el = document.getElementById(containerId);
        if (!el) { console.error('CapriniVTE: container not found:', containerId); return; }
        el.innerHTML = getHTML();
    }

    function _recalc() {
        let score = 0;
        FACTORS.forEach(f => {
            const cb = document.getElementById('caprini_' + f.id);
            if (cb && cb.checked) score += f.pts;
        });

        // Mutual exclusivity: age groups (take highest selected)
        // Already handled by individual checkboxes — sum is correct as-is

        const { level, color, pct, recommendation } = getRiskLevel(score);

        const scoreEl = document.getElementById('caprini_score_value');
        const levelEl = document.getElementById('caprini_risk_level');
        const pctEl   = document.getElementById('caprini_risk_pct');
        const recEl   = document.getElementById('caprini_rec_text');
        const cardEl  = document.getElementById('caprini_score_card');
        const recBox  = document.getElementById('caprini_recommendation');

        if (scoreEl) scoreEl.textContent = score;
        if (levelEl) { levelEl.textContent = level + ' Risk'; levelEl.style.color = color; }
        if (pctEl)   pctEl.textContent = 'VTE risk: ' + pct;
        if (recEl)   recEl.textContent = recommendation;
        if (cardEl)  cardEl.style.borderColor = color;
        if (recBox)  recBox.style.borderColor = color.replace(')', ', 0.4)').replace('rgb', 'rgba');
    }

    function getScore() {
        let score = 0;
        FACTORS.forEach(f => {
            const cb = document.getElementById('caprini_' + f.id);
            if (cb && cb.checked) score += f.pts;
        });
        return { score, ...getRiskLevel(score) };
    }

    function getData() {
        const checkedFactors = FACTORS
            .filter(f => document.getElementById('caprini_' + f.id)?.checked)
            .map(f => ({ id: f.id, label: f.label, pts: f.pts }));

        const { score, level, pct, recommendation } = getScore();

        return {
            caprini_score:          score,
            caprini_risk_level:     level,
            caprini_vte_risk_pct:   pct,
            caprini_factors:        checkedFactors,
            prophylaxis_ordered:    document.getElementById('caprini_prophylaxis_ordered')?.value || null,
            prophylaxis_duration:   document.getElementById('caprini_prophylaxis_duration')?.value || null,
            prophylaxis_notes:      document.getElementById('caprini_prophylaxis_notes')?.value || null,
            prophylaxis_recommendation: recommendation,
        };
    }

    return { render, getScore, getData, _recalc };
})();
