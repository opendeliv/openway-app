import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { adminApi } from '../services/api'; // path adjust

export const BLUE = '#1F5EFF';
export const NAVY = '#0B1B3F';
export const GREY = '#6B7280';
export const BORDER = '#E2E8F0';
export const RED = '#D93025';
export const GREEN = '#16A34A';
export const ORANGE = '#D97706';

type Filter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

export type Captain = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  profilePhoto?: string | null;
  dateOfBirth: string | null;
  serviceType: string;
  vehicleType: string;
  vehicleNumber: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  pickupRangeKm: number;
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'VERIFIED';
  status: string;
  rejectionReason: string | null;
  createdAt: string;
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

const AVATAR_COLORS = ['#1F5EFF', '#7C3AED', '#0891B2', '#DB2777', '#059669', '#EA580C'];

export function statusStyle(s: string) {
  if (s === 'APPROVED' || s === 'VERIFIED') return { bg: '#DCFCE7', fg: GREEN, text: 'Approved' };
  if (s === 'REJECTED') return { bg: '#FEE2E2', fg: RED, text: 'Rejected' };
  return { bg: '#FEF3C7', fg: ORANGE, text: 'Pending' };
}

export function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

export function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// Profile photo ho to wahi dikhega, warna default person avatar
export function Avatar({ name, uri, size = 48 }: { name?: string; uri?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[box, { backgroundColor: '#E2E8F0' }]}
        onError={() => setFailed(true)}
      />
    );
  }

  // Default avatar: grey-blue circle + head + shoulders
  const head = size * 0.34;
  return (
    <View style={[box, { backgroundColor: '#DCE4F2', overflow: 'hidden', alignItems: 'center' }]}>
      <View
        style={{
          width: head,
          height: head,
          borderRadius: head / 2,
          backgroundColor: '#9AA9C4',
          marginTop: size * 0.2,
        }}
      />
      <View
        style={{
          width: size * 0.74,
          height: size * 0.74,
          borderRadius: size * 0.37,
          backgroundColor: '#9AA9C4',
          marginTop: size * 0.06,
        }}
      />
    </View>
  );
}

function genderLabel(g: string | null) {
  if (!g) return '-';
  const v = g.toLowerCase();
  if (v.startsWith('m')) return '♂ Male';
  if (v.startsWith('f')) return '♀ Female';
  return g;
}

export default function AdminHomeScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [items, setItems] = useState<Captain[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (f: Filter, isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const [s, l] = await Promise.all([
        adminApi.stats(),
        adminApi.captains(f === 'ALL' ? undefined : f),
      ]);
      setStats(s);
      setItems(l.items ?? []);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Kuch gadbad ho gayi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Detail screen se approve/reject karke wapas aane par list auto refresh
  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [filter, load]),
  );

  const header = (
    <View>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>Captain requests aur status</Text>
        </View>
        <View style={styles.adminPill}>
          <Text style={styles.adminPillText}>ADMIN</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Pending" value={stats.pending} color={ORANGE} bg="#FFF7E6" />
        <StatCard label="Approved" value={stats.approved} color={GREEN} bg="#ECFDF3" />
        <StatCard label="Rejected" value={stats.rejected} color={RED} bg="#FEF2F2" />
        <StatCard label="Total" value={stats.total} color={BLUE} bg="#EEF3FF" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>
        {items.length} {items.length === 1 ? 'request' : 'requests'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 80 }} color={BLUE} size="large" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(filter, true)} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🗂️</Text>
              <Text style={styles.empty}>Koi captain nahi mila</Text>
            </View>
          }
          renderItem={({ item }) => {
            const st = statusStyle(item.verificationStatus);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('CaptainDetail', { captain: item })}
              >
                <Avatar name={item.name} uri={item.profilePhoto} />
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.badgeText, { color: st.fg }]}>{st.text}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardPhone}>📞 {item.phone}</Text>
                  <View style={styles.tagsRow}>
                    <Tag text={genderLabel(item.gender)} />
                    <Tag text={item.serviceType} />
                    <Tag text={`🚗 ${item.vehicleType}`} />
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FB' },
  listContent: { padding: 18, paddingBottom: 40 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '900', color: NAVY },
  subtitle: { fontSize: 14, color: GREY, marginTop: 2 },
  adminPill: { backgroundColor: NAVY, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  adminPillText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  stat: {
    width: '23.5%',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, color: GREY, fontWeight: '600', marginTop: 2 },

  filters: { marginBottom: 14 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 8,
  },
  chipActive: { backgroundColor: BLUE, borderColor: BLUE },
  chipText: { fontSize: 13, fontWeight: '700', color: GREY },
  chipTextActive: { color: '#fff' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: GREY, marginBottom: 10 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#0B1B3F',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardBody: { flex: 1, marginLeft: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 15, fontWeight: '800', color: NAVY, flex: 1, marginRight: 8 },
  cardPhone: { fontSize: 12.5, color: GREY, marginTop: 2 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 7, gap: 6 },
  tag: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 120 },
  tagText: { fontSize: 11, color: '#334155', fontWeight: '600' },
  chevron: { fontSize: 26, color: '#CBD5E1', marginLeft: 6 },

  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '800' },

  emptyWrap: { alignItems: 'center', marginTop: 50 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  empty: { textAlign: 'center', color: GREY, fontSize: 14 },
});