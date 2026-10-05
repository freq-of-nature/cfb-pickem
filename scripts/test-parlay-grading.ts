import { gradeParlayLeg, combinedOdds, formatAmerican, parlayStatus, ScoreFeedGame } from '../src/lib/parlay';

const feed: ScoreFeedGame[] = [
  {
    id: 'g1', completed: true, home_team: 'LSU Tigers', away_team: 'Alabama Crimson Tide',
    scores: [{ name: 'LSU Tigers', score: '31' }, { name: 'Alabama Crimson Tide', score: '24' }],
  },
  {
    id: 'g2', completed: true, home_team: 'Ohio State Buckeyes', away_team: 'Michigan Wolverines',
    scores: [{ name: 'Ohio State Buckeyes', score: '30' }, { name: 'Michigan Wolverines', score: '23' }],
  },
  {
    id: 'g3', completed: true, home_team: 'Miami Hurricanes', away_team: 'Florida State Seminoles',
    scores: [{ name: 'Miami Hurricanes', score: '20' }, { name: 'Florida State Seminoles', score: '17' }],
  },
  {
    id: 'g4', completed: true, home_team: 'Miami (OH) RedHawks', away_team: 'Toledo Rockets',
    scores: [{ name: 'Miami (OH) RedHawks', score: '14' }, { name: 'Toledo Rockets', score: '28' }],
  },
  {
    id: 'g5', completed: false, home_team: 'Texas Longhorns', away_team: 'Oklahoma Sooners', scores: null,
  },
];

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got      ${a}\n       expected ${e}`); }
}

console.log('\nATS grading (spread signed from picked team):');
// Alabama lost by 7 but was getting 10.5 -> covers.
check('Alabama +10.5, lost 24-31 -> win',
  gradeParlayLeg('Alabama Crimson Tide', 10.5, feed)?.result, 'win');
// Alabama lost outright while laying points -> loss.
check('Alabama -3.5, lost 24-31 -> loss',
  gradeParlayLeg('Alabama Crimson Tide', -3.5, feed)?.result, 'loss');
// LSU won by 7, laying 7.5 -> fails to cover.
check('LSU -7.5, won 31-24 -> loss',
  gradeParlayLeg('LSU Tigers', -7.5, feed)?.result, 'loss');
// LSU won by 7, laying 6.5 -> covers.
check('LSU -6.5, won 31-24 -> win',
  gradeParlayLeg('LSU Tigers', -6.5, feed)?.result, 'win');
// Exact landing on a whole number.
check('LSU -7, won 31-24 -> push',
  gradeParlayLeg('LSU Tigers', -7, feed)?.result, 'push');
check('Alabama +7, lost 24-31 -> push',
  gradeParlayLeg('Alabama Crimson Tide', 7, feed)?.result, 'push');
check('pick em (0), LSU won -> win',
  gradeParlayLeg('LSU Tigers', 0, feed)?.result, 'win');

console.log('\nOpponent + score captured for display:');
check('Alabama leg detail',
  gradeParlayLeg('Alabama Crimson Tide', 10.5, feed),
  { result: 'win', opponent: 'LSU Tigers', teamScore: 24, oppScore: 31 });

console.log('\nName matching:');
check('exact autocomplete name', gradeParlayLeg('Ohio State Buckeyes', -3.5, feed)?.result, 'win');
check('free text "Michigan"', gradeParlayLeg('Michigan', 7.5, feed)?.result, 'win');
check('free text "ohio state" (case/partial)', gradeParlayLeg('ohio state', -3.5, feed)?.result, 'win');
check('"Ohio" must NOT match Ohio State', gradeParlayLeg('Ohio', -3.5, feed), null);
// "Miami (OH)" is a different school, so bare "Miami" means the Hurricanes.
check('"Miami" -> Hurricanes, not Miami (OH)',
  gradeParlayLeg('Miami', -2.5, feed)?.opponent, 'Florida State Seminoles');
check('"Miami Hurricanes" disambiguates', gradeParlayLeg('Miami Hurricanes', -2.5, feed)?.result, 'win');
check('"Miami (OH)" disambiguates', gradeParlayLeg('Miami (OH) RedHawks', 7.5, feed)?.result, 'loss');

// A real two-way ambiguity: neither continuation is a qualifier word, so there
// is no basis to choose and the leg must stay pending.
const louisiana: ScoreFeedGame[] = [
  {
    id: 'l1', completed: true, home_team: 'Louisiana Ragin Cajuns', away_team: 'Troy Trojans',
    scores: [{ name: 'Louisiana Ragin Cajuns', score: '24' }, { name: 'Troy Trojans', score: '21' }],
  },
  {
    id: 'l2', completed: true, home_team: 'Louisiana Monroe Warhawks', away_team: 'Arkansas State Red Wolves',
    scores: [{ name: 'Louisiana Monroe Warhawks', score: '10' }, { name: 'Arkansas State Red Wolves', score: '35' }],
  },
];
check('bare "Louisiana" is ambiguous -> pending', gradeParlayLeg('Louisiana', -3.5, louisiana), null);
check('"Louisiana Ragin Cajuns" resolves', gradeParlayLeg('Louisiana Ragin Cajuns', -2.5, louisiana)?.result, 'win');
check('unfinished game -> pending', gradeParlayLeg('Texas Longhorns', -3.5, feed), null);
check('unknown team -> pending', gradeParlayLeg('Boise State Broncos', -3.5, feed), null);
check('empty team -> pending', gradeParlayLeg('   ', -3.5, feed), null);

// The "X" vs "X State/Tech/A&M" family: typing the short name must never grade
// against the longer school when the short one isn't in the feed.
console.log('\nSchool-prefix collisions (must all stay pending):');
const collisions: [string, string][] = [
  ['Washington', 'Washington State Cougars'],
  ['Virginia', 'Virginia Tech Hokies'],
  ['Georgia', 'Georgia Tech Yellow Jackets'],
  ['Texas', 'Texas A&M Aggies'],
  ['Oregon', 'Oregon State Beavers'],
  ['Mississippi', 'Mississippi State Bulldogs'],
  ['Florida', 'Florida Atlantic Owls'],
  ['Michigan', 'Michigan State Spartans'],
];
for (const [typed, feedTeam] of collisions) {
  const oneGame: ScoreFeedGame[] = [{
    id: 'x', completed: true, home_team: feedTeam, away_team: 'Purdue Boilermakers',
    scores: [{ name: feedTeam, score: '28' }, { name: 'Purdue Boilermakers', score: '10' }],
  }];
  check(`"${typed}" must not match ${feedTeam}`, gradeParlayLeg(typed, -3.5, oneGame), null);
  // ...but the full name still grades fine.
  check(`"${feedTeam}" grades`, gradeParlayLeg(feedTeam, -3.5, oneGame)?.result, 'win');
}

console.log('\nParlay odds at -110/leg:');
check('1 leg', formatAmerican(combinedOdds(1)!), '-110');
check('2 legs', formatAmerican(combinedOdds(2)!), '+264');
check('3 legs', formatAmerican(combinedOdds(3)!), '+596');
check('7 legs', formatAmerican(combinedOdds(7)!), '+9,142');
check('0 legs -> null', combinedOdds(0), null);

console.log('\nParlay status:');
check('one loss busts it', parlayStatus(['win', 'loss', null]).state, 'busted');
check('all graded, no loss -> cashed', parlayStatus(['win', 'win', 'push']).state, 'cashed');
check('pending, no loss -> alive', parlayStatus(['win', null]).state, 'alive');
check('no legs -> empty', parlayStatus([]).state, 'empty');
check('pushes drop out of payout', parlayStatus(['win', 'push', 'win']).liveLegs, 2);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
