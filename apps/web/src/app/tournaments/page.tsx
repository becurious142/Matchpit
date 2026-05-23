import React from "react";
import { Trophy, Calendar, MapPin, Search } from "lucide-react";

export default function TournamentsHubPage() {
  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Tournaments
          </h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            Compete in local leagues, climb the leaderboards, and win prizes.
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search tournaments..." 
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-black px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Organize
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
        {/* Placeholder Tournament Cards */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col sm:flex-row gap-6 p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <div className="h-32 w-full sm:w-32 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
              <Trophy className="h-12 w-12 text-white" />
            </div>
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Summer Turf Championship</h3>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Registration Open
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm font-medium mb-4">
                  <span className="flex items-center gap-1 text-zinc-500">
                    <MapPin className="h-4 w-4" /> Delhi NCR
                  </span>
                  <span className="flex items-center gap-1 text-zinc-500">
                    <Calendar className="h-4 w-4" /> Aug 15 - Aug 20
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-4 sm:mt-0 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div>
                  <div className="text-xs text-zinc-500">Prize Pool</div>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100">₹50,000</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Format</div>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100">7v7 Knockout</div>
                </div>
                <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                  View Details
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
