import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getServiceClient();

    // Get the most recent published, unsettled week — or the most recent settled week if none are active
    const { data: activeWeek } = await supabase
      .from('weeks')
      .select('*')
      .eq('season', 2026)
      .not('slate_published_at', 'is', null)
      .eq('is_settled', false)
      .order('week_number', { ascending: false })
      .limit(1)
      .single();

    if (activeWeek) {
      return NextResponse.json({ success: true, week: activeWeek });
    }

    // Fall back to most recent settled week
    const { data: lastWeek } = await supabase
      .from('weeks')
      .select('*')
      .eq('season', 2026)
      .not('slate_published_at', 'is', null)
      .order('week_number', { ascending: false })
      .limit(1)
      .single();

    if (lastWeek) {
      return NextResponse.json({ success: true, week: lastWeek });
    }

    return NextResponse.json({ success: true, week: null });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
