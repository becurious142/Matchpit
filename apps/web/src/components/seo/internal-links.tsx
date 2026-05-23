import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface InternalLinksProps {
  currentCity?: string;
  currentSport?: string;
}

export function InternalLinks({ currentCity, currentSport }: InternalLinksProps) {
  // Static lists for SEO siloing. In a real app, this might come from a CMS.
  const topCities = ["jaipur", "delhi", "gurgaon", "bangalore"];
  const topSports = ["football", "cricket", "badminton", "tennis"];
  const nearbyAreas = ["malviya-nagar", "vaishali-nagar", "mansarovar", "c-scheme"];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 mb-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Other Cities</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {topCities.filter(c => c !== currentCity).map(city => (
              <li key={city}>
                <Link href={`/${city}/${currentSport || 'sports'}-venues`} className="hover:underline">
                  {currentSport ? `${currentSport} in ${city}` : `Sports venues in ${city}`}
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Other Sports in {currentCity || "India"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {topSports.filter(s => s !== currentSport).map(sport => (
              <li key={sport}>
                <Link href={`/${currentCity || 'india'}/${sport}-venues`} className="hover:underline">
                  {sport} in {currentCity || "India"}
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Popular Areas</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {nearbyAreas.map(area => (
              <li key={area}>
                <Link href={`/${currentCity || 'jaipur'}/${area}/${currentSport || 'sports'}`} className="hover:underline">
                  {currentSport || "Sports"} near {area.replace('-', ' ')}
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
