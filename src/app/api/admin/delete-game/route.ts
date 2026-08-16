import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { gameId } = await request.json();
    const supabase = getServiceClient();

    // Delete picks for this game first (cascade should handle this, but being explicit)
    await supabase.from('picks').delete().eq('game_id', gameId);

    // Delete the game
    const { error } = await supabase.from('games').delete().eq('id', gameId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
