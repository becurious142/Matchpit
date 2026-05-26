import { create } from "zustand";

interface MatchPresence {
  matchId: string;
  activeViewers: number;
  joinedParticipants: number;
  chatUnreadCount: number;
}

interface MatchPresenceState {
  activeMatches: Record<string, MatchPresence>;
  
  // Actions
  updatePresence: (matchId: string, data: Partial<MatchPresence>) => void;
  clearPresence: (matchId: string) => void;
}

export const useMatchPresenceStore = create<MatchPresenceState>((set) => ({
  activeMatches: {},

  updatePresence: (matchId, data) => set((state) => ({
    activeMatches: {
      ...state.activeMatches,
      [matchId]: {
        ...(state.activeMatches[matchId] || { matchId, activeViewers: 0, joinedParticipants: 0, chatUnreadCount: 0 }),
        ...data,
      }
    }
  })),

  clearPresence: (matchId) => set((state) => {
    const newMatches = { ...state.activeMatches };
    delete newMatches[matchId];
    return { activeMatches: newMatches };
  }),
}));
