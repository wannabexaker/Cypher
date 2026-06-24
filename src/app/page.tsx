import { BattleTeaser } from "@/components/landing/BattleTeaser";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";
import { GenresMarquee } from "@/components/landing/GenresMarquee";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LiveChannels } from "@/components/landing/LiveChannels";
import { Navbar } from "@/components/landing/Navbar";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();
  const createChannelHref = user ? "/dashboard" : "/register";

  return (
    <>
      <Navbar user={user ? { username: user.username } : null} />
      <main id="main-content">
        <Hero createChannelHref={createChannelHref} />
        <HowItWorks />
        <LiveChannels />
        <BattleTeaser />
        <GenresMarquee />
        <FinalCta createChannelHref={createChannelHref} />
      </main>
      <Footer />
    </>
  );
}
