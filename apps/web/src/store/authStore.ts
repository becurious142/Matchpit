import { create } from "zustand";

type Role = "player" | "owner" | "admin" | null;

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  role: Role;
  onboardingComplete: boolean;
  
  // Actions
  setAuthState: (state: Partial<Omit<AuthState, "setAuthState">>) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoaded: false,
  isSignedIn: false,
  userId: null,
  role: null,
  onboardingComplete: false,

  setAuthState: (state) => set((prev) => ({ ...prev, ...state })),
  clearAuth: () => set({ 
    isLoaded: true, 
    isSignedIn: false, 
    userId: null, 
    role: null, 
    onboardingComplete: false 
  }),
}));
