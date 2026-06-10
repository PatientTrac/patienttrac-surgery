/**
 * ai-icd-cpt — ICD-10-CM diagnosis and CPT procedure code suggestions
 * Model: claude-fable-5
 * PHI policy: procedure descriptions and findings only — no patient identifiers
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

function buildPrompt(description, specialty, findings, procedureType) {
    return `You are a Certified Professional Coder (CPC) AI with expertise in ${specialty} coding.

Suggest the most accurate ICD-10-CM diagnosis codes and CPT procedure codes for the following:

Procedure/encounter description: ${description}
Specialty: ${specialty}
${procedureType ? `Procedure type: ${procedureType}` : ''}
${findings ? `Key clinical findings: ${JSON.stringify(findings)}` : ''}

Instructions:
- Suggest codes in order of specificity and confidence
- For ICD-10: prioritize highest specificity (7th character, laterality, etc.) when data supports it
- For CPT: include the primary procedure code and relevant add-on codes
- Flag any documentation gaps that would prevent optimal coding
- Reference CMS LCD/NCD requirements for high-value procedures
- Include modifier suggestions where applicable (LT/RT, 22, 59, etc.)

Return ONLY a JSON object:
{
  "icd10": [
    {
      "code": "<ICD-10-CM code>",
      "description": "<official code description>",
      "confidence": <0.0-1.0>,
      "laterality": "<left|right|bilateral|na>",
      "notes": "<why this code applies or what documentation supports it>"
    }
  ],
  "cpt": [
    {
      "code": "<CPT code>",
      "description": "<CPT code description>",
      "confidence": <0.0-1.0>,
      "type": "<primary|add-on|modifier>",
      "modifier": "<modifier if applicable>",
      "rvu": "<approximate RVU if known>",
      "notes": "<rationale or documentation requirement>"
    }
  ],
  "documentation_gaps": ["<what additional documentation would support higher-specificity coding>"],
  "coding_notes": "<overall coding guidance and any LCD/NCD considerations>",
  "estimated_complexity": "<low|moderate|high>"
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

    const { description, specialty, findings, procedureType } = body;
    if (!description || !specialty) {
        return { statusCode: 400, body: JSON.stringify({ error: 'description and specialty required' }) };
    }

    try {
        const prompt = buildPrompt(description, specialty, findings, procedureType);
        const res = await fetch(ANTHROPIC_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-fable-5',
                max_tokens: 2048,
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
