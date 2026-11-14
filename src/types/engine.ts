export type EngineMode = 'RACING' | 'PUBLISHING';

export type WorkerPod = 'INTEL_SEO' | 'MEDIA_DESIGN' | 'EXEC_ADMIN' | 'DEV_INFRA';

export type ChatModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-argon'
  | 'gemini-4-carbon';

export type VideoAspectRatio = '16:9' | '9:16';

export interface RacingRunner {
  no: number;
  name: string;
  barrier: number;
  odds: number;
  dolt_win_rate_1200m: string;
  jockey?: string;
  trainer?: string;
  weight?: string;
  form?: string;
}

export interface RacingCardData {
  meeting: string;
  race_number: number;
  distance: string;
  track: string;
  runners: RacingRunner[];
}

export interface KnowledgeItemData {
  id: number;
  domain: 'PUBLISHING' | 'RACING';
  title: string;
  raw_metrics: {
    search_volume?: number;
    kd?: number;
    cpc?: number;
    keyword?: string;
    country?: string;
    [key: string]: unknown;
  };
  notes: string;
}

export interface DoltCommit {
  hash: string;
  branch: string;
  branch_ref: string;
  message: string;
  author: string;
  timestamp: string;
  table: 'racing_cards' | 'knowledge_items';
  record_id: string;
  data: RacingCardData | KnowledgeItemData;
}

export interface RagDocument {
  id: string;
  title: string;
  collection: string;
  domain: EngineMode;
  content: string;
  created_at: string;
  has_embedding: boolean;
}

export interface RagSearchResult {
  document: RagDocument;
  score: number;
  method: 'gemini-embedding-2' | 'lexical-fallback';
}

export interface OrchestratorOutput {
  mode: EngineMode;
  dolt_branch_ref: string;
  seo_target_keyword: string;
  markdown_content: string;
  nanobanana_prompt: string;
  slides_summary_bullets: string[];
  gmail_subject_line: string;
  next_a2a_agent: string;
}

export interface A2ATask {
  step: number;
  target_pod: WorkerPod;
  tool_action: string;
  parameters: Record<string, unknown>;
  depends_on_step: number | null;
}

export interface RouterOutput {
  intent_summary: string;
  status: 'READY_TO_DISPATCH' | 'NEEDS_CLARIFICATION';
  clarification_question: string | null;
  a2a_tasks: A2ATask[];
}

export interface EdgeWebhookResponse {
  commit_ref: string;
  headline: string;
  action_plan: string[];
  next_agent: string;
  latency_ms: number;
  gateway_target: string;
  model_used: string;
}

export interface SearchGroundingSource {
  title: string;
  uri: string;
}

export interface SearchGroundingResult {
  answer: string;
  sources: SearchGroundingSource[];
  model_used: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  model?: ChatModelId;
  sources?: SearchGroundingSource[];
  timestamp: string;
}

export interface VideoGenerationResult {
  video_data_url: string;
  mime_type: string;
  aspect_ratio: VideoAspectRatio;
  duration: string;
  model_used: string;
  interaction_id?: string;
}

// FormFav MCP Types (Aus Gallops)
export interface FormFavMcpToolSummary {
  name: string;
  title: string;
  description: string;
  required: string[];
}

export interface FormFavMcpStatus {
  endpoint: string;
  connected: boolean;
  serverName: string;
  serverVersion: string;
  instructions: string;
  hasApiKey: boolean;
  tools: FormFavMcpToolSummary[];
  error?: string;
}

export interface FormFavMeetingRace {
  raceNumber: number;
  raceName: string | null;
  distance: string | null;
  condition: string | null;
  weather: string | null;
  raceClass: string | null;
  abandoned: boolean;
  startTime: string | null;
  timezone: string | null;
  prizeMoney: string | null;
  numberOfRunners: number | null;
}

export interface FormFavMeeting {
  track: string;
  slug: string;
  country: string;
  abandoned: boolean;
  races: FormFavMeetingRace[];
}

export interface FormFavRunnerStats {
  starts: number;
  wins: number;
  places: number;
  seconds: number;
  thirds: number;
  winPercent: number;
  placePercent: number;
}

export interface FormFavRunnerCareerStats {
  overall?: FormFavRunnerStats | null;
  track?: FormFavRunnerStats | null;
  distance?: FormFavRunnerStats | null;
  trackDistance?: FormFavRunnerStats | null;
  conditions?: Record<string, FormFavRunnerStats> | null;
  firstUp?: FormFavRunnerStats | null;
  secondUp?: FormFavRunnerStats | null;
}

export interface FormFavRunnerForm {
  number: number;
  name: string;
  jockey?: string | null;
  trainer?: string | null;
  weight?: string | number | null;
  claim?: string | number | null;
  barrier?: number | string | null;
  age?: number | null;
  sex?: string | null;
  sire?: string | null;
  dam?: string | null;
  country?: string | null;
  careerPrizeMoney?: string | null;
  form?: string | null;
  last20Starts?: string | null;
  stats?: FormFavRunnerCareerStats | null;
  scratched?: boolean;
  speedMap?: Record<string, unknown> | null;
  classProfile?: Record<string, unknown> | null;
  raceClassFit?: Record<string, unknown> | null;
  decorators?: Array<{ label?: string; text?: string; [key: string]: unknown }>;
}

export interface FormFavRaceFormResponse {
  date: string;
  track: string;
  raceNumber: number;
  raceName: string | null;
  distance: string | null;
  condition: string | null;
  weather: string | null;
  raceClass: string | null;
  abandoned: boolean;
  startTime: string | null;
  timezone: string | null;
  prizeMoney: string | null;
  numberOfRunners: number | null;
  runners: FormFavRunnerForm[];
}

export interface TrifectaLegPrediction {
  position: string;
  runner_number: number;
  runner_name: string;
  barrier: string;
  form: string;
  confidence_score: number;
  role: string;
  reason: string;
}

export interface TrifectaTicket {
  type: string;
  combination: string;
  runners: number[];
  strategy_reason: string;
}

export interface TrifectaPredictionResult {
  race_summary: string;
  date: string;
  track: string;
  race_number: number;
  distance: string;
  condition: string;
  overall_reasoning: string;
  track_bias_factor: string;
  top_selections: TrifectaLegPrediction[];
  recommended_tickets: TrifectaTicket[];
  risk_notes: string;
  model_used: string;
  source: 'formfav_mcp' | 'dolt_commit' | 'custom_input';
}

export interface FirecrawlRunnerMarketSpeedmap {
  runner_number: number | null;
  runner_name: string;
  barrier: string;
  win_odds: string;
  place_odds: string;
  opening_odds: string;
  market_trend: string;
  speedmap_role: string;
  expected_settle_position: string;
  pace_note: string;
}

export interface FirecrawlSourceLink {
  title: string;
  url: string;
}

export interface FirecrawlRacingIntel {
  track: string;
  race_number: number | null;
  date: string;
  pace_forecast: string;
  pace_summary: string;
  market_runners: FirecrawlRunnerMarketSpeedmap[];
  sources: FirecrawlSourceLink[];
  raw_markdown_preview: string;
  mode_used: 'scrape' | 'search';
  model_used: string;
  fetched_at: string;
}

export interface EngineState {
  branches: string[];
  commits: DoltCommit[];
  rag_documents: RagDocument[];
}
