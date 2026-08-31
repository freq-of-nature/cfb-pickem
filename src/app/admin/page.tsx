'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';
import { supabase } from '@/lib/supabase';
import { Week, Game } from '@/types';

type AdminTab = 'slate' | 'picks' | 'settle' | 'messages';

interface AdminPickUser {
  id: string;
  first_name: string;
  last_name: string;
}

interface AdminPick {
  id: string;
  user_id: string;
  game_id: string;
  picked_team: string;
  is_correct: boolean | null;
}

export default function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<AdminTab>('slate');
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [games, setGames] = useState<Game[]>([]);

  // Slate tab state
  const [matchupText, setMatchupText] = useState('');
  const [newWeekNumber, setNewWeekNumber] = useState(1);
  const [lockDate, setLockDate] = useState('');
  const [slateStatus, setSlateStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Picks tab state
  const [pickUsers, setPickUsers] = useState<AdminPickUser[]>([]);
  const [adminPicks, setAdminPicks] = useState<AdminPick[]>([]);
  const [picksLoaded, setPicksLoaded] = useState(false);

  // Settle tab state
  const [settleStatus, setSettleStatus] = useState('');

  // Reminder state
  const [reminderStatus, setReminderStatus] = useState('');

  // Messages tab state
  const [winnerMessage, setWinnerMessage] = useState('');
  const [winnerImageUrl, setWinnerImageUrl] = useState('');
  const [winnerVideoUrl, setWinnerVideoUrl] = useState('');
  const [loserMessage, setLoserMessage] = useState('');
  const [loserImageUrl, setLoserImageUrl] = useState('');
  const [loserVideoUrl, setLoserVideoUrl] = useState('');
  const [messageStatus, setMessageStatus] = useState('');

  const fetchWeeks = useCallback(async () => {
    const { data } = await supabase
      .from('weeks')
      .select('*')
      .eq('season', 2026)
      .order('week_number', { ascending: true });
    if (data) setWeeks(data);
  }, []);

  const fetchGames = useCallback(async (weekId: number) => {
    const { data } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', weekId)
      .order('kickoff_time', { ascending: true });
    if (data) setGames(data);
  }, []);

  useEffect(() => {
    if (!loading && isAdmin) {
      fetchWeeks();
    }
  }, [loading, isAdmin, fetchWeeks]);

  useEffect(() => {
    if (selectedWeekId) {
      fetchGames(selectedWeekId);
      // Load messages for selected week
      const week = weeks.find(w => w.id === selectedWeekId);
      if (week) {
        setWinnerMessage(week.winner_message || '');
        setWinnerImageUrl(week.winner_image_url || '');
        setWinnerVideoUrl(week.winner_video_url || '');
        setLoserMessage(week.loser_message || '');
        setLoserImageUrl(week.loser_image_url || '');
        setLoserVideoUrl(week.loser_video_url || '');
      }
    }
  }, [selectedWeekId, weeks, fetchGames]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>;
  }

  if (!isAdmin) {
    router.push('/');
    return null;
  }

  const selectedWeek = weeks.find(w => w.id === selectedWeekId);
  const isWeekLocked = selectedWeek?.picks_lock_at ? new Date(selectedWeek.picks_lock_at) <= new Date() : false;

  const handleCreateWeek = async () => {
    setSlateStatus('Creating week...');
    const res = await fetch('/api/admin/create-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekNumber: newWeekNumber, season: 2026 }),
    });
    const data = await res.json();
    if (data.success) {
      setSlateStatus(`Week ${newWeekNumber} created!`);
      await fetchWeeks();
      setSelectedWeekId(data.week.id);
      setNewWeekNumber(newWeekNumber + 1);
    } else {
      setSlateStatus(`Error: ${data.error}`);
    }
  };

  const handleAddGames = async () => {
    if (!selectedWeekId) return;
    setIsProcessing(true);
    setSlateStatus('Parsing matchups and fetching odds...');

    const matchups = matchupText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.includes('@'));

    if (matchups.length === 0) {
      setSlateStatus('No valid matchups found. Use format: Away@Home (one per line)');
      setIsProcessing(false);
      return;
    }

    const res = await fetch('/api/admin/add-games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekId: selectedWeekId, matchups }),
    });
    const data = await res.json();

    if (data.success) {
      const added = data.results.filter((r: { status: string }) => r.status === 'added').length;
      const updated = data.results.filter((r: { status: string }) => r.status === 'updated').length;
      const failed = data.results.filter((r: { status: string }) => r.status === 'no_api_match' || r.status === 'no_spread_found');

      let statusMsg = `Done! ${added} added, ${updated} updated.`;
      if (failed.length > 0) {
        statusMsg += ` ${failed.length} couldn't be matched: ${failed.map((f: { matchup: string }) => f.matchup).join(', ')}`;
      }
      statusMsg += ` (${data.creditsRemaining} API credits remaining)`;
      setSlateStatus(statusMsg);
      setMatchupText('');
      await fetchGames(selectedWeekId);
    } else {
      setSlateStatus(`Error: ${data.error}`);
    }
    setIsProcessing(false);
  };

  const handlePublishSlate = async () => {
    if (!selectedWeekId || !lockDate) {
      setSlateStatus('Please select a lock date (Saturday)');
      return;
    }

    const res = await fetch('/api/admin/publish-slate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekId: selectedWeekId, lockDate }),
    });
    const data = await res.json();

    if (data.success) {
      setSlateStatus('Slate published! Users can now see games and make picks.');
      await fetchWeeks();
    } else {
      setSlateStatus(`Error: ${data.error}`);
    }
  };

  const handleRefreshOdds = async () => {
    if (!selectedWeekId) return;
    setIsProcessing(true);
    setSlateStatus('Refreshing odds from API...');

    const res = await fetch('/api/admin/refresh-odds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekId: selectedWeekId }),
    });
    const data = await res.json();

    if (data.success) {
      setSlateStatus(`Updated ${data.updated}/${data.total} games. (${data.creditsRemaining} credits remaining)`);
      await fetchGames(selectedWeekId);
    } else {
      setSlateStatus(`Error: ${data.error}`);
    }
    setIsProcessing(false);
  };

  const handleSendReminder = async () => {
    if (!selectedWeekId) return;
    setReminderStatus('Sending reminders...');

    const res = await fetch('/api/admin/send-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekId: selectedWeekId }),
    });
    const data = await res.json();

    if (data.success) {
      setReminderStatus(
        `Sent to ${data.sent}/${data.targeted} player(s) with incomplete picks.` +
        (data.pruned ? ` Removed ${data.pruned} expired subscription(s).` : '')
      );
      await fetchWeeks();
    } else {
      setReminderStatus(`Error: ${data.error}`);
    }
  };

  const handleDeleteGame = async (gameId: string) => {
    if (!confirm('Remove this game from the slate? Any picks on it will be deleted.')) return;

    const res = await fetch('/api/admin/delete-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    });
    const data = await res.json();

    if (data.success && selectedWeekId) {
      await fetchGames(selectedWeekId);
    }
  };

  const handleSettleWeek = async (autoFetch: boolean) => {
    if (!selectedWeekId) return;
    setSettleStatus(autoFetch ? 'Fetching scores and settling...' : 'Settling with current scores...');

    const res = await fetch('/api/admin/settle-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekId: selectedWeekId, autoFetch }),
    });
    const data = await res.json();

    if (data.success) {
      const winners = data.results.filter((r: { isWinner: boolean }) => r.isWinner).length;
      const losers = data.results.filter((r: { isLoser: boolean }) => r.isLoser).length;
      setSettleStatus(`Week settled! ${winners} winner(s), ${losers} loser(s). Don't forget to set the roast message!`);
      await fetchWeeks();
      if (selectedWeekId) await fetchGames(selectedWeekId);
    } else {
      setSettleStatus(`Error: ${data.error}`);
    }
  };

  const handleSaveMessages = async () => {
    if (!selectedWeekId) return;
    setMessageStatus('Saving...');

    const res = await fetch('/api/admin/save-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weekId: selectedWeekId,
        winnerMessage, winnerImageUrl, winnerVideoUrl,
        loserMessage, loserImageUrl, loserVideoUrl,
      }),
    });
    const data = await res.json();

    if (data.success) {
      setMessageStatus('Messages saved! Winners/losers will see them on next login.');
      await fetchWeeks();
    } else {
      setMessageStatus(`Error: ${data.error}`);
    }
  };

  const handleSetGameOfWeek = async (gameId: string) => {
    if (!selectedWeekId) return;

    const res = await fetch('/api/admin/set-game-of-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, weekId: selectedWeekId }),
    });
    const data = await res.json();

    if (data.success) {
      await fetchGames(selectedWeekId);
    } else {
      setSlateStatus(`Error: ${data.error}`);
    }
  };

  const handleFetchPicks = async () => {
    if (!selectedWeekId) return;
    const res = await fetch(`/api/admin/view-picks?weekId=${selectedWeekId}`);
    const data = await res.json();
    if (data.success) {
      setPickUsers(data.users);
      setAdminPicks(data.picks);
      setPicksLoaded(true);
    }
  };

  const formatSpread = (game: Game) => {
    const sign = game.spread_value > 0 ? '+' : '';
    return `${game.spread_team} ${sign}${game.spread_value}`;
  };

  const formatKickoff = (time: string | null) => {
    if (!time) return 'TBD';
    return new Date(time).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    });
  };

  return (
    <>
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

        {/* Week Selector */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedWeekId || ''}
              onChange={(e) => setSelectedWeekId(e.target.value ? Number(e.target.value) : null)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="">Select a week...</option>
              {weeks.map(w => (
                <option key={w.id} value={w.id}>
                  Week {w.week_number}
                  {w.is_settled ? ' ✓ Settled' : w.slate_published_at ? ' 📋 Published' : ' (Draft)'}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 ml-auto">
              <input
                type="number"
                value={newWeekNumber}
                onChange={(e) => setNewWeekNumber(parseInt(e.target.value) || 1)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white w-20"
                min={1}
                max={15}
              />
              <button
                onClick={handleCreateWeek}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              >
                Create Week
              </button>
            </div>
          </div>
        </div>

        {selectedWeekId && (
          <>
            {/* Tabs */}
            <div className="flex rounded-lg bg-gray-900 border border-gray-800 p-1 mb-6">
              {(['slate', 'picks', 'settle', 'messages'] as AdminTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); if (tab === 'picks') handleFetchPicks(); }}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-colors capitalize ${
                    activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  {tab === 'slate' ? '📋 Slate' : tab === 'picks' ? '👥 Picks' : tab === 'settle' ? '⚖️ Settle' : '💬 Messages'}
                </button>
              ))}
            </div>

            {/* SLATE TAB */}
            {activeTab === 'slate' && (
              <div className="space-y-4">
                {/* Input Area */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <h2 className="text-lg font-semibold mb-3">Add Matchups</h2>
                  <p className="text-sm text-gray-400 mb-3">
                    Paste matchups one per line in <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">Away@Home</code> format
                  </p>
                  <textarea
                    value={matchupText}
                    onChange={(e) => setMatchupText(e.target.value)}
                    placeholder={`Alabama@LSU\nOhio State@Michigan\nTexas@Oklahoma`}
                    className="w-full h-48 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 font-mono text-sm resize-none"
                  />
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      onClick={handleAddGames}
                      disabled={isProcessing || !matchupText.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      {isProcessing ? 'Processing...' : 'Fetch Odds & Add Games'}
                    </button>
                    <button
                      onClick={handleRefreshOdds}
                      disabled={isProcessing || games.length === 0}
                      className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      {isProcessing ? 'Refreshing...' : '🔄 Refresh All Odds'}
                    </button>
                  </div>
                </div>

                {/* Publish Area */}
                {games.length > 0 && !selectedWeek?.slate_published_at && (
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                    <h2 className="text-lg font-semibold mb-3">Publish Slate</h2>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Lock Date (Saturday)</label>
                        <input
                          type="date"
                          value={lockDate}
                          onChange={(e) => setLockDate(e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                      <button
                        onClick={handlePublishSlate}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                      >
                        Publish to Users
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Picks will lock at 11:59 AM ET on the selected date.</p>
                  </div>
                )}

                {selectedWeek?.slate_published_at && (
                  <div className="bg-green-900/20 border border-green-800 rounded-xl p-4">
                    <p className="text-green-400 text-sm">
                      ✓ Slate published — Picks lock at{' '}
                      {selectedWeek.picks_lock_at
                        ? new Date(selectedWeek.picks_lock_at).toLocaleString('en-US', {
                            weekday: 'short', month: 'short', day: 'numeric',
                            hour: 'numeric', minute: '2-digit',
                            timeZone: 'America/New_York', timeZoneName: 'short',
                          })
                        : 'N/A'}
                    </p>
                  </div>
                )}

                {selectedWeek?.slate_published_at && !selectedWeek?.is_settled && (
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                    <h2 className="text-lg font-semibold mb-2">🔔 Pick Reminders</h2>
                    <p className="text-sm text-gray-400 mb-3">
                      Notifies anyone with incomplete picks for this week. Sends automatically ~1 day before lock, or trigger it manually below.
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleSendReminder}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        Send Reminder Now
                      </button>
                      {selectedWeek?.reminder_sent_at && (
                        <span className="text-xs text-gray-500">
                          Last sent{' '}
                          {new Date(selectedWeek.reminder_sent_at).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                            timeZone: 'America/New_York', timeZoneName: 'short',
                          })}
                        </span>
                      )}
                    </div>
                    {reminderStatus && (
                      <p className={`text-sm mt-2 ${reminderStatus.startsWith('Error') ? 'text-red-400' : 'text-blue-400'}`}>
                        {reminderStatus}
                      </p>
                    )}
                  </div>
                )}

                {/* Status */}
                {slateStatus && (
                  <div className={`rounded-lg p-3 text-sm ${
                    slateStatus.startsWith('Error') ? 'bg-red-400/10 text-red-400' : 'bg-blue-400/10 text-blue-400'
                  }`}>
                    {slateStatus}
                  </div>
                )}

                {/* Games List */}
                {games.length > 0 && (
                  <div className="bg-gray-900 rounded-xl border border-gray-800">
                    <div className="p-4 border-b border-gray-800">
                      <h2 className="text-lg font-semibold">
                        Current Slate ({games.length} game{games.length !== 1 ? 's' : ''})
                      </h2>
                    </div>
                    <div className="divide-y divide-gray-800">
                      {games.map(game => (
                        <div
                          key={game.id}
                          className={`p-4 flex items-center justify-between ${game.is_game_of_week ? 'bg-yellow-500/5' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            {game.is_game_of_week && (
                              <div className="text-xs font-semibold text-yellow-400 mb-1">⭐ Game of the Week</div>
                            )}
                            <div className="text-white font-medium">
                              {game.away_team} @ {game.home_team}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                              <span className="text-sm text-yellow-400 font-medium">
                                {formatSpread(game)}
                              </span>
                              <span className="text-sm text-gray-500">
                                {formatKickoff(game.kickoff_time)}
                              </span>
                              {game.is_final && (
                                <span className="text-sm text-green-400">
                                  Final: {game.away_score}–{game.home_score}
                                  {game.winning_side && ` (${game.winning_side} covers)`}
                                </span>
                              )}
                            </div>
                          </div>
                          {!selectedWeek?.is_settled && !isWeekLocked && (
                            <button
                              onClick={() => handleSetGameOfWeek(game.id)}
                              className={`ml-3 p-2 transition-colors ${
                                game.is_game_of_week ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-500 hover:text-yellow-400'
                              }`}
                              title={game.is_game_of_week ? 'Unset Game of the Week' : 'Set as Game of the Week'}
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill={game.is_game_of_week ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                strokeWidth="1.5"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 2.5l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7-5.4-4.8 7.1-.7z"
                                />
                              </svg>
                            </button>
                          )}
                          {!selectedWeek?.is_settled && (
                            <button
                              onClick={() => handleDeleteGame(game.id)}
                              className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                              title="Remove game"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PICKS TAB */}
            {activeTab === 'picks' && (
              <div className="space-y-4">
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">User Picks — Week {selectedWeek?.week_number}</h2>
                    <button
                      onClick={handleFetchPicks}
                      className="px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                    >
                      🔄 Refresh
                    </button>
                  </div>

                  {!picksLoaded ? (
                    <p className="text-gray-400 text-sm">Loading picks...</p>
                  ) : pickUsers.length === 0 ? (
                    <p className="text-gray-400 text-sm">No users registered yet.</p>
                  ) : (
                    <div className="divide-y divide-gray-800">
                      {pickUsers.map(u => {
                        const userPicks = adminPicks.filter(p => p.user_id === u.id);
                        return (
                          <div key={u.id} className="py-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-white font-medium">
                                {u.first_name} {u.last_name}
                              </span>
                              <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                                userPicks.length === 0
                                  ? 'bg-red-900/30 text-red-400'
                                  : userPicks.length >= 10
                                  ? 'bg-green-900/30 text-green-400'
                                  : 'bg-yellow-900/30 text-yellow-400'
                              }`}>
                                {userPicks.length} pick{userPicks.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {userPicks.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {userPicks.map(pick => {
                                  const game = games.find(g => g.id === pick.game_id);
                                  return (
                                    <span
                                      key={pick.id}
                                      className={`text-xs px-2 py-1 rounded ${
                                        pick.is_correct === true
                                          ? 'bg-green-900/30 text-green-400'
                                          : pick.is_correct === false
                                          ? 'bg-red-900/30 text-red-400'
                                          : 'bg-gray-800 text-gray-300'
                                      }`}
                                    >
                                      {pick.picked_team}
                                      {game && ` (vs ${pick.picked_team === game.home_team ? game.away_team : game.home_team})`}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Summary */}
                {picksLoaded && (
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                    <h3 className="text-sm font-semibold text-gray-400 mb-2">Summary</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-white">
                          {pickUsers.filter(u => adminPicks.some(p => p.user_id === u.id)).length}
                        </div>
                        <div className="text-xs text-gray-500">Have picked</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-yellow-400">
                          {pickUsers.filter(u => !adminPicks.some(p => p.user_id === u.id)).length}
                        </div>
                        <div className="text-xs text-gray-500">Haven&apos;t picked</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-400">
                          {adminPicks.length}
                        </div>
                        <div className="text-xs text-gray-500">Total picks</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SETTLE TAB */}
            {activeTab === 'settle' && (
              <div className="space-y-4">
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <h2 className="text-lg font-semibold mb-3">Settle Week {selectedWeek?.week_number}</h2>
                  {selectedWeek?.is_settled ? (
                    <p className="text-green-400">✓ This week has been settled.</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-400 mb-4">
                        Fetch final scores from the API and grade all picks automatically.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => handleSettleWeek(true)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                          Fetch Scores & Settle
                        </button>
                        <button
                          onClick={() => handleSettleWeek(false)}
                          className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
                        >
                          Settle with Current Scores
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {settleStatus && (
                  <div className={`rounded-lg p-3 text-sm ${
                    settleStatus.startsWith('Error') ? 'bg-red-400/10 text-red-400' : 'bg-green-400/10 text-green-400'
                  }`}>
                    {settleStatus}
                  </div>
                )}

                {/* Show games with scores */}
                {games.length > 0 && (
                  <div className="bg-gray-900 rounded-xl border border-gray-800">
                    <div className="p-4 border-b border-gray-800">
                      <h2 className="text-lg font-semibold">Games & Scores</h2>
                    </div>
                    <div className="divide-y divide-gray-800">
                      {games.map(game => (
                        <div key={game.id} className={`p-4 ${game.is_game_of_week ? 'bg-yellow-500/5' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              {game.is_game_of_week && (
                                <div className="text-xs font-semibold text-yellow-400 mb-1">⭐ Game of the Week (2x)</div>
                              )}
                              <div className="text-white font-medium">
                                {game.away_team} @ {game.home_team}
                              </div>
                              <span className="text-sm text-yellow-400">{formatSpread(game)}</span>
                            </div>
                            <div className="text-right">
                              {game.is_final ? (
                                <>
                                  <div className="text-white font-mono">
                                    {game.away_score} – {game.home_score}
                                  </div>
                                  <div className={`text-xs mt-0.5 ${
                                    game.winning_side === 'push' ? 'text-yellow-400' :
                                    game.winning_side === 'home' ? 'text-green-400' : 'text-blue-400'
                                  }`}>
                                    {game.winning_side === 'push' ? 'Push' :
                                     game.winning_side === 'home' ? `${game.home_team} covers` :
                                     `${game.away_team} covers`}
                                  </div>
                                </>
                              ) : (
                                <span className="text-gray-500 text-sm">No score yet</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MESSAGES TAB */}
            {activeTab === 'messages' && (
              <div className="space-y-4">
                {/* Winner Message */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <h2 className="text-lg font-semibold mb-3">🏆 Winner Message</h2>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Message</label>
                      <textarea
                        value={winnerMessage}
                        onChange={(e) => setWinnerMessage(e.target.value)}
                        placeholder="Congrats! You dominated this week..."
                        className="w-full h-24 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Image URL (optional)</label>
                      <input
                        type="url"
                        value={winnerImageUrl}
                        onChange={(e) => setWinnerImageUrl(e.target.value)}
                        placeholder="https://i.imgur.com/example.jpg"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">YouTube URL (optional)</label>
                      <input
                        type="url"
                        value={winnerVideoUrl}
                        onChange={(e) => setWinnerVideoUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Loser Message */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <h2 className="text-lg font-semibold mb-3">💀 Loser Roast</h2>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Roast Message</label>
                      <textarea
                        value={loserMessage}
                        onChange={(e) => setLoserMessage(e.target.value)}
                        placeholder="Wow, that was embarrassing..."
                        className="w-full h-24 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Image URL (optional)</label>
                      <input
                        type="url"
                        value={loserImageUrl}
                        onChange={(e) => setLoserImageUrl(e.target.value)}
                        placeholder="https://i.imgur.com/example.jpg"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">YouTube URL (optional)</label>
                      <input
                        type="url"
                        value={loserVideoUrl}
                        onChange={(e) => setLoserVideoUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSaveMessages}
                  className="w-full py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Save Messages
                </button>

                {messageStatus && (
                  <div className={`rounded-lg p-3 text-sm ${
                    messageStatus.startsWith('Error') ? 'bg-red-400/10 text-red-400' : 'bg-green-400/10 text-green-400'
                  }`}>
                    {messageStatus}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
