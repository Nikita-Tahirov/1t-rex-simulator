import { PerformanceMonitor } from '@react-three/drei/core/PerformanceMonitor.js';
import { Preload } from '@react-three/drei/core/Preload.js';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { useEffect, useMemo, useState } from 'react';
import { ACESFilmicToneMapping, BasicShadowMap, PCFSoftShadowMap, SRGBColorSpace } from 'three';
import { OnScreenControls } from '@/hud/OnScreenControls.tsx';
import { Arena } from '@/physics/Arena.tsx';
import { ArenaSizeProvider } from '@/physics/ArenaSizeContext.tsx';
import { BattleRobot } from '@/physics/battle/BattleRobot.tsx';
import { clearBattlePoses } from '@/physics/battle/battleRobotRegistry.ts';
import { cornerSpawn } from '@/physics/battle/spawnPoints.ts';
import { FollowCamera } from '@/physics/FollowCamera.tsx';
import { SceneBackdrop } from '@/physics/SceneBackdrop.tsx';
import { SceneLighting } from '@/physics/SceneLighting.tsx';
import { useSimStore } from '@/store/sim-store.ts';
import { SIM_COLORS } from '@/theme/tokens.ts';
import { playerList } from '../net/lobby.ts';
import { BattleHud } from '../screens/BattleHud.tsx';
import { useNetSessionContext } from '../session/netSessionContext.ts';
import { useBattleOutcome } from '../session/useBattleOutcome.ts';
import { useIncomingDamage } from '../sync/useIncomingDamage.ts';
import { usePublishLocalState } from '../sync/usePublishLocalState.ts';
import { useRemoteRobots } from '../sync/useRemoteRobots.ts';
import { MATCH_TIMEOUT_MS } from './battleConfig.ts';
import {
  type BattleQuality,
  detectDevice,
  dprFromFactor,
  initialBattleQuality,
  MIN_BATTLE_DPR,
} from './battleQuality.ts';

/** Размер боевой арены — вдвое больше одиночной (36 м). */
export const BATTLE_ARENA_SIZE = 36;

/**
 * Боевая 3D-сцена сетевого режима: большая арена, по роботу на игрока (свой —
 * управляемый, чужие — интерполируемые), камера за своим роботом, оверлей-HUD.
 * Заменяет заглушку боя. Сеть (публикация позы, интерполяция, финал) подключена
 * хуками. Чисто-визуальные роботы → `<Physics paused>` держит лишь инертные
 * коллайдеры арены.
 */
export function NetBattleScene() {
  const session = useNetSessionContext();
  useBattleOutcome(session, MATCH_TIMEOUT_MS);
  usePublishLocalState(session);
  useBattleCamera();

  const { room, uid } = session;
  const countdownEnd = room?.meta.countdownEndsAt ?? 0;
  const [active, setActive] = useState(() => Date.now() >= countdownEnd);

  // Адаптивное качество: стартовый уровень по устройству, дальше DPR подстраивает
  // PerformanceMonitor по реальному FPS. На слабых/мобильных тени off с самого старта.
  const quality = useMemo<BattleQuality>(() => initialBattleQuality(detectDevice()), []);
  const [dpr, setDpr] = useState(quality.maxDpr);
  const [shadowsLive, setShadowsLive] = useState(quality.shadows);
  const shadowMapType = isFirefoxBrowser() ? BasicShadowMap : PCFSoftShadowMap;

  useEffect(() => {
    if (active) return;
    // setTimeout (даже на 0 мс) откладывает setState в макротаск — не синхронный
    // setState в effect (react-hooks/set-state-in-effect).
    const remaining = Math.max(0, countdownEnd - Date.now());
    const timer = setTimeout(() => setActive(true), remaining);
    return () => clearTimeout(timer);
  }, [countdownEnd, active]);

  useEffect(() => () => clearBattlePoses(), []);

  if (!room || !uid) return null;

  const configs = playerList(room.players).map((player) => {
    const corner = room.meta.corners[player.uid] ?? player.colorIndex;
    return {
      uid: player.uid,
      colorIndex: corner,
      isLocal: player.uid === uid,
      spawn: cornerSpawn(corner, BATTLE_ARENA_SIZE),
    };
  });

  return (
    <div className="absolute inset-0 z-20 bg-[var(--color-bg)]">
      <Canvas
        shadows={quality.shadows ? { type: shadowMapType } : false}
        dpr={dpr}
        gl={{ antialias: quality.antialias, powerPreference: 'high-performance', stencil: false }}
        camera={{ position: [8, 6, 12], fov: 50, near: 0.1, far: 400 }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace;
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.24;
        }}
      >
        <PerformanceMonitor
          onChange={({ factor }) => setDpr(dprFromFactor(factor, quality.maxDpr))}
          onFallback={() => {
            setShadowsLive(false);
            setDpr(MIN_BATTLE_DPR);
          }}
        />
        <color attach="background" args={[SIM_COLORS.sceneBackground]} />
        <ArenaSizeProvider size={BATTLE_ARENA_SIZE}>
          <Preload all />
          <SceneBackdrop />
          <SceneLighting castShadow={shadowsLive} shadowMapSize={quality.shadowMapSize} />
          <Physics timeStep={quality.physicsTimeStep} interpolate>
            <Arena trainingComplex={false} />
            {configs.map((config) => (
              <BattleRobot
                key={config.uid}
                config={config}
                arenaSize={BATTLE_ARENA_SIZE}
                active={active}
                physicsTier={quality.physicsTier}
              />
            ))}
          </Physics>
          <RemoteSync localUid={uid} />
          <FollowCamera />
        </ArenaSizeProvider>
      </Canvas>
      <BattleHud active={active} countdownEnd={countdownEnd} />
      <OnScreenControls />
    </div>
  );
}

function RemoteSync({ localUid }: { localUid: string }) {
  useRemoteRobots(localUid);
  useIncomingDamage(localUid);
  return null;
}

function isFirefoxBrowser(): boolean {
  return typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
}

/** Камера боя — вид из-за спины своего робота; восстанавливает режим при выходе. */
function useBattleCamera(): void {
  const setCameraMode = useSimStore((s) => s.setCameraMode);
  useEffect(() => {
    const previous = useSimStore.getState().cameraMode;
    setCameraMode('shoulder');
    return () => setCameraMode(previous);
  }, [setCameraMode]);
}
