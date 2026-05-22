import { ROBOT } from './constants.ts';

export const FL = 0;
export const FR = 1;
export const RL = 2;
export const RR = 3;

export interface WheelDef {
  name: 'FL' | 'FR' | 'RL' | 'RR';
  anchor: [number, number, number];
  isLeft: boolean;
}

export const WHEEL_DEFS: WheelDef[] = [
  {
    name: 'FL',
    anchor: [ROBOT.wheelFrontOffsetX, ROBOT.wheelOffsetY, -ROBOT.wheelFrontOffsetZ],
    isLeft: true,
  },
  {
    name: 'FR',
    anchor: [ROBOT.wheelFrontOffsetX, ROBOT.wheelOffsetY, ROBOT.wheelFrontOffsetZ],
    isLeft: false,
  },
  {
    name: 'RL',
    anchor: [-ROBOT.wheelRearOffsetX, ROBOT.wheelOffsetY, -ROBOT.wheelRearOffsetZ],
    isLeft: true,
  },
  {
    name: 'RR',
    anchor: [-ROBOT.wheelRearOffsetX, ROBOT.wheelOffsetY, ROBOT.wheelRearOffsetZ],
    isLeft: false,
  },
];
