import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
    Image,
  StyleSheet,
  View,
  ScrollView,
  StatusBar,
  PermissionsAndroid,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useHideTabBarOnScroll } from '../../../components/AppTabBar';
import LocationPicker from '../../../LocationPicker';
import { Place } from '../../../services/mapsApi';
import { RootStackParamList } from '../../../types/navigation';
// Backend wala axios instance (token header ke saath) - captain wala hi
import api from '../../../services/CaptainaRideApi';

// Palette (blue theme)
const BLUE = '#1F6FE5';
const BLUE_DARK = '#1553B3';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const GREEN = '#16A34A';
const GREEN_DARK = '#15803D';
const RED = '#EF4444';
const BORDER = '#E2E8F0';

// ---------- Map + bottom sheet ----------
const SCREEN_H = Dimensions.get('window').height;
const SNAP_TOP = SCREEN_H * 0.2; // default: map sirf upar ki chhoti patti, sheet bada
const SNAP_HALF = SCREEN_H * 0.5; // neeche kheencho: map aadha
const MAP_H = SNAP_HALF + 40; // map ki fixed height (sheet ke peeche tak)
const MAP_ZOOM = 0.006; // chhota number = zyada zoom
const PIN_H = 32; // center pin ki height (stem + dot)

// ---------- Promo carousel ----------
const PROMO_W = Dimensions.get('window').width - 32; // scroll ke paddingHorizontal 16+16
const PROMO_INTERVAL = 3500;
// Bottom illustration
const ILLUSTRATION_HEIGHT = 320;
const FADE_HEIGHT = 140;
const FADE_STEPS = 20;
const PROMOS = [
  {
    id: 'send',
    title: 'Send parcels in minutes',
    sub: 'Door-to-door delivery, person to person',
    btn: 'Send now',
    emoji: '📦',
    bg: BLUE,
    circle: BLUE_DARK,
    btnColor: BLUE,
    service: 'parcel',
  },
  {
    id: 'order',
    title: 'Order parcels in minutes',
    sub: 'Your Needs, Delivered to Your Doorstep.',
    btn: 'Order now',
    emoji: '🛍️',
    bg: '#F97316',
    circle: '#C2410C',
    btnColor: '#C2410C',
     service: 'order',  
  },
];

type Service = {
  id: string;
  title: string;
  emoji: string;
  tint: string;
   image?: any;
};

// Location na mile (permission deny / GPS off) to ye pickup use hoga
const FALLBACK_PICKUP: Place = {
  address: 'New Market, Bhopal',
  latitude: 23.2332,
  longitude: 77.4326,
};

// Phone me save hone wali keys
const LOC_KEY = 'user_last_location';
const RECENT_KEY = 'user_recent_searches';
const FAV_KEY = 'user_fav_places';
const RECENT_SEARCH_LIMIT = 3;

// Address backend se: GET /maps/reverse?lat=&lng=
const reverseGeocode = async (latitude: number, longitude: number): Promise<string> => {
  try {
    const res = await api.get<{ address: string }>('/maps/reverse', {
      params: { lat: latitude, lng: longitude },
    });
    return res.data?.address || 'Current location';
  } catch {
    return 'Current location';
  }
};

// Location phone me (AsyncStorage) + backend me save
const saveLocation = async (p: Place) => {
  AsyncStorage.setItem(LOC_KEY, JSON.stringify(p)).catch(() => {});
  try {
    await api.patch('/users/me/location', {
      latitude: p.latitude,
      longitude: p.longitude,
      address: p.address,
    });
  } catch (e: any) {
    console.log('save location error', e?.response?.data || e?.message);
  }
};

const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location permission',
        message: 'Pickup ke liye aapki live location chahiye',
        buttonPositive: 'OK',
      },
    );
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }
  return new Promise((resolve) => {
    Geolocation.requestAuthorization(
      () => resolve(true),
      () => resolve(false),
    );
  });
};

const getPosition = () =>
  new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });

// "DB Mall, Maharana Pratap Nagar, Bhopal" -> { name: "DB Mall", sub: "Maharana Pratap Nagar, Bhopal" }
const splitAddress = (address: string) => {
  const [first, ...rest] = address.split(',');
  return { name: first.trim(), sub: rest.join(',').trim() };
};

const SERVICES: Service[] = [
  { id: 'bike', title: 'Bike', emoji: '🏍️', tint: '#DDF5E6' },
  { id: 'auto', title: 'Auto', emoji: '🛺', tint: '#FFF3C4' },
 {
    id: 'walk',
    title: 'Walk',
    emoji: '🚲',
    tint: '#DBEAFE',
    image: require('../../../constants/cycle.png'),
  },
  { id: 'goods', title: 'Goods', emoji: '🚚', tint: '#EADFFB' },
];

const WHY_RAPTOR = [
  { id: 'safe', icon: 'shield-checkmark-outline', label: 'Safe rides' },
  { id: 'fast', icon: 'flash-outline', label: 'Quick pickup' },
  { id: 'fair', icon: 'pricetag-outline', label: 'Fair fares' },
];

// ---------- Recent activity (real rides from backend) ----------
const MY_RIDES_URL = '/rides/my';

// Home pe kitni rides dikhani hain
const RECENT_LIMIT = 3;

// Ye statuses "live" ride hain: tap par tracking khulni chahiye
const ACTIVE_STATUSES = ['REQUESTED', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'STARTED'];

// Itni purani ride ko "live" nahi maanenge
const ACTIVE_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 ghante

type UserRide = {
  id: string;
  category?: string | null; // RIDE / PARCEL / GOODS etc.
  vehicleType?: string | null;
  status?: string | null;
  fare?: number | string | null;
  createdAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
};

const isActiveRide = (r: UserRide) => {
  if (!ACTIVE_STATUSES.includes((r.status ?? '').toUpperCase())) return false;
  if (!r.createdAt) return true;
  const t = new Date(r.createdAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t <= ACTIVE_MAX_AGE_MS;
};

const prettify = (s?: string | null) =>
  (s ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

// category / vehicle ke hisaab se emoji + title + tint
const rideLook = (r: UserRide) => {
  const cat = (r.category ?? '').toUpperCase();
  const veh = (r.vehicleType ?? '').toUpperCase();

  if (cat === 'PARCEL') return { emoji: '📦', title: 'Parcel Delivery', tint: '#FFE4D6' };
  if (cat === 'GOODS') return { emoji: '🚚', title: 'Goods Delivery', tint: '#EADFFB' };
  if (veh === 'WALK' || veh === 'CYCLE')
    return { emoji: '🚲', title: 'Walk Delivery', tint: '#DBEAFE' };
  if (veh.includes('BIKE') || veh === 'SCOOTY')
    return { emoji: '🏍️', title: 'Bike Ride', tint: '#DDF5E6' };
  if (veh.includes('AUTO') || veh === 'E_RICKSHAW')
    return { emoji: '🛺', title: 'Auto Ride', tint: '#FFF3C4' };
  return { emoji: '🚕', title: 'Cab Ride', tint: '#FFF3C4' };
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Completed',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  STARTED: 'On the way',
  ARRIVED: 'Captain arrived',
  ARRIVING: 'Captain arriving',
  ACCEPTED: 'Captain assigned',
  ASSIGNED: 'Captain assigned',
  REQUESTED: 'Searching',
  PENDING: 'Searching',
  SEARCHING: 'Searching',
};

// status chip ka rang
const statusTone = (status: string) => {
  if (status === 'COMPLETED' || status === 'DELIVERED') {
    return { bg: '#DCFCE7', fg: GREEN };
  }
  if (status === 'CANCELLED') return { bg: '#FEE2E2', fg: RED };
  return { bg: BLUE_LIGHT, fg: BLUE };
};

// "Today" / "Yesterday" / "3 days ago" / "12 Oct"
const timeAgo = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
};
const USER_HOME_IMG = require('../../../constants/userhome.jpeg');

function BottomIllustration() {
  return (
    <View pointerEvents="none" style={styles.illusWrap}>
      <Image source={USER_HOME_IMG} style={styles.illus} resizeMode="cover" />

      <View style={styles.illusFade}>
        {Array.from({ length: FADE_STEPS }).map((_, i) => (
          <View
            key={i}
            style={{
              height: FADE_HEIGHT / FADE_STEPS,
              backgroundColor: BG,
              opacity: 1 - i / (FADE_STEPS - 1),
            }}
          />
        ))}
      </View>
    </View>
  );
}
export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const hideTabBar = useHideTabBarOnScroll();

  // Trip: pickup (auto live location, change ho sakta hai) + drop (search bar se)
  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [picking, setPicking] = useState<'pickup' | 'drop' | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locDenied, setLocDenied] = useState(false);

  // user ne pickup khud badla ho to auto-location usse overwrite na kare
  const manualPickup = useRef(false);

  // Recent searched locations + favourites
  const [recentPlaces, setRecentPlaces] = useState<Place[]>([]);
  const [favs, setFavs] = useState<string[]>([]); // favourite places ke address

  // Recent activity: backend se asli rides
  const [recentRides, setRecentRides] = useState<UserRide[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);

  // Abhi chal rahi (complete / cancel nahi hui) ride. Jab tak ye hai, naya kaam block.
  const [activeRide, setActiveRide] = useState<UserRide | null>(null);

  // App launch par active ride mile to sirf ek baar auto-open karo
  const resumedRef = useRef(false);

  // Promo carousel
  const promoRef = useRef<ScrollView>(null);
  const promoIdx = useRef(0);
  const [promoDot, setPromoDot] = useState(0);

  const goPromo = useCallback((i: number) => {
    promoIdx.current = i;
    setPromoDot(i);
    promoRef.current?.scrollTo({ x: i * PROMO_W, animated: true });
  }, []);

  // har 3.5 sec me agla card (sirf jab carousel dikh raha ho)
  useEffect(() => {
    if (drop) return;
    const t = setInterval(() => {
      goPromo((promoIdx.current + 1) % PROMOS.length);
    }, PROMO_INTERVAL);
    return () => clearInterval(t);
  }, [drop, goPromo]);

  // ---------- Map + bottom sheet state ----------
  const mapRef = useRef<MapView>(null);
  const [mapExpanded, setMapExpanded] = useState(false); // true = map aadha

  // Pickup pin (pin fixed, map khiskta hai)
  const dragging = useRef(false); // user ne map haath se khiyncha
  const fromMap = useRef(false); // pickup map drag se aaya
  const geoReq = useRef(0); // purani address request ignore karne ke liye
  const [pinLifted, setPinLifted] = useState(false);
  const [addrLoading, setAddrLoading] = useState(false);
  const [pinH, setPinH] = useState(PIN_H);

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

  // Saved recent searches + favourites load karo
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((v) => {
        if (v) setRecentPlaces(JSON.parse(v));
      })
      .catch(() => {});
    AsyncStorage.getItem(FAV_KEY)
      .then((v) => {
        if (v) setFavs(JSON.parse(v));
      })
      .catch(() => {});
  }, []);

  const addRecentPlace = (p: Place) => {
    setRecentPlaces((cur) => {
      const next = [p, ...cur.filter((x) => x.address !== p.address)].slice(
        0,
        RECENT_SEARCH_LIMIT,
      );
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const toggleFav = (address: string) => {
    setFavs((cur) => {
      const next = cur.includes(address)
        ? cur.filter((a) => a !== address)
        : [...cur, address];
      AsyncStorage.setItem(FAV_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

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
        // map aadha hai + upar kheencha -> map wapas chhota
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

  // map ka center hamesha visible hisse ke beech me rahe
  const mapTranslateY = sheetTop.interpolate({
    inputRange: [SNAP_TOP, SNAP_HALF],
    outputRange: [(SNAP_TOP - MAP_H) / 2, (SNAP_HALF - MAP_H) / 2],
    extrapolate: 'clamp',
  });

  // recenter button sheet ke upar-upar chale
  const recenterTop = sheetTop.interpolate({
    inputRange: [SNAP_TOP, SNAP_HALF],
    outputRange: [SNAP_TOP - 56, SNAP_HALF - 56],
    extrapolate: 'clamp',
  });

  // pickup badle to map wahan le jao (map drag se aaya ho to dobara animate nahi)
  useEffect(() => {
    if (!pickup) return;
    if (fromMap.current) {
      fromMap.current = false;
      return;
    }
    mapRef.current?.animateToRegion(
      {
        latitude: pickup.latitude,
        longitude: pickup.longitude,
        latitudeDelta: MAP_ZOOM,
        longitudeDelta: MAP_ZOOM,
      },
      600,
    );
  }, [pickup?.latitude, pickup?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // user ne map khiyncha: pin thoda upar uthao
  const onMapDragStart = () => {
    dragging.current = true;
    setPinLifted(true);
  };

  // map ruk gaya: center ki jagah = naya pickup
  const onMapSettled = async (r: Region) => {
    // animateToRegion se aaya event ignore, sirf user ka drag
    if (!dragging.current) return;
    dragging.current = false;
    setPinLifted(false);

    manualPickup.current = true; // GPS isse overwrite na kare
    const id = ++geoReq.current;
    setAddrLoading(true);

    const address = await reverseGeocode(r.latitude, r.longitude);
    if (id !== geoReq.current) return; // naya drag aa gaya, ye purana hai

    fromMap.current = true;
    setPickup({ address, latitude: r.latitude, longitude: r.longitude });
    setAddrLoading(false);
  };

  const fetchRecentRides = useCallback(async () => {
    try {
      const res = await api.get<UserRide[]>(MY_RIDES_URL);
      const list = Array.isArray(res.data) ? res.data : [];

      // naya pehle (createdAt ke hisaab se), sirf top N
      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      );
      setRecentRides(sorted.slice(0, RECENT_LIMIT));

      // Live ride (complete / cancel nahi hui)
      const live = sorted.find(isActiveRide) ?? null;
      setActiveRide(live);

      // App kill -> dobara open: koi live ride hai to seedha tracking pe le jao.
      // Sirf ek baar, taaki user back kare to Home use phir se na dhakele.
      if (!resumedRef.current) {
        resumedRef.current = true;
        if (live) navigation.navigate('RideTracking', { rideId: live.id });
      }
    } catch (e: any) {
      console.log('recent rides error', e?.response?.data || e?.message);
    } finally {
      setRecentLoaded(true);
    }
  }, [navigation]);

  // Home screen pe aate hi (aur ride se wapas aane par) fresh list
  useFocusEffect(
    useCallback(() => {
      fetchRecentRides();
    }, [fetchRecentRides]),
  );

  // Live location nikalo + address banao + save karo
  const fetchCurrentLocation = useCallback(async (force = false) => {
    try {
      setLocLoading(true);

      const granted = await requestLocationPermission();
      if (!granted) {
        setLocDenied(true);
        setPickup((cur) => cur ?? FALLBACK_PICKUP);
        return;
      }
      setLocDenied(false);

      const { latitude, longitude } = await getPosition();
      console.log('GPS COORDS', latitude, longitude);
      const address = await reverseGeocode(latitude, longitude);

      if (force) manualPickup.current = false;
      if (!manualPickup.current) {
        const place: Place = { address, latitude, longitude };
        setPickup(place);
        saveLocation(place);
      }
    } catch (e) {
      console.log('LOCATION error', e);
      setPickup((cur) => cur ?? FALLBACK_PICKUP);
    } finally {
      setLocLoading(false);
    }
  }, []);

  // app khulte hi: pehle last saved location turant dikhao, phir fresh GPS
  useEffect(() => {
    AsyncStorage.getItem(LOC_KEY)
      .then((v) => {
        if (v) setPickup((cur) => cur ?? JSON.parse(v));
      })
      .catch(() => {});
    fetchCurrentLocation();
  }, [fetchCurrentLocation]);

  const onLocationPicked = (place: Place) => {
    if (picking === 'pickup') {
      manualPickup.current = true;
      setPickup(place);
      saveLocation(place);
    } else if (picking === 'drop') {
      setDrop(place);
      addRecentPlace(place);
    }
    setPicking(null);
  };

  // Live ride chal rahi ho to koi dusra kaam nahi: alert dikhao, true return karo (block)
  const blockedByActiveRide = (): boolean => {
    if (!activeRide) return false;
    Alert.alert(
      'Ride chal rahi hai',
      'Aapki current ride abhi complete ya cancel nahi hui hai. Jab tak wo complete ya cancel nahi hoti, aap app me dusra kaam nahi kar sakte.',
      [
        { text: 'Ok', style: 'cancel' },
        {
          text: 'Track ride',
          onPress: () => navigation.navigate('RideTracking', { rideId: activeRide.id }),
        },
      ],
    );
    return true;
  };

const onServicePress = (id: string) => {
  if (blockedByActiveRide()) return;

  // Sirf Order now -> pehle ParcelAddress screen
  if (id === 'order') {
    navigation.navigate('ParcelAddress', {
      service: id,
      pickup: pickup ?? FALLBACK_PICKUP,
      drop,
    });
    return;
  }

  // Send now / Bike / Auto / Cab / Goods -> seedha Booking
  navigation.navigate('Booking', {
    service: id,
    pickup: pickup ?? FALLBACK_PICKUP,
    drop,
  });
};

  const openPicker = (which: 'pickup' | 'drop') => {
    if (blockedByActiveRide()) return;
    setPicking(which);
  };

  const mapStart = pickup ?? FALLBACK_PICKUP;
  const pickupLoading = (locLoading && !pickup) || addrLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.flex}>
        {/* MAP (sabse peeche, live location ke saath) */}
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
              latitude: mapStart.latitude,
              longitude: mapStart.longitude,
              latitudeDelta: MAP_ZOOM,
              longitudeDelta: MAP_ZOOM,
            }}
            showsUserLocation
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            onPanDrag={onMapDragStart}
            onRegionChangeComplete={onMapSettled}
          />

          {/* Fixed pickup pin: map ke center me, map khiskta hai pin nahi */}
          <View
            pointerEvents="none"
            onLayout={(e) => setPinH(e.nativeEvent.layout.height)}
            style={[
              styles.centerPin,
              { top: MAP_H / 2 - pinH + 11 },
              pinLifted && styles.centerPinLifted,
            ]}
          >
            <View style={styles.mapPinStem} />
            <View style={styles.mapPinDotOuter}>
              <View style={styles.mapPinDotInner} />
            </View>
          </View>
        </Animated.View>

        {/* Bell (map ke upar, pill ke saath) */}
        <TouchableOpacity style={styles.bell} activeOpacity={0.8}>
          <Ionicons name="notifications-outline" size={20} color={BLACK} />
          <View style={styles.bellDot} />
        </TouchableOpacity>

        {/* Pickup address pill (map ke upar) */}
        <TouchableOpacity
          style={styles.pickupPill}
          activeOpacity={0.85}
          onPress={() => openPicker('pickup')}
        >
          <View style={styles.pickupPillDot} />
          <Text style={styles.pickupPillText} numberOfLines={1}>
            {pickupLoading
              ? 'Location dhoondh rahe hain...'
              : pickup?.address ?? FALLBACK_PICKUP.address}
          </Text>
          {locLoading ? (
            <ActivityIndicator size="small" color={BLUE} />
          ) : locDenied ? (
            <Text style={styles.locOffText}>Location off</Text>
          ) : null}
        </TouchableOpacity>

        {/* Recenter button (sheet ke saath upar-neeche hota hai) */}
        <Animated.View style={[styles.recenter, { top: recenterTop }]}>
          <TouchableOpacity
            onPress={() => fetchCurrentLocation(true)}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="locate" size={22} color={BLUE} />
          </TouchableOpacity>
        </Animated.View>

        {/* BOTTOM SHEET */}
        <Animated.View style={[styles.sheet, { top: sheetTop }]} {...panResponder.panHandlers}>
          <View style={styles.handle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!mapExpanded}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
              hideTabBar(e);
            }}
          >
            {/* Search bar */}
            <TouchableOpacity
              style={styles.searchBar}
              activeOpacity={0.8}
              onPress={() => openPicker('drop')}
            >
              <Ionicons name="search" size={22} color={BLACK} />
              <Text
                style={[styles.searchText, !!drop && styles.searchTextFilled]}
                numberOfLines={1}
              >
                {drop ? drop.address : 'Ready to Send?'}
              </Text>
              {drop && (
                <TouchableOpacity
                  onPress={() => setDrop(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={GREY} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {/* Recent searched locations */}
            {recentPlaces.map((p) => {
              const { name, sub } = splitAddress(p.address);
              const fav = favs.includes(p.address);
              return (
                <TouchableOpacity
                  key={p.address}
                  style={styles.histRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (blockedByActiveRide()) return;
                    setDrop(p);
                    addRecentPlace(p);
                  }}
                >
                  <Ionicons name="time-outline" size={20} color={GREY} />
                  <View style={[styles.flex, styles.histText]}>
                    <Text style={styles.histName} numberOfLines={1}>
                      {name}
                    </Text>
                    {!!sub && (
                      <Text style={styles.histSub} numberOfLines={1}>
                        {sub}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => toggleFav(p.address)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={fav ? 'heart' : 'heart-outline'}
                      size={22}
                      color={fav ? RED : GREY}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}

            {/* Services */}
            <Text style={styles.sectionTitle}>
              {drop ? 'Choose a service for this trip' : 'Our services'}
            </Text>
            <View style={styles.servicesRow}>
              {SERVICES.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.serviceItem}
                  activeOpacity={0.8}
                  onPress={() => onServicePress(s.id)}
                >
                  <View style={[styles.serviceIcon, { backgroundColor: s.tint }]}>
  {s.image ? (
    <Image source={s.image} style={styles.serviceImg} resizeMode="contain" />
  ) : (
    <Text style={styles.serviceEmoji}>{s.emoji}</Text>
  )}
</View>
                  <Text style={styles.serviceTitle}>{s.title}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Promo carousel (drop chunne se pehle) */}
            {!drop && (
              <View style={styles.promoSection}>
                <ScrollView
                  ref={promoRef}
                  horizontal
                  pagingEnabled
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={PROMO_W}
                  scrollEventThrottle={16}
                  onMomentumScrollEnd={(e) => {
                    const i = Math.round(e.nativeEvent.contentOffset.x / PROMO_W);
                    promoIdx.current = i; // manual swipe ke baad timer yahin se aage chale
                    setPromoDot(i);
                  }}
                >
                  {PROMOS.map((p) => (
                    <View key={p.id} style={{ width: PROMO_W }}>
                      <View style={[styles.promo, { backgroundColor: p.bg, marginBottom: 0 }]}>
                        <View style={[styles.promoCircleBig, { backgroundColor: p.circle }]} />
                        <View style={styles.promoCircleSmall} />

                        <View style={styles.promoTextWrap}>
                          <Text style={styles.promoTitle}>{p.title}</Text>
                          <Text style={styles.promoSub}>{p.sub}</Text>
                          <TouchableOpacity
                            style={styles.promoBtn}
                            activeOpacity={0.85}
                            onPress={() => onServicePress(p.service)}
                          >
                            <Text style={[styles.promoBtnText, { color: p.btnColor }]}>
                              {p.btn}
                            </Text>
                            <Ionicons name="arrow-forward" size={14} color={p.btnColor} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.promoEmoji}>{p.emoji}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                {/* dots */}
                <View style={styles.dotsRow}>
                  {PROMOS.map((p, i) => (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => goPromo(i)}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      style={[styles.dot, i === promoDot && styles.dotActive]}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Why Raptor */}
            <View style={styles.whyCard}>
              {WHY_RAPTOR.map((w, i) => (
                <View
                  key={w.id}
                  style={[styles.whyItem, i < WHY_RAPTOR.length - 1 && styles.whyDivider]}
                >
                  <View style={styles.whyIcon}>
                    <Ionicons name={w.icon} size={20} color={BLUE} />
                  </View>
                  <Text style={styles.whyLabel}>{w.label}</Text>
                </View>
              ))}
            </View>

            {/* Recent activity: ride na ho to empty illustration */}
            {recentLoaded && recentRides.length === 0 && (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitleInline}>Recent Activity</Text>
                </View>

                <View style={styles.emptyCard}>
                  {/* Illustration: soft circle + pin + taxi on a road */}
                  <View style={styles.emptyArt}>
                    <View style={styles.emptyCircle} />

                    {/* clouds */}
                    <View style={[styles.cloud, { top: 14, left: 10, width: 38 }]} />
                    <View style={[styles.cloud, { top: 34, right: 6, width: 28 }]} />

                    {/* floating location pin */}
                    <View style={styles.pinWrap}>
                      <View style={styles.pinHead}>
                        <View style={styles.pinHole} />
                      </View>
                      <View style={styles.pinTip} />
                      <View style={styles.pinShadow} />
                    </View>

                    {/* road + taxi */}
                    <View style={styles.emptyRoad}>
                      <View style={styles.roadDash} />
                      <View style={styles.roadDash} />
                      <View style={styles.roadDash} />
                    </View>
                    <Text style={styles.emptyTaxi}>🚕</Text>
                  </View>

                  <Text style={styles.emptyTitle}>No rides yet</Text>
                  <Text style={styles.emptySub}>
                    Aapki pehli ride ya delivery{'\n'}yaha dikhegi
                  </Text>

                  <TouchableOpacity
                    style={styles.emptyBtn}
                    activeOpacity={0.85}
                    onPress={() => onServicePress('bike')}
                  >
                    <Text style={styles.emptyBtnText}>Book your first ride</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Recent activity: jab user ki rides ho */}
            {recentRides.length > 0 && (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitleInline}>Recent Activity</Text>
                </View>

                <View style={styles.recentCard}>
                  {recentRides.map((r, i) => {
                    const look = rideLook(r);
                    const status = (r.status ?? '').toUpperCase();
                    const statusText = STATUS_LABEL[status] ?? prettify(r.status);
                    const when = timeAgo(r.completedAt ?? r.cancelledAt ?? r.createdAt);
                    const tone = statusTone(status);
                    const active = isActiveRide(r);
                    const completed = status === 'COMPLETED' || status === 'DELIVERED';
                    const tappable = active || completed; // cancelled par tap nahi

                    return (
                      <TouchableOpacity
                        key={r.id}
                        activeOpacity={tappable ? 0.7 : 1}
                        disabled={!tappable}
                        onPress={() => navigation.navigate('RideTracking', { rideId: r.id })}
                        style={[
                          styles.recentRow,
                          i === recentRides.length - 1 && styles.noBorder,
                        ]}
                      >
                        <View style={[styles.recentIcon, { backgroundColor: look.tint }]}>
                          <Text style={styles.recentEmoji}>{look.emoji}</Text>
                        </View>
                        <View style={styles.flex}>
                          <Text style={styles.recentTitle}>{look.title}</Text>
                          <Text style={styles.recentSub}>
                            {active ? 'Tap to track' : completed ? `${when} • View bill` : when}
                          </Text>
                        </View>
                        <View style={styles.recentRight}>
                          {r.fare != null && (
                            <Text style={styles.amount}>₹{Number(r.fare).toFixed(0)}</Text>
                          )}
                          {!!statusText && (
                            <View style={[styles.chip, { backgroundColor: tone.bg }]}>
                              <Text style={[styles.chipText, { color: tone.fg }]}>
                                {statusText}
                              </Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                          </View>
              </>
            )}

            {/* Illustration: content ke saath scroll hoti hai */}
            <View style={styles.inlineIllus}>
              <BottomIllustration />
            </View>
          </ScrollView>
        </Animated.View>
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
  scroll: { paddingHorizontal: 16, paddingBottom: 0 },

  // map
  mapWrap: { position: 'absolute', left: 0, right: 0, top: 0 },
  // bottom illustration
  inlineIllus: { marginHorizontal: -16, marginTop: 16 },
  illusWrap: {
    height: ILLUSTRATION_HEIGHT,
    overflow: 'hidden',
    backgroundColor: BG,
  },
  illus: { width: '100%', height: '100%', opacity: 0.9 },
  illusFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  // fixed center pin (dot ka center = map ka exact center)
  centerPin: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  centerPinLifted: { transform: [{ translateY: -10 }] },
  mapPinStem: { width: 2, height: 10, backgroundColor: GREEN_DARK },
  mapPinDotOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  mapPinDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GREEN_DARK,
  },
  recenter: {
    position: 'absolute',
    right: 16,
    zIndex: 4,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: BLACK,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

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
    marginBottom: 10,
  },

  // bell (map ke upar)
  bell: {
    position: 'absolute',
    top: 10,
    right: 16,
    zIndex: 5,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  bellDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: RED,
    borderWidth: 1.5,
    borderColor: '#fff',
  },

  // pickup pill (map ke upar)
  pickupPill: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 64,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
    elevation: 4,
    shadowColor: BLACK,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pickupPillDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GREEN,
    borderWidth: 3,
    borderColor: '#BBF7D0',
    marginRight: 10,
  },
  pickupPillText: { flex: 1, fontSize: 13, fontWeight: '600', color: BLACK },
  locOffText: { fontSize: 11, fontWeight: '700', color: RED, marginLeft: 8 },

  // search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#DBEAFE',
    paddingHorizontal: 14,
    height: 44,
    marginTop: 0,
    marginBottom: 2,
    elevation: 3,
    shadowColor: BLACK,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  searchText: { flex: 1, fontSize: 15, fontWeight: '700', color: BLACK, marginLeft: 10 },
  searchTextFilled: { fontSize: 14, fontWeight: '600' },

  // recent searched locations
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderStyle: 'dashed',
  },
  histText: { marginLeft: 12, marginRight: 8 },
  histName: { fontSize: 15, fontWeight: '700', color: BLACK },
  histSub: { fontSize: 12, color: GREY, marginTop: 1 },

  // section titles
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BLACK,
    marginTop: 12,
    marginBottom: 10,
  },
  sectionTitleInline: { fontSize: 17, fontWeight: '800', color: BLACK },

  // services (4 across)
  servicesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  serviceItem: { width: '23%', alignItems: 'center' },
  serviceIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  serviceEmoji: { fontSize: 30 },
  serviceTitle: { fontSize: 13, fontWeight: '700', color: BLACK, marginTop: 8 },

  // promo banner
  promo: {
    backgroundColor: BLUE,
    borderRadius: 20,
    padding: 18,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
serviceImg: {
  width: 75,
  height: 75,
   marginTop: 4,
  transform: [{ scaleX: -1 }], // image ko left direction me ghumata hai
},

  promoCircleBig: {
    position: 'absolute',
    right: -40,
    top: -50,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: BLUE_DARK,
    opacity: 0.55,
  },
  promoCircleSmall: {
    position: 'absolute',
    right: 70,
    bottom: -40,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#fff',
    opacity: 0.1,
  },
  promoTextWrap: { flex: 1, paddingRight: 8 },
  promoTitle: { fontSize: 19, fontWeight: '800', color: '#fff', lineHeight: 24 },
  promoSub: { fontSize: 13, color: '#DCEBFF', marginTop: 4, lineHeight: 18 },
  promoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  promoBtnText: { color: BLUE, fontSize: 13, fontWeight: '800', marginRight: 6 },
  promoEmoji: { fontSize: 64 },

  // promo carousel
  promoSection: { marginBottom: 16 },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 3,
  },
  dotActive: { width: 18, backgroundColor: BLUE },

  // why raptor
  whyCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 14,
    marginBottom: 22,
  },
  whyItem: { flex: 1, alignItems: 'center' },
  whyDivider: { borderRightWidth: 1, borderRightColor: BORDER },
  whyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  whyLabel: { fontSize: 12, fontWeight: '700', color: BLACK },

  // recent
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  recentCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  noBorder: { borderBottomWidth: 0 },
  recentIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recentEmoji: { fontSize: 20 },
  recentTitle: { fontSize: 15, fontWeight: '700', color: BLACK },
  recentSub: { fontSize: 12, color: GREY, marginTop: 2 },
  recentRight: { alignItems: 'flex-end' },
  amount: { fontSize: 15, fontWeight: '800', color: BLACK },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  chipText: { fontSize: 10, fontWeight: '800' },

  // empty state illustration
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyArt: {
    width: 220,
    height: 150,
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyCircle: {
    position: 'absolute',
    top: 6,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: BLUE_LIGHT,
  },
  cloud: {
    position: 'absolute',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D6E6FF',
  },
  pinWrap: { position: 'absolute', top: 14, alignItems: 'center' },
  pinHead: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: BLUE,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  pinHole: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },
  pinTip: {
    width: 14,
    height: 14,
    backgroundColor: BLUE,
    transform: [{ rotate: '45deg' }],
    marginTop: -9,
    borderRadius: 2,
  },
  pinShadow: {
    width: 26,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(31,111,229,0.18)',
    marginTop: 8,
  },
  emptyRoad: {
    position: 'absolute',
    bottom: 12,
    width: 220,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 12,
  },
  roadDash: { width: 22, height: 3, borderRadius: 2, backgroundColor: '#fff' },
  emptyTaxi: { position: 'absolute', bottom: 16, left: 34, fontSize: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: BLACK },
  emptySub: {
    fontSize: 13,
    color: GREY,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  emptyBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});