import { NextResponse } from 'next/server';
import { sendWeekReminders } from '@/lib/push';

export async function POST(request: Request) {
  try {
    const { weekId } = await request.json();

    if (!weekId) {
      return NextResponse.json({ success: false, error: 'weekId required' }, { status: 400 });
    }

    const result = await sendWeekReminders(weekId);

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('Send reminder error:', err);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
