-- Run this in your Supabase project: Dashboard → SQL Editor → New Query → paste & run

CREATE TABLE IF NOT EXISTS user_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  preferences JSONB NOT NULL DEFAULT '{}',
  sport_order JSONB NOT NULL DEFAULT '["mlb","nba","nfl","nhl"]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security: each user can only see/edit their own row
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preferences"
  ON user_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
