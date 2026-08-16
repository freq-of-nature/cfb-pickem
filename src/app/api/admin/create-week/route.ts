import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { weekNumber, season } = await request.json();
    const supabase = getServiceClient();

    // Check if week already exists
    const { data: existing } = await supabase
      .from('weeks')
      .select('id')
      .eq('week_number', weekNumber)
      .eq('season', season)
      .single();

    if (existing) {
      return NextResponse.json({ success: false, error: 'This week already exists' }, { status: 409 });
    }

    // Create the week — lock time defaults to Saturday 11:59 AM ET
    // Admin can adjust this when publishing
    const { data: week, error } = await supabase
      .from('weeks')
      .insert({
        week_number: weekNumber,
        season: season,
      })
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
