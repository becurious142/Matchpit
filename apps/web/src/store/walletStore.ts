import { create } from "zustand";

interface WalletState {
  balance: number;
  pendingDeductions: number;
  razorpayInitialized: boolean;
  
  // Actions
  setBalance: (amount: number) => void;
  addPendingDeduction: (amount: number) => void;
  clearPendingDeductions: () => void;
  setRazorpayInitialized: (status: boolean) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  balance: 0,
  pendingDeductions: 0,
  razorpayInitialized: false,

  setBalance: (amount) => set({ balance: amount }),
  addPendingDeduction: (amount) => set((state) => ({ pendingDeductions: state.pendingDeductions + amount })),
  clearPendingDeductions: () => set({ pendingDeductions: 0 }),
  setRazorpayInitialized: (status) => set({ razorpayInitialized: status }),
}));
