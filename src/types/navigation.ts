import type { Captain } from '../admin/AdminHomeScreen'; // path adjust
export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  CaptainRegister: undefined;
  EditProfile: undefined;
  CaptainRidePreferences: undefined;
  EditCaptain: undefined;
  CaptainTabs: undefined;

    CaptainDetail: { captain: Captain }; // yahan badla
  AdminTabs: undefined; // naya
  CaptainRide: { captainRideId: string };
  RideTracking: { rideId: string };
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