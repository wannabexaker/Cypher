import { BattleTeaser } from "@/components/landing/BattleTeaser";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";
import { GenresMarquee } from "@/components/landing/GenresMarquee";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LiveChannels } from "@/components/landing/LiveChannels";
import { Navbar } from "@/components/landing/Navbar";

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        <Hero />
        <HowItWorks />
        <LiveChannels />
        <BattleTeaser />
        <GenresMarquee />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
