import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isGameLocked } from '@/lib/lock';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get('weekId');

    if (!weekId) {
      return NextResponse.json({ success: false, error: 'weekId required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: week } = await supabase
      .from('weeks')
      .select('picks_lock_at')
      .eq('id', parseInt(weekId))
      .single();

    if (!week) {
      return NextResponse.json({ success: false, error: 'Week not found' }, { status: 404 });
    }

    // Fetch all picks for this week with user info
    const { data: allPicks, error } = await supabase
      .from('picks')
      .select(`
        id,
        user_id,
        game_id,
        picked_team,
        is_correct,
        users!inner(id, first_name, last_name, school_slug),
        games!inner(week_id, kickoff_time)
      `)
      .eq('games.week_id', parseInt(weekId));

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Picks are revealed game by game as each one kicks off
    const picks = (allPicks || []).filter(p =>
      isGameLocked((p.games as unknown as { kickoff_time: string | null }).kickoff_time, week.picks_lock_at)
    );

    // Also fetch all users with their school colors
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name, school_slug, school_colors(primary_color, secondary_color, display_name)')
      .order('first_name');

    return NextResponse.json({ success: true, picks, users: users || [] });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
