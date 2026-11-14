// Team names come from The Odds API ("Alabama Crimson Tide"); logos come from
// ESPN, whose display names agree for nearly every FBS team. Both sides are
// normalized the same way and must match exactly — no fuzzy matching, so a
// miss just shows a placeholder instead of the wrong school's logo.

// Odds API spelling -> ESPN spelling, applied after normalizing.
const ALIASES: Record<string, string> = {
  'southern mississippi golden eagles': 'southern miss golden eagles',
  'sam houston state bearkats': 'sam houston bearkats',
};

export function normalizeTeamName(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’ʻ().,]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIASES[s] ?? s;
}

// normalized team name -> logo URL
export type LogoMap = Record<string, string>;

export function logoFor(logos: LogoMap, team: string): string | null {
  return logos[normalizeTeamName(team)] ?? null;
}
