import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

const MAX_TEAM_LENGTH = 60;
const MAX_SPREAD = 99.5;

interface WeekGate {
  slate_published_at: string | null;
  picks_lock_at: string | null;
}

// Parlay legs are public the moment they're submitted (unlike regular picks,
// which stay hidden until lock), so GET is open. Writes still have to beat the
// same picks_lock_at deadline.
async function getWeekGate(
  supabase: ReturnType<typeof getServiceClient>,
  weekId: number
): Promise<{ week?: WeekGate; error?: string; status?: number }> {
  const { data: week } = await supabase
    .from('weeks')
    .select('slate_published_at, picks_lock_at')
    .eq('id', weekId)
    .single();

  if (!week) return { error: 'Week not found', status: 404 };
  if (!week.slate_published_at) {
    return { error: 'The parlay opens when the slate is published', status: 403 };
  }
  if (week.picks_lock_at && new Date(week.picks_lock_at) <= new Date()) {
    return { error: 'The parlay is locked for this week', status: 403 };
  }

  return { week };
}

// GET - every submitted leg for a week, visible to everyone
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get('weekId');

    if (!weekId) {
      return NextResponse.json({ success: false, error: 'weekId required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: legs, error } = await supabase
      .from('parlay_picks')
      .select(`
        id,
        user_id,
        week_id,
        team,
        spread_value,
        result,
        opponent,
        team_score,
        opp_score,
        created_at,
        updated_at,
        users!inner(first_name, last_name, school_colors(primary_color, display_name))
      `)
      .eq('week_id', parseInt(weekId))
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, legs: legs || [] });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

// POST - submit or change your one leg for the week
export async function POST(request: Request) {
  try {
    const { userId, weekId, team, spreadValue } = await request.json();

    if (!userId || !weekId || typeof team !== 'string') {
      return NextResponse.json(
        { success: false, error: 'userId, weekId, and team required' },
        { status: 400 }
      );
    }

    const trimmedTeam = team.trim();
    if (!trimmedTeam) {
      return NextResponse.json({ success: false, error: 'Enter a team' }, { status: 400 });
    }
    if (trimmedTeam.length > MAX_TEAM_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Team name must be ${MAX_TEAM_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    const spread = Number(spreadValue);
    if (!Number.isFinite(spread)) {
      return NextResponse.json({ success: false, error: 'Enter a spread, e.g. +10.5' }, { status: 400 });
    }
    if (Math.abs(spread) > MAX_SPREAD) {
      return NextResponse.json({ success: false, error: 'That spread is out of range' }, { status: 400 });
    }
    // Spreads move in half points; anything else is a typo.
    if (Math.round(spread * 2) !== spread * 2) {
      return NextResponse.json(
        { success: false, error: 'Spreads must be in half points, e.g. +10.5' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    const gate = await getWeekGate(supabase, parseInt(weekId));
    if (gate.error) {
      return NextResponse.json({ success: false, error: gate.error }, { status: gate.status });
    }

    // Changing the pick clears any previous grade so it re-grades at settlement.
    const { data: leg, error } = await supabase
      .from('parlay_picks')
      .upsert(
        {
          user_id: userId,
          week_id: parseInt(weekId),
          team: trimmedTeam,
          spread_value: spread,
          result: null,
          opponent: null,
          team_score: null,
          opp_score: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,week_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, leg });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

// DELETE - pull your leg out of the parlay
export async function DELETE(request: Request) {
  try {
    const { userId, weekId } = await request.json();

    if (!userId || !weekId) {
      return NextResponse.json({ success: false, error: 'userId and weekId required' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const gate = await getWeekGate(supabase, parseInt(weekId));
    if (gate.error) {
      return NextResponse.json({ success: false, error: gate.error }, { status: gate.status });
    }

    const { error } = await supabase
      .from('parlay_picks')
      .delete()
      .eq('user_id', userId)
      .eq('week_id', parseInt(weekId));

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
