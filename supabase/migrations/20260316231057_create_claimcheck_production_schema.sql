/*
  # ClaimCheck Production Database Schema

  1. New Tables
    
    - `claims`
      - `id` (uuid, primary key)
      - `original_text` (text) - The exact claim as entered by user
      - `normalized_text` (text) - Cleaned version for matching
      - `category` (text) - politics, health, product, science, economics, technology, environment
      - `current_status` (text) - Well Supported, Partially Supported, Misleading, Under Debate, Insufficient Evidence
      - `evidence_quality` (text) - High, Moderate, Limited
      - `summary_text` (text) - What strong evidence shows
      - `global_interpretations_text` (text) - Regional perspectives (for political topics)
      - `misinformation_pattern_text` (text) - Why people get misled
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `claim_runs`
      - `id` (uuid, primary key)
      - `claim_id` (uuid, references claims)
      - `run_status` (text) - pending, completed, failed
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz)
      - `error_message` (text)
    
    - `sources`
      - `id` (uuid, primary key)
      - `claim_id` (uuid, references claims)
      - `claim_run_id` (uuid, references claim_runs)
      - `url` (text)
      - `title` (text)
      - `publisher` (text)
      - `source_type` (text) - Peer-reviewed research, Government data, etc.
      - `region` (text)
      - `publish_date` (date)
      - `snippet_text` (text)
      - `credibility_score` (numeric)
      - `retrieval_method` (text)
      - `created_at` (timestamptz)
    
    - `claim_takes`
      - `id` (uuid, primary key)
      - `claim_id` (uuid, references claims)
      - `claim_run_id` (uuid, references claim_runs)
      - `take_text` (text)
      - `source_id` (uuid, references sources, nullable)
      - `display_order` (integer)
    
    - `claim_consensus_points`
      - `id` (uuid, primary key)
      - `claim_id` (uuid, references claims)
      - `claim_run_id` (uuid, references claim_runs)
      - `point_text` (text)
      - `display_order` (integer)
    
    - `claim_disputes`
      - `id` (uuid, primary key)
      - `claim_id` (uuid, references claims)
      - `claim_run_id` (uuid, references claim_runs)
      - `point_text` (text)
      - `display_order` (integer)
    
    - `recommended_topics`
      - `id` (uuid, primary key)
      - `title` (text)
      - `claim_text` (text)
      - `category` (text)
      - `description` (text)
      - `is_active` (boolean)
      - `sort_order` (integer)
      - `created_at` (timestamptz)
    
    - `trending_claims`
      - `id` (uuid, primary key)
      - `title` (text)
      - `claim_text` (text)
      - `category` (text)
      - `trend_score` (integer)
      - `is_active` (boolean)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - All tables are publicly readable (no auth required)
    - No insert/update policies for public users
*/

CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_text text NOT NULL,
  normalized_text text NOT NULL,
  category text NOT NULL,
  current_status text NOT NULL,
  evidence_quality text NOT NULL,
  summary_text text NOT NULL,
  global_interpretations_text text,
  misinformation_pattern_text text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Claims are publicly viewable"
  ON claims FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS claim_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  run_status text NOT NULL DEFAULT 'pending',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  error_message text
);

ALTER TABLE claim_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Claim runs are publicly viewable"
  ON claim_runs FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  claim_run_id uuid NOT NULL REFERENCES claim_runs(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text NOT NULL,
  publisher text,
  source_type text NOT NULL,
  region text,
  publish_date date,
  snippet_text text,
  credibility_score numeric(3,2) DEFAULT 0.5,
  retrieval_method text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sources are publicly viewable"
  ON sources FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS claim_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  claim_run_id uuid NOT NULL REFERENCES claim_runs(id) ON DELETE CASCADE,
  take_text text NOT NULL,
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  display_order integer DEFAULT 0
);

ALTER TABLE claim_takes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Claim takes are publicly viewable"
  ON claim_takes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS claim_consensus_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  claim_run_id uuid NOT NULL REFERENCES claim_runs(id) ON DELETE CASCADE,
  point_text text NOT NULL,
  display_order integer DEFAULT 0
);

ALTER TABLE claim_consensus_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consensus points are publicly viewable"
  ON claim_consensus_points FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS claim_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  claim_run_id uuid NOT NULL REFERENCES claim_runs(id) ON DELETE CASCADE,
  point_text text NOT NULL,
  display_order integer DEFAULT 0
);

ALTER TABLE claim_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dispute points are publicly viewable"
  ON claim_disputes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS recommended_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  claim_text text NOT NULL,
  category text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recommended_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recommended topics are publicly viewable"
  ON recommended_topics FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE TABLE IF NOT EXISTS trending_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  claim_text text NOT NULL,
  category text NOT NULL,
  trend_score integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE trending_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trending claims are publicly viewable"
  ON trending_claims FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE INDEX IF NOT EXISTS idx_claims_normalized ON claims(normalized_text);
CREATE INDEX IF NOT EXISTS idx_claims_category ON claims(category);
CREATE INDEX IF NOT EXISTS idx_sources_claim_id ON sources(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_runs_claim_id ON claim_runs(claim_id);
CREATE INDEX IF NOT EXISTS idx_recommended_topics_sort ON recommended_topics(sort_order);
CREATE INDEX IF NOT EXISTS idx_trending_claims_score ON trending_claims(trend_score DESC);
