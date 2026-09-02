import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getSpread } from '@/lib/odds';

interface OddsGame {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    title: string;
    markets: {
      key: string;
      outcomes: {
        name: string;
        price: number;
        point?: number;
      }[];
    }[];
  }[];
}

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestMatch(inputName: string, apiGames: OddsGame[]): OddsGame | null {
  const normalized = normalizeTeamName(inputName);

  for (const game of apiGames) {
    const homeNorm = normalizeTeamName(game.home_team);
    const awayNorm = normalizeTeamName(game.away_team);

    // Check if input matches or is contained in API team name
    if (
      homeNorm.includes(normalized) || normalized.includes(homeNorm) ||
      awayNorm.includes(normalized) || normalized.includes(awayNorm)
    ) {
      return game;
    }
  }

  return null;
}


export async function POST(request: Request) {
  try {
    const { weekId, matchups } = await request.json();

    if (!weekId || !matchups || !Array.isArray(matchups)) {
      return NextResponse.json({ success: false, error: 'weekId and matchups array required' }, { status: 400 });
    }

    const oddsApiKey = process.env.ODDS_API_KEY;
    if (!oddsApiKey || oddsApiKey === 'your-odds-api-key-here') {
      return NextResponse.json({ success: false, error: 'Odds API key not configured' }, { status: 500 });
    }

    // Fetch current NCAAF odds
    const oddsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds?regions=us&markets=spreads&oddsFormat=american&apiKey=${oddsApiKey}`;
    const oddsRes = await fetch(oddsUrl);

    if (!oddsRes.ok) {
      const errorText = await oddsRes.text();
      return NextResponse.json({ success: false, error: `Odds API error: ${errorText}` }, { status: 502 });
    }

    const apiGames: OddsGame[] = await oddsRes.json();

    // Log remaining credits from response headers
    const remaining = oddsRes.headers.get('x-requests-remaining');
    console.log(`Odds API credits remaining: ${remaining}`);

    const supabase = getServiceClient();
    const results: { matchup: string; status: string; game?: Record<string, unknown> }[] = [];

    for (const matchup of matchups) {
      // Parse "Away@Home" format
      const parts = matchup.split('@').map((s: string) => s.trim());
      if (parts.length !== 2) {
        results.push({ matchup, status: 'invalid_format' });
        continue;
      }

      const [awayInput, homeInput] = parts;

      // Try to find a matching game in API results
      const matchedGame = findBestMatch(awayInput, apiGames) || findBestMatch(homeInput, apiGames);

      if (!matchedGame) {
        // No API match — insert with manual data needed
        results.push({ matchup, status: 'no_api_match' });
        continue;
      }

      const spread = getSpread(matchedGame);

      if (!spread) {
        results.push({ matchup, status: 'no_spread_found' });
        continue;
      }

      // Check if this game already exists for this week
      const { data: existingGame } = await supabase
        .from('games')
        .select('id')
        .eq('week_id', weekId)
        .eq('api_game_id', matchedGame.id)
        .single();

      if (existingGame) {
        // Update spread if game already exists
        await supabase
          .from('games')
          .update({
            spread_team: spread.spreadTeam,
            spread_value: spread.spreadValue,
            kickoff_time: matchedGame.commence_time,
          })
          .eq('id', existingGame.id);

        results.push({ matchup, status: 'updated', game: { id: existingGame.id } });
        continue;
      }

      // Insert new game
      const { data: newGame, error: insertError } = await supabase
        .from('games')
        .insert({
          week_id: weekId,
          api_game_id: matchedGame.id,
          away_team: matchedGame.away_team,
          home_team: matchedGame.home_team,
          spread_team: spread.spreadTeam,
          spread_value: spread.spreadValue,
          kickoff_time: matchedGame.commence_time,
        })
        .select()
        .single();

      if (insertError) {
        results.push({ matchup, status: 'insert_error', game: { error: insertError.message } });
      } else {
        results.push({ matchup, status: 'added', game: newGame as Record<string, unknown> });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      creditsRemaining: remaining,
    });
  } catch (err) {
    console.error('Add games error:', err);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
