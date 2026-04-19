-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- ============================================================
-- users
-- ============================================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,
  preferences   JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- travel_groups
-- ============================================================
CREATE TABLE travel_groups (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  description   TEXT,
  destination   TEXT,
  start_date    DATE,
  end_date      DATE,
  cover_image   TEXT,
  invite_code   TEXT UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- group_members
-- ============================================================
CREATE TABLE group_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id   UUID NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

-- ============================================================
-- preferences
-- ============================================================
CREATE TABLE preferences (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id      UUID REFERENCES travel_groups(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,   -- e.g. 'food', 'activity', 'accommodation'
  tags          TEXT[] DEFAULT '{}',
  budget_level  SMALLINT CHECK (budget_level BETWEEN 1 AND 5),
  extra         JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- pois  (points of interest)
-- ============================================================
CREATE TABLE pois (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id      UUID NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
  added_by      UUID NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  address       TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  image_url     TEXT,
  source_url    TEXT,
  tags          TEXT[] DEFAULT '{}',
  embedding     VECTOR(1536),   -- for semantic search via pgvector
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON pois USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- votes
-- ============================================================
CREATE TABLE votes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poi_id     UUID NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
  value      SMALLINT NOT NULL CHECK (value IN (-1, 0, 1)),  -- -1 dislike, 0 neutral, 1 like
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poi_id, user_id)
);

-- ============================================================
-- itineraries
-- ============================================================
CREATE TABLE itineraries (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id     UUID NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  is_final     BOOLEAN NOT NULL DEFAULT FALSE,
  version      INT NOT NULL DEFAULT 1,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- slots  (time blocks within an itinerary)
-- ============================================================
CREATE TABLE slots (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_id   UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  day_index      SMALLINT NOT NULL DEFAULT 1,
  position       SMALLINT NOT NULL DEFAULT 0,
  poi_id         UUID REFERENCES pois(id) ON DELETE SET NULL,
  title          TEXT,
  start_time     TIME,
  end_time       TIME,
  duration_min   INT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- alternatives  (suggested swaps for a slot)
-- ============================================================
CREATE TABLE alternatives (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slot_id   UUID NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  poi_id    UUID NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
  score     REAL,
  reason    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- tickets  (bookings / reservations)
-- ============================================================
CREATE TABLE tickets (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id       UUID NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
  poi_id         UUID REFERENCES pois(id) ON DELETE SET NULL,
  slot_id        UUID REFERENCES slots(id) ON DELETE SET NULL,
  booked_by      UUID NOT NULL REFERENCES users(id),
  title          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  price          NUMERIC(10, 2),
  currency       CHAR(3) DEFAULT 'TWD',
  booking_ref    TEXT,
  confirmation   JSONB DEFAULT '{}',
  booked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- reels_analyses  (AI analysis of short video / reels imports)
-- ============================================================
CREATE TABLE reels_analyses (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id      UUID NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
  added_by      UUID NOT NULL REFERENCES users(id),
  source_url    TEXT NOT NULL,
  platform      TEXT,   -- 'instagram', 'tiktok', 'youtube', etc.
  raw_transcript TEXT,
  extracted_pois JSONB DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- events  (activity log / real-time feed)
-- ============================================================
CREATE TABLE events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id   UUID NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT NOT NULL,   -- 'poi_added', 'vote_cast', 'itinerary_updated', etc.
  payload    JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON events (group_id, created_at DESC);

-- ============================================================
-- decisions  (final resolved choices for a group)
-- ============================================================
CREATE TABLE decisions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id     UUID NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
  itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,
  category     TEXT NOT NULL,   -- 'destination', 'accommodation', 'activity', etc.
  resolved_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  choice       JSONB NOT NULL DEFAULT '{}',
  rationale    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- updated_at trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at        BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_travel_groups_updated_at BEFORE UPDATE ON travel_groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pois_updated_at         BEFORE UPDATE ON pois         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_itineraries_updated_at  BEFORE UPDATE ON itineraries  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Row Level Security (enable, but leave policies for later)
-- ============================================================
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_groups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pois            ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE alternatives    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reels_analyses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions       ENABLE ROW LEVEL SECURITY;
