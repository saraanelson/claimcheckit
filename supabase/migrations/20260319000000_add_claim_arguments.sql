/*
  # Add structured arguments (pro/con) for debated claims

  1. New Tables
    - `claim_arguments`
      - `id` (uuid, primary key)
      - `claim_id` (uuid, references claims)
      - `claim_run_id` (uuid, references claim_runs)
      - `side` (text) - 'supporting' or 'opposing'
      - `argument_text` (text) - The argument itself
      - `evidence_text` (text) - Supporting evidence summary
      - `source_ids` (uuid[]) - Sources backing this argument
      - `strength` (text) - 'strong', 'moderate', 'weak'
      - `display_order` (integer)

  2. Security
    - Enable RLS, publicly readable
*/

CREATE TABLE IF NOT EXISTS claim_arguments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  claim_run_id uuid NOT NULL REFERENCES claim_runs(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('supporting', 'opposing')),
  argument_text text NOT NULL,
  evidence_text text,
  source_ids uuid[] DEFAULT '{}',
  strength text NOT NULL DEFAULT 'moderate' CHECK (strength IN ('strong', 'moderate', 'weak')),
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE claim_arguments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Claim arguments are publicly viewable"
  ON claim_arguments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_claim_arguments_claim_id ON claim_arguments(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_arguments_side ON claim_arguments(claim_id, side);
