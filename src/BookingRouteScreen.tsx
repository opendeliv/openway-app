import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import BookingScreen from './BookingScreen';
import { RootStackParamList } from './types/navigation';

// Ride / Passenger band hain: sirf Parcel aur Goods
const ALLOWED_CATEGORIES = ['PARCEL', 'GOODS'];

type Props = NativeStackScreenProps<RootStackParamList, 'Booking'>;

// Root stack par chalta hai (MainTabs ke bahar), isliye bottom tab bar yaha dikhta hi nahi
export default function BookingRouteScreen({ route, navigation }: Props) {
  const { service, pickup, drop, receiverName, receiverPhone } = route.params;

  return (
    <BookingScreen
      service={service}
      allowedCategories={ALLOWED_CATEGORIES}
      initialPickup={pickup}
      initialDrop={drop}
      initialReceiverName={receiverName}
      initialReceiverPhone={receiverPhone}
      onBack={() => navigation.goBack()}
      onOpenTerms={() => navigation.navigate('PrivacyPolicy')}
      // replace: tracking se back karne par Home aaye, Booking nahi
      onRideCreated={(rideId) => navigation.replace('RideTracking', { rideId })}
    />
  );
}