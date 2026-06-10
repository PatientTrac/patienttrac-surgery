/**
 * Shared Allergy & Medication Reconciliation Component
 * PatientTracSurg — embeds into any specialty form
 *
 * Usage:
 *   AllergyMedComponent.render('containerId')
 *   AllergyMedComponent.getData()   → returns { allergies[], nkda, medications[], high_risk_flags }
 *   AllergyMedComponent.validate()  → returns true/false with inline error styling
 */

const AllergyMedComponent = (() => {

    // High-risk drug classes for perioperative flagging
    const HIGH_RISK_CLASSES = [
        { pattern: /warfarin|coumadin/i,         flag: 'Anticoagulant — confirm hold plan and INR' },
        { pattern: /rivaroxaban|xarelto/i,       flag: 'DOAC — confirm 24–48h hold per ASRA guidelines' },
        { pattern: /apixaban|eliquis/i,          flag: 'DOAC — confirm 24–48h hold per ASRA guidelines' },
        { pattern: /dabigatran|pradaxa/i,        flag: 'DOAC — confirm 48h hold; renal function check' },
        { pattern: /heparin|enoxaparin|lovenox/i,flag: 'Anticoagulant — confirm last dose timing' },
        { pattern: /clopidogrel|plavix/i,        flag: 'P2Y12 — confirm 5-day hold if not cardiac stent' },
        { pattern: /ticagrelor|brilinta/i,       flag: 'P2Y12 — confirm 5-day hold if not cardiac stent' },
        { pattern: /aspirin/i,                   flag: 'Antiplatelet — document hold vs. continue decision' },
        { pattern: /metformin/i,                 flag: 'Biguanide — hold day of surgery; renal function check' },
        { pattern: /glp.?1|semaglutide|ozempic|wegovy|liraglutide|victoza|dulaglutide|trulicity/i,
                                                 flag: 'GLP-1 agonist — hold per 2023 ASA guidance (weekly: 1wk; daily: day of); aspiration risk' },
        { pattern: /insulin/i,                   flag: 'Insulin — document NPO dose adjustment plan' },
        { pattern: /maoi|phenelzine|tranylcypro|selegiline/i,
                                                 flag: 'MAOI — serious drug interaction with meperidine/indirect sympathomimetics; specialist review required' },
        { pattern: /lithium/i,                   flag: 'Lithium — hold day of surgery; renal/volume monitoring' },
        { pattern: /digoxin/i,                   flag: 'Cardiac glycoside — check level; electrolyte monitoring' },
        { pattern: /amiodarone/i,                flag: 'Antiarrhythmic — prolonged half-life; defibrillation threshold altered' },
        { pattern: /ssri|sertraline|fluoxetine|paroxetine|citalopram|escitalopram/i,
                                                 flag: 'SSRI — serotonin syndrome risk with tramadol/fentanyl; bleeding risk' },
        { pattern: /steroid|prednisone|prednisolone|dexamethasone|methylpred/i,
                                                 flag: 'Chronic steroid — stress-dose coverage plan required' },
        { pattern: /herbal|st\.?\s*john|ginkgo|garlic|ginseng|valerian|kava|ephedra|fish oil/i,
                                                 flag: 'Herbal supplement — may affect bleeding/anesthesia; confirm held ≥2 weeks' },
    ];

    const REACTION_TYPES = ['Anaphylaxis', 'Urticaria/Rash', 'Angioedema', 'Bronchospasm',
                            'Hypotension', 'GI Intolerance', 'Drug Intolerance', 'Unknown'];

    let allergies = [];
    let medications = [];
    let containerId = null;

    // ─── HTML template ───────────────────────────────────────────────────────
    function getHTML() {
        return `
<div class="amc-wrapper" style="font-family: inherit;">

  <!-- ── ALLERGIES ─────────────────────────────────────────────────────── -->
  <div class="amc-section" style="margin-bottom:24px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h4 style="margin:0;color:#ef4444;font-size:1.05rem;letter-spacing:0.5px;">
        ⚠️ ALLERGIES &amp; ADVERSE REACTIONS
      </h4>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.9rem;color:#10b981;">
        <input type="checkbox" id="amc_nkda" onchange="AllergyMedComponent._onNKDA(this)">
        <span>NKDA (No Known Drug Allergies)</span>
      </label>
    </div>

    <div id="amc_allergy_list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>

    <div id="amc_allergy_entry" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:14px;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end;">
        <div>
          <label style="font-size:0.8rem;opacity:0.7;display:block;margin-bottom:4px;">Allergen / Drug</label>
          <input type="text" id="amc_allergy_name" placeholder="e.g., Penicillin, Latex, Contrast"
            style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px 10px;color:#fff;font-size:0.9rem;">
        </div>
        <div>
          <label style="font-size:0.8rem;opacity:0.7;display:block;margin-bottom:4px;">Reaction Type</label>
          <select id="amc_allergy_reaction"
            style="width:100%;background:rgba(20,30,50,0.9);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px 10px;color:#fff;font-size:0.9rem;">
            <option value="">Select reaction</option>
            ${REACTION_TYPES.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem;opacity:0.7;display:block;margin-bottom:4px;">Description / Notes</label>
          <input type="text" id="amc_allergy_notes" placeholder="e.g., throat swelling, required epinephrine"
            style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px 10px;color:#fff;font-size:0.9rem;">
        </div>
        <button onclick="AllergyMedComponent._addAllergy()"
          style="background:linear-gradient(135deg,#ef4444,#dc2626);border:none;border-radius:6px;padding:8px 14px;color:#fff;cursor:pointer;font-weight:600;white-space:nowrap;">
          + Add
        </button>
      </div>
    </div>
    <div id="amc_allergy_error" style="color:#ef4444;font-size:0.8rem;margin-top:6px;display:none;">
      ⚠️ At least one allergy must be documented, or check NKDA.
    </div>
  </div>

  <!-- ── MEDICATIONS ────────────────────────────────────────────────────── -->
  <div class="amc-section">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h4 style="margin:0;color:#c9a96e;font-size:1.05rem;letter-spacing:0.5px;">
        💊 CURRENT MEDICATIONS &amp; RECONCILIATION
      </h4>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.9rem;color:#10b981;">
        <input type="checkbox" id="amc_no_meds" onchange="AllergyMedComponent._onNoMeds(this)">
        <span>No Current Medications</span>
      </label>
    </div>

    <div id="amc_high_risk_flags" style="display:none;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-size:0.85rem;font-weight:700;color:#ef4444;margin-bottom:6px;">⚠️ HIGH-RISK MEDICATION FLAGS</div>
      <ul id="amc_flag_list" style="margin:0;padding-left:18px;font-size:0.85rem;color:rgba(255,255,255,0.85);line-height:1.8;"></ul>
    </div>

    <div id="amc_med_list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>

    <div id="amc_med_entry" style="background:rgba(201,169,110,0.06);border:1px solid rgba(201,169,110,0.25);border-radius:8px;padding:14px;">
      <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr auto;gap:10px;align-items:end;">
        <div>
          <label style="font-size:0.8rem;opacity:0.7;display:block;margin-bottom:4px;">Medication Name</label>
          <input type="text" id="amc_med_name" placeholder="e.g., Metformin, Warfarin, Aspirin 81mg"
            oninput="AllergyMedComponent._checkHighRisk(this.value)"
            style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px 10px;color:#fff;font-size:0.9rem;">
        </div>
        <div>
          <label style="font-size:0.8rem;opacity:0.7;display:block;margin-bottom:4px;">Dose / Frequency</label>
          <input type="text" id="amc_med_dose" placeholder="e.g., 500mg BID"
            style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px 10px;color:#fff;font-size:0.9rem;">
        </div>
        <div>
          <label style="font-size:0.8rem;opacity:0.7;display:block;margin-bottom:4px;">Periop Action</label>
          <select id="amc_med_action"
            style="width:100%;background:rgba(20,30,50,0.9);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px 10px;color:#fff;font-size:0.9rem;">
            <option value="">Select</option>
            <option value="continue">Continue</option>
            <option value="hold_day_of">Hold day of surgery</option>
            <option value="hold_24h">Hold 24h prior</option>
            <option value="hold_48h">Hold 48h prior</option>
            <option value="hold_5days">Hold 5 days prior</option>
            <option value="hold_1week">Hold 1 week prior</option>
            <option value="dose_adjust">Dose adjustment</option>
            <option value="substitute">Substitute</option>
            <option value="discuss">Discuss with team</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem;opacity:0.7;display:block;margin-bottom:4px;">Last Dose Taken</label>
          <input type="datetime-local" id="amc_med_last_dose"
            style="width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px 10px;color:#fff;font-size:0.9rem;">
        </div>
        <button onclick="AllergyMedComponent._addMed()"
          style="background:linear-gradient(135deg,#c9a96e,#a07840);border:none;border-radius:6px;padding:8px 14px;color:#fff;cursor:pointer;font-weight:600;white-space:nowrap;">
          + Add
        </button>
      </div>
    </div>
    <div id="amc_med_error" style="color:#ef4444;font-size:0.8rem;margin-top:6px;display:none;">
      ⚠️ At least one medication must be documented, or check No Current Medications.
    </div>
  </div>

</div>`;
    }

    // ─── Render ───────────────────────────────────────────────────────────────
    function render(targetId) {
        containerId = targetId;
        const container = document.getElementById(targetId);
        if (!container) { console.error('AllergyMedComponent: container not found:', targetId); return; }
        container.innerHTML = getHTML();
    }

    // ─── Allergy handlers ─────────────────────────────────────────────────────
    function _addAllergy() {
        const name     = document.getElementById('amc_allergy_name').value.trim();
        const reaction = document.getElementById('amc_allergy_reaction').value;
        const notes    = document.getElementById('amc_allergy_notes').value.trim();
        if (!name) { document.getElementById('amc_allergy_name').focus(); return; }

        const entry = { name, reaction, notes, id: Date.now() };
        allergies.push(entry);
        _renderAllergyList();
        document.getElementById('amc_allergy_name').value = '';
        document.getElementById('amc_allergy_reaction').value = '';
        document.getElementById('amc_allergy_notes').value = '';
        document.getElementById('amc_allergy_error').style.display = 'none';
        // Auto-uncheck NKDA if an allergy is added
        const nkda = document.getElementById('amc_nkda');
        if (nkda) nkda.checked = false;
    }

    function _removeAllergy(id) {
        allergies = allergies.filter(a => a.id !== id);
        _renderAllergyList();
    }

    function _renderAllergyList() {
        const list = document.getElementById('amc_allergy_list');
        if (!list) return;
        list.innerHTML = allergies.map(a => `
            <div style="display:flex;align-items:center;gap:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:8px 12px;">
                <span style="font-size:0.9rem;flex:1;"><strong style="color:#ef4444;">${_esc(a.name)}</strong>${a.reaction ? ' — ' + _esc(a.reaction) : ''}${a.notes ? ' <span style="opacity:0.7;font-size:0.85em">(' + _esc(a.notes) + ')</span>' : ''}</span>
                <button onclick="AllergyMedComponent._removeAllergy(${a.id})"
                  style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);border-radius:4px;padding:2px 8px;color:#ef4444;cursor:pointer;font-size:0.8rem;">✕</button>
            </div>`).join('');
    }

    function _onNKDA(cb) {
        const entry = document.getElementById('amc_allergy_entry');
        const list  = document.getElementById('amc_allergy_list');
        if (cb.checked) {
            if (entry) entry.style.display = 'none';
            if (list)  list.style.display  = 'none';
            allergies = [];
        } else {
            if (entry) entry.style.display = '';
            if (list)  list.style.display  = '';
        }
        document.getElementById('amc_allergy_error').style.display = 'none';
    }

    // ─── Medication handlers ──────────────────────────────────────────────────
    function _addMed() {
        const name     = document.getElementById('amc_med_name').value.trim();
        const dose     = document.getElementById('amc_med_dose').value.trim();
        const action   = document.getElementById('amc_med_action').value;
        const lastDose = document.getElementById('amc_med_last_dose').value || null;
        if (!name) { document.getElementById('amc_med_name').focus(); return; }

        const entry = { name, dose, action, last_dose: lastDose, id: Date.now() };
        medications.push(entry);
        _renderMedList();
        _refreshHighRiskFlags();
        document.getElementById('amc_med_name').value     = '';
        document.getElementById('amc_med_dose').value     = '';
        document.getElementById('amc_med_action').value   = '';
        document.getElementById('amc_med_last_dose').value= '';
        document.getElementById('amc_med_error').style.display = 'none';
        const noMeds = document.getElementById('amc_no_meds');
        if (noMeds) noMeds.checked = false;
    }

    function _removeMed(id) {
        medications = medications.filter(m => m.id !== id);
        _renderMedList();
        _refreshHighRiskFlags();
    }

    function _renderMedList() {
        const list = document.getElementById('amc_med_list');
        if (!list) return;
        list.innerHTML = medications.map(m => {
            const actionLabel = {
                continue:'Continue', hold_day_of:'Hold day of surg', hold_24h:'Hold 24h', hold_48h:'Hold 48h',
                hold_5days:'Hold 5 days', hold_1week:'Hold 1 week', dose_adjust:'Dose adjust',
                substitute:'Substitute', discuss:'Discuss'
            }[m.action] || m.action || '—';
            const actionColor = ['continue'].includes(m.action) ? '#10b981'
                : ['hold_day_of','hold_24h','hold_48h','hold_5days','hold_1week'].includes(m.action) ? '#f97316'
                : '#c9a96e';
            return `
            <div style="display:flex;align-items:center;gap:10px;background:rgba(201,169,110,0.07);border:1px solid rgba(201,169,110,0.2);border-radius:6px;padding:8px 12px;">
                <span style="flex:1;font-size:0.9rem;">
                    <strong style="color:#c9a96e;">${_esc(m.name)}</strong>
                    ${m.dose ? ' <span style="opacity:0.7;">' + _esc(m.dose) + '</span>' : ''}
                    ${m.action ? ' <span style="background:rgba(255,255,255,0.08);padding:1px 7px;border-radius:10px;font-size:0.78rem;color:' + actionColor + ';">' + actionLabel + '</span>' : ''}
                    ${m.last_dose ? ' <span style="opacity:0.55;font-size:0.8em;">Last: ' + m.last_dose.replace('T',' ') + '</span>' : ''}
                </span>
                <button onclick="AllergyMedComponent._removeMed(${m.id})"
                  style="background:rgba(201,169,110,0.15);border:1px solid rgba(201,169,110,0.3);border-radius:4px;padding:2px 8px;color:#c9a96e;cursor:pointer;font-size:0.8rem;">✕</button>
            </div>`;
        }).join('');
    }

    function _onNoMeds(cb) {
        const entry = document.getElementById('amc_med_entry');
        const list  = document.getElementById('amc_med_list');
        if (cb.checked) {
            if (entry) entry.style.display = 'none';
            if (list)  list.style.display  = 'none';
            medications = [];
            _refreshHighRiskFlags();
        } else {
            if (entry) entry.style.display = '';
            if (list)  list.style.display  = '';
        }
        document.getElementById('amc_med_error').style.display = 'none';
    }

    // ─── High-risk flag detection ─────────────────────────────────────────────
    function _checkHighRisk(val) {
        // Preview flag while typing (doesn't add to permanent list yet)
        const match = HIGH_RISK_CLASSES.find(hrc => hrc.pattern.test(val));
        const preview = document.getElementById('amc_flag_preview');
        if (!preview) return;
        if (match && val.length > 2) {
            preview.textContent = '⚠️ ' + match.flag;
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
        }
    }

    function _refreshHighRiskFlags() {
        const flagDiv  = document.getElementById('amc_high_risk_flags');
        const flagList = document.getElementById('amc_flag_list');
        if (!flagDiv || !flagList) return;
        const flags = [];
        medications.forEach(m => {
            HIGH_RISK_CLASSES.forEach(hrc => {
                if (hrc.pattern.test(m.name) && !flags.includes(hrc.flag)) {
                    flags.push(`<strong>${_esc(m.name)}</strong>: ${hrc.flag}`);
                }
            });
        });
        if (flags.length) {
            flagList.innerHTML = flags.map(f => `<li>${f}</li>`).join('');
            flagDiv.style.display = 'block';
        } else {
            flagDiv.style.display = 'none';
        }
    }

    // ─── Validation ───────────────────────────────────────────────────────────
    function validate() {
        let valid = true;
        const nkda    = document.getElementById('amc_nkda')?.checked;
        const noMeds  = document.getElementById('amc_no_meds')?.checked;
        const allergyErr = document.getElementById('amc_allergy_error');
        const medErr     = document.getElementById('amc_med_error');

        if (!nkda && allergies.length === 0) {
            if (allergyErr) allergyErr.style.display = 'block';
            valid = false;
        } else {
            if (allergyErr) allergyErr.style.display = 'none';
        }
        if (!noMeds && medications.length === 0) {
            if (medErr) medErr.style.display = 'block';
            valid = false;
        } else {
            if (medErr) medErr.style.display = 'none';
        }
        return valid;
    }

    // ─── Data extraction ──────────────────────────────────────────────────────
    function getData() {
        const nkda   = document.getElementById('amc_nkda')?.checked || false;
        const noMeds = document.getElementById('amc_no_meds')?.checked || false;

        const highRiskFlags = [];
        medications.forEach(m => {
            HIGH_RISK_CLASSES.forEach(hrc => {
                if (hrc.pattern.test(m.name)) highRiskFlags.push({ drug: m.name, flag: hrc.flag });
            });
        });

        return {
            nkda,
            allergies: nkda ? [] : allergies.map(({ id: _id, ...rest }) => rest),
            no_current_medications: noMeds,
            medications: noMeds ? [] : medications.map(({ id: _id, ...rest }) => rest),
            high_risk_flags: highRiskFlags,
        };
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    function _esc(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    return { render, getData, validate, _addAllergy, _removeAllergy, _onNKDA, _addMed, _removeMed, _onNoMeds, _checkHighRisk, _refreshHighRiskFlags };

})();
