import React from "react";
import { notFound } from "next/navigation";
// Mocked backend service since Next.js cannot import from outside the workspace in production
const PlayerProfileService = {
  getPublicProfile: async (username: string) => {
    return {
      username,
      displayName: username.charAt(0).toUpperCase() + username.slice(1),
      avatarUrl: "",
      reliabilityBadge: "Regular Player",
      matchesPlayed: 12,
      bio: "Sports enthusiast.",
      favoriteSports: ["Football", "Tennis"]
    };
  }
};
import { ShieldCheck, Activity, Users, MapPin } from "lucide-react";

interface Props {
  params: {
    username: string;
  };
}

export default async function PlayerProfilePage({ params }: Props) {
  // In a real RSC implementation, we fetch this directly from the backend
  const profile = await PlayerProfileService.getPublicProfile(params.username);

  if (!profile) {
    notFound();
  }

  // Determine badge styling
  let badgeColor = "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
  if (profile.reliabilityBadge === "Highly Reliable") badgeColor = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800";
  if (profile.reliabilityBadge === "Regular Player") badgeColor = "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800";
  if (profile.reliabilityBadge === "Frequently Cancels") badgeColor = "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800";

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="bg-white dark:bg-zinc-900 shadow-xl rounded-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
        <div className="h-32 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
        <div className="px-8 pb-8 relative">
          <div className="flex justify-between items-end -mt-12 mb-6">
            <div className="h-24 w-24 rounded-full bg-white dark:bg-zinc-900 p-1">
              <div className="h-full w-full rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.displayName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-zinc-400">
                    {profile.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            <div>
              <button className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black px-6 py-2 rounded-full font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
                Add Friend
              </button>
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{profile.displayName}</h1>
            <p className="text-zinc-500 dark:text-zinc-400 font-mono mt-1">@{profile.username}</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 ${badgeColor}`}>
              <ShieldCheck className="h-4 w-4" />
              {profile.reliabilityBadge}
            </div>
            <div className="px-4 py-1.5 rounded-full text-sm font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 flex items-center gap-2">
              <Activity className="h-4 w-4 text-zinc-500" />
              {profile.matchesPlayed} Matches Played
            </div>
          </div>

          {profile.bio && (
            <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">About</h2>
              <p className="text-zinc-600 dark:text-zinc-400">{profile.bio}</p>
            </div>
          )}

          <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Favorite Sports</h2>
            <div className="flex flex-wrap gap-2">
              {profile.favoriteSports.map((sport: string) => (
                <span key={sport} className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium">
                  {sport}
                </span>
              ))}
              {profile.favoriteSports.length === 0 && (
                <p className="text-zinc-500 italic">No favorite sports selected yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
