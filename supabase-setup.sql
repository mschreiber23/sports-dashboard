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

DROP POLICY IF EXISTS "Users can manage their own preferences" ON user_preferences;
CREATE POLICY "Users can manage their own preferences"
  ON user_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Prop reads: the price and the model before lock, then the result after the game.
-- The app still keeps a copy on the device if this table is not created yet.
CREATE TABLE IF NOT EXISTS prop_reads (
  id          TEXT PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  league      TEXT NOT NULL,
  event_slug  TEXT NOT NULL,
  game        TEXT NOT NULL,
  game_start  TIMESTAMPTZ NOT NULL,
  player      TEXT NOT NULL,
  team        TEXT,
  opponent    TEXT,
  prop_type   TEXT NOT NULL,
  prop_label  TEXT NOT NULL,
  line        NUMERIC NOT NULL,
  price       NUMERIC NOT NULL,
  model_p     NUMERIC NOT NULL,
  base_p      NUMERIC,
  edge        NUMERIC NOT NULL,
  rate        INTEGER,
  hits        INTEGER,
  sample      INTEGER,
  tags        JSONB NOT NULL DEFAULT '[]',
  result      TEXT,
  actual      NUMERIC,
  graded_at   TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  priced_at   TIMESTAMPTZ
);

ALTER TABLE prop_reads ADD COLUMN IF NOT EXISTS base_p NUMERIC;
ALTER TABLE prop_reads ADD COLUMN IF NOT EXISTS priced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS prop_reads_user_start ON prop_reads (user_id, game_start);

ALTER TABLE prop_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own prop reads" ON prop_reads;
CREATE POLICY "Users can manage their own prop reads"
  ON prop_reads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trades the user actually took, settled against the unit they risked.
CREATE TABLE IF NOT EXISTS prop_trades (
  id          TEXT PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  league      TEXT NOT NULL,
  event_slug  TEXT NOT NULL,
  game        TEXT NOT NULL,
  game_start  TIMESTAMPTZ NOT NULL,
  player      TEXT NOT NULL,
  prop_type   TEXT NOT NULL,
  prop_label  TEXT NOT NULL,
  line        NUMERIC,
  side        TEXT NOT NULL,
  price       NUMERIC NOT NULL,
  unit        NUMERIC NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'player',
  pick        TEXT,
  pick_abbr   TEXT,
  teams       JSONB NOT NULL DEFAULT '[]',
  prediction  TEXT,
  edge        NUMERIC,
  result      TEXT,
  actual      NUMERIC,
  graded_at   TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE prop_trades ADD COLUMN IF NOT EXISTS prediction TEXT;
ALTER TABLE prop_trades ADD COLUMN IF NOT EXISTS edge NUMERIC;

CREATE INDEX IF NOT EXISTS prop_trades_user_start ON prop_trades (user_id, game_start);

ALTER TABLE prop_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own prop trades" ON prop_trades;
CREATE POLICY "Users can manage their own prop trades"
  ON prop_trades
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
