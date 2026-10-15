import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const BLUE = '#1F6FE5';

export default function BrandLogo({ size = 36 }: { size?: number }) {
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.logo,
          { width: size, height: size, borderRadius: size * 0.3 },
        ]}>
        <Text style={[styles.logoText, { fontSize: size * 0.55 }]}>R</Text>
      </View>
      <Text style={styles.name}>RAPTOR</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center' },
  logo: {
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    elevation: 3,
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  logoText: { color: '#fff', fontWeight: '900' },
  name: { fontSize: 22, fontWeight: '900', color: '#0F172A', letterSpacing: 3 },
});