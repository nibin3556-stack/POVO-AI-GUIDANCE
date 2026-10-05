import type { RoleType, TierCode } from '../constants/colors';

export type { RoleType, TierCode };

export type RoleCode = 'REP' | 'MANAGER';
export type Category = 'messaging' | 'objection' | 'closing';
export type AssessmentCategory = Category | 'additional';
export type SegmentCode = 'imm' | 'conv' | 'exp';
export type ChannelCode = 'rep' | 'adfa' | 'opz' | 'msl' | 'spkr' | 'pr';
export type InteractionFilter = 'all' | ChannelCode;
export type Period = 'month' | 'quarter' | 'ytd';
export type Grain = 'month' | 'week';
export type Reception = 0 | 1 | 2;
export type ComplianceStatus = 'unchecked' | 'passed' | 'flagged';
export type Severity = 'high' | 'med' | 'low';

export interface Employee {
  employee_id: string;
  network_id: string;
  username: string;
  full_name: string;
  initials: string;
  business_unit: string;
  role_code: RoleCode;
  role_title: string;
  access_level: string;
  access_regions: string;
  home_territory_id: string;
  territory_name: string;
  region: string;
}

export interface Territory {
  territory_id: string;
  territory_name: string;
  city: string;
  state: string;
  region: string;
}

export interface Me {
  signed_in: Employee;
  effective: Employee;
  is_impersonating: boolean;
  permissions: string[];
  territory: Territory;
  today: string;
  data_as_of: string | null;
}

/* ---------------------------------------------------------------- performance */

export type KpiStatus = 'on_track' | 'at_risk' | 'no_goal';

/** Total on POVO = Paid NRx (new + continuing) + Bridge NRx + Free Trial NRx; the % add up to 100. */
export interface PatientSplit {
  total: number;
  paid: number;
  bridge: number;
  free_trial: number;
  paid_pct: number;
  bridge_pct: number;
  free_trial_pct: number;
  new_patients: number;
  continuing_patients: number;
  as_of: string;
}

export interface KpiCard {
  metric_code: 'PEF' | 'NEW_PATIENTS';
  title: string;
  unit: string;
  goal: number;
  achieved: number;
  yet_to_achieve: number;
  pct_achieved: number;
  due_to_date: number;
  status: KpiStatus;
  /** Patients card only. */
  split?: PatientSplit;
}

export interface Kpis {
  period: Period;
  period_label: string;
  period_start: string;
  period_end: string;
  remaining_working_days: number;
  data_start: string;
  cards: KpiCard[];
}

export interface GuidanceMissed {
  hcp_id: string;
  name: string;
  display_name: string;
  role_type: RoleType;
  tier_code: TierCode;
  days_since_call: number;
}

export interface GuidanceFocus {
  hcp_id: string;
  name: string;
  display_name: string;
  role_type: RoleType;
  tier_code: TierCode;
  reason: string;
  score: number;
}

export interface Guidance {
  missed: GuidanceMissed[];
  super_high_not_writing: number;
  strong: {
    best_segment: { segment_code: SegmentCode; short_name: string; trial_pct: number };
    /** `ties` names every physician tied for the most POVO patients (the first is `display_name`). */
    top_writer: { hcp_id: string; display_name: string; povo_patients: number; ties: string[] } | null;
    super_high_reach_pct: number;
  };
  focus: GuidanceFocus[];
  source: 'live' | 'snapshot';
  generated_at: string;
}

export interface Segment {
  segment_code: SegmentCode;
  short_name: string;
  full_name: string;
  description: string;
  color_hex: string;
  hcp_count: number;
  pct: number;
  trial_pct: number;
  penetration_pct: number;
  adoption_pct: number;
  reach_pct: number;
  /** Targets > Reached > Writing (Trial) > 3+ POVO patients (Adoption); % of the segment's targets. */
  funnel: {
    reached: number;
    reached_pct: number;
    writers: number;
    writers_pct: number;
    adopters: number;
    adopters_pct: number;
    povo_patients: number;
    hs_patients: number;
  };
}

export interface Segmentation {
  total_targets: number;
  not_writing: number;
  segments: Segment[];
}

export interface DecileRow {
  decile: number;
  tier_code: TierCode;
  targets: number;
  writers: number;
  yet_to_write: number;
  hs_patients: number;
  avg_hs_patients: number;
  reached: number;
  reach_pct: number;
  reach_goal_pct: number;
  calls: number;
  /** Calls / targets reached in the data window; null when nobody was reached. */
  avg_frequency: number | null;
  frequency_goal: number;
}

export interface Tier {
  tier_code: TierCode;
  tier_name: string;
  decile_min: number;
  decile_max: number;
  calls_per_year: number;
  reach_goal_pct: number;
  targets: number;
  writers: number;
  frequency_goal: number;
}

export interface Deciles {
  rows: DecileRow[];
  tiers: Tier[];
  /** Share of the working year the data window covers (the frequency goal's factor). */
  elapsed_pct: number;
  data_start: string;
  super_high_total: number;
  super_high_not_writing: number;
}

export interface WriterBucket {
  label: string;
  start_date: string;
  end_date: string;
  /** New POVO writers per HS treatment segment. */
  segments: Record<SegmentCode, number>;
  total: number;
  is_partial: boolean;
}

export interface NewWriters {
  grain: Grain;
  total: number;
  range_label: string;
  x_axis_label: string;
  segment_codes: SegmentCode[];
  buckets: WriterBucket[];
}

/* ---------------------------------------------------------------- targets */

export interface Target {
  hcp_id: string;
  name: string;
  display_name: string;
  role_type: RoleType;
  degree: string;
  specialty: string;
  account_id: string;
  account_name: string;
  city: string;
  state: string;
  zip: string;
  competitive_focus: string;
  segment_code: SegmentCode;
  decile: number;
  tier_code: TierCode | null;
  is_in_call_plan: boolean;
  hs_patients: number;
  jak_patients: number;
  povo_patients: number;
  /** PEFs received through IncyteCARES; every POVO patient has one. */
  pef: number;
  last_call_date: string | null;
  parent_hcp_id: string | null;
  is_must_win: boolean;
}

export interface MustWins {
  territory_name: string;
  hs_volume: Target[];
  hs_jak: Target[];
}

export interface Facet {
  code: string;
  label: string;
  count: number;
  color_hex?: string;
}

export interface Facets {
  focus: Facet[];
  segment: Facet[];
  tier: Facet[];
  account: Facet[];
  role: Facet[];
}

export type FilterGroup = 'focus' | 'segment' | 'tier' | 'account' | 'role';

export type TargetFilters = Record<FilterGroup, string[]>;

export type SortDirection = 'asc' | 'desc';
export type TargetSortKey = 'name' | 'decile' | 'hs_patients' | 'pef' | 'last_call_date';

export interface TargetSort {
  key: TargetSortKey;
  direction: SortDirection;
}

export interface TargetQuery {
  filters: TargetFilters;
  page: number;
  limit: number;
  sort: string;
}

/* ---------------------------------------------------------------- call prep */

export interface Interaction {
  interaction_id: string;
  date: string;
  channel_code: ChannelCode;
  team_label: string;
  type_label: string;
  summary: string;
  is_new: boolean;
}

export interface ParticipantStats {
  hs_patients: number;
  povo_patients: number;
  decile: number;
  tier_name: string;
  rank: number;
  rank_of: number;
  povo_discussions: number;
  last_call_date: string | null;
}

export interface Participant {
  hcp_id: string;
  role_type: RoleType;
  degree: string;
  name: string;
  display_name: string;
  account_name: string;
  city: string;
  zip: string;
  is_primary: boolean;
  segment_code: SegmentCode | null;
  stats: ParticipantStats;
  bullets: string[];
  interactions: Interaction[];
  interaction_counts: Partial<Record<InteractionFilter, number>>;
}

export interface Profile {
  primary_hcp_id: string;
  preselected_participant_ids: string[];
  participants: Participant[];
}

export interface TalkingPoint {
  point_id: string;
  rank: number;
  pillar: string | null;
  text: string;
  detail: string | null;
  detail_label: 'Insight' | 'Response' | null;
  tags: string[];
  previous_text: string | null;
  previous_rank: number | null;
}

/** A point delivered on an earlier call: its date, reception and label ("Well Received", "Still Open"). */
export interface DeliveredPoint extends TalkingPoint {
  delivered_date: string;
  reception: Reception | null;
  label: string;
  is_open: boolean;
}

export interface CallPrep {
  participant_id: string;
  category: Category;
  revision_no: number;
  is_revised: boolean;
  revised_from_date: string | null;
  banner: { summary: string; next_best_action: string } | null;
  steps: string[];
  heading: string;
  points: TalkingPoint[];
  delivered: DeliveredPoint[];
  source: 'ai' | 'rules';
}

export interface CallPrepArgs {
  hcp_id: string;
  participant_id: string;
  category: Category;
}

/* ---------------------------------------------------------------- calls */

export interface Assessment {
  participant_id: string;
  category: AssessmentCategory;
  point_id: string;
  point_rank: number;
  point_text: string;
  was_raised: boolean;
  reception: Reception | null;
  note: string;
  compliance_status: ComplianceStatus;
  compliance_check_id: string | null;
}

export type AssessmentInput = Omit<Assessment, 'compliance_status' | 'compliance_check_id'>;

export interface Call {
  call_id: string;
  hcp_id: string;
  call_date: string;
  participant_ids: string[];
  status: 'planned' | 'assessed';
  revision_no: number;
  assessments: Assessment[];
}

export interface EnsureCallArgs {
  hcp_id: string;
  participant_ids: string[];
}

export interface ComplianceIssue {
  rule_id: string;
  chip: string;
  title: string;
  severity: Severity;
  why: string;
  fix: string;
  excerpt: string;
}

export interface ComplianceResult {
  check_id: string;
  status: 'passed' | 'flagged';
  result_label: string;
  max_severity: Severity | null;
  score: number;
  issues: ComplianceIssue[];
  suggested_text: string | null;
  steps: string[];
  engine: string;
}

/** POST /example-notes: what the AI predicts the rep will write for one note field. */
export interface ExampleNotesArgs {
  call_id: string | null;
  participant_id: string;
  category: AssessmentCategory;
  point_text: string;
  /** The reception picked so far; null when not rated (and always for objections and Additional Notes). */
  reception: Reception | null;
}

export interface ExampleNotesResult {
  notes: string[];
  /** `none` = AI was not available; the screen then shows no example notes. */
  source: 'ai' | 'none';
}

export interface ComplianceCheckArgs {
  call_id: string | null;
  participant_id: string;
  category: AssessmentCategory;
  point_id: string;
  point_text: string;
  note: string;
}

export interface NextCallFlag {
  participant_id: string;
  category: AssessmentCategory;
  point_id: string;
  chip: string;
  /** The note the server checked. */
  note?: string;
  /** The full compliance report for that note. */
  result?: ComplianceResult & { check_id: string };
}

export interface NextCallResult {
  call_id: string;
  revision_no: number;
  call_date: string;
  steps: string[];
  participants: { participant_id: string; summary: string; next_best_action: string }[];
  source: 'ai' | 'rules';
}

/** GET /api/v1/reference: every lookup the screens label and colour data with. */
export interface ReferenceTier {
  code: TierCode;
  name: string;
  decile_min: number;
  decile_max: number;
  calls_per_year: number;
  reach_goal_pct: number;
}

export interface ReferenceSegment {
  code: string;
  short_name: string;
  full_name: string;
  description: string;
  color_hex: string;
}

export interface ReferenceOption<C extends string = string> {
  code: C;
  label: string;
}

export interface ReferenceFocus extends ReferenceOption {
  color_hex: string;
}

export interface ReferenceChannel {
  code: ChannelCode;
  type_label: string;
  team_label: string;
}

export interface Reference {
  content_version: string;
  tiers: ReferenceTier[];
  segments: ReferenceSegment[];
  competitive_focus: ReferenceFocus[];
  role_types: ReferenceOption<RoleType>[];
  interaction_channels: ReferenceChannel[];
  kpi_metrics: { code: string; title: string; unit: string }[];
  categories: ReferenceOption<Category>[];
  reception_scale: { value: Reception; label: string }[];
  compliance: { rule_count: number; steps: string[]; severity_labels: Record<'high' | 'med' | 'low', string> };
  next_call_steps: string[];
  /** AI activity steps per category; `{possessive}` is "Dr. Winters'" or "Kristen Casey's". */
  prep_steps: Record<Category, string[]>;
  limits: { points_per_category: number; note_max_length: number; additional_note_max_length: number };
}
