import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ShareModalProps {
  matchId: string;
  sport: string;
  venueName: string;
  date: string;
  spotsLeft: number;
  reserveFee: number;
  onClose: () => void;
}

export function ShareModal({
  matchId,
  sport,
  venueName,
  date,
  spotsLeft,
  reserveFee,
  onClose,
}: ShareModalProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const matchUrl = `${window.location.origin}/matches/${matchId}`;

  const whatsappText = encodeURIComponent(
    `🏟️ Join my ${sport.toUpperCase()} match!\n` +
    `📍 ${venueName}\n` +
    `📅 ${date}\n` +
    `💰 Reserve for just ₹${reserveFee}\n` +
    `🔥 Only ${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left!\n\n` +
    `👉 ${matchUrl}`
  );

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${whatsappText}`, "_blank");
    onClose();
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(matchUrl);
    setCopied(true);
    toast({ title: "Link copied!", description: "Share the match link with friends." });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full sm:max-w-sm bg-card border border-border rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-2xl font-extrabold uppercase italic tracking-tight mb-1">
          Invite <span className="text-primary">Friends</span>
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} remaining — fill your squad!
        </p>

        <button
          onClick={handleWhatsApp}
          className="w-full flex items-center gap-3 bg-[#25D366] hover:bg-[#1ebe59] text-white font-bold rounded-xl px-5 py-4 mb-3 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current shrink-0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
          Share on WhatsApp
        </button>

        <button
          onClick={handleCopy}
          className="w-full flex items-center gap-3 bg-muted hover:bg-muted/70 font-bold rounded-xl px-5 py-4 mb-4 transition-colors text-sm"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-muted-foreground">
            <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
          </svg>
          {copied ? "Copied!" : "Copy match link"}
        </button>

        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
