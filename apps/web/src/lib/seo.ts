import { Metadata } from "next";

export function generateSeoMetadata(params: {
  title: string;
  description: string;
  url: string;
  image?: string;
}): Metadata {
  return {
    title: params.title,
    description: params.description,
    alternates: {
      canonical: params.url,
    },
    openGraph: {
      title: params.title,
      description: params.description,
      url: params.url,
      siteName: "Matchpit",
      type: "website",
      images: params.image ? [{ url: params.image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: params.title,
      description: params.description,
      images: params.image ? [params.image] : undefined,
    },
  };
}

export function getCitySportSeo(city: string, sport: string) {
  const formattedCity = city.charAt(0).toUpperCase() + city.slice(1);
  const formattedSport = sport.charAt(0).toUpperCase() + sport.slice(1);
  
  return {
    title: `Best ${formattedSport} Turfs & Courts in ${formattedCity} | Matchpit`,
    description: `Discover top-rated ${sport} venues in ${city}. Check real-time availability, read reviews, and book instantly on Matchpit.`,
    h1: `${formattedSport} Venues in ${formattedCity}`,
  };
}
