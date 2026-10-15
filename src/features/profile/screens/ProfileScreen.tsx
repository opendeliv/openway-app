import React, { useCallback, useRef, useState } from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../../../types/navigation';
import { profileApi, ProfileUser, clearToken } from '../../../services/api';
import { captainsApi, Captain } from '../../../services/captainsApi';

// Same palette as Home / Booking
const BLUE = '#1F6FE5';
const BLUE_DARK = '#1553B3';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16A34A';
const RED = '#DC2626';

type MenuItem = {
  id: string;
  label: string;
  icon: string;
  color: string;
  tint: string;
};

const MENU: MenuItem[] = [
  { id: 'rides', label: 'My Rides', icon: 'time-outline', color: '#2563EB', tint: '#DBEAFE' },
  { id: 'payments', label: 'Payments', icon: 'card-outline', color: '#7C3AED', tint: '#EDE9FE' },
  { id: 'offers', label: 'Offers & Coupons', icon: 'gift-outline', color: '#EA580C', tint: '#FFEDD5' },
  { id: 'addresses', label: 'Saved Addresses', icon: 'location-outline', color: '#16A34A', tint: '#DCFCE7' },
  { id: 'safety', label: 'Safety', icon: 'shield-checkmark-outline', color: '#0891B2', tint: '#CFFAFE' },
  { id: 'help', label: 'Help & Support', icon: 'headset-outline', color: '#DB2777', tint: '#FCE7F3' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline', color: '#475569', tint: '#E2E8F0' },
];

const formatDate = (date: string | null | undefined) => {
  if (!date) return '-';

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return '-';
  }

  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const capitalize = (value: string | null | undefined) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : '';

// "Amit Sharma" -> "AS"
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

export default function ProfileScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [captain, setCaptain] = useState<Captain | null>(null);
  const [loading, setLoading] = useState(true);

  // Personal information sirf tap karne se dikhegi
  const [showInfo, setShowInfo] = useState(false);

  // Pehli baar load hua ya nahi (loader sirf pehli baar dikhana hai)
  const hasLoadedOnce = useRef(false);

  const loadProfile = async () => {
    try {
      // Loader sirf first load par, baad me background refresh
      if (!hasLoadedOnce.current) {
        setLoading(true);
      }

      // Profile aur captain status ek saath
      // Captain check fail ho (jaise network) to profile ko na roke:
      // undefined = pata nahi chala, purani state rakho
      const [profileData, captainData] = await Promise.all([
        profileApi.getProfile(),
        captainsApi.getMyCaptain().catch(() => undefined),
      ]);

      setProfile(profileData);

      if (captainData !== undefined) {
        setCaptain(captainData);
      }

      hasLoadedOnce.current = true;
    } catch (error: any) {
      Alert.alert(
        'Profile',
        error?.message || 'Profile load nahi ho paaya',
      );
    } finally {
      setLoading(false);
    }
  };

  // Screen par wapas aane par profile fresh load hogi (Edit / Captain register se back aane par bhi)
  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, []),
  );

  // Captain banner ki state
  const verification = captain?.verificationStatus;
  const isPending = !!captain && verification === 'PENDING';
  const isRejected = !!captain && verification === 'REJECTED';
  const isApproved = !!captain && !isPending && !isRejected;

  const onMenuPress = (id: string) => {
    // Baaki screens baad me connect karenge
    console.log('Menu pressed:', id);
  };

  const onBecomeCaptain = () => {
    // Captain account nahi hai -> register screen
    if (!captain) {
      navigation.navigate('CaptainRegister');
      return;
    }

    if (isPending) {
      Alert.alert(
        'Request Pending',
        'Aapki captain request verification me hai. Approve hone ke baad aap captain ban jaoge.',
      );
      return;
    }

    if (isRejected) {
      Alert.alert(
        'Request Rejected',
        'Aapki captain request approve nahi ho payi. Details ke liye Help & Support se contact karo.',
      );
      return;
    }

    // Approved captain -> captain app
    navigation.navigate('CaptainTabs');
  };

  const onEditProfile = () => {
    navigation.navigate('EditProfile');
  };

  const doLogout = async () => {
    await clearToken();

    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const onLogout = () => {
    Alert.alert('Logout', 'Kya aap logout karna chahte ho?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: doLogout },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const name = profile?.name || 'Guest User';
  const phone = profile?.phone || '-';
  const initials = profile?.name ? initialsOf(profile.name) : '';

  // Banner ka text captain state ke hisaab se
  let bannerTag = 'EARN FROM APP';
  let bannerTitle = 'Become a Captain / Rider';
  let bannerSub = 'Apni marzi se kaam karo aur har hafte kamao';
  let bannerBtn = 'Join Now';

  if (isPending) {
    bannerTag = 'APPLICATION SUBMITTED';
    bannerTitle = 'Captain request pending';
    bannerSub = 'Verification ke baad aap rides le paoge';
    bannerBtn = 'View Status';
  } else if (isRejected) {
    bannerTag = 'REQUEST REJECTED';
    bannerTitle = 'Captain request rejected';
    bannerSub = 'Support se contact karke details pucho';
    bannerBtn = 'View Status';
  } else if (isApproved) {
    bannerTag = 'CAPTAIN ACCOUNT';
    bannerTitle = 'Open Captain App';
    bannerSub = 'Rides accept karo aur kamao';
    bannerBtn = 'Go Online';
  }

  const infoRows = [
    { id: 'email', icon: 'mail-outline', label: 'Email', value: profile?.email || 'Not added' },
    {
      id: 'gender',
      icon: 'person-outline',
      label: 'Gender',
      value: capitalize(profile?.gender) || 'Not added',
    },
    {
      id: 'dob',
      icon: 'calendar-outline',
      label: 'Date of Birth',
      value: profile?.dateOfBirth ? formatDate(profile.dateOfBirth) : 'Not added',
    },
    {
      id: 'joined',
      icon: 'time-outline',
      label: 'Joined',
      value: formatDate(profile?.joined),
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={BLUE} />

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Blue hero: avatar + name + phone + edit */}
        <View style={styles.hero}>
          <View style={styles.heroCircleBig} />
          <View style={styles.heroCircleSmall} />

          <Text style={styles.screenTitle}>Profile</Text>

          <View style={styles.userRow}>
            <View style={styles.avatar}>
              {initials ? (
                <Text style={styles.avatarText}>{initials}</Text>
              ) : (
                <Ionicons name="person" size={32} color={BLUE} />
              )}
            </View>

            <View style={styles.flex}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                {isApproved && (
                  <View style={styles.captainChip}>
                    <Ionicons name="checkmark-circle" size={12} color="#fff" />
                    <Text style={styles.captainChipText}>Captain</Text>
                  </View>
                )}
              </View>

              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={13} color="#DCE8FF" />
                <Text style={styles.phone}>{phone}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.editBtn}
              activeOpacity={0.8}
              onPress={onEditProfile}
            >
              <Ionicons name="create-outline" size={15} color={BLUE} />
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats (hero ke upar overlap) */}
        <View style={styles.statsCard}>
          <View style={styles.stat}>
            <View style={[styles.statIcon, { backgroundColor: BLUE_LIGHT }]}>
              <Ionicons name="car-outline" size={18} color={BLUE} />
            </View>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Rides</Text>
          </View>

          <View style={[styles.stat, styles.statDivider]}>
            <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="star" size={18} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>5.0</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>

          <View style={styles.stat}>
            <View style={[styles.statIcon, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="close-circle-outline" size={18} color={RED} />
            </View>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Cancelled</Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* Become a Captain banner (captain status ke hisaab se) */}
          <TouchableOpacity
            style={styles.captainBanner}
            activeOpacity={0.9}
            onPress={onBecomeCaptain}
          >
            <View style={styles.bannerCircle} />

            <View style={styles.flex}>
              <View style={styles.tag}>
                <Text style={styles.tagText}>{bannerTag}</Text>
              </View>

              <Text style={styles.captainTitle}>{bannerTitle}</Text>

              <Text style={styles.captainSub}>{bannerSub}</Text>

              <View style={styles.captainBtn}>
                <Text style={styles.captainBtnText}>{bannerBtn}</Text>
                <Ionicons name="arrow-forward" size={14} color={BLUE} />
              </View>
            </View>

            <Text style={styles.captainEmoji}>🏍️</Text>
          </TouchableOpacity>

          {/* Personal Information (tap karne par khulta hai) */}
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.infoHeader}
              activeOpacity={0.7}
              onPress={() => setShowInfo((prev) => !prev)}
            >
              <View style={[styles.menuIcon, { backgroundColor: BLUE_LIGHT }]}>
                <Ionicons name="id-card-outline" size={19} color={BLUE} />
              </View>
              <Text style={styles.menuLabel}>Personal Information</Text>
              <Ionicons
                name={showInfo ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={GREY}
              />
            </TouchableOpacity>

            {showInfo && (
              <View style={styles.infoBody}>
                {infoRows.map((r, i) => (
                  <View
                    key={r.id}
                    style={[styles.infoRow, i === infoRows.length - 1 && styles.noBorder]}
                  >
                    <Ionicons name={r.icon} size={17} color={GREY} style={styles.infoIcon} />
                    <Text style={styles.infoLabel}>{r.label}</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>
                      {r.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Menu */}
          <View style={styles.card}>
            {MENU.map((m, i) => (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.menuRow,
                  i === MENU.length - 1 && styles.noBorder,
                ]}
                activeOpacity={0.7}
                onPress={() => onMenuPress(m.id)}
              >
                <View style={[styles.menuIcon, { backgroundColor: m.tint }]}>
                  <Ionicons name={m.icon} size={19} color={m.color} />
                </View>

                <Text style={styles.menuLabel}>{m.label}</Text>

                <Ionicons name="chevron-forward" size={20} color="#B5BCC8" />
              </TouchableOpacity>
            ))}
          </View>

          {/* Logout */}
          <TouchableOpacity
            style={styles.logoutBtn}
            activeOpacity={0.8}
            onPress={onLogout}
          >
            <Ionicons name="log-out-outline" size={20} color={RED} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>

          <Text style={styles.version}>Raptor v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  // blue top (status bar area), grey body
  container: {
    flex: 1,
    backgroundColor: BLUE,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: BG,
  },

  scrollView: {
    backgroundColor: BG,
  },

  scroll: {
    paddingBottom: 28,
  },

  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 10,
    color: GREY,
    fontSize: 14,
  },

  body: {
    paddingHorizontal: 16,
  },

  // Hero
  hero: {
    backgroundColor: BLUE,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 48,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
  },

  heroCircleBig: {
    position: 'absolute',
    right: -50,
    top: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: BLUE_DARK,
    opacity: 0.5,
  },

  heroCircleSmall: {
    position: 'absolute',
    left: -30,
    bottom: -40,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#fff',
    opacity: 0.08,
  },

  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 16,
  },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: BLUE,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  name: {
    flexShrink: 1,
    fontSize: 19,
    fontWeight: '800',
    color: '#fff',
  },

  captainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GREEN,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
  },

  captainChipText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 3,
  },

  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },

  phone: {
    fontSize: 13,
    color: '#DCE8FF',
    marginLeft: 5,
    fontWeight: '600',
  },

  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginLeft: 8,
  },

  editText: {
    color: BLUE,
    fontWeight: '800',
    fontSize: 12,
    marginLeft: 4,
  },

  // Stats
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: -30,
    marginBottom: 14,
    elevation: 5,
    shadowColor: BLACK,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statDivider: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: BORDER,
  },

  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },

  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: BLACK,
  },

  statLabel: {
    fontSize: 12,
    color: GREY,
    marginTop: 2,
  },

  // Captain banner
  captainBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLUE,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },

  bannerCircle: {
    position: 'absolute',
    right: -40,
    top: -50,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: BLUE_DARK,
    opacity: 0.55,
  },

  tag: {
    alignSelf: 'flex-start',
    backgroundColor: BLUE_DARK,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },

  tagText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  captainTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },

  captainSub: {
    color: '#DCE8FF',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },

  captainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
  },

  captainBtnText: {
    color: BLUE,
    fontWeight: '800',
    fontSize: 12,
    marginRight: 6,
  },

  captainEmoji: {
    fontSize: 54,
    marginLeft: 6,
  },

  // Cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    marginBottom: 14,
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },

  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },

  infoBody: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingBottom: 4,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  infoIcon: {
    marginRight: 10,
  },

  infoLabel: {
    fontSize: 13,
    color: GREY,
  },

  infoValue: {
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
    fontSize: 13,
    fontWeight: '700',
    color: BLACK,
  },

  // Menu
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  noBorder: {
    borderBottomWidth: 0,
  },

  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: BLACK,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoutText: {
    color: RED,
    fontWeight: '800',
    fontSize: 15,
    marginLeft: 8,
  },

  version: {
    textAlign: 'center',
    fontSize: 11,
    color: GREY,
    marginTop: 14,
  },
});