import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { weekId, winnerMessage, winnerImageUrl, winnerVideoUrl, loserMessage, loserImageUrl, loserVideoUrl } = await request.json();
    const supabase = getServiceClient();

    const { error } = await supabase
      .from('weeks')
      .update({
        winner_message: winnerMessage || null,
        winner_image_url: winnerImageUrl || null,
        winner_video_url: winnerVideoUrl || null,
        loser_message: loserMessage || null,
        loser_image_url: loserImageUrl || null,
        loser_video_url: loserVideoUrl || null,
      })
      .eq('id', weekId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
