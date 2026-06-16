import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface VoiceOrbProps {
    /** Normalized volume level, 0..1 */
    level: number;
    /** Whether this participant is the active/loud speaker right now */
    speaking: boolean;
    label: string;
    sublabel: string;
    icon: LucideIcon;
    /** tailwind color family used for the accent, e.g. "violet" or "emerald" */
    accent: "violet" | "emerald";
}

const ACCENTS = {
    violet: {
        core: "from-violet-400 to-indigo-600",
        glow: "139, 92, 246",
        ring: "border-violet-400/40",
        text: "text-violet-300",
        bars: "bg-violet-400",
    },
    emerald: {
        core: "from-emerald-300 to-teal-600",
        glow: "16, 185, 129",
        ring: "border-emerald-400/40",
        text: "text-emerald-300",
        bars: "bg-emerald-400",
    },
} as const;

export function VoiceOrb({ level, speaking, label, sublabel, icon: Icon, accent }: VoiceOrbProps) {
    const a = ACCENTS[accent];
    const clamped = Math.min(1, Math.max(0, level));
    const scale = 1 + clamped * 0.4;
    const glowSize = 16 + clamped * 90;
    const Icon_ = Icon;

    return (
        <div className="flex flex-col items-center gap-5">
            <div className="relative grid h-52 w-52 place-items-center">
                {/* Outer reactive ring */}
                <div
                    className={cn(
                        "absolute inset-0 rounded-full border transition-opacity duration-150",
                        a.ring,
                    )}
                    style={{ transform: `scale(${1 + clamped * 0.25})`, opacity: 0.3 + clamped * 0.5 }}
                />
                {/* Secondary ring */}
                <div
                    className={cn("absolute h-40 w-40 rounded-full border", a.ring)}
                    style={{ transform: `scale(${1 + clamped * 0.15})`, opacity: 0.4 + clamped * 0.4 }}
                />
                {/* Core orb */}
                <div
                    className={cn(
                        "relative grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br text-white transition-transform duration-100",
                        a.core,
                    )}
                    style={{
                        transform: `scale(${scale})`,
                        boxShadow: `0 0 ${glowSize}px rgba(${a.glow}, ${0.35 + clamped * 0.5})`,
                    }}
                >
                    <Icon_ className="size-10" strokeWidth={1.75} />
                </div>
            </div>

            {/* Equalizer bars driven by the volume level */}
            <div className="flex h-6 items-end gap-1">
                {[0.6, 0.85, 1, 0.7, 0.45].map((weight, i) => (
                    <span
                        key={i}
                        className={cn("w-1.5 rounded-full transition-all duration-100", a.bars)}
                        style={{
                            height: `${Math.max(4, clamped * weight * 24)}px`,
                            opacity: speaking ? 1 : 0.25,
                        }}
                    />
                ))}
            </div>

            <div className="text-center">
                <p className={cn("text-sm font-semibold", speaking ? a.text : "text-foreground")}>
                    {label}
                </p>
                <p className="text-xs text-muted-foreground">{speaking ? "Speaking…" : sublabel}</p>
            </div>
        </div>
    );
}
