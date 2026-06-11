export interface TelemetryPoint {
  id: string;
  lat: number;
  lng: number;
  bearing: number; // Degrees clockwise from north (0–360)
}

export interface AnomalyEvent {
  id: string;
  type: string;
  lat: number;
  lng: number;
  time: string;
}

export interface StatsSnapshot {
  msgPerSec: number;
  anomalies: number;
  recentAnomalies: AnomalyEvent[];
  connected: boolean;
}
