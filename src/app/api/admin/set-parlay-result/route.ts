import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

const VALID_RESULTS = ['win', 'loss', 'push'];

// Manual override for legs the scores feed couldn't match — a hand-typed team
// name, an ambiguous one like "Miami", or a game that fell outside the feed's
// 3-day lookback. Also lets the admin correct a bad auto-grade.
export async function POST(request: Request) {
  try {
    const { legId, result } = await request.json();

    if (!legId) {
      return NextResponse.json({ success: false, error: 'legId required' }, { status: 400 });
    }

    // null clears the grade back to pending.
    if (result !== null && !VALID_RESULTS.includes(result)) {
      return NextResponse.json(
        { success: false, error: "result must be 'win', 'loss', 'push', or null" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    const { data: leg, error } = await supabase
      .from('parlay_picks')
      .update({ result, updated_at: new Date().toISOString() })
      .eq('id', legId)
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
