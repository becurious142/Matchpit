import { useState } from "react";
import { useLocation } from "wouter";
import { useGetMyProfile, useUpdateMyProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, ChevronRight, ChevronLeft, Zap, MapPin, Target, Users, Gift } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
// Only canonical sports supported by the platform
const SPORTS = [
  { id: "cricket",     label: "Cricket",     emoji: "🏏" },
  { id: "football",    label: "Football",    emoji: "⚽" },
  { id: "badminton",   label: "Badminton",   emoji: "🏸" },
  { id: "box_cricket", label: "Box Cricket", emoji: "📦" },
  { id: "pickleball",  label: "Pickleball",  emoji: "🏓" },
];

const JAIPUR_AREAS = [
  "Mansarovar",
  "Vaishali Nagar",
  "Malviya Nagar",
  "Jagatpura",
  "Raja Park",
  "C-Scheme",
  "Tonk Road",
  "Nirman Nagar",
  "Sitapura",
  "Sanganer",
];

const SKILL_LEVELS = [
  { id: "beginner", label: "Beginner", desc: "Just starting out, learning the basics", emoji: "🌱" },
  { id: "intermediate", label: "Intermediate", desc: "Comfortable playing, looking to improve", emoji: "⚡" },
  { id: "advanced", label: "Advanced", desc: "Competitive player, serious about the game", emoji: "🔥" },
  { id: "all_welcome", label: "All Welcome", desc: "Happy to play with anyone regardless of level", emoji: "🤝" },
];

const TOTAL_STEPS = 5;

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < current
              ? "w-6 h-2 bg-primary"
              : i === current
              ? "w-8 h-2 bg-primary"
              : "w-2 h-2 bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Toggle chip ──────────────────────────────────────────────────────────────

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-150 select-none ${
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/60 bg-card/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {selected && <CheckCircle className="w-3.5 h-3.5 shrink-0" />}
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: profile } = useGetMyProfile();
  const updateProfile = useUpdateMyProfile();

  const [step, setStep] = useState(0);
  const [sports, setSports] = useState<string[]>(profile?.favoriteSports ?? []);
  const [areas, setAreas] = useState<string[]>(profile?.preferredAreas ?? []);
  const [skillLevel, setSkillLevel] = useState<string>(profile?.primarySkillLevel ?? "");
  const [saving, setSaving] = useState(false);

  const toggleSport = (id: string) =>
    setSports((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const toggleArea = (area: string) =>
    setAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));

  const canNext = () => {
    if (step === 0) return sports.length > 0;
    if (step === 1) return areas.length > 0;
    if (step === 2) return skillLevel !== "";
    return true;
  };

  const CANONICAL_SPORTS = new Set(["cricket","football","badminton","box_cricket","pickleball"]);

  const handleFinish = async () => {
    setSaving(true);
    try {
      // Sanitize: only save canonical sport slugs
      const canonicalSports = sports.filter((s) => CANONICAL_SPORTS.has(s));
      await updateProfile.mutateAsync({
        data: {
          favoriteSports: canonicalSports,
          preferredAreas: areas,
          primarySkillLevel: skillLevel,
          onboardingComplete: true,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/profile/me"] });
      toast({ title: "Welcome to MATCHPIT! 🎉" });
      setLocation("/dashboard");
    } catch (e: any) {
      toast({ title: e.message ?? "Failed to save profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
            <Zap className="w-3 h-3" /> Setup your profile
          </div>
          <h1 className="text-3xl font-extrabold uppercase italic tracking-tighter">
            Welcome to <span className="text-primary">MATCHPIT</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            Let's personalise your experience in 2 minutes.
          </p>
        </div>

        <StepDots current={step} />

        {/* ── Step 0: Favourite Sports ─────────────────────────────────────── */}
        {step === 0 && (
          <Card className="bg-card/60 border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🏅</span>
                <h2 className="text-xl font-extrabold uppercase italic">Your Sports</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                Pick the sports you love. We'll show you relevant matches and venues.
              </p>
              <div className="flex flex-wrap gap-2">
                {SPORTS.map((s) => (
                  <Chip key={s.id} selected={sports.includes(s.id)} onClick={() => toggleSport(s.id)}>
                    {s.emoji} {s.label}
                  </Chip>
                ))}
              </div>
              {sports.length === 0 && (
                <p className="text-xs text-muted-foreground mt-3">Select at least one sport to continue.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Step 1: Preferred Areas ──────────────────────────────────────── */}
        {step === 1 && (
          <Card className="bg-card/60 border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-extrabold uppercase italic">Your Areas in Jaipur</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                Which areas do you prefer to play in? We'll prioritise nearby venues and matches.
              </p>
              <div className="flex flex-wrap gap-2">
                {JAIPUR_AREAS.map((area) => (
                  <Chip key={area} selected={areas.includes(area)} onClick={() => toggleArea(area)}>
                    {area}
                  </Chip>
                ))}
              </div>
              {areas.length === 0 && (
                <p className="text-xs text-muted-foreground mt-3">Select at least one area to continue.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Skill Level ──────────────────────────────────────────── */}
        {step === 2 && (
          <Card className="bg-card/60 border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-extrabold uppercase italic">Your Skill Level</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                This helps hosts and players know what to expect. You can change this anytime.
              </p>
              <div className="space-y-3">
                {SKILL_LEVELS.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => setSkillLevel(level.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-150 ${
                      skillLevel === level.id
                        ? "border-primary bg-primary/10"
                        : "border-border/60 bg-card/50 hover:border-primary/40"
                    }`}
                  >
                    <span className="text-2xl">{level.emoji}</span>
                    <div className="flex-1">
                      <div className="font-bold text-sm uppercase">{level.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{level.desc}</div>
                    </div>
                    {skillLevel === level.id && (
                      <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Suggested Players / Squads ──────────────────────────── */}
        {step === 3 && (
          <Card className="bg-card/60 border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-extrabold uppercase italic">Find Your Squad</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                Discover players and squads in your area. You can explore and follow them from the Community page.
              </p>
              <div className="space-y-3">
                {[
                  { name: "Mansarovar Strikers", sport: "Cricket", members: 8, area: "Mansarovar" },
                  { name: "Vaishali Warriors", sport: "Football", members: 11, area: "Vaishali Nagar" },
                  { name: "Raja Park Renegades", sport: "Badminton", members: 6, area: "Raja Park" },
                ].map((squad) => (
                  <div key={squad.name} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card/30">
                    <div>
                      <div className="font-bold text-sm">{squad.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {squad.sport} · {squad.area} · {squad.members} members
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] font-bold uppercase h-7 px-3"
                      onClick={() => setLocation("/squads")}
                    >
                      View
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4 text-center">
                You can browse all squads from the Squads page after setup.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Welcome + Wallet + Referral ─────────────────────────── */}
        {step === 4 && (
          <Card className="bg-card/60 border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-extrabold uppercase italic">You're All Set! 🎉</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                Here's what's waiting for you on MATCHPIT.
              </p>
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                  <span className="text-xl">💰</span>
                  <div>
                    <div className="font-bold text-sm">Signup Wallet Bonus</div>
                    <div className="text-xs text-muted-foreground">₹50 credited to your wallet — use it on your first booking.</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border/50">
                  <span className="text-xl">🎁</span>
                  <div>
                    <div className="font-bold text-sm">Referral Code</div>
                    <div className="text-xs text-muted-foreground">
                      Share your code and earn ₹100 for every friend who books their first match.
                    </div>
                    {profile?.referralCode && (
                      <div className="mt-1 font-mono font-bold text-primary text-sm">{profile.referralCode}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border/50">
                  <span className="text-xl">⚽</span>
                  <div>
                    <div className="font-bold text-sm">Matches Near You</div>
                    <div className="text-xs text-muted-foreground">
                      Browse open matches in {areas[0] ?? "your area"} and reserve your spot instantly.
                    </div>
                  </div>
                </div>
              </div>
              <Button
                className="w-full font-bold uppercase text-base h-12"
                disabled={saving}
                onClick={handleFinish}
              >
                {saving ? "Setting up your profile..." : "Enter MATCHPIT →"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Navigation ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="ghost"
            size="sm"
            className="font-bold uppercase text-xs"
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>

          {step < TOTAL_STEPS - 1 ? (
            <Button
              size="sm"
              className="font-bold uppercase text-xs px-6"
              disabled={!canNext()}
              onClick={() => setStep((s) => s + 1)}
            >
              {step === 3 ? "Skip" : "Next"} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
