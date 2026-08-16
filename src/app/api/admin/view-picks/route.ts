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

    // Admin can see all picks regardless of lock status
    const { data: picks, error } = await supabase
      .from('picks')
      .select(`
        id,
        user_id,
        game_id,
        picked_team,
        is_correct,
        created_at,
        updated_at
      `)
      .in('game_id', (
        await supabase
          .from('games')
          .select('id')
          .eq('week_id', parseInt(weekId))
      ).data?.map(g => g.id) || []);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Get all users
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .order('first_name');

    return NextResponse.json({ success: true, picks: picks || [], users: users || [] });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
