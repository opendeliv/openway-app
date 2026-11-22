import type { Captain } from '../admin/AdminHomeScreen'; // path adjust
import type { Place } from '../services/mapsApi';

export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  CaptainRegister: { resubmit?: boolean } | undefined;
  EditProfile: undefined;
  CaptainRidePreferences: undefined;
  PrivacyPolicy: undefined;
  EditCaptain: undefined;
  CaptainTabs: undefined;
  CaptainDetail: { captain: Captain };
  AdminTabs: undefined;
  CaptainRide: { captainRideId: string };
  RideTracking: { rideId: string };

  // Send now / Order now: pehle address screen
  ParcelAddress: { service: string; pickup: Place; drop?: Place | null };

  // Tab bar ke bina full screen booking
  Booking: {
    service: string;
    pickup: Place;
    drop?: Place | null;
    receiverName?: string;
    receiverPhone?: string;
  };
};

export type MainTabParamList = {
  Home: undefined;
  Profile: undefined;
};

export type CaptainTabParamList = {
  CaptainHome: undefined;
   CaptainRequests: undefined; // naya tab
  CaptainProfile: undefined;
};

export type AdminTabParamList = {
  AdminHome: undefined;
  AdminProfile: undefined;
};