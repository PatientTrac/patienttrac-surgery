/**
 * ai-draft-note — Generative clinical note drafting
 * Model: claude-fable-5
 * PHI policy: accepts structured clinical data only; never includes patient name/DOB/MRN
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const SECTION_INSTRUCTIONS = {
    operative_technique: 'Write a detailed Operative Technique section in standard surgical dictation style. Include patient positioning, anesthesia type, prep, draping, incision, dissection, key steps, hemostasis, closure layers, and dressing. Use past tense.',
    preop_diagnosis: 'Write a one-line preoperative diagnosis statement.',
    postop_diagnosis: 'Write a postoperative diagnosis statement, referencing intraoperative findings if provided.',
    indications: 'Write an Indications paragraph explaining why surgery was warranted, referencing conservative management attempts and patient consent.',
    findings: 'Write a structured intraoperative findings section.',
    discharge_summary: 'Write a complete hospital course and discharge summary section suitable for the medical record.',
    assessment_plan: 'Write a structured Assessment and Plan with numbered problem list.',
    anesthesia_plan: 'Write an anesthesia plan with rationale for chosen technique.',
    procedure_note: 'Write a complete procedure note in standard format.'
};

function buildPrompt(specialty, procedure, section, dataPoints) {
    const sectionInstruction = SECTION_INSTRUCTIONS[section] || `Write a ${section.replace(/_/g, ' ')} section.`;

    return `You are a clinical documentation assistant helping a ${specialty} physician draft a medical record entry.

${sectionInstruction}

Use the following documented clinical data. Include ONLY information present in the data — do not fabricate clinical details, measurements, or findings not provided.

Procedure/encounter: ${procedure}
Specialty: ${specialty}
Section to draft: ${section}

Documented data:
${JSON.stringify(dataPoints, null, 2)}

Guidelines:
- Use professional medical language and standard medical record format
- Omit any field for which data is not provided (do not insert placeholders like "[X]")
- Use past tense for operative/procedure notes
- Keep the narrative evidence-based and documentation-complete for coding purposes
- Do not include patient name, date of birth, or medical record number

Return ONLY the clinical text for this section, no preamble or explanation.`;
}

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: 'API not configured' }) };
    }

    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { specialty, procedure, section, dataPoints } = body;
    if (!specialty || !procedure || !section) {
        return { statusCode: 400, body: JSON.stringify({ error: 'specialty, procedure, and section required' }) };
    }

    try {
        const prompt = buildPrompt(specialty, procedure, section, dataPoints || {});
        const res = await fetch(ANTHROPIC_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-fable-5',
                max_tokens: 3000,
                temperature: 0.2,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { statusCode: 502, body: JSON.stringify({ error: err.error?.message || 'Model error', code: 'MODEL_ERROR' }) };
        }

        const data = await res.json();
        const draft = data.content?.[0]?.text || '';

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draft, section, model: data.model, usage: data.usage })
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message, code: 'INTERNAL_ERROR' }) };
    }
};
