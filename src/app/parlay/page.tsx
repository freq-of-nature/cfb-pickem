'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';
import { supabase } from '@/lib/supabase';
import { Week, ParlayResult } from '@/types';
import {
  combinedOdds,
  formatAmerican,
  formatSpread,
  parlayStatus,
  PARLAY_LEG_PRICE,
} from '@/lib/parlay';

interface ParlayLeg {
  id: string;
  user_id: string;
  week_id: number;
  team: string;
  spread_value: number;
  result: ParlayResult | null;
  opponent: string | null;
  team_score: number | null;
  opp_score: number | null;
  created_at: string;
  users: {
    first_name: string;
    last_name: string;
    school_colors: { primary_color: string; display_name: string } | null;
  };
}

// Spreads are typed, not picked off a board, so accept the shapes people
// actually write: "+10.5", "-7.5", "10.5", "pk".
function parseSpread(input: string): number | null {
  const cleaned = input.trim().replace(/\s+/g, '');
  if (!cleaned) return null;
  if (/^(pk|pick|even|0)$/i.test(cleaned)) return 0;
  if (!/^[+-]?\d+(\.\d+)?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || Math.abs(value) > 99.5) return null;
  if (Math.round(value * 2) !== value * 2) return null;
  return value;
}

export default function ParlayPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [allWeeks, setAllWeeks] = useState<Week[]>([]);
  const [viewingWeekId, setViewingWeekId] = useState<number | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [legs, setLegs] = useState<ParlayLeg[]>([]);
  const [schools, setSchools] = useState<string[]>([]);

  // Entry form
  const [teamInput, setTeamInput] = useState('');
  const [spreadInput, setSpreadInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const userId = user?.id;
  const isLocked = week?.picks_lock_at ? new Date(week.picks_lock_at) <= new Date() : false;

  const fetchWeeks = useCallback(async () => {
    const { data } = await supabase
      .from('weeks')
      .select('*')
      .eq('season', 2026)
      .not('slate_published_at', 'is', null)
      .order('week_number', { ascending: true });
    if (data) setAllWeeks(data as Week[]);
  }, []);

  const fetchSchools = useCallback(async () => {
    const { data } = await supabase.from('school_colors').select('display_name').order('display_name');
    if (data) setSchools(data.map(s => s.display_name));
  }, []);

  const fetchLegs = useCallback(async (weekId: number) => {
    const { data: weekData } = await supabase.from('weeks').select('*').eq('id', weekId).single();
    if (weekData) setWeek(weekData as Week);

    const res = await fetch(`/api/parlay?weekId=${weekId}`);
    const data = await res.json();
    if (data.success) {
      setLegs(data.legs);
    } else {
      setError(data.error);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user && !isAdmin) router.push('/');
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (!loading && (user || isAdmin)) {
      fetchWeeks();
      fetchSchools();
    }
  }, [loading, user, isAdmin, fetchWeeks, fetchSchools]);

  useEffect(() => {
    if (allWeeks.length > 0 && viewingWeekId === null) {
      const active = allWeeks.find(w => !w.is_settled) || allWeeks[allWeeks.length - 1];
      setViewingWeekId(active.id);
    }
  }, [allWeeks, viewingWeekId]);

  useEffect(() => {
    if (viewingWeekId) {
      fetchLegs(viewingWeekId);
      setEditing(false);
      setError('');
    }
  }, [viewingWeekId, fetchLegs]);

  const myLeg = legs.find(l => l.user_id === userId) || null;
  const status = useMemo(() => parlayStatus(legs.map(l => l.result)), [legs]);
  const odds = combinedOdds(status.liveLegs);

  const suggestions = useMemo(() => {
    const query = teamInput.trim().toLowerCase();
    if (!query) return [];
    const matches = schools.filter(s => s.toLowerCase().includes(query));
    // Exact match means they've already picked a real team; nothing left to suggest.
    if (matches.length === 1 && matches[0].toLowerCase() === query) return [];
    return matches.slice(0, 6);
  }, [teamInput, schools]);

  const parsedSpread = parseSpread(spreadInput);
  const canSubmit = teamInput.trim().length > 0 && parsedSpread !== null && !saving;

  const openEditor = () => {
    setTeamInput(myLeg?.team || '');
    setSpreadInput(myLeg ? formatSpread(Number(myLeg.spread_value)) : '');
    setEditing(true);
    setError('');
  };

  const handleSubmit = async () => {
    if (!userId || !viewingWeekId || parsedSpread === null) return;

    setSaving(true);
    setError('');

    const res = await fetch('/api/parlay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        weekId: viewingWeekId,
        team: teamInput.trim(),
        spreadValue: parsedSpread,
      }),
    });
    const data = await res.json();

    if (data.success) {
      setEditing(false);
      setTeamInput('');
      setSpreadInput('');
      await fetchLegs(viewingWeekId);
    } else {
      setError(data.error);
    }
    setSaving(false);
  };

  const handleRemove = async () => {
    if (!userId || !viewingWeekId) return;

    setSaving(true);
    setError('');

    const res = await fetch('/api/parlay', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, weekId: viewingWeekId }),
    });
    const data = await res.json();

    if (data.success) {
      setEditing(false);
      await fetchLegs(viewingWeekId);
    } else {
      setError(data.error);
    }
    setSaving(false);
  };

  const resultBadge = (result: ParlayResult | null) => {
    if (result === 'win') return <span className="text-xs font-bold px-2 py-1 rounded bg-green-900/40 text-green-400">W</span>;
    if (result === 'loss') return <span className="text-xs font-bold px-2 py-1 rounded bg-red-900/40 text-red-400">L</span>;
    if (result === 'push') return <span className="text-xs font-bold px-2 py-1 rounded bg-yellow-900/40 text-yellow-400">PUSH</span>;
    return <span className="text-xs font-medium px-2 py-1 rounded bg-gray-800 text-gray-500">—</span>;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>;
  }

  if (!user && !isAdmin) return null;

  const statusBanner = {
    empty: { label: 'No legs yet', className: 'bg-gray-800 text-gray-400' },
    alive: { label: 'ALIVE', className: 'bg-blue-900/40 text-blue-300 border border-blue-500/50' },
    cashed: { label: '🎉 CASHED', className: 'bg-green-900/40 text-green-300 border border-green-500/50' },
    busted: { label: '💀 BUSTED', className: 'bg-red-900/40 text-red-300 border border-red-500/50' },
  }[status.state];

  return (
    <>
      <NavBar />
      <main className="max-w-lg mx-auto px-4 py-4 pb-24">
        {/* Week Selector */}
        {allWeeks.length > 0 && (
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
            {allWeeks.map(w => (
              <button
                key={w.id}
                onClick={() => setViewingWeekId(w.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  viewingWeekId === w.id ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                Wk {w.week_number}
                {w.is_settled && ' ✓'}
              </button>
            ))}
          </div>
        )}

        {!week ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No slate published yet.</p>
            <p className="text-gray-500 text-sm mt-2">The parlay opens when the admin posts this week&apos;s games.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold">Week {week.week_number} Parlay</h1>
                {isLocked ? (
                  <p className="text-sm text-yellow-400">🔒 Locked</p>
                ) : week.picks_lock_at ? (
                  <p className="text-sm text-gray-400">
                    Locks {new Date(week.picks_lock_at).toLocaleString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                      timeZone: 'America/New_York', timeZoneName: 'short',
                    })}
                  </p>
                ) : null}
              </div>
              <div className={`text-sm font-bold px-3 py-1.5 rounded-full ${statusBanner.className}`}>
                {statusBanner.label}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-400/10 text-red-400 text-sm rounded-lg p-3 mb-4">{error}</div>
            )}

            {/* Your entry — admin has no user row, so it can only spectate */}
            {userId && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4">
                <h2 className="text-sm font-semibold text-gray-400 mb-3">Your Leg</h2>

                {!editing && myLeg && (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-white font-medium">
                        {myLeg.team} <span className="text-yellow-400 font-mono">{formatSpread(Number(myLeg.spread_value))}</span>
                      </div>
                      {myLeg.opponent && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          vs {myLeg.opponent} · {myLeg.team_score}–{myLeg.opp_score}
                        </div>
                      )}
                    </div>
                    {isLocked ? (
                      resultBadge(myLeg.result)
                    ) : (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={openEditor}
                          className="px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
                        >
                          Change
                        </button>
                        <button
                          onClick={handleRemove}
                          disabled={saving}
                          className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg hover:text-red-400 transition-colors text-sm font-medium disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!editing && !myLeg && (
                  isLocked ? (
                    <p className="text-sm text-gray-500">You didn&apos;t add a leg this week.</p>
                  ) : (
                    <button
                      onClick={openEditor}
                      className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      + Add your leg
                    </button>
                  )
                )}

                {editing && (
                  <div className="space-y-3">
                    <div className="relative">
                      <label className="block text-xs text-gray-500 mb-1">Team</label>
                      <input
                        type="text"
                        value={teamInput}
                        onChange={(e) => { setTeamInput(e.target.value); setShowSuggestions(true); }}
                        onFocus={() => setShowSuggestions(true)}
                        placeholder="Start typing a team…"
                        autoComplete="off"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
                      />
                      {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
                          {suggestions.map(s => (
                            <button
                              key={s}
                              onClick={() => { setTeamInput(s); setShowSuggestions(false); }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-600 mt-1">
                        Suggestions cover Power 4 schools — any other team can be typed in.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Spread</label>
                      <input
                        type="text"
                        inputMode="text"
                        value={spreadInput}
                        onChange={(e) => setSpreadInput(e.target.value)}
                        placeholder="+10.5 or -7.5"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono"
                      />
                      {spreadInput.trim() && parsedSpread === null && (
                        <p className="text-xs text-red-400 mt-1">Use half points, e.g. +10.5 or -7.5</p>
                      )}
                    </div>

                    {/* Preview, so a wrong sign is obvious before submitting */}
                    {teamInput.trim() && parsedSpread !== null && (
                      <div className="bg-gray-800/50 rounded-lg px-3 py-2 text-sm">
                        <span className="text-gray-500">Submitting: </span>
                        <span className="text-white font-medium">{teamInput.trim()} </span>
                        <span className="text-yellow-400 font-mono">{formatSpread(parsedSpread)}</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="flex-1 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {saving ? 'Saving…' : myLeg ? 'Update Leg' : 'Add to Parlay'}
                      </button>
                      <button
                        onClick={() => { setEditing(false); setError(''); }}
                        className="px-4 py-2.5 bg-gray-800 text-gray-400 rounded-lg hover:text-white transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* The parlay card */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-400">
                  The Parlay · {status.total} {status.total === 1 ? 'leg' : 'legs'}
                </h2>
                {status.total > 0 && (
                  <span className="text-xs text-gray-500">
                    {status.hits}W · {status.losses}L
                    {status.pushes > 0 && ` · ${status.pushes}P`}
                    {status.pending > 0 && ` · ${status.pending} pending`}
                  </span>
                )}
              </div>

              {legs.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  Nobody has added a leg yet.
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {legs.map(leg => {
                    const color = leg.users.school_colors?.primary_color;
                    const isMine = leg.user_id === userId;

                    return (
                      <div key={leg.id} className={`flex items-center justify-between gap-3 p-3 ${isMine ? 'bg-blue-500/5' : ''}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {color && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
                            <span className="text-xs text-gray-400 truncate">
                              {leg.users.first_name} {leg.users.last_name}
                              {isMine && <span className="text-blue-400 ml-1">(you)</span>}
                            </span>
                          </div>
                          <div className="text-white font-medium mt-0.5 truncate">
                            {leg.team} <span className="text-yellow-400 font-mono">{formatSpread(Number(leg.spread_value))}</span>
                          </div>
                          {leg.opponent && (
                            <div className="text-xs text-gray-500 mt-0.5 truncate">
                              vs {leg.opponent} · {leg.team_score}–{leg.opp_score}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0">{resultBadge(leg.result)}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Odds footer */}
              {odds !== null && (
                <div className="p-3 border-t border-gray-800 bg-gray-800/30 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {status.liveLegs} {status.liveLegs === 1 ? 'leg' : 'legs'} at {PARLAY_LEG_PRICE}
                    {status.pushes > 0 && ' · pushes removed'}
                  </span>
                  <span className="text-lg font-bold font-mono text-green-400">{formatAmerican(odds)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
