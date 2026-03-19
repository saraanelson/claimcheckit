-- Create claim_arguments table for structured pro/con arguments
CREATE TABLE IF NOT EXISTS public.claim_arguments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  claim_run_id uuid REFERENCES public.claim_runs(id) ON DELETE SET NULL,
  side text NOT NULL CHECK (side IN ('supporting', 'opposing')),
  argument_text text NOT NULL,
  evidence_text text,
  source_ids uuid[] DEFAULT '{}',
  strength text NOT NULL CHECK (strength IN ('strong', 'moderate', 'weak')),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookup by claim
CREATE INDEX IF NOT EXISTS idx_claim_arguments_claim_id ON public.claim_arguments(claim_id);

-- Enable RLS
ALTER TABLE public.claim_arguments ENABLE ROW LEVEL SECURITY;

-- Allow public read access (same as other claim tables)
CREATE POLICY "Allow public read access on claim_arguments"
  ON public.claim_arguments
  FOR SELECT
  USING (true);

-- Allow service role full access for edge function writes
CREATE POLICY "Allow service role insert on claim_arguments"
  ON public.claim_arguments
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow service role update on claim_arguments"
  ON public.claim_arguments
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow service role delete on claim_arguments"
  ON public.claim_arguments
  FOR DELETE
  USING (true);
