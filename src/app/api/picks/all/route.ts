import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get('weekId');

    if (!weekId) {
      return NextResponse.json({ success: false, error: 'weekId required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Check if picks are locked for this week
    const { data: week } = await supabase
      .from('weeks')
      .select('picks_lock_at')
      .eq('id', parseInt(weekId))
      .single();

    if (!week) {
      return NextResponse.json({ success: false, error: 'Week not found' }, { status: 404 });
    }

    if (week.picks_lock_at && new Date(week.picks_lock_at) > new Date()) {
      return NextResponse.json({ success: false, error: 'Picks are not yet locked — cannot view others\' picks' }, { status: 403 });
    }

    // Fetch all picks for this week with user info
    const { data: picks, error } = await supabase
      .from('picks')
      .select(`
        id,
        user_id,
        game_id,
        picked_team,
        is_correct,
        users!inner(id, first_name, last_name, school_slug),
        games!inner(week_id)
      `)
      .eq('games.week_id', parseInt(weekId));

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Also fetch all users with their school colors
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name, school_slug, school_colors(primary_color, secondary_color, display_name)')
      .order('first_name');

    return NextResponse.json({ success: true, picks: picks || [], users: users || [] });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
