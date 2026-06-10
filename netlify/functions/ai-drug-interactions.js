/**
 * ai-drug-interactions — Clinical Decision Support: drug-drug and drug-allergy alerts
 * Model: claude-fable-5
 * PHI policy: medication names only — no patient identifiers
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

function buildPrompt(medications, allergies, clinicalContext) {
    return `You are a clinical pharmacist AI providing drug interaction screening for a perioperative medication reconciliation.

Check for clinically significant interactions in the following medication list. Focus on:
1. Major and moderate drug-drug interactions (especially perioperative relevance)
2. Drug-allergy cross-reactivity (if allergies provided)
3. Perioperative-specific risks: anticoagulation + procedure, serotonin syndrome risk, QTc prolongation, anesthesia interactions
4. Medications requiring hold/dose adjustment before surgery

Medications: ${medications.join(', ')}
${allergies && allergies.length > 0 ? `Allergies: ${allergies.join(', ')}` : ''}
${clinicalContext ? `Clinical context: ${clinicalContext}` : ''}

Return ONLY a JSON object:
{
  "interactions": [
    {
      "drug1": "<name>",
      "drug2": "<name>",
      "severity": "<major|moderate|minor>",
      "mechanism": "<pharmacodynamic|pharmacokinetic>",
      "clinical_effect": "<what can happen>",
      "perioperative_relevance": "<why this matters for surgery/anesthesia>",
      "management": "<monitoring, dose adjustment, or alternative>"
    }
  ],
  "allergy_alerts": [
    {
      "drug": "<drug name>",
      "allergy": "<allergen>",
      "cross_reactivity": "<explanation>",
      "severity": "<high|moderate|low>"
    }
  ],
  "periop_holds": [
    {
      "drug": "<name>",
      "recommendation": "<hold X days before surgery|adjust dose|continue>",
      "rationale": "<brief reason>"
    }
  ],
  "high_risk_combinations": ["<brief description of combinations needing special monitoring>"],
  "overall_risk": "<low|moderate|high>",
  "summary": "<2-sentence clinical summary>"
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

    const { medications, allergies, clinicalContext } = body;
    if (!medications || !Array.isArray(medications) || medications.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'medications array required' }) };
    }

    try {
        const prompt = buildPrompt(medications, allergies || [], clinicalContext);
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
