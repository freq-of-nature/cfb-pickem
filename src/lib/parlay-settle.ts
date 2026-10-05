import { getServiceClient } from '@/lib/supabase';
import { gradeParlayLeg, ScoreFeedGame } from '@/lib/parlay';

export interface ParlayGradeSummary {
  graded: number;
  pending: number;
  error?: string;
}

// Grades the week's parlay legs off the scores feed the caller already fetched,
// so this costs no extra Odds API credits.
//
// Never throws: the parlay is a side feature and must not be able to break pick
// settlement. Anything it can't match is left pending for the admin override.
export async function gradeParlayForWeek(
  weekId: number,
  feed: ScoreFeedGame[]
): Promise<ParlayGradeSummary> {
  try {
    const supabase = getServiceClient();

    const { data: legs, error } = await supabase
      .from('parlay_picks')
      .select('id, team, spread_value')
      .eq('week_id', weekId)
      .is('result', null);

    if (error) return { graded: 0, pending: 0, error: error.message };
    if (!legs || legs.length === 0) return { graded: 0, pending: 0 };

    let graded = 0;

    for (const leg of legs) {
      const grade = gradeParlayLeg(leg.team, Number(leg.spread_value), feed);
      if (!grade) continue;

      await supabase
        .from('parlay_picks')
        .update({
          result: grade.result,
          opponent: grade.opponent,
          team_score: grade.teamScore,
          opp_score: grade.oppScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leg.id);

      graded++;
    }

    return { graded, pending: legs.length - graded };
  } catch (err) {
    console.error('Parlay grading error:', err);
    return { graded: 0, pending: 0, error: 'Parlay grading failed' };
  }
}
