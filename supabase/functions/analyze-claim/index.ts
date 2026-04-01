import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") ?? Deno.env.get("tavily") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FACT_CHECK_DOMAINS = [
  "snopes.com", "politifact.com", "factcheck.org", "fullfact.org",
  "apnews.com/ap-fact-check", "reuters.com/fact-check", "bbc.com/news/reality_check",
  "washingtonpost.com/news/fact-checker", "usatoday.com/news/factcheck",
  "sciencefeedback.co", "healthfeedback.org", "climatefeedback.org",
  "leadstories.com", "checkyourfact.com", "africacheck.org",
  "misbar.com", "logically.ai",
];

const AUTHORITY_DOMAINS: Record<string, number> = {
  ".gov": 10, ".edu": 10, "nature.com": 10, "science.org": 10,
  "who.int": 10, "cdc.gov": 10, "nih.gov": 10, "nasa.gov": 10,
  "worldbank.org": 10, "un.org": 10, "pubmed.ncbi.nlm.nih.gov": 10,
  "scholar.google.com": 10, "arxiv.org": 9, "sciencedirect.com": 9,
  "thelancet.com": 10, "lancet.com": 10, "bmj.com": 10, "nejm.org": 10,
  "reuters.com": 9, "apnews.com": 9, "snopes.com": 9,
  "politifact.com": 9, "factcheck.org": 9, "fullfact.org": 9,
  "nytimes.com": 7, "washingtonpost.com": 7, "bbc.com": 7,
  "theguardian.com": 7, "economist.com": 7, "ft.com": 7,
  "wsj.com": 7, "theatlantic.com": 7,
  "cnn.com": 5, "nbcnews.com": 5, "abcnews.go.com": 5,
  "cbsnews.com": 5, "npr.org": 6, "pbs.org": 6,
  "time.com": 5, "newsweek.com": 5,
  "infowars.com": 1, "naturalnews.com": 1, "breitbart.com": 2,
  "dailymail.co.uk": 3, "nypost.com": 3, "thesun.co.uk": 2,
};

const WELL_ESTABLISHED_FACTS: Record<string, string> = {
  "moon landing fake": "The Apollo moon landings (1969-1972) are among the most thoroughly documented events in history, confirmed by independent evidence from multiple countries including the Soviet Union.",
  "moon landing hoax": "The Apollo moon landings (1969-1972) are among the most thoroughly documented events in history, confirmed by independent evidence from multiple countries including the Soviet Union.",
  "never went to the moon": "The Apollo moon landings (1969-1972) are among the most thoroughly documented events in history, confirmed by independent evidence from multiple countries including the Soviet Union.",
  "flat earth": "Earth is an oblate spheroid, confirmed by centuries of scientific observation, satellite imagery, and physics.",
  "earth is flat": "Earth is an oblate spheroid, confirmed by centuries of scientific observation, satellite imagery, and physics.",
  "vaccines cause autism": "The single study (Wakefield 1998) claiming this link was retracted for fraud. Dozens of large-scale studies involving millions of children have found no connection.",
  "vaccine autism": "The single study (Wakefield 1998) claiming this link was retracted for fraud. Dozens of large-scale studies involving millions of children have found no connection.",
  "evolution is fake": "Evolution by natural selection is supported by evidence from genetics, paleontology, comparative anatomy, and direct observation of speciation.",
  "evolution is a lie": "Evolution by natural selection is supported by evidence from genetics, paleontology, comparative anatomy, and direct observation of speciation.",
  "climate change hoax": "Human-caused climate change is supported by over 97% of climate scientists and every major scientific organization worldwide.",
  "global warming fake": "Human-caused climate change is supported by over 97% of climate scientists and every major scientific organization worldwide.",
  "global warming hoax": "Human-caused climate change is supported by over 97% of climate scientists and every major scientific organization worldwide.",
  "5g causes covid": "COVID-19 is caused by the SARS-CoV-2 virus. Radio waves cannot create or spread viruses.",
  "5g coronavirus": "COVID-19 is caused by the SARS-CoV-2 virus. Radio waves cannot create or spread viruses.",
  "chemtrails": "Contrails are condensation trails formed by water vapor in aircraft exhaust. No evidence supports the chemtrail conspiracy.",
  "holocaust denial": "The Holocaust is one of the most thoroughly documented events in history, with evidence from Nazi records, Allied liberators, survivors, and physical evidence at concentration camp sites.",
  "holocaust didnt happen": "The Holocaust is one of the most thoroughly documented events in history, with evidence from Nazi records, Allied liberators, survivors, and physical evidence at concentration camp sites.",
  "sandy hook hoax": "The Sandy Hook Elementary School shooting on December 14, 2012 is thoroughly documented by law enforcement, medical examiners, and hundreds of witnesses. Courts have ruled against conspiracy promoters.",
  "birds arent real": "Birds are real animals. The \"Birds Aren't Real\" movement began as satirical commentary on conspiracy theories.",
  "reptilian shapeshifters": "There is no evidence for the existence of reptilian shapeshifters. This is a conspiracy theory without any scientific basis.",
};

// ── Classifiers ───────────────────────────────────────────────────────────────

function classifyCategory(text: string): string {
  const lower = text.toLowerCase();
  const map: Record<string, string[]> = {
    health: ["health", "medical", "disease", "drug", "treatment", "vaccine", "diet", "supplement", "creatine", "cancer", "covid", "autism", "symptom", "nutrition", "pharmaceutical", "ivermectin", "hydroxychloroquine"],
    science: ["science", "research", "study", "experiment", "theory", "discovery", "evolution", "physics", "chemistry", "biology", "moon landing", "flat earth", "space", "nasa", "gravity"],
    environment: ["climate", "environment", "pollution", "emissions", "electric vehicle", "ev", "renewable", "carbon", "global warming", "ocean", "deforestation", "chemtrail"],
    technology: ["ai", "artificial intelligence", "technology", "tech", "software", "algorithm", "robot", "automation", "5g", "cyber", "quantum"],
    politics: ["government", "politics", "election", "policy", "law", "congress", "president", "senator", "sanctions", "vote", "democracy", "deep state", "rigged"],
    economics: ["economy", "economic", "market", "stock", "inflation", "gdp", "recession", "employment", "jobs", "trade", "tariff", "federal reserve"],
    product: ["product", "buy", "purchase", "guarantee", "money back", "tested", "proven"],
  };
  for (const [cat, terms] of Object.entries(map)) {
    if (terms.some((t) => lower.includes(t))) return cat;
  }
  return "general";
}

function extractPublisher(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "").split(".")[0];
  } catch {
    return "Unknown";
  }
}

function getAuthorityWeight(url: string): number {
  const lower = url.toLowerCase();
  for (const [domain, weight] of Object.entries(AUTHORITY_DOMAINS)) {
    if (lower.includes(domain)) return weight;
  }
  return 4;
}

function isFactCheckSource(url: string): boolean {
  const lower = url.toLowerCase();
  return FACT_CHECK_DOMAINS.some((d) => lower.includes(d));
}

function classifySourceType(url: string): string {
  const l = url.toLowerCase();
  if (isFactCheckSource(url)) return "Fact-check";
  if (l.includes(".gov")) return "Government data";
  if (l.includes(".edu") || l.includes("pubmed") || l.includes("nature.com") || l.includes("science.org") || l.includes("arxiv.org")) return "Peer-reviewed research";
  if (l.includes("who.int") || l.includes("worldbank.org") || l.includes("un.org")) return "International institution";
  if (l.includes("reuters.com") || l.includes("apnews.com")) return "Wire service";
  if (l.includes("nytimes.com") || l.includes("washingtonpost.com") || l.includes("bbc.com") || l.includes("theguardian.com")) return "Newspaper of record";
  return "News / other";
}

function credibilityScore(url: string): number {
  const weight = getAuthorityWeight(url);
  return Math.min(0.99, Math.max(0.10, weight / 10));
}

function checkWellEstablishedFact(claimText: string): string | null {
  const lower = claimText.toLowerCase();
  for (const [pattern, explanation] of Object.entries(WELL_ESTABLISHED_FACTS)) {
    const keywords = pattern.split(" ");
    if (keywords.every((kw) => lower.includes(kw))) return explanation;
  }
  return null;
}

// ── Tavily search ─────────────────────────────────────────────────────────────

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

async function searchTavily(query: string, searchDepth: string = "advanced", maxResults: number = 8): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: TAVILY_API_KEY, query, search_depth: searchDepth, max_results: maxResults, include_answer: false }),
  });
  if (!res.ok) throw new Error(`Tavily error ${res.status}`);
  const data = await res.json();
  return data.results ?? [];
}

async function performComprehensiveSearch(claimText: string, category: string): Promise<TavilyResult[]> {
  const allResults: TavilyResult[] = [];
  const seenUrls = new Set<string>();

  const addResults = (results: TavilyResult[]) => {
    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allResults.push(r);
      }
    }
  };

  try {
    addResults(await searchTavily(claimText, "advanced", 6));
  } catch (err) {
    console.error("Direct search failed:", err);
  }

  try {
    addResults(await searchTavily(`fact check: ${claimText}`, "advanced", 4));
  } catch (err) {
    console.error("Fact-check search failed:", err);
  }

  if (["science", "health", "environment"].includes(category)) {
    try {
      addResults(await searchTavily(`${claimText} scientific evidence research`, "basic", 4));
    } catch (err) {
      console.error("Scientific search failed:", err);
    }
  }

  return allResults;
}

// ── Claude-powered source analysis ────────────────────────────────────────────

interface SourceAnalysis {
  stance: "supports_claim" | "refutes_claim" | "provides_context" | "irrelevant";
  stance_confidence: number;
  key_finding: string;
  is_about_claim: boolean;
}

interface ClaimAnalysis {
  verdict: "Well Supported" | "Partially Supported" | "Misleading" | "Under Debate" | "Insufficient Evidence";
  evidence_quality: "High" | "Moderate" | "Limited";
  summary: string;
  misinformation_pattern: string;
  source_analyses: SourceAnalysis[];
  consensus_points: string[];
  dispute_points: string[];
  supporting_arguments: Array<{ text: string; evidence: string | null; strength: "strong" | "moderate" | "weak"; source_indices: number[] }>;
  opposing_arguments: Array<{ text: string; evidence: string | null; strength: "strong" | "moderate" | "weak"; source_indices: number[] }>;
}

interface SourceRecord {
  id: string;
  publisher: string;
  snippet_text: string | null;
  credibility_score: number;
  source_type: string;
  title: string;
  url: string;
}

async function analyzeWithClaude(
  claimText: string,
  category: string,
  sources: Array<{ title: string; url: string; snippet: string; publisher: string; source_type: string; authority_weight: number; is_fact_check: boolean }>,
  wellEstablishedContext: string | null
): Promise<ClaimAnalysis> {
  const sourceDescriptions = sources.map((s, i) => {
    const tags = [s.source_type];
    if (s.is_fact_check) tags.push("FACT-CHECKER");
    if (s.authority_weight >= 9) tags.push("HIGH-AUTHORITY");
    else if (s.authority_weight >= 7) tags.push("ESTABLISHED");
    else if (s.authority_weight <= 2) tags.push("LOW-CREDIBILITY");
    return `[Source ${i + 1}] ${s.title}\nPublisher: ${s.publisher} | Type: ${tags.join(", ")}\nAuthority weight: ${s.authority_weight}/10\nContent: ${s.snippet}\n`;
  }).join("\n");

  const systemPrompt = `You are a rigorous fact-checking analyst. Your job is to evaluate a claim against provided sources and determine a verdict.

CRITICAL RULES:
1. SOURCE AUTHORITY MATTERS. A NASA page refuting a conspiracy has FAR more weight than 5 random blogs promoting it. Weight sources by their authority score (1-10).
2. FACT-CHECKERS ARE AUTHORITATIVE. If Snopes, PolitiFact, AP Fact Check, or Reuters Fact Check has evaluated a claim, their verdict should be heavily weighted.
3. READ CAREFULLY. A source that DISCUSSES a conspiracy theory is not SUPPORTING it. A debunking article that mentions "some people believe X is fake" is REFUTING the conspiracy, not supporting it.
4. SCIENTIFIC CONSENSUS MATTERS. If the scientific community has reached consensus on something (evolution, moon landings, vaccines, climate change), individual dissenting sources do not create a "both sides" situation.
5. DO NOT create false balance. If 9 authoritative sources say X and 1 low-credibility source says Y, the verdict should reflect the overwhelming evidence, not present it as "Under Debate."
6. DISTINGUISH between: (a) genuinely debated scientific questions with legitimate disagreement among experts, and (b) settled science being questioned by non-experts or conspiracy theorists.

VERDICT DEFINITIONS:
- "Well Supported": Strong evidence from authoritative sources supports this claim. Scientific consensus backs it, or multiple high-credibility sources confirm it.
- "Partially Supported": Some aspects are supported but important caveats, limitations, or missing context exist. The claim may oversimplify a complex reality.
- "Misleading": The claim misrepresents evidence, cherry-picks data, contradicts scientific consensus, or is a known conspiracy theory/misinformation.
- "Under Debate": Legitimate experts and credible institutions genuinely disagree. This is NOT for settled science vs. conspiracy theories.
- "Insufficient Evidence": Not enough credible sources exist to properly evaluate.

You must respond with ONLY valid JSON matching the specified schema. No markdown, no code fences, no explanation outside the JSON.`;

  const userPrompt = `Evaluate this claim against the sources provided.

CLAIM: "${claimText}"
CATEGORY: ${category}
${wellEstablishedContext ? `\nIMPORTANT CONTEXT: This claim relates to well-established scientific knowledge: ${wellEstablishedContext}\n` : ""}
SOURCES:
${sourceDescriptions}

Respond with ONLY this JSON structure (no markdown fences):
{
  "verdict": "Well Supported" | "Partially Supported" | "Misleading" | "Under Debate" | "Insufficient Evidence",
  "evidence_quality": "High" | "Moderate" | "Limited",
  "summary": "2-3 sentence summary of what the evidence actually shows",
  "misinformation_pattern": "Why people might be misled about this topic (1-2 sentences)",
  "source_analyses": [
    {
      "stance": "supports_claim" | "refutes_claim" | "provides_context" | "irrelevant",
      "stance_confidence": 0.0-1.0,
      "key_finding": "One sentence: what this source actually says about the claim",
      "is_about_claim": true/false
    }
  ],
  "consensus_points": ["Points where sources agree (2-4 items)"],
  "dispute_points": ["Points where sources disagree or add nuance (1-3 items)"],
  "supporting_arguments": [
    {
      "text": "Argument supporting the claim",
      "evidence": "Specific evidence or null",
      "strength": "strong" | "moderate" | "weak",
      "source_indices": [1, 2]
    }
  ],
  "opposing_arguments": [
    {
      "text": "Argument against the claim",
      "evidence": "Specific evidence or null",
      "strength": "strong" | "moderate" | "weak",
      "source_indices": [3, 4]
    }
  ]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2500,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude API error:", response.status, errText);
      throw new Error(`Claude API error ${response.status}`);
    }

    const data = await response.json();
    const text = data.content
      ?.map((item: { type: string; text?: string }) => (item.type === "text" ? item.text : ""))
      .filter(Boolean)
      .join("\n") || "";

    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned) as ClaimAnalysis;
  } catch (err) {
    console.error("Claude analysis failed, using fallback:", err);
    return buildFallbackAnalysis(sources, wellEstablishedContext);
  }
}

function buildFallbackAnalysis(
  sources: Array<{ title: string; url: string; snippet: string; publisher: string; source_type: string; authority_weight: number; is_fact_check: boolean }>,
  wellEstablishedContext: string | null
): ClaimAnalysis {
  if (wellEstablishedContext) {
    return {
      verdict: "Misleading",
      evidence_quality: sources.length >= 3 ? "High" : "Moderate",
      summary: wellEstablishedContext,
      misinformation_pattern: "This claim contradicts well-established scientific evidence and expert consensus. Misinformation on this topic often spreads through social media and unreliable sources.",
      source_analyses: sources.map(() => ({
        stance: "refutes_claim" as const,
        stance_confidence: 0.7,
        key_finding: "Source addresses this topic with authoritative information.",
        is_about_claim: true,
      })),
      consensus_points: ["Authoritative sources and scientific consensus are clear on this topic."],
      dispute_points: ["Some non-authoritative sources promote alternative claims without credible evidence."],
      supporting_arguments: [{
        text: "Some non-authoritative sources and social media posts promote this claim",
        evidence: null,
        strength: "weak",
        source_indices: [],
      }],
      opposing_arguments: [{
        text: "Scientific consensus and authoritative institutions refute this claim with extensive evidence",
        evidence: wellEstablishedContext,
        strength: "strong",
        source_indices: sources.map((_, i) => i + 1).filter((i) => sources[i - 1].authority_weight >= 7),
      }],
    };
  }

  const highAuthority = sources.filter((s) => s.authority_weight >= 7);
  let verdict: ClaimAnalysis["verdict"] = "Under Debate";
  let evidenceQuality: ClaimAnalysis["evidence_quality"] = "Moderate";

  if (sources.length === 0) {
    verdict = "Insufficient Evidence";
    evidenceQuality = "Limited";
  } else if (highAuthority.length >= 3) {
    evidenceQuality = "High";
    verdict = "Partially Supported";
  } else if (highAuthority.length === 0) {
    evidenceQuality = "Limited";
    verdict = "Insufficient Evidence";
  }

  return {
    verdict,
    evidence_quality: evidenceQuality,
    summary: `Analysis based on ${sources.length} sources (${highAuthority.length} high-authority). AI-powered deep analysis was unavailable; results are based on source authority only.`,
    misinformation_pattern: "Without AI-powered content analysis, this assessment is based on source authority levels. Consider verifying with authoritative fact-checking organizations.",
    source_analyses: sources.map((s) => ({
      stance: "provides_context" as const,
      stance_confidence: 0.5,
      key_finding: `${s.publisher} addresses this topic (authority: ${s.authority_weight}/10).`,
      is_about_claim: true,
    })),
    consensus_points: [`${sources.length} sources were found addressing this topic.`],
    dispute_points: ["Detailed content analysis was unavailable for this evaluation."],
    supporting_arguments: [],
    opposing_arguments: [],
  };
}

// ── Background analysis ───────────────────────────────────────────────────────

async function runAnalysis(claimId: string, claimText: string, category: string) {
  const supabase = getSupabaseAdmin();

  const { data: claimRunData } = await supabase
    .from("claim_runs")
    .insert({ claim_id: claimId, run_status: "pending" })
    .select()
    .single();

  if (!claimRunData) return;

  const wellEstablishedContext = checkWellEstablishedFact(claimText);

  let tavilyResults: TavilyResult[] = [];
  try {
    tavilyResults = await performComprehensiveSearch(claimText, category);
  } catch (err) {
    console.error("Search failed:", err);
  }

  if (tavilyResults.length === 0) {
    const fallbackVerdict = wellEstablishedContext ? "Misleading" : "Insufficient Evidence";
    await supabase.from("claims").update({
      current_status: fallbackVerdict,
      evidence_quality: wellEstablishedContext ? "High" : "Limited",
      summary_text: wellEstablishedContext || "Not enough credible sources were found to evaluate this claim.",
      misinformation_pattern_text: wellEstablishedContext
        ? "This claim contradicts well-established scientific consensus."
        : "Unable to verify due to lack of credible sources.",
    }).eq("id", claimId);
    await supabase.from("claim_runs").update({ run_status: "completed", completed_at: new Date().toISOString() }).eq("id", claimRunData.id);
    return;
  }

  const insertedSources: SourceRecord[] = [];
  for (const r of tavilyResults) {
    const { data } = await supabase.from("sources").insert({
      claim_id: claimId,
      claim_run_id: claimRunData.id,
      url: r.url,
      title: r.title,
      publisher: extractPublisher(r.url),
      source_type: classifySourceType(r.url),
      region: null,
      publish_date: r.published_date ?? null,
      snippet_text: r.content?.substring(0, 600) || null,
      credibility_score: credibilityScore(r.url),
      retrieval_method: "tavily_search",
    }).select("id, publisher, snippet_text, credibility_score, source_type, title, url").single();
    if (data) insertedSources.push(data);
  }

  const sourcesForClaude = insertedSources.map((s) => ({
    title: s.title,
    url: s.url,
    snippet: s.snippet_text || "",
    publisher: s.publisher || "Unknown",
    source_type: s.source_type,
    authority_weight: getAuthorityWeight(s.url),
    is_fact_check: isFactCheckSource(s.url),
  }));

  const analysis = await analyzeWithClaude(claimText, category, sourcesForClaude, wellEstablishedContext);

  await supabase.from("claims").update({
    current_status: analysis.verdict,
    evidence_quality: analysis.evidence_quality,
    summary_text: analysis.summary,
    misinformation_pattern_text: analysis.misinformation_pattern,
    updated_at: new Date().toISOString(),
  }).eq("id", claimId);

  const takes = analysis.source_analyses
    .filter((sa) => sa.is_about_claim && sa.key_finding.length > 10)
    .slice(0, 4)
    .map((sa, i) => ({
      claim_id: claimId,
      claim_run_id: claimRunData.id,
      take_text: `According to ${insertedSources[i]?.publisher || "a source"}, ${sa.key_finding}`,
      display_order: i,
    }));

  if (takes.length > 0) {
    await supabase.from("claim_takes").insert(takes);
  }

  if (analysis.consensus_points.length > 0) {
    const supportingSourceIds = analysis.source_analyses
      .map((sa, idx) => ["supports_claim", "refutes_claim"].includes(sa.stance) ? insertedSources[idx]?.id : null)
      .filter(Boolean) as string[];
    await supabase.from("claim_consensus_points").insert(
      analysis.consensus_points.map((text, i) => ({
        claim_id: claimId,
        claim_run_id: claimRunData.id,
        point_text: text,
        source_ids: supportingSourceIds.slice(0, 4),
        display_order: i,
      }))
    );
  }

  if (analysis.dispute_points.length > 0) {
    await supabase.from("claim_disputes").insert(
      analysis.dispute_points.map((text, i) => ({
        claim_id: claimId,
        claim_run_id: claimRunData.id,
        point_text: text,
        source_ids: insertedSources.slice(0, 3).map((s) => s.id),
        display_order: i,
      }))
    );
  }

  const allArgs = [
    ...analysis.supporting_arguments.map((a, i) => ({
      claim_id: claimId,
      claim_run_id: claimRunData.id,
      side: "supporting" as const,
      argument_text: a.text,
      evidence_text: a.evidence,
      source_ids: a.source_indices.map((idx) => insertedSources[idx - 1]?.id).filter(Boolean),
      strength: a.strength,
      display_order: i,
    })),
    ...analysis.opposing_arguments.map((a, i) => ({
      claim_id: claimId,
      claim_run_id: claimRunData.id,
      side: "opposing" as const,
      argument_text: a.text,
      evidence_text: a.evidence,
      source_ids: a.source_indices.map((idx) => insertedSources[idx - 1]?.id).filter(Boolean),
      strength: a.strength,
      display_order: i + analysis.supporting_arguments.length,
    })),
  ];

  if (allArgs.length > 0) {
    await supabase.from("claim_arguments").insert(allArgs);
  }

  await supabase.from("claim_runs").update({
    run_status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", claimRunData.id);
}

// ── Edge function handler ─────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { claimText } = await req.json();

    if (!claimText || typeof claimText !== "string") {
      return new Response(JSON.stringify({ error: "Claim text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();
    const normalizedText = claimText.toLowerCase().trim();

    const { data: existingClaim } = await supabase
      .from("claims")
      .select("id")
      .eq("normalized_text", normalizedText)
      .maybeSingle();

    if (existingClaim) {
      return new Response(JSON.stringify({ claimId: existingClaim.id, existing: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const category = classifyCategory(claimText);

    const { data: claimRow, error: insertError } = await supabase
      .from("claims")
      .insert({
        original_text: claimText,
        normalized_text: normalizedText,
        category,
        current_status: "Under Analysis",
        evidence_quality: "Pending",
        summary_text: "Analysis in progress...",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    EdgeRuntime.waitUntil(
      runAnalysis(claimRow.id, claimText, category).catch((err) =>
        console.error("Background analysis error:", err)
      )
    );

    return new Response(JSON.stringify({ claimId: claimRow.id, existing: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
