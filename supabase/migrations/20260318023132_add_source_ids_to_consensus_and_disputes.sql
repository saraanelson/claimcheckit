/*
  # Add source references to consensus points and disputes

  1. Modified Tables
    - `claim_consensus_points`
      - Add `source_ids` (uuid array) - References to sources that support this consensus point
    - `claim_disputes`
      - Add `source_ids` (uuid array) - References to sources involved in this dispute

  2. Notes
    - Uses uuid arrays rather than junction tables for simplicity
    - Allows the UI to show which sources back each point
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claim_consensus_points' AND column_name = 'source_ids'
  ) THEN
    ALTER TABLE claim_consensus_points ADD COLUMN source_ids uuid[] DEFAULT '{}';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claim_disputes' AND column_name = 'source_ids'
  ) THEN
    ALTER TABLE claim_disputes ADD COLUMN source_ids uuid[] DEFAULT '{}';
  END IF;
END $$;