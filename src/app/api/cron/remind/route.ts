import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { sendWeekReminders } from '@/lib/push';

// Called daily by Vercel Cron. Sends the "picks lock soon" reminder to anyone
// with incomplete picks for any published, unsettled week locking within the
// next ~36 hours that hasn't been reminded yet.

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();

    const windowEnd = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();

    const { data: weeks } = await supabase
      .from('weeks')
      .select('*')
      .eq('season', 2026)
      .eq('is_settled', false)
      .not('slate_published_at', 'is', null)
      .is('reminder_sent_at', null)
      .not('picks_lock_at', 'is', null)
      .gt('picks_lock_at', new Date().toISOString())
      .lt('picks_lock_at', windowEnd);

    if (!weeks || weeks.length === 0) {
      return NextResponse.json({ message: 'No weeks to remind', reminded: 0 });
    }

    const results = [];
    for (const week of weeks) {
      const result = await sendWeekReminders(week.id);
      results.push({ weekId: week.id, weekNumber: week.week_number, ...result });
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('Cron remind error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
