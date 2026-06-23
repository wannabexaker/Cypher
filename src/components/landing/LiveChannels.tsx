"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { Headphones, Pause, Play, Radio, Users } from "lucide-react";
import Image from "next/image";
import { useState, type PointerEvent } from "react";

import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { Button } from "@/components/ui/button";
import { channels, type Channel, type ChannelTone } from "@/lib/mock";
import { cn } from "@/lib/utils";

const toneClasses: Record<ChannelTone, string> = {
  violet: "border-primary/40 bg-primary/15 text-primary-glow",
  magenta: "border-magenta/40 bg-magenta/15 text-magenta",
  cyan: "border-cyan/40 bg-cyan/15 text-cyan",
  gold: "border-gold/40 bg-gold/15 text-gold",
  lime: "border-lime/40 bg-lime/15 text-lime",
};

function ChannelCard({ channel }: { channel: Channel }) {
  const reduceMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(pointerY, [0, 1], [5, -5]), {
    stiffness: 180,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(pointerX, [0, 1], [-5, 5]), {
    stiffness: 180,
    damping: 20,
  });

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (reduceMotion) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width);
    pointerY.set((event.clientY - bounds.top) / bounds.height);
  }

  function handlePointerLeave() {
    pointerX.set(0.5);
    pointerY.set(0.5);
  }

  return (
    <motion.article
      className="group relative overflow-hidden rounded-xl border border-border bg-elevated shadow-panel"
      style={
        reduceMotion
          ? undefined
          : { rotateX, rotateY, transformPerspective: 900, transformStyle: "preserve-3d" }
      }
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      whileHover={reduceMotion ? undefined : { y: -8 }}
      transition={{ duration: 0.25 }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={channel.image}
          alt={`Abstract cover artwork for ${channel.name}`}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--bg-elevated),transparent_62%)]" />
        <span
          className={cn(
            "absolute top-4 left-4 inline-flex min-h-8 items-center rounded-full border px-3 font-mono text-[0.6875rem] font-bold tracking-[0.12em] uppercase",
            toneClasses[channel.tone],
          )}
        >
          {channel.genre}
        </span>
        <span className="absolute top-4 right-4 inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 font-mono text-[0.6875rem] font-bold text-foreground uppercase">
          <span className="size-1.5 rounded-full bg-magenta shadow-glow-magenta motion-safe:animate-pulse-soft" />
          Live
        </span>
        <Button
          type="button"
          variant={playing ? "lime" : "gradient"}
          size="icon"
          className="absolute right-4 bottom-4 rounded-full"
          aria-label={`${playing ? "Pause" : "Play"} ${channel.name} preview`}
          aria-pressed={playing}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? <Pause /> : <Play className="translate-x-px" />}
        </Button>
      </div>

      <div className="p-5 sm:p-6">
        <h3 className="text-xl font-bold text-foreground">{channel.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{channel.tagline}</p>

        <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold",
                toneClasses[channel.tone],
              )}
            >
              {channel.hostInitials}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              Hosted by <strong className="text-foreground">{channel.host}</strong>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3 font-mono text-[0.6875rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Headphones className="size-3.5 text-cyan" aria-hidden="true" />
              {channel.tracks}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5 text-magenta" aria-hidden="true" />
              {channel.votes}
            </span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export function LiveChannels() {
  return (
    <section id="live-channels" className="section-space border-y border-border bg-elevated/40">
      <div className="section-shell">
        <Reveal className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <SectionHeading
            kicker="On air right now"
            title={
              <>
                Live rooms.{" "}
                <span className="text-gradient">Real pressure.</span>
              </>
            }
            description="Fresh drops, open votes, and artists fighting for the next round. These are mock channels for the landing-page preview."
          />
          <div className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-border bg-surface px-4 font-mono text-xs font-bold text-lime uppercase">
            <Radio className="size-4" aria-hidden="true" />
            128 channels live
          </div>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel, index) => (
            <Reveal key={channel.id} delay={(index % 3) * 0.08}>
              <ChannelCard channel={channel} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
