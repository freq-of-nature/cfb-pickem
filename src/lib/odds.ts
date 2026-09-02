interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsGame {
  home_team: string;
  bookmakers: {
    markets: {
      key: string;
      outcomes: OddsOutcome[];
    }[];
  }[];
}

// Scans every bookmaker for a game and prefers a half-point spread (e.g. -7.5)
// over a whole number (e.g. -7), since whole numbers can push. Falls back to
// the first whole-number line found only if no bookmaker offers a half-point.
export function getSpread(game: OddsGame): { spreadTeam: string; spreadValue: number } | null {
  let wholeNumberFallback: { spreadTeam: string; spreadValue: number } | null = null;

  for (const book of game.bookmakers) {
    const spreadMarket = book.markets.find(m => m.key === 'spreads');
    if (!spreadMarket || spreadMarket.outcomes.length < 2) continue;

    // Favor the actual favorite (negative spread); fall back to the home team for a pick'em.
    const favorite = spreadMarket.outcomes.find(o => o.point !== undefined && o.point < 0);
    const chosen = favorite ?? spreadMarket.outcomes.find(o => o.name === game.home_team);
    if (!chosen || chosen.point === undefined) continue;

    const result = { spreadTeam: chosen.name, spreadValue: chosen.point };

    if (!Number.isInteger(chosen.point)) {
      return result;
    }
    if (!wholeNumberFallback) {
      wholeNumberFallback = result;
    }
  }

  return wholeNumberFallback;
}
