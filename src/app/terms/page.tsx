import type { Metadata } from "next";
import Link from "next/link";

import { LegalList, LegalSection, LegalShell } from "@/components/legal/LegalShell";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules for hosting rooms, submitting tracks, and voting on Cypher, including content ownership and retention.",
};

const CONTACT = "dimos.is.dev@gmail.com";

export default async function TermsPage() {
  const user = await getCurrentUser();

  return (
    <LegalShell
      user={user ? { username: user.username } : null}
      title="Terms of Service"
      updated="18 July 2026"
      intro="These terms cover using Cypher — hosting a room, submitting a track, and voting. Plain language, no traps. By using the service you agree to them."
    >
      <LegalSection title="What Cypher is">
        <p>
          Cypher lets a host create a room with a join code. People enter that code to join. Artists
          submit tracks — an uploaded file or a link to YouTube, Spotify, or SoundCloud — and the
          crowd votes them win or loss. A room can run ranked leaderboards or knockout battles, and
          the host finalizes each contest to crown a champion.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          You need an account to host a room. You do not need one to join a room and vote. Keep your
          credentials to yourself — you are responsible for what happens under your account. Give us
          accurate information, and let us know if you think your account has been compromised.
        </p>
      </LegalSection>

      <LegalSection title="Your content stays yours">
        <p>
          You keep all rights to the tracks, names, and text you submit. You grant us only the narrow
          permission we need to actually run the service: to store your submission, display it inside
          the room it was submitted to, and stream it to the people in that room so they can listen
          and vote. That permission ends when the content is deleted.
        </p>
        <p>
          You must have the rights to whatever you submit. Do not upload music you do not own or have
          permission to use.
        </p>
      </LegalSection>

      <LegalSection title="Rules of use">
        <p>Do not use Cypher to:</p>
        <LegalList>
          <li>Upload content that infringes someone else&apos;s copyright or other rights.</li>
          <li>
            Post anything illegal, hateful, harassing, sexually exploitative, or that targets a
            person or group.
          </li>
          <li>
            <strong className="text-foreground">Manipulate voting</strong> — no bots, scripts,
            multiple identities, or attempts to bypass the anti-fraud checks. Contests only work if
            the votes are real.
          </li>
          <li>Upload malware, or attack, overload, or probe the service.</li>
          <li>Scrape the service or resell access to it.</li>
        </LegalList>
        <p>
          We may remove content, close a room, or suspend an account that breaks these rules — in
          serious cases without warning.
        </p>
      </LegalSection>

      <LegalSection title="If you host a room">
        <p>
          Hosts moderate their own room: approving or disqualifying tracks, removing members, opening
          and closing voting, and finalizing contests. You are responsible for how your room is run
          and for the content you approve in it. Host and moderator actions are recorded in the
          room&apos;s audit log.
        </p>
      </LegalSection>

      <LegalSection title="Contests and results">
        <p>
          Results come from the votes actually cast, using the format the host chose. Hosts control
          when voting opens and closes and break ties where the rules require it. We provide the
          mechanics and the anti-abuse measures; we do not guarantee any particular outcome, and
          results carry no prize or value unless a host separately offers one — which is entirely
          between the host and the participants.
        </p>
      </LegalSection>

      <LegalSection title="Content is deleted automatically">
        <p>
          <strong className="text-foreground">
            A room and everything in it — submissions, uploaded audio, and votes — is deleted
            automatically after 15 days without activity.
          </strong>{" "}
          Hosts can also delete a room at any time. Cypher is a place to run competitions, not a
          backup service: always keep your own copy of anything you care about.
        </p>
      </LegalSection>

      <LegalSection title="Availability">
        <p>
          Cypher is a small, self-hosted project provided free and{" "}
          <strong className="text-foreground">&ldquo;as is&rdquo;</strong>. It may be unavailable,
          change, or be discontinued. We do not promise any uptime, and we may add, alter, or remove
          features at any time.
        </p>
      </LegalSection>

      <LegalSection title="Liability">
        <p>
          To the fullest extent the law allows, we are not liable for indirect or consequential
          losses, lost data, lost content, or lost opportunities arising from your use of Cypher.
          Nothing here limits liability that cannot legally be limited.
        </p>
      </LegalSection>

      <LegalSection title="Ending things">
        <p>
          You can stop using Cypher whenever you like and delete your rooms. We may suspend or end
          access if these terms are broken or if we stop running the service.
        </p>
      </LegalSection>

      <LegalSection title="Changes, law, and contact">
        <p>
          If these terms change we will update the date at the top of this page; continuing to use
          Cypher means you accept the new version. These terms are governed by the laws of Greece.
          Questions go to{" "}
          <a href={`mailto:${CONTACT}`} className="text-primary-glow underline underline-offset-4">
            {CONTACT}
          </a>
          .
        </p>
        <p>
          See also our{" "}
          <Link href="/privacy" className="text-primary-glow underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
