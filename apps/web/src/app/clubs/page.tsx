import React from "react";
import { Users, MapPin, Search } from "lucide-react";

export default function ClubsHubPage() {
  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Social Clubs
          </h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            Join local communities, find players, and stay active.
          </p>
        </div>
        <div className="relative w-full md:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Search clubs by city or sport..." 
            className="w-full md:w-80 pl-10 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {/* Placeholder Club Cards */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-6 p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="h-24 w-24 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 flex items-center justify-center flex-shrink-0">
              <Users className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">Jaipur Cricket Community</h3>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-3 line-clamp-2">
                A casual group of cricket enthusiasts playing every weekend across various turfs in Jaipur. Open to all skill levels!
              </p>
              <div className="flex items-center gap-4 text-sm font-medium">
                <span className="flex items-center gap-1 text-zinc-500">
                  <MapPin className="h-4 w-4" /> Jaipur
                </span>
                <span className="flex items-center gap-1 text-zinc-500">
                  <Users className="h-4 w-4" /> 1,240 Members
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
