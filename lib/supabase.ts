import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Claim = {
  id: string;
  original_text: string;
  normalized_text: string;
  category: string;
  current_status: string;
  evidence_quality: string;
  summary_text: string;
  global_interpretations_text: string | null;
  misinformation_pattern_text: string | null;
  created_at: string;
  updated_at: string;
};

export type ClaimRun = {
  id: string;
  claim_id: string;
  run_status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
};

export type Source = {
  id: string;
  claim_id: string;
  claim_run_id: string;
  url: string;
  title: string;
  publisher: string | null;
  source_type: string;
  region: string | null;
  publish_date: string | null;
  snippet_text: string | null;
  credibility_score: number;
  retrieval_method: string | null;
  created_at: string;
};

export type ClaimTake = {
  id: string;
  claim_id: string;
  claim_run_id: string;
  take_text: string;
  source_id: string | null;
  display_order: number;
};

export type ClaimConsensusPoint = {
  id: string;
  claim_id: string;
  claim_run_id: string;
  point_text: string;
  source_ids: string[];
  display_order: number;
};

export type ClaimDispute = {
  id: string;
  claim_id: string;
  claim_run_id: string;
  point_text: string;
  source_ids: string[];
  display_order: number;
};

export type RecommendedTopic = {
  id: string;
  title: string;
  claim_text: string;
  category: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export type TrendingClaim = {
  id: string;
  title: string;
  claim_text: string;
  category: string;
  trend_score: number;
  is_active: boolean;
  created_at: string;
};

export type ClaimArgument = {
  id: string;
  claim_id: string;
  claim_run_id: string;
  side: 'supporting' | 'opposing';
  argument_text: string;
  evidence_text: string | null;
  source_ids: string[];
  strength: 'strong' | 'moderate' | 'weak';
  display_order: number;
  created_at: string;
};
