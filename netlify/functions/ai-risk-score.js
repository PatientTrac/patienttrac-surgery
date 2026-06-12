/**
 * ai-risk-score — Enhanced perioperative risk prediction beyond standard calculators
 * Model: claude-fable-5
 * PHI policy: anonymized clinical parameters only
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

function buildPrompt(clinicalParams, calculatedScores, specialty, procedureType) {
    return `You are a perioperative medicine AI augmenting standard risk calculators with clinical reasoning.

Standard calculators have already been applied with these results:
${JSON.stringify(calculatedScores, null, 2)}

Clinical parameters (no patient identifiers):
${JSON.stringify(clinicalParams, null, 2)}

Specialty: ${specialty}
Planned procedure: ${procedureType || 'surgical procedure'}

Provide enhanced risk assessment by:
1. Identifying risk factor interactions not captured by individual calculators (e.g., frailty + high-risk surgery + renal impairment together)
2. Flagging specialty-specific risk modifiers (e.g., tourniquet time for orthopedic, contrast volume for cardiac cath)
3. Highlighting any "red flags" that should prompt additional preoperative optimization
4. Recommending specific monitoring or precautions for intraoperative/PACU phases

Return ONLY a JSON object:
{
  "enhanced_risk_level": "<low|moderate|high|very_high>",
  "risk_confidence": "<0.0-1.0>",
  "key_risk_drivers": [
    {"factor": "<name>", "impact": "<high|medium|low>", "modifiable": <boolean>, "rationale": "<brief>"}
  ],
  "risk_interactions": ["<description of factor combinations that compound risk>"],
  "preop_optimization": [
    {"recommendation": "<what to do>", "urgency": "<before_surgery|within_week|routine>", "evidence": "<guideline or rationale>"}
  ],
  "intraop_alerts": ["<specific alerts for anesthesia team>"],
  "pacu_monitoring": ["<enhanced monitoring recommendations>"],
  "red_flags": ["<findings that should prompt case postponement or specialist consult>"],
  "summary": "<2-sentence synthesis beyond what calculators show>"
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

    const { clinicalParams, calculatedScores, specialty, procedureType } = body;
    if (!clinicalParams || !specialty) {
        return { statusCode: 400, body: JSON.stringify({ error: 'clinicalParams and specialty required' }) };
    }

    try {
        const prompt = buildPrompt(clinicalParams, calculatedScores || {}, specialty, procedureType);
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
