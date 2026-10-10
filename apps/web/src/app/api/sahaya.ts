/**
 * Typed wrappers for the Amrita Sahaya REST API (docs/api/openapi.yaml).
 * Request bodies use the shared @sahaya/contracts types; response shapes
 * mirror services/api/src/routes. Nothing here grants access: the server
 * enforces every role and zone rule.
 */
import type {
  CreateIncidentInput,
  DispatchStatus,
  HazardVerificationStatus,
  HelpRequestStatus,
  IncidentPriority,
  MessageDeliveryStatus,
  OperatingMode,
  Role,
} from '@sahaya/contracts';
import type { ApiClient } from './client';

export interface Me {
  id: string;
  email: string;
  displayName: string;
  language: 'en' | 'ta';
  roles: Role[];
  mode: OperatingMode;
}

export interface LoginResult {
  accessToken: string;
  expiresInSeconds: number;
  user: Me;
  warning: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface Incident {
  id: string;
  type: string;
  description: string;
  priority: IncidentPriority;
  verificationStatus: HazardVerificationStatus;
  mode: OperatingMode;
  buildingId: string | null;
  floorId: string | null;
  zoneId: string | null;
  reporterId: string;
  serverReceivedAt: string;
  createdAt: string;
}

export interface VerificationRecord {
  id: string;
  from_status: HazardVerificationStatus;
  to_status: HazardVerificationStatus;
  reason: string;
  created_at: string;
}

/** GET /incidents/:id returns database column names. */
export interface IncidentDetail {
  id: string;
  type: string;
  description: string;
  priority: IncidentPriority;
  verification_status: HazardVerificationStatus;
  mode: OperatingMode;
  building_id: string | null;
  zone_id: string | null;
  reporter_id: string;
  created_at: string;
  report_count: number;
  verification_history: VerificationRecord[];
}

export interface CreatedIncident {
  id: string;
  verificationStatus: HazardVerificationStatus;
  priority: IncidentPriority;
  deliveryStatus: 'SERVER_RECEIVED';
  serverReceivedAt: string;
  dispatch: { id: string; status: DispatchStatus; simulated: true } | null;
}

export interface CheckinSummary {
  incidentId: string;
  counts: { CONFIRMED_SAFE: number; HELP_REQUESTED: number; UNCONFIRMED: number };
  note: string;
}

export interface HelpRequest {
  id: string;
  studentId: string;
  incidentId: string | null;
  drillId: string | null;
  zoneId: string | null;
  status: HelpRequestStatus;
  priority: string | null;
  details: string | null;
  assignedResponderId: string | null;
  acknowledgedAt: string | null;
  assignedAt: string | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyHelpRequest {
  id: string;
  incidentId: string | null;
  drillId: string | null;
  status: HelpRequestStatus;
  details: string | null;
  responderAssigned: boolean;
  acknowledgedAt: string | null;
  assignedAt: string | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Dispatch {
  id: string;
  incidentId: string;
  responderId: string | null;
  responseCategory: string;
  status: DispatchStatus;
  mode: OperatingMode;
  acknowledgedAt: string | null;
  escalationLevel: number;
  createdAt: string;
}

export interface InboxAlert {
  id: string;
  title: string;
  message: string;
  precautionary: boolean;
  mode: OperatingMode;
  alertStatus: string;
  incidentId: string | null;
  incidentVerificationStatus: HazardVerificationStatus | null;
  createdAt: string;
  deliveryStatus: MessageDeliveryStatus;
  serverReceivedAt: string | null;
  acknowledgedAt: string | null;
}

export interface StaffAlert {
  id: string;
  incidentId: string | null;
  title: string;
  message: string;
  precautionary: boolean;
  mode: OperatingMode;
  status: 'DRAFT' | 'AUTHORIZED' | 'QUEUED' | 'CANCELLED' | 'ALL_CLEAR';
  createdAt: string;
  authorizedAt: string | null;
  zoneCount: number;
  recipientCount: number;
  acknowledgedCount: number;
}

export interface Building {
  id: string;
  name: string;
  mode: OperatingMode;
  geometryVersion: string | null;
  geometryApproved: boolean;
  metadata: { synthetic?: boolean; mapFeatureId?: string; mapPlacement?: string } | null;
}

export interface Zone {
  id: string;
  name: string;
  zoneCode: string;
  geometryApproved: boolean;
}

export interface BuildingMap extends Building {
  floors: { id: string; name: string; levelNumber: number; zones: Zone[] }[];
  routeGraph: null;
  operationalRoutingAllowed: boolean;
  warning: string | null;
}

export interface Drill {
  id: string;
  name: string;
  buildingId: string;
  scenarioRef: string;
  mode: OperatingMode;
  status: string;
  createdAt: string;
}

export interface TrainingResult {
  id: string;
  drillId: string | null;
  scenarioRef: string;
  scenarioVersion: string;
  score: number;
  completedAt: string;
}

export interface Responder {
  id: string;
  displayName: string;
  approvedRole: string;
  qualifications: string[];
  availability: string;
  contactChannel: string;
}

export interface TrustedContact {
  id: string;
  name: string;
  contactChannel: 'EMAIL' | 'PHONE';
  consent: string;
  notificationPreferences: { incidentUpdates: boolean; helpRequests: boolean };
  createdAt: string;
}

export interface InstructionPack {
  id: string;
  version: string;
  language: string;
  title: string;
  content: Record<string, unknown>;
  sourceLabel: string;
  approvalState: 'DRAFT' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'RETIRED';
  reviewNotes: string | null;
  mode: OperatingMode;
  expiresAt?: string | null;
  createdAt: string;
}

export type ReviewDecision = 'CORROBORATED' | 'VERIFIED' | 'RESOLVED' | 'DISMISSED';
export type HelpAction = 'acknowledge' | 'assign' | 'resolve' | 'cancel';

const enc = encodeURIComponent;

export function sahayaApi(client: ApiClient) {
  return {
    me: () => client.get<Me>('/api/v1/users/me'),

    // Incidents
    listIncidents: (limit = 50) => client.get<Page<Incident>>(`/api/v1/incidents?limit=${limit}`),
    getIncident: (id: string) => client.get<IncidentDetail>(`/api/v1/incidents/${enc(id)}`),
    createIncident: (input: CreateIncidentInput, key: string) =>
      client.post<CreatedIncident>('/api/v1/incidents', input, key),
    reviewIncident: (id: string, input: { status: ReviewDecision; reason: string }, key: string) =>
      client.post<{ toStatus: HazardVerificationStatus }>(
        `/api/v1/incidents/${enc(id)}/reviews`,
        input,
        key,
      ),
    checkinSummary: (id: string) =>
      client.get<CheckinSummary>(`/api/v1/incidents/${enc(id)}/checkins/summary`),

    // Help requests
    listHelpRequests: (status?: HelpRequestStatus) =>
      client.get<Page<HelpRequest>>(
        `/api/v1/help-requests?limit=100${status ? `&status=${enc(status)}` : ''}`,
      ),
    myHelpRequests: () => client.get<Page<MyHelpRequest>>('/api/v1/help-requests/mine'),
    transitionHelpRequest: (id: string, action: HelpAction, key: string) =>
      client.post<HelpRequest>(
        `/api/v1/help-requests/${enc(id)}/${action}`,
        action === 'assign' ? {} : undefined,
        key,
      ),

    // Simulated dispatch
    listDispatches: () => client.get<Page<Dispatch>>('/api/v1/dispatches?limit=100'),
    acknowledgeDispatch: (id: string, key: string) =>
      client.post<{ id: string; status: DispatchStatus }>(
        `/api/v1/dispatches/${enc(id)}/acknowledge`,
        undefined,
        key,
      ),
    appropriateResponders: () => client.get<Page<Responder>>('/api/v1/responders/appropriate'),

    // Alerts
    alertInbox: () => client.get<Page<InboxAlert>>('/api/v1/alerts/inbox'),
    acknowledgeAlert: (id: string, key: string) =>
      client.post<{ alertId: string; status: string; acknowledgedAt: string }>(
        `/api/v1/alerts/${enc(id)}/acknowledge`,
        undefined,
        key,
      ),
    listAlerts: () => client.get<Page<StaffAlert>>('/api/v1/alerts'),
    createAlert: (
      input: {
        incidentId?: string;
        zoneIds: string[];
        title: string;
        message: string;
        precautionary: boolean;
        mode: OperatingMode;
      },
      key: string,
    ) => client.post<{ id: string; status: string }>('/api/v1/alerts', input, key),
    authorizeAlert: (id: string, key: string) =>
      client.post<{ id: string; status: string; recipientCount: number; simulated: true }>(
        `/api/v1/alerts/${enc(id)}/authorize`,
        undefined,
        key,
      ),

    // Maps, drills, training
    buildings: () => client.get<Page<Building>>('/api/v1/maps/buildings'),
    buildingMap: (id: string) => client.get<BuildingMap>(`/api/v1/maps/${enc(id)}/approved`),
    drills: () => client.get<Page<Drill>>('/api/v1/drills'),
    myTraining: () => client.get<Page<TrainingResult>>('/api/v1/training/results/mine'),
    saveTraining: (
      input: {
        scenarioRef: string;
        scenarioVersion: string;
        score: number;
        answers: Record<string, unknown>;
      },
      key: string,
    ) => client.post<TrainingResult>('/api/v1/training/results', input, key),

    // Trusted contacts
    trustedContacts: () => client.get<Page<TrustedContact>>('/api/v1/trusted-contacts'),
    addTrustedContact: (
      input: {
        name: string;
        contactChannel: 'EMAIL' | 'PHONE';
        contactValue: string;
        notificationPreferences: { incidentUpdates: boolean; helpRequests: boolean };
      },
      key: string,
    ) => client.post<TrustedContact>('/api/v1/trusted-contacts', input, key),
    deleteTrustedContact: (id: string) =>
      client.delete<unknown>(`/api/v1/trusted-contacts/${enc(id)}`),

    publishedPacks: (language: 'en' | 'ta') =>
      client.get<Page<InstructionPack>>(`/api/v1/instruction-packs?language=${language}`),

    // Instruction pack review (verifier/admin)
    packReviewQueue: () =>
      client.get<Page<InstructionPack>>('/api/v1/instruction-packs/review-queue'),
    reviewPack: (
      id: string,
      input: { decision: 'APPROVE' | 'REJECT'; notes: string },
      key: string,
    ) => client.post<InstructionPack>(`/api/v1/instruction-packs/${enc(id)}/review`, input, key),
    publishPack: (id: string, key: string) =>
      client.post<InstructionPack>(`/api/v1/instruction-packs/${enc(id)}/publish`, undefined, key),
  };
}

export type SahayaApi = ReturnType<typeof sahayaApi>;
