import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ success: true, popup: null });
    }

    const supabase = getServiceClient();

    // Find unseen results where user won or lost
    const { data: results } = await supabase
      .from('weekly_results')
      .select('*')
      .eq('user_id', userId)
      .eq('has_seen_popup', false)
      .or('is_weekly_winner.eq.true,is_weekly_loser.eq.true')
      .order('week_id', { ascending: true })
      .limit(1);

    if (!results || results.length === 0) {
      return NextResponse.json({ success: true, popup: null });
    }

    const result = results[0];

    // Fetch the week data
    const { data: week } = await supabase
      .from('weeks')
      .select('*')
      .eq('id', result.week_id)
      .single();

    if (!week) {
      return NextResponse.json({ success: true, popup: null });
    }

    const isWinner = result.is_weekly_winner;
    const message = isWinner ? week.winner_message : week.loser_message;

    // Only show popup if admin has actually set a message
    // Don't mark as seen — keep checking until message is set
    if (!message) {
      return NextResponse.json({ success: true, popup: null });
    }

    return NextResponse.json({
      success: true,
      popup: {
        type: isWinner ? 'winner' : 'loser',
        weekNumber: week.week_number,
        weekId: week.id,
        message,
        imageUrl: isWinner ? week.winner_image_url : week.loser_image_url,
        videoUrl: isWinner ? week.winner_video_url : week.loser_video_url,
      },
    });
  } catch (err) {
    console.error('Check popup error:', err);
    return NextResponse.json({ success: true, popup: null });
  }
}
