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

// Same api as the Home screen (with token)
import api from './services/CaptainaRideApi';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16A34A';
const RED = '#DC2626';

// If farther than this (meters) from the drop, the complete alert shows a warning
const DROP_NEAR_METERS = 300;

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

// Flow: accepted -> go to pickup -> reached pickup -> OTP -> trip to drop -> complete
// (same wording as the Home screen)
const NEXT_ACTION: Partial<
  Record<CaptainRideStatus, { next: CaptainRideStatus; label: string }>
> = {
  ACCEPTED: { next: 'ARRIVING', label: "Let's Go for Pickup" },
  ARRIVING: { next: 'ARRIVED', label: "I've Reached Pickup" },
  ARRIVED: { next: 'STARTED', label: 'Enter OTP' },
  STARTED: { next: 'COMPLETED', label: 'Complete Ride' },
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

const CATEGORY_LABEL: Record<string, string> = {
  CAB: 'Cab',
  BIKE: 'Bike Ride',
  PARCEL: 'Parcel',
  GOODS: 'Goods',
};

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

// Distance between two coordinates (meters)
const distanceM = (a: Coords, b: Coords) => {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
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

  // Start OTP (the customer tells the 4 digit OTP)
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpValue, setOtpValue] = useState('');

  const mapRef = useRef<MapView>(null);
  const closedRef = useRef(false);

  const ride = data?.ride ?? {};
  const status = data?.status;

  const pickup = toCoords(ride.pickupLatitude, ride.pickupLongitude);
  const drop = toCoords(ride.dropLatitude, ride.dropLongitude);

  // Before the trip starts (accepted / heading to pickup / reached pickup): only the pickup point.
  // After the trip starts: only the drop.
  const started = status === 'STARTED';
  const atPickup = status === 'ARRIVED';
  const target = started ? drop : pickup;
  const targetAddress = started ? ride.dropAddress : ride.pickupAddress;

  const category: string = ride.category ?? '';
  const isParcelLike = category === 'PARCEL' || category === 'GOODS';
  const hasSender = !!ride.senderName || !!ride.senderPhone;

  // Passenger details (shown if the backend sends the user with the ride)
  const riderName = ride.user?.name ?? ride.userName ?? ride.passengerName ?? ride.riderName;
  const riderPhone = ride.user?.phone ?? ride.userPhone ?? ride.passengerPhone ?? ride.riderPhone;

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

  // Ride finished or cancelled: leave this screen
  useEffect(() => {
    if (!data || closedRef.current) return;

    if (data.status === 'COMPLETED') {
      goBack();
      return;
    }

    if (data.status === 'CANCELLED' || data.ride?.status === 'CANCELLED') {
      if (data.ride?.cancelledBy === 'USER') {
        Alert.alert('Ride cancelled', 'The customer cancelled this ride');
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
          travelMode: category === 'BIKE' ? 'TWO_WHEELER' : 'DRIVE',
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

  // Before completing, confirm the captain reached the drop location
  const onCompletePress = () => {
    const far = myPos && drop ? distanceM(myPos, drop) : null;
    const message =
      far != null && far > DROP_NEAR_METERS
        ? `You are about ${Math.round(far)} m away from the drop location.\nDo you still want to complete the ride?`
        : "Have you reached the customer's drop location?";

    Alert.alert('Drop location check', message, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Complete', onPress: () => updateStatus('COMPLETED') },
    ]);
  };

  const onNextActionPress = (next: CaptainRideStatus) => {
    if (next === 'COMPLETED') {
      onCompletePress();
      return;
    }

    // Starting the trip needs the OTP from the customer
    if (next === 'STARTED') {
      setOtpValue('');
      setOtpVisible(true);
      return;
    }

    updateStatus(next);
  };

  const onConfirmOtp = async () => {
    if (otpValue.length !== 4) {
      Alert.alert('OTP required', "Enter the 4-digit OTP shown on the customer's phone");
      return;
    }

    const ok = await updateStatus('STARTED', undefined, otpValue);
    if (ok) {
      setOtpVisible(false);
      setOtpValue('');
    }
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
          <Text style={styles.muted}>Could not load the ride</Text>
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
      : 'PICK UP THE CUSTOMER FROM HERE';

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
                title="Customer Pickup"
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
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.title}>{CATEGORY_LABEL[category] ?? 'Ride'}</Text>
              {!!ride.vehicleType && (
                <Text style={styles.vehicle}>{prettyLabel(ride.vehicleType)}</Text>
              )}
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {status ? STATUS_LABEL[status] : ''}
              </Text>
            </View>
          </View>

          {/* At pickup: remind the captain to ask for the OTP */}
          {atPickup && (
            <View style={styles.otpNotice}>
              <Text style={styles.otpNoticeText}>
                Ask the customer for the 4-digit OTP, then start the trip to the drop location.
              </Text>
            </View>
          )}

          {!!routeInfo && !atPickup && (
            <Text style={styles.eta}>
              {started ? 'Drop' : 'Pickup'}: {routeInfo.distanceKm.toFixed(1)} km  •  {routeInfo.durationMinutes} min
            </Text>
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

          {/* Customer / parcel details */}
          {isParcelLike ? (
            <View style={styles.box}>
              {(!!ride.parcelDescription || !!ride.parcelSize) && (
                <>
                  <Text style={styles.boxTitle}>Package</Text>
                  {!!ride.parcelDescription && (
                    <Text style={styles.boxText}>{ride.parcelDescription}</Text>
                  )}
                  {!!ride.parcelSize && (
                    <Text style={styles.boxSub}>Size: {prettyLabel(ride.parcelSize)}</Text>
                  )}
                  <View style={styles.divider} />
                </>
              )}

              {hasSender && (
                <>
                  <Text style={styles.boxTitle}>Sender (pickup contact)</Text>
                  <Text style={styles.boxText}>{ride.senderName || '-'}</Text>
                  {!!ride.senderPhone && (
                    <TouchableOpacity onPress={() => callNumber(ride.senderPhone)}>
                      <Text style={styles.phone}>Call {ride.senderPhone}</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.divider} />
                </>
              )}

              <Text style={styles.boxTitle}>Receiver (drop contact)</Text>
              <Text style={styles.boxText}>{ride.receiverName || '-'}</Text>
              {!!ride.receiverPhone && (
                <TouchableOpacity onPress={() => callNumber(ride.receiverPhone)}>
                  <Text style={styles.phone}>Call {ride.receiverPhone}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            (!!riderName || !!riderPhone) && (
              <View style={styles.box}>
                <Text style={styles.boxTitle}>Customer</Text>
                <Text style={styles.boxText}>{riderName || '-'}</Text>
                {!!riderPhone && (
                  <TouchableOpacity onPress={() => callNumber(riderPhone)}>
                    <Text style={styles.phone}>Call {riderPhone}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          )}

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

          <TouchableOpacity
            style={styles.cancelBtn}
            disabled={updating}
            onPress={() => setCancelVisible(true)}
          >
            <Text style={styles.cancelText}>Cancel Ride</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Start OTP */}
      <Modal
        visible={otpVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOtpVisible(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter pickup OTP</Text>
            <Text style={styles.otpHint}>
              Ask the customer for the 4-digit OTP shown on their phone, then start the trip to the drop location.
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
                  <Text style={{ color: '#fff', fontWeight: '800' }}>
                    Start Trip to Drop
                  </Text>
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
            <Text style={styles.modalTitle}>Reason for cancelling the ride</Text>
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
                <Text style={{ color: '#fff', fontWeight: '800' }}>Cancel Ride</Text>
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
    maxHeight: '58%',
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
  title: { fontSize: 17, fontWeight: '800', color: BLACK },
  vehicle: { fontSize: 12, color: GREY, marginTop: 2 },
  badge: {
    backgroundColor: BLUE_LIGHT,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 8,
  },
  badgeText: { color: BLUE, fontSize: 12, fontWeight: '700' },
  eta: { fontSize: 13, fontWeight: '700', color: BLUE, marginBottom: 10 },

  otpNotice: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  otpNoticeText: { fontSize: 13, fontWeight: '600', color: BLUE, lineHeight: 19 },

  placeRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, marginRight: 10 },
  placeLabel: { fontSize: 12, color: GREY },
  placeText: { fontSize: 14, color: BLACK, fontWeight: '600', marginTop: 1 },

  box: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  boxTitle: { fontSize: 12, color: GREY, marginBottom: 2 },
  boxText: { fontSize: 14, fontWeight: '700', color: BLACK },
  boxSub: { fontSize: 12, color: GREY, marginTop: 3 },
  phone: { fontSize: 14, fontWeight: '700', color: BLUE, marginTop: 4 },
  divider: { height: 1, backgroundColor: '#CFE0FA', marginVertical: 10 },

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