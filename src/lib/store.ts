// LocalStorage data layer for portal modules (prototype)

import type { Role } from "@/lib/auth";

export type NewsType = "Announcement" | "Update" | "Reminder";

export type NewsItem = {
  id: string;
  title: string;
  body: string;
  type: NewsType;
  postedAtIso: string;
};

export type SummitInfo = {
  title: string;
  subtitle: string;
  venue: string;
  dateLabel: string;
  notes: string;
};

export type MapInfo = {
  embedUrl: string; // Google Maps embed URL
  notes: string;
};

// Sport is dynamic (admin-manageable). Stored as string.
export type Sport = string;

export type Permissions = {
  // who can edit each module
  settingsEditors: Role[];
  newsEditors: Role[];
  summitEditors: Role[];
  leaderboardEditors: Role[];
  bracketEditors: Role[];
  scheduleEditors: Role[];
  mapEditors: Role[];
};

export type Settings = {
  countdownIso: string; // ISO date/time string
  countdownClosed: boolean;
  permissions: Permissions;
  bracketAutoAdvance: boolean; // if true, winner auto-determined by scores
  sports: Sport[]; // admin-managed list of sports
};

export type ScoreRow = {
  id: string;
  team: string;
  points: number;
  sport: Sport | "Overall"; // Overall score or sport-specific score
};

export type MatchScheduleStatus = "Starting" | "In Game";

export type MatchSchedulePost = {
  id: string;
  sport: Sport;
  title: string; // e.g., "Team A vs Team B"
  location: string;
  timeIso: string; // scheduled time
  status: MatchScheduleStatus;
  postedAtIso: string;
};

export type MatchSide = {
  team: string | null;
  score: number | null;
};

export type Match = {
  id: string;
  a: MatchSide;
  b: MatchSide;
  winner: "a" | "b" | null;
};

export type BracketRound = {
  name: string; // e.g., Quarterfinals
  matches: Match[];
};

export type BracketFormat = "single" | "double";

export type Bracket = {
  id: string;
  sport: Sport;
  name: string;
  format: BracketFormat;
  teams: string[]; // source team list

  // Winners bracket (single-elim structure). Used directly for single-elim.
  rounds: BracketRound[];

  // Double-elim extras (prototype): losers bracket + grand final skeleton.
  losersRounds?: BracketRound[];
  grandFinal?: Match;
};

type Store = {
  settings: Settings;
  news: NewsItem[];
  schedule: MatchSchedulePost[];
  summit: SummitInfo;
  map: MapInfo;
  leaderboard: ScoreRow[];
  brackets: Bracket[];
};

const LS_KEY = "rcess.portal.store.v1";

export function nanoId(): string {
  // stable enough for demo
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function roundName(matchCount: number) {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return "Semifinals";
  if (matchCount === 4) return "Quarterfinals";
  return `Round of ${matchCount * 2}`;
}

function losersRoundName(idx: number) {
  return `Losers Round ${idx + 1}`;
}

export function buildDoubleElimExtras(teams: string[]): { losersRounds: BracketRound[]; grandFinal: Match } {
  const clean = teams.map((t) => t.trim()).filter(Boolean);
  const size = nextPow2(Math.max(2, clean.length));
  const roundsCount = Math.max(1, Math.log2(size));
  const losersRoundsCount = Math.max(0, 2 * (roundsCount - 1));

  const losersRounds: BracketRound[] = [];
  for (let l = 0; l < losersRoundsCount; l++) {
    const matchCount = Math.max(1, Math.floor(size / Math.pow(2, Math.floor(l / 2) + 2)));
    losersRounds.push({
      name: losersRoundName(l),
      matches: Array.from({ length: matchCount }, () => ({
        id: nanoId(),
        a: { team: null, score: null },
        b: { team: null, score: null },
        winner: null,
      })),
    });
  }

  const grandFinal: Match = {
    id: nanoId(),
    a: { team: null, score: null },
    b: { team: null, score: null },
    winner: null,
  };

  return { losersRounds, grandFinal };
}

export function buildSingleElimRounds(teams: string[]): BracketRound[] {
  const clean = teams.map((t) => t.trim()).filter(Boolean);
  const size = nextPow2(Math.max(2, clean.length));
  const padded = clean.concat(Array.from({ length: size - clean.length }, () => ""));

  const firstMatches: Match[] = [];
  for (let i = 0; i < size; i += 2) {
    const aTeam = padded[i] || null;
    const bTeam = padded[i + 1] || null;
    const m: Match = {
      id: nanoId(),
      a: { team: aTeam, score: null },
      b: { team: bTeam, score: null },
      winner: null,
    };
    // Auto-advance byes
    if (aTeam && !bTeam) m.winner = "a";
    if (!aTeam && bTeam) m.winner = "b";
    firstMatches.push(m);
  }

  const rounds: BracketRound[] = [{ name: roundName(firstMatches.length), matches: firstMatches }];

  // Create empty subsequent rounds
  let matchCount = firstMatches.length;
  while (matchCount > 1) {
    matchCount = Math.floor(matchCount / 2);
    rounds.push({
      name: roundName(matchCount),
      matches: Array.from({ length: matchCount }, () => ({
        id: nanoId(),
        a: { team: null, score: null },
        b: { team: null, score: null },
        winner: null,
      })),
    });
  }

  // Seed byes forward
  propagateWinners(rounds);
  return rounds;
}

export function determineWinnerAuto(m: Match): Match["winner"] {
  const a = m.a.score;
  const b = m.b.score;
  if (a == null || b == null) return null;
  if (a === b) return null; // no ties
  return a > b ? "a" : "b";
}

export function propagateWinners(rounds: BracketRound[], mode: "auto" | "manual" = "auto") {
  for (let r = 0; r < rounds.length - 1; r++) {
    const curr = rounds[r];
    const next = rounds[r + 1];
    // clear next round teams; they'll be recomputed from curr winners
    for (const nm of next.matches) {
      nm.a.team = null;
      nm.b.team = null;
      nm.a.score = null;
      nm.b.score = null;
      nm.winner = null;
    }

    curr.matches.forEach((m, idx) => {
      if (mode === "auto") {
        // winner is derived from scores
        const auto = determineWinnerAuto(m);
        m.winner = auto;
      }

      const winnerTeam = m.winner === "a" ? m.a.team : m.winner === "b" ? m.b.team : null;
      const targetMatch = next.matches[Math.floor(idx / 2)];
      const slot = idx % 2 === 0 ? "a" : "b";
      (targetMatch as any)[slot].team = winnerTeam;
      // Auto-advance byes in next round when opponent empty
      if (slot === "b") {
        if (targetMatch.a.team && !targetMatch.b.team) targetMatch.winner = "a";
        if (!targetMatch.a.team && targetMatch.b.team) targetMatch.winner = "b";
      }
    });
  }
}

function defaults(): Store {
  return {
    settings: {
      // Default: Aug 1, 2026 00:00 (Asia/Manila +08)
      countdownIso: "2026-08-01T00:00:00+08:00",
      countdownClosed: false,
      permissions: {
        settingsEditors: ["admin"],
        newsEditors: ["admin"],
        summitEditors: ["admin"],
        leaderboardEditors: ["admin"],
        bracketEditors: ["admin"],
        scheduleEditors: ["admin"],
        mapEditors: ["admin"],
      },
      bracketAutoAdvance: true,
      sports: ["Basketball", "Volleyball", "Badminton", "Chess"],
    },
    news: [
      {
        id: nanoId(),
        title: "RCESS Portal is now live (Limited Access)",
        body: "Registration is limited for school representatives. Attendees can view the countdown and announcements.",
        type: "Announcement",
        postedAtIso: new Date().toISOString(),
      },
    ],
    schedule: [
      {
        id: nanoId(),
        sport: "Basketball",
        title: "Team A vs Team B",
        location: "Main Court",
        timeIso: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        status: "Starting",
        postedAtIso: new Date().toISOString(),
      },
    ],
    summit: {
      title: "Regional Civil Engineering Students Summit",
      subtitle: "Summit Hub",
      venue: "Coming soon",
      dateLabel: "Coming soon",
      notes: "Replace placeholders with official details.",
    },
    map: {
      embedUrl: "",
      notes: "Paste a Google Maps embed URL here.",
    },
    leaderboard: [
      { id: nanoId(), team: "Team Alpha", points: 10, sport: "Overall" },
      { id: nanoId(), team: "Team Bravo", points: 8, sport: "Overall" },
      { id: nanoId(), team: "Team Charlie", points: 6, sport: "Overall" },
    ],
    brackets: [
      {
        id: nanoId(),
        sport: "Basketball",
        name: "Men's Division",
        format: "single",
        teams: ["Team A", "Team B", "Team C", "Team D"],
        rounds: buildSingleElimRounds(["Team A", "Team B", "Team C", "Team D"]),
      },
    ],
  };
}

function migrateStore(parsed: any): Store {
  const d = defaults();

  // Start with defaults then overlay known fields.
  const next: Store = {
    ...d,
    ...parsed,
    settings: {
      ...d.settings,
      ...(parsed?.settings ?? {}),
      permissions: {
        ...d.settings.permissions,
        ...(parsed?.settings?.permissions ?? {}),
        // ensure any new permission arrays exist
        settingsEditors: Array.isArray(parsed?.settings?.permissions?.settingsEditors)
          ? parsed.settings.permissions.settingsEditors
          : d.settings.permissions.settingsEditors,
        newsEditors: Array.isArray(parsed?.settings?.permissions?.newsEditors)
          ? parsed.settings.permissions.newsEditors
          : d.settings.permissions.newsEditors,
        summitEditors: Array.isArray(parsed?.settings?.permissions?.summitEditors)
          ? parsed.settings.permissions.summitEditors
          : d.settings.permissions.summitEditors,
        leaderboardEditors: Array.isArray(parsed?.settings?.permissions?.leaderboardEditors)
          ? parsed.settings.permissions.leaderboardEditors
          : d.settings.permissions.leaderboardEditors,
        bracketEditors: Array.isArray(parsed?.settings?.permissions?.bracketEditors)
          ? parsed.settings.permissions.bracketEditors
          : d.settings.permissions.bracketEditors,
        scheduleEditors: Array.isArray(parsed?.settings?.permissions?.scheduleEditors)
          ? parsed.settings.permissions.scheduleEditors
          : d.settings.permissions.scheduleEditors,
        mapEditors: Array.isArray(parsed?.settings?.permissions?.mapEditors)
          ? parsed.settings.permissions.mapEditors
          : d.settings.permissions.mapEditors,
      },
      bracketAutoAdvance:
        typeof parsed?.settings?.bracketAutoAdvance === "boolean"
          ? parsed.settings.bracketAutoAdvance
          : d.settings.bracketAutoAdvance,
      sports: Array.isArray(parsed?.settings?.sports)
        ? parsed.settings.sports.map((s: any) => String(s)).filter(Boolean)
        : d.settings.sports,
    },
    news: Array.isArray(parsed?.news) ? parsed.news : d.news,
    schedule: Array.isArray(parsed?.schedule) ? parsed.schedule : d.schedule,
    summit: parsed?.summit ? { ...d.summit, ...parsed.summit } : d.summit,
    map: parsed?.map ? { ...d.map, ...parsed.map } : d.map,
    leaderboard: Array.isArray(parsed?.leaderboard)
      ? parsed.leaderboard.map((row: any) => ({
          id: String(row?.id ?? nanoId()),
          team: String(row?.team ?? "Team"),
          points: Number.isFinite(Number(row?.points)) ? Number(row.points) : 0,
          sport: String(row?.sport ?? "Overall"),
        }))
      : d.leaderboard,
    brackets: Array.isArray(parsed?.brackets) ? parsed.brackets : d.brackets,
  };

  // Migrate old bracket shape: { entries: [{team,score}...] }
  next.brackets = next.brackets.map((b: any) => {
    const teams: string[] = Array.isArray(b?.teams)
      ? b.teams
      : Array.isArray(b?.entries)
        ? b.entries.map((e: any) => String(e?.team ?? "")).filter(Boolean)
        : [];

    const detectedFormat: any = b?.format ?? (Array.isArray(b?.losersRounds) ? "double" : "single");
    const format = detectedFormat === "double" ? "double" : "single";

    // If already modern shape, just normalize format + ensure double extras exist.
    if (Array.isArray(b?.rounds) && Array.isArray(b?.teams)) {
      const base: Bracket = {
        ...(b as any),
        id: String(b?.id ?? nanoId()),
        sport: (b?.sport as Sport) ?? "Basketball",
        name: String(b?.name ?? "Bracket"),
        format,
        teams,
        rounds: b.rounds,
      };
      if (format === "double") {
        const extras = buildDoubleElimExtras(teams.length ? teams : ["Team A", "Team B"]);
        return {
          ...base,
          losersRounds: Array.isArray((b as any).losersRounds) ? (b as any).losersRounds : extras.losersRounds,
          grandFinal: (b as any).grandFinal ?? extras.grandFinal,
        };
      }
      return base;
    }

    const rounds = buildSingleElimRounds(teams.length ? teams : ["Team A", "Team B"]);
    const extras = buildDoubleElimExtras(teams.length ? teams : ["Team A", "Team B"]);

    return {
      id: String(b?.id ?? nanoId()),
      sport: (b?.sport as Sport) ?? "Basketball",
      name: String(b?.name ?? "Bracket"),
      format,
      teams,
      rounds,
      ...(format === "double" ? { losersRounds: extras.losersRounds, grandFinal: extras.grandFinal } : {}),
    } satisfies Bracket;
  });

  return next;
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      const d = defaults();
      localStorage.setItem(LS_KEY, JSON.stringify(d));
      return d;
    }
    const parsed = JSON.parse(raw);
    const migrated = migrateStore(parsed);
    localStorage.setItem(LS_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    const d = defaults();
    localStorage.setItem(LS_KEY, JSON.stringify(d));
    return d;
  }
}

export function saveStore(next: Store) {
  localStorage.setItem(LS_KEY, JSON.stringify(next));
}
