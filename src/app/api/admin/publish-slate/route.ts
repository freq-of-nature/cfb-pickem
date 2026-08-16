import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { weekId, lockDate } = await request.json();
    const supabase = getServiceClient();

    // lockDate should be a Saturday date string like "2026-08-29"
    // We set lock time to 11:59 AM Eastern (16:59 UTC during EDT, 17:59 UTC during EST)
    // For simplicity, using America/New_York timezone offset
    const lockDateTime = new Date(`${lockDate}T11:59:00-04:00`); // EDT

    const { data: week, error } = await supabase
      .from('weeks')
      .update({
        slate_published_at: new Date().toISOString(),
        picks_lock_at: lockDateTime.toISOString(),
      })
      .eq('id', weekId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, week });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
