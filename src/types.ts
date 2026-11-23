export type UserRole = 'admin' | 'agent';

export type DayOrder = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

export const DAY_ORDERS: DayOrder[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type ActivityType = 'Sourcing' | 'Loan' | 'Training' | 'Collection';

export const ACTIVITY_TYPES: ActivityType[] = ['Sourcing', 'Loan', 'Training', 'Collection'];

export interface AuthUser {
  userId: number;
  role: UserRole;
  identifier: string;
  fullName: string;
  isEnvAdmin?: boolean;
}

export interface LocationItem {
  id: number;
  name: string;
  state: string;
  active: number;
  centre_count: number;
  created_at: string;
}

export interface CentreItem {
  id: number;
  location_id: number;
  location_name: string;
  day_order: DayOrder;
  name: string;
  time_slot: string;
  google_maps_url: string;
  latitude: number;
  longitude: number;
  active: number;
  created_at: string;
}

export interface AgentItem {
  id: number;
  role: 'agent';
  identifier: string;
  full_name: string;
  phone: string;
  district: string;
  active: number;
  created_at: string;
}

export interface CollectionVisit {
  id: number;
  agent_id: number;
  agent_name: string;
  agent_identifier: string;
  centre_id: number;
  centre_name: string;
  day_order: DayOrder;
  time_slot: string;
  centre_lat: number;
  centre_lng: number;
  centre_maps_url: string;
  location_id: number;
  location_name: string;
  visit_date: string;
  in_time: string;
  in_lat: number;
  in_lng: number;
  in_accuracy_m: number;
  in_distance_m: number;
  in_within_100m: number;
  out_time: string | null;
  out_lat: number | null;
  out_lng: number | null;
  out_accuracy_m: number | null;
  out_distance_m: number | null;
  out_within_100m: number | null;
  status: 'checked_in' | 'completed';
}

export interface FieldStatusLog {
  id: number;
  agent_id: number;
  agent_name: string;
  agent_identifier: string;
  activity_type: ActivityType;
  centre_id: number | null;
  centre_name: string | null;
  day_order: DayOrder | null;
  time_slot: string | null;
  location_id: number | null;
  location_name: string | null;
  remarks: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  logged_at: string;
}

export interface DashboardSummary {
  today: string;
  activeLocations: number;
  activeCentres: number;
  activeAgents: number;
  visitsToday: number;
  activeVisits: number;
  outside100mWarnings: number;
  fieldLogsToday: number;
}

export interface GpsReading {
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
}
