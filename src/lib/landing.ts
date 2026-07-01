// Static landing-page content. No fake stats, rooms, or users — only honest
// copy that describes how Cypher actually works.

export const steps = [
  {
    number: "01",
    title: "Create a room",
    description:
      "Sign in as a host, name the room, and get a shareable join code in seconds.",
  },
  {
    number: "02",
    title: "Share the code",
    description:
      "Artists and the crowd enter the code to join. Artists submit a track — upload audio or drop a YouTube, Spotify, or SoundCloud link.",
  },
  {
    number: "03",
    title: "Run the contest",
    description:
      "Open a leaderboard or a battle, let the crowd vote, and crown a champion.",
  },
] as const;

export type Mode = {
  name: string;
  tagline: string;
  points: readonly string[];
};

export const modes: readonly Mode[] = [
  {
    name: "Leaderboard",
    tagline: "Every track competes at once.",
    points: [
      "All approved tracks are ranked by their win rate.",
      "Open voting with an optional countdown timer.",
      "Finalize to reveal the podium — gold, silver, bronze.",
    ],
  },
  {
    name: "Battle",
    tagline: "Single-elimination bracket.",
    points: [
      "Top seeds face off head-to-head.",
      "The crowd decides each matchup; winners advance.",
      "The last track standing owns the room.",
    ],
  },
] as const;

// Roles, for the "who does what" guide.
export const guide = [
  {
    role: "For hosts",
    points: [
      "Sign in and create a room — you get a private join code.",
      "Approve the tracks that come in and open a contest.",
      "Start voting (with a timer if you like) and finalize the results.",
      "Run as many contests as you want in the same room.",
    ],
  },
  {
    role: "For the crowd",
    points: [
      "Enter the room's code — no account needed to watch or vote.",
      "Artists submit a track; judges vote win or loss.",
      "Watch the standings update as the crowd decides.",
      "See the champion the moment the host finalizes.",
    ],
  },
] as const;

export const genres = [
  "Rap",
  "Trap",
  "Drill",
  "Boom Bap",
  "Phonk",
  "Grime",
  "Lo-fi",
  "Freestyle",
] as const;

// A schematic bracket used purely to illustrate the battle format.
// These are placeholders (seed labels), not real results.
export type ExampleSlot = { label: string; winner: boolean };

export const exampleBracket = {
  semiFinals: [
    { label: "Seed 1", winner: true },
    { label: "Seed 4", winner: false },
    { label: "Seed 2", winner: false },
    { label: "Seed 3", winner: true },
  ],
  final: [
    { label: "Seed 1", winner: true },
    { label: "Seed 3", winner: false },
  ],
} as const satisfies { semiFinals: ExampleSlot[]; final: ExampleSlot[] };
