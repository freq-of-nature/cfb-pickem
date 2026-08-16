import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getServiceClient();

    // Get all settled weeks
    const { data: weeks } = await supabase
      .from('weeks')
      .select('*')
      .eq('season', 2026)
      .eq('is_settled', true)
      .order('week_number', { ascending: true });

    // Get all users
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name, school_slug, school_colors(primary_color, secondary_color, display_name)')
      .order('first_name');

    // Get all weekly results
    const { data: results } = await supabase
      .from('weekly_results')
      .select('*')
      .order('week_id', { ascending: true });

    if (!users || !results) {
      return NextResponse.json({ success: true, weeks: [], users: [], results: [], seasonStandings: [], trendData: [] });
    }

    // Calculate season standings
    const totals: Record<string, number> = {};
    for (const user of users) {
      totals[user.id] = 0;
    }
    for (const r of results) {
      if (!totals[r.user_id]) totals[r.user_id] = 0;
      totals[r.user_id] += r.correct_count;
    }

    // Sort by total descending
    const seasonStandings = Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .map(([userId, total], idx) => {
        const user = users.find(u => u.id === userId);
        // Find the most recent weekly result for rank change
        const latestResult = results
          .filter(r => r.user_id === userId)
          .sort((a, b) => b.week_id - a.week_id)[0];

        return {
          rank: idx + 1,
          userId,
          firstName: user?.first_name || '',
          lastName: user?.last_name || '',
          schoolSlug: user?.school_slug,
          schoolColors: user?.school_colors,
          total,
          rankChange: latestResult?.rank_change || 0,
        };
      });

    // Build trend data: for each user, cumulative total at each week
    const trendData = (weeks || []).map(week => {
      const weekResults = results.filter(r => r.week_id === week.id);
      const point: Record<string, number | string> = { week: `Wk ${week.week_number}` };

      for (const user of users) {
        // Sum all results up to and including this week
        const cumulative = results
          .filter(r => r.user_id === user.id && r.week_id <= week.id)
          .reduce((sum, r) => sum + r.correct_count, 0);
        point[user.id] = cumulative;
      }

      return point;
    });

    // Find current week's loser for Wall of Shame
    const latestSettledWeek = weeks && weeks.length > 0 ? weeks[weeks.length - 1] : null;
    let wallOfShame = null;

    if (latestSettledWeek) {
      const losers = results.filter(
        r => r.week_id === latestSettledWeek.id && r.is_weekly_loser
      );
      wallOfShame = {
        week: latestSettledWeek,
        losers: losers.map(l => {
          const user = users.find(u => u.id === l.user_id);
          return {
            userId: l.user_id,
            firstName: user?.first_name || '',
            lastName: user?.last_name || '',
            correctCount: l.correct_count,
          };
        }),
      };
    }

    return NextResponse.json({
      success: true,
      weeks: weeks || [],
      users,
      results,
      seasonStandings,
      trendData,
      wallOfShame,
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
