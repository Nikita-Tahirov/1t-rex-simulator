import { useEffect, useRef, useState } from 'react';
import { ROBOT_MAX_HEALTH } from '@/physics/robotDamage.ts';
import { applyRobotDamage } from '@/store/robotIntegrity.ts';
import { telemetry } from '@/store/telemetry.ts';
import { isParticipantAlive, playersByJoinOrder } from '../net/match.ts';
import { useNetSessionContext } from '../session/netSessionContext.ts';
import { NET_STRINGS } from '../strings.ts';
import { ColorDot } from './shared.tsx';

/**
 * Оверлей боя: здоровье своего робота (сэмплинг через rAF, чтобы не перерендеривать
 * на каждый physics-тик), полоски соперников, счётчик живых, обратный отсчёт и
 * кнопки капитуляции/выхода. Рендерится поверх Canvas (DOM).
 */
const HEALTH_SAMPLE_MS = 120;

export function BattleHud({ active, countdownEnd }: { active: boolean; countdownEnd: number }) {
  const { room, uid, leaveRoom } = useNetSessionContext();
  const { health: selfHealth, now } = useBattleClock();

  if (!room || !uid) return null;

  const players = playersByJoinOrder(room.players);
  const opponents = players.filter((player) => player.uid !== uid);
  const aliveCount = players.filter((player) => isParticipantAlive(player.uid, room.states)).length;
  const selfAlive = selfHealth > 0 && isParticipantAlive(uid, room.states);
  const countdown = active ? 0 : Math.max(0, Math.ceil((countdownEnd - now) / 1000));

  // Капитуляция = робот уничтожен: обнуляем здоровье через модель урона. Цикл
  // публикации (usePublishLocalState) сам разошлёт смерть; разовый publishState
  // здесь был бы перезатёрт следующим тиком из telemetry.
  const surrender = () => {
    applyRobotDamage({
      amount: ROBOT_MAX_HEALTH * 2,
      source: 'impact',
      nowMs: performance.now(),
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {countdown > 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-mono text-6xl text-[var(--color-text)] drop-shadow-lg">
            {countdown}
          </span>
        </div>
      )}

      {/* top-center: не конфликтует с тач-управлением (слева) и соперниками (справа). */}
      <div className="sim-panel pointer-events-auto absolute top-4 left-1/2 w-56 -translate-x-1/2 p-3">
        <p className="mb-1 text-xs text-[var(--color-text-dim)]">{NET_STRINGS.battleYouHealth}</p>
        <HealthBar ratio={selfHealth / ROBOT_MAX_HEALTH} />
        <p className="mt-2 text-xs text-[var(--color-text-dim)]">
          {NET_STRINGS.battleAliveCount(aliveCount, players.length)}
        </p>
      </div>

      <div className="sim-panel pointer-events-auto absolute top-4 right-4 w-56 p-3">
        <p className="mb-2 text-xs text-[var(--color-text-dim)]">{NET_STRINGS.battleOpponents}</p>
        <ul className="flex flex-col gap-2">
          {opponents.map((opponent) => {
            const health = room.states[opponent.uid]?.health ?? ROBOT_MAX_HEALTH;
            const alive = isParticipantAlive(opponent.uid, room.states);
            return (
              <li key={opponent.uid} className="flex items-center gap-2">
                <ColorDot index={opponent.colorIndex} />
                <span className={`w-16 truncate text-xs ${alive ? '' : 'line-through opacity-50'}`}>
                  {opponent.name}
                </span>
                <span className="flex-1">
                  <HealthBar ratio={health / ROBOT_MAX_HEALTH} />
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="pointer-events-auto absolute bottom-4 right-4 flex gap-2">
        {active && selfAlive && (
          <button
            type="button"
            className="sim-control px-3 py-1.5 text-sm"
            data-testid="surrender"
            onClick={surrender}
          >
            {NET_STRINGS.battleLeave}
          </button>
        )}
        <button type="button" className="sim-control px-3 py-1.5 text-sm" onClick={leaveRoom}>
          {NET_STRINGS.lobbyLeave}
        </button>
      </div>
    </div>
  );
}

function HealthBar({ ratio }: { ratio: number }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const color =
    clamped > 0.55
      ? 'var(--color-ok)'
      : clamped > 0.25
        ? 'var(--color-warn)'
        : 'var(--color-danger)';
  return (
    <span className="block h-2 w-full overflow-hidden rounded bg-[var(--surface-raised-bg)]">
      <span
        className="block h-full rounded transition-[width]"
        style={{ width: `${clamped * 100}%`, backgroundColor: color }}
      />
    </span>
  );
}

/**
 * Сэмплирует здоровье и текущее время через rAF (не в рендере — иначе нарушается
 * `react-hooks/purity` для `Date.now()`). Троттлинг до ~8 Гц, чтобы не
 * перерендеривать HUD на каждый кадр.
 */
function useBattleClock(): { health: number; now: number } {
  const [state, setState] = useState(() => ({ health: telemetry.robotHealth, now: clockNow() }));
  const lastSample = useRef(0);
  useEffect(() => {
    let raf = 0;
    const tick = (frameTime: number) => {
      if (frameTime - lastSample.current >= HEALTH_SAMPLE_MS) {
        lastSample.current = frameTime;
        setState({ health: telemetry.robotHealth, now: clockNow() });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return state;
}

function clockNow(): number {
  return Date.now();
}
