import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

// GET - fetch a user's picks for a given week
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const weekId = searchParams.get('weekId');

    if (!userId || !weekId) {
      return NextResponse.json({ success: false, error: 'userId and weekId required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: picks, error } = await supabase
      .from('picks')
      .select('*, games!inner(week_id, away_team, home_team, spread_team, spread_value)')
      .eq('user_id', userId)
      .eq('games.week_id', parseInt(weekId));

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, picks: picks || [] });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

// POST - upsert a pick (create or update)
export async function POST(request: Request) {
  try {
    const { userId, gameId, pickedTeam } = await request.json();

    if (!userId || !gameId || !pickedTeam) {
      return NextResponse.json({ success: false, error: 'userId, gameId, and pickedTeam required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Check if picks are locked for this game's week
    const { data: game } = await supabase
      .from('games')
      .select('week_id, weeks!inner(picks_lock_at)')
      .eq('id', gameId)
      .single();

    if (!game) {
      return NextResponse.json({ success: false, error: 'Game not found' }, { status: 404 });
    }

    const lockAt = (game as unknown as { weeks: { picks_lock_at: string } }).weeks.picks_lock_at;
    if (lockAt && new Date(lockAt) <= new Date()) {
      return NextResponse.json({ success: false, error: 'Picks are locked for this week' }, { status: 403 });
    }

    // Check pick count for this user/week (max 10)
    const { data: existingPicks } = await supabase
      .from('picks')
      .select('id, game_id, games!inner(week_id)')
      .eq('user_id', userId)
      .eq('games.week_id', game.week_id);

    const currentPickCount = existingPicks?.length || 0;
    const isUpdatingExisting = existingPicks?.some(p => p.game_id === gameId);

    if (currentPickCount >= 10 && !isUpdatingExisting) {
      return NextResponse.json({ success: false, error: 'Maximum 10 picks per week' }, { status: 400 });
    }

    // Upsert the pick
    const { data: pick, error } = await supabase
      .from('picks')
      .upsert(
        {
          user_id: userId,
          game_id: gameId,
          picked_team: pickedTeam,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,game_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, pick });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

// DELETE - remove a pick (deselect)
export async function DELETE(request: Request) {
  try {
    const { userId, gameId } = await request.json();

    if (!userId || !gameId) {
      return NextResponse.json({ success: false, error: 'userId and gameId required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Check if picks are locked
    const { data: game } = await supabase
      .from('games')
      .select('week_id, weeks!inner(picks_lock_at)')
      .eq('id', gameId)
      .single();

    if (!game) {
      return NextResponse.json({ success: false, error: 'Game not found' }, { status: 404 });
    }

    const lockAt = (game as unknown as { weeks: { picks_lock_at: string } }).weeks.picks_lock_at;
    if (lockAt && new Date(lockAt) <= new Date()) {
      return NextResponse.json({ success: false, error: 'Picks are locked for this week' }, { status: 403 });
    }

    const { error } = await supabase
      .from('picks')
      .delete()
      .eq('user_id', userId)
      .eq('game_id', gameId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
