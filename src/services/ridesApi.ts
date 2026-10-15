import { api } from './api';

/* =========================================================
   TYPES
   ========================================================= */

export type MyProfile = {
  name: string | null;
  phone: string | null;
};

export type RideStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'ARRIVING'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export type RideCategory = 'CAB' | 'BIKE' | 'PARCEL' | 'GOODS';
export type ParcelSize = 'SMALL' | 'MEDIUM' | 'LARGE';

export type Ride = {
  id: string;
  userId: string;
  captainId: string | null;

  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;

  dropAddress: string;
  dropLatitude: number;
  dropLongitude: number;

  category: RideCategory;
  vehicleType: string;

  status: RideStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: 'CASH' | 'UPI' | null;

  fare: number | null;
  distance: number | null;
  duration: number | null;

  senderName?: string | null;
  senderPhone?: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  parcelSize: ParcelSize | null;
  parcelDescription: string | null;

  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;

  createdAt: string;
  updatedAt: string;

  // tracking screen ke liye (backend getRideById se aate hain)
  otp?: string | null;
  captainRating?: number | null;
  captain?: {
    name?: string | null;
    phone?: string | null;
    profilePhoto?: string | null;
  } | null;
  captainLatitude?: number | null;
  captainLongitude?: number | null;
  captainEtaMinutes?: number | null;
  captainVehicleNumber?: string | null;
  captainVehicleModel?: string | null;
};

export type CreateRideInput = {
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;

  dropAddress: string;
  dropLatitude: number;
  dropLongitude: number;

  category: RideCategory;
  vehicleType: string;

  fare?: number;
  distance?: number;
  duration?: number;

  // sender backend khud profile se bharta hai (optional override)
  senderName?: string;
  senderPhone?: string;

  receiverName?: string;
  receiverPhone?: string;
  parcelSize?: ParcelSize;
  parcelDescription?: string;
};

export type RateCaptainInput = {
  rating: number; // 1 se 5
  comment?: string;
};

/* =========================================================
   RIDES API
   ========================================================= */

export const ridesApi = {
  /* POST /rides */
  createRide: (data: CreateRideInput) =>
    api.post<Ride>('/rides', data).then((response) => response.data),

  /* GET /rides/my */
  getMyRides: () =>
    api.get<Ride[]>('/rides/my').then((response) => response.data),

  /* GET /rides/my-profile  (receiver "main khud hoon" auto-fill ke liye) */
  getMyProfile: () =>
    api.get<MyProfile>('/rides/my-profile').then((response) => response.data),

  /* GET /rides/:id */
  getRide: (id: string) =>
    api.get<Ride>(`/rides/${id}`).then((response) => response.data),

  /* PATCH /rides/:id/cancel */
  cancelRide: (id: string) =>
    api.patch<Ride>(`/rides/${id}/cancel`).then((response) => response.data),

  /* PATCH /rides/:id/confirm-arrival  (user bolta hai destination aa gaya) */
  confirmArrival: (id: string) =>
    api
      .patch<Ride>(`/rides/${id}/confirm-arrival`)
      .then((response) => response.data),

  /* POST /rides/:id/rate  (user captain ko rate karta hai) */
  rateCaptain: (id: string, data: RateCaptainInput) =>
    api
      .post<{ success: boolean }>(`/rides/${id}/rate`, data)
      .then((response) => response.data),
};