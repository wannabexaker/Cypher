import type { Metadata } from "next";

import { LegalList, LegalSection, LegalShell } from "@/components/legal/LegalShell";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Cypher collects, why, how long it is kept, and the choices you have. No advertising or tracking cookies.",
};

const CONTACT = "contact@olamov.com";

export default async function PrivacyPage() {
  const user = await getCurrentUser();

  return (
    <LegalShell
      user={user ? { username: user.username } : null}
      title="Privacy Policy"
      updated="18 July 2026"
      intro="Cypher is a small, self-hosted music-competition app. We collect the minimum needed to run rooms, keep voting honest, and stop abuse. We do not sell your data and we run no advertising or analytics trackers."
    >
      <LegalSection title="Who runs Cypher">
        <p>
          Cypher is operated by Olamov and served from self-hosted infrastructure at{" "}
          <strong className="text-foreground">cypher.olamov.com</strong>. For anything in this
          policy, contact <strong className="text-foreground">{CONTACT}</strong>.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <p>
          <strong className="text-foreground">Host accounts.</strong> If you create an account you
          give us an email address, a username, and a password. Passwords are stored only as an
          Argon2id hash — we never keep the plain text and cannot recover it.
        </p>
        <p>
          <strong className="text-foreground">Guests.</strong> You do not need an account to join a
          room and vote. When you enter a room code we issue a random guest token stored in a cookie
          so we can recognise your membership in that room. The display name you type is saved with
          that membership, and also remembered in your browser so you do not have to retype it.
        </p>
        <p>
          <strong className="text-foreground">Submissions.</strong> Track title, artist name, an
          optional description, and either an audio file you upload or a link you paste to YouTube,
          Spotify, or SoundCloud.
        </p>
        <p>
          <strong className="text-foreground">Votes.</strong> Which track you voted on, whether it
          was a win or a loss, when, and which room and contest it belonged to. Alongside each vote
          we store a <strong className="text-foreground">keyed hash (HMAC)</strong> of your IP
          address and of a device signal. We do{" "}
          <strong className="text-foreground">not</strong> store your raw IP address or a raw device
          fingerprint — the hashes exist only so the same person cannot vote twice.
        </p>
        <p>
          <strong className="text-foreground">Room audit log.</strong> Host and moderator actions
          (approving, disqualifying, removing a member, opening or closing voting) are recorded so a
          room has an accountable history.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>We use only what the app needs to function. There are no advertising or analytics cookies.</p>
        <LegalList>
          <li>
            <strong className="text-foreground">authjs.session-token</strong> — keeps you signed in
            if you have a host account. Essential.
          </li>
          <li>
            <strong className="text-foreground">cypher_guest</strong> — an anonymous random token
            that identifies your membership in a room. Essential for voting to work.
          </li>
          <li>
            <strong className="text-foreground">Your display name</strong> — stored in your
            browser&apos;s local storage as a convenience, never used for tracking.
          </li>
          <li>
            <strong className="text-foreground">Cloudflare Turnstile</strong> may set its own storage
            to run the &ldquo;are you human&rdquo; check.
          </li>
          <li>
            <strong className="text-foreground">Embedded players</strong> (YouTube, Spotify,
            SoundCloud) set their own cookies when you play a track. That is their processing, under
            their policies — not ours.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Keeping voting honest">
        <p>
          Contests only mean something if votes are real, so a few anti-abuse measures run in the
          background:
        </p>
        <LegalList>
          <li>
            <strong className="text-foreground">Cloudflare Turnstile</strong> — a privacy-respecting
            bot check instead of a CAPTCHA.
          </li>
          <li>
            <strong className="text-foreground">A device signal</strong> — computed{" "}
            <em>inside your browser</em> by the open-source FingerprintJS library. Nothing is sent to
            any fingerprinting service; only a hashed value reaches our server.
          </li>
          <li>
            <strong className="text-foreground">Rate limits and per-network vote caps</strong> — so
            one person or script cannot flood a room.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Uploaded audio">
        <p>
          Files you upload are stored in private object storage that is never publicly listable. Each
          upload is scanned for malware before it can be played, and it is served only through
          short-lived signed links (about five minutes) generated for people who are in the room.
          Tracks added as YouTube, Spotify, or SoundCloud links are not stored by us at all — the
          player loads them from that provider.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep things">
        <LegalList>
          <li>
            <strong className="text-foreground">Rooms auto-delete after 15 days without
            activity</strong>, together with their submissions, votes, and uploaded audio. This is
            automatic — please do not treat Cypher as storage for anything you want to keep.
          </li>
          <li>
            Uploads that never get attached to a submission are removed after about 24 hours.
          </li>
          <li>A host can delete their room, and everything in it, at any time from the dashboard.</li>
          <li>Account data is kept until you ask us to delete it.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Who else sees your data">
        <p>
          We do not sell personal data and we do not share it for advertising. The only parties
          involved in delivering the service are:
        </p>
        <LegalList>
          <li>
            <strong className="text-foreground">Cloudflare</strong> — routes traffic to our server
            and provides the Turnstile bot check.
          </li>
          <li>
            <strong className="text-foreground">YouTube, Spotify, SoundCloud</strong> — only when a
            track was added as one of their links and you play it.
          </li>
        </LegalList>
        <p>
          Everything else — the database, the uploaded audio, and the malware scanner — runs on our
          own self-hosted infrastructure. We may disclose data if we are legally required to.
        </p>
      </LegalSection>

      <LegalSection title="Your choices and rights">
        <p>
          You can ask us to access, correct, export, or delete your personal data, or object to how
          we use it. Write to <strong className="text-foreground">{CONTACT}</strong> and we will
          respond within a reasonable time. Hosts can delete a whole room themselves at any moment;
          guests can simply stop using a room and their data disappears with it at the retention
          window.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Traffic is served over HTTPS. Passwords are Argon2id-hashed, IP addresses and device
          signals are stored only as keyed hashes, uploaded media is private and malware-scanned, and
          abuse-prevention controls fail closed — if a protection is unavailable the action is
          refused rather than allowed through. No system is perfect, but we try not to hold data we
          do not need.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          Cypher is not intended for children under 13 (or the minimum age in your country). If you
          believe a child has given us personal data, contact us and we will remove it.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If this policy changes we will update the date at the top of this page. Continuing to use
          Cypher after a change means you accept the updated policy.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
