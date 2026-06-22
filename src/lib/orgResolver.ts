import { useAppStore } from './store'

/**
 * Securely resolve organization ID from authenticated context.
 *
 * Resolution order:
 * 1. Cross-app session (sessionStore) - most reliable for Mind/Revela
 * 2. URL parameters (cross-app bridge entry point)
 * 3. Development fallback (VITE_ORG_ID env var, DEV mode only)
 * 4. Throw error (production without valid session)
 *
 * @throws {Error} In production if org_id cannot be determined
 * @returns {string} Organization UUID
 *
 * @example
 * ```typescript
 * import { getOrgId } from '@/lib/orgResolver'
 *
 * // In component
 * const orgId = getOrgId()  // Throws if not found
 *
 * // For queries
 * const { data } = await supabase
 *   .from('patient')
 *   .select('*')
 *   .eq('org_id', getOrgId())
 * ```
 */
export function getOrgId(): string {
  // 1. Check cross-app session (most reliable in Mind/Revela)
  const session = useAppStore.getState().session
  if (session?.org_id) {
    return session.org_id
  }

  // 2. Check URL params (cross-app bridge entry point)
  const params = new URLSearchParams(window.location.search)
  const urlOrgId = params.get('org_id')
  if (urlOrgId) {
    return urlOrgId
  }

  // 3. Development fallback (only if DEV mode)
  if (import.meta.env.DEV) {
    const devOrgId = import.meta.env.VITE_ORG_ID
    if (devOrgId) {
      console.warn(
        '[DEV MODE] Using fallback org_id:',
        devOrgId,
        '\nIn production, this would throw an error.'
      )
      return devOrgId
    }
  }

  // 4. Production: fail loudly with helpful message
  throw new Error(
    'Organization ID not found. PatientTrac Mind must be launched from ' +
    'PatientTracForge with a valid cross-app session token. ' +
    'Please close this window and relaunch from the scheduling dashboard.'
  )
}

/**
 * Safe version that returns null instead of throwing.
 * Use for optional org context where failure is acceptable.
 *
 * @returns {string | null} Organization UUID or null if not found
 *
 * @example
 * ```typescript
 * // For analytics or logging where org_id is optional
 * const orgId = tryGetOrgId()
 * if (orgId) {
 *   trackEvent('page_view', { org_id: orgId })
 * }
 * ```
 */
export function tryGetOrgId(): string | null {
  try {
    return getOrgId()
  } catch {
    return null
  }
}

/**
 * Check if we're running in development mode with a dev org.
 * Useful for conditional features or debug UI.
 *
 * @returns {boolean} True if using dev org fallback
 */
export function isDevOrg(): boolean {
  const orgId = tryGetOrgId()
  const devOrgId = import.meta.env.VITE_ORG_ID
  return import.meta.env.DEV && orgId === devOrgId
}

/**
 * Get the dev org ID for test fixtures.
 * Only available in development mode.
 *
 * @throws {Error} In production mode
 * @returns {string} Dev organization UUID
 */
export function getDevOrgId(): string {
  if (!import.meta.env.DEV) {
    throw new Error('getDevOrgId() is only available in development mode')
  }

  const devOrgId = import.meta.env.VITE_ORG_ID
  if (!devOrgId) {
    throw new Error('VITE_ORG_ID environment variable not set')
  }

  return devOrgId
}
