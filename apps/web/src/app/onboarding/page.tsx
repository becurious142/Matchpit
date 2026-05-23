"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight } from "lucide-react";

const SPORTS = ["Football", "Cricket", "Basketball", "Tennis", "Badminton", "Volleyball"];
const TIMINGS = ["Morning (6am - 10am)", "Afternoon (12pm - 4pm)", "Evening (5pm - 9pm)", "Late Night (10pm - 2am)"];
const SKILL_LEVELS = ["Beginner", "Intermediate", "Advanced", "Professional"];

export default function OnboardingPersonalization() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [selectedTimings, setSelectedTimings] = useState<string[]>([]);
  const [skillLevel, setSkillLevel] = useState<string>("");

  const toggleSelection = (item: string, list: string[], setList: (l: string[]) => void) => {
    if (list.includes(item)) {
      setList(list.filter((i) => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleComplete = async () => {
    // In a real app, we'd submit this to our API
    console.log({ selectedSports, selectedTimings, skillLevel });
    // Router transition optimistically
    router.push("/explore");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black font-sans p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-zinc-900 rounded-3xl shadow-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
        
        {/* Progress Bar */}
        <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800">
          <div 
            className="h-full bg-indigo-600 transition-all duration-500 ease-out"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        <div className="p-10 md:p-12">
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
                What do you play?
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400 mb-8">
                Select your favorite sports so we can personalize your MATCHPIT experience.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {SPORTS.map((sport) => {
                  const isSelected = selectedSports.includes(sport);
                  return (
                    <button
                      key={sport}
                      onClick={() => toggleSelection(sport, selectedSports, setSelectedSports)}
                      className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected 
                          ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100" 
                          : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-indigo-300 dark:hover:border-indigo-700"
                      }`}
                    >
                      <span className="font-semibold block">{sport}</span>
                      {isSelected && (
                        <CheckCircle2 className="absolute top-4 right-4 h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
                When do you usually play?
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400 mb-8">
                This helps us recommend matches and venues with open slots at the right time.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TIMINGS.map((time) => {
                  const isSelected = selectedTimings.includes(time);
                  return (
                    <button
                      key={time}
                      onClick={() => toggleSelection(time, selectedTimings, setSelectedTimings)}
                      className={`relative p-5 rounded-xl border-2 text-left transition-all ${
                        isSelected 
                          ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-100" 
                          : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-emerald-300 dark:hover:border-emerald-700"
                      }`}
                    >
                      <span className="font-semibold block">{time}</span>
                      {isSelected && (
                        <CheckCircle2 className="absolute top-1/2 -translate-y-1/2 right-5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
                What's your skill level?
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400 mb-8">
                We use this to ensure balanced matchmaking.
              </p>
              <div className="space-y-3">
                {SKILL_LEVELS.map((level) => {
                  const isSelected = skillLevel === level;
                  return (
                    <button
                      key={level}
                      onClick={() => setSkillLevel(level)}
                      className={`w-full relative p-5 rounded-xl border-2 text-left transition-all ${
                        isSelected 
                          ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100" 
                          : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-indigo-300 dark:hover:border-indigo-700"
                      }`}
                    >
                      <span className="font-semibold block">{level}</span>
                      {isSelected && (
                        <CheckCircle2 className="absolute top-1/2 -translate-y-1/2 right-5 h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-12 flex items-center justify-between">
            <button
              onClick={() => setStep(step > 1 ? step - 1 : 1)}
              disabled={step === 1}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium disabled:opacity-30 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => {
                if (step < 3) setStep(step + 1);
                else handleComplete();
              }}
              disabled={
                (step === 1 && selectedSports.length === 0) ||
                (step === 2 && selectedTimings.length === 0) ||
                (step === 3 && !skillLevel)
              }
              className="flex items-center gap-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black px-8 py-3 rounded-full font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
            >
              {step === 3 ? "Complete Profile" : "Continue"}
              {step < 3 && <ChevronRight className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
