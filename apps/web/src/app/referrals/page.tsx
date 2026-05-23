import React from "react";
import { Copy, Gift, Trophy, Activity } from "lucide-react";

export default function ReferralsDashboard() {
  // In a real app, this would be fetched from the API via React Server Components
  const referralCode = "MATCH24X";
  const pendingRewards = 150.00;
  const earnedCredits = 400.00;
  
  const leaderboard = [
    { rank: 1, name: "Rahul S.", invites: 14, earned: 1400 },
    { rank: 2, name: "Anjali K.", invites: 9, earned: 900 },
    { rank: 3, name: "You", invites: 4, earned: 400 },
  ];

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-4">
          Invite Friends, Earn Credits
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
          Give ₹50, Get ₹100. Share your code with friends. When they complete their first match, you both get MATCHPIT wallet credits!
        </p>
      </div>

      <div className="bg-white dark:bg-zinc-900 shadow-xl rounded-2xl p-8 border border-zinc-200 dark:border-zinc-800 mb-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Your Referral Code
            </label>
            <div className="flex items-center">
              <input
                type="text"
                readOnly
                value={referralCode}
                className="block w-full rounded-l-lg border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-lg font-mono tracking-widest focus:border-indigo-500 focus:ring-indigo-500 sm:text-lg"
              />
              <button
                className="flex items-center justify-center rounded-r-lg bg-indigo-600 px-6 py-3 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-4 w-full md:w-auto mt-6 md:mt-0">
            <div className="flex items-center gap-4 bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
              <div className="bg-emerald-100 dark:bg-emerald-800/50 p-3 rounded-full">
                <Gift className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Earned Credits</p>
                <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">₹{earnedCredits}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-zinc-900 shadow-lg rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2 mb-6">
            <Activity className="h-5 w-5 text-indigo-500" />
            Your Activity
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">Total Invites Sent</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">12</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">Signups</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">6</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-zinc-600 dark:text-zinc-400">Pending Rewards (Waiting for booking)</span>
              <span className="font-semibold text-amber-600 dark:text-amber-500">₹{pendingRewards}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 shadow-lg rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2 mb-6">
            <Trophy className="h-5 w-5 text-amber-500" />
            City Leaderboard
          </h2>
          <div className="space-y-4">
            {leaderboard.map((user) => (
              <div 
                key={user.rank} 
                className={`flex items-center justify-between p-3 rounded-lg ${
                  user.name === "You" 
                    ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30" 
                    : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`font-bold ${
                    user.rank === 1 ? "text-amber-500" :
                    user.rank === 2 ? "text-zinc-400" :
                    user.rank === 3 ? "text-amber-700 dark:text-amber-600" :
                    "text-zinc-500"
                  }`}>
                    #{user.rank}
                  </span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{user.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">₹{user.earned}</p>
                  <p className="text-xs text-zinc-500">{user.invites} invites</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
