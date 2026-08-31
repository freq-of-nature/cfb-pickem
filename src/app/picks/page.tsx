'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';
import { supabase } from '@/lib/supabase';
import { Week, Game } from '@/types';

interface PickMap {
  [gameId: string]: string; // gameId -> picked team name
}

interface PickResult {
  [gameId: string]: boolean | null; // gameId -> is_correct
}

interface OtherUser {
  id: string;
  first_name: string;
  last_name: string;
  school_slug: string | null;
  school_colors?: {
    primary_color: string;
    secondary_color: string;
    display_name: string;
  } | null;
}

interface OtherPick {
  id: string;
  user_id: string;
  game_id: string;
  picked_team: string;
  is_correct: boolean | null;
}

export default function PicksPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [week, setWeek] = useState<Week | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [myPicks, setMyPicks] = useState<PickMap>({});
  const [myResults, setMyResults] = useState<PickResult>({});
  const [isLocked, setIsLocked] = useState(false);
  const [saving, setSaving] = useState<string | null>(null); // gameId being saved
  const [error, setError] = useState('');

  // View others state
  const [showOthers, setShowOthers] = useState(false);
  const [otherUsers, setOtherUsers] = useState<OtherUser[]>([]);
  const [allPicks, setAllPicks] = useState<OtherPick[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Week navigation
  const [allWeeks, setAllWeeks] = useState<Week[]>([]);
  const [viewingWeekId, setViewingWeekId] = useState<number | null>(null);

  const userId = user?.id;

  const fetchWeeks = useCallback(async () => {
    const { data } = await supabase
      .from('weeks')
      .select('*')
      .eq('season', 2026)
      .not('slate_published_at', 'is', null)
      .order('week_number', { ascending: true });
    if (data && data.length > 0) {
      setAllWeeks(data);
    }
  }, []);

  const fetchWeekData = useCallback(async (weekId: number) => {
    // Fetch week info
    const { data: weekData } = await supabase
      .from('weeks')
      .select('*')
      .eq('id', weekId)
      .single();

    if (weekData) {
      setWeek(weekData);
      const locked = weekData.picks_lock_at ? new Date(weekData.picks_lock_at) <= new Date() : false;
      setIsLocked(locked);
    }

    // Fetch games
    const { data: gamesData } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', weekId)
      .order('kickoff_time', { ascending: true });

    if (gamesData) setGames(gamesData);

    // Fetch my picks
    if (userId) {
      const res = await fetch(`/api/picks?userId=${userId}&weekId=${weekId}`);
      const data = await res.json();
      if (data.success && data.picks) {
        const pickMap: PickMap = {};
        const resultMap: PickResult = {};
        for (const pick of data.picks) {
          pickMap[pick.game_id] = pick.picked_team;
          resultMap[pick.game_id] = pick.is_correct;
        }
        setMyPicks(pickMap);
        setMyResults(resultMap);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (!loading && !user && !isAdmin) {
      router.push('/');
    }
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (userId) fetchWeeks();
  }, [userId, fetchWeeks]);

  useEffect(() => {
    if (allWeeks.length > 0 && viewingWeekId === null) {
      // Default to the latest published unsettled week, or latest settled
      const active = allWeeks.find(w => !w.is_settled) || allWeeks[allWeeks.length - 1];
      setViewingWeekId(active.id);
    }
  }, [allWeeks, viewingWeekId]);

  useEffect(() => {
    if (viewingWeekId) {
      fetchWeekData(viewingWeekId);
      setShowOthers(false);
      setSelectedUserId(null);
    }
  }, [viewingWeekId, fetchWeekData]);

  const pickCount = Object.keys(myPicks).length;

  const handlePick = async (gameId: string, team: string) => {
    if (isLocked || !userId) return;

    const currentPick = myPicks[gameId];

    // If tapping same team, deselect
    if (currentPick === team) {
      setSaving(gameId);
      setError('');
      const newPicks = { ...myPicks };
      delete newPicks[gameId];
      setMyPicks(newPicks);

      const res = await fetch('/api/picks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, gameId }),
      });
      const data = await res.json();
      if (!data.success) {
        // Revert
        setMyPicks(prev => ({ ...prev, [gameId]: team }));
        setError(data.error);
      }
      setSaving(null);
      return;
    }

    // If switching pick on same game, no count change needed
    // If new pick and already at 10, block
    if (!currentPick && pickCount >= 10) {
      setError('Maximum 10 picks. Deselect a game first.');
      return;
    }

    // Optimistically update
    setSaving(gameId);
    setError('');
    setMyPicks(prev => ({ ...prev, [gameId]: team }));

    const res = await fetch('/api/picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, gameId, pickedTeam: team }),
    });
    const data = await res.json();
    if (!data.success) {
      // Revert
      if (currentPick) {
        setMyPicks(prev => ({ ...prev, [gameId]: currentPick }));
      } else {
        const newPicks = { ...myPicks };
        delete newPicks[gameId];
        setMyPicks(newPicks);
      }
      setError(data.error);
    }
    setSaving(null);
  };

  const handleViewOthers = async () => {
    if (!viewingWeekId) return;

    const res = await fetch(`/api/picks/all?weekId=${viewingWeekId}`);
    const data = await res.json();

    if (data.success) {
      setAllPicks(data.picks);
      setOtherUsers(data.users.filter((u: OtherUser) => u.id !== userId));
      setShowOthers(true);
    } else {
      setError(data.error);
    }
  };

  const selectedOtherUser = otherUsers.find(u => u.id === selectedUserId);
  const selectedUserPicks = allPicks.filter(p => p.user_id === selectedUserId);
  const selectedUserPickMap: PickMap = {};
  const selectedUserResultMap: PickResult = {};
  for (const p of selectedUserPicks) {
    selectedUserPickMap[p.game_id] = p.picked_team;
    selectedUserResultMap[p.game_id] = p.is_correct;
  }

  const formatSpread = (game: Game) => {
    const sign = game.spread_value > 0 ? '+' : '';
    return `${sign}${game.spread_value}`;
  };

  const formatKickoff = (time: string | null) => {
    if (!time) return 'TBD';
    return new Date(time).toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    });
  };

  const getPickStyle = (gameId: string, team: string, picks: PickMap, results: PickResult) => {
    const isPicked = picks[gameId] === team;
    const result = results[gameId];

    if (!isPicked) return 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750 hover:border-gray-600';

    if (result === true) return 'bg-green-900/40 border-green-500 text-green-300';
    if (result === false) return 'bg-red-900/40 border-red-500 text-red-300';
    return 'bg-blue-900/40 border-blue-500 text-blue-300';
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>;
  }

  if (!user && !isAdmin) return null;

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
                  viewingWeekId === w.id
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
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
            <p className="text-gray-500 text-sm mt-2">Check back when the admin posts this week&apos;s games.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold">Week {week.week_number}</h1>
                {isLocked ? (
                  <p className="text-sm text-yellow-400">🔒 Picks locked</p>
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

              {/* Pick Counter */}
              {!showOthers && (
                <div className={`text-sm font-semibold px-3 py-1.5 rounded-full ${
                  pickCount >= 10 ? 'bg-green-900/40 text-green-400' :
                  pickCount > 0 ? 'bg-blue-900/40 text-blue-400' :
                  'bg-gray-800 text-gray-400'
                }`}>
                  {pickCount}/10
                </div>
              )}
            </div>

            {/* View Others Toggle */}
            {isLocked && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setShowOthers(false); setSelectedUserId(null); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !showOthers ? 'bg-gray-700 text-white' : 'bg-gray-800/50 text-gray-400'
                  }`}
                >
                  My Picks
                </button>
                <button
                  onClick={handleViewOthers}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    showOthers ? 'bg-gray-700 text-white' : 'bg-gray-800/50 text-gray-400'
                  }`}
                >
                  View Others
                </button>
              </div>
            )}

            {/* Other Users List */}
            {showOthers && !selectedUserId && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 mb-4">
                <div className="p-3 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-gray-400">Select a player to view their picks</h2>
                </div>
                <div className="divide-y divide-gray-800">
                  {otherUsers.map(u => {
                    const userPickCount = allPicks.filter(p => p.user_id === u.id).length;
                    const userCorrect = allPicks.filter(p => p.user_id === u.id && p.is_correct === true).length;
                    const schoolColor = u.school_colors?.primary_color;

                    return (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUserId(u.id)}
                        className="w-full flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          {schoolColor && (
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: schoolColor }}
                            />
                          )}
                          <span className="text-white font-medium">
                            {u.first_name} {u.last_name}
                          </span>
                        </div>
                        <span className="text-sm text-gray-400">
                          {week?.is_settled ? `${userCorrect}/${userPickCount} correct` : `${userPickCount} picks`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Back button when viewing someone */}
            {showOthers && selectedUserId && selectedOtherUser && (
              <button
                onClick={() => setSelectedUserId(null)}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-3 transition-colors"
              >
                ← Back to players
              </button>
            )}

            {/* Viewing label */}
            {showOthers && selectedOtherUser && (
              <div
                className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg border"
                style={{
                  borderColor: selectedOtherUser.school_colors?.primary_color || '#374151',
                  backgroundColor: `${selectedOtherUser.school_colors?.primary_color || '#374151'}15`,
                }}
              >
                <span className="text-sm font-medium" style={{ color: selectedOtherUser.school_colors?.primary_color || '#9CA3AF' }}>
                  Viewing: {selectedOtherUser.first_name} {selectedOtherUser.last_name}
                </span>
                {selectedOtherUser.school_colors?.display_name && (
                  <span className="text-xs text-gray-500">({selectedOtherUser.school_colors.display_name})</span>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-400/10 text-red-400 text-sm rounded-lg p-3 mb-4">
                {error}
              </div>
            )}

            {/* Games List */}
            {(!showOthers || selectedUserId) && (
              <div className="space-y-3">
                {games.map(game => {
                  const activePicks = showOthers ? selectedUserPickMap : myPicks;
                  const activeResults = showOthers ? selectedUserResultMap : myResults;
                  const isSaving = saving === game.id;
                  const isAway = game.spread_team === game.away_team;

                  return (
                    <div
                      key={game.id}
                      className={`bg-gray-900 rounded-xl border overflow-hidden ${
                        game.is_game_of_week ? 'border-yellow-500/70' : 'border-gray-800'
                      } ${isSaving ? 'opacity-70' : ''}`}
                    >
                      {/* Game of the Week badge */}
                      {game.is_game_of_week && (
                        <div className="px-3 py-1 bg-yellow-500/10 border-b border-yellow-500/30">
                          <span className="text-xs font-semibold text-yellow-400">
                            ⭐ Game of the Week · Worth 2 points
                          </span>
                        </div>
                      )}

                      {/* Game info bar */}
                      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/50">
                        <span className="text-xs text-gray-500">{formatKickoff(game.kickoff_time)}</span>
                        {game.is_final && (
                          <span className="text-xs text-green-400 font-medium">
                            Final: {game.away_score}–{game.home_score}
                          </span>
                        )}
                      </div>

                      {/* Pick buttons */}
                      <div className="p-3 space-y-2">
                        {/* Away team */}
                        <button
                          onClick={() => !showOthers && handlePick(game.id, game.away_team)}
                          disabled={isLocked || showOthers || isSaving}
                          className={`w-full flex items-center justify-between px-3 py-3 rounded-lg border transition-all ${
                            getPickStyle(game.id, game.away_team, activePicks, activeResults)
                          } ${!isLocked && !showOthers ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default'}`}
                        >
                          <span className="font-medium text-sm">{game.away_team}</span>
                          <span className="text-xs font-mono opacity-75">
                            {isAway ? formatSpread(game) : `+${Math.abs(game.spread_value)}`}
                          </span>
                        </button>

                        {/* Home team */}
                        <button
                          onClick={() => !showOthers && handlePick(game.id, game.home_team)}
                          disabled={isLocked || showOthers || isSaving}
                          className={`w-full flex items-center justify-between px-3 py-3 rounded-lg border transition-all ${
                            getPickStyle(game.id, game.home_team, activePicks, activeResults)
                          } ${!isLocked && !showOthers ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default'}`}
                        >
                          <span className="font-medium text-sm">{game.home_team}</span>
                          <span className="text-xs font-mono opacity-75">
                            {!isAway ? formatSpread(game) : `+${Math.abs(game.spread_value)}`}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
