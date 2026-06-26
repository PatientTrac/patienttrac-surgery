// The published @patienttrac/clinical-viewer@0.1.2 bundle ships no type
// declarations, so we declare the surface we consume here.
declare module '@patienttrac/clinical-viewer' {
  import type { ComponentType, ReactNode } from 'react';
  import type { SupabaseClient } from '@supabase/supabase-js';

  export const ClinicalViewerProvider: ComponentType<{
    client: SupabaseClient;
    children?: ReactNode;
  }>;
  export const ClinicalChart: ComponentType<{ patientId: string }>;
  export const LabsPanel: ComponentType<{ patientId: string }>;
}

declare module '@patienttrac/clinical-viewer/styles.css';
