import type {
  Reference,
  Account,
  Call,
  CallPrep,
  ComplianceResult,
  Deciles,
  Employee,
  Facets,
  Guidance,
  Kpis,
  Me,
  MustWins,
  NewWriters,
  Participant,
  Profile,
  Segmentation,
  Target,
} from '../types/models';

export const vince: Employee = {
  employee_id: 'p250100',
  network_id: '3200',
  username: 'vturano',
  full_name: 'Vince Turano',
  initials: 'VT',
  business_unit: 'COMMERCIAL',
  role_code: 'REP',
  role_title: 'POVO Sales Representative',
  access_level: 'Rep level, 1 territory',
  access_regions: 'Northeast',
  home_territory_id: 'NE-POR',
  territory_name: 'Portland, ME territory',
  region: 'Northeast',
};

export const barbara: Employee = {
  ...vince,
  employee_id: 'p250544',
  network_id: '3351',
  username: 'bdrake',
  full_name: 'Barbara Drake',
  initials: 'BD',
  role_code: 'MANAGER',
  role_title: 'Manager, Field Sales Enablement',
  access_level: 'Team level, POVO team, 8 territories',
  home_territory_id: 'NE-BOS',
  territory_name: 'Boston, MA territory',
};

export const dana: Employee = {
  ...vince,
  employee_id: 'p250611',
  network_id: '3418',
  username: 'dwhitaker',
  full_name: 'Dana Whitaker',
  initials: 'DW',
  home_territory_id: 'NE-HAR',
  territory_name: 'Hartford, CT territory',
};

export const meRep: Me = {
  signed_in: vince,
  effective: vince,
  is_impersonating: false,
  permissions: ['guidance.view', 'call.assess'],
  territory: { territory_id: 'NE-POR', territory_name: 'Portland, ME territory', city: 'Portland', state: 'ME', region: 'Northeast' },
  today: '2026-10-13',
  data_as_of: '2026-10-12',
};

export const meManager: Me = { ...meRep, signed_in: barbara, effective: barbara, permissions: ['guidance.view', 'call.assess', 'user.impersonate'] };

export const kpis: Kpis = {
  period: 'month',
  period_label: 'October',
  period_start: '2026-10-01',
  period_end: '2026-10-31',
  remaining_working_days: 13,
  cards: [
    { metric_code: 'PEF', title: 'Patient Enrollment Forms', unit: 'PEFs', goal: 24, achieved: 7, yet_to_achieve: 17, pct_achieved: 29, due_to_date: 10, status: 'at_risk' },
    { metric_code: 'NRX', title: 'NRx', unit: 'new scripts', goal: 21, achieved: 6, yet_to_achieve: 15, pct_achieved: 29, due_to_date: 9, status: 'at_risk' },
    { metric_code: 'NEW_PATIENTS', title: 'New POVO Patients', unit: 'patients', goal: 17, achieved: 9, yet_to_achieve: 8, pct_achieved: 53, due_to_date: 7, status: 'on_track' },
  ],
};

export const guidance: Guidance = {
  missed: [{ hcp_id: 'H1', name: 'Boland, Theresa', display_name: 'Dr. Boland', role_type: 'HCP', tier_code: 'SH', days_since_call: 28 }],
  super_high_not_writing: 3,
  strong: {
    best_segment: { segment_code: 'imm', short_name: 'Immediate', trial_pct: 41 },
    top_writer: { hcp_id: 'H2', display_name: 'Dr. Winters', povo_patients: 9 },
    super_high_reach_pct: 92,
  },
  focus: [{ hcp_id: 'H2', name: 'Winters, John', display_name: 'Dr. Winters', role_type: 'HCP', tier_code: 'SH', reason: 'Super High · 133 HS patients', score: 400 }],
  source: 'live',
  generated_at: '2026-10-13T09:00:00Z',
};

export const segmentation: Segmentation = {
  total_targets: 142,
  not_writing: 98,
  segments: [
    { segment_code: 'imm', short_name: 'Immediate', full_name: 'HS Biologic and HS JAK Prescribers', description: 'Treating HS patients with biologics', color_hex: '#156CB4', hcp_count: 50, pct: 35, trial_pct: 41, penetration_pct: 8, adoption_pct: 30, reach_pct: 88 },
    { segment_code: 'conv', short_name: 'Conversion', full_name: 'Advanced Therapy Naïve HS Treaters', description: 'No prior biologic', color_hex: '#0E8A8A', hcp_count: 60, pct: 42, trial_pct: 25, penetration_pct: 5, adoption_pct: 20, reach_pct: 80 },
  ],
};

export const deciles: Deciles = {
  rows: [
    { decile: 10, tier_code: 'SH', targets: 1, writers: 1, yet_to_write: 0, hs_patients: 133, execution_pct: 94, reach_pct: 100, early_reach_count: 1, productivity: 2.1 },
    { decile: 6, tier_code: 'MED', targets: 8, writers: 5, yet_to_write: 3, hs_patients: 190, execution_pct: 82, reach_pct: 83, early_reach_count: 4, productivity: 1.4 },
  ],
  tiers: [
    { tier_code: 'SH', tier_name: 'Super High', decile_min: 7, decile_max: 10, calls_per_year: 40, reach_goal_pct: 95, targets: 12, writers: 10 },
    { tier_code: 'MED', tier_name: 'Medium', decile_min: 5, decile_max: 6, calls_per_year: 28, reach_goal_pct: 95, targets: 18, writers: 11 },
  ],
  super_high_total: 12,
  super_high_not_writing: 2,
};

export const newWriters: NewWriters = {
  grain: 'month',
  total: 44,
  range_label: 'Jan–Oct 2026',
  x_axis_label: 'Month, 2026',
  buckets: [
    { label: 'Sep', start_date: '2026-09-01', end_date: '2026-09-30', jak_writers: 3, non_jak_writers: 2, is_partial: false },
    { label: 'Oct', start_date: '2026-10-01', end_date: '2026-10-13', jak_writers: 1, non_jak_writers: 1, is_partial: true },
  ],
};

export const target = (over: Partial<Target> = {}): Target => ({
  hcp_id: 'H2',
  name: 'Winters, John',
  display_name: 'Dr. Winters',
  role_type: 'HCP',
  degree: 'MD',
  specialty: 'Dermatology',
  account_id: 'A1',
  account_name: 'Maine Medical Partners Dermatology',
  city: 'Portland',
  state: 'ME',
  zip: '04101',
  competitive_focus: 'jak',
  segment_code: 'imm',
  decile: 10,
  tier_code: 'SH',
  is_in_call_plan: true,
  hs_patients: 133,
  jak_patients: 4,
  povo_patients: 9,
  last_call_date: '2026-09-29',
  parent_hcp_id: null,
  is_must_win: true,
  ...over,
});

export const mustWins: MustWins = {
  territory_name: 'Portland, ME territory',
  hs_volume: [target({ hcp_id: 'H3', name: 'Sprague, Marcia', display_name: 'Dr. Sprague', jak_patients: 0, last_call_date: null })],
  hs_jak: [target()],
};

export const facets: Facets = {
  focus: [
    { code: 'jak', label: 'JAK', count: 20, color_hex: '#156CB4' },
    { code: 'humira', label: 'Humira', count: 12, color_hex: '#7C3AED' },
  ],
  segment: [{ code: 'imm', label: 'Immediate', count: 30, color_hex: '#156CB4' }],
  tier: [{ code: 'SH', label: 'Super High', count: 12 }],
  account: [{ code: 'A1', label: 'Maine Medical Partners Dermatology', count: 10 }],
  role: [
    { code: 'HCP', label: 'HCP', count: 40 },
    { code: 'NP', label: 'NP', count: 20 },
    { code: 'PA', label: 'PA', count: 20 },
  ],
};

export const planTargets: Target[] = [
  target({ hcp_id: 'H10', name: 'Berg, Daniel', display_name: 'Dr. Berg', decile: 8, is_must_win: false }),
  target({ hcp_id: 'N11', name: 'Casey, Kristen', display_name: 'Kristen Casey', role_type: 'PA', degree: 'PA', decile: 6, tier_code: 'MED', parent_hcp_id: 'H2', is_must_win: false, last_call_date: null }),
];

export const accounts: Account[] = [
  { account_id: 'A1', account_name: 'Maine Medical Partners Dermatology', city: 'Portland', state: 'ME', zip: '04101', hs_patients: 300, povo_patients: 20, target_count: 12, in_plan_count: 9, main_focus: 'jak', is_claims_only: false },
  { account_id: 'A9', account_name: 'Portland Surgical Specialists', city: 'Portland', state: 'ME', zip: '04101', hs_patients: 24, povo_patients: 0, target_count: 0, in_plan_count: 0, main_focus: 'humira', is_claims_only: true },
];

export const participant = (over: Partial<Participant> = {}): Participant => ({
  hcp_id: 'H2',
  role_type: 'HCP',
  degree: 'MD',
  name: 'Winters, John',
  display_name: 'Dr. Winters',
  account_name: 'Maine Medical Partners Dermatology',
  city: 'Portland, ME',
  zip: '04101',
  is_primary: true,
  stats: { hs_patients: 133, povo_patients: 9, decile: 10, tier_name: 'Super High', rank: 1, rank_of: 142, povo_discussions: 3, last_call_date: '2026-09-29' },
  bullets: ['Decile D10 · #1 of 142 POVO Targets', 'Immediate Opportunity', '9 POVO patients', '3 POVO discussions', 'IncyteCARES enrollment already used'],
  interactions: [
    { interaction_id: 'I1', date: '2026-10-02', channel_code: 'rep', team_label: 'POVO Sales', type_label: 'Direct call', summary: 'POVO discussed', is_new: false },
    { interaction_id: 'I2', date: '2026-09-20', channel_code: 'msl', team_label: 'MSL', type_label: 'MSL visit', summary: 'Answered lab monitoring questions', is_new: false },
  ],
  interaction_counts: { all: 2, rep: 1, msl: 1, adfa: 0, opz: 0, spkr: 0, pr: 0 },
  ...over,
});

export const profile: Profile = {
  primary_hcp_id: 'H2',
  preselected_participant_ids: ['H2'],
  participants: [
    participant(),
    participant({ hcp_id: 'N11', role_type: 'PA', degree: 'PA', name: 'Casey, Kristen', display_name: 'Kristen Casey', is_primary: false }),
  ],
};

export const callPrep = (over: Partial<CallPrep> = {}): CallPrep => ({
  participant_id: 'H2',
  category: 'messaging',
  revision_no: 0,
  is_revised: false,
  revised_from_date: null,
  banner: null,
  steps: ["Analyzing Dr. Winters's profile, decile and HS volume", 'Applying the Core Claims order for POVO data', 'Generating suggested messaging'],
  heading: 'Suggested Messaging for Dr. Winters (HCP)',
  points: [
    { point_id: 'M1', rank: 1, pillar: 'Efficacy', text: 'HiSCR50 primary endpoint met at Week 12', detail: '124 of 133 HS patients are not on POVO yet', detail_label: 'Insight', tags: [], previous_text: null, previous_rank: null },
    { point_id: 'M2', rank: 2, pillar: 'Safety', text: 'Nearly all adverse events were mild or moderate', detail: null, detail_label: null, tags: [], previous_text: null, previous_rank: null },
  ],
  source: 'rules',
  ...over,
});

export const call = (over: Partial<Call> = {}): Call => ({
  call_id: 'C1',
  hcp_id: 'H2',
  call_date: '2026-10-13',
  participant_ids: ['H2'],
  status: 'planned',
  revision_no: 0,
  assessments: [],
  ...over,
});

export const flaggedResult: ComplianceResult = {
  check_id: 'K1',
  status: 'flagged',
  result_label: 'Non-compliant',
  max_severity: 'high',
  score: 65,
  issues: [{ rule_id: 'vulgar', chip: 'Vulgar', title: 'Vulgar language', severity: 'high', why: 'Call notes are audited', fix: 'Remove the word', excerpt: 'damn' }],
  suggested_text: 'Covered: HiSCR50. Dr. Winters [response]; next step: [action]',
  steps: ['Reading your note', 'Checking against 14 compliance rules', 'Drafting a rewrite'],
  engine: 'rules',
};

export const passedResult: ComplianceResult = { ...flaggedResult, check_id: 'K2', status: 'passed', result_label: 'Compliant', max_severity: null, score: 100, issues: [], suggested_text: null };

/** GET /api/v1/reference as the backend serves it (bronze REF_ tables + backend constants). */
export const reference: Reference = {
  content_version: '2026.1',
  tiers: [
    { code: 'SH', name: 'Super High', decile_min: 7, decile_max: 10, calls_per_year: 40, reach_goal_pct: 95 },
    { code: 'MED', name: 'Medium', decile_min: 5, decile_max: 6, calls_per_year: 28, reach_goal_pct: 95 },
    { code: 'LOW', name: 'Low', decile_min: 2, decile_max: 4, calls_per_year: 20, reach_goal_pct: 75 },
  ],
  segments: [
    { code: 'imm', short_name: 'Immediate', full_name: 'HS Biologic and HS JAK Prescribers', description: 'Treating HS patients with biologics and/or oral JAK inhibitors', color_hex: '#156CB4' },
    { code: 'conv', short_name: 'Conversion', full_name: 'Advanced Therapy Naïve HS Treaters', description: 'No prior biologic', color_hex: '#0E8A8A' },
    { code: 'exp', short_name: 'Expansion', full_name: 'Broader JAK Prescribers', description: 'Oral JAK inhibitors in non-HS indications', color_hex: '#7C6BD6' },
  ],
  competitive_focus: [
    { code: 'cosentyx', label: 'Cosentyx', color_hex: '#0E8A8A' },
    { code: 'bimzelx', label: 'Bimzelx', color_hex: '#C2410C' },
    { code: 'humira', label: 'Humira', color_hex: '#7C3AED' },
    { code: 'jak', label: 'JAK', color_hex: '#156CB4' },
    { code: 'conventional', label: 'Conventional therapy', color_hex: '#64748B' },
  ],
  role_types: [
    { code: 'HCP', label: 'HCP' },
    { code: 'NP', label: 'NP' },
    { code: 'PA', label: 'PA' },
  ],
  interaction_channels: [
    { code: 'rep', type_label: 'Direct call', team_label: 'POVO Sales' },
    { code: 'adfa', type_label: 'ADFA visit', team_label: 'ADFA' },
    { code: 'opz', type_label: 'Opz Sales call', team_label: 'Opz Sales' },
    { code: 'msl', type_label: 'MSL visit', team_label: 'MSL' },
    { code: 'spkr', type_label: 'Speaker program', team_label: 'Speaker' },
    { code: 'pr', type_label: 'PR visit', team_label: 'PR' },
  ],
  kpi_metrics: [
    { code: 'PEF', title: 'Patient Enrollment Forms', unit: 'PEFs' },
    { code: 'NRX', title: 'NRx', unit: 'new scripts' },
    { code: 'NEW_PATIENTS', title: 'New POVO Patients', unit: 'patients' },
  ],
  categories: [
    { code: 'messaging', label: 'Suggested Messaging' },
    { code: 'objection', label: 'Potential Objections' },
    { code: 'closing', label: 'Suggested Closing Statements' },
  ],
  reception_scale: [
    { value: 0, label: 'Not Well Received' },
    { value: 1, label: 'Moderately Received' },
    { value: 2, label: 'Well Received' },
  ],
  compliance: {
    rule_count: 14,
    steps: ['Reading your note', 'Checking against 14 compliance rules', 'Drafting a rewrite'],
    severity_labels: { high: 'Non-compliant', med: 'Needs review', low: 'Minor issue' },
  },
  prep_steps: {
    messaging: ['Analyzing {possessive} profile, decile and HS volume', 'Applying the Core Claims order for POVO data', 'Generating suggested messaging'],
    objection: ['Analyzing {possessive} profile, decile and HS volume', 'Selecting objections from the POVO objection handler', 'Generating potential objections'],
    closing: ['Analyzing {possessive} profile and call history', 'Matching suggested closes to the call goals', 'Generating suggested closing statements'],
  },
  next_call_steps: ['Reading the post-call assessment', 'Running the AI compliance check on {n} {notes}', 'Drafting next-call talking points'],
  limits: { points_per_category: 3, note_max_length: 200, additional_note_max_length: 600 },
};
