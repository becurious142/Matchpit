import { cn } from "@/lib/utils";

interface LiveDotProps {
  color?: "red" | "green" | "blue";
  size?: "sm" | "md";
  className?: string;
}

const COLOR_MAP: Record<NonNullable<LiveDotProps["color"]>, string> = {
  red:   "bg-[#EF4444]",
  green: "bg-primary",
  blue:  "bg-[#3B82F6]",
};

export function LiveDot({ color = "red", size = "sm", className }: LiveDotProps) {
  return (
    <span
      className={cn(
        "rounded-full animate-live-pulse block shrink-0",
        COLOR_MAP[color],
        size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2",
        className
      )}
    />
  );
}
