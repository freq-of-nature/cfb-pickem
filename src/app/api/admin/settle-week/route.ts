import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { weekId, autoFetch } = await request.json();
    const supabase = getServiceClient();

    // If autoFetch is true, pull scores from the Odds API
    if (autoFetch) {
      const oddsApiKey = process.env.ODDS_API_KEY;
      if (!oddsApiKey || oddsApiKey === 'your-odds-api-key-here') {
        return NextResponse.json({ success: false, error: 'Odds API key not configured' }, { status: 500 });
      }

      const scoresUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/scores?apiKey=${oddsApiKey}&daysFrom=5`;
      const scoresRes = await fetch(scoresUrl);

      if (!scoresRes.ok) {
        return NextResponse.json({ success: false, error: 'Scores API request failed' }, { status: 502 });
      }

      const apiScores = await scoresRes.json();

      // Get games for this week
      const { data: games } = await supabase
        .from('games')
        .select('*')
        .eq('week_id', weekId);

      if (games) {
        for (const game of games) {
          if (!game.api_game_id) continue;

          const apiGame = apiScores.find(
            (s: { id: string; completed: boolean }) => s.id === game.api_game_id && s.completed
          );

          if (apiGame && apiGame.scores) {
            const homeScore = apiGame.scores.find(
              (s: { name: string }) => s.name === game.home_team
            );
            const awayScore = apiGame.scores.find(
              (s: { name: string }) => s.name === game.away_team
            );

            if (homeScore && awayScore) {
              const hScore = parseInt(homeScore.score);
              const aScore = parseInt(awayScore.score);

              // Determine who covered the spread
              // spread_value is negative (e.g., -7.5 means favorite gives 7.5 points)
              // If spread_team is the home team: home must win by more than |spread_value|
              let winningSide: string;
              const spreadAbs = Math.abs(game.spread_value);

              if (game.spread_team === game.home_team) {
                // Home is favored
                winningSide = (hScore - aScore) > spreadAbs ? 'home' : 'away';
              } else {
                // Away is favored
                winningSide = (aScore - hScore) > spreadAbs ? 'away' : 'home';
              }

              // Handle exact push (shouldn't happen with half-points)
              if (game.spread_team === game.home_team && (hScore - aScore) === spreadAbs) {
                winningSide = 'push';
              } else if (game.spread_team === game.away_team && (aScore - hScore) === spreadAbs) {
                winningSide = 'push';
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
            }
          }
        }
      }
    }

    // Now grade all picks for this week
    const { data: games } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', weekId)
      .eq('is_final', true);

    if (games) {
      for (const game of games) {
        if (!game.winning_side || game.winning_side === 'push') {
          // Push = no points, mark as null (not correct, not incorrect)
          await supabase
            .from('picks')
            .update({ is_correct: null })
            .eq('game_id', game.id);
          continue;
        }

        // Determine winning team name
        const winningTeam = game.winning_side === 'home' ? game.home_team : game.away_team;
        const losingTeam = game.winning_side === 'home' ? game.away_team : game.home_team;

        // Mark correct picks
        await supabase
          .from('picks')
          .update({ is_correct: true })
          .eq('game_id', game.id)
          .eq('picked_team', winningTeam);

        // Mark incorrect picks
        await supabase
          .from('picks')
          .update({ is_correct: false })
          .eq('game_id', game.id)
          .eq('picked_team', losingTeam);
      }
    }

    // Calculate weekly results for each user
    const { data: allPicks } = await supabase
      .from('picks')
      .select('user_id, is_correct, game:games!inner(week_id)')
      .eq('games.week_id', weekId);

    // Group by user
    const userCounts: Record<string, number> = {};
    if (allPicks) {
      for (const pick of allPicks) {
        if (!userCounts[pick.user_id]) userCounts[pick.user_id] = 0;
        if (pick.is_correct === true) userCounts[pick.user_id]++;
      }
    }

    // Get ALL users (even those who didn't pick — they get 0)
    const { data: allUsers } = await supabase.from('users').select('id');
    if (allUsers) {
      for (const u of allUsers) {
        if (!userCounts[u.id]) userCounts[u.id] = 0;
      }
    }

    // Find max and min
    const counts = Object.values(userCounts);
    const maxCorrect = Math.max(...counts);
    const minCorrect = Math.min(...counts);

    // Get previous season rankings for rank change calculation
    const { data: prevResults } = await supabase
      .from('weekly_results')
      .select('user_id, correct_count, week_id')
      .eq('week_id', weekId - 1);

    // Calculate cumulative totals before this week for ranking
    // (We'll need all previous weekly_results)
    const { data: allPrevResults } = await supabase
      .from('weekly_results')
      .select('user_id, correct_count')
      .lt('week_id', weekId);

    const prevTotals: Record<string, number> = {};
    if (allPrevResults) {
      for (const r of allPrevResults) {
        if (!prevTotals[r.user_id]) prevTotals[r.user_id] = 0;
        prevTotals[r.user_id] += r.correct_count;
      }
    }

    // Sort by previous total for old rank
    const prevRanking = Object.entries(prevTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([userId], idx) => ({ userId, rank: idx + 1 }));

    // Calculate new totals (previous + this week)
    const newTotals: Record<string, number> = {};
    for (const userId of Object.keys(userCounts)) {
      newTotals[userId] = (prevTotals[userId] || 0) + userCounts[userId];
    }

    const newRanking = Object.entries(newTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([userId], idx) => ({ userId, rank: idx + 1 }));

    // Upsert weekly results
    for (const [userId, correctCount] of Object.entries(userCounts)) {
      const prevRank = prevRanking.find(r => r.userId === userId)?.rank || null;
      const newRank = newRanking.find(r => r.userId === userId)?.rank || 1;
      const rankChange = prevRank ? prevRank - newRank : 0; // positive = moved up

      await supabase
        .from('weekly_results')
        .upsert({
          user_id: userId,
          week_id: weekId,
          correct_count: correctCount,
          is_weekly_winner: correctCount === maxCorrect,
          is_weekly_loser: correctCount === minCorrect,
          has_seen_popup: false,
          prev_season_rank: prevRank,
          new_season_rank: newRank,
          rank_change: rankChange,
        }, { onConflict: 'user_id,week_id' });
    }

    // Mark week as settled
    await supabase
      .from('weeks')
      .update({ is_settled: true })
      .eq('id', weekId);

    return NextResponse.json({
      success: true,
      results: Object.entries(userCounts).map(([userId, count]) => ({
        userId,
        correctCount: count,
        isWinner: count === maxCorrect,
        isLoser: count === minCorrect,
      })),
    });
  } catch (err) {
    console.error('Settle week error:', err);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
