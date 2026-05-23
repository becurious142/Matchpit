import React from "react";
import { notFound } from "next/navigation";
// Mocked backend service since Next.js cannot import from outside the workspace in production
const SeoContentEngine = {
  generateLocalityPage: async (params: any) => {
    return {
      title: `Play ${params.sport} in ${params.area}, ${params.city}`,
      description: `Find the best venues and matches for ${params.sport} in ${params.area}.`,
      schemaOrg: {},
      venueCount: 5,
      matchCount: 10
    };
  }
};
import { MapPin, Users, Calendar } from "lucide-react";

interface Props {
  params: {
    city: string;
    sport: string;
    area: string;
  };
}

// Next.js 14 ISR Configuration
export const revalidate = 86400; // Revalidate daily (ISR)

export async function generateMetadata({ params }: Props) {
  const data = await SeoContentEngine.generateLocalityPage(params);
  
  if (!data) return { title: "Explore MATCHPIT" };
  
  return {
    title: data.title,
    description: data.description,
  };
}

export default async function ExploreAreaPage({ params }: Props) {
  // Fetch data (runs on server during build/ISR)
  const data = await SeoContentEngine.generateLocalityPage(params);
  
  // If the Quality Gate fails (e.g. < 3 venues), we 404 the page to prevent thin content indexing
  if (!data) {
    notFound();
  }

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 font-sans">
      {/* Inject JSON-LD Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(data.schemaOrg) }}
      />
      
      <div className="mb-12">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-500 mb-4">
          <span className="capitalize">{params.city.replace(/-/g, ' ')}</span>
          <span>&gt;</span>
          <span className="capitalize">{params.sport}</span>
          <span>&gt;</span>
          <span className="text-zinc-900 dark:text-zinc-100 capitalize">{params.area.replace(/-/g, ' ')}</span>
        </div>
        
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-6">
          {data.title.split('|')[0]}
        </h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-3xl">
          {data.description}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-8 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-indigo-100 dark:bg-indigo-800 p-3 rounded-full">
              <MapPin className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
              {data.venueCount} Venues Nearby
            </h2>
          </div>
          <p className="text-indigo-800 dark:text-indigo-300">
            Book top-rated {params.sport} turfs and courts in {params.area.replace(/-/g, ' ')} instantly.
          </p>
          <button className="mt-6 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors">
            View All Venues
          </button>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-8 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-emerald-100 dark:bg-emerald-800 p-3 rounded-full">
              <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
              {data.matchCount} Active Matches
            </h2>
          </div>
          <p className="text-emerald-800 dark:text-emerald-300">
            Looking for players? Join open {params.sport} matches happening right now in {params.area.replace(/-/g, ' ')}.
          </p>
          <button className="mt-6 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors">
            Join a Match
          </button>
        </div>
      </div>
      
      {/* FAQs Section */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-12">
        <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-8">
          Frequently Asked Questions about {params.sport} in {params.area.replace(/-/g, ' ')}
        </h3>
        <div className="space-y-6">
          <div>
            <h4 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">How many {params.sport} venues are in {params.area}?</h4>
            <p className="text-zinc-600 dark:text-zinc-400 mt-2">There are currently {data.venueCount} highly rated venues available for booking.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
