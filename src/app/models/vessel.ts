export type MovementType = 'Entered' | 'Exited' | 'Remained';
export type VoyageStatus = 'To Load' | 'Verify Load Date' | 'In Transit' | 'Watch' | 'Off EMEX' | 'Off WAFR' | 'Verify Discharge Date';

export interface TrackPoint {
  longitude: number;
  latitude: number;
  timestamp: string;
  speed: number;
  heading: number;
}

export interface VoyagePort {
  name: string;
  longitude: number;
  latitude: number;
  type: 'load' | 'intermediate' | 'discharge';
  eta?: string;
}

export interface Vessel {
  id: number;
  imo: string;
  name: string;
  longitude: number;
  latitude: number;
  heading: number;
  speed: number;
  commodity: 'Crude' | 'Clean Products' | 'Dirty Products' | 'LPG';
  voyageStatus: VoyageStatus;
  movement: MovementType;
  loadRegion: string;
  dischargeRegion: string;
  quality: string;
  quantity: number;
  disport: string;
  eta: string;
  dischargeDate?: string;
  assignedVoyage: boolean;
  track: TrackPoint[];
  voyagePorts?: VoyagePort[];
}
