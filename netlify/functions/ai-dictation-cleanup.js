/**
 * ai-dictation-cleanup — Medical dictation transcription cleanup
 * Model: claude-haiku-4-5-20251001  (fast, cost-effective for this simple task)
 * PHI policy: text may contain clinical content; do not log; strip before passing
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

function buildPrompt(rawText, clinicalContext) {
    return `You are a medical transcription editor. Clean up the following dictated clinical text.

Rules:
- Fix grammar, punctuation, and sentence structure
- Correct obvious speech-to-text errors (homophones, word boundaries, etc.)
- Expand ambiguous abbreviations only when context makes meaning clear
- Preserve ALL clinical content — never add or remove medical information
- Format as professional clinical prose in present or past tense consistent with the original
- Do not add placeholder brackets like [X] — omit uncertain content rather than guessing
- Do not add headers or formatting not present in the original

${clinicalContext ? `Clinical context (specialty/form type): ${clinicalContext}` : ''}

Dictated text:
${rawText}

Return ONLY the cleaned clinical text, no explanation, no preamble.`;
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

    const { text, clinicalContext } = body;
    if (!text || text.trim().length < 5) {
        return { statusCode: 400, body: JSON.stringify({ error: 'text required (minimum 5 characters)' }) };
    }

    if (text.length > 8000) {
        return { statusCode: 400, body: JSON.stringify({ error: 'text too long (max 8000 characters)' }) };
    }

    try {
        const prompt = buildPrompt(text, clinicalContext);
        const res = await fetch(ANTHROPIC_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 2000,
                temperature: 0.1,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { statusCode: 502, body: JSON.stringify({ error: err.error?.message || 'Model error', code: 'MODEL_ERROR' }) };
        }

        const data = await res.json();
        const cleaned = data.content?.[0]?.text || text;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cleaned, original_length: text.length, cleaned_length: cleaned.length, model: data.model })
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message, code: 'INTERNAL_ERROR' }) };
    }
};
