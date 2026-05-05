import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-extrabold text-primary/20 mb-4 select-none">404</div>
        <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <h1 className="text-3xl font-extrabold uppercase italic tracking-tighter mb-3">
          Page <span className="text-primary">Not Found</span>
        </h1>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button className="font-bold uppercase italic h-12 px-8">
            Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
