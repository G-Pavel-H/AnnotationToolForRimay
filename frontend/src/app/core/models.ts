export type Role = 'admin' | 'annotator';
export type SlotValue = 'present' | 'implied' | 'missing';

/**
 * A group (historically "phase") is a free-form label the admin chooses —
 * 'training'/'pilot'/'main' are only the suggested starting names. The set of
 * groups is always read from the data via `ApiService.listPhases()`.
 */
export type Phase = string;
export type ConditionType = 'precondition' | 'trigger' | 'temporal' | 'none';
export type AnnotationStatus = 'not_started' | 'draft' | 'submitted';

export interface User {
  _id: string;
  username: string;
  displayName: string;
  role: Role;
  createdAt?: string;
}

export interface Requirement {
  _id: string;
  reqId: string;
  nlText: string;
  nlDescription: string;
  phase: Phase;
  order: number;
  pragyanIncomp?: number; // admin only
  annotationStatus?: AnnotationStatus;
  createdAt?: string;
}

export interface Slots {
  scope: SlotValue;
  condition: SlotValue;
  actor: SlotValue;
  modalVerb: SlotValue;
  action: SlotValue;
}

export interface Annotation {
  _id: string;
  requirementId: string;
  annotatorId: string | { _id: string; username: string; displayName: string; role: Role };
  rimayText: string;
  slots: Slots;
  conditionType: ConditionType;
  patternNumber: number | null;
  nonAtomic: boolean;
  nSystemResponses: number | null;
  overallIncomplete: boolean;
  notes: string;
  status: 'draft' | 'submitted';
  createdAt?: string;
  updatedAt?: string;
}

export interface GoldSlots extends Slots {}

/**
 * The adjudicated gold for one requirement — categorical only. There is no gold
 * for the conversion *text*: each annotator's `rimayText` stands on its own.
 */
export interface Adjudication {
  _id?: string;
  requirementId: string;
  goldSlots: GoldSlots;
  goldConditionType: ConditionType;
  goldOverallIncomplete: boolean;
  resolvedBy?: string;
  hadDisagreement?: boolean;
  notes: string;
  resolvedAt?: string;
}

export interface ProgressResponse {
  phases: Phase[];
  totalsByPhase: Record<Phase, number>;
  perAnnotator: Array<{
    annotatorId: string;
    username: string;
    displayName: string;
    role: Role;
    counts: Record<Phase, { draft: number; submitted: number }>;
  }>;
}

export interface PhaseCount {
  phase: Phase;
  count: number;
}

export interface PhasesResponse {
  phases: PhaseCount[];
  suggested: Phase[];
}

// --- agreement (computed in-app; see backend/src/utils/agreement.js) ---------

/** Cohen's Kappa for one pair of annotators on one field. */
export interface CohenPair {
  a: string;
  b: string;
  n: number;
  kappa: number | null;
  band: string;
  observed: number | null;
}

/** Everything reported for one categorical field. */
export interface FieldAgreement {
  field: string;
  note: string;
  categories: string[];
  kappa: number | null; // Fleiss', across all annotators
  band: string;
  unanimous: number | null;
  majority: number | null;
  nSubjects: number;
  distribution: Record<string, number>;
  cohen: { pairs: CohenPair[]; mean: number | null };
  belowSubstantial: boolean;
}

export interface GoldAgreement {
  slots: string[];
  raters: string[];
  table: Record<string, Record<string, { matches: number; comparable: number; rate: number | null }>>;
}

export interface Disagreement {
  reqId: string;
  requirementId: string | null;
  field: string;
  distribution: Array<{ value: string; count: number }>;
  votes: Array<{ rater: string; value: string }>;
}

export interface AgreementReport {
  meta: {
    phase: Phase | null;
    status: 'all' | 'submitted';
    nRequirements: number;
    nRatings: number;
    annotators: string[];
    generatedAt: string;
  };
  slots: FieldAgreement[];
  extras: FieldAgreement[];
  gold: GoldAgreement | null;
  disagreements: Disagreement[];
  warnings: string[];
  empty: boolean;
  reason?: string;
}

export const SLOT_FIELDS: Array<{ key: keyof Slots; label: string; mandatory: boolean }> = [
  { key: 'scope', label: 'Scope', mandatory: false },
  { key: 'condition', label: 'Condition', mandatory: false },
  { key: 'actor', label: 'Actor', mandatory: true },
  { key: 'modalVerb', label: 'Modal verb', mandatory: true },
  { key: 'action', label: 'Action', mandatory: true },
];

// Only the four patterns documented in annotation_guide.md are named here. The
// remaining numbers are left generic on purpose — the real grammar lives in the
// editable guide asset and must not be invented in code. Refine as the guide grows.
export const RIMAY_PATTERNS: Array<{ n: number; name: string }> = [
  { n: 1, name: 'Pattern 1 — scope + system response' },
  { n: 2, name: 'Pattern 2' },
  { n: 3, name: 'Pattern 3' },
  { n: 4, name: 'Pattern 4' },
  { n: 5, name: 'Pattern 5 — system response only' },
  { n: 6, name: 'Pattern 6 — precondition + system response' },
  { n: 7, name: 'Pattern 7 — trigger + system response' },
  { n: 8, name: 'Pattern 8' },
  { n: 9, name: 'Pattern 9' },
  { n: 10, name: 'Pattern 10' },
];
