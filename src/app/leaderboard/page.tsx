'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';

type LeaderboardTab = 'season' | 'weekly' | 'trends' | 'shame';

interface StandingEntry {
  rank: number;
  userId: string;
  firstName: string;
  lastName: string;
  schoolSlug: string | null;
  schoolColors: { primary_color: string; secondary_color: string; display_name: string } | null;
  total: number;
  rankChange: number;
}

interface WeeklyResultEntry {
  user_id: string;
  week_id: number;
  correct_count: number;
  is_weekly_winner: boolean;
  is_weekly_loser: boolean;
}

interface UserEntry {
  id: string;
  first_name: string;
  last_name: string;
  school_slug: string | null;
  school_colors: { primary_color: string; secondary_color: string; display_name: string } | null;
}

interface WeekEntry {
  id: number;
  week_number: number;
  loser_message: string | null;
  loser_image_url: string | null;
  loser_video_url: string | null;
}

interface WallOfShameData {
  week: WeekEntry;
  losers: { userId: string; firstName: string; lastName: string; correctCount: number }[];
}

export default function LeaderboardPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<LeaderboardTab>('season');
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [results, setResults] = useState<WeeklyResultEntry[]>([]);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [weeks, setWeeks] = useState<WeekEntry[]>([]);
  const [trendData, setTrendData] = useState<Record<string, number | string>[]>([]);
  const [wallOfShame, setWallOfShame] = useState<WallOfShameData | null>(null);
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    if (data.success) {
      setStandings(data.seasonStandings);
      setResults(data.results);
      setUsers(data.users);
      setWeeks(data.weeks);
      setTrendData(data.trendData);
      setWallOfShame(data.wallOfShame);
      if (data.weeks.length > 0) {
        setSelectedWeekId(data.weeks[data.weeks.length - 1].id);
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loading && !user && !isAdmin) {
      router.push('/');
    }
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (user || isAdmin) fetchData();
  }, [user, isAdmin, fetchData]);

  if (loading || !loaded) {
    return (
      <>
        <NavBar />
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-gray-400">Loading...</div>
        </div>
      </>
    );
  }

  if (!user && !isAdmin) return null;

  // Weekly data for selected week
  const weeklyResults = results
    .filter(r => r.week_id === selectedWeekId)
    .sort((a, b) => b.correct_count - a.correct_count);

  // Trend chart dimensions
  const chartWidth = 600;
  const chartHeight = 300;
  const chartPadding = { top: 20, right: 20, bottom: 40, left: 40 };
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;

  // Calculate trend chart paths
  const maxTotal = Math.max(
    ...trendData.flatMap(d =>
      users.map(u => (typeof d[u.id] === 'number' ? d[u.id] as number : 0))
    ),
    1
  );

  const getX = (idx: number) => chartPadding.left + (trendData.length > 1 ? (idx / (trendData.length - 1)) * plotWidth : plotWidth / 2);
  const getY = (val: number) => chartPadding.top + plotHeight - (val / maxTotal) * plotHeight;

  // Default colors for users without school colors
  const defaultColors = ['#60A5FA', '#F87171', '#34D399', '#FBBF24', '#A78BFA', '#FB923C', '#2DD4BF', '#F472B6', '#818CF8', '#4ADE80', '#F97316', '#E879F9', '#22D3EE', '#A3E635', '#FB7185'];

  const getUserColor = (userEntry: UserEntry, index: number) => {
    if (userEntry.school_colors?.primary_color) return userEntry.school_colors.primary_color;
    return defaultColors[index % defaultColors.length];
  };

  return (
    <>
      <NavBar />
      <main className="max-w-lg mx-auto px-4 py-4 pb-24">
        <h1 className="text-2xl font-bold mb-4">Leaderboard</h1>

        {weeks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No settled weeks yet. Check back after Week 1 results are in!</p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex rounded-lg bg-gray-900 border border-gray-800 p-1 mb-4">
              {(['season', 'weekly', 'trends', 'shame'] as LeaderboardTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                    activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  {tab === 'season' ? '🏆 Season' : tab === 'weekly' ? '📅 Weekly' : tab === 'trends' ? '📈 Trends' : '💀 Shame'}
                </button>
              ))}
            </div>

            {/* SEASON STANDINGS */}
            {activeTab === 'season' && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="divide-y divide-gray-800">
                  {standings.map((entry, idx) => (
                    <div
                      key={entry.userId}
                      className={`flex items-center px-4 py-3 ${idx === 0 ? 'bg-yellow-900/10' : ''}`}
                    >
                      {/* Rank */}
                      <div className="w-8 text-center">
                        <span className={`text-lg font-bold ${
                          idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-400' : 'text-gray-500'
                        }`}>
                          {entry.rank}
                        </span>
                      </div>

                      {/* School color dot + name */}
                      <div className="flex items-center gap-2 flex-1 min-w-0 ml-3">
                        {entry.schoolColors && (
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: entry.schoolColors.primary_color }}
                          />
                        )}
                        <span className="text-white font-medium truncate">
                          {entry.firstName} {entry.lastName}
                        </span>
                      </div>

                      {/* Rank change */}
                      <div className="w-12 text-center">
                        {entry.rankChange > 0 && (
                          <span className="text-green-400 text-sm font-medium">▲{entry.rankChange}</span>
                        )}
                        {entry.rankChange < 0 && (
                          <span className="text-red-400 text-sm font-medium">▼{Math.abs(entry.rankChange)}</span>
                        )}
                        {entry.rankChange === 0 && weeks.length > 1 && (
                          <span className="text-gray-600 text-sm">—</span>
                        )}
                      </div>

                      {/* Total */}
                      <div className="w-12 text-right">
                        <span className="text-white font-bold">{entry.total}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WEEKLY SCOREBOARD */}
            {activeTab === 'weekly' && (
              <div className="space-y-4">
                {/* Week selector */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {weeks.map(w => (
                    <button
                      key={w.id}
                      onClick={() => setSelectedWeekId(w.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                        selectedWeekId === w.id ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      Wk {w.week_number}
                    </button>
                  ))}
                </div>

                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <div className="divide-y divide-gray-800">
                    {weeklyResults.map((result, idx) => {
                      const userEntry = users.find(u => u.id === result.user_id);
                      if (!userEntry) return null;

                      return (
                        <div
                          key={result.user_id}
                          className={`flex items-center px-4 py-3 ${
                            result.is_weekly_winner ? 'bg-yellow-900/10' : result.is_weekly_loser ? 'bg-red-900/10' : ''
                          }`}
                        >
                          <div className="w-8 text-center">
                            {result.is_weekly_winner && <span className="text-lg">🏆</span>}
                            {result.is_weekly_loser && <span className="text-lg">💀</span>}
                            {!result.is_weekly_winner && !result.is_weekly_loser && (
                              <span className="text-gray-500 font-bold">{idx + 1}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-1 ml-3">
                            {userEntry.school_colors && (
                              <div
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: userEntry.school_colors.primary_color }}
                              />
                            )}
                            <span className="text-white font-medium">
                              {userEntry.first_name} {userEntry.last_name}
                            </span>
                          </div>
                          <span className="text-white font-bold">{result.correct_count}</span>
                        </div>
                      );
                    })}
                    {weeklyResults.length === 0 && (
                      <div className="p-4 text-center text-gray-500">No results for this week</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TREND GRAPH */}
            {activeTab === 'trends' && (
              <div className="space-y-4">
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 overflow-x-auto">
                  {trendData.length < 2 ? (
                    <p className="text-gray-400 text-sm text-center py-8">
                      Trend graph will appear after at least 2 weeks are settled.
                    </p>
                  ) : (
                    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" style={{ minWidth: '400px' }}>
                      {/* Grid lines */}
                      {Array.from({ length: 5 }, (_, i) => {
                        const y = chartPadding.top + (i / 4) * plotHeight;
                        const val = Math.round(maxTotal * (1 - i / 4));
                        return (
                          <g key={i}>
                            <line x1={chartPadding.left} y1={y} x2={chartWidth - chartPadding.right} y2={y} stroke="#374151" strokeWidth="1" />
                            <text x={chartPadding.left - 8} y={y + 4} textAnchor="end" fill="#6B7280" fontSize="11">{val}</text>
                          </g>
                        );
                      })}

                      {/* X axis labels */}
                      {trendData.map((d, i) => (
                        <text
                          key={i}
                          x={getX(i)}
                          y={chartHeight - 8}
                          textAnchor="middle"
                          fill="#6B7280"
                          fontSize="11"
                        >
                          {d.week as string}
                        </text>
                      ))}

                      {/* Lines for each user */}
                      {users.map((u, uIdx) => {
                        const color = getUserColor(u, uIdx);
                        const points = trendData.map((d, i) => `${getX(i)},${getY(d[u.id] as number || 0)}`).join(' ');
                        return (
                          <g key={u.id}>
                            <polyline
                              points={points}
                              fill="none"
                              stroke={color}
                              strokeWidth="2"
                              strokeLinejoin="round"
                              opacity="0.8"
                            />
                            {/* Dots */}
                            {trendData.map((d, i) => (
                              <circle
                                key={i}
                                cx={getX(i)}
                                cy={getY(d[u.id] as number || 0)}
                                r="3"
                                fill={color}
                              />
                            ))}
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>

                {/* Legend */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <div className="flex flex-wrap gap-3">
                    {users.map((u, idx) => (
                      <div key={u.id} className="flex items-center gap-1.5">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getUserColor(u, idx) }}
                        />
                        <span className="text-xs text-gray-300">{u.first_name} {u.last_name.charAt(0)}.</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* WALL OF SHAME */}
            {activeTab === 'shame' && (
              <div className="space-y-4">
                {wallOfShame && wallOfShame.losers.length > 0 ? (
                  <div className="bg-gradient-to-b from-red-900/20 to-gray-900 rounded-xl border border-red-800/30 overflow-hidden">
                    <div className="text-center pt-6 pb-4">
                      <div className="text-5xl mb-2">💀</div>
                      <h2 className="text-xl font-bold text-red-400">Wall of Shame</h2>
                      <p className="text-gray-500 text-sm">Week {wallOfShame.week.week_number}</p>
                    </div>

                    <div className="px-6 pb-6 space-y-4">
                      {/* Loser names */}
                      <div className="text-center">
                        {wallOfShame.losers.map((loser, idx) => (
                          <span key={loser.userId} className="text-white text-lg font-bold">
                            {idx > 0 ? ' & ' : ''}{loser.firstName} {loser.lastName}
                          </span>
                        ))}
                        <p className="text-red-400/70 text-sm mt-1">
                          {wallOfShame.losers[0].correctCount} correct pick{wallOfShame.losers[0].correctCount !== 1 ? 's' : ''} 😬
                        </p>
                      </div>

                      {/* Roast message */}
                      {wallOfShame.week.loser_message && (
                        <p className="text-gray-300 text-center italic">
                          &ldquo;{wallOfShame.week.loser_message}&rdquo;
                        </p>
                      )}

                      {/* Roast image */}
                      {wallOfShame.week.loser_image_url && (
                        <div className="rounded-lg overflow-hidden">
                          <img
                            src={wallOfShame.week.loser_image_url}
                            alt="Wall of Shame"
                            className="w-full object-contain max-h-64"
                          />
                        </div>
                      )}

                      {/* Roast video */}
                      {wallOfShame.week.loser_video_url && (() => {
                        const url = wallOfShame.week.loser_video_url!;
                        let embedUrl = null;
                        if (url.includes('youtu.be/')) {
                          const id = url.split('youtu.be/')[1]?.split('?')[0];
                          embedUrl = id ? `https://www.youtube.com/embed/${id}` : null;
                        } else {
                          const match = url.match(/[?&]v=([^&]+)/);
                          if (match) embedUrl = `https://www.youtube.com/embed/${match[1]}`;
                        }
                        return embedUrl ? (
                          <div className="rounded-lg overflow-hidden aspect-video">
                            <iframe
                              src={embedUrl}
                              className="w-full h-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              title="Wall of Shame video"
                            />
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-5xl mb-3">💀</div>
                    <p className="text-gray-400">No losers yet. Wall of Shame is coming!</p>
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
