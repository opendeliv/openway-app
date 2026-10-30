import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { adminApi, clearToken } from '..//services/api'; // clearToken: apna logout/token hatane wala function

const BLUE = '#1F5EFF';
const NAVY = '#0B1B3F';
const GREY = '#6B7280';
const BORDER = '#E2E8F0';
const RED = '#D93025';

export default function AdminProfileScreen() {
  const navigation = useNavigation();
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .me()
      .then(setMe)
      .catch((e: any) => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, []);

  const onLogout = () => {
    Alert.alert('Logout', 'Logout karna hai?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await clearToken();
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }),
          );
        },
      },
    ]);
  };

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 80 }} color={BLUE} size="large" />;
  }

  const rows: [string, string][] = [
    ['Phone', `+91 ${me?.phone ?? '-'}`],
    ['Email', me?.email ?? '-'],
    ['Role', me?.role ?? '-'],
    ['Joined', me?.createdAt ? String(me.createdAt).slice(0, 10) : '-'],
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(me?.name ?? 'A').charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{me?.name ?? 'Admin'}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>ADMIN</Text>
        </View>
      </View>

      <View style={styles.card}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.key}>{k}</Text>
            <Text style={styles.val}>{v}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.logout} onPress={onLogout} activeOpacity={0.85}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FB', padding: 18 },
  top: { alignItems: 'center', marginTop: 20, marginBottom: 24 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '900' },
  name: { fontSize: 22, fontWeight: '900', color: NAVY, marginTop: 12 },
  roleBadge: { backgroundColor: '#EAF1FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  roleText: { color: BLUE, fontWeight: '800', fontSize: 12, letterSpacing: 1 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  key: { fontSize: 14, color: GREY, fontWeight: '600' },
  val: { fontSize: 15, color: NAVY, fontWeight: '700' },

  logout: {
    marginTop: 24,
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { color: RED, fontWeight: '800', fontSize: 16 },
});