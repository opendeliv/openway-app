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
  | 'ARRIVED'
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
  payAt?: string;

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
  arrivedAt?: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;

  createdAt: string;
  updatedAt: string;

  // tracking screen ke liye (backend getRideById se aate hain)
  // Pickup OTP: captain ko parcel dete waqt (ACCEPTED / ARRIVING / ARRIVED)
  otp?: string | null;
  // Delivery OTP: PARCEL / GOODS, sirf ride STARTED hone par aata hai
  deliveryOtp?: string | null;
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

  // payment kahan hogi
  payAt?: 'PICKUP' | 'DROP';

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

  /* PATCH /rides/:id/confirm-arrival  (sirf CAB / BIKE, parcel/goods me backend block karta hai) */
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