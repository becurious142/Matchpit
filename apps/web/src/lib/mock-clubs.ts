export type MockClub = {
  id: string;
  name: string;
  sport: string;
  members: number;
  wins: number;
  color: string;
  initials: string;
  gradient: string;
  verified?: boolean;
  activeMatches?: number;
};

export const MOCK_CLUBS: MockClub[] = [
  {
    id: "1",
    name: "Jaipur Strikers",
    sport: "Football",
    members: 24,
    wins: 12,
    color: "#3B82F6",
    initials: "JS",
    gradient: "from-[#3B82F6] to-[#8B5CF6]",
    verified: true,
    activeMatches: 3,
  },
  {
    id: "2",
    name: "Pink City Cricket",
    sport: "Cricket",
    members: 18,
    wins: 8,
    color: "#F59E0B",
    initials: "PC",
    gradient: "from-[#F59E0B] to-[#EF4444]",
    verified: true,
    activeMatches: 1,
  },
  {
    id: "3",
    name: "Smash Bros",
    sport: "Badminton",
    members: 12,
    wins: 15,
    color: "#8B5CF6",
    initials: "SB",
    gradient: "from-[#8B5CF6] to-[#3B82F6]",
    verified: false,
    activeMatches: 0,
  },
  {
    id: "4",
    name: "Court Kings",
    sport: "Basketball",
    members: 15,
    wins: 6,
    color: "#EF4444",
    initials: "CK",
    gradient: "from-[#EF4444] to-[#F59E0B]",
    verified: false,
    activeMatches: 2,
  },
  {
    id: "5",
    name: "Goal Squad",
    sport: "Football",
    members: 20,
    wins: 9,
    color: "#B6FF3B",
    initials: "GS",
    gradient: "from-[#B6FF3B] to-[#3B82F6]",
    verified: false,
    activeMatches: 1,
  },
];

export function getMockClubById(id: string): MockClub | undefined {
  return MOCK_CLUBS.find((c) => c.id === id);
}
