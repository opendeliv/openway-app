import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AdminHomeScreen from './AdminHomeScreen';
import AdminProfileScreen from './AdminProfileScreen';

const Tab = createBottomTabNavigator();
const BLUE = '#1F5EFF';

export default function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BLUE,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 12 },
        tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 6 },
      }}
    >
      <Tab.Screen
        name="AdminHome"
        component={AdminHomeScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>🏠</Text>
          ),
        }}
      />
      <Tab.Screen
        name="AdminProfile"
        component={AdminProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>👤</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}