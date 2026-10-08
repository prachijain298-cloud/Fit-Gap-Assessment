/** Rating codes used inside the dashboard app. */
export type Rating = 'F' | 'P' | 'N' | 'A';

export const RATING_TEXT: { [code: string]: string } = { F: 'Fit', P: 'Partial Fit', N: 'Not Fit', A: 'Not Applicable' };

/** One saved assessment version for one process. Records are never overwritten, except for an in-place "Edit". */
export interface HistRecord {
  processId: string;
  rating: Rating;
  comment: string;
  assessedBy: string;
  assessedAt: number;
  version: number;
  editedAt?: number;
  editedBy?: string;
}

export interface AssessmentState {
  id: string;
  name: string;
  templateId: string;
  templateVersion?: string;
  createdAt: number;
  updatedAt: number;
  ratings: { [processId: string]: Rating };
  hist: { [processId: string]: HistRecord[] };
}

export interface Process {
  id: string;
  t: string;
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  l5: string;
  ref: Rating | '';
}

export interface Template {
  id: string;
  name: string;
  version: string;
  builtIn: boolean;
  description: string;
  createdAt: number;
  processes: Process[];
}

export interface AppState {
  assessments: { [id: string]: AssessmentState };
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
}

/** Minimal HTTP abstraction so the same code runs in SPFx (SPHttpClient) and in tests (fetch). */
export interface Http {
  request(method: 'GET' | 'POST', url: string, body?: string, headers?: { [name: string]: string }): Promise<HttpResponse>;
}

export interface StoreConfig {
  webUrl: string;
  catalogueList: string;
  assessmentsList: string;
  recordsList: string;
  userName: string;
  userEmail: string;
}

export class SpError extends Error {
  public status: number;
  public conflict: boolean;
  constructor(message: string, status: number, conflict: boolean = false) {
    super(message);
    this.status = status;
    this.conflict = conflict;
    // keep instanceof working when compiled to ES5
    Object.setPrototypeOf(this, SpError.prototype);
  }
}
