/**
 * AI-Powered Operative Notes Module
 * PatientTracSurg - Reusable AI features for all specialty forms
 * Version 1.0.0
 */

// ============================================
// CONFIGURATION
// ============================================

const AI_CONFIG = {
    autoSaveDelay: 3000, // 3 seconds
    voiceLanguage: 'en-US',
    maxSuggestions: 4,
    templates: {}
};

// ============================================
// PROCEDURE TEMPLATES BY SPECIALTY
// ============================================

AI_CONFIG.templates.orthopedic = [
    {
        id: 'tka',
        name: 'Total Knee Arthroplasty',
        specialty: 'orthopedic',
        content: `PREOPERATIVE DIAGNOSIS: Osteoarthritis, [right/left] knee

POSTOPERATIVE DIAGNOSIS: Same

PROCEDURE: Total knee arthroplasty, [right/left] knee

SURGEON: [Surgeon Name]
ASSISTANT: [Assistant Name]
ANESTHESIA: General/Spinal

INDICATIONS: The patient is a [age]-year-old [gender] with progressive osteoarthritis of the [right/left] knee with pain refractory to conservative management including NSAIDs, physical therapy, and intra-articular injections. After discussion of risks and benefits, the patient elected to proceed with total knee arthroplasty.

DESCRIPTION OF PROCEDURE:
The patient was brought to the operating room and placed supine on the operating table. After adequate anesthesia was achieved, a timeout was performed confirming correct patient, correct side, and planned procedure.

The [right/left] lower extremity was prepped and draped in standard sterile fashion. A pneumatic tourniquet was applied to the thigh and inflated to [pressure] mmHg. An anterior midline incision was made. Dissection was carried down through subcutaneous tissue. A medial parapatellar arthrotomy was performed. The patella was everted.

Osteophytes were removed from the femur and tibia. Tibial cut was made using an intramedullary guide, removing [X]mm of bone. Femoral cuts were made using [technique], removing [Y]mm of bone.

Trial components were placed with excellent stability in extension and flexion. Final components: [Manufacturer] tibial component size [X], femoral component size [Y], polyethylene insert [Z]mm, all cemented in place.

The tourniquet was deflated. Hemostasis was achieved. The wound was irrigated copiously. Layered closure was performed.

ESTIMATED BLOOD LOSS: [amount]
COMPLICATIONS: None
CONDITION: Stable to PACU`
    },
    {
        id: 'acl',
        name: 'ACL Reconstruction',
        specialty: 'orthopedic',
        content: `PREOPERATIVE DIAGNOSIS: Anterior cruciate ligament tear, [right/left] knee

POSTOPERATIVE DIAGNOSIS: Same

PROCEDURE: Arthroscopic ACL reconstruction, [right/left] knee

SURGEON: [Surgeon Name]
ANESTHESIA: General with femoral nerve block

INDICATIONS: Patient with acute ACL tear confirmed on MRI, desires return to athletic activities.

DESCRIPTION OF PROCEDURE:
After timeout, diagnostic arthroscopy performed through standard portals. ACL tear confirmed. [Patellar tendon/Hamstring/Allograft] graft harvested and prepared.

Femoral and tibial tunnels drilled at anatomic insertion sites. Graft passed and secured with [fixation method] on femoral side and [fixation method] on tibial side. Graft tensioned and tested through range of motion with excellent stability.

ESTIMATED BLOOD LOSS: Minimal
COMPLICATIONS: None
CONDITION: Stable to PACU`
    }
];

AI_CONFIG.templates.ophthalmic = [
    {
        id: 'phaco',
        name: 'Phacoemulsification with IOL',
        specialty: 'ophthalmic',
        content: `PREOPERATIVE DIAGNOSIS: Cataract, [right/left] eye

POSTOPERATIVE DIAGNOSIS: Same

PROCEDURE: Phacoemulsification with intraocular lens implantation, [right/left] eye

ANESTHESIA: Topical with monitored anesthesia care

DESCRIPTION OF PROCEDURE:
After informed consent, the patient was brought to the operating room. Topical anesthesia was administered to the [right/left] eye. A timeout was performed confirming correct patient, correct eye, and planned procedure.

The eye was prepped and draped in sterile fashion. A lid speculum was placed. A clear corneal incision was created at [location]. Viscoelastic was injected into the anterior chamber.

Continuous curvilinear capsulorrhexis was performed. Hydrodissection and hydrodelineation were completed. Phacoemulsification of the nucleus was performed using divide-and-conquer technique. Cortical material was aspirated using irrigation/aspiration.

A [IOL type] intraocular lens, power [X] diopters, was inserted into the capsular bag and found to be well-positioned. Viscoelastic was removed. The wound was hydrated and found to be self-sealing. The eye was dressed with antibiotic ointment and shield.

COMPLICATIONS: None
VISUAL ACUITY: [measurement]
CONDITION: Stable`
    },
    {
        id: 'vitrectomy',
        name: 'Pars Plana Vitrectomy',
        specialty: 'ophthalmic',
        content: `PREOPERATIVE DIAGNOSIS: [Indication], [right/left] eye

POSTOPERATIVE DIAGNOSIS: Same

PROCEDURE: Pars plana vitrectomy, [right/left] eye

ANESTHESIA: Retrobulbar block with monitored anesthesia care

DESCRIPTION OF PROCEDURE:
Standard 3-port pars plana vitrectomy setup performed. Core vitrectomy completed. [Membrane peel/Laser photocoagulation/Gas injection/etc.] performed.

Fluid-air exchange performed. [Gas/Silicone oil] tamponade placed. Sclerotomies closed. Subconjunctival antibiotics and steroids administered.

COMPLICATIONS: None
CONDITION: Stable`
    }
];

AI_CONFIG.templates.cardiac = [
    {
        id: 'diagnostic_cath',
        name: 'Diagnostic Cardiac Catheterization',
        specialty: 'cardiac',
        content: `INDICATIONS: [Chest pain/Abnormal stress test/etc.]

PROCEDURE: Diagnostic cardiac catheterization

ACCESS: [Right/Left] [radial/femoral] artery

MEDICATIONS: Heparin [dose] units IV

PROCEDURE DESCRIPTION:
After timeout, the [right/left] [radial/femoral] artery was accessed using micropuncture technique. A 6F sheath was placed. Selective coronary angiography was performed.

RIGHT CORONARY ARTERY: [findings]
LEFT MAIN: [findings]
LEFT ANTERIOR DESCENDING: [findings]
LEFT CIRCUMFLEX: [findings]

LEFT VENTRICULOGRAPHY: LVEF [X]%, [wall motion findings]

HEMODYNAMICS:
- Aortic pressure: [X/Y] mmHg
- LV pressure: [X/Y] mmHg
- LVEDP: [X] mmHg

IMPRESSION:
1. [Primary findings]

RECOMMENDATIONS:
- [Medical management/PCI/CABG/etc.]

COMPLICATIONS: None`
    },
    {
        id: 'pci',
        name: 'Percutaneous Coronary Intervention',
        specialty: 'cardiac',
        content: `INDICATIONS: [Indication]

PROCEDURE: Percutaneous coronary intervention

ACCESS: [Right/Left] [radial/femoral] artery

LESION TREATED: [Vessel] [location] [% stenosis]

PROCEDURE DESCRIPTION:
After diagnostic angiography showing [findings], decision made to proceed with PCI.

Guide catheter engaged. Lesion crossed with [wire]. Pre-dilatation performed with [balloon size]. [Drug-eluting stent type] [size]mm x [length]mm deployed at [pressure] atmospheres. Post-dilatation performed with [balloon].

Final angiography showed TIMI-3 flow with [X]% residual stenosis and no complications.

HEMODYNAMICS: [measurements]

COMPLICATIONS: None
MEDICATIONS: Aspirin, Plavix loaded

CONDITION: Stable to CCU`
    }
];

AI_CONFIG.templates.endoscopy = [
    {
        id: 'colonoscopy',
        name: 'Colonoscopy',
        specialty: 'endoscopy',
        content: `INDICATIONS: [Screening/Surveillance/Symptoms]

PROCEDURE: Colonoscopy with [polypectomy/biopsy]

SEDATION: Moderate sedation with [medications and doses]

BOWEL PREPARATION: [Adequate/Fair/Poor]

PROCEDURE DESCRIPTION:
Digital rectal examination was normal. The colonoscope was inserted into the rectum and advanced to the cecum, identified by [ileocecal valve/appendiceal orifice]. Cecal intubation time was [X] minutes.

During withdrawal examination:
- CECUM: [findings]
- ASCENDING COLON: [findings]
- TRANSVERSE COLON: [findings]
- DESCENDING COLON: [findings]
- SIGMOID COLON: [findings]
- RECTUM: [findings]

POLYPS/LESIONS:
[Location], [size]mm, [morphology], removed with [cold snare/hot snare/EMR], retrieved for pathology

BIOPSIES: [locations and indications]

IMPRESSION:
1. [Primary findings]

RECOMMENDATIONS:
- Follow-up in [X] years
- [Additional recommendations]

COMPLICATIONS: None
CONDITION: Stable to recovery`
    },
    {
        id: 'egd',
        name: 'Esophagogastroduodenoscopy',
        specialty: 'endoscopy',
        content: `INDICATIONS: [Indication]

PROCEDURE: Esophagogastroduodenoscopy with [biopsy/intervention]

SEDATION: Moderate sedation with [medications]

PROCEDURE DESCRIPTION:
The gastroscope was introduced through the mouth and advanced under direct visualization.

ESOPHAGUS: [findings - Z-line at X cm, mucosa, motility]
STOMACH: [findings - fundus, body, antrum, mucosa]
DUODENUM: [findings - bulb, second portion]

INTERVENTIONS: [Biopsies/CLO test/Polypectomy/etc.]

IMPRESSION:
1. [Primary findings]

RECOMMENDATIONS:
- [H. pylori treatment/PPI/Follow-up/etc.]

COMPLICATIONS: None
CONDITION: Stable to recovery`
    }
];

AI_CONFIG.templates.dermatology = [
    {
        id: 'excision',
        name: 'Skin Lesion Excision',
        specialty: 'dermatology',
        content: `PREOPERATIVE DIAGNOSIS: [Lesion type], [location]

POSTOPERATIVE DIAGNOSIS: Same (pending pathology)

PROCEDURE: Excision of skin lesion, [location]

ANESTHESIA: Local anesthesia with lidocaine 1% with epinephrine, [X]mL

INDICATION: [Suspicious for malignancy/Cosmetic/Symptomatic/etc.]

DESCRIPTION OF PROCEDURE:
After timeout, the [location] was prepped with chlorhexidine and draped in sterile fashion. Local anesthesia was administered.

A [size] x [size] cm [shape] lesion was identified. Using a [X]mm margin, an elliptical excision was planned along relaxed skin tension lines. Sharp excision was carried down through the dermis into subcutaneous fat.

The specimen was oriented with a suture at [12 o'clock] position and sent to pathology in formalin.

Hemostasis was achieved with electrocautery. The wound was closed in layers: deep dermal sutures with [suture type], and skin closure with [suture type].

Wound measured [length] cm. Sterile dressing applied.

SPECIMEN: [Description] sent to pathology

ESTIMATED BLOOD LOSS: Minimal
COMPLICATIONS: None

PLAN: Follow-up in [X] days for suture removal and pathology results`
    },
    {
        id: 'mohs',
        name: 'Mohs Micrographic Surgery',
        specialty: 'dermatology',
        content: `PREOPERATIVE DIAGNOSIS: [Basal cell carcinoma/Squamous cell carcinoma], [location]

POSTOPERATIVE DIAGNOSIS: Same

PROCEDURE: Mohs micrographic surgery, [location]

ANESTHESIA: Local anesthesia with lidocaine 1% with epinephrine

DESCRIPTION OF PROCEDURE:
After timeout, the tumor site on the [location] was marked. Local anesthesia was administered.

STAGE 1:
- Debulking performed
- Specimen removed with [X]mm margins
- Specimen mapped and processed
- Frozen sections revealed tumor at [clock positions]

STAGE 2:
- Additional tissue removed from involved margins
- Specimen processed
- Clear margins achieved

Final defect measured [X] x [Y] cm. [Primary closure/Flap/Graft] reconstruction performed.

LAYERS REQUIRED: [number]
FINAL DEFECT SIZE: [X] x [Y] cm
CLOSURE: [method]

COMPLICATIONS: None

PLAN: Follow-up in [X] weeks`
    }
];

// ============================================
// VOICE RECOGNITION
// ============================================

let voiceRecognition = null;
let isRecording = false;

function initializeVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.continuous = true;
        voiceRecognition.interimResults = true;
        voiceRecognition.lang = AI_CONFIG.voiceLanguage;
        
        voiceRecognition.onresult = (event) => {
            let finalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                }
            }
            
            if (finalTranscript) {
                const textarea = document.getElementById('operativeNote') || document.querySelector('[data-ai-note]');
                if (textarea) {
                    textarea.value += finalTranscript;
                    updateWordCount();
                    triggerAutoSave();
                }
            }
        };
        
        voiceRecognition.onerror = (event) => {
            console.error('Voice recognition error:', event.error);
            stopVoiceRecording();
        };
        
        voiceRecognition.onend = () => {
            if (isRecording) {
                voiceRecognition.start(); // Restart if still recording
            }
        };
    }
}

function toggleVoiceRecording() {
    if (!voiceRecognition) {
        alert('Voice recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
        return;
    }
    
    if (isRecording) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

function startVoiceRecording() {
    voiceRecognition.start();
    isRecording = true;
    const btn = document.getElementById('voiceBtn') || document.querySelector('[data-ai-voice-btn]');
    if (btn) {
        btn.classList.add('recording');
        btn.textContent = '⏹️';
    }
}

function stopVoiceRecording() {
    if (voiceRecognition && isRecording) {
        voiceRecognition.stop();
    }
    isRecording = false;
    const btn = document.getElementById('voiceBtn') || document.querySelector('[data-ai-voice-btn]');
    if (btn) {
        btn.classList.remove('recording');
        btn.textContent = '🎤';
    }
}

// ============================================
// TEMPLATE MANAGEMENT
// ============================================

function loadTemplates(specialty) {
    const templates = AI_CONFIG.templates[specialty] || [];
    const container = document.getElementById('templateGrid') || document.querySelector('[data-ai-templates]');
    
    if (!container) return;
    
    container.innerHTML = templates.map(template => `
        <div class="template-card" onclick="selectTemplate('${specialty}', '${template.id}')">
            <div class="template-name">${template.name}</div>
            <div class="template-desc">Load ${template.name.toLowerCase()} template</div>
        </div>
    `).join('');
}

function selectTemplate(specialty, templateId) {
    const templates = AI_CONFIG.templates[specialty] || [];
    const template = templates.find(t => t.id === templateId);
    
    if (template) {
        const textarea = document.getElementById('operativeNote') || document.querySelector('[data-ai-note]');
        if (textarea) {
            textarea.value = template.content;
            updateWordCount();
            triggerAutoSave();
        }
        
        const section = document.getElementById('templateSection') || document.querySelector('[data-ai-template-section]');
        if (section) {
            section.style.display = 'none';
        }
    }
}

function toggleTemplateSection() {
    const section = document.getElementById('templateSection') || document.querySelector('[data-ai-template-section]');
    if (section) {
        section.style.display = section.style.display === 'none' ? 'block' : 'none';
    }
}

// ============================================
// AI SUGGESTIONS
// ============================================

async function generateSuggestions() {
    const textarea = document.getElementById('operativeNote') || document.querySelector('[data-ai-note]');
    if (!textarea) return;
    
    const noteText = textarea.value;
    showAILoading();
    
    // Simulate AI processing (in production, call Claude API)
    setTimeout(() => {
        const suggestions = analyzeNote(noteText);
        displaySuggestions(suggestions);
        hideAILoading();
    }, 1500);
}

function analyzeNote(noteText) {
    const suggestions = [];
    const text = noteText.toLowerCase();
    
    // Check for common missing elements
    if (!text.includes('preoperative diagnosis')) {
        suggestions.push({
            label: 'Missing Element',
            text: 'Consider adding preoperative diagnosis section'
        });
    }
    
    if (!text.includes('timeout')) {
        suggestions.push({
            label: 'Safety Check',
            text: 'Document that timeout was performed confirming correct patient, site, and procedure'
        });
    }
    
    if (!text.includes('blood loss') && !text.includes('ebl')) {
        suggestions.push({
            label: 'Completeness',
            text: 'Document estimated blood loss for billing and clinical purposes'
        });
    }
    
    if (!text.includes('complications')) {
        suggestions.push({
            label: 'Required Documentation',
            text: 'State complications (or document "None" if no complications occurred)'
        });
    }
    
    // Always add best practice suggestion
    if (suggestions.length < AI_CONFIG.maxSuggestions) {
        suggestions.push({
            label: 'Best Practice',
            text: 'Include specific implant/device lot numbers and sizes for traceability and billing'
        });
    }
    
    return suggestions.slice(0, AI_CONFIG.maxSuggestions);
}

function displaySuggestions(suggestions) {
    const panel = document.getElementById('suggestionsPanel') || document.querySelector('[data-ai-suggestions]');
    const list = document.getElementById('suggestionsList') || document.querySelector('[data-ai-suggestions-list]');
    
    if (!panel || !list) return;
    
    list.innerHTML = suggestions.map((suggestion, index) => `
        <div class="suggestion-item" onclick="applySuggestion(${index})">
            <div class="suggestion-label">${suggestion.label}</div>
            <div class="suggestion-text">${suggestion.text}</div>
        </div>
    `).join('');
    
    panel.style.display = 'block';
    
    // Store suggestions for click handlers
    window._currentSuggestions = suggestions;
}

function applySuggestion(index) {
    const suggestions = window._currentSuggestions || [];
    const suggestion = suggestions[index];
    
    if (suggestion) {
        const textarea = document.getElementById('operativeNote') || document.querySelector('[data-ai-note]');
        if (textarea) {
            textarea.value += '\n\n' + suggestion.text;
            updateWordCount();
            triggerAutoSave();
        }
    }
}

// ============================================
// SMART AUTO-COMPLETE
// ============================================

function autoComplete() {
    const textarea = document.getElementById('operativeNote') || document.querySelector('[data-ai-note]');
    if (!textarea) return;
    
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    
    showAILoading();
    
    setTimeout(() => {
        const completions = {
            'the patient was brought': ' to the operating room and placed in supine position on the operating table. After adequate anesthesia was achieved, a timeout was performed confirming correct patient, correct side, and planned procedure.',
            'estimated blood loss': ': Approximately 150mL',
            'the wound was': ' irrigated copiously with normal saline. Hemostasis was achieved using electrocautery. Layered closure was performed.',
            'complications': ': None\nCONDITION: Stable to PACU',
            'after timeout': ', the surgical site was prepped with chlorhexidine and draped in standard sterile fashion.',
            'layered closure': ' was performed using 2-0 Vicryl for deep layers and 3-0 Monocryl for subcuticular skin closure.',
            'sterile fashion': '. A pneumatic tourniquet was applied. The extremity was exsanguinated and the tourniquet inflated to 250 mmHg.'
        };
        
        let completed = false;
        for (const [trigger, completion] of Object.entries(completions)) {
            if (textBefore.toLowerCase().trim().endsWith(trigger)) {
                textarea.value = textBefore + completion + textAfter;
                textarea.selectionStart = textarea.selectionEnd = textBefore.length + completion.length;
                updateWordCount();
                triggerAutoSave();
                completed = true;
                break;
            }
        }
        
        hideAILoading();
        
        if (!completed) {
            alert('No auto-completion available at cursor position. Try typing common phrases like:\n\n• "The patient was brought"\n• "Estimated blood loss"\n• "The wound was"\n• "Complications"');
        }
    }, 800);
}

// ============================================
// QUALITY CHECKS
// ============================================

const qualityChecks = [
    { id: 'diagnosis', label: 'Preoperative & postoperative diagnosis documented', keywords: ['preoperative diagnosis', 'postoperative diagnosis'] },
    { id: 'procedure', label: 'Procedure name clearly stated', keywords: ['procedure:'] },
    { id: 'surgeon', label: 'Surgeon and assistant names included', keywords: ['surgeon', 'assistant'] },
    { id: 'anesthesia', label: 'Anesthesia type documented', keywords: ['anesthesia'] },
    { id: 'indications', label: 'Indications for procedure stated', keywords: ['indication'] },
    { id: 'timeout', label: 'Timeout performed and documented', keywords: ['timeout'] },
    { id: 'technique', label: 'Surgical technique described in detail', keywords: ['incision', 'dissection', 'technique'], minLength: 300 },
    { id: 'findings', label: 'Operative findings documented', keywords: ['findings'], minLength: 200 },
    { id: 'ebl', label: 'Estimated blood loss documented', keywords: ['blood loss', 'ebl'] },
    { id: 'complications', label: 'Complications documented (or none stated)', keywords: ['complications'] },
    { id: 'condition', label: 'Patient condition at end of case noted', keywords: ['condition', 'stable', 'pacu', 'recovery'] }
];

function runQualityCheck() {
    const textarea = document.getElementById('operativeNote') || document.querySelector('[data-ai-note]');
    if (!textarea) return;
    
    const noteText = textarea.value.toLowerCase();
    const panel = document.getElementById('qualityPanel') || document.querySelector('[data-ai-quality]');
    const container = document.getElementById('qualityChecks') || document.querySelector('[data-ai-quality-list]');
    
    if (!panel || !container) return;
    
    const results = qualityChecks.map(check => {
        let isComplete = false;
        
        if (check.keywords) {
            isComplete = check.keywords.some(keyword => noteText.includes(keyword));
        }
        
        if (isComplete && check.minLength) {
            isComplete = noteText.length >= check.minLength;
        }
        
        return { ...check, isComplete };
    });
    
    const completeCount = results.filter(r => r.isComplete).length;
    const totalCount = results.length;
    const percentage = Math.round((completeCount / totalCount) * 100);
    
    container.innerHTML = `
        <div style="background: rgba(0, 212, 255, 0.1); border: 1px solid var(--cyan); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="color: var(--cyan); font-size: 1.1rem;">Completion Score</strong>
                </div>
                <div style="font-size: 2rem; font-weight: 700; color: ${percentage >= 80 ? 'var(--green)' : percentage >= 60 ? 'var(--orange)' : 'var(--red)'};">
                    ${percentage}%
                </div>
            </div>
            <div style="margin-top: 0.5rem; color: rgba(255, 255, 255, 0.7);">
                ${completeCount} of ${totalCount} required elements documented
            </div>
        </div>
    ` + results.map(check => `
        <div class="check-item">
            <div class="check-icon ${check.isComplete ? 'complete' : 'incomplete'}">
                ${check.isComplete ? '✓' : '!'}
            </div>
            <div class="check-label">${check.label}</div>
        </div>
    `).join('');
    
    panel.style.display = 'block';
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

let autoSaveTimer = null;

function updateWordCount() {
    const textarea = document.getElementById('operativeNote') || document.querySelector('[data-ai-note]');
    const counter = document.getElementById('wordCount') || document.querySelector('[data-ai-word-count]');
    
    if (textarea && counter) {
        const words = textarea.value.trim().split(/\s+/).filter(w => w.length > 0).length;
        counter.textContent = words;
    }
}

function triggerAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        saveDraft(true);
    }, AI_CONFIG.autoSaveDelay);
}

function saveDraft(auto = false) {
    const textarea = document.getElementById('operativeNote') || document.querySelector('[data-ai-note]');
    if (!textarea) return;
    
    const note = textarea.value;
    
    // Save to localStorage
    localStorage.setItem('draftNote_' + window.location.pathname, note);
    
    // Update last saved time
    const timestamp = document.getElementById('lastSaved') || document.querySelector('[data-ai-last-saved]');
    if (timestamp) {
        timestamp.textContent = new Date().toLocaleTimeString();
    }
    
    if (!auto) {
        alert('✅ Draft saved successfully!');
    }
    
    // TODO: Save to Supabase in production
}

function loadDraft() {
    const textarea = document.getElementById('operativeNote') || document.querySelector('[data-ai-note]');
    if (!textarea) return;
    
    const saved = localStorage.getItem('draftNote_' + window.location.pathname);
    if (saved && !textarea.value) {
        textarea.value = saved;
        updateWordCount();
    }
}

function showAILoading() {
    const loading = document.getElementById('aiLoading') || document.querySelector('[data-ai-loading]');
    if (loading) {
        loading.classList.add('active');
    }
}

function hideAILoading() {
    const loading = document.getElementById('aiLoading') || document.querySelector('[data-ai-loading]');
    if (loading) {
        loading.classList.remove('active');
    }
}

// ============================================
// INITIALIZATION
// ============================================

function initializeAIModule(specialty) {
    console.log('Initializing AI Module for:', specialty);
    
    // Initialize voice recognition
    initializeVoiceRecognition();
    
    // Load templates for specialty
    loadTemplates(specialty);
    
    // Load saved draft
    loadDraft();
    
    // Setup textarea event listeners
    const textarea = document.getElementById('operativeNote') || document.querySelector('[data-ai-note]');
    if (textarea) {
        textarea.addEventListener('input', () => {
            updateWordCount();
            triggerAutoSave();
        });
    }
    
    // Initialize word count
    updateWordCount();
    
    console.log('AI Module initialized successfully');
}

// Auto-initialize if specialty is set
if (typeof CURRENT_SPECIALTY !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeAIModule(CURRENT_SPECIALTY);
    });
}
