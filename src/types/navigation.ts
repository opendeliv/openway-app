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

  CaptainDetail: { captain: Captain }; // yahan badla
  AdminTabs: undefined; // naya
  CaptainRide: { captainRideId: string };
  RideTracking: { rideId: string };

  // naya: tab bar ke bina full screen booking
  Booking: { service: string; pickup: Place; drop: Place | null };
};

export type MainTabParamList = {
  Home: undefined;
  Profile: undefined;
};

export type CaptainTabParamList = {
  CaptainHome: undefined;
  CaptainProfile: undefined;
};

export type AdminTabParamList = {
  AdminHome: undefined;
  AdminProfile: undefined;
};