// API endpoint for billing claim submission
// Add to: patienttrac-scheduling/netlify/functions/submit-claim.ts

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

const ORG_ID = '00000000-0000-0000-0000-000000000001';

export const handler: Handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Source-System, X-Source-Version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    
    // Extract data
    const {
      patient_id,
      provider_id,
      encounter_id,
      cpt_codes,
      icd_codes,
      total_charges,
      encounter_date,
      facility_id,
      claim_data_837p
    } = body;

    // Validate required fields
    if (!patient_id || !cpt_codes || !icd_codes || !total_charges) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['patient_id', 'cpt_codes', 'icd_codes', 'total_charges']
        }),
      };
    }

    // Step 1: Create superbill
    const { data: superbill, error: sbError } = await supabase
      .schema('cr')
      .from('superbill')
      .insert({
        patient_id: parseInt(patient_id),
        provider_id: provider_id || null,
        encounter_id: encounter_id || null,
        org_id: ORG_ID,
        cpt_codes: cpt_codes.map((c: any) => c.code || c),
        icd_codes: icd_codes.map((c: any) => c.code || c),
        total_amount: parseFloat(total_charges),
        billing_status: 'ready',
        insert_date: new Date().toISOString(),
        update_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (sbError) {
      console.error('Superbill creation error:', sbError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to create superbill',
          details: sbError.message
        }),
      };
    }

    // Step 2: Get patient's primary insurance
    const { data: insurance } = await supabase
      .schema('cr')
      .from('patient_insurance')
      .select('insurance_id, insurance_company, member_id')
      .eq('patient_id', patient_id)
      .eq('is_primary', true)
      .eq('is_active', true)
      .maybeSingle();

    const payerName = insurance?.insurance_company || 'Unknown Insurance';

    // Step 3: Create EDI submission
    const { data: ediSubmission, error: ediError } = await supabase
      .schema('cr')
      .from('edi_submissions')
      .insert({
        superbill_id: superbill.superbill_id,
        patient_id: parseInt(patient_id),
        org_id: ORG_ID,
        insurance_id: insurance?.insurance_id || null,
        payer_name: payerName,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        total_charges: parseFloat(total_charges),
        internal_ref: `API-${Date.now()}`,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (ediError) {
      console.error('EDI submission error:', ediError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to create EDI submission',
          details: ediError.message
        }),
      };
    }

    // Step 4: Update superbill status
    await supabase
      .schema('cr')
      .from('superbill')
      .update({
        billing_status: 'submitted',
        update_date: new Date().toISOString(),
      })
      .eq('superbill_id', superbill.superbill_id);

    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        submission_id: ediSubmission.submission_id,
        superbill_id: superbill.superbill_id,
        internal_ref: ediSubmission.internal_ref,
        control_number: ediSubmission.internal_ref,
        payer_name: payerName,
        total_charges: parseFloat(total_charges),
        status: 'submitted',
        message: '837P claim submitted successfully',
        tracking_url: `https://patienttrac-scheduling.netlify.app/billing?submission=${ediSubmission.submission_id}`
      }),
    };

  } catch (error: any) {
    console.error('API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }),
    };
  }
};
