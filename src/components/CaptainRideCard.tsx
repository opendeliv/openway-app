import React from 'react';
import {
  Text,
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16A34A';
const RED = '#DC2626';

// ---------- types (CaptainHomeScreen imports these from here) ----------
export type CaptainRideStatus =
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'ARRIVING'
  | 'ARRIVED'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED';

export type RideCategory = 'CAB' | 'BIKE' | 'PARCEL' | 'GOODS';

export type CaptainRide = {
  id: string;
  status: CaptainRideStatus;
  earning: number | null;
  cancellationReason: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  ride: Record<string, any> & { fare?: number };
};

export const CATEGORY_LABEL: Record<RideCategory, string> = {
  CAB: 'Cab',
  BIKE: 'Bike Ride',
  PARCEL: 'Parcel',
  GOODS: 'Goods',
};

const STATUS_LABEL: Record<CaptainRideStatus, string> = {
  ASSIGNED: 'New ride assigned',
  ACCEPTED: 'Ride accepted',
  ARRIVING: 'On the way to pickup',
  ARRIVED: 'Reached pickup',
  STARTED: 'On the way to drop',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

// Next step button for each status.
// Shared by the Home screen and the map screen so the wording is always the same.
export const NEXT_ACTION: Partial<
  Record<CaptainRideStatus, { next: CaptainRideStatus; label: string }>
> = {
  ASSIGNED: { next: 'ACCEPTED', label: 'Accept Ride' },
  ACCEPTED: { next: 'ARRIVING', label: "Let's Go for Pickup" },
  ARRIVING: { next: 'ARRIVED', label: "I've Reached Pickup" },
  ARRIVED: { next: 'STARTED', label: 'Enter OTP' },
  STARTED: { next: 'COMPLETED', label: 'Complete Ride' },
};

// ---------- helpers ----------
// tata_ace -> Tata ace, LARGE -> Large, e_rickshaw -> E rickshaw
export const prettyLabel = (v?: string | null) => {
  if (!v) return '';
  const s = v.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const getPlace = (ride: Record<string, any>, type: 'pickup' | 'drop') => {
  const v =
    type === 'pickup'
      ? ride.pickupAddress ?? ride.pickupLocation ?? ride.pickup
      : ride.dropAddress ?? ride.dropLocation ?? ride.drop ?? ride.destination;
  if (!v) return '—';
  return typeof v === 'string' ? v : v.address ?? v.name ?? '—';
};

const callNumber = (phone?: string | null) => {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`).catch(() =>
    Alert.alert('Call', 'Unable to place the call'),
  );
};

// ---------- component ----------
type Props = {
  ride: CaptainRide;
  updating: boolean;
  // Label of the next step button (e.g. "Start Ride"). Button is hidden if empty
  nextActionLabel?: string;
  onNextAction: () => void;
  onOpenMap: () => void;
  onCancel: () => void;
};

export default function CaptainRideCard({
  ride: captainRide,
  updating,
  nextActionLabel,
  onNextAction,
  onOpenMap,
  onCancel,
}: Props) {
  const ride = captainRide.ride;
  const category = ride?.category as RideCategory | undefined;
  const isParcelLike = category === 'PARCEL' || category === 'GOODS';

  const hasPackage = !!ride?.parcelDescription || !!ride?.parcelSize;
  const hasSender = !!ride?.senderName || !!ride?.senderPhone;

  const distanceText =
    ride?.distance != null ? `${Number(ride.distance).toFixed(1)} km` : '-';
  const durationText =
    ride?.duration != null ? `${Math.round(Number(ride.duration))} min` : '-';

  return (
    <View style={styles.rideCard}>
      <View style={styles.rideHeader}>
        <View style={styles.flex}>
          <Text style={styles.rideTitle}>
            {category ? CATEGORY_LABEL[category] : 'Current Ride'}
          </Text>
          {!!ride?.vehicleType && (
            <Text style={styles.vehicleText}>{prettyLabel(ride.vehicleType)}</Text>
          )}
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{STATUS_LABEL[captainRide.status]}</Text>
        </View>
      </View>

      <View style={styles.placeRow}>
        <View style={[styles.dot, { backgroundColor: GREEN }]} />
        <View style={styles.flex}>
          <Text style={styles.placeLabel}>Pickup</Text>
          <Text style={styles.placeText}>{getPlace(ride, 'pickup')}</Text>
        </View>
      </View>
      <View style={styles.placeRow}>
        <View style={[styles.dot, { backgroundColor: RED }]} />
        <View style={styles.flex}>
          <Text style={styles.placeLabel}>Drop</Text>
          <Text style={styles.placeText}>{getPlace(ride, 'drop')}</Text>
        </View>
      </View>

      {/* Parcel / goods: package, sender and receiver details */}
      {isParcelLike && (
        <View style={styles.parcelBox}>
          {hasPackage && (
            <>
              <Text style={styles.boxTitle}>Package</Text>
              {!!ride?.parcelDescription && (
                <Text style={styles.boxText}>{ride.parcelDescription}</Text>
              )}
              {!!ride?.parcelSize && (
                <Text style={styles.boxSub}>Size: {prettyLabel(ride.parcelSize)}</Text>
              )}
              <View style={styles.boxDivider} />
            </>
          )}

          {hasSender && (
            <>
              <Text style={styles.boxTitle}>Sender (pickup contact)</Text>
              <Text style={styles.boxText}>{ride?.senderName || '-'}</Text>
              {!!ride?.senderPhone && (
                <TouchableOpacity onPress={() => callNumber(ride.senderPhone)}>
                  <Text style={styles.phoneLink}>Call {ride.senderPhone}</Text>
                </TouchableOpacity>
              )}
              <View style={styles.boxDivider} />
            </>
          )}

          <Text style={styles.boxTitle}>Receiver (drop contact)</Text>
          <Text style={styles.boxText}>{ride?.receiverName || '-'}</Text>
          {!!ride?.receiverPhone && (
            <TouchableOpacity onPress={() => callNumber(ride.receiverPhone)}>
              <Text style={styles.phoneLink}>Call {ride.receiverPhone}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Distance / duration / fare */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{distanceText}</Text>
          <Text style={styles.statLabel}>Distance</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{durationText}</Text>
          <Text style={styles.statLabel}>Duration</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>₹ {Number(ride?.fare ?? 0).toFixed(0)}</Text>
          <Text style={styles.statLabel}>Fare</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.mapBtn} activeOpacity={0.85} onPress={onOpenMap}>
        <Text style={styles.mapBtnText}>View ride on map</Text>
      </TouchableOpacity>

      {!!nextActionLabel && (
        <TouchableOpacity
          style={[styles.primaryBtn, updating && styles.btnDisabled]}
          disabled={updating}
          onPress={onNextAction}
        >
          {updating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>{nextActionLabel}</Text>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.cancelBtn} disabled={updating} onPress={onCancel}>
        <Text style={styles.cancelBtnText}>Cancel Ride</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  rideCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16 },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  rideTitle: { fontSize: 16, fontWeight: '800', color: BLACK },
  vehicleText: { fontSize: 12, color: GREY, marginTop: 2 },
  badge: {
    backgroundColor: BLUE_LIGHT,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 8,
  },
  badgeText: { color: BLUE, fontSize: 12, fontWeight: '700' },

  placeRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, marginRight: 10 },
  placeLabel: { fontSize: 12, color: GREY },
  placeText: { fontSize: 14, color: BLACK, fontWeight: '600', marginTop: 1 },

  parcelBox: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  boxTitle: { fontSize: 12, color: GREY, marginBottom: 2 },
  boxText: { fontSize: 14, fontWeight: '700', color: BLACK },
  boxSub: { fontSize: 12, color: GREY, marginTop: 3 },
  phoneLink: { fontSize: 14, fontWeight: '700', color: BLUE, marginTop: 4 },
  boxDivider: { height: 1, backgroundColor: '#CFE0FA', marginVertical: 10 },

  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 12,
    marginBottom: 14,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 15, fontWeight: '800', color: BLACK },
  statLabel: { fontSize: 12, color: GREY, marginTop: 2 },

  mapBtn: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  mapBtnText: { color: BLUE, fontSize: 14, fontWeight: '800' },

  primaryBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },

  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  cancelBtnText: { color: RED, fontSize: 14, fontWeight: '700' },
});