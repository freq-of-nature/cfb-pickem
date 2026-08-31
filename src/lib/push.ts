import webpush from 'web-push';
import { getServiceClient } from './supabase';

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID keys are not configured');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export async function sendWeekReminders(weekId: number) {
  ensureVapidConfigured();
  const supabase = getServiceClient();

  const { data: week } = await supabase
    .from('weeks')
    .select('*')
    .eq('id', weekId)
    .single();

  if (!week || !week.slate_published_at || week.is_settled) {
    return { targeted: 0, sent: 0, pruned: 0, error: 'Week is not published or is already settled' };
  }

  const { data: allUsers } = await supabase.from('users').select('id');
  const { data: weekPicks } = await supabase
    .from('picks')
    .select('user_id, game:games!inner(week_id)')
    .eq('games.week_id', weekId);

  const pickCounts: Record<string, number> = {};
  for (const pick of weekPicks || []) {
    pickCounts[pick.user_id] = (pickCounts[pick.user_id] || 0) + 1;
  }

  const incompleteUserIds = (allUsers || [])
    .filter(u => (pickCounts[u.id] || 0) < 10)
    .map(u => u.id);

  if (incompleteUserIds.length === 0) {
    await supabase.from('weeks').update({ reminder_sent_at: new Date().toISOString() }).eq('id', weekId);
    return { targeted: 0, sent: 0, pruned: 0 };
  }

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', incompleteUserIds);

  const payload = JSON.stringify({
    title: '⏰ Picks lock tomorrow!',
    body: `Week ${week.week_number} picks lock soon — get your picks in on CFB Pick'em.`,
    url: '/picks',
  });

  let sent = 0;
  let pruned = 0;

  for (const sub of subscriptions || []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
      sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        pruned++;
      }
    }
  }

  await supabase.from('weeks').update({ reminder_sent_at: new Date().toISOString() }).eq('id', weekId);

  return { targeted: incompleteUserIds.length, sent, pruned };
}
