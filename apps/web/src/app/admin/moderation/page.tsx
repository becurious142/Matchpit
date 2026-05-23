import React from "react";
import { AlertTriangle, ShieldAlert, Flag, CheckCircle } from "lucide-react";

export default function AdminModerationDashboard() {
  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-red-600" />
          Moderation Queue
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Review and action escalated community reports, fraud alerts, and toxicity flags.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            <h2 className="text-lg font-bold text-red-900 dark:text-red-100">High Severity</h2>
          </div>
          <div className="text-3xl font-black text-red-700 dark:text-red-300">14</div>
          <p className="text-sm text-red-800/70 dark:text-red-400 mt-1">Requires immediate action</p>
        </div>
        
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-2">
            <Flag className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-bold text-amber-900 dark:text-amber-100">Pending Review</h2>
          </div>
          <div className="text-3xl font-black text-amber-700 dark:text-amber-300">42</div>
          <p className="text-sm text-amber-800/70 dark:text-amber-400 mt-1">Community reports</p>
        </div>

        <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Resolved Today</h2>
          </div>
          <div className="text-3xl font-black text-zinc-700 dark:text-zinc-300">128</div>
          <p className="text-sm text-zinc-500 mt-1">Actions taken by team</p>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Active Escalations</h3>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {/* Mock Rows */}
          {[1, 2, 3].map((row) => (
             <div key={row} className="p-6 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
               <div>
                 <div className="flex items-center gap-3 mb-1">
                   <span className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider">
                     Toxicity
                   </span>
                   <span className="text-sm font-mono text-zinc-500">Report #882{row}</span>
                 </div>
                 <h4 className="text-zinc-900 dark:text-zinc-100 font-medium">Player reported for aggressive behavior in match chat</h4>
                 <p className="text-sm text-zinc-500 mt-1">Reported by 3 distinct users (High Trust Weight)</p>
               </div>
               <div className="flex gap-2 w-full sm:w-auto">
                 <button className="flex-1 sm:flex-none bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                   Review Logs
                 </button>
                 <button className="flex-1 sm:flex-none border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                   Suspend Account
                 </button>
               </div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
}
