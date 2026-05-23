import posthog from 'posthog-js'

export const initPostHog = () => {
  if (typeof window !== 'undefined') {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
      capture_pageview: false, // Disable automatic pageview capture, as we capture manually
      capture_pageleave: true,
    })
  }
}

// Server-side event tracking stub
export const trackServerEvent = async (event: string, properties: any) => {
  if (!process.env.POSTHOG_KEY) return;
  // Node.js implementation would use posthog-node here
  console.log(`[Server Event] ${event}`, properties);
}
