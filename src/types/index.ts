export interface User {
  id: string;
  first_name: string;
  last_name: string;
  school_slug: string | null;
  created_at: string;
}

export interface SchoolColor {
  slug: string;
  display_name: string;
  conference: string;
  primary_color: string;
  secondary_color: string;
}

export interface Week {
  id: number;
  week_number: number;
  season: number;
  slate_published_at: string | null;
  picks_lock_at: string | null;
  is_settled: boolean;
  reminder_sent_at: string | null;
  winner_message: string | null;
  winner_image_url: string | null;
  winner_video_url: string | null;
  loser_message: string | null;
  loser_image_url: string | null;
  loser_video_url: string | null;
}

export interface Game {
  id: string;
  week_id: number;
  api_game_id: string | null;
  away_team: string;
  home_team: string;
  spread_team: string;
  spread_value: number;
  kickoff_time: string | null;
  home_score: number | null;
  away_score: number | null;
  is_final: boolean;
  winning_side: string | null;
  is_game_of_week: boolean;
}

export interface Pick {
  id: string;
  user_id: string;
  game_id: string;
  picked_team: string;
  is_correct: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface WeeklyResult {
  id: string;
  user_id: string;
  week_id: number;
  points: number;
  is_weekly_winner: boolean;
  is_weekly_loser: boolean;
  has_seen_popup: boolean;
  prev_season_rank: number | null;
  new_season_rank: number | null;
  rank_change: number;
}
