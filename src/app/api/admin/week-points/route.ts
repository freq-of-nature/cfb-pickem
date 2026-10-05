import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

// Generous bounds — wide enough for a bonus or a penalty, tight enough to catch
// a fat-fingered entry.
const MIN_POINTS = -50;
const MAX_POINTS = 200;

// Winner/loser are ties-inclusive, matching how settlement assigns them.
async function recomputeFlags(
  supabase: ReturnType<typeof getServiceClient>,
  weekId: number
): Promise<{ winners: string[]; losers: string[] }> {
  const { data: rows } = await supabase
    .from('weekly_results')
    .select('id, user_id, points')
    .eq('week_id', weekId);

  if (!rows || rows.length === 0) return { winners: [], losers: [] };

  const totals = rows.map(r => r.points);
  const max = Math.max(...totals);
  const min = Math.min(...totals);

  for (const row of rows) {
    await supabase
      .from('weekly_results')
      .update({
        is_weekly_winner: row.points === max,
        is_weekly_loser: row.points === min,
      })
      .eq('id', row.id);
  }

  return {
    winners: rows.filter(r => r.points === max).map(r => r.user_id),
    losers: rows.filter(r => r.points === min).map(r => r.user_id),
  };
}

// GET - every user's points for a week, so the admin can edit them
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get('weekId');

    if (!weekId) {
      return NextResponse.json({ success: false, error: 'weekId required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: results, error } = await supabase
      .from('weekly_results')
      .select('id, user_id, week_id, points, is_weekly_winner, is_weekly_loser, users!inner(first_name, last_name)')
      .eq('week_id', parseInt(weekId))
      .order('points', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, results: results || [] });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

// POST - set one user's points for a week by hand, then re-derive the week's
// winner/loser flags so the Wall of Shame and roast popup stay consistent.
//
// Note: settlement owns `points` normally and upserts it from graded picks, so
// re-settling this week would overwrite a value set here.
export async function POST(request: Request) {
  try {
    const { weekId, userId, points } = await request.json();

    if (!weekId || !userId) {
      return NextResponse.json({ success: false, error: 'weekId and userId required' }, { status: 400 });
    }

    const value = Number(points);
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return NextResponse.json({ success: false, error: 'Points must be a whole number' }, { status: 400 });
    }
    if (value < MIN_POINTS || value > MAX_POINTS) {
      return NextResponse.json(
        { success: false, error: `Points must be between ${MIN_POINTS} and ${MAX_POINTS}` },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Only edits an existing row — points don't exist until the week is settled.
    const { data: existing } = await supabase
      .from('weekly_results')
      .select('id')
      .eq('week_id', parseInt(weekId))
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'No result row for that user and week — settle the week first' },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from('weekly_results')
      .update({ points: value })
      .eq('id', existing.id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const flags = await recomputeFlags(supabase, parseInt(weekId));

    return NextResponse.json({ success: true, points: value, ...flags });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
