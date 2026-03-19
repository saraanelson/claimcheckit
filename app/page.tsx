'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '../components/Header';
import { Search, TrendingUp, Sparkles, Loader2, Clock, X, Link2, ArrowRight, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { RecommendedTopic, TrendingClaim } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type TopicTag = 'Health' | 'Science' | 'Politics' | 'Finance' | 'Environment' | 'Technology' | 'Other';

interface RecentCheck {
  claimText: string;
  verdict: string;
  timestamp: number;
  claimId: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TOPIC_TAGS: TopicTag[] = ['Health', 'Science', 'Politics', 'Finance', 'Environment', 'Technology', 'Other'];

const TOPIC_KEYWORDS: Record<TopicTag, string[]> = {
  Health:      ['health', 'medical', 'disease', 'drug', 'treatment', 'vaccine', 'diet', 'supplement', 'cancer', 'covid', 'symptom', 'nutrition'],
  Science:     ['science', 'research', 'study', 'experiment', 'theory', 'discovery', 'data', 'evidence'],
  Politics:    ['government', 'politics', 'election', 'policy', 'law', 'congress', 'president', 'senator', 'vote', 'party'],
  Finance:     ['economy', 'economic', 'market', 'stock', 'inflation', 'gdp', 'recession', 'employment', 'jobs', 'money', 'bank'],
  Environment: ['climate', 'environment', 'pollution', 'emissions', 'electric vehicle', 'ev', 'renewable', 'carbon', 'ocean'],
  Technology:  ['ai', 'artificial intelligence', 'technology', 'tech', 'software', 'algorithm', 'robot', 'automation', 'cyber'],
  Other:       [],
};

const LOADING_STEPS = [
  { label: 'Parsing claim', icon: '🔍' },
  { label: 'Searching sources', icon: '📡' },
  { label: 'Evaluating credibility', icon: '⚖️' },
  { label: 'Generating verdict', icon: '✨' },
];

const VERDICT_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  'Well Supported':        { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'Partially Supported':   { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  'Misleading':            { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  'Under Debate':          { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
  'Insufficient Evidence': { bg: 'bg-stone-100 dark:bg-stone-800/40', text: 'text-stone-600 dark:text-stone-400', dot: 'bg-stone-400' },
};

const CATEGORY_STYLES: Record<string, string> = {
  health:      'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  politics:    'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  environment: 'bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800',
  technology:  'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
  economics:   'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  science:     'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectTopic(text: string): TopicTag {
  const lower = text.toLowerCase();
  for (const tag of TOPIC_TAGS) {
    if (tag === 'Other') continue;
    if (TOPIC_KEYWORDS[tag].some((kw) => lower.includes(kw))) return tag;
  }
  return 'Other';
}

function isUrl(text: string): boolean {
  return /^https?:\/\//.test(text.trim()) || /^www\./.test(text.trim());
}

function loadRecentChecks(): RecentCheck[] {
  try { return JSON.parse(localStorage.getItem('recentChecks') || '[]'); }
  catch { return []; }
}

function saveRecentCheck(check: RecentCheck) {
  try {
    const existing = loadRecentChecks().filter((c) => c.claimId !== check.claimId);
    localStorage.setItem('recentChecks', JSON.stringify([check, ...existing].slice(0, 10)));
  } catch {}
}

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [claimInput, setClaimInput] = useState('');
  const [selectedTag, setSelectedTag] = useState<TopicTag>('Other');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [recommendedTopics, setRecommendedTopics] = useState<RecommendedTopic[]>([]);
  const [trendingClaims, setTrendingClaims] = useState<TrendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentChecks, setRecentChecks] = useState<RecentCheck[]>([]);
  const [inputMode, setInputMode] = useState<'claim' | 'url'>('claim');

  useEffect(() => {
    if (claimInput.trim()) {
      setSelectedTag(detectTopic(claimInput));
      setInputMode(isUrl(claimInput) ? 'url' : 'claim');
    }
  }, [claimInput]);

  useEffect(() => {
    setRecentChecks(loadRecentChecks());
    loadData();
  }, []);

  useEffect(() => {
    if (!isAnalyzing) { setLoadingStep(0); return; }
    const interval = setInterval(() => {
      setLoadingStep((s) => (s < LOADING_STEPS.length - 1 ? s + 1 : s));
    }, 1200);
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const loadData = async () => {
    try {
      const [topicsResult, trendingResult] = await Promise.all([
        supabase.from('recommended_topics').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('trending_claims').select('*').eq('is_active', true).order('trend_score', { ascending: false }).limit(6),
      ]);
      if (topicsResult.data) setRecommendedTopics(topicsResult.data);
      if (trendingResult.data) setTrendingClaims(trendingResult.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeClaim = async (text: string) => {
    if (!text.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-claim`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ claimText: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');

      saveRecentCheck({
        claimText: text.length > 90 ? text.slice(0, 90) + '…' : text,
        verdict: 'Under Analysis',
        timestamp: Date.now(),
        claimId: data.claimId,
      });
      setRecentChecks(loadRecentChecks());
      router.push(`/claim/${data.claimId}`);
    } catch (error) {
      console.error('Error analyzing claim:', error);
      alert(error instanceof Error ? error.message : 'Failed to analyze claim. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAnalyzeClaim(claimInput.trim());
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16">

        {/* ── Hero ── */}
        <div className="text-center max-w-3xl mx-auto mb-12 animate-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400 text-xs font-semibold mb-6">
            <Zap className="w-3 h-3" />
            Powered by real-time source analysis
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-stone-900 dark:text-stone-100 mb-5 leading-[1.1] text-balance">
            Evaluate Claims with{' '}
            <span className="text-gradient">Real Evidence</span>
          </h1>
          <p className="text-lg sm:text-xl text-stone-500 dark:text-stone-400 leading-relaxed max-w-2xl mx-auto">
            Paste a claim, headline, or URL. Get transparent analysis grounded in
            credible sources — not opinions or oversimplifications.
          </p>
        </div>

        {/* ── Input ── */}
        <form onSubmit={handleSubmit} className="mb-4 max-w-3xl mx-auto animate-fade-up stagger-1">
          <div className="card p-1.5 shadow-xl shadow-stone-200/40 dark:shadow-stone-900/40 focus-within:border-teal-400 dark:focus-within:border-teal-600 transition-colors">
            {/* URL mode indicator */}
            {inputMode === 'url' && (
              <div className="flex items-center gap-2 px-4 pt-3 pb-1 animate-slide-down">
                <Link2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs font-medium text-teal-600 dark:text-teal-400">URL detected — we&apos;ll analyze the article&apos;s claims</span>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={claimInput}
              onChange={(e) => setClaimInput(e.target.value)}
              placeholder="Enter a claim, headline, or paste an article URL…"
              className="w-full px-5 py-4 text-base sm:text-lg text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-600 resize-none focus:outline-none rounded-xl bg-transparent"
              rows={3}
              disabled={isAnalyzing}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />

            {/* Topic pills + submit */}
            <div className="flex items-end justify-between gap-3 px-3 pb-3 pt-1 flex-wrap">
              <div className="flex flex-wrap gap-1.5">
                {TOPIC_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(tag)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      selectedTag === tag
                        ? 'bg-teal-600 dark:bg-teal-500 text-white border-teal-600 dark:border-teal-500 shadow-sm'
                        : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:border-teal-300 dark:hover:border-teal-700 hover:text-teal-700 dark:hover:text-teal-400'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={!claimInput.trim() || isAnalyzing}
                className="px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 disabled:from-stone-300 disabled:to-stone-300 dark:disabled:from-stone-700 dark:disabled:to-stone-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center gap-2 shadow-sm hover:shadow-md min-w-[160px] justify-center text-sm"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                    <span className="truncate">{LOADING_STEPS[loadingStep].label}…</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Analyze</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* ── Loading pipeline ── */}
        {isAnalyzing && (
          <div className="max-w-3xl mx-auto mb-12 animate-fade-in">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {LOADING_STEPS.map((step, i) => (
                <div key={step.label} className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                    i < loadingStep
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                      : i === loadingStep
                      ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 animate-pulse-glow'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-600'
                  }`}>
                    <span className="text-sm">{step.icon}</span>
                    {step.label}
                  </div>
                  {i < LOADING_STEPS.length - 1 && (
                    <div className={`w-4 h-px transition-colors duration-300 ${i < loadingStep ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-stone-200 dark:bg-stone-700'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent checks ── */}
        {!isAnalyzing && recentChecks.length > 0 && (
          <section className="max-w-3xl mx-auto mb-16 animate-fade-up stagger-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-stone-400" />
                <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">Recent</h2>
              </div>
              <button
                onClick={() => { localStorage.removeItem('recentChecks'); setRecentChecks([]); }}
                className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {recentChecks.map((check, i) => {
                const style = VERDICT_STYLES[check.verdict];
                return (
                  <button
                    key={check.claimId}
                    onClick={() => router.push(`/claim/${check.claimId}`)}
                    className={`group card-hover p-4 text-left animate-fade-up stagger-${Math.min(i + 1, 6)}`}
                  >
                    <p className="text-sm text-stone-700 dark:text-stone-300 leading-snug line-clamp-2 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors mb-2">
                      {check.claimText}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {style && check.verdict !== 'Under Analysis' && (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {check.verdict}
                        </span>
                      )}
                      <span className="text-xs text-stone-400">{timeAgo(check.timestamp)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Recommended topics ── */}
        <section className="mb-20 animate-fade-up stagger-3">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-normal text-stone-900 dark:text-stone-100">Recommended Topics</h2>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="card h-40 animate-pulse">
                  <div className="p-6 space-y-3">
                    <div className="h-5 w-20 bg-stone-200 dark:bg-stone-800 rounded-md" />
                    <div className="h-5 w-3/4 bg-stone-200 dark:bg-stone-800 rounded-md" />
                    <div className="h-4 w-full bg-stone-100 dark:bg-stone-800/60 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : recommendedTopics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendedTopics.map((topic, i) => (
                <button
                  key={topic.id}
                  onClick={() => handleAnalyzeClaim(topic.claim_text)}
                  disabled={isAnalyzing}
                  className={`group card-hover p-6 text-left disabled:opacity-50 disabled:cursor-not-allowed animate-fade-up stagger-${Math.min(i + 1, 6)}`}
                >
                  <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold border mb-3 ${CATEGORY_STYLES[topic.category.toLowerCase()] || 'bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700'}`}>
                    {topic.category}
                  </span>
                  <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-1.5 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors leading-snug">
                    {topic.title}
                  </h3>
                  {topic.description && (
                    <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed line-clamp-2">{topic.description}</p>
                  )}
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Analyze <ArrowRight className="w-3 h-3" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="card p-16 text-center">
              <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-stone-400" />
              </div>
              <p className="text-stone-500 dark:text-stone-400 font-medium">No recommended topics yet</p>
              <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">Try typing a claim above to get started</p>
            </div>
          )}
        </section>

        {/* ── Trending ── */}
        {trendingClaims.length > 0 && (
          <section className="animate-fade-up stagger-4">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center shadow-sm">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <h2 className="font-serif text-2xl sm:text-3xl font-normal text-stone-900 dark:text-stone-100">Trending Misunderstood Claims</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trendingClaims.map((claim, i) => (
                <button
                  key={claim.id}
                  onClick={() => handleAnalyzeClaim(claim.claim_text)}
                  disabled={isAnalyzing}
                  className={`group card-hover p-6 text-left disabled:opacity-50 disabled:cursor-not-allowed animate-fade-up stagger-${Math.min(i + 1, 6)}`}
                >
                  <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold border mb-3 ${CATEGORY_STYLES[claim.category.toLowerCase()] || 'bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700'}`}>
                    {claim.category}
                  </span>
                  <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors leading-snug">
                    {claim.title}
                  </h3>
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Analyze <ArrowRight className="w-3 h-3" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-stone-200 dark:border-stone-800 mt-20 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="text-center text-sm text-stone-500 dark:text-stone-500 space-y-1">
            <p>ClaimCheck provides evidence-based analysis from credible sources.</p>
            <p className="text-stone-400 dark:text-stone-600">We do not create or fabricate evidence. All analysis is grounded in retrieved sources.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
