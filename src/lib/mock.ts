export type ChannelTone = "violet" | "magenta" | "cyan" | "gold" | "lime";

export type Channel = {
  id: string;
  name: string;
  tagline: string;
  genre: string;
  image: string;
  votes: string;
  tracks: number;
  host: string;
  hostInitials: string;
  tone: ChannelTone;
};

export const liveStats = [
  { value: "128", label: "channels live" },
  { value: "4.2K", label: "tracks dropped" },
  { value: "86K", label: "crowd votes" },
] as const;

export const channels: Channel[] = [
  {
    id: "midnight-frequency",
    name: "Midnight Frequency",
    tagline: "No hooks. Just pressure.",
    genre: "Trap",
    image: "/images/channels/midnight-frequency.webp",
    votes: "12.8K",
    tracks: 24,
    host: "Maya K.",
    hostInitials: "MK",
    tone: "magenta",
  },
  {
    id: "south-side-signal",
    name: "South Side Signal",
    tagline: "Cold beats. Sharp bars.",
    genre: "Drill",
    image: "/images/channels/south-side-signal.webp",
    votes: "9.4K",
    tracks: 16,
    host: "Dre North",
    hostInitials: "DN",
    tone: "cyan",
  },
  {
    id: "vinyl-verdict",
    name: "Vinyl Verdict",
    tagline: "Golden era, new blood.",
    genre: "Boom Bap",
    image: "/images/channels/vinyl-verdict.webp",
    votes: "8.7K",
    tracks: 32,
    host: "Niko Loop",
    hostInitials: "NL",
    tone: "gold",
  },
  {
    id: "after-hours",
    name: "After Hours",
    tagline: "Melodies after midnight.",
    genre: "Melodic Rap",
    image: "/images/channels/midnight-frequency.webp",
    votes: "7.2K",
    tracks: 18,
    host: "Lena V",
    hostInitials: "LV",
    tone: "violet",
  },
  {
    id: "concrete-radio",
    name: "Concrete Radio",
    tagline: "Street transmission live.",
    genre: "Grime",
    image: "/images/channels/south-side-signal.webp",
    votes: "6.1K",
    tracks: 20,
    host: "Saint P",
    hostInitials: "SP",
    tone: "lime",
  },
  {
    id: "sample-kings",
    name: "Sample Kings",
    tagline: "Flip it. Chop it. Win it.",
    genre: "Lo-fi",
    image: "/images/channels/vinyl-verdict.webp",
    votes: "5.8K",
    tracks: 28,
    host: "Aris Wax",
    hostInitials: "AW",
    tone: "magenta",
  },
];

export const steps = [
  {
    number: "01",
    title: "Create the channel",
    description:
      "Set the vibe, name the room, and get a shareable code in seconds.",
  },
  {
    number: "02",
    title: "Share it. Drop tracks.",
    description:
      "Artists enter the code, join the room, and submit their strongest track.",
  },
  {
    number: "03",
    title: "Let the crowd decide",
    description:
      "Votes shape the bracket. Battles narrow the field until one champion remains.",
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

export const bracket = {
  semiFinals: [
    { artist: "KNOX", seed: "01", score: 74, winner: true },
    { artist: "MIRA", seed: "08", score: 51, winner: false },
    { artist: "SAINT", seed: "04", score: 63, winner: false },
    { artist: "VANTA", seed: "05", score: 68, winner: true },
  ],
  final: [
    { artist: "KNOX", seed: "01", score: 82, winner: true },
    { artist: "VANTA", seed: "05", score: 77, winner: false },
  ],
} as const;
