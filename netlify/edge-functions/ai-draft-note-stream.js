/**
 * ai-draft-note-stream — Streaming clinical note drafting via SSE
 * Netlify Edge Function (Deno runtime) — supports true token-by-token streaming
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

function errorResponse(status, message) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export default async function handler(request) {
    if (request.method !== 'POST') return errorResponse(405, 'Method not allowed');

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return errorResponse(500, 'API not configured');

    let body;
    try { body = await request.json(); }
    catch { return errorResponse(400, 'Invalid JSON'); }

    const { specialty, procedure, section, dataPoints } = body;
    if (!specialty || !procedure || !section) {
        return errorResponse(400, 'specialty, procedure, and section required');
    }

    // Token validation (non-blocking if Supabase env vars absent in dev)
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (supabaseUrl && supabaseKey) {
        const valid = await validateToken(token, supabaseUrl, supabaseKey);
        if (!valid) return errorResponse(401, 'Unauthorized');
    }

    const prompt = buildPrompt(specialty, procedure, section, dataPoints || {});

    const anthropicRes = await fetch(ANTHROPIC_API, {
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
            stream: true,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!anthropicRes.ok) {
        const err = await anthropicRes.json().catch(() => ({}));
        return errorResponse(502, err.error?.message || 'Model error');
    }

    // Pipe Anthropic SSE → client SSE, forwarding only text deltas
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
        try {
            const reader = anthropicRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop(); // hold incomplete last line

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;
                    try {
                        const event = JSON.parse(data);
                        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
                            await writer.write(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
                        }
                    } catch { /* skip malformed lines */ }
                }
            }
            await writer.write(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
        } finally {
            writer.close();
        }
    })();

    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}
