// Shared-service CORS: the surgery site hosts platform functions that the
// sibling PatientTrac apps call cross-origin. Only first-party origins are
// allowed; everything else gets no CORS headers (browser blocks it).
import type { Handler } from '@netlify/functions';

const ALLOWED_ORIGINS = new Set([
  'https://patienttracsurg.com',
  'https://patienttracor.com',
  'https://patienttracforge.com',
  'https://patienttrac-revela.com',
  'https://patienttracmind.com',
  'https://patienttracprofiler.com',
]);

export function withCors(impl: Handler): Handler {
  return async (event, context) => {
    const origin = (event.headers?.origin ?? event.headers?.Origin ?? '') as string;
    const cors: Record<string, string> = ALLOWED_ORIGINS.has(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Vary': 'Origin',
        }
      : {};

    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: cors, body: '' };
    }

    const res = await impl(event, context);
    return { ...res, headers: { ...(res?.headers ?? {}), ...cors } } as any;
  };
}
