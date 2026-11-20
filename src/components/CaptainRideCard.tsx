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
import Ionicons from 'react-native-vector-icons/Ionicons';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
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

// App is only for Parcel / Goods delivery
export type RideCategory = 'PARCEL' | 'GOODS';

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
  PARCEL: 'Parcel Delivery',
  GOODS: 'Goods Delivery',
};

const STATUS_LABEL: Record<CaptainRideStatus, string> = {
  ASSIGNED: 'New order assigned',
  ACCEPTED: 'Order accepted',
  ARRIVING: 'On the way to pickup',
  ARRIVED: 'Reached pickup',
  STARTED: 'Delivery in progress',
  COMPLETED: 'Delivered',
  CANCELLED: 'Cancelled',
};

// Next step button for each status.
// Shared by the Home screen and the tracking screen so the wording is always the same.
export const NEXT_ACTION: Partial<
  Record<CaptainRideStatus, { next: CaptainRideStatus; label: string }>
> = {
  ASSIGNED: { next: 'ACCEPTED', label: 'Accept Order' },
  ACCEPTED: { next: 'ARRIVING', label: "Let's Go for Pickup" },
  ARRIVING: { next: 'ARRIVED', label: "I've Reached Pickup" },
  ARRIVED: { next: 'STARTED', label: 'Enter Pickup OTP' },
  STARTED: { next: 'COMPLETED', label: 'Enter Receiver OTP' },
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

// One contact row: label + name on the left, call button on the right
const ContactRow = ({
  icon,
  label,
  name,
  phone,
}: {
  icon: string;
  label: string;
  name?: string | null;
  phone?: string | null;
}) => (
  <View style={styles.contactRow}>
    <View style={styles.contactIcon}>
      <Ionicons name={icon} size={16} color={BLUE} />
    </View>
    <View style={styles.flex}>
      <Text style={styles.boxTitle}>{label}</Text>
      <Text style={styles.boxText} numberOfLines={1}>
        {name || '-'}
      </Text>
      {!!phone && <Text style={styles.boxSub}>{phone}</Text>}
    </View>
    {!!phone && (
      <TouchableOpacity
        style={styles.callBtn}
        activeOpacity={0.8}
        onPress={() => callNumber(phone)}
      >
        <Ionicons name="call" size={14} color="#fff" />
        <Text style={styles.callText}>Call</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ---------- component ----------
type Props = {
  ride: CaptainRide;
  updating: boolean;
  // Label of the next step button. Button is hidden if empty
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
  // After pickup the order cannot be cancelled; delivery completes with the receiver OTP
  const tripStarted = captainRide.status === 'STARTED';
  const category = ride?.category as RideCategory | undefined;

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
            {category ? CATEGORY_LABEL[category] : 'Current Order'}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{STATUS_LABEL[captainRide.status]}</Text>
        </View>
      </View>

      {/* Route */}
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

      {/* Contacts, vehicle / size chips, then the parcel description at the bottom */}
      <View style={styles.parcelBox}>
        {hasSender && (
          <>
            <ContactRow
              icon="send-outline"
              label="SENDER (PICKUP)"
              name={ride?.senderName}
              phone={ride?.senderPhone}
            />
            <View style={styles.boxDivider} />
          </>
        )}

        <ContactRow
          icon="person-outline"
          label="RECEIVER (DROP)"
          name={ride?.receiverName}
          phone={ride?.receiverPhone}
        />

        <View style={styles.boxDivider} />

        {/* Chips: vehicle + package size */}
        <View style={styles.chipRow}>
          {!!ride?.vehicleType && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{prettyLabel(ride.vehicleType)}</Text>
            </View>
          )}
          {!!ride?.parcelSize && (
            <View style={[styles.chip, styles.chipSoft]}>
              <Text style={[styles.chipText, styles.chipTextSoft]}>
                {prettyLabel(ride.parcelSize)} size
              </Text>
            </View>
          )}
        </View>

        {/* Description at the very bottom */}
        <View style={styles.descRow}>
          <Ionicons name="cube-outline" size={18} color={BLUE} style={styles.descIcon} />
          <View style={styles.flex}>
            <Text style={styles.boxTitle}>PARCEL DESCRIPTION</Text>
            <Text style={styles.boxText}>{ride?.parcelDescription || '-'}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.mapBtn} activeOpacity={0.85} onPress={onOpenMap}>
        <Text style={styles.mapBtnText}>View order on map</Text>
      </TouchableOpacity>

      {!!nextActionLabel && !tripStarted && (
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

      {tripStarted && (
        <Text style={styles.tripHint}>
          Delivery chal rahi hai. Receiver ko order dene par tracking screen me receiver ka OTP
          daalo.
        </Text>
      )}

      {!tripStarted && (
        <TouchableOpacity style={styles.cancelBtn} disabled={updating} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Cancel Order</Text>
        </TouchableOpacity>
      )}
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

  // parcel box
  parcelBox: {
    backgroundColor: BG,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  boxTitle: { fontSize: 10, fontWeight: '800', color: GREY, letterSpacing: 0.8 },
  boxText: { fontSize: 14, fontWeight: '700', color: BLACK, marginTop: 2 },
  boxSub: { fontSize: 12, color: GREY, marginTop: 2 },
  boxDivider: { height: 1, backgroundColor: BORDER, marginVertical: 10 },

  contactRow: { flexDirection: 'row', alignItems: 'center' },
  contactIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GREEN,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginLeft: 8,
  },
  callText: { color: '#fff', fontSize: 12, fontWeight: '800', marginLeft: 5 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  chip: {
    backgroundColor: BLUE,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  chipSoft: { backgroundColor: BLUE_LIGHT },
  chipText: { fontSize: 12.5, fontWeight: '800', color: '#fff' },
  chipTextSoft: { color: BLUE },

  descRow: { flexDirection: 'row', alignItems: 'flex-start' },
  descIcon: { marginRight: 10, marginTop: 2 },

  tripHint: {
    fontSize: 12.5,
    color: GREY,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },

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