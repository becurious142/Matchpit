import { create } from "zustand";

interface UIState {
  isMobileDrawerOpen: boolean;
  isCheckoutOpen: boolean;
  checkoutConfig: {
    matchId?: string;
    venueId?: string;
    amount?: number;
    currency?: string;
    type?: "booking" | "host_commitment" | "match_reserve" | "match_final" | "wallet_topup";
  } | null;
  
  // Actions
  setMobileDrawerOpen: (isOpen: boolean) => void;
  openCheckout: (config: UIState["checkoutConfig"]) => void;
  closeCheckout: () => void;
}

export const useAppUIStore = create<UIState>((set) => ({
  isMobileDrawerOpen: false,
  isCheckoutOpen: false,
  checkoutConfig: null,

  setMobileDrawerOpen: (isOpen) => set({ isMobileDrawerOpen: isOpen }),
  openCheckout: (config) => set({ isCheckoutOpen: true, checkoutConfig: config }),
  closeCheckout: () => set({ isCheckoutOpen: false, checkoutConfig: null }),
}));
