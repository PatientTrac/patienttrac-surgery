/**
 * ai-note-review — Semantic clinical note quality review
 * Model: claude-fable-5
 * PHI policy: accepts only structured clinical data fields, never patient identifiers
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

function buildPrompt(specialty, encounterType, formData) {
    return `You are a clinical documentation quality reviewer for a ${specialty} ${encounterType}.

Review the following structured clinical documentation data for:
1. Clinical completeness — are all required fields present for this encounter type?
2. Guideline compliance — does it meet specialty documentation standards (Joint Commission, CMS, specialty society)?
3. Risk documentation — are VTE, SSI, and anesthesia risks appropriately documented?
4. Coding support — does the documentation support the planned procedure and diagnosis codes?
5. Patient safety — are there any documentation gaps that could affect patient safety?

Clinical data (no patient identifiers):
${JSON.stringify(formData, null, 2)}

Return ONLY a JSON object with this exact structure:
{
  "completeness_score": <integer 0-100>,
  "quality_grade": "<A|B|C|D|F>",
  "missing_required_fields": ["<field_name>"],
  "missing_recommended_fields": ["<field_name>"],
  "quality_flags": [
    {"severity": "<critical|warning|info>", "field": "<field_name>", "message": "<clear clinical message>"}
  ],
  "coding_support": {"adequate": <boolean>, "notes": "<string>"},
  "recommendations": ["<actionable recommendation>"],
  "summary": "<2-sentence overall assessment>"
}`;
}

async function validateToken(token, supabaseUrl, supabaseKey) {
    if (!token || !supabaseUrl || !supabaseKey) return false;
    try {
        const res = await fetch(`${supabaseUrl}/rest/v1/rpc/validate_cross_app_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ token_input: token })
        });
        return res.ok && (await res.json()) === true;
    } catch {
        return false;
    }
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

    const { specialty, encounterType, formData, token } = body;
    if (!specialty || !formData) {
        return { statusCode: 400, body: JSON.stringify({ error: 'specialty and formData required' }) };
    }

    // Token validation (non-blocking in dev if Supabase env vars absent)
    const supabaseUrl  = process.env.SUPABASE_URL;
    const supabaseKey  = process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
        const valid = await validateToken(token, supabaseUrl, supabaseKey);
        if (!valid) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized', code: 'AUTH_ERROR' }) };
        }
    }

    try {
        const prompt = buildPrompt(specialty, encounterType || 'clinical note', formData);
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

        // Extract JSON from response (model may wrap in markdown)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const review = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ review, model: data.model, usage: data.usage })
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message, code: 'INTERNAL_ERROR' }) };
    }
};
