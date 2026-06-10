/**
 * ai-client.js — PatientTracSurg AI Client
 * Wraps all Netlify Function calls. Handles auth, error formatting, and audit logging.
 *
 * HIPAA NOTE: Never include patient name, DOB, MRN, or SSN in AI calls.
 *             Use encounter IDs only. PHI minimization is enforced at the form level
 *             before calling these methods.
 *
 * Required globals (set by host form after encounter load):
 *   window._ptToken      — cross-app JWT for authenticating Netlify Function calls
 *   window._ptProviderId — integer provider_id from encounter, for audit trail
 *
 * Usage:  await AIClient.reviewNote(specialty, formData, token)
 */

(function () {
    'use strict';

    // HTML-escape all AI-provided strings before inserting into innerHTML
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Registry for safe code-apply button binding (avoids onclick string injection)
    let _codeRegistry = [];

    const BASE = '/.netlify/functions';
    const TIMEOUT_MS = 30000;

    // ── Core fetch wrapper ────────────────────────────────────────────────────
    async function callFunction(endpoint, payload, token) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${BASE}/${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            const data = await res.json();
            if (!res.ok) {
                throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.code || 'HTTP_ERROR', status: res.status });
            }
            // Audit log to Supabase (fire-and-forget — never blocks UI)
            logAuditEvent(endpoint, payload, token).catch(() => {});
            return data;
        } catch (err) {
            if (err.name === 'AbortError') throw new Error('AI request timed out. Please try again.');
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    // ── Audit logging ─────────────────────────────────────────────────────────
    async function logAuditEvent(endpoint, payload, token) {
        const supabase = window.supabase;
        if (!supabase) return;
        try {
            await supabase.schema('cr').from('ai_audit_log').insert([{
                function_name: endpoint,
                encounter_id:  payload.encounterId || null,
                specialty:     payload.specialty || null,
                action:        endpoint,
                provider_id:   window._ptProviderId || null,
                timestamp:     new Date().toISOString()
                // Never log payload content (may contain clinical data)
            }]);
        } catch (_) { /* non-critical */ }
    }

    // ── PHI scrubber (belt-and-suspenders) ───────────────────────────────────
    function stripIdentifiers(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        const PHI_KEYS = /patient_name|first_name|last_name|dob|date_of_birth|ssn|mrn|address|phone|email|insurance_id/i;
        const clean = Array.isArray(obj) ? [] : {};
        for (const [k, v] of Object.entries(obj)) {
            if (PHI_KEYS.test(k)) {
                clean[k] = '[REDACTED]';
            } else if (typeof v === 'object') {
                clean[k] = stripIdentifiers(v);
            } else {
                clean[k] = v;
            }
        }
        return clean;
    }

    // ── UI helpers ────────────────────────────────────────────────────────────
    function showAISpinner(buttonEl, loadingText) {
        if (!buttonEl) return;
        buttonEl.dataset.originalText = buttonEl.innerHTML;
        buttonEl.innerHTML = `<span class="ai-spinner"></span> ${loadingText || 'Working…'}`;
        buttonEl.disabled = true;
    }

    function hideAISpinner(buttonEl) {
        if (!buttonEl) return;
        buttonEl.innerHTML = buttonEl.dataset.originalText || buttonEl.innerHTML;
        buttonEl.disabled = false;
    }

    function showAIResult(containerId, html, type) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const colors = { success: '#4ade80', warning: '#f0c040', error: '#f87171', info: '#60a5fa' };
        const color  = colors[type] || colors.info;
        el.style.display = '';
        el.style.border  = `1px solid ${color}40`;
        el.style.background = `rgba(${type === 'error' ? '239,68,68' : type === 'warning' ? '239,180,60' : type === 'success' ? '34,197,94' : '96,165,250'},0.08)`;
        el.innerHTML = html;
    }

    function renderReviewPanel(review) {
        if (!review) return '<p style="opacity:0.6">No review data returned.</p>';
        const score = review.completeness_score ?? '—';
        const grade = review.quality_grade ?? '—';
        const gradeColor = { A: '#4ade80', B: '#86efac', C: '#f0c040', D: '#f97316', F: '#f87171' }[grade] || '#ccc';

        let html = `<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;flex-wrap:wrap;">
            <div style="text-align:center;">
                <div style="font-size:0.7rem;opacity:0.55;text-transform:uppercase;letter-spacing:0.05em;">Completeness</div>
                <div style="font-size:2rem;font-weight:700;color:#c9a96e;">${score}</div>
            </div>
            <div style="text-align:center;">
                <div style="font-size:0.7rem;opacity:0.55;text-transform:uppercase;letter-spacing:0.05em;">Grade</div>
                <div style="font-size:2rem;font-weight:700;color:${gradeColor};">${grade}</div>
            </div>
            <div style="flex:1;font-size:0.85rem;opacity:0.8;">${esc(review.summary)}</div>
        </div>`;

        if (review.quality_flags?.length) {
            html += '<div style="margin-bottom:10px;">';
            review.quality_flags.forEach(f => {
                const fc = f.severity === 'critical' ? '#f87171' : f.severity === 'warning' ? '#f0c040' : '#60a5fa';
                html += `<div style="padding:5px 10px;margin:3px 0;border-left:3px solid ${fc};font-size:0.82rem;"><strong style="color:${fc}">${esc(f.severity).toUpperCase()}</strong> ${esc(f.message)}</div>`;
            });
            html += '</div>';
        }

        if (review.recommendations?.length) {
            html += '<div style="font-size:0.8rem;opacity:0.7;margin-top:8px;"><strong>Recommendations:</strong><ul style="margin:4px 0 0 16px;">';
            review.recommendations.forEach(r => { html += `<li>${esc(r)}</li>`; });
            html += '</ul></div>';
        }
        return html;
    }

    function renderCodesPanel(result) {
        if (!result) return '<p style="opacity:0.6">No coding suggestions returned.</p>';
        _codeRegistry = []; // reset on each render — buttons reference indices into this array
        let html = '';
        if (result.icd10?.length) {
            html += '<div style="margin-bottom:10px;"><div style="font-size:0.75rem;font-weight:700;color:#c9a96e;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">ICD-10-CM Diagnoses</div>';
            result.icd10.slice(0, 5).forEach(c => {
                const pct = Math.round((c.confidence || 0) * 100);
                const idx = _codeRegistry.push({ type: 'icd10', code: c.code, description: c.description }) - 1;
                html += `<div style="display:flex;align-items:baseline;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <code style="color:#c9a96e;font-size:0.9rem;min-width:80px;">${esc(c.code)}</code>
                    <span style="flex:1;font-size:0.83rem;">${esc(c.description)}</span>
                    <span style="font-size:0.75rem;opacity:0.5;">${pct}%</span>
                    <button onclick="AIClient._applyCodeByIdx(${idx},this)" style="background:rgba(201,169,110,0.15);border:1px solid rgba(201,169,110,0.3);color:#c9a96e;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.75rem;">Apply</button>
                </div>`;
            });
            html += '</div>';
        }
        if (result.cpt?.length) {
            html += '<div><div style="font-size:0.75rem;font-weight:700;color:#60a5fa;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">CPT Procedure Codes</div>';
            result.cpt.slice(0, 5).forEach(c => {
                const pct = Math.round((c.confidence || 0) * 100);
                const idx = _codeRegistry.push({ type: 'cpt', code: c.code, description: c.description }) - 1;
                html += `<div style="display:flex;align-items:baseline;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <code style="color:#60a5fa;font-size:0.9rem;min-width:60px;">${esc(c.code)}</code>
                    <span style="flex:1;font-size:0.83rem;">${esc(c.description)}</span>
                    <span style="font-size:0.75rem;opacity:0.5;">${pct}%${c.modifier ? ' ' + esc(c.modifier) : ''}</span>
                    <button onclick="AIClient._applyCodeByIdx(${idx},this)" style="background:rgba(96,165,250,0.15);border:1px solid rgba(96,165,250,0.3);color:#60a5fa;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.75rem;">Apply</button>
                </div>`;
            });
            html += '</div>';
        }
        if (result.coding_notes) {
            html += `<div style="margin-top:8px;font-size:0.78rem;opacity:0.6;font-style:italic;">${esc(result.coding_notes)}</div>`;
        }
        return html || '<p style="opacity:0.6">No codes suggested.</p>';
    }

    function renderDrugPanel(result) {
        if (!result) return '<p style="opacity:0.6">No results returned.</p>';
        let html = '';
        const sevColor = { major: '#f87171', moderate: '#f0c040', minor: '#86efac' };
        if (result.interactions?.length) {
            result.interactions.forEach(i => {
                const c = sevColor[i.severity] || '#ccc';
                html += `<div style="padding:8px 10px;margin:4px 0;border-left:3px solid ${c};background:rgba(255,255,255,0.03);border-radius:0 4px 4px 0;">
                    <div style="display:flex;justify-content:space-between;"><strong style="color:${c};font-size:0.82rem;">${esc(i.severity||'').toUpperCase()}: ${esc(i.drug1)} ↔ ${esc(i.drug2)}</strong></div>
                    <div style="font-size:0.8rem;margin-top:3px;opacity:0.85;">${esc(i.clinical_effect)}</div>
                    <div style="font-size:0.78rem;margin-top:3px;opacity:0.65;"><strong>Mgmt:</strong> ${esc(i.management)}</div>
                </div>`;
            });
        } else {
            html += '<div style="color:#4ade80;font-size:0.85rem;">✅ No significant drug interactions identified.</div>';
        }
        if (result.periop_holds?.length) {
            html += '<div style="margin-top:10px;"><div style="font-size:0.78rem;font-weight:700;color:#f0c040;margin-bottom:6px;">PERIOPERATIVE HOLDS / ADJUSTMENTS</div>';
            result.periop_holds.forEach(h => {
                html += `<div style="font-size:0.81rem;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">• <strong>${esc(h.drug)}</strong>: ${esc(h.recommendation)}</div>`;
            });
            html += '</div>';
        }
        if (result.summary) {
            html += `<div style="margin-top:8px;font-size:0.8rem;opacity:0.7;font-style:italic;">${esc(result.summary)}</div>`;
        }
        return html;
    }

    // ── Code application callback (forms register a handler) ─────────────────
    const codeApplyHandlers = {};

    // ── Global dictation cleanup (attaches to all [data-dictation] textareas) ──
    function initDictationButtons() {
        document.querySelectorAll('textarea[data-dictation], textarea[data-ai-cleanup]').forEach(ta => {
            if (ta.dataset.aiButtonAdded) return;
            ta.dataset.aiButtonAdded = '1';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.innerHTML = '✨ AI Clean';
            btn.title = 'Clean up dictation with AI';
            btn.style.cssText = 'position:absolute;bottom:6px;right:8px;background:rgba(201,169,110,0.15);border:1px solid rgba(201,169,110,0.3);color:#c9a96e;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:0.75rem;z-index:10;';
            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';
            ta.parentNode.insertBefore(wrapper, ta);
            wrapper.appendChild(ta);
            wrapper.appendChild(btn);
            btn.addEventListener('click', async () => {
                const text = ta.value.trim();
                if (!text) return;
                showAISpinner(btn, 'Cleaning…');
                try {
                    const token = window._ptToken || null;
                    const result = await callFunction('ai-dictation-cleanup', { text, clinicalContext: ta.dataset.context || document.title }, token);
                    if (result.cleaned) {
                        ta.value = result.cleaned;
                        ta.dispatchEvent(new Event('input', { bubbles: true }));
                        btn.innerHTML = '✅ Done';
                        setTimeout(() => { btn.innerHTML = '✨ AI Clean'; btn.disabled = false; }, 2000);
                        return;
                    }
                } catch (err) {
                    btn.innerHTML = '❌ Error';
                    setTimeout(() => { btn.innerHTML = '✨ AI Clean'; btn.disabled = false; }, 3000);
                    console.error('Dictation cleanup error:', err.message);
                    return;
                }
                hideAISpinner(btn);
            });
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────
    window.AIClient = {
        // Core AI calls
        reviewNote: (specialty, formData, token) =>
            callFunction('ai-note-review', { specialty, formData: stripIdentifiers(formData) }, token),

        draftNote: (specialty, procedure, section, dataPoints, token) =>
            callFunction('ai-draft-note', { specialty, procedure, section, dataPoints: stripIdentifiers(dataPoints) }, token),

        checkDrugInteractions: (medications, allergies, clinicalContext, token) =>
            callFunction('ai-drug-interactions', { medications, allergies, clinicalContext }, token),

        scoreRisk: (clinicalParams, calculatedScores, specialty, procedureType, token) =>
            callFunction('ai-risk-score', { clinicalParams: stripIdentifiers(clinicalParams), calculatedScores, specialty, procedureType }, token),

        suggestCodes: (description, specialty, findings, procedureType, token) =>
            callFunction('ai-icd-cpt', { description, specialty, findings, procedureType }, token),

        cleanDictation: (text, clinicalContext, token) =>
            callFunction('ai-dictation-cleanup', { text, clinicalContext }, token),

        // Streaming draft — calls the Edge Function at /api/ai-draft-note-stream
        // onChunk(text): called for each token chunk as it arrives
        // onDone():      called when the stream completes
        // onError(err):  called on error; if omitted, the returned promise rejects
        draftNoteStream: async (specialty, procedure, section, dataPoints, token, { onChunk, onDone, onError } = {}) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 60000);
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const res = await fetch('/api/ai-draft-note-stream', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ specialty, procedure, section, dataPoints: stripIdentifiers(dataPoints) }),
                    signal: controller.signal
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw Object.assign(new Error(err.error || `HTTP ${res.status}`), { status: res.status });
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buf = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                    const lines = buf.split('\n');
                    buf = lines.pop();
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') { onDone && onDone(); return; }
                        try {
                            const ev = JSON.parse(data);
                            if (ev.text) onChunk && onChunk(ev.text);
                            if (ev.error) throw new Error(ev.error);
                        } catch (e) { if (e.message !== 'Unexpected end of JSON input') throw e; }
                    }
                }
                onDone && onDone();
            } catch (err) {
                const msg = err.name === 'AbortError' ? 'Draft request timed out.' : err.message;
                if (onError) onError(new Error(msg)); else throw new Error(msg);
            } finally {
                clearTimeout(timer);
            }
        },

        extractRegistry: (formData, registry, encounterId, token) =>
            callFunction('ai-registry-extract', { formData: stripIdentifiers(formData), registry, encounterId }, token),

        // UI helpers (exposed for form use)
        showSpinner: showAISpinner,
        hideSpinner: hideAISpinner,
        showResult:  showAIResult,
        renderReviewPanel,
        renderCodesPanel,
        renderDrugPanel,

        // Code application — forms register: AIClient.onCodeApply(type, handler)
        onCodeApply: (type, handler) => { codeApplyHandlers[type] = handler; },
        applyCode: (type, code, description, btnEl) => {
            if (codeApplyHandlers[type]) {
                codeApplyHandlers[type](code, description);
                if (btnEl) { btnEl.textContent = '✓ Applied'; btnEl.disabled = true; }
            }
        },

        // Safe apply via registry index (onclick embeds only an integer, never AI string data)
        _applyCodeByIdx: (idx, btnEl) => {
            const entry = _codeRegistry[idx];
            if (!entry) return;
            if (codeApplyHandlers[entry.type]) {
                codeApplyHandlers[entry.type](entry.code, entry.description);
                if (btnEl) { btnEl.textContent = '✓ Applied'; btnEl.disabled = true; }
            }
        },

        // Init dictation cleanup on all textareas
        initDictation: initDictationButtons
    };

    // Auto-init dictation buttons on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDictationButtons);
    } else {
        setTimeout(initDictationButtons, 200);
    }

})();
