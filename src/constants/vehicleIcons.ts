import { ImageSourcePropType } from 'react-native';

const walk = require('./walk.png');
const cycle = require('./cycle.png');
const bike = require('./bike.png');
const scooty = require('./scooty.png');
const auto = require('./auto.png');
const eauto = require('./e_auto.png');
const ace = require('./tata_ace.png');
const pickup = require('./pickup.png');

export const VEHICLE_ICONS: Record<string, ImageSourcePropType | undefined> = {
  walk, cycle, bike, scooty, auto, eauto, ace, pickup,
  pwalk: walk,
  pcycle: cycle,
  pbike: bike,
  pauto: auto,
  gauto: auto,
};