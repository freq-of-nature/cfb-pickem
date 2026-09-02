import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getSpread } from '@/lib/odds';

export async function POST(request: Request) {
  try {
    const { weekId } = await request.json();
    const supabase = getServiceClient();

    // Get all games for this week that have an API game ID
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', weekId)
      .not('api_game_id', 'is', null);

    if (gamesError || !games) {
      return NextResponse.json({ success: false, error: 'Failed to fetch games' }, { status: 500 });
    }

    const oddsApiKey = process.env.ODDS_API_KEY;
    if (!oddsApiKey || oddsApiKey === 'your-odds-api-key-here') {
      return NextResponse.json({ success: false, error: 'Odds API key not configured' }, { status: 500 });
    }

    // Fetch fresh odds
    const oddsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds?regions=us&markets=spreads&oddsFormat=american&apiKey=${oddsApiKey}`;
    const oddsRes = await fetch(oddsUrl);

    if (!oddsRes.ok) {
      return NextResponse.json({ success: false, error: 'Odds API request failed' }, { status: 502 });
    }

    const apiGames = await oddsRes.json();
    const remaining = oddsRes.headers.get('x-requests-remaining');

    let updated = 0;

    for (const game of games) {
      const apiGame = apiGames.find((ag: { id: string }) => ag.id === game.api_game_id);
      if (!apiGame) continue;

      const spread = getSpread(apiGame);
      if (!spread) continue;

      await supabase
        .from('games')
        .update({
          spread_team: spread.spreadTeam,
          spread_value: spread.spreadValue,
          kickoff_time: apiGame.commence_time,
        })
        .eq('id', game.id);
      updated++;
    }

    return NextResponse.json({
      success: true,
      updated,
      total: games.length,
      creditsRemaining: remaining,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
