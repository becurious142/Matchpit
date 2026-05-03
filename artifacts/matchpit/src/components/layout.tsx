import { Link, useLocation } from "wouter";
import { UserButton, useUser, SignInButton, SignUpButton } from "@clerk/react";
import { Bell, Home, MapPin, Trophy, PlusCircle, Activity } from "lucide-react";
import { useListNotifications } from "@workspace/api-client-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useUser();
  const [location] = useLocation();

  const { data: notificationsData } = useListNotifications();
  const unreadCount = isSignedIn ? (notificationsData?.filter(n => !n.isRead).length || 0) : 0;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground pb-16 md:pb-0">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between mx-auto px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-black text-xl">M</div>
            <span className="font-bold text-xl tracking-tight hidden sm:block">MATCHPIT</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/venues" className={`transition-colors hover:text-primary ${location.startsWith('/venues') ? 'text-primary' : 'text-muted-foreground'}`}>Venues</Link>
            <Link href="/matches" className={`transition-colors hover:text-primary ${location.startsWith('/matches') ? 'text-primary' : 'text-muted-foreground'}`}>Matches</Link>
            <Link href="/host" className={`transition-colors hover:text-primary ${location.startsWith('/host') ? 'text-primary' : 'text-muted-foreground'}`}>Host</Link>
            <Link href="/dashboard" className={`transition-colors hover:text-primary ${location.startsWith('/dashboard') ? 'text-primary' : 'text-muted-foreground'}`}>Dashboard</Link>
          </nav>

          <div className="flex items-center gap-4">
            {isSignedIn ? (
              <>
                <Link href="/dashboard/notifications" className="relative text-muted-foreground hover:text-foreground">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <Badge variant="destructive" className="absolute -top-2 -right-2 w-4 h-4 p-0 flex items-center justify-center text-[10px] rounded-full">
                      {unreadCount}
                    </Badge>
                  )}
                </Link>
                <UserButton />
              </>
            ) : (
              <div className="flex gap-2">
                <SignInButton mode="modal">
                  <Button variant="ghost" size="sm">Log in</Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button size="sm">Sign up</Button>
                </SignUpButton>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full border-t border-border/40 bg-background/95 backdrop-blur z-50 flex justify-around items-center p-2 pb-safe">
        <Link href="/" className={`flex flex-col items-center p-2 ${location === '/' ? 'text-primary' : 'text-muted-foreground'}`}>
          <Home className="w-5 h-5 mb-1" />
          <span className="text-[10px] font-medium">Home</span>
        </Link>
        <Link href="/venues" className={`flex flex-col items-center p-2 ${location.startsWith('/venues') ? 'text-primary' : 'text-muted-foreground'}`}>
          <MapPin className="w-5 h-5 mb-1" />
          <span className="text-[10px] font-medium">Venues</span>
        </Link>
        <Link href="/host" className={`flex flex-col items-center p-2 ${location.startsWith('/host') ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className="bg-primary text-black rounded-full p-2 -mt-6 border-4 border-background">
            <PlusCircle className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-medium mt-1">Host</span>
        </Link>
        <Link href="/matches" className={`flex flex-col items-center p-2 ${location.startsWith('/matches') ? 'text-primary' : 'text-muted-foreground'}`}>
          <Trophy className="w-5 h-5 mb-1" />
          <span className="text-[10px] font-medium">Matches</span>
        </Link>
        <Link href="/dashboard" className={`flex flex-col items-center p-2 ${location.startsWith('/dashboard') ? 'text-primary' : 'text-muted-foreground'}`}>
          <Activity className="w-5 h-5 mb-1" />
          <span className="text-[10px] font-medium">Dashboard</span>
        </Link>
      </nav>
    </div>
  );
}
