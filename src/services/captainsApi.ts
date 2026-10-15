import { api } from './api';

/* =========================================================
   TYPES
   ========================================================= */

// Backend enums (ServiceType / VehicleType) ki values
export type ServiceType = 'PARCEL_ONLY' | 'ALL';

export type VehicleType =
  | 'WALK'
  | 'CYCLE'
  | 'BIKE'
  | 'AUTO'
  | 'CAB'
  | 'GOODS_VEHICLE';

export type Captain = {
  id: string;
  userId: string;

  name: string;
  phone: string;
  email: string;

  gender: string | null;
  dateOfBirth: string | null;
  profilePhoto: string | null;

  // Backend enums (CaptainStatus / VerificationStatus) ki values string me aati hain
  status: string;
  verificationStatus: string;

  // Kaam aur vehicle
  serviceType: ServiceType;
  vehicleType: VehicleType;
  vehicleNumber: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;

  // Preferences
  isOnline?: boolean;
  pickupRangeKm?: number;
  acceptedRideTypes?: string[];

  createdAt: string;
  updatedAt: string;
};

export type CreateCaptainInput = {
  name: string;
  email: string;

  gender?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  profilePhoto?: string;

  serviceType: ServiceType;
  vehicleType: VehicleType;
  vehicleNumber?: string;
  vehicleModel?: string;
  vehicleColor?: string;
};

// Register screen isi naam se import karti hai
export type CreateCaptainPayload = CreateCaptainInput;

export type UpdateCaptainInput = Partial<CreateCaptainInput>;

/* ----- Ride preferences (kaam + ride types + range) ----- */

export type WorkType = 'RIDE' | 'PARCEL' | 'GOODS';

export type RideOptionType = {
  id: string; // vehicleType (lite, mini, auto ...)
  label: string;
  key: string; // CATEGORY:vehicleType, ye save hota hai (BIKE:lite)
};

export type RideOptionGroup = {
  key: string;
  label: string;
  category: 'CAB' | 'BIKE' | 'PARCEL' | 'GOODS';
  workType: WorkType;
  types: RideOptionType[];
};

export type RideOptions = {
  pickupRangeKm: number;
  minRangeKm: number;
  maxRangeKm: number;
  selectedRideTypes: string[]; // keys
  groups: RideOptionGroup[];
};

export type UpdatePreferencesInput = {
  pickupRangeKm?: number;
  rideTypes?: string[]; // keys
};

/* =========================================================
   CAPTAINS API
   ========================================================= */

export const captainsApi = {
  /* POST /captains  (Become a Captain) */
  createCaptain: (data: CreateCaptainInput) =>
    api.post<Captain>('/captains', data).then((response) => response.data),

  /*
    GET /captains/me

    Captain account nahi hai to backend 404 deta hai.
    Yahan 404 ko error nahi maanke null return karte hain,
    taaki screen par "Become a Captain" dikha sake.
    401 aur baaki errors pehle ki tarah error hi rahenge.
  */
  getMyCaptain: () =>
    api
      .get<Captain>('/captains/me', {
        validateStatus: (status) =>
          (status >= 200 && status < 300) || status === 404,
      })
      .then((response) => (response.status === 404 ? null : response.data)),

  /* PATCH /captains/me */
  updateCaptain: (data: UpdateCaptainInput) =>
    api.patch<Captain>('/captains/me', data).then((response) => response.data),

  /* GET /captains/me/ride-options  (captain kya kya chun sakta hai + abhi ki selection) */
  getRideOptions: () =>
    api
      .get<RideOptions>('/captains/me/ride-options')
      .then((response) => response.data),

  /* PATCH /captains/me/preferences  (range + ride types save) */
  updatePreferences: (data: UpdatePreferencesInput) =>
    api
      .patch<Captain>('/captains/me/preferences', data)
      .then((response) => response.data),
};