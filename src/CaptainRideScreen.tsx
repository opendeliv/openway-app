import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Same api as the Home screen (with token)
import api from './services/CaptainaRideApi';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#F0FDF4';
const RED = '#DC2626';
const AMBER_BG = '#FEF3C7';
const AMBER_BORDER = '#FDE68A';
const AMBER_TEXT = '#92400E';

type Coords = { latitude: number; longitude: number };

type CaptainRideStatus =
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'ARRIVING'
  | 'ARRIVED'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED';

type CaptainRideDetail = {
  id: string;
  status: CaptainRideStatus;
  earning: number | null;
  ride: Record<string, any>;
};

type RouteInfo = {
  points: Coords[];
  distanceKm: number;
  durationMinutes: number;
};

// Flow: accepted -> go to pickup -> reached pickup -> pickup OTP (from sender)
//       -> delivery in progress -> receiver OTP -> delivered (payment popup on Home)
// The last step (STARTED -> COMPLETED) is done with the receiver OTP section, not a button.
const NEXT_ACTION: Partial<
  Record<CaptainRideStatus, { next: CaptainRideStatus; label: string }>
> = {
  ACCEPTED: { next: 'ARRIVING', label: "Let's Go for Pickup" },
  ARRIVING: { next: 'ARRIVED', label: "I've Reached Pickup" },
  ARRIVED: { next: 'STARTED', label: 'Enter Pickup OTP' },
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

const CATEGORY_LABEL: Record<string, string> = {
  PARCEL: 'Parcel Delivery',
  GOODS: 'Goods Delivery',
};

const PHOTO_NOTE = 'Take a photo / video of the parcel before you take it from the sender.';

/* ---------- helpers ---------- */

const getErrorMessage = (e: any, fallback: string) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || e?.message || fallback;
};

// tata_ace -> Tata ace, LARGE -> Large
const prettyLabel = (v?: string | null) => {
  if (!v) return '';
  const s = v.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const getCoords = () =>
  new Promise<Coords>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 },
    );
  });

// Google encoded polyline -> points for the map line
const decodePolyline = (encoded: string): Coords[] => {
  const points: Coords[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
};

const toCoords = (lat: any, lng: any): Coords | null => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (lat == null || lng == null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }
  return { latitude, longitude };
};

const callNumber = (phone?: string | null) => {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`).catch(() =>
    Alert.alert('Call', 'Unable to place the call'),
  );
};

// Turn-by-turn navigation in the Google Maps app / browser
const openNavigation = (to: Coords | null) => {
  if (!to) return;
  Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}&travelmode=driving`,
  ).catch(() => Alert.alert('Navigation', 'Could not open Google Maps'));
};

// One contact row: label + name + phone on the left, Call button on the right
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

export default function CaptainRideScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const captainRideId: string = route.params?.captainRideId;

  const [data, setData] = useState<CaptainRideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [myPos, setMyPos] = useState<Coords | null>(null);
  const myPosRef = useRef<Coords | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);

  const [cancelVisible, setCancelVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Pickup OTP (the sender tells the 4 digit OTP)
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpValue, setOtpValue] = useState('');

  // Receiver OTP (the receiver tells the 4 digit OTP when the order is handed over)
  const [receiverOtp, setReceiverOtp] = useState('');

  const mapRef = useRef<MapView>(null);
  const closedRef = useRef(false);

  const ride = data?.ride ?? {};
  const status = data?.status;

  const pickup = toCoords(ride.pickupLatitude, ride.pickupLongitude);
  const drop = toCoords(ride.dropLatitude, ride.dropLongitude);

  // Before the trip starts: only the pickup point. After pickup OTP: only the drop.
  const started = status === 'STARTED';
  const atPickup = status === 'ARRIVED';
  const target = started ? drop : pickup;
  const targetAddress = started ? ride.dropAddress : ride.pickupAddress;

  const category: string = ride.category ?? '';
  const hasSender = !!ride.senderName || !!ride.senderPhone;

  // Bike-type parcel vehicles use two-wheeler routes
  const vehicleType: string = String(ride.vehicleType ?? '').toLowerCase();
  const twoWheeler = ['bike', 'lite', 'scooty'].includes(vehicleType);

  const goBack = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    navigation.goBack();
  }, [navigation]);

  /* ---------- load + refresh ride ---------- */
  const fetchRide = useCallback(async () => {
    try {
      const res = await api.get<CaptainRideDetail>(`/captain-rides/${captainRideId}`);
      setData(res.data);
    } catch (e: any) {
      console.log('fetch ride error', e?.message);
    } finally {
      setLoading(false);
    }
  }, [captainRideId]);

  useEffect(() => {
    fetchRide();
    const t = setInterval(fetchRide, 8000);
    return () => clearInterval(t);
  }, [fetchRide]);

  // Delivered or cancelled: leave this screen (Home opens the payment popup)
  useEffect(() => {
    if (!data || closedRef.current) return;

    if (data.status === 'COMPLETED') {
      goBack();
      return;
    }

    if (data.status === 'CANCELLED' || data.ride?.status === 'CANCELLED') {
      if (data.ride?.cancelledBy === 'USER') {
        Alert.alert('Order cancelled', 'The customer cancelled this order');
      }
      goBack();
    }
  }, [data, goBack]);

  /* ---------- captain's live location (map + backend) ---------- */
  const pushLocation = useCallback(async () => {
    const c = await getCoords();
    myPosRef.current = c;
    setMyPos(c);
    await api.patch('/captains/me/location', c);
  }, []);

  useEffect(() => {
    const run = () =>
      pushLocation().catch((e: any) =>
        console.log('ride screen location error', e?.message),
      );

    run();
    const t = setInterval(run, 10000);
    return () => clearInterval(t);
  }, [pushLocation]);

  /* ---------- route (on status change, not every 10 sec) ---------- */
  const hasPos = !!myPos;
  const targetKey = target ? `${target.latitude},${target.longitude}` : '';

  useEffect(() => {
    const from = myPosRef.current;
    if (!from || !target) return;

    let alive = true;

    (async () => {
      try {
        const res = await api.post<{
          distanceKm: number;
          durationMinutes: number;
          encodedPolyline: string | null;
        }>('/maps/route', {
          pickup: from,
          drop: target,
          travelMode: twoWheeler ? 'TWO_WHEELER' : 'DRIVE',
        });

        if (!alive) return;

        setRouteInfo({
          points: res.data.encodedPolyline
            ? decodePolyline(res.data.encodedPolyline)
            : [],
          distanceKm: res.data.distanceKm,
          durationMinutes: res.data.durationMinutes,
        });
      } catch (e: any) {
        // Even without a route the map and markers keep working
        console.log('route error', e?.message);
        if (alive) setRouteInfo(null);
      }
    })();

    return () => {
      alive = false;
    };
    // intentional: fetch the route only on status / target / first location
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, targetKey, hasPos]);

  /* ---------- fit the map to captain + current target ---------- */
  useEffect(() => {
    const pts = [myPosRef.current, target].filter(Boolean) as Coords[];
    if (pts.length === 0) return;

    const t = setTimeout(() => {
      if (pts.length === 1) {
        mapRef.current?.animateToRegion(
          { ...pts[0], latitudeDelta: 0.01, longitudeDelta: 0.01 },
          400,
        );
        return;
      }
      mapRef.current?.fitToCoordinates(pts, {
        edgePadding: { top: 140, right: 60, bottom: 380, left: 60 },
        animated: true,
      });
    }, 400);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, hasPos, routeInfo, targetKey]);

  /* ---------- actions ---------- */
  // otp is the pickup OTP for STARTED, and the receiver OTP for COMPLETED
  const updateStatus = async (
    next: CaptainRideStatus,
    cancellationReason?: string,
    otp?: string,
  ): Promise<boolean> => {
    try {
      setUpdating(true);

      // "Reached pickup" is checked against the captain's saved location,
      // so send a fresh one first
      if (next === 'ARRIVED') {
        try {
          await pushLocation();
        } catch (e: any) {
          console.log('fresh location failed', e?.message);
        }
      }

      await api.patch(`/captain-rides/${captainRideId}/status`, {
        status: next,
        ...(cancellationReason ? { cancellationReason } : {}),
        ...(otp ? { otp } : {}),
      });

      if (next === 'COMPLETED') {
        // Home screen opens the summary popup (payment + rating)
        goBack();
        return true;
      }

      if (next === 'CANCELLED') {
        goBack();
        return true;
      }

      await fetchRide();
      return true;
    } catch (e: any) {
      Alert.alert('Error', getErrorMessage(e, 'Status update failed'));
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const onNextActionPress = (next: CaptainRideStatus) => {
    // Starting the trip needs the pickup OTP from the sender
    if (next === 'STARTED') {
      setOtpValue('');
      setOtpVisible(true);
      return;
    }

    updateStatus(next);
  };

  const onConfirmOtp = async () => {
    if (otpValue.length !== 4) {
      Alert.alert('OTP required', "Enter the 4-digit OTP shown on the sender's phone");
      return;
    }

    const ok = await updateStatus('STARTED', undefined, otpValue);
    if (ok) {
      setOtpVisible(false);
      setOtpValue('');
    }
  };

  // Receiver gave the OTP: verify it and finish the delivery
  const onVerifyReceiverOtp = async () => {
    if (receiverOtp.length !== 4) {
      Alert.alert('OTP required', "Enter the 4-digit OTP shown on the receiver's phone");
      return;
    }

    await updateStatus('COMPLETED', undefined, receiverOtp);
  };

  const onConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      Alert.alert('Reason required', 'Please enter a cancellation reason');
      return;
    }
    setCancelVisible(false);
    await updateStatus('CANCELLED', cancelReason.trim());
    setCancelReason('');
  };

  /* ---------- UI ---------- */
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.muted}>Could not load the order</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchRide}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const nextAction = status ? NEXT_ACTION[status] : undefined;
  const initial = myPos ?? target ?? pickup ?? drop;

  // Banner above the map
  const bannerLabel = started
    ? 'DROP LOCATION'
    : atPickup
      ? "YOU'VE REACHED PICKUP"
      : 'PICK UP THE PARCEL FROM HERE';

  // Google Maps navigation is useful only while moving
  const showNav = status === 'ACCEPTED' || status === 'ARRIVING' || started;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* Map */}
      <View style={styles.flex}>
        {initial ? (
          <MapView
            ref={mapRef}
            style={styles.flex}
            initialRegion={{
              latitude: initial.latitude,
              longitude: initial.longitude,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
            showsUserLocation
          >
            {/* Only pickup before the trip starts, only drop after it starts */}
            {!started && pickup && (
              <Marker
                coordinate={pickup}
                title="Pickup"
                description={ride.pickupAddress}
                pinColor={GREEN}
              />
            )}
            {started && drop && (
              <Marker
                coordinate={drop}
                title="Drop"
                description={ride.dropAddress}
                pinColor={RED}
              />
            )}

            {routeInfo && routeInfo.points.length > 1 && (
              <Polyline
                coordinates={routeInfo.points}
                strokeWidth={5}
                strokeColor={BLUE}
              />
            )}
          </MapView>
        ) : (
          <View style={styles.center}>
            <Text style={styles.muted}>Location not available for the map</Text>
          </View>
        )}

        <TouchableOpacity style={styles.backBtn} activeOpacity={0.85} onPress={goBack}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        {/* Top banner: pickup (or drop) address */}
        {!!targetAddress && (
          <View style={styles.banner}>
            <Text style={styles.bannerLabel}>{bannerLabel}</Text>
            <Text style={styles.bannerText} numberOfLines={2}>
              {targetAddress}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom card */}
      <View style={styles.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.title}>{CATEGORY_LABEL[category] ?? 'Delivery'}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {status ? STATUS_LABEL[status] : ''}
              </Text>
            </View>
          </View>

          {/* At pickup: photo / video note + ask for the OTP */}
          {atPickup && (
            <View style={styles.noteBox}>
              <Ionicons name="camera-outline" size={18} color={AMBER_TEXT} />
              <Text style={styles.noteText}>
                {PHOTO_NOTE} Then ask the sender for the 4-digit pickup OTP.
              </Text>
            </View>
          )}

          {!!routeInfo && !atPickup && (
            <Text style={styles.eta}>
              {started ? 'Drop' : 'Pickup'}: {routeInfo.distanceKm.toFixed(1)} km  •  {routeInfo.durationMinutes} min
            </Text>
          )}

          {/* Receiver OTP: while the delivery is in progress */}
          {started && (
            <View style={styles.recvPanel}>
              <Text style={styles.recvTitle}>Receiver OTP</Text>
              <Text style={styles.recvHint}>
                Hand over the order to the receiver, then ask for the 4-digit OTP shown on their
                phone.
              </Text>
              <TextInput
                style={styles.otpInput}
                placeholder="----"
                placeholderTextColor={GREY}
                value={receiverOtp}
                onChangeText={(t) => setReceiverOtp(t.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
              />
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  styles.recvBtn,
                  (receiverOtp.length !== 4 || updating) && styles.btnDisabled,
                ]}
                disabled={receiverOtp.length !== 4 || updating}
                onPress={onVerifyReceiverOtp}
              >
                {updating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Verify OTP & Complete Delivery</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.placeRow}>
            <View style={[styles.dot, { backgroundColor: GREEN }]} />
            <View style={styles.flex}>
              <Text style={styles.placeLabel}>Pickup</Text>
              <Text style={styles.placeText}>{ride.pickupAddress || '—'}</Text>
            </View>
          </View>
          <View style={styles.placeRow}>
            <View style={[styles.dot, { backgroundColor: RED }]} />
            <View style={styles.flex}>
              <Text style={styles.placeLabel}>Drop</Text>
              <Text style={styles.placeText}>{ride.dropAddress || '—'}</Text>
            </View>
          </View>

          {/* Contacts, vehicle / size chips, parcel description at the bottom */}
          <View style={styles.box}>
            {hasSender && (
              <>
                <ContactRow
                  icon="send-outline"
                  label="SENDER (PICKUP)"
                  name={ride.senderName}
                  phone={ride.senderPhone}
                />
                <View style={styles.divider} />
              </>
            )}

            <ContactRow
              icon="person-outline"
              label="RECEIVER (DROP)"
              name={ride.receiverName}
              phone={ride.receiverPhone}
            />

            <View style={styles.divider} />

            <View style={styles.chipRow}>
              {!!ride.vehicleType && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{prettyLabel(ride.vehicleType)}</Text>
                </View>
              )}
              {!!ride.parcelSize && (
                <View style={[styles.chip, styles.chipSoft]}>
                  <Text style={[styles.chipText, styles.chipTextSoft]}>
                    {prettyLabel(ride.parcelSize)} size
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.descRow}>
              <Ionicons name="cube-outline" size={18} color={BLUE} style={styles.descIcon} />
              <View style={styles.flex}>
                <Text style={styles.boxTitle}>PARCEL DESCRIPTION</Text>
                <Text style={styles.boxText}>{ride.parcelDescription || '-'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.fareRow}>
            <Text style={styles.muted}>Fare</Text>
            <Text style={styles.fare}>₹ {Number(ride.fare ?? 0).toFixed(0)}</Text>
          </View>

          {showNav && (
            <TouchableOpacity
              style={styles.navBtn}
              activeOpacity={0.85}
              onPress={() => openNavigation(target)}
            >
              <Text style={styles.navBtnText}>
                Navigate to {started ? 'drop' : 'pickup'} in Google Maps
              </Text>
            </TouchableOpacity>
          )}

          {nextAction && (
            <TouchableOpacity
              style={[styles.primaryBtn, updating && styles.btnDisabled]}
              disabled={updating}
              onPress={() => onNextActionPress(nextAction.next)}
            >
              {updating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>{nextAction.label}</Text>
              )}
            </TouchableOpacity>
          )}

          {/* No cancel once the parcel has been picked up */}
          {!started && (
            <TouchableOpacity
              style={styles.cancelBtn}
              disabled={updating}
              onPress={() => setCancelVisible(true)}
            >
              <Text style={styles.cancelText}>Cancel Order</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Pickup OTP */}
      <Modal
        visible={otpVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOtpVisible(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter pickup OTP</Text>

            <View style={[styles.noteBox, styles.noteBoxModal]}>
              <Ionicons name="camera-outline" size={18} color={AMBER_TEXT} />
              <Text style={styles.noteText}>{PHOTO_NOTE}</Text>
            </View>

            <Text style={styles.otpHint}>
              Ask the sender for the 4-digit OTP shown on their phone, then start the delivery.
            </Text>
            <TextInput
              style={styles.otpInput}
              placeholder="----"
              placeholderTextColor={GREY}
              value={otpValue}
              onChangeText={(t) => setOtpValue(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: BG }]}
                disabled={updating}
                onPress={() => setOtpVisible(false)}
              >
                <Text style={{ color: BLACK, fontWeight: '700' }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { backgroundColor: BLUE },
                  (otpValue.length !== 4 || updating) && styles.btnDisabled,
                ]}
                disabled={otpValue.length !== 4 || updating}
                onPress={onConfirmOtp}
              >
                {updating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Start Delivery</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cancel reason */}
      <Modal
        visible={cancelVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelVisible(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reason for cancelling the order</Text>
            <TextInput
              style={styles.input}
              placeholder="Write a reason..."
              placeholderTextColor={GREY}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: BG }]}
                onPress={() => setCancelVisible(false)}
              >
                <Text style={{ color: BLACK, fontWeight: '700' }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: RED }]}
                onPress={onConfirmCancel}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Cancel Order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: 13, color: GREY },
  btnDisabled: { opacity: 0.6 },

  retryBtn: {
    marginTop: 12,
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: BLUE, fontWeight: '800' },

  backBtn: {
    position: 'absolute',
    top: 12,
    left: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  backText: { fontSize: 22, color: BLACK, marginTop: -2 },

  banner: {
    position: 'absolute',
    top: 12,
    left: 68,
    right: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 4,
  },
  bannerLabel: { fontSize: 11, fontWeight: '800', color: GREY, letterSpacing: 0.5 },
  bannerText: { fontSize: 13, fontWeight: '700', color: BLACK, marginTop: 2 },

  sheet: {
    maxHeight: '60%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    elevation: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '800', color: BLACK },
  badge: {
    backgroundColor: BLUE_LIGHT,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 8,
  },
  badgeText: { color: BLUE, fontSize: 12, fontWeight: '700' },
  eta: { fontSize: 13, fontWeight: '700', color: BLUE, marginBottom: 10 },

  // photo / video note
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AMBER_BG,
    borderWidth: 1,
    borderColor: AMBER_BORDER,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  noteBoxModal: { marginBottom: 12 },
  noteText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: AMBER_TEXT,
    lineHeight: 18,
    marginLeft: 8,
  },

  // receiver OTP
  recvPanel: {
    backgroundColor: GREEN_LIGHT,
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  recvTitle: { fontSize: 15, fontWeight: '800', color: BLACK },
  recvHint: { fontSize: 12.5, color: GREY, lineHeight: 18, marginTop: 4, marginBottom: 10 },
  recvBtn: { marginTop: 12, backgroundColor: GREEN },

  placeRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, marginRight: 10 },
  placeLabel: { fontSize: 12, color: GREY },
  placeText: { fontSize: 14, color: BLACK, fontWeight: '600', marginTop: 1 },

  // parcel box
  box: {
    backgroundColor: BG,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  boxTitle: { fontSize: 10, fontWeight: '800', color: GREY, letterSpacing: 0.8 },
  boxText: { fontSize: 14, fontWeight: '700', color: BLACK, marginTop: 2 },
  boxSub: { fontSize: 12, color: GREY, marginTop: 2 },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 10 },

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

  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
    marginBottom: 10,
  },
  fare: { fontSize: 16, fontWeight: '800', color: BLACK },

  navBtn: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  navBtnText: { color: BLUE, fontSize: 13.5, fontWeight: '800' },
  primaryBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelText: { color: RED, fontSize: 14, fontWeight: '700' },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: BLACK, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    color: BLACK,
  },
  otpHint: { fontSize: 13, color: GREY, marginBottom: 14, lineHeight: 19 },
  otpInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 12,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 12,
    color: BLACK,
    backgroundColor: '#fff',
  },
  modalRow: { flexDirection: 'row', marginTop: 14 },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
});