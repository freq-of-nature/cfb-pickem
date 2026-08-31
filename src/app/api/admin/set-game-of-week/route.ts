import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { gameId, weekId } = await request.json();

    if (!gameId || !weekId) {
      return NextResponse.json({ success: false, error: 'gameId and weekId required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: week } = await supabase
      .from('weeks')
      .select('picks_lock_at')
      .eq('id', weekId)
      .single();

    if (!week) {
      return NextResponse.json({ success: false, error: 'Week not found' }, { status: 404 });
    }

    if (week.picks_lock_at && new Date(week.picks_lock_at) <= new Date()) {
      return NextResponse.json({ success: false, error: 'Picks are locked — cannot change Game of the Week' }, { status: 403 });
    }

    const { data: game } = await supabase
      .from('games')
      .select('is_game_of_week')
      .eq('id', gameId)
      .single();

    if (!game) {
      return NextResponse.json({ success: false, error: 'Game not found' }, { status: 404 });
    }

    // Clear any existing Game of the Week for this week (single-select)
    await supabase.from('games').update({ is_game_of_week: false }).eq('week_id', weekId);

    // Toggle: if it was already set, leave it cleared. Otherwise set it on the target game.
    if (!game.is_game_of_week) {
      const { error } = await supabase.from('games').update({ is_game_of_week: true }).eq('id', gameId);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
