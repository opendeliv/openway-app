import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';

// ---------- Scroll pe hide/show logic (isi file me) ----------

// 0 = tab bar dikh raha hai, 1 = hide
const tabBarHideAnim = new Animated.Value(0);
let hidden = false;

export function setTabBarHidden(next: boolean) {
  if (next === hidden) return;
  hidden = next;
  Animated.timing(tabBarHideAnim, {
    toValue: next ? 1 : 0,
    duration: 220,
    useNativeDriver: true,
  }).start();
}

// Kisi bhi ScrollView / FlatList me lagao:
//   const onScroll = useHideTabBarOnScroll();
//   <FlatList onScroll={onScroll} scrollEventThrottle={16} ... />
export function useHideTabBarOnScroll() {
  const lastY = useRef(0);

  return useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = Math.max(0, e.nativeEvent.contentOffset.y);
    const dy = y - lastY.current;

    if (y <= 10) {
      setTabBarHidden(false); // sabse upar
    } else if (dy > 8) {
      setTabBarHidden(true);
    } else if (dy < -8) {
      setTabBarHidden(false);
    }
    lastY.current = y;
  }, []);
}

// ---------- Tab bar ----------

export default function AppTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const barHeight = 62 + insets.bottom;

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          height: barHeight,
          paddingBottom: insets.bottom,
          transform: [
            {
              translateY: tabBarHideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, barHeight + 20],
              }),
            },
          ],
        },
      ]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? colors.primary : colors.muted;
        const label =
          typeof options.title === 'string' ? options.title : route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name as never);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={onPress}
            onLongPress={() =>
              navigation.emit({ type: 'tabLongPress', target: route.key })
            }
            style={styles.item}>
            {options.tabBarIcon?.({ focused, color, size: 24 })}
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingTop: 6,
    backgroundColor: '#fff',
    borderTopWidth: 0,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
});