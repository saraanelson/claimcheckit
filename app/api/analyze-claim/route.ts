import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import Anthropic from '@anthropic-ai/sdk';

// ── Supabase admin client (service role) ──────────────────────────────────────

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_DEFAULT_KEY!;
  return createClient(url, key);
}

// ── Classifiers ───────────────────────────────────────────────────────────────

function classifyCategory(text: string): string {
  const lower = text.toLowerCase();
  const map: Record<string, string[]> = {
    health: ['health', 'medical', 'disease', 'drug', 'treatment', 'vaccine', 'diet', 'supplement', 'creatine', 'cancer', 'covid'],
    science: ['science', 'research', 'study', 'experiment', 'theory', 'discovery'],
    environment: ['climate', 'environment', 'pollution', 'emissions', 'electric vehicle', 'ev', 'renewable', 'carbon'],
    technology: ['ai', 'artificial intelligence', 'technology', 'tech', 'software', 'algorithm', 'robot', 'automation'],
    politics: ['government', 'politics', 'election', 'policy', 'law', 'congress', 'president', 'senator', 'sanctions'],
    economics: ['economy', 'economic', 'market', 'stock', 'inflation', 'gdp', 'recession', 'employment', 'jobs'],
    product: ['product', 'buy', 'purchase', 'guarantee', 'money back', 'tested', 'proven'],
  };
  for (const [cat, terms] of Object.entries(map)) {
    if (terms.some((t) => lower.includes(t))) return cat;
  }
  return 'general';
}

function classifySourceType(url: string): string {
  const l = url.toLowerCase();
  if (l.includes('.gov')) return 'Government data';
  if (l.includes('.edu') || l.includes('nature.com') || l.includes('science.org')) return 'Peer-reviewed research';
  if (l.includes('who.int') || l.includes('worldbank.org') || l.includes('un.org')) return 'International institution';
  if (l.includes('reuters.com') || l.includes('apnews.com')) return 'Wire service';
  return 'Investigative journalism';
}

function credibilityScore(url: string): number {
  const l = url.toLowerCase();
  if (l.includes('.gov') || l.includes('.edu')) return 0.95;
  if (l.includes('nature.com') || l.includes('science.org')) return 0.95;
  if (l.includes('who.int') || l.includes('cdc.gov')) return 0.95;
  if (l.includes('reuters.com') || l.includes('apnews.com')) return 0.9;
  if (l.includes('bbc.com') || l.includes('theguardian.com')) return 0.85;
  return 0.7;
}

function extractPublisher(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'Unknown';
  }
}

// ── Tavily search ─────────────────────────────────────────────────────────────

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

const LOW_QUALITY_DOMAINS = [
  'reddit.com', 'quora.com', 'pinterest.com', 'facebook.com', 'twitter.com',
  'x.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'linkedin.com',
  'tumblr.com', 'yelp.com', 'tripadvisor.com', 'medium.com', 'substack.com',
  'wikipedia.org', 'wikihow.com', 'answers.com', 'yahoo.com',
];

function isLowQualitySource(url: string): boolean {
  const l = url.toLowerCase();
  return LOW_QUALITY_DOMAINS.some((d) => l.includes(d));
}

async function searchTavily(query: string): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY ?? '';
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: 12,
      include_answer: false,
      exclude_domains: [
        'reddit.com', 'quora.com', 'pinterest.com', 'facebook.com',
        'twitter.com', 'x.com', 'instagram.com', 'tiktok.com',
        'youtube.com', 'linkedin.com', 'medium.com', 'substack.com',
        'tumblr.com', 'yelp.com', 'tripadvisor.com', 'wikipedia.org',
      ],
    }),
  });
  if (!res.ok) throw new Error(`Tavily error ${res.status}`);
  const data = await res.json();
  return data.results ?? [];
}

// ── Source record type ────────────────────────────────────────────────────────

interface SourceRecord {
  id: string;
  publisher: string;
  snippet_text: string | null;
  credibility_score: number;
  source_type: string;
  title: string;
}

// ── Types shared by analysis ──────────────────────────────────────────────────

interface ArgumentRecord {
  side: 'supporting' | 'opposing';
  argument_text: string;
  evidence_text: string | null;
  source_ids: string[];
  strength: 'strong' | 'moderate' | 'weak';
}

interface AnalysisResult {
  consensus: Array<{ text: string; sourceIds: string[] }>;
  disputes: Array<{ text: string; sourceIds: string[] }>;
  arguments: ArgumentRecord[];
  summary: string | null;
  takes: string[];
  verdict: string | null;
}

// ── Claude-powered source analysis ───────────────────────────────────────────

async function analyzeSourcesWithClaude(
  claimText: string,
  sources: SourceRecord[],
): Promise<AnalysisResult> {
  const validSources = sources.filter((s) => s.snippet_text && s.snippet_text.length > 30);
  if (validSources.length === 0) {
    return { consensus: [], disputes: [], arguments: [], summary: null, takes: [], verdict: null };
  }

  const sourceList = validSources
    .map((s, i) => `Source ${i + 1} [id:${s.id}] (${s.publisher}, credibility:${s.credibility_score}):\n${s.snippet_text}`)
    .join('\n\n');

  const prompt = `You are a fact-checking analyst evaluating the following claim using only the sources provided.

CLAIM: "${claimText}"

SOURCES:
${sourceList}

Return ONLY valid JSON — no markdown, no explanation, just the JSON object.

{
  "verdict": "Mostly False",
  "summary": "2-3 plain-English sentences stating what the evidence actually shows about this specific claim. Be direct and honest. If evidence is limited or mixed, say so explicitly.",
  "takes": [
    "Publisher name: most informative or surprising single sentence from this source about the claim"
  ],
  "consensus": [
    {"text": "A specific factual point that multiple sources agree on — must be a concrete statement, not 'sources address this topic'", "sourceIds": ["exact-uuid-here"]}
  ],
  "disputes": [
    {"text": "A specific point where sources contradict each other, or an important caveat that complicates the claim", "sourceIds": ["exact-uuid-here"]}
  ],
  "supporting_args": [
    {
      "argument_text": "One specific sentence making the case FOR this claim being true, based directly on a source — never write 'X sources provide evidence' or generic statements",
      "evidence_text": "\"Verbatim or near-verbatim quote pulled directly from the source snippet above\"",
      "source_ids": ["exact-uuid-here"],
      "strength": "strong"
    }
  ],
  "opposing_args": [
    {
      "argument_text": "One specific sentence making the case AGAINST this claim, based directly on a source — if no source clearly opposes it, write: 'Sources do not clearly establish that [specific aspect of claim] is false, but note that [specific caveat from source]'",
      "evidence_text": "\"Verbatim or near-verbatim quote pulled directly from the source snippet above\"",
      "source_ids": ["exact-uuid-here"],
      "strength": "moderate"
    }
  ]
}

STRICT RULES:
- verdict must be exactly one of: "True", "Mostly True", "Misleading", "Mostly False", "False", "Under Debate", "Insufficient Evidence" — choose based on what the preponderance of credible sources say about the claim AS STATED; if most sources contradict it, use "False" or "Mostly False"
- source_ids and sourceIds must use the EXACT UUID values from [id:...] in the sources above
- evidence_text MUST be a direct quote from the snippet — copy the words, do not paraphrase
- argument_text must be ONE sentence, specific to this exact claim, grounded in a source
- NEVER write argument_text like "X sources raise concerns" or "multiple sources provide evidence" — that is too vague
- takes: extract the single clearest sentence from each of the top 3 sources; attribute as "Publisher: quote"
- If the sources genuinely don't address one side, say so clearly rather than inventing support
- strength: "strong" = credible source with direct evidence, "moderate" = indirect or partial, "weak" = tangential
- Generate 2-3 items for supporting_args and opposing_args; 2-3 for consensus and disputes; 3 takes`;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(text.trim());

    const consensus = (parsed.consensus || []).slice(0, 4).map((p: { text: string; sourceIds: string[] }) => ({
      text: p.text,
      sourceIds: (p.sourceIds || []).filter((id: string) => sources.some((s) => s.id === id)),
    }));

    const disputes = (parsed.disputes || []).slice(0, 4).map((p: { text: string; sourceIds: string[] }) => ({
      text: p.text,
      sourceIds: (p.sourceIds || []).filter((id: string) => sources.some((s) => s.id === id)),
    }));

    const supporting: ArgumentRecord[] = (parsed.supporting_args || []).slice(0, 4).map((a: { argument_text: string; evidence_text: string | null; source_ids: string[]; strength: string }) => ({
      side: 'supporting' as const,
      argument_text: a.argument_text,
      evidence_text: a.evidence_text || null,
      source_ids: (a.source_ids || []).filter((id: string) => sources.some((s) => s.id === id)),
      strength: (['strong', 'moderate', 'weak'].includes(a.strength) ? a.strength : 'moderate') as 'strong' | 'moderate' | 'weak',
    }));

    const opposing: ArgumentRecord[] = (parsed.opposing_args || []).slice(0, 4).map((a: { argument_text: string; evidence_text: string | null; source_ids: string[]; strength: string }) => ({
      side: 'opposing' as const,
      argument_text: a.argument_text,
      evidence_text: a.evidence_text || null,
      source_ids: (a.source_ids || []).filter((id: string) => sources.some((s) => s.id === id)),
      strength: (['strong', 'moderate', 'weak'].includes(a.strength) ? a.strength : 'moderate') as 'strong' | 'moderate' | 'weak',
    }));

    const summary: string | null = typeof parsed.summary === 'string' && parsed.summary.length > 10 ? parsed.summary : null;
    const takes: string[] = Array.isArray(parsed.takes) ? parsed.takes.filter((t: unknown) => typeof t === 'string' && t.length > 10).slice(0, 4) : [];
    const ALLOWED_VERDICTS = ['True', 'Mostly True', 'Misleading', 'Mostly False', 'False', 'Under Debate', 'Insufficient Evidence'];
    const verdict: string | null = typeof parsed.verdict === 'string' && ALLOWED_VERDICTS.includes(parsed.verdict) ? parsed.verdict : null;

    return { consensus, disputes, arguments: [...supporting, ...opposing], summary, takes, verdict };
  } catch (err) {
    console.error('Claude analysis failed, using fallback:', err);
    return buildFallbackAnalysis(sources, claimText);
  }
}

// ── Fallback heuristic (used if Claude API unavailable) ────────────────────────

function buildFallbackAnalysis(sources: SourceRecord[], claimText: string): AnalysisResult {
  const ids = sources.slice(0, 4).map((s) => s.id);
  return {
    consensus: [{ text: 'Multiple sources address this topic and provide relevant context', sourceIds: ids.slice(0, 2) }],
    disputes: [{ text: 'Sources vary in their emphasis and specific conclusions on this topic', sourceIds: ids.slice(0, 2) }],
    arguments: [
      { side: 'supporting', argument_text: 'Some sources provide evidence consistent with this claim', evidence_text: sources[0]?.snippet_text?.split(/[.!?]+/)[0]?.trim() || null, source_ids: ids.slice(0, 2), strength: 'moderate' },
      { side: 'opposing', argument_text: 'Other sources present information that complicates or challenges this claim', evidence_text: null, source_ids: ids.slice(1, 3), strength: 'moderate' },
    ],
    summary: null,
    takes: [],
    verdict: null,
  };
}

// ── Analysis builder ──────────────────────────────────────────────────────────

const ALLOWED_VERDICTS = ['True', 'Mostly True', 'Misleading', 'Mostly False', 'False', 'Under Debate', 'Insufficient Evidence'];

function buildAnalysis(claimText: string, sources: SourceRecord[], category: string, claudeSummary: string | null, claudeVerdict: string | null) {
  const highCred = sources.filter((s) => s.credibility_score >= 0.85);
  const count = highCred.length;

  const status = (claudeVerdict && ALLOWED_VERDICTS.includes(claudeVerdict))
    ? claudeVerdict
    : (count === 0 ? 'Insufficient Evidence' : 'Under Debate');

  let evidenceQuality = 'Moderate';
  let summaryText: string;

  if (count === 0) {
    evidenceQuality = 'Limited';
    summaryText = claudeSummary ?? 'Limited credible evidence is available to evaluate this claim comprehensively.';
  } else if (count >= 5) {
    evidenceQuality = 'High';
    summaryText = claudeSummary ?? `Based on ${count} high-quality sources, this claim has been thoroughly evaluated.`;
  } else {
    summaryText = claudeSummary ?? `Based on ${count} credible source${count > 1 ? 's' : ''}, preliminary evidence is available. Further research may provide additional clarity.`;
  }

  const patterns: Record<string, string> = {
    health: 'Health claims often involve cherry-picking studies, confusing correlation with causation, or extrapolating from limited research. Individual variation and context matter significantly.',
    science: 'Scientific claims can be misleading when preliminary findings are presented as conclusive, when statistical significance is confused with practical significance, or when complex systems are oversimplified.',
    environment: 'Environmental claims frequently involve selective timeframes, geographic cherry-picking, or failure to account for systemic complexity and feedback loops.',
    technology: 'Technology predictions often extrapolate current trends linearly without accounting for regulatory, economic, or social friction. Capability does not equal adoption.',
    politics: 'Political claims are often misleading through selective statistics, false comparisons, or attributing complex multicausal outcomes to single factors.',
    economics: 'Economic claims can mislead through cherry-picked timeframes, failure to adjust for confounding variables, or presenting nominal rather than real values.',
    product: 'Product claims frequently involve exaggerated benefits, cherry-picked testimonials, or conflating association with causation.',
  };

  const takes = sources.slice(0,4).map((s) => `According to ${s.publisher}, ${s.snippet_text || 'evidence suggests nuanced interpretation of this claim.'}`);

  return {
    claimUpdate: {
      current_status: status,
      evidence_quality: evidenceQuality,
      summary_text: summaryText,
      misinformation_pattern_text: patterns[category] || 'Claims in this area often involve oversimplification of complex topics, selective evidence presentation, or confusion between correlation and causation.',
      updated_at: new Date().toISOString(),
    },
    takes,
  };
}

// ── Background analysis ───────────────────────────────────────────────────────

async function runAnalysis(claimId: string, claimText: string, category: string) {
  const supabase = getSupabaseAdmin();

  const { data: claimRunData } = await supabase
    .from('claim_runs')
    .insert({ claim_id: claimId, run_status: 'pending' })
    .select()
    .single();

  if (!claimRunData) return;

  let tavilyResults: TavilyResult[] = [];
  try {
    tavilyResults = await searchTavily(claimText);
  } catch (err) {
    console.error('Tavily search failed:', err);
  }

  const filteredResults = tavilyResults.filter((r) => !isLowQualitySource(r.url)).slice(0, 8);

  if (filteredResults.length === 0) {
    await supabase.from('claims').update({ current_status: 'Insufficient Evidence', evidence_quality: 'Limited', summary_text: 'Not enough credible sources were found to evaluate this claim.', misinformation_pattern_text: 'Unable to verify due to lack of credible sources.' }).eq('id', claimId);
    await supabase.from('claim_runs').update({ run_status: 'completed', completed_at: new Date().toISOString() }).eq('id', claimRunData.id);
    return;
  }

  const insertedSources: SourceRecord[] = [];
  for (const r of filteredResults) {
    const { data } = await supabase.from('sources').insert({
      claim_id: claimId,
      claim_run_id: claimRunData.id,
      url: r.url,
      title: r.title,
      publisher: extractPublisher(r.url),
      source_type: classifySourceType(r.url),
      region: null,
      publish_date: r.published_date ?? null,
      snippet_text: r.content?.substring(0, 500) || null,
      credibility_score: credibilityScore(r.url),
      retrieval_method: 'tavily_search',
    }).select('id, publisher, snippet_text, credibility_score, source_type, title').single();
    if (data) insertedSources.push(data);
  }

  const sourceAnalysis = await analyzeSourcesWithClaude(claimText, insertedSources);
  const analysis = buildAnalysis(claimText, insertedSources, category, sourceAnalysis.summary, sourceAnalysis.verdict);

  await supabase.from('claims').update(analysis.claimUpdate).eq('id', claimId);

  const takes = sourceAnalysis.takes.length > 0 ? sourceAnalysis.takes : analysis.takes;
  if (takes.length > 0) {
    await supabase.from('claim_takes').insert(takes.map((t, i) => ({ claim_id: claimId, claim_run_id: claimRunData.id, take_text: t, display_order: i })));
  }

  if (sourceAnalysis.consensus.length > 0) {
    await supabase.from('claim_consensus_points').insert(sourceAnalysis.consensus.map((p, i) => ({ claim_id: claimId, claim_run_id: claimRunData.id, point_text: p.text, source_ids: p.sourceIds, display_order: i })));
  }

  if (sourceAnalysis.disputes.length > 0) {
    await supabase.from('claim_disputes').insert(sourceAnalysis.disputes.map((p, i) => ({ claim_id: claimId, claim_run_id: claimRunData.id, point_text: p.text, source_ids: p.sourceIds, display_order: i })));
  }

  if (sourceAnalysis.arguments.length > 0) {
    await supabase.from('claim_arguments').insert(sourceAnalysis.arguments.map((a, i) => ({ claim_id: claimId, claim_run_id: claimRunData.id, side: a.side, argument_text: a.argument_text, evidence_text: a.evidence_text, source_ids: a.source_ids, strength: a.strength, display_order: i })));
  }

  await supabase.from('claim_runs').update({ run_status: 'completed', completed_at: new Date().toISOString() }).eq('id', claimRunData.id);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { claimText } = await req.json();

    if (!claimText || typeof claimText !== 'string') {
      return NextResponse.json({ error: 'Claim text is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const normalizedText = claimText.toLowerCase().trim();

    const { data: existingClaim } = await supabase
      .from('claims')
      .select('id')
      .eq('normalized_text', normalizedText)
      .maybeSingle();

    if (existingClaim) {
      return NextResponse.json({ claimId: existingClaim.id, existing: true });
    }

    const category = classifyCategory(claimText);

    const { data: claimRow, error: insertError } = await supabase
      .from('claims')
      .insert({ original_text: claimText, normalized_text: normalizedText, category, current_status: 'Under Analysis', evidence_quality: 'Pending', summary_text: 'Analysis in progress...' })
      .select()
      .single();

    if (insertError) throw insertError;

    waitUntil(runAnalysis(claimRow.id, claimText, category).catch((err) => console.error('Background analysis error:', err)));

    return NextResponse.json({ claimId: claimRow.id, existing: false });
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal error' }, { status: 500 });
  }
}
