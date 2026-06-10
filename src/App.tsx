import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { lazy, Suspense, useEffect } from 'react';
import { ACESFilmicToneMapping, BasicShadowMap, PCFSoftShadowMap, SRGBColorSpace } from 'three';
import { FpsCounter } from '@/hud/FpsCounter.tsx';
import { HudPanel } from '@/hud/HudPanel.tsx';
import { OnScreenControls } from '@/hud/OnScreenControls.tsx';
import { NetModeButton } from '@/netgame/NetModeButton.tsx';
import { useAppModeStore } from '@/netgame/store/appModeStore.ts';
import { Arena } from '@/physics/Arena.tsx';
import { ARENA, PHYSICS } from '@/physics/constants.ts';
import { FollowCamera } from '@/physics/FollowCamera.tsx';
import { LidarSensor } from '@/physics/LidarSensor.tsx';
import { LidarVisualizer } from '@/physics/LidarVisualizer.tsx';
import { Robot } from '@/physics/Robot.tsx';
import { SceneBackdrop } from '@/physics/SceneBackdrop.tsx';
import { SceneLighting } from '@/physics/SceneLighting.tsx';
import { SceneProbe } from '@/physics/SceneProbe.tsx';
import { SceneQuality } from '@/physics/SceneQuality.tsx';
import { useScenarioStore } from '@/store/scenario-store.ts';
import { useSimStore } from '@/store/sim-store.ts';
import { SIM_COLORS } from '@/theme/tokens.ts';

// ScenarioWrapper подключает 4 файла сценариев + manager. Не нужен на холодном
// старте симулятора (по умолчанию сценарий не запущен) — грузим лениво.
const ScenarioWrapper = lazy(() =>
  import('@/scenarios/ScenarioWrapper.tsx').then((m) => ({ default: m.ScenarioWrapper })),
);

// Сетевой режим грузится лениво и ТОЛЬКО при входе в него — в одиночке этот
// модуль (и Firebase) не импортируется, поэтому solo-сцена и e2e не меняются.
const NetGameRoot = lazy(() =>
  import('@/netgame/NetGameRoot.tsx').then((m) => ({ default: m.NetGameRoot })),
);

function App() {
  const paused = useSimStore((s) => s.paused);
  const currentScenarioId = useScenarioStore((s) => s.currentScenarioId);
  const appMode = useAppModeStore((s) => s.appMode);
  const leavingSolo = useAppModeStore((s) => s.leavingSolo);
  const enterNet = useAppModeStore((s) => s.enterNet);

  // Фаза 2 ухода из solo: к моменту этого passive-эффекта замороженный кадр
  // (`frameloop="never"` ниже, по `leavingSolo`) уже закоммичен и RAF-цикл
  // одиночной сцены остановлен. Следующим кадром размонтируем `<Physics>` —
  // тогда ни один useFrame не выполняется и освобождение Rapier-мира не гонится
  // с ними (иначе пачка «null pointer passed to rust» в консоли).
  useEffect(() => {
    if (!leavingSolo) return;
    const id = requestAnimationFrame(() => enterNet());
    return () => cancelAnimationFrame(id);
  }, [leavingSolo, enterNet]);

  // В сетевом режиме одиночная сцена размонтируется, а на её место встаёт
  // ленивый сетевой оверлей. Solo-ветка ниже остаётся неизменной.
  if (appMode === 'net') {
    return (
      <div className="relative h-full w-full">
        <Suspense fallback={null}>
          <NetGameRoot />
        </Suspense>
      </div>
    );
  }
  // PCFSoftShadowMap — мягкие тени для движущегося робота. На Firefox PCF-soft
  // упирается в багу draw-call-overhead на старых GPU → fallback на BasicShadowMap.
  const shadowMapType = isFirefoxBrowser() ? BasicShadowMap : PCFSoftShadowMap;

  return (
    <div className="relative h-full w-full">
      <Canvas
        // frameloop="never" в кадре заморозки перед уходом в сеть: останавливает
        // RAF/useFrame, чтобы unmount `<Physics>` не гонился с шагом Rapier.
        // В обычной одиночке leavingSolo=false → 'always' (поведение неизменно).
        frameloop={leavingSolo ? 'never' : 'always'}
        shadows={{ type: shadowMapType }}
        // dpr=[1, 1.25] — небольшой headroom между мобильными и desktop. На 1080p
        // визуальная разница между 1.25 и window.devicePixelRatio (1.5–2.0)
        // минимальна, а GPU shadow-pass и rasterization становятся заметно дешевле.
        // Adaptive DPR намеренно отключён: см. `SceneQuality`.
        dpr={[1, 1.25]}
        gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
        camera={{ position: [4, 3, 6], fov: 50, near: 0.1, far: 200 }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace;
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.24;
          gl.shadowMap.type = shadowMapType;
        }}
      >
        <color attach="background" args={[SIM_COLORS.sceneBackground]} />
        <SceneBackdrop />
        <SceneLighting />
        <SceneQuality />
        <SceneProbe />
        {/* Статичная сетка как простой gridHelper — не звенит при движении камеры */}
        <gridHelper
          args={[ARENA_GRID, ARENA_GRID, SIM_COLORS.gridMajor, SIM_COLORS.gridMinor]}
          position={[0, 0.001, 0]}
        />
        <Physics
          gravity={[0, PHYSICS.gravity, 0]}
          timeStep={PHYSICS.timestep}
          paused={paused}
          // interpolation=true (default) — сглаживает рендер между fixed-physics
          // тиками; критично на 120/144 Гц мониторах, где physics 60 Гц иначе
          // даёт visible jitter. Явно прописано для самодокументируемости.
          interpolate
          // numSolverIterations=8 (было 12) + PgsIterations=1 — для одного 4WD
          // + spinner + ≤10 препятствий это достаточная стабильность; снижение
          // даёт ≈25 % speedup на solver-pass (~6→4.5 ms на физ-кадр).
          numSolverIterations={8}
          numInternalPgsIterations={1}
          // updatePriority=-50 — physics обновляется ДО render (default behavior
          // в r3f-rapier, явное указание для устойчивости при будущих
          // апгрейдах библиотеки).
          updatePriority={-50}
        >
          <Arena />
          <Robot />
          <LidarSensor />
          <LidarVisualizer />
          <Suspense fallback={null}>
            <ScenarioWrapper scenarioId={currentScenarioId} />
          </Suspense>
        </Physics>
        <FollowCamera />
      </Canvas>
      <FpsCounter />
      <HudPanel />
      <OnScreenControls />
      <NetModeButton />
    </div>
  );
}

const ARENA_GRID = ARENA.size + 6;

function isFirefoxBrowser(): boolean {
  return typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
}

export default App;
