'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '../../../components/Header';
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  AlertCircle,
  BarChart3,
  Globe,
  ShieldCheck,
  ExternalLink,
  Loader2,
  Share2,
  Check,
  Clock,
  Star,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Search,
  Scale,
  ThumbsUp,
  ThumbsDown,
  Shield,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { Claim, Source, ClaimTake, ClaimConsensusPoint, ClaimDispute, ClaimArgument } from '../../../lib/supabase';
import { format, differenceInMonths } from 'date-fns';

// ── Source credibility tiers ──────────────────────────────────────────────────

type SourceTier = 1 | 2 | 3 | 4;

function getSourceTier(source: Source): SourceTier {
  const url = source.url.toLowerCase();
  if (url.includes('.gov') || url.includes('.edu') || url.includes('pubmed') ||
      url.includes('nature.com') || url.includes('science.org') ||
      url.includes('who.int') || url.includes('cdc.gov') || url.includes('worldbank.org')) return 1;
  if (url.includes('reuters.com') || url.includes('apnews.com') ||
      url.includes('bbc.com') || url.includes('theguardian.com') ||
      url.includes('nytimes.com') || url.includes('washingtonpost.com') ||
      source.source_type === 'Wire service') return 2;
  if (source.source_type === 'Investigative journalism' || source.source_type === 'Expert commentary') return 3;
  return 4;
}

const TIER_LABELS: Record<SourceTier, string> = { 1: 'Academic / Official', 2: 'Major news', 3: 'Journalism', 4: 'General' };

const TIER_COLORS: Record<SourceTier, string> = {
  1: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  2: 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
  3: 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800',
  4: 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700',
};

function isSourceDated(source: Source): boolean {
  if (!source.publish_date) return false;
  try { return differenceInMonths(new Date(), new Date(source.publish_date)) > 36; }
  catch { return false; }
}

// ── Confidence ──────────────────────────────────────────────────────────────

function computeConfidence(sources: Source[], status: string): number {
  if (status === 'Insufficient Evidence') return 10;
  let score = 0;
  for (const s of sources) {
    const tier = getSourceTier(s);
    if (tier === 1) score += 20;
    else if (tier === 2) score += 12;
    else if (tier === 3) score += 7;
    else score += 3;
    if (s.publish_date && !isSourceDated(s)) score += 3;
  }
  if (status === 'Misleading') score = Math.floor(score * 0.4);
  if (status === 'Under Debate') score = Math.floor(score * 0.65);
  if (status === 'Partially Supported') score = Math.floor(score * 0.8);
  return Math.min(100, Math.max(5, score));
}

function getConfidenceColor(score: number): string {
  if (score >= 70) return 'from-emerald-500 to-green-500';
  if (score >= 40) return 'from-amber-500 to-yellow-500';
  return 'from-red-500 to-rose-500';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

function getFaviconUrl(url: string): string {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
  catch { return ''; }
}

// ── Verdict styling ───────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<string, { icon: React.ReactNode; gradient: string; bg: string; border: string; text: string }> = {
  'True':                  { icon: <CheckCircle className="w-8 h-8" />, gradient: 'from-emerald-600 to-green-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-800 dark:text-emerald-300' },
  'Mostly True':           { icon: <CheckCircle className="w-8 h-8" />, gradient: 'from-teal-500 to-emerald-500', bg: 'bg-teal-50 dark:bg-teal-950/30', border: 'border-teal-200 dark:border-teal-800', text: 'text-teal-800 dark:text-teal-300' },
  'Misleading':            { icon: <AlertOctagon className="w-8 h-8" />, gradient: 'from-orange-500 to-amber-500', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-800 dark:text-orange-300' },
  'Mostly False':          { icon: <AlertTriangle className="w-8 h-8" />, gradient: 'from-orange-600 to-red-500', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-300 dark:border-orange-800', text: 'text-orange-900 dark:text-orange-300' },
  'False':                 { icon: <XCircle className="w-8 h-8" />, gradient: 'from-red-600 to-rose-600', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', text: 'text-red-800 dark:text-red-300' },
  'Under Debate':          { icon: <HelpCircle className="w-8 h-8" />, gradient: 'from-blue-600 to-indigo-600', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-800 dark:text-blue-300' },
  'Insufficient Evidence': { icon: <AlertCircle className="w-8 h-8" />, gradient: 'from-stone-500 to-stone-600', bg: 'bg-stone-100 dark:bg-stone-800/50', border: 'border-stone-200 dark:border-stone-700', text: 'text-stone-700 dark:text-stone-300' },
  // legacy aliases
  'Well Supported':        { icon: <CheckCircle className="w-8 h-8" />, gradient: 'from-emerald-600 to-green-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-800 dark:text-emerald-300' },
  'Partially Supported':   { icon: <AlertTriangle className="w-8 h-8" />, gradient: 'from-amber-500 to-yellow-500', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-800 dark:text-amber-300' },
};

function getEvidenceQualityColor(quality: string): string {
  switch (quality) {
    case 'High':     return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30';
    case 'Moderate': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30';
    case 'Limited':  return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30';
    default:         return 'text-stone-600 bg-stone-50 dark:bg-stone-800';
  }
}

function buildShareText(claim: Claim, sources: Source[], confidence: number): string {
  const top2 = sources.slice(0, 2).map((s) => `• ${getDomain(s.url)}`).join('\n');
  return `ClaimCheck verdict: ${claim.current_status} (${confidence}% confidence)\n\nClaim: "${claim.original_text}"\n\nTop sources:\n${top2}\n\nFull analysis: ${window.location.href}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClaimPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [takes, setTakes] = useState<ClaimTake[]>([]);
  const [consensus, setConsensus] = useState<ClaimConsensusPoint[]>([]);
  const [disputes, setDisputes] = useState<ClaimDispute[]>([]);
  const [arguments_, setArguments] = useState<ClaimArgument[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(true);
  const [copied, setCopied] = useState(false);
  const [recencyFilter, setRecencyFilter] = useState<'any' | '3y' | '1y'>('any');
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [verdictRevealed, setVerdictRevealed] = useState(false);

  useEffect(() => { loadClaimData(); }, [params.id]);

  useEffect(() => {
    if (!polling || !claim || claim.current_status !== 'Under Analysis') return;
    const interval = setInterval(loadClaimData, 3000);
    return () => clearInterval(interval);
  }, [polling, claim, params.id]);

  // Verdict reveal animation
  useEffect(() => {
    if (claim && claim.current_status !== 'Under Analysis' && !verdictRevealed) {
      setTimeout(() => setVerdictRevealed(true), 200);
    }
  }, [claim?.current_status]);

  // Update recent checks
  useEffect(() => {
    if (!claim || claim.current_status === 'Under Analysis') return;
    try {
      const existing = JSON.parse(localStorage.getItem('recentChecks') || '[]');
      const updated = existing.map((c: { claimId: string; verdict: string }) =>
        c.claimId === params.id ? { ...c, verdict: claim.current_status } : c
      );
      localStorage.setItem('recentChecks', JSON.stringify(updated));
    } catch {}
  }, [claim?.current_status]);

  const loadClaimData = async () => {
    try {
      const [claimResult, sourcesResult, takesResult, consensusResult, disputesResult, argumentsResult] = await Promise.all([
        supabase.from('claims').select('*').eq('id', params.id).maybeSingle(),
        supabase.from('sources').select('*').eq('claim_id', params.id).order('credibility_score', { ascending: false }),
        supabase.from('claim_takes').select('*').eq('claim_id', params.id).order('display_order'),
        supabase.from('claim_consensus_points').select('*').eq('claim_id', params.id).order('display_order'),
        supabase.from('claim_disputes').select('*').eq('claim_id', params.id).order('display_order'),
        supabase.from('claim_arguments').select('*').eq('claim_id', params.id).order('display_order'),
      ]);
      if (claimResult.data) {
        setClaim(claimResult.data);
        if (claimResult.data.current_status !== 'Under Analysis') setPolling(false);
      }
      if (sourcesResult.data) setSources(sourcesResult.data);
      if (takesResult.data) setTakes(takesResult.data);
      if (consensusResult.data) setConsensus(consensusResult.data);
      if (disputesResult.data) setDisputes(disputesResult.data);
      if (argumentsResult.data) setArguments(argumentsResult.data);
    } catch (error) {
      console.error('Error loading claim:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!claim) return;
    const confidence = computeConfidence(sources, claim.current_status);
    const text = buildShareText(claim, sources, confidence);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const toggleSource = (id: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredSources = sources.filter((s) => {
    if (recencyFilter === 'any' || !s.publish_date) return true;
    const months = differenceInMonths(new Date(), new Date(s.publish_date));
    if (recencyFilter === '1y') return months <= 12;
    if (recencyFilter === '3y') return months <= 36;
    return true;
  });

  const sortedSources = [...filteredSources].sort((a, b) => getSourceTier(a) - getSourceTier(b));

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex justify-center">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center mx-auto mb-5 animate-pulse">
              <Loader2 className="w-7 h-7 text-white animate-spin" />
            </div>
            <p className="text-stone-500 dark:text-stone-400 font-medium">Loading analysis…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-7 h-7 text-stone-400" />
          </div>
          <p className="text-stone-500 dark:text-stone-400 font-medium mb-4">Claim not found</p>
          <button onClick={() => router.push('/')} className="text-teal-600 dark:text-teal-400 hover:underline font-medium text-sm">
            ← Return to home
          </button>
        </div>
      </div>
    );
  }

  const isAnalyzing = claim.current_status === 'Under Analysis';
  const confidence = computeConfidence(sources, claim.current_status);
  const hasConflict = consensus.length > 0 && disputes.length > 0;
  const forArgs = arguments_.filter((a) => a.side === 'supporting');
  const againstArgs = arguments_.filter((a) => a.side === 'opposing');
  const hasArguments = forArgs.length > 0 || againstArgs.length > 0;
  const showBothSides = hasArguments && claim.current_status !== 'Insufficient Evidence';
  const strengthWeight = (a: ClaimArgument) => a.strength === 'strong' ? 3 : a.strength === 'moderate' ? 2 : 1;
  const forWeight = forArgs.reduce((s, a) => s + strengthWeight(a), 0);
  const agWeight = againstArgs.reduce((s, a) => s + strengthWeight(a), 0);
  const totalWeight = forWeight + agWeight || 1;
  const forPct = Math.round((forWeight / totalWeight) * 100);
  const agPct = 100 - forPct;
  const evidenceLean = forPct >= 60 ? 'leans supporting' : agPct >= 60 ? 'leans challenging' : 'is split';
  const verdictCfg = VERDICT_CONFIG[claim.current_status] || VERDICT_CONFIG['Insufficient Evidence'];

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-8 animate-fade-in">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-2">
            {!isAnalyzing && (
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-stone-600 dark:text-stone-400 card hover:border-stone-300 dark:hover:border-stone-600 transition-all"
              >
                {copied ? <><Check className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-600">Copied</span></> : <><Share2 className="w-3.5 h-3.5" /><span>Share</span></>}
              </button>
            )}
          </div>
        </div>

        {/* ── Verdict banner ── */}
        <div className={`relative overflow-hidden rounded-2xl border-2 mb-8 p-8 transition-all duration-500 ${verdictCfg.bg} ${verdictCfg.border} ${verdictRevealed || isAnalyzing ? 'animate-fade-up' : 'opacity-0'}`}>
          {/* Subtle gradient overlay */}
          {!isAnalyzing && (
            <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl ${verdictCfg.gradient} opacity-5 rounded-bl-full`} />
          )}
          <div className="relative flex items-start gap-4">
            <div className={`p-2 rounded-xl bg-gradient-to-br ${verdictCfg.gradient} text-white shadow-sm flex-shrink-0`}>
              {isAnalyzing ? <Loader2 className="w-8 h-8 animate-spin" /> : verdictCfg.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className={`font-serif text-2xl sm:text-3xl mb-2 ${verdictCfg.text}`}>
                {isAnalyzing ? 'Analyzing…' : claim.current_status}
              </h2>
              <p className="text-stone-700 dark:text-stone-300 text-lg leading-relaxed">{claim.original_text}</p>
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                <span className="px-3 py-1 bg-white/60 dark:bg-white/10 backdrop-blur-sm rounded-lg text-xs font-semibold capitalize text-stone-600 dark:text-stone-400">
                  {claim.category}
                </span>
                <span className="text-xs text-stone-400 dark:text-stone-500">
                  {format(new Date(claim.created_at), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Analyzing state ── */}
        {isAnalyzing && (
          <div className="card p-6 mb-8 animate-fade-in border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
              <div>
                <h3 className="font-semibold text-stone-900 dark:text-stone-100">Analysis in progress</h3>
                <p className="text-sm text-stone-500 dark:text-stone-400">Retrieving credible sources and generating evidence-based analysis…</p>
              </div>
            </div>
          </div>
        )}

        {!isAnalyzing && (
          <div className="space-y-6">

            {/* ── Confidence score ── */}
            {sources.length > 0 && (
              <div className="card p-6 animate-fade-up stagger-1">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <h3 className="font-semibold text-stone-900 dark:text-stone-100">Evidence Quality</h3>
                  </div>
                  <span className="text-3xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                    {confidence}<span className="text-base font-normal text-stone-400">/100</span>
                  </span>
                </div>
                <div className="w-full bg-stone-100 dark:bg-stone-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full bg-gradient-to-r ${getConfidenceColor(confidence)} animate-bar-fill`}
                    style={{ width: `${confidence}%` }}
                  />
                </div>
                <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">
                  How reliable and complete the sources are — not whether the claim is true
                </p>
              </div>
            )}

            {/* ── Conflicting sources ── */}
            {hasConflict && (
              <div className="card p-6 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 animate-fade-up stagger-2">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <h3 className="font-semibold text-stone-900 dark:text-stone-100">Sources conflict on this topic</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">Support</p>
                    <ul className="space-y-1.5">
                      {sources.filter((s) => {
                        const snip = (s.snippet_text || '').toLowerCase();
                        return ['confirms', 'supports', 'evidence shows', 'found that', 'indicates'].some(sig => snip.includes(sig));
                      }).slice(0, 3).map((s) => (
                        <li key={s.id} className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-teal-600 dark:hover:text-teal-400 hover:underline truncate">
                            {s.publisher || getDomain(s.url)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-red-500 dark:text-red-400 uppercase tracking-widest mb-2">Question</p>
                    <ul className="space-y-1.5">
                      {sources.filter((s) => {
                        const snip = (s.snippet_text || '').toLowerCase();
                        return ['however', 'disputed', 'questioned', 'no evidence', 'contradicts', 'misleading', 'overstate'].some(sig => snip.includes(sig));
                      }).slice(0, 3).map((s) => (
                        <li key={s.id} className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-teal-600 dark:hover:text-teal-400 hover:underline truncate">
                            {s.publisher || getDomain(s.url)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* ── Both Sides: Structured Pro/Con Arguments ── */}
            {showBothSides && (
              <div className="card overflow-hidden animate-fade-up stagger-2">
                {/* Header */}
                <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                      <Scale className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="font-serif text-2xl text-stone-900 dark:text-stone-100">Both Sides</h3>
                  </div>
                  <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
                    Evidence {evidenceLean} — {forArgs.length} supporting, {againstArgs.length} challenging
                  </p>
                  {/* Balance bar */}
                  <div className="flex rounded-full overflow-hidden h-2.5 bg-stone-100 dark:bg-stone-800">
                    <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${forPct}%` }} />
                    <div className="bg-red-500 transition-all duration-500" style={{ width: `${agPct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{forPct}% supporting</span>
                    <span className="text-[11px] text-red-500 dark:text-red-400 font-medium">{agPct}% challenging</span>
                  </div>
                </div>

                {/* Two columns */}
                <div className="grid grid-cols-1 md:grid-cols-2">
                  {/* FOR column */}
                  <div className="border-t md:border-r border-stone-200 dark:border-stone-800">
                    <div className="px-6 sm:px-8 py-3 bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-stone-200 dark:border-stone-800">
                      <div className="flex items-center gap-2">
                        <ThumbsUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Supporting</span>
                        <span className="text-xs text-stone-400 dark:text-stone-500 ml-auto">{forArgs.length} argument{forArgs.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="px-6 sm:px-8 py-4 space-y-4">
                      {forArgs.length === 0 ? (
                        <p className="text-sm text-stone-400 dark:text-stone-500 italic py-2">No strong supporting arguments found</p>
                      ) : (
                        forArgs.slice(0, 2).map((arg, i) => {
                          const backed = sources.filter((s) => arg.source_ids?.includes(s.id));
                          return (
                            <div key={arg.id || i} className={`animate-fade-up stagger-${Math.min(i + 1, 6)}`}>
                              <div className="flex items-start gap-2">
                                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                                  arg.strength === 'strong' ? 'bg-emerald-500' : arg.strength === 'moderate' ? 'bg-emerald-400' : 'bg-emerald-300'
                                }`} />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200 leading-snug">{arg.argument_text}</p>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                      arg.strength === 'strong'
                                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                                        : arg.strength === 'moderate'
                                        ? 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                                        : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500'
                                    }`}>
                                      {arg.strength}
                                    </span>
                                    {backed.slice(0, 1).map((s) => (
                                      <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"
                                        className="text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:underline truncate max-w-[120px]">
                                        {s.publisher || getDomain(s.url)}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              {i < Math.min(forArgs.length, 2) - 1 && <hr className="mt-3 border-stone-100 dark:border-stone-800" />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* AGAINST column */}
                  <div className="border-t border-stone-200 dark:border-stone-800">
                    <div className="px-6 sm:px-8 py-3 bg-red-50/60 dark:bg-red-950/20 border-b border-stone-200 dark:border-stone-800">
                      <div className="flex items-center gap-2">
                        <ThumbsDown className="w-4 h-4 text-red-500 dark:text-red-400" />
                        <span className="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">Challenging</span>
                        <span className="text-xs text-stone-400 dark:text-stone-500 ml-auto">{againstArgs.length} argument{againstArgs.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="px-6 sm:px-8 py-4 space-y-4">
                      {againstArgs.length === 0 ? (
                        <p className="text-sm text-stone-400 dark:text-stone-500 italic py-2">No strong challenging arguments found</p>
                      ) : (
                        againstArgs.slice(0, 2).map((arg, i) => {
                          const backed = sources.filter((s) => arg.source_ids?.includes(s.id));
                          return (
                            <div key={arg.id || i} className={`animate-fade-up stagger-${Math.min(i + 1, 6)}`}>
                              <div className="flex items-start gap-2">
                                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                                  arg.strength === 'strong' ? 'bg-red-500' : arg.strength === 'moderate' ? 'bg-red-400' : 'bg-red-300'
                                }`} />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200 leading-snug">{arg.argument_text}</p>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                      arg.strength === 'strong'
                                        ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                        : arg.strength === 'moderate'
                                        ? 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                                        : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500'
                                    }`}>
                                      {arg.strength}
                                    </span>
                                    {backed.slice(0, 1).map((s) => (
                                      <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"
                                        className="text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:underline truncate max-w-[120px]">
                                        {s.publisher || getDomain(s.url)}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              {i < Math.min(againstArgs.length, 2) - 1 && <hr className="mt-3 border-stone-100 dark:border-stone-800" />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer context */}
                <div className="px-6 sm:px-8 py-3 bg-stone-50 dark:bg-stone-900/50 border-t border-stone-200 dark:border-stone-800">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-stone-400" />
                    <p className="text-[11px] text-stone-400 dark:text-stone-500">
                      Arguments are derived from retrieved sources and weighted by credibility. Strength reflects source quality, not absolute truth.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Summary ── */}
            <div className="card p-8 animate-fade-up stagger-2">
              <h3 className="font-serif text-2xl text-stone-900 dark:text-stone-100 mb-4">What Strong Evidence Shows</h3>
              <p className="text-stone-600 dark:text-stone-400 leading-relaxed text-lg">{claim.summary_text}</p>
            </div>

            {/* ── Takes ── */}
            {takes.length > 0 && (
              <div className="card p-8 animate-fade-up stagger-3">
                <h3 className="font-serif text-2xl text-stone-900 dark:text-stone-100 mb-6">Main Credible Takes</h3>
                <div className="space-y-4">
                  {takes.map((take, i) => (
                    <div key={take.id} className={`border-l-2 border-teal-400 dark:border-teal-600 pl-5 py-1 animate-fade-up stagger-${Math.min(i + 1, 6)}`}>
                      <p className="text-stone-600 dark:text-stone-400 leading-relaxed">{take.take_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Global interpretations ── */}
            {claim.global_interpretations_text && (
              <div className="card p-8 animate-fade-up stagger-3">
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  <h3 className="font-serif text-2xl text-stone-900 dark:text-stone-100">Global Interpretations</h3>
                </div>
                <p className="text-stone-600 dark:text-stone-400 leading-relaxed">{claim.global_interpretations_text}</p>
              </div>
            )}

            {/* ── Consensus / Disputes ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-up stagger-4">
              {consensus.length > 0 && (
                <div className="card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="font-semibold text-stone-900 dark:text-stone-100">Sources Agree</h3>
                  </div>
                  <ul className="space-y-3">
                    {consensus.map((point) => {
                      const backed = sources.filter((s) => point.source_ids?.includes(s.id));
                      return (
                        <li key={point.id}>
                          <div className="flex items-start gap-2">
                            <span className="text-emerald-500 mt-1.5 shrink-0 text-xs">●</span>
                            <span className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">{point.point_text}</span>
                          </div>
                          {backed.length > 0 && (
                            <div className="ml-4 mt-1.5 flex flex-wrap gap-1">
                              {backed.map((s) => (
                                <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                                  {s.publisher || getDomain(s.url)}
                                </a>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {disputes.length > 0 && (
                <div className="card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <HelpCircle className="w-5 h-5 text-orange-500 dark:text-orange-400" />
                    <h3 className="font-semibold text-stone-900 dark:text-stone-100">Sources Differ</h3>
                  </div>
                  <ul className="space-y-3">
                    {disputes.map((point) => {
                      const backed = sources.filter((s) => point.source_ids?.includes(s.id));
                      return (
                        <li key={point.id}>
                          <div className="flex items-start gap-2">
                            <span className="text-orange-400 mt-1.5 shrink-0 text-xs">●</span>
                            <span className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">{point.point_text}</span>
                          </div>
                          {backed.length > 0 && (
                            <div className="ml-4 mt-1.5 flex flex-wrap gap-1">
                              {backed.map((s) => (
                                <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors">
                                  {s.publisher || getDomain(s.url)}
                                </a>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* ── Evidence quality ── */}
            <div className="card p-6 animate-fade-up stagger-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <h3 className="font-semibold text-stone-900 dark:text-stone-100">Evidence Quality</h3>
              </div>
              <div className="flex items-center gap-4">
                <div className={`px-4 py-2 rounded-xl font-bold text-xl ${getEvidenceQualityColor(claim.evidence_quality)}`}>
                  {claim.evidence_quality}
                </div>
                <div className="flex-1 bg-stone-100 dark:bg-stone-800 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-2.5 rounded-full animate-bar-fill ${
                    claim.evidence_quality === 'High' ? 'bg-emerald-500 w-full'
                    : claim.evidence_quality === 'Moderate' ? 'bg-amber-500 w-2/3'
                    : 'bg-red-500 w-1/3'
                  }`} />
                </div>
              </div>
            </div>

            {/* ── Misinformation pattern ── */}
            {claim.misinformation_pattern_text && (
              <div className="card p-8 border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 animate-fade-up stagger-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  <h3 className="font-serif text-xl text-stone-900 dark:text-stone-100">Why People Get Misled</h3>
                </div>
                <p className="text-stone-600 dark:text-stone-400 leading-relaxed">{claim.misinformation_pattern_text}</p>
              </div>
            )}

            {/* ── Source cards ── */}
            {sources.length > 0 && (
              <div className="card p-6 sm:p-8 animate-fade-up stagger-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <h3 className="font-serif text-xl text-stone-900 dark:text-stone-100">Source Transparency</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                    {(['any', '3y', '1y'] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setRecencyFilter(opt)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                          recencyFilter === opt
                            ? 'bg-teal-600 dark:bg-teal-500 text-white border-teal-600 dark:border-teal-500'
                            : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:border-teal-300 dark:hover:border-teal-700'
                        }`}
                      >
                        {opt === 'any' ? 'Any time' : opt === '3y' ? '3 years' : '1 year'}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-sm text-stone-500 dark:text-stone-400 mb-5">
                  {sources.length} source{sources.length !== 1 ? 's' : ''} retrieved.
                  {filteredSources.length < sources.length && ` Showing ${filteredSources.length} after filter.`}
                </p>

                <div className="space-y-3">
                  {sortedSources.map((source) => {
                    const tier = getSourceTier(source);
                    const dated = isSourceDated(source);
                    const domain = getDomain(source.url);
                    const favicon = getFaviconUrl(source.url);
                    const expanded = expandedSources.has(source.id);

                    return (
                      <div key={source.id} className="border border-stone-200 dark:border-stone-800 rounded-xl hover:border-stone-300 dark:hover:border-stone-700 transition-colors">
                        <button
                          onClick={() => toggleSource(source.id)}
                          className="w-full p-4 flex items-start gap-3 text-left"
                        >
                          <div className="w-8 h-8 rounded-lg border border-stone-100 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {favicon ? (
                              <img src={favicon} alt="" className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <Globe className="w-4 h-4 text-stone-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-stone-900 dark:text-stone-100 leading-snug text-sm">{source.title}</h4>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-xs text-stone-400">{domain}</span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${TIER_COLORS[tier]}`}>
                                {TIER_LABELS[tier]}
                              </span>
                              {dated && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                                  Dated
                                </span>
                              )}
                              {source.publish_date && (
                                <span className="text-[11px] text-stone-400">{format(new Date(source.publish_date), 'MMM yyyy')}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {source.credibility_score && (
                              <span className="text-[11px] text-stone-400 tabular-nums hidden sm:block">
                                {(source.credibility_score * 100).toFixed(0)}%
                              </span>
                            )}
                            {expanded ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                          </div>
                        </button>

                        {expanded && (
                          <div className="px-4 pb-4 animate-slide-down">
                            <div className="border-t border-stone-100 dark:border-stone-800 pt-3">
                              {source.snippet_text && (
                                <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed mb-3">{source.snippet_text}</p>
                              )}
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                              >
                                View source <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Check another claim CTA ── */}
            <div className="card p-8 text-center animate-fade-up stagger-6">
              <h3 className="font-serif text-xl text-stone-900 dark:text-stone-100 mb-2">Want to check another claim?</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 mb-5">Paste any claim, headline, or URL for instant analysis</p>
              <button
                onClick={() => router.push('/')}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all shadow-sm hover:shadow-md text-sm"
              >
                <Search className="w-4 h-4" />
                New Analysis
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
