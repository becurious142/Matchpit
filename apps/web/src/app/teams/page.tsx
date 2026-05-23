import React from "react";
import { Users, Trophy, Shield, MapPin } from "lucide-react";

export default function TeamsHubPage() {
  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Competitive Teams
          </h1>
          <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
            Build your squad, compete in tournaments, and track your stats.
          </p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Create a Team
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Placeholder Team Cards */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="h-24 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <Shield className="h-12 w-12 text-zinc-400 dark:text-zinc-600" />
            </div>
            <div className="p-6">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">Gurgaon Gladiators</h3>
              <div className="flex items-center gap-2 text-sm text-zinc-500 mb-4">
                <MapPin className="h-4 w-4" /> Gurgaon • Football
              </div>
              <div className="flex justify-between items-center mb-6 text-sm">
                <div className="text-center">
                  <div className="font-bold text-zinc-900 dark:text-zinc-100">14</div>
                  <div className="text-zinc-500">Players</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-zinc-900 dark:text-zinc-100">22</div>
                  <div className="text-zinc-500">Matches</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-emerald-600 dark:text-emerald-400">68%</div>
                  <div className="text-zinc-500">Win Rate</div>
                </div>
              </div>
              <button className="w-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 py-2 rounded-lg font-medium transition-colors">
                Request to Join
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
