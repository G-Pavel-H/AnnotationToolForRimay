export type Role = 'admin' | 'annotator';
export type SlotValue = 'present' | 'implied' | 'missing';
export type Phase = 'training' | 'pilot' | 'main';
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

export interface Adjudication {
  _id?: string;
  requirementId: string;
  goldSlots: GoldSlots;
  goldConditionType: ConditionType;
  goldOverallIncomplete: boolean;
  canonicalRimay: string | null;
  resolvedBy?: string;
  hadDisagreement?: boolean;
  notes: string;
  resolvedAt?: string;
}

export interface ProgressResponse {
  totalsByPhase: Record<Phase, number>;
  perAnnotator: Array<{
    annotatorId: string;
    username: string;
    displayName: string;
    role: Role;
    counts: Record<Phase, { draft: number; submitted: number }>;
  }>;
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
