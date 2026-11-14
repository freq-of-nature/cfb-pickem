import { NextResponse } from 'next/server';
import { normalizeTeamName, LogoMap } from '@/lib/team-logos';

const ESPN_TEAMS_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000';

interface EspnTeam {
  displayName: string;
  logos?: { href: string; rel: string[] }[];
}

// GET - map of normalized team name -> logo URL, for the picks page.
// ESPN's full payload is ~2MB (too big for Next's fetch cache), so the small
// map is cached at the CDN instead.
export async function GET() {
  try {
    const res = await fetch(ESPN_TEAMS_URL, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ success: false, error: `ESPN request failed (${res.status})` }, { status: 502 });
    }
    const data = await res.json();
    const teams: EspnTeam[] = (data.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t: { team: EspnTeam }) => t.team);

    const logos: LogoMap = {};
    for (const team of teams) {
      // The app is dark, so prefer ESPN's dark-background variant.
      const logo = team.logos?.find(l => l.rel.includes('dark')) ?? team.logos?.[0];
      if (logo) logos[normalizeTeamName(team.displayName)] = logo.href;
    }

    return NextResponse.json(
      { success: true, logos },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } }
    );
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
