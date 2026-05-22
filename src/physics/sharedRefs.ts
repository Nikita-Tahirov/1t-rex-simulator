import type { RapierRigidBody } from '@react-three/rapier';

/**
 * Module-level singleton-ссылка на RigidBody шасси робота.
 *
 * Используется компонентами, которым нужен доступ к шасси без проброса
 * пропсов через дерево (Spinner, ScenarioWrapper, и т.п.). Это «мягкий»
 * singleton — допустим, потому что на сцене ровно один робот.
 *
 * Robot.tsx устанавливает этот ref при mount; читатели проверяют .current
 * на null перед использованием.
 */
export const robotChassisRef: { current: RapierRigidBody | null } = {
  current: null,
};
