import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

// This endpoint is called by Vercel Cron on Sunday mornings
// It auto-fetches scores and settles any locked, unsettled weeks

export async function GET(request: Request) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const oddsApiKey = process.env.ODDS_API_KEY;

    if (!oddsApiKey || oddsApiKey === 'your-odds-api-key-here') {
      return NextResponse.json({ error: 'Odds API key not configured' }, { status: 500 });
    }

    // Find weeks that are locked (past lock time) but not yet settled
    const { data: unsettledWeeks } = await supabase
      .from('weeks')
      .select('*')
      .eq('season', 2026)
      .eq('is_settled', false)
      .not('picks_lock_at', 'is', null)
      .lt('picks_lock_at', new Date().toISOString());

    if (!unsettledWeeks || unsettledWeeks.length === 0) {
      return NextResponse.json({ message: 'No weeks to settle', settled: 0 });
    }

    const results = [];

    for (const week of unsettledWeeks) {
      // Fetch scores from API
      const scoresUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/scores?apiKey=${oddsApiKey}&daysFrom=3`;
      const scoresRes = await fetch(scoresUrl);

      if (!scoresRes.ok) {
        results.push({ weekId: week.id, weekNumber: week.week_number, status: 'api_error' });
        continue;
      }

      const apiScores = await scoresRes.json();

      // Get games for this week
      const { data: games } = await supabase
        .from('games')
        .select('*')
        .eq('week_id', week.id);

      if (!games) continue;

      let allFinal = true;
      let gamesScored = 0;

      for (const game of games) {
        if (!game.api_game_id) continue;
        if (game.is_final) { gamesScored++; continue; }

        const apiGame = apiScores.find(
          (s: { id: string; completed: boolean }) => s.id === game.api_game_id && s.completed
        );

        if (!apiGame || !apiGame.scores) {
          allFinal = false;
          continue;
        }

        const homeScore = apiGame.scores.find((s: { name: string }) => s.name === game.home_team);
        const awayScore = apiGame.scores.find((s: { name: string }) => s.name === game.away_team);

        if (!homeScore || !awayScore) {
          allFinal = false;
          continue;
        }

        const hScore = parseInt(homeScore.score);
        const aScore = parseInt(awayScore.score);
        const spreadAbs = Math.abs(game.spread_value);

        let winningSide: string;
        if (game.spread_team === game.home_team) {
          winningSide = (hScore - aScore) > spreadAbs ? 'home' : 'away';
          if ((hScore - aScore) === spreadAbs) winningSide = 'push';
        } else {
          winningSide = (aScore - hScore) > spreadAbs ? 'away' : 'home';
          if ((aScore - hScore) === spreadAbs) winningSide = 'push';
        }

        await supabase
          .from('games')
          .update({
            home_score: hScore,
            away_score: aScore,
            is_final: true,
            winning_side: winningSide,
          })
          .eq('id', game.id);

        gamesScored++;
      }

      // Only settle the week if all games are final
      if (!allFinal && gamesScored < games.length) {
        results.push({
          weekId: week.id,
          weekNumber: week.week_number,
          status: 'partial',
          scored: gamesScored,
          total: games.length,
        });
        continue;
      }

      // Grade picks
      const finalGames = await supabase
        .from('games')
        .select('*')
        .eq('week_id', week.id)
        .eq('is_final', true);

      if (finalGames.data) {
        for (const game of finalGames.data) {
          if (!game.winning_side || game.winning_side === 'push') {
            await supabase.from('picks').update({ is_correct: null }).eq('game_id', game.id);
            continue;
          }

          const winningTeam = game.winning_side === 'home' ? game.home_team : game.away_team;
          const losingTeam = game.winning_side === 'home' ? game.away_team : game.home_team;

          await supabase.from('picks').update({ is_correct: true }).eq('game_id', game.id).eq('picked_team', winningTeam);
          await supabase.from('picks').update({ is_correct: false }).eq('game_id', game.id).eq('picked_team', losingTeam);
        }
      }

      // Calculate weekly results
      const { data: allPicks } = await supabase
        .from('picks')
        .select('user_id, is_correct, game_id')
        .in('game_id', games.map(g => g.id));

      const userCounts: Record<string, number> = {};
      const { data: allUsers } = await supabase.from('users').select('id');

      if (allUsers) {
        for (const u of allUsers) userCounts[u.id] = 0;
      }
      if (allPicks) {
        for (const pick of allPicks) {
          if (pick.is_correct === true) {
            userCounts[pick.user_id] = (userCounts[pick.user_id] || 0) + 1;
          }
        }
      }

      const counts = Object.values(userCounts);
      const maxCorrect = counts.length > 0 ? Math.max(...counts) : 0;
      const minCorrect = counts.length > 0 ? Math.min(...counts) : 0;

      for (const [userId, correctCount] of Object.entries(userCounts)) {
        await supabase
          .from('weekly_results')
          .upsert({
            user_id: userId,
            week_id: week.id,
            correct_count: correctCount,
            is_weekly_winner: correctCount === maxCorrect,
            is_weekly_loser: correctCount === minCorrect,
            has_seen_popup: false,
          }, { onConflict: 'user_id,week_id' });
      }

      await supabase.from('weeks').update({ is_settled: true }).eq('id', week.id);

      results.push({
        weekId: week.id,
        weekNumber: week.week_number,
        status: 'settled',
        scored: gamesScored,
        total: games.length,
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('Cron settle error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
