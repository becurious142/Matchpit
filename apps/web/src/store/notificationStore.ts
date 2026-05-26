import { create } from "zustand";

interface NotificationState {
  unreadCount: number;
  recentToasts: Array<{ id: string; message: string; type: "info" | "success" | "warning" | "error" }>;
  
  // Actions
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
  decrementUnread: () => void;
  addToast: (toast: { id: string; message: string; type: "info" | "success" | "warning" | "error" }) => void;
  removeToast: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  recentToasts: [],

  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  decrementUnread: () => set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
  addToast: (toast) => set((state) => ({ recentToasts: [...state.recentToasts, toast] })),
  removeToast: (id) => set((state) => ({ recentToasts: state.recentToasts.filter((t) => t.id !== id) })),
}));
