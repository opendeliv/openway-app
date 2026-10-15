export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  CaptainRegister: undefined;
  EditProfile: undefined;
    CaptainRidePreferences: undefined;
  EditCaptain: undefined;
  CaptainTabs: undefined;
  CaptainRide: { captainRideId: string };
  RideTracking: { rideId: string }; // NAYA
};

export type MainTabParamList = {
  Home: undefined;
  Profile: undefined;
};

export type CaptainTabParamList = {
  CaptainHome: undefined;
  CaptainProfile: undefined;
};