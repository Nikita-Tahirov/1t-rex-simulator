import { MotorModel as JointMotorModel } from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import {
  type ContactForcePayload,
  CylinderCollider,
  type RapierRigidBody,
  RigidBody,
  useRevoluteJoint,
} from '@react-three/rapier';
import { type RefObject, Suspense, useEffect, useRef } from 'react';
import { BATTLE_LOCAL_ROTOR_GROUPS } from '../collisionGroups.ts';
import { ROBOT } from '../constants.ts';
import { RobotSpinnerModel } from '../RobotSpinnerModel.tsx';
import { addDealtDamage } from './battleCombat.ts';
import { passesContactCooldown, rotorContactDamage } from './battleContactDamage.ts';
import { readBattleUserData } from './battleUserData.ts';

/**
 * Физический ротор боевого робота (только у ЛОКАЛЬНОГО): вертикальный диск 8 кг на
 * RevoluteJoint с motor velocity (управляется R/F через `getRpm`). Реально контактирует
 * с корпусами соперников (кинематические прокси) → урон по контактной силе пишется в
 * накопитель `dealt`. Собственного корпуса не задевает (см. боевые collision-группы).
 */

interface Props {
  chassisRef: RefObject<RapierRigidBody | null>;
  /** Мировая стартовая поза диска (chassis spawn + повёрнутый офсет ротора). */
  worldSpawn: { x: number; y: number; z: number };
  /** Стартовый кватернион (совпадает с шасси, чтобы joint не «выстрелил»). */
  spawnQuat: [number, number, number, number];
  getRpm: () => number;
  spinnerColor: string;
}

const MOTOR_FACTOR = 80;

export function BattleRotor({ chassisRef, worldSpawn, spawnQuat, getRpm, spinnerColor }: Props) {
  const diskRef = useRef<RapierRigidBody>(null!);
  const lastHitAt = useRef(new Map<string, number>());

  const joint = useRevoluteJoint(chassisRef as RefObject<RapierRigidBody>, diskRef, [
    [ROBOT.spinnerOffsetX, ROBOT.spinnerOffsetY, 0],
    [0, 0, 0],
    [0, 0, 1],
  ]);

  useEffect(() => {
    joint.current?.configureMotorModel(JointMotorModel.AccelerationBased);
  }, [joint]);

  useFrame(() => {
    const j = joint.current;
    if (!j) return;
    const omega = (getRpm() * 2 * Math.PI) / 60;
    j.configureMotorVelocity(omega, MOTOR_FACTOR);
  });

  const onContactForce = (payload: ContactForcePayload) => {
    const ud = readBattleUserData(payload.other.rigidBodyObject?.userData);
    if (ud.role !== 'battle-robot' || !ud.uid) return;
    const dmg = rotorContactDamage(getRpm(), payload.maxForceMagnitude);
    if (dmg <= 0) return;
    if (passesContactCooldown(lastHitAt.current, ud.uid, performance.now())) {
      addDealtDamage(ud.uid, dmg);
    }
  };

  return (
    <RigidBody
      ref={diskRef}
      colliders={false}
      position={[worldSpawn.x, worldSpawn.y, worldSpawn.z]}
      quaternion={spawnQuat}
      mass={ROBOT.spinnerMass}
      friction={0.4}
      restitution={0.1}
      linearDamping={0}
      angularDamping={0.001}
      userData={{ role: 'battle-rotor' }}
      ccd
      onContactForce={onContactForce}
    >
      <CylinderCollider
        args={[ROBOT.spinnerThickness / 2, ROBOT.spinnerRadius]}
        rotation={[Math.PI / 2, 0, 0]}
        collisionGroups={BATTLE_LOCAL_ROTOR_GROUPS}
      />
      <Suspense fallback={null}>
        <RobotSpinnerModel spinnerColor={spinnerColor} />
      </Suspense>
    </RigidBody>
  );
}
