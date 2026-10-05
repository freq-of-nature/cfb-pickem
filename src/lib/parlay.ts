import { ParlayResult } from '@/types';

// Every leg is priced as a standard spread bet. Nobody enters odds by hand —
// this is just so the tab can show what the group parlay would pay.
export const PARLAY_LEG_PRICE = -110;

function americanToDecimal(price: number): number {
  return price < 0 ? 1 + 100 / Math.abs(price) : 1 + price / 100;
}

function decimalToAmerican(decimal: number): number {
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : -Math.round(100 / (decimal - 1));
}

// Combined American odds for `legCount` legs at -110 each. Pushed legs should be
// excluded by the caller, the same way a book drops them from the ticket.
export function combinedOdds(legCount: number): number | null {
  if (legCount < 1) return null;
  return decimalToAmerican(Math.pow(americanToDecimal(PARLAY_LEG_PRICE), legCount));
}

export function formatAmerican(price: number): string {
  return price > 0 ? `+${price.toLocaleString()}` : price.toLocaleString();
}

export function formatSpread(spreadValue: number): string {
  return spreadValue > 0 ? `+${spreadValue}` : `${spreadValue}`;
}

// Lowercase, strip punctuation, collapse whitespace. Deliberately does NOT drop
// words like "State" — "Ohio" and "Ohio State" are different teams.
export function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface ScoreFeedGame {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
}

export interface ParlayGrade {
  result: ParlayResult;
  opponent: string;
  teamScore: number;
  oppScore: number;
}

interface SideMatch {
  game: ScoreFeedGame;
  pickedSide: string;
  opponent: string;
}

function sidesOf(game: ScoreFeedGame): { side: string; opponent: string }[] {
  return [
    { side: game.home_team, opponent: game.away_team },
    { side: game.away_team, opponent: game.home_team },
  ];
}

// Words that turn one school into a different school. A typed "Ohio" is a clean
// prefix of "Ohio State Buckeyes", but they are not the same team — and the same
// trap exists for Washington/Washington State, Virginia/Virginia Tech,
// Texas/Texas A&M, Miami/Miami (OH) and so on. When the feed name continues with
// one of these, a prefix match is not good enough to grade on.
const QUALIFIERS = new Set([
  'state', 'st', 'tech', 'a', 'am', 'southern', 'northern', 'eastern', 'western',
  'central', 'christian', 'international', 'atlantic', 'pacific', 'coastal',
  'oh', 'fl', 'ut', 'ca', 'university', 'college',
]);

// True when `candidate` extends `target` with a word that makes it another school.
function prefixChangesSchool(target: string, candidate: string): boolean {
  if (!candidate.startsWith(`${target} `)) return false;
  const nextWord = candidate.slice(target.length + 1).split(' ')[0];
  return QUALIFIERS.has(nextWord);
}

// Three tiers, loosest last. Autocompleted picks land in tier 1 (exact); a
// hand-typed "Alabama" lands in tier 2 (prefix). Anything matching more than one
// game, or matching only by a school-changing prefix, is treated as no match, so
// it stays pending for the admin override rather than being graded as the wrong
// team. False pending is recoverable; a confidently wrong W/L is not.
function findSide(typed: string, feed: ScoreFeedGame[]): SideMatch | null {
  const target = normalizeTeam(typed);
  if (!target) return null;

  const completed = feed.filter(g => g.completed && g.scores && g.scores.length >= 2);

  const tiers: ((side: string) => boolean)[] = [
    side => normalizeTeam(side) === target,
    side => {
      const candidate = normalizeTeam(side);
      return candidate.startsWith(`${target} `) && !prefixChangesSchool(target, candidate);
    },
    side => {
      const candidate = normalizeTeam(side);
      if (prefixChangesSchool(target, candidate)) return false;
      return candidate.includes(target) || target.includes(candidate);
    },
  ];

  for (const matches of tiers) {
    const hits: SideMatch[] = [];
    for (const game of completed) {
      for (const { side, opponent } of sidesOf(game)) {
        if (matches(side)) hits.push({ game, pickedSide: side, opponent });
      }
    }
    // Both sides of one game matching is still ambiguous, so compare by game id.
    const distinctGames = new Set(hits.map(h => h.game.id));
    if (distinctGames.size === 1 && hits.length === 1) return hits[0];
    if (distinctGames.size > 1) return null;
  }

  return null;
}

// Grades one leg against the scores feed the settle routes already fetch.
// Returns null when the game can't be identified or has no usable score, which
// leaves the leg pending rather than guessing.
export function gradeParlayLeg(
  team: string,
  spreadValue: number,
  feed: ScoreFeedGame[]
): ParlayGrade | null {
  const match = findSide(team, feed);
  if (!match) return null;

  const scores = match.game.scores;
  if (!scores) return null;

  const pickedScore = scores.find(s => normalizeTeam(s.name) === normalizeTeam(match.pickedSide));
  const oppScore = scores.find(s => normalizeTeam(s.name) === normalizeTeam(match.opponent));
  if (!pickedScore || !oppScore) return null;

  const teamScore = parseInt(pickedScore.score, 10);
  const opponentScore = parseInt(oppScore.score, 10);
  if (Number.isNaN(teamScore) || Number.isNaN(opponentScore)) return null;

  // spread_value is signed from the picked team's perspective, so the margin and
  // the spread simply add: Alabama +10.5 losing by 7 covers (-7 + 10.5 = 3.5).
  const adjusted = teamScore - opponentScore + spreadValue;

  return {
    result: adjusted > 0 ? 'win' : adjusted < 0 ? 'loss' : 'push',
    opponent: match.opponent,
    teamScore,
    oppScore: opponentScore,
  };
}

export interface ParlayStatus {
  total: number;
  hits: number;
  losses: number;
  pushes: number;
  pending: number;
  // 'busted' the moment any leg loses, 'cashed' only once every leg is graded.
  state: 'empty' | 'alive' | 'cashed' | 'busted';
  // Pushes drop out of the payout, matching how a book re-grades the ticket.
  liveLegs: number;
}

export function parlayStatus(results: (ParlayResult | null)[]): ParlayStatus {
  const total = results.length;
  const hits = results.filter(r => r === 'win').length;
  const losses = results.filter(r => r === 'loss').length;
  const pushes = results.filter(r => r === 'push').length;
  const pending = results.filter(r => r === null).length;

  const state: ParlayStatus['state'] =
    total === 0 ? 'empty' : losses > 0 ? 'busted' : pending > 0 ? 'alive' : 'cashed';

  return { total, hits, losses, pushes, pending, state, liveLegs: total - pushes };
}
