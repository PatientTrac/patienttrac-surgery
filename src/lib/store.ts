import { create } from 'zustand'

export interface AppSession {
  org_id: string
  provider_id: string
  access_token?: string
}

export interface AppContext {
  encounter_id?: string
  patient_id?: string
}

interface RevelaStore {
  session: AppSession | null
  context: AppContext | null
  setSession: (s: AppSession) => void
  setContext:  (c: AppContext)  => void
  clearSession: () => void
}

export const useAppStore = create<RevelaStore>((set) => ({
  session: null,
  context: null,
  setSession:   (s) => set({ session: s }),
  setContext:   (c) => set({ context: c }),
  clearSession: ()  => set({ session: null, context: null }),
}))
