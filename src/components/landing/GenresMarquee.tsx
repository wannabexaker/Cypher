import { Marquee } from "@/components/motion/Marquee";
import { genres } from "@/lib/landing";

export function GenresMarquee() {
  return (
    <section
      aria-label="Supported music genres"
      className="border-y border-border bg-elevated py-7"
    >
      <Marquee>
        {genres.map((genre) => (
          <span key={genre} className="flex shrink-0 items-center">
            <span className="display-text px-6 text-4xl text-foreground sm:text-5xl">
              {genre}
            </span>
            <span className="text-2xl text-magenta" aria-hidden="true">
              •
            </span>
          </span>
        ))}
      </Marquee>
    </section>
  );
}
