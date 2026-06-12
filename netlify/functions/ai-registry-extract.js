/**
 * ai-registry-extract — Extract structured registry fields from completed forms
 * Supports: STS Adult Cardiac, NCDR CathPCI, ACS NSQIP, MBSAQIP
 * Model: claude-fable-5
 * PHI policy: form data only; registry extract removes identifiers; encounter ID retained
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const REGISTRY_SCHEMAS = {
    sts_cardiac: {
        name: 'STS Adult Cardiac Surgery Database',
        key_fields: ['procedure_type', 'urgency', 'status', 'hemodynamic_instability', 'prior_cardiac_surgery', 'ejection_fraction', 'nyha_class', 'sts_predicted_mortality', 'bypass_time', 'cross_clamp_time', 'complications', 'discharge_status']
    },
    ncdr_cathpci: {
        name: 'NCDR CathPCI Registry',
        key_fields: ['indication', 'presentation', 'heart_failure', 'cardiac_arrest', 'prior_pci', 'prior_cabg', 'vessels_diseased', 'lesion_characteristics', 'stent_type', 'anticoagulation', 'contrast_volume', 'radiation_dose', 'complications', 'door_to_balloon', 'grace_score', 'heart_score']
    },
    acs_nsqip: {
        name: 'ACS NSQIP',
        key_fields: ['procedure_code', 'wound_classification', 'asa_class', 'emergency_case', 'diabetes', 'smoking', 'functional_health_status', 'bmi', 'hypertension', 'operation_time', 'anesthesia_type', 'complications', 'unplanned_readmission', 'unplanned_reoperation', 'mortality']
    },
    mbsaqip: {
        name: 'MBSAQIP (Bariatric Surgery)',
        key_fields: ['procedure_type', 'bmi', 'diabetes', 'hypertension', 'sleep_apnea', 'gerd', 'prior_bariatric', 'conversion', 'operative_time', 'los', 'complications', 'readmission']
    }
};

function buildPrompt(formData, registry, encounterId) {
    const schema = REGISTRY_SCHEMAS[registry] || { name: registry, key_fields: [] };
    return `You are a clinical registry abstractor for ${schema.name}.

Extract the required registry fields from the following completed clinical form data.
Encounter ID (retain for linkage): ${encounterId || 'unknown'}

Form data:
${JSON.stringify(formData, null, 2)}

Instructions:
- Map available form fields to the registry's required data elements
- Use registry-standard terminology and allowed values
- Set fields to null if the data is not present (do not infer or assume values)
- Flag any required fields that are missing from the form (these are documentation gaps)
- Calculate derived fields where the source data is available (e.g., door-to-balloon time from timestamps)

Registry: ${schema.name}
Key fields to extract: ${schema.key_fields.join(', ')}

Return ONLY a JSON object:
{
  "registry": "${registry}",
  "encounter_id": "${encounterId || 'unknown'}",
  "extracted_fields": {
    "<registry_field_name>": "<value or null>"
  },
  "missing_required_fields": ["<field_name>"],
  "data_quality_flags": [
    {"field": "<name>", "issue": "<description>"}
  ],
  "completeness_pct": <0-100>,
  "submission_ready": <boolean>
}`;
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

    const { formData, registry, encounterId } = body;
    if (!formData || !registry) {
        return { statusCode: 400, body: JSON.stringify({ error: 'formData and registry required' }) };
    }

    const validRegistries = Object.keys(REGISTRY_SCHEMAS);
    if (!validRegistries.includes(registry)) {
        return { statusCode: 400, body: JSON.stringify({ error: `registry must be one of: ${validRegistries.join(', ')}` }) };
    }

    try {
        const prompt = buildPrompt(formData, registry, encounterId);
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
                temperature: 0,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { statusCode: 502, body: JSON.stringify({ error: err.error?.message || 'Model error', code: 'MODEL_ERROR' }) };
        }

        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...result, model: data.model, usage: data.usage })
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message, code: 'INTERNAL_ERROR' }) };
    }
};
