import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#050816] relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-primary/[0.04] rounded-full blur-[120px] pointer-events-none" />
      
      {/* Tactical pitch grid */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1
            className="text-4xl font-black uppercase tracking-tighter italic text-white"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            MATCH<span className="text-gradient-lime pr-1">PIT</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground font-semibold">
            Join the community. Find your squad.
          </p>
        </div>

        <div className="flex justify-center">
          <SignUp
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "glass-card border border-white/[0.07] bg-[#0B1020]/80 shadow-2xl rounded-2xl w-full",
                headerTitle: "text-foreground font-bold",
                headerSubtitle: "text-muted-foreground",
                socialButtonsBlockButton: "border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.05] text-foreground text-sm font-semibold transition-colors",
                socialButtonsBlockButtonText: "font-semibold text-foreground",
                dividerLine: "bg-white/[0.1]",
                dividerText: "text-muted-foreground",
                formFieldLabel: "text-foreground/80 font-semibold",
                formFieldInput: "bg-[#050816] border-white/[0.1] focus:border-primary text-foreground placeholder:text-muted-foreground rounded-lg",
                formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 neon-glow font-bold uppercase tracking-wider h-11",
                footerActionText: "text-muted-foreground",
                footerActionLink: "text-primary hover:text-primary/80 font-semibold",
                identityPreviewText: "text-foreground",
                identityPreviewEditButton: "text-primary hover:text-primary/80",
                formFieldSuccessText: "text-primary",
                formFieldErrorText: "text-destructive",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
