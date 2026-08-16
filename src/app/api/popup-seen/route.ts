import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { userId, weekId } = await request.json();
    const supabase = getServiceClient();

    const { error } = await supabase
      .from('weekly_results')
      .update({ has_seen_popup: true })
      .eq('user_id', userId)
      .eq('week_id', weekId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
