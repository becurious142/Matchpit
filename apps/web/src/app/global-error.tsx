"use client";

import { Inter } from "next/font/google";
import { Button } from "@/components/ui/button";

const inter = Inter({ subsets: ["latin"] });

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
          <div className="mx-auto max-w-md space-y-6">
            <h1 className="text-4xl font-bold tracking-tight text-destructive">
              Critical System Error
            </h1>
            <p className="text-lg text-muted-foreground">
              A critical error occurred while loading the application. Please try reloading the page.
            </p>
            <Button size="lg" className="w-full" onClick={() => reset()}>
              Reload Application
            </Button>
            <p className="text-sm text-muted-foreground mt-8">
              Error Digest: {error.digest || "Unknown"}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
