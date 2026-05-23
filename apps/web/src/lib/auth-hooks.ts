import { useUser } from "@clerk/nextjs";

export function useRole() {
  const { user, isLoaded } = useUser();

  const role = (user?.publicMetadata?.role as string) || "player";
  
  return {
    role,
    isLoaded,
    isPlayer: role === "player",
    isVenueOwner: role === "venue_owner",
    isAdmin: role === "admin" || role === "superadmin",
  };
}
