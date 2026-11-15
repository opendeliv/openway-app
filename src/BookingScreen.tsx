import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { ridesApi } from './services/ridesApi';
import { mapsApi, decodePolyline, Place, RouteInfo } from './services/mapsApi';
import LocationPicker from './LocationPicker';
import { VEHICLE_ICONS } from './constants/vehicleIcons';

const BLUE = '#1F6FE5';
const BLUE_DARK = '#1553B3';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16A34A';
const RED = '#DC2626';

// ---------- Map + bottom sheet (Rapido style) ----------
const SCREEN_H = Dimensions.get('window').height;
const SNAP_TOP = SCREEN_H * 0.34; // default: map upar (route dikhta hai), neeche sheet
const SNAP_HALF = SCREEN_H * 0.52; // neeche kheencho: map aur bada
const MAP_H = SNAP_HALF + 40; // map ki fixed height (sheet ke peeche tak)
// route ko default visible patti ke andar fit karne ke liye upar-neeche ka padding
const FIT_PAD_V = (MAP_H - SNAP_TOP) / 2;

type Category = 'CAB' | 'BIKE' | 'PARCEL' | 'GOODS';

// Ab app me sirf 2 mode hain: Parcel aur Goods (Ride / Passenger band hain)
type Mode = 'parcel' | 'goods';

const MODE_LABEL: Record<Mode, string> = { parcel: 'Parcel', goods: 'Goods' };
const MODE_EMOJI: Record<Mode, string> = { parcel: '📦', goods: '🚚' };
const MODE_CATEGORY: Record<Mode, Category> = { parcel: 'PARCEL', goods: 'GOODS' };

// Home ka vehicle (bike / auto / cab / goods) -> kis mode me kaun se groups milenge
const VEHICLE_MODES: Record<string, Partial<Record<Mode, string[]>>> = {
  bike: { parcel: ['bike'] },
  auto: { parcel: ['auto'], goods: ['auto'] },
  cab: { parcel: ['cab'] },
  goods: { goods: ['auto', 'truck'] },
  // "Send now": sab parcel vehicles + Goods ek hi jagah
  parcel: { parcel: ['walk', 'cycle', 'bike', 'auto', 'cab'] },
};

// Variant = the real vehicleType sent to the backend (id == backend vehicleType)
type Variant = { id: string; name: string; emoji: string; sub: string; icon?: string };
// Group = the top selector (Walk/Cycle/Bike/Auto/Cab, Auto/Truck ...)
type Group = {
  id: string;
  name: string;
  emoji: string;
  sub: string;
  icon?: string;
  variants: Variant[];
  // kisi group ko khud ka mode dena ho (e.g. combined list me Goods card)
  mode?: Mode;
};

// ---------------------------------------------------------------------------
// VEHICLE CATALOG
// ---------------------------------------------------------------------------
const bikeVariants = (sub?: string): Variant[] => [
  { id: 'lite', name: 'Lite Bike', emoji: '🛵', sub: sub ?? 'Budget ride' },
  { id: 'bike', name: 'Super Bike', emoji: '🏍️', sub: sub ?? '1 seat' },
  { id: 'scooty', name: 'Scooty', emoji: '🛵', sub: sub ?? 'Easy & quick' },
];

const autoVariants = (autoIcon: string, sub?: string): Variant[] => [
  { id: 'auto', name: 'Auto', emoji: '🛺', sub: sub ?? '3 seats', icon: autoIcon },
  { id: 'e_rickshaw', name: 'E-Auto', emoji: '🛺', sub: sub ?? 'Electric', icon: 'eauto' },
];

const cabVariants = (sub?: string): Variant[] => [
  { id: 'mini_van', name: 'Mini Van', emoji: '🚐', sub: sub ?? '6 seats' },
  { id: 'suv', name: 'SUV', emoji: '🚙', sub: sub ?? '6 seats' },
  { id: 'utility_van', name: 'Utility Van', emoji: '🚐', sub: sub ?? 'Cargo space' },
];

// Goods vehicles (truck group)
const goodsTruckVariants = (): Variant[] => [
  { id: 'tata_ace', name: 'Tata Ace', emoji: '🚚', sub: 'Upto 750 kg', icon: 'ace' },
  { id: 'eicher', name: 'Eicher', emoji: '🚛', sub: 'Upto 2.5 ton', icon: 'eicher' },
  { id: 'pickup', name: 'Pickup', emoji: '🛻', sub: 'Upto 1.5 ton', icon: 'pickup' },
  { id: 'mahindra_furio', name: 'Mahindra Furio', emoji: '🚛', sub: 'Upto 5 ton', icon: 'furio' },
];

// Sirf parcel + goods (ride wale entries hata diye gaye hain)
const CATALOG: Record<Mode, Group[]> = {
  parcel: [
    {
      id: 'walk',
      name: 'Walk',
      emoji: '🚶',
      sub: 'Upto 3 kg',
      icon: 'pwalk',
      variants: [{ id: 'walk', name: 'Walk', emoji: '🚶', sub: 'Upto 3 kg', icon: 'pwalk' }],
    },
    {
      id: 'cycle',
      name: 'Cycle',
      emoji: '🚲',
      sub: 'Upto 5 kg',
      icon: 'pcycle',
      variants: [{ id: 'cycle', name: 'Cycle', emoji: '🚲', sub: 'Upto 5 kg', icon: 'pcycle' }],
    },
    {
      id: 'bike',
      name: 'Bike',
      emoji: '🏍️',
      sub: 'Upto 10 kg',
      icon: 'pbike',
      variants: bikeVariants('Upto 10 kg'),
    },
    {
      id: 'auto',
      name: 'Auto',
      emoji: '🛺',
      sub: 'Upto 50 kg',
      icon: 'pauto',
      variants: autoVariants('auto', 'Upto 50 kg'),
    },
    {
      id: 'cab',
      name: 'Cab',
      emoji: '🚕',
      sub: 'Upto 100 kg',
      icon: 'group_cab',
      variants: cabVariants('Upto 100 kg'),
    },
  ],

  goods: [
    {
      id: 'auto',
      name: 'Auto',
      emoji: '🛺',
      sub: 'Upto 300 kg',
      icon: 'gauto',
      variants: autoVariants('gauto', 'Upto 300 kg'),
    },
    {
      id: 'truck',
      name: 'Truck',
      emoji: '🚚',
      sub: 'Tata Ace, Eicher, Pickup',
      icon: 'ace',
      variants: goodsTruckVariants(),
    },
  ],
};

// Vehicle ke hisaab se groups (e.g. bike -> sirf Bike group)
const getGroups = (vehicle: string, m: Mode): Group[] => {
  const ids = VEHICLE_MODES[vehicle]?.[m];
  const all = CATALOG[m] ?? [];
  if (!ids) return all;
  return all.filter((g) => ids.includes(g.id));
};

// "Send now" ki combined list: Walk, Cycle, Bike, Auto, Cab (parcel) + Goods
const GOODS_COMBINED_GROUP: Group = {
  id: 'goods',
  name: 'Goods',
  emoji: '🚚',
  sub: 'Heavy items',
  icon: 'ace',
  mode: 'goods',
  variants: [
    { id: 'auto', name: 'Auto', emoji: '🛺', sub: 'Upto 300 kg', icon: 'gauto' },
    { id: 'e_rickshaw', name: 'E-Auto', emoji: '🛺', sub: 'Upto 300 kg', icon: 'eauto' },
    ...goodsTruckVariants(),
  ],
};

const getCombinedGroups = (allowed?: string[]): Group[] => {
  const out: Group[] = [];
  if (!allowed || allowed.includes('PARCEL')) out.push(...(CATALOG.parcel ?? []));
  if (!allowed || allowed.includes('GOODS')) out.push(GOODS_COMBINED_GROUP);
  return out;
};

// ---------------------------------------------------------------------------
// FARE RATES (estimate). fare = max(minFare, baseFare + (km - baseKm) * perKm)
// NOTE: the rates that were already in the app are unchanged. Rates for the new
// variants (mini_van, utility_van, eicher, mahindra_furio) are my estimate - change them as needed.
// ---------------------------------------------------------------------------
type Rate = { baseFare: number; baseKm: number; perKm: number; minFare: number };
const rate = (baseFare: number, baseKm: number, perKm: number): Rate => ({
  baseFare,
  baseKm,
  perKm,
  minFare: baseFare,
});

const RATES: Record<Category, Record<string, Rate>> = {
  BIKE: {
    lite: rate(20, 2, 5),
    bike: rate(25, 2, 6.5),
    scooty: rate(22, 2, 6),
  },
  CAB: {
    mini_van: rate(90, 2, 15),
    suv: rate(110, 2, 20),
    utility_van: rate(100, 2, 17),
    auto: rate(30, 1.5, 11),
    e_rickshaw: rate(25, 1.5, 9),
  },
  PARCEL: {
    walk: rate(25, 1.5, 5),
    cycle: rate(35, 2, 6),
    lite: rate(30, 2, 6),
    bike: rate(40, 2, 8),
    scooty: rate(35, 2, 7),
    auto: rate(80, 2, 13),
    e_rickshaw: rate(70, 2, 12),
    mini_van: rate(110, 2, 15),
    suv: rate(150, 2, 21),
    utility_van: rate(130, 2, 18),
  },
  GOODS: {
    auto: rate(150, 2, 15),
    e_rickshaw: rate(130, 2, 13),
    tata_ace: rate(300, 3, 20),
    pickup: rate(450, 3, 28),
    eicher: rate(600, 3, 35),
    mahindra_furio: rate(800, 3, 42),
  },
};

const calcFare = (category: Category, vehicleId: string, km?: number | null): number | null => {
  const r = RATES[category]?.[vehicleId];
  if (!r || km == null || !isFinite(km)) return null;
  const extraKm = Math.max(0, km - r.baseKm);
  const fare = Math.max(r.minFare, r.baseFare + extraKm * r.perKm);
  return Math.round(fare);
};

// Fare offer limits (based on the estimate) and step
const FARE_STEP = 5;
const MIN_OFFER_RATIO = 0.7; // not below 70% of the estimate
const MAX_OFFER_RATIO = 2; // not above 2x the estimate

const TITLES: Record<Mode, string> = {
  parcel: 'Parcel Delivery',
  goods: 'Goods Delivery',
};

// Parcel size based on the vehicle
const getParcelSize = (vehicleId: string): 'SMALL' | 'MEDIUM' | 'LARGE' => {
  if (vehicleId === 'walk' || vehicleId === 'cycle') return 'SMALL';
  if (vehicleId === 'lite' || vehicleId === 'bike' || vehicleId === 'scooty') return 'MEDIUM';
  return 'LARGE';
};

const PHONE_REGEX = /^[6-9]\d{9}$/;

// Pick an item -> a group + vehicle is suggested
type Item = { id: string; label: string; emoji: string; groupId: string; vehicleId: string };

const ITEMS: Record<Mode, Item[]> = {
  parcel: [
    { id: 'docs', label: 'Documents', emoji: '📄', groupId: 'walk', vehicleId: 'walk' },
    { id: 'keys', label: 'Keys', emoji: '🔑', groupId: 'walk', vehicleId: 'walk' },
    { id: 'meds', label: 'Medicines', emoji: '💊', groupId: 'walk', vehicleId: 'walk' },
    { id: 'food', label: 'Tiffin / Food', emoji: '🍱', groupId: 'cycle', vehicleId: 'cycle' },
    { id: 'gift', label: 'Gift / Cake', emoji: '🎁', groupId: 'cycle', vehicleId: 'cycle' },
    { id: 'clothes', label: 'Clothes', emoji: '👕', groupId: 'bike', vehicleId: 'bike' },
    { id: 'books', label: 'Books', emoji: '📚', groupId: 'bike', vehicleId: 'bike' },
    { id: 'gadgets', label: 'Mobile / Gadgets', emoji: '📱', groupId: 'bike', vehicleId: 'bike' },
    { id: 'grocery', label: 'Groceries', emoji: '🛒', groupId: 'bike', vehicleId: 'bike' },
    { id: 'bigbox', label: 'Big Box', emoji: '📦', groupId: 'auto', vehicleId: 'e_rickshaw' },
  ],
  goods: [
    { id: 'stock', label: 'Shop Stock', emoji: '🛍️', groupId: 'auto', vehicleId: 'auto' },
    { id: 'cylinder', label: 'Gas Cylinder', emoji: '🛢️', groupId: 'auto', vehicleId: 'auto' },
    { id: 'mattress', label: 'Mattress', emoji: '🛏️', groupId: 'auto', vehicleId: 'auto' },
    { id: 'appliance', label: 'Washing Machine / Fridge', emoji: '🧊', groupId: 'truck', vehicleId: 'tata_ace' },
    { id: 'furniture', label: 'Furniture', emoji: '🪑', groupId: 'truck', vehicleId: 'tata_ace' },
    { id: 'shifting', label: 'Household Shifting', emoji: '🏠', groupId: 'truck', vehicleId: 'eicher' },
    { id: 'material', label: 'Construction Material', emoji: '🧱', groupId: 'truck', vehicleId: 'pickup' },
    { id: 'bulk', label: 'Bulk Goods', emoji: '📦', groupId: 'truck', vehicleId: 'mahindra_furio' },
  ],
};

// Used if no pickup comes from Home.
const DEFAULT_PICKUP: Place = {
  address: 'New Market, Bhopal',
  latitude: 23.2332,
  longitude: 77.4326,
};

// Logged in user's (sender) name / phone, from the rides backend
const loadMyProfile = async (): Promise<{ name: string; phone: string }> => {
  const me = await ridesApi.getMyProfile();
  console.log('PROFILE RESPONSE:', JSON.stringify(me));

  const name = String(me?.name ?? '').trim();
  // remove +91 / spaces, keep the last 10 digits
  const phone = String(me?.phone ?? '').replace(/\D/g, '').slice(-10);
  return { name, phone };
};

// Show the PNG icon if there is one, otherwise the emoji
const VehicleIcon = ({
  iconKey,
  emoji,
  big,
}: {
  iconKey: string;
  emoji: string;
  big?: boolean;
}) => {
  const src = VEHICLE_ICONS[iconKey];
  if (src) {
    return (
      <Image source={src} style={big ? styles.gImg : styles.vImg} resizeMode="contain" />
    );
  }
  return <Text style={big ? styles.gEmoji : styles.vEmoji}>{emoji}</Text>;
};

type Props = {
  // Home ka vehicle: 'bike' | 'auto' | 'cab' | 'goods'
  service: string;
  // sirf ye categories allowed hain (e.g. ['PARCEL', 'GOODS']). Na do to sab allowed.
  allowedCategories?: string[];
  onBack: () => void;
  // Terms & Conditions par tap karne par (parent PrivacyPolicyScreen kholta hai)
  onOpenTerms?: () => void;
  // called when the ride is created, the parent shows RideTrackingScreen
  onRideCreated: (rideId: string) => void;
  // when coming from Home, pickup / drop are already filled
  initialPickup?: Place;
  initialDrop?: Place | null;
};

export default function BookingScreen({
  service,
  allowedCategories,
  onBack,
  onOpenTerms,
  onRideCreated,
  initialPickup,
  initialDrop,
}: Props) {
  const vehicle = service;
  const needsReceiver = true; // ab sirf parcel / goods hain, receiver hamesha chahiye

  // Is vehicle ke liye kaun se modes (Parcel / Goods) allowed hain
  // "Send now" (vehicle = 'parcel'): sab vehicles ek hi list me, tabs nahi
  const combined = vehicle === 'parcel';
  const modes: Mode[] = combined
    ? []
    : (['parcel', 'goods'] as Mode[]).filter(
        (m) =>
          !!VEHICLE_MODES[vehicle]?.[m] &&
          (!allowedCategories || allowedCategories.includes(MODE_CATEGORY[m])),
      );
  const [mode, setMode] = useState<Mode>(modes[0] ?? 'parcel');

  // Group (top selector) + Variant (real vehicleType)
  const groups = combined ? getCombinedGroups(allowedCategories) : getGroups(vehicle, mode);
  const [groupId, setGroupId] = useState<string | undefined>(groups[0]?.id);
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const [selectedId, setSelectedId] = useState<string | undefined>(groups[0]?.variants[0]?.id);
  const selected = group?.variants.find((v) => v.id === selectedId) ?? group?.variants[0];

  // Asli mode: combined list me group batata hai (Goods card = goods), warna tab wala mode
  const activeMode: Mode = group?.mode ?? mode;
  const category = MODE_CATEGORY[activeMode];

  // Sirf wahi items jo is vehicle ke groups me aate hain
  const items: Item[] = combined
    ? activeMode === 'goods'
      ? ITEMS.goods.map((it) => ({ ...it, groupId: 'goods' }))
      : ITEMS.parcel
    : (ITEMS[mode] ?? []).filter((it) => groups.some((g) => g.id === it.groupId));
  const [itemId, setItemId] = useState<string | null>(null);

  // Parcel / goods details
  const [parcelDescription, setParcelDescription] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // "I am the receiver" tick
  const [useMyDetails, setUseMyDetails] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  const [booking, setBooking] = useState(false);

  // Captain ko payment kahan karni hai: pickup par ya drop par
  const [payAt, setPayAt] = useState<'pickup' | 'drop'>('drop');

  const [pickup, setPickup] = useState<Place>(initialPickup ?? DEFAULT_PICKUP);
  const [drop, setDrop] = useState<Place | null>(initialDrop ?? null);
  const [picking, setPicking] = useState<'pickup' | 'drop' | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const mapRef = useRef<MapView>(null);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'loaded' | 'failed'>('loading');

  // ---------- bottom sheet state ----------
  const [mapExpanded, setMapExpanded] = useState(false); // true = map bada
  const sheetTop = useRef(new Animated.Value(SNAP_TOP)).current;
  const sheetTopVal = useRef(SNAP_TOP); // sheetTop ki current number value
  const dragStart = useRef(SNAP_TOP);
  const scrollY = useRef(0); // sheet ke andar ki list kitni scroll hui

  useEffect(() => {
    const id = sheetTop.addListener(({ value }) => {
      sheetTopVal.current = value;
    });
    return () => sheetTop.removeListener(id);
  }, [sheetTop]);

  const snapTo = (half: boolean) => {
    setMapExpanded(half);
    Animated.spring(sheetTop, {
      toValue: half ? SNAP_HALF : SNAP_TOP,
      useNativeDriver: false,
      speed: 14,
      bounciness: 4,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => {
        // sirf vertical drag
        if (Math.abs(g.dy) < 8 || Math.abs(g.dy) < Math.abs(g.dx)) return false;

        const down = g.dy > 0;
        const atTop = sheetTopVal.current <= SNAP_TOP + 2;
        const atHalf = sheetTopVal.current >= SNAP_HALF - 2;

        // list sabse upar + neeche kheencha -> map badhao
        if (down && scrollY.current <= 0 && !atHalf) return true;
        // map bada hai + upar kheencha -> map wapas chhota
        if (!down && !atTop) return true;
        // baaki sab: normal scroll
        return false;
      },
      onPanResponderGrant: () => {
        sheetTop.stopAnimation();
        dragStart.current = sheetTopVal.current;
      },
      onPanResponderMove: (_, g) => {
        sheetTop.setValue(
          Math.min(SNAP_HALF, Math.max(SNAP_TOP, dragStart.current + g.dy)),
        );
      },
      onPanResponderRelease: (_, g) => {
        const mid = (SNAP_TOP + SNAP_HALF) / 2;
        const half =
          g.vy > 0.4 ? true : g.vy < -0.4 ? false : sheetTopVal.current > mid;
        snapTo(half);
      },
      onPanResponderTerminate: () => {
        snapTo(sheetTopVal.current > (SNAP_TOP + SNAP_HALF) / 2);
      },
    }),
  ).current;

  // map ka center hamesha visible hisse ke beech me rahe (route chhupe nahi)
  const mapTranslateY = sheetTop.interpolate({
    inputRange: [SNAP_TOP, SNAP_HALF],
    outputRange: [(SNAP_TOP - MAP_H) / 2, (SNAP_HALF - MAP_H) / 2],
    extrapolate: 'clamp',
  });

  // distance / time pills sheet ke upar-upar chalein
  const pillsTop = sheetTop.interpolate({
    inputRange: [SNAP_TOP, SNAP_HALF],
    outputRange: [SNAP_TOP - 46, SNAP_HALF - 46],
    extrapolate: 'clamp',
  });

  const routeCoords = useMemo(
    () => (route?.encodedPolyline ? decodePolyline(route.encodedPolyline) : []),
    [route],
  );

  // Estimated fare (based on km)
  const estimatedFare = selected ? calcFare(category, selected.id, route?.distanceKm) : null;

  // User's offer (null = the estimate is used)
  const [offerFare, setOfferFare] = useState<number | null>(null);
  const finalFare = offerFare ?? estimatedFare;

  const minOffer =
    estimatedFare != null ? Math.max(1, Math.round(estimatedFare * MIN_OFFER_RATIO)) : null;
  const maxOffer =
    estimatedFare != null ? Math.round(estimatedFare * MAX_OFFER_RATIO) : null;

  // reset the offer when the vehicle or route changes (a new estimate comes)
  useEffect(() => {
    setOfferFare(null);
  }, [selected?.id, route?.distanceKm, activeMode]);

  const changeFare = (delta: number) => {
    if (finalFare == null || minOffer == null || maxOffer == null) return;
    const next = Math.min(maxOffer, Math.max(minOffer, finalFare + delta));
    setOfferFare(next === estimatedFare ? null : next);
  };

  // wait up to 8 seconds for the map to load, then show an error
  useEffect(() => {
    const t = setTimeout(() => {
      setMapStatus((cur) => {
        if (cur !== 'loaded') {
          console.log('MAP: did not load in 8 seconds -> check key / billing / restrictions');
          return 'failed';
        }
        return cur;
      });
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  const routeMode =
    vehicle === 'bike' || (combined && group?.id === 'bike') ? 'TWO_WHEELER' : 'DRIVE';

  // get the route again when pickup / drop / vehicle changes
  useEffect(() => {
    if (!drop) {
      setRoute(null);
      return;
    }

    let cancelled = false;
    setRouteLoading(true);

    mapsApi
      .route(pickup, drop, routeMode)
      .then((r) => {
        if (!cancelled) setRoute(r);
      })
      .catch(() => {
        if (!cancelled) {
          setRoute(null);
          Alert.alert('Route not found', 'Please try again');
        }
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pickup, drop, routeMode]);

  // fit the map to the route / markers (visible patti ke andar)
  useEffect(() => {
    const points = routeCoords.length
      ? routeCoords
      : [pickup, ...(drop ? [drop] : [])].map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
        }));

    if (points.length === 1) {
      mapRef.current?.animateToRegion(
        { ...points[0], latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
    } else if (points.length > 1) {
      mapRef.current?.fitToCoordinates(points, {
        edgePadding: {
          top: FIT_PAD_V + 70, // upar back button ke liye jagah
          right: 50,
          bottom: FIT_PAD_V + 40, // neeche distance/time pills ke liye jagah
          left: 50,
        },
        animated: true,
      });
    }
  }, [routeCoords, pickup, drop]);

  const errors = {
    parcelDescription:
      needsReceiver && parcelDescription.trim().length < 2
        ? 'Describe what you are sending or pick an item above'
        : '',
    receiverName:
      needsReceiver && receiverName.trim().length < 3
        ? "Enter the receiver's full name"
        : '',
    receiverPhone:
      needsReceiver && !PHONE_REGEX.test(receiverPhone)
        ? 'Enter a valid 10 digit mobile number'
        : '',
  };

  // Parcel <-> Goods badalna
  const onModePress = (m: Mode) => {
    if (m === mode) return;
    const gs = getGroups(vehicle, m);
    setMode(m);
    setGroupId(gs[0]?.id);
    setSelectedId(gs[0]?.variants[0]?.id);
    setItemId(null);
    setParcelDescription('');
  };

  const onItemPress = (item: Item) => {
    setItemId(item.id);
    setGroupId(item.groupId);
    setSelectedId(item.vehicleId);
    setParcelDescription(item.label);
  };

  const onGroupPress = (g: Group) => {
    setGroupId(g.id);
    setSelectedId(g.variants[0].id);
  };

  const onLocationPicked = (place: Place) => {
    if (picking === 'pickup') {
      setPickup(place);
    } else if (picking === 'drop') {
      setDrop(place);
    }
    setPicking(null);
  };

  // Tick: fill / clear the receiver with the sender's own details
  const onToggleMyDetails = async () => {
    if (profileLoading) return;

    // untick -> clear the fields
    if (useMyDetails) {
      setUseMyDetails(false);
      setReceiverName('');
      setReceiverPhone('');
      return;
    }

    try {
      setProfileLoading(true);
      const me = await loadMyProfile();

      if (!me.name && !me.phone) {
        Alert.alert('Profile', 'No name or phone number found in your profile');
        return;
      }

      setReceiverName(me.name);
      setReceiverPhone(me.phone);
      setUseMyDetails(true);
    } catch (e: any) {
      console.log('PROFILE ERROR:', e?.message ?? e);
      Alert.alert('Profile', 'Could not load your details, please try again');
    } finally {
      setProfileLoading(false);
    }
  };

  const onBook = async () => {
    if (booking) return;

    if (!selected) {
      Alert.alert('Select vehicle', 'Please select a vehicle first');
      return;
    }

    if (!drop) {
      Alert.alert('Drop location', 'Please choose a drop location first');
      return;
    }

    if (finalFare == null || !route) {
      Alert.alert('Fare', 'Could not calculate the fare, please check the route again');
      return;
    }

    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;

    try {
      setBooking(true);

      const ride = await ridesApi.createRide({
        pickupAddress: pickup.address,
        pickupLatitude: pickup.latitude,
        pickupLongitude: pickup.longitude,

        dropAddress: drop.address,
        dropLatitude: drop.latitude,
        dropLongitude: drop.longitude,

        category,
        // the id is the backend vehicleType (lite, mini, e_rickshaw, tata_ace ...)
        vehicleType: selected.id,

        // the user's offered fare (or the estimate, if unchanged)
        fare: finalFare,

        distance: route.distanceKm,
        duration: route.durationMinutes,

        // sender (name + phone) is filled by the backend from the logged-in user's profile.
        // receiver + order details are sent for parcel / goods.
        receiverName: receiverName.trim(),
        receiverPhone,
        parcelSize: getParcelSize(selected.id),
        parcelDescription: parcelDescription.trim(),

        // payment kahan hogi (backend field naam alag ho to yaha badlo)
        payAt: payAt === 'pickup' ? 'PICKUP' : 'DROP',
      });

      // open the tracking screen
      onRideCreated(ride.id);
    } catch (error: any) {
      Alert.alert('Booking Failed', error?.message || 'Could not complete the booking');
    } finally {
      setBooking(false);
    }
  };

  // estimated price shown under a vehicle card
  const priceText = (id: string) => {
    if (!drop) return 'Select drop';
    if (routeLoading) return '...';
    const f = calcFare(category, id, route?.distanceKm);
    return f == null ? '--' : `₹ ${f}`;
  };

  // Group card (a group with a single variant shows the price here)
  const renderGroupCard = (g: Group, fixedWidth: boolean) => {
    const active = g.id === group?.id;
    const single = g.variants.length === 1;
    return (
      <TouchableOpacity
        key={g.id}
        activeOpacity={0.85}
        onPress={() => onGroupPress(g)}
        style={[styles.gCard, fixedWidth && styles.gCardFixed, active && styles.gCardActive]}
      >
        {active && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark-circle" size={18} color={BLUE} />
          </View>
        )}
        <VehicleIcon iconKey={g.icon ?? `group_${g.id}`} emoji={g.emoji} big />
        <Text style={styles.gName}>{g.name}</Text>
        {!!g.sub && <Text style={styles.gSub}>{g.sub}</Text>}
        {single && (
          <Text style={[styles.vPrice, !drop && styles.vPriceHint]}>
            {priceText(g.variants[0].id)}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const showGroups = groups.length > 1;
  const showVariants = !!group && group.variants.length > 1;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Map + sheet ka area (footer ke upar) */}
      <View style={styles.flex}>
        {/* MAP (sabse peeche, route ke saath) */}
        <Animated.View
          style={[
            styles.mapWrap,
            { height: MAP_H, transform: [{ translateY: mapTranslateY }] },
          ]}
        >
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: pickup.latitude,
              longitude: pickup.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            onMapReady={() => {
              console.log('MAP: ready (native view created)');
              setMapStatus((cur) => (cur === 'loaded' ? cur : 'ready'));
            }}
            onMapLoaded={() => {
              console.log('MAP: loaded (tiles received)');
              setMapStatus('loaded');
            }}
          >
            <Marker
              coordinate={{ latitude: pickup.latitude, longitude: pickup.longitude }}
              pinColor="green"
              title="Pickup"
            />
            {drop && (
              <Marker
                coordinate={{ latitude: drop.latitude, longitude: drop.longitude }}
                pinColor="red"
                title="Drop"
              />
            )}
            {routeCoords.length > 0 && (
              <Polyline coordinates={routeCoords} strokeColor={BLUE} strokeWidth={5} />
            )}
          </MapView>

          {mapStatus === 'failed' && (
            <View style={styles.mapError}>
              <Text style={styles.mapErrorText}>
                The map did not load. Check the Google key, billing or restrictions.
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Back button + title (map ke upar) */}
        <View style={styles.topBar} pointerEvents="box-none">
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={BLACK} />
          </TouchableOpacity>
          <View style={styles.titlePill}>
            <Text style={styles.titleText}>{TITLES[activeMode]}</Text>
          </View>
        </View>

        {/* Distance + time (sheet ke saath upar-neeche hota hai) */}
        {drop && (
          <Animated.View style={[styles.mapPills, { top: pillsTop }]} pointerEvents="none">
            {routeLoading ? (
              <View style={styles.mapPill}>
                <ActivityIndicator size="small" color={BLUE} />
                <Text style={styles.mapPillText}>Finding route...</Text>
              </View>
            ) : route ? (
              <>
                <View style={styles.mapPill}>
                  <Ionicons name="navigate" size={14} color={BLUE} />
                  <Text style={styles.mapPillText}>{route.distanceKm} km</Text>
                </View>
                <View style={styles.mapPill}>
                  <Ionicons name="time-outline" size={14} color={BLUE} />
                  <Text style={styles.mapPillText}>{route.durationMinutes} min</Text>
                </View>
              </>
            ) : (
              <View style={styles.mapPill}>
                <Ionicons name="alert-circle-outline" size={14} color={RED} />
                <Text style={styles.mapPillText}>Route not available</Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* BOTTOM SHEET */}
        <Animated.View
          style={[styles.sheet, { top: sheetTop }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.handle} />

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!mapExpanded}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
          >
            {/* Parcel / Goods tabs (sirf tab dikhte hain jab dono allowed hon) */}
            {modes.length > 1 && (
              <View style={styles.modeRow}>
                {modes.map((m) => {
                  const active = m === mode;
                  return (
                    <TouchableOpacity
                      key={m}
                      activeOpacity={0.85}
                      onPress={() => onModePress(m)}
                      style={[styles.modeTab, active && styles.modeTabActive]}
                    >
                      <Text style={styles.modeEmoji}>{MODE_EMOJI[m]}</Text>
                      <Text style={[styles.modeText, active && styles.modeTextActive]}>
                        {MODE_LABEL[m]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Locations (timeline) */}
            <View style={styles.locCard}>
              <View style={styles.timeline}>
                <View style={styles.pickupDot} />
                <View style={styles.timelineLine} />
                <View style={styles.dropSquare} />
              </View>

              <View style={styles.flex}>
                <TouchableOpacity
                  style={styles.locRow}
                  activeOpacity={0.7}
                  onPress={() => setPicking('pickup')}
                >
                  <View style={styles.flex}>
                    <Text style={styles.locLabel}>PICKUP PARCEL FROM</Text>
                    <Text style={styles.locValue} numberOfLines={1}>
                      {pickup.address}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={GREY} />
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity
                  style={styles.locRow}
                  activeOpacity={0.7}
                  onPress={() => setPicking('drop')}
                >
                  <View style={styles.flex}>
                    <Text style={styles.locLabel}>DELIVER TO</Text>
                    <Text
                      style={[styles.locValue, !drop && styles.locPlaceholder]}
                      numberOfLines={1}
                    >
                      {drop ? drop.address : 'Choose drop location'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={GREY} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Group selector (Walk/Cycle/Bike/Auto/Cab, Auto/Truck) */}
            {showGroups &&
              (groups.length <= 2 ? (
                <View style={styles.gRow}>{groups.map((g) => renderGroupCard(g, false))}</View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.gScrollWrap}
                  contentContainerStyle={styles.vRow}
                >
                  {groups.map((g) => renderGroupCard(g, true))}
                </ScrollView>
              ))}

            {/* Vehicle categories (only when the group has more than one option) */}
            {showVariants && group && (
              <>
                <Text style={styles.sectionTitle}>Choose a vehicle</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.vRow}
                >
                  {group.variants.map((v) => {
                    const active = v.id === selected?.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        activeOpacity={0.85}
                        onPress={() => setSelectedId(v.id)}
                        style={[styles.vCard, active && styles.vCardActive]}
                      >
                        {active && (
                          <View style={styles.checkBadge}>
                            <Ionicons name="checkmark-circle" size={18} color={BLUE} />
                          </View>
                        )}
                        <VehicleIcon iconKey={v.icon ?? v.id} emoji={v.emoji} />
                        <Text style={styles.vName}>{v.name}</Text>
                        <Text style={styles.vSub}>{v.sub}</Text>
                        <Text style={[styles.vPrice, !drop && styles.vPriceHint]}>
                          {priceText(v.id)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Set your own fare */}
            {drop && estimatedFare != null && finalFare != null && (
              <View style={styles.fareCard}>
                <View style={styles.fareHead}>
                  <View style={styles.fareHeadIcon}>
                    <Ionicons name="cash-outline" size={20} color={BLUE} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.fareTitle}>Your offer</Text>
                    <Text style={styles.fareHint}>
                      Offer more to get a captain faster
                    </Text>
                  </View>
                  {offerFare != null && (
                    <TouchableOpacity onPress={() => setOfferFare(null)} activeOpacity={0.7}>
                      <Text style={styles.fareReset}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.fareRow}>
                  <TouchableOpacity
                    style={[styles.fareBtn, finalFare <= (minOffer ?? 0) && styles.fareBtnOff]}
                    activeOpacity={0.8}
                    onPress={() => changeFare(-FARE_STEP)}
                    disabled={finalFare <= (minOffer ?? 0)}
                  >
                    <Ionicons name="remove" size={24} color={BLUE} />
                  </TouchableOpacity>

                  <Text style={styles.fareValue}>₹{finalFare}</Text>

                  <TouchableOpacity
                    style={[styles.fareBtn, finalFare >= (maxOffer ?? 0) && styles.fareBtnOff]}
                    activeOpacity={0.8}
                    onPress={() => changeFare(FARE_STEP)}
                    disabled={finalFare >= (maxOffer ?? 0)}
                  >
                    <Ionicons name="add" size={24} color={BLUE} />
                  </TouchableOpacity>
                </View>

                <View style={styles.fareMetaRow}>
                  <View style={styles.fareMetaChip}>
                    <Text style={styles.fareMetaText}>Estimated ₹{estimatedFare}</Text>
                  </View>
                  <View style={styles.fareMetaChip}>
                    <Text style={styles.fareMetaText}>
                      Range ₹{minOffer} - ₹{maxOffer}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* What are you sending? (parcel / goods) */}
            {items.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, styles.itemsTitle]}>What are you sending?</Text>
                <Text style={styles.itemsHint}>
                  Pick an item and we will suggest a vehicle
                </Text>
                <View style={styles.chipWrap}>
                  {items.map((it) => {
                    const active = it.id === itemId;
                    return (
                      <TouchableOpacity
                        key={it.id}
                        activeOpacity={0.85}
                        onPress={() => onItemPress(it)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={styles.chipEmoji}>{it.emoji}</Text>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {it.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Parcel description + receiver */}
            {needsReceiver && (
              <>
                {/* Parcel description */}
                <Text style={[styles.sectionTitle, styles.itemsTitle]}>
                  {activeMode === 'goods' ? 'Goods details' : 'Parcel details'}
                </Text>
                <View style={styles.receiverCard}>
                  <Text style={styles.inputLabel}>
                    {activeMode === 'goods' ? 'Describe your goods' : 'Describe your parcel'}
                  </Text>
                  <View
                    style={[
                      styles.inputWrap,
                      styles.inputWrapMulti,
                      submitted && !!errors.parcelDescription && styles.inputError,
                    ]}
                  >
                    <Ionicons
                      name="cube-outline"
                      size={20}
                      color={GREY}
                      style={styles.inputIconTop}
                    />
                    <TextInput
                      style={[styles.input, styles.inputMulti]}
                      placeholder="e.g. Document envelope, 2 kg box"
                      placeholderTextColor="#94A3B8"
                      value={parcelDescription}
                      onChangeText={setParcelDescription}
                      multiline
                    />
                  </View>
                  {submitted && !!errors.parcelDescription && (
                    <Text style={styles.error}>{errors.parcelDescription}</Text>
                  )}
                </View>

                {/* Receiver */}
                <Text style={[styles.sectionTitle, styles.itemsTitle]}>Receiver details</Text>
                <View style={styles.receiverCard}>
                  <Text style={styles.inputLabel}>Receiver name</Text>
                  <View
                    style={[
                      styles.inputWrap,
                      useMyDetails && !!receiverName && styles.inputLocked,
                      submitted && !!errors.receiverName && styles.inputError,
                    ]}
                  >
                    <Ionicons
                      name="person-outline"
                      size={20}
                      color={GREY}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Amit Sharma"
                      placeholderTextColor="#94A3B8"
                      value={receiverName}
                      onChangeText={setReceiverName}
                      autoCapitalize="words"
                      editable={!(useMyDetails && !!receiverName)}
                    />
                  </View>
                  {submitted && !!errors.receiverName && (
                    <Text style={styles.error}>{errors.receiverName}</Text>
                  )}

                  <Text style={[styles.inputLabel, styles.inputGap]}>Receiver mobile number</Text>
                  <View
                    style={[
                      styles.inputWrap,
                      useMyDetails && !!receiverPhone && styles.inputLocked,
                      submitted && !!errors.receiverPhone && styles.inputError,
                    ]}
                  >
                    <Ionicons name="call-outline" size={20} color={GREY} style={styles.inputIcon} />
                    <Text style={styles.phonePrefix}>+91</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="10 digit mobile number"
                      placeholderTextColor="#94A3B8"
                      value={receiverPhone}
                      onChangeText={(t) => setReceiverPhone(t.replace(/\D/g, '').slice(0, 10))}
                      keyboardType="number-pad"
                      maxLength={10}
                      editable={!(useMyDetails && !!receiverPhone)}
                    />
                  </View>
                  {submitted && !!errors.receiverPhone && (
                    <Text style={styles.error}>{errors.receiverPhone}</Text>
                  )}

                  {/* Tick: fill the receiver with my (sender's) details */}
                  <TouchableOpacity
                    style={styles.tickRow}
                    activeOpacity={0.8}
                    onPress={onToggleMyDetails}
                    disabled={profileLoading}
                  >
                    <View style={[styles.tickBox, useMyDetails && styles.tickBoxOn]}>
                      {profileLoading ? (
                        <ActivityIndicator size="small" color={BLUE} />
                      ) : (
                        useMyDetails && <Ionicons name="checkmark" size={16} color="#fff" />
                      )}
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.tickText}>I am the receiver</Text>
                      <Text style={styles.tickSub}>Fill in my details as the receiver</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Terms & Conditions (receiver section ke neeche) */}
                <TouchableOpacity
                  style={styles.termsRow}
                  activeOpacity={0.7}
                  onPress={onOpenTerms}
                >
                  <Text style={styles.termsText}>
                    By ordering, you agree to our{' '}
                    <Text style={styles.termsLink}>Terms & Conditions</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </Animated.View>
      </View>

      {/* Book bar */}
      <View style={styles.footer}>
        <View style={styles.payRow}>
          <Ionicons name="wallet-outline" size={14} color={GREY} />
          <Text style={styles.payText}>Pay at</Text>
          {(['pickup', 'drop'] as const).map((k) => {
            const active = payAt === k;
            return (
              <TouchableOpacity
                key={k}
                activeOpacity={0.85}
                onPress={() => setPayAt(k)}
                style={[styles.payChip, active && styles.payChipActive]}
              >
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={12}
                  color={active ? BLUE : GREY}
                />
                <Text style={[styles.payChipText, active && styles.payChipTextActive]}>
                  {k === 'pickup' ? 'Pickup' : 'Drop'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.bookBtn, (booking || routeLoading) && styles.bookBtnDisabled]}
          activeOpacity={0.9}
          onPress={onBook}
          disabled={booking || routeLoading}
        >
          {booking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.bookText}>Order Now</Text>
              {finalFare != null && (
                <View style={styles.bookFare}>
                  <Text style={styles.bookFareText}>₹{finalFare}</Text>
                </View>
              )}
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Pickup / Drop search */}
      <LocationPicker
        visible={!!picking}
        title={picking === 'pickup' ? 'Pickup location' : 'Drop location'}
        onClose={() => setPicking(null)}
        onPick={onLocationPicked}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },

  // map
  mapWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: '#DCE8F8',
  },
  mapPills: {
    position: 'absolute',
    left: 14,
    zIndex: 4,
    flexDirection: 'row',
  },
  mapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    elevation: 3,
    shadowColor: BLACK,
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  mapPillText: { fontSize: 12, fontWeight: '800', color: BLACK, marginLeft: 5 },
  mapError: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15,23,42,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  mapErrorText: { color: '#fff', fontSize: 13, textAlign: 'center' },

  // top bar (map ke upar)
  topBar: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: BLACK,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  titlePill: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginLeft: 10,
    elevation: 4,
    shadowColor: BLACK,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  titleText: { fontSize: 15, fontWeight: '800', color: BLACK },

  // bottom sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 12,
    shadowColor: BLACK,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginTop: 8,
    marginBottom: 6,
  },
  scroll: { padding: 14, paddingBottom: 20 },

  // Parcel / Goods tabs
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#E8EEF7',
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 11,
  },
  modeTabActive: {
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  modeEmoji: { fontSize: 16, marginRight: 6 },
  modeText: { fontSize: 14, fontWeight: '700', color: GREY },
  modeTextActive: { color: BLUE },

  // locations (timeline)
  locCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 12,
    marginBottom: 14,
    elevation: 3,
    shadowColor: BLACK,
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  timeline: {
    width: 18,
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 18,
    marginRight: 10,
  },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GREEN,
    borderWidth: 3,
    borderColor: '#BBF7D0',
  },
  timelineLine: { flex: 1, width: 2, backgroundColor: BORDER, marginVertical: 4 },
  dropSquare: { width: 12, height: 12, borderRadius: 3, backgroundColor: RED },
  locRow: { height: 52, flexDirection: 'row', alignItems: 'center' },
  locLabel: { fontSize: 10, fontWeight: '700', color: GREY, letterSpacing: 0.8 },
  locValue: { fontSize: 14, fontWeight: '600', color: BLACK, marginTop: 2 },
  locPlaceholder: { color: '#94A3B8', fontWeight: '500' },
  divider: { height: 1, backgroundColor: BORDER },

  // vehicles
  sectionTitle: { fontSize: 16, fontWeight: '800', color: BLACK, marginBottom: 8 },
  vRow: { paddingRight: 8, paddingBottom: 6 },
  vCard: {
    width: 100,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 9,
    marginRight: 8,
    alignItems: 'center',
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  vCardActive: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  checkBadge: { position: 'absolute', top: 6, right: 6, zIndex: 2 },
  vEmoji: { fontSize: 28, marginBottom: 4 },
  vImg: { width: 62, height: 38, marginBottom: 4 },
  vName: { fontSize: 14, fontWeight: '800', color: BLACK },
  vSub: { fontSize: 10, color: GREY, marginTop: 1 },
  vPrice: { fontSize: 14, fontWeight: '800', color: BLACK, marginTop: 5 },
  vPriceHint: { fontSize: 12, fontWeight: '500', color: GREY },

  // group selector
  gRow: { flexDirection: 'row', marginBottom: 12 },
  gScrollWrap: { marginBottom: 12, flexGrow: 0 },
  gCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: 10,
    marginHorizontal: 5,
    alignItems: 'center',
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  gCardFixed: { flex: 0, width: 100, marginHorizontal: 0, marginRight: 8 },
  gCardActive: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  gEmoji: { fontSize: 28, marginBottom: 4 },
  gImg: { width: 66, height: 40, marginBottom: 4 },
  gName: { fontSize: 14, fontWeight: '800', color: BLACK },
  gSub: { fontSize: 10, color: GREY, marginTop: 1, textAlign: 'center' },

  // fare offer card
  fareCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    marginTop: 12,
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  fareHead: { flexDirection: 'row', alignItems: 'center' },
  fareHeadIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  fareTitle: { fontSize: 15, fontWeight: '800', color: BLACK },
  fareHint: { fontSize: 12, color: GREY, marginTop: 2 },
  fareReset: { fontSize: 13, fontWeight: '800', color: BLUE },
  fareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  fareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fareBtnOff: { opacity: 0.35 },
  fareValue: {
    minWidth: 110,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    color: BLACK,
  },
  fareMetaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  fareMetaChip: {
    backgroundColor: BG,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginHorizontal: 4,
  },
  fareMetaText: { fontSize: 12, fontWeight: '600', color: GREY },

  // items
  itemsTitle: { marginTop: 16, marginBottom: 4 },
  itemsHint: { fontSize: 11, color: GREY, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
  },
  chipActive: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  chipEmoji: { fontSize: 14, marginRight: 5 },
  chipText: { fontSize: 12, fontWeight: '600', color: BLACK },
  chipTextActive: { color: BLUE },

  // inputs
  receiverCard: { backgroundColor: '#fff', borderRadius: 18, padding: 12 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: BLACK, marginBottom: 6 },
  inputGap: { marginTop: 10 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: BG,
  },
  inputWrapMulti: { height: 70, alignItems: 'flex-start' },
  inputIcon: { marginRight: 10 },
  inputIconTop: { marginRight: 10, marginTop: 11 },
  phonePrefix: { fontSize: 15, fontWeight: '700', color: BLACK, marginRight: 8 },
  input: { flex: 1, fontSize: 14, color: BLACK, paddingVertical: 0 },
  inputMulti: {
    height: 64,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  inputLocked: { backgroundColor: BLUE_LIGHT, borderColor: BLUE },
  inputError: { borderColor: RED },
  error: { fontSize: 12, color: RED, marginTop: 6 },

  // "I am the receiver" tick
  tickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  tickBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tickBoxOn: { backgroundColor: BLUE, borderColor: BLUE },
  termsRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 4,
  },
  termsText: { fontSize: 11, color: GREY, textAlign: 'center' },
  termsLink: { color: BLUE, fontWeight: '700', textDecorationLine: 'underline' },
  tickText: { fontSize: 14, fontWeight: '700', color: BLACK },
  tickSub: { fontSize: 12, color: GREY, marginTop: 2 },

  // footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    elevation: 12,
    shadowColor: BLACK,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
  },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  payText: { fontSize: 11, color: GREY, fontWeight: '600', marginLeft: 5, marginRight: 6 },
  payChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginHorizontal: 2,
    backgroundColor: '#fff',
  },
  payChipActive: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  payChipText: { fontSize: 11, fontWeight: '700', color: GREY, marginLeft: 4 },
  payChipTextActive: { color: BLUE },
  bookBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtnDisabled: { opacity: 0.7 },
  bookText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  bookFare: {
    backgroundColor: BLUE_DARK,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginLeft: 12,
  },
  bookFareText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});