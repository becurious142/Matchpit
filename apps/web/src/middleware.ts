import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public routes — no auth required
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/discover(.*)",
  "/venues(.*)",
  "/tournaments(.*)",
  "/clubs(.*)",
  "/teams(.*)",
  "/api/webhook(.*)",
]);

// Owner-only routes
const isOwnerRoute = createRouteMatcher(["/owner(.*)", "/venue-dashboard(.*)"]);

// Admin-only routes
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

// Authenticated-required routes (player app shell)
const isAppRoute = createRouteMatcher([
  "/home(.*)",
  "/matches(.*)",
  "/explore(.*)",
  "/dashboard(.*)",
  "/profile(.*)",
  "/onboarding(.*)",
  "/referrals(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();
  const url = req.nextUrl;

  // Allow all public routes without auth
  if (isPublicRoute(req)) {
    // If signed in and hitting /sign-in or /sign-up, redirect to /home
    if (userId && (url.pathname.startsWith("/sign-in") || url.pathname.startsWith("/sign-up"))) {
      return NextResponse.redirect(new URL("/home", req.url));
    }
    return NextResponse.next();
  }

  // Protect everything else
  if (!userId) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", url.pathname);
    return NextResponse.redirect(signInUrl);
  }

  const role = (sessionClaims?.metadata as { role?: string })?.role ?? "player";
  const onboardingComplete = (sessionClaims?.metadata as { onboardingComplete?: boolean })?.onboardingComplete ?? false;

  // Force onboarding for new users hitting app routes
  if (isAppRoute(req) && !onboardingComplete && !url.pathname.startsWith("/onboarding")) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // Owner route guard
  if (isOwnerRoute(req) && role !== "owner" && role !== "admin") {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  // Admin route guard
  if (isAdminRoute(req) && role !== "admin") {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
