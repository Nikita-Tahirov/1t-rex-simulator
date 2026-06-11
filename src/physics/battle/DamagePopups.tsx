import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Group, Quaternion } from 'three';
import { Text } from 'troika-three-text';
import { DAMAGE_EFFECT_COLORS, SIM_COLORS } from '@/theme/tokens.ts';
import { ARENA_TEXT_FONT_URL } from '../arena/arenaData.ts';
import { drainHits, type HitEvent } from './battleHitFeed.ts';
import { battlePoses } from './battleRobotRegistry.ts';

/**
 * Всплывающие числа урона (MMO-стиль) в боевой 3D-сцене: каждый удар из
 * hit-ленты ({@link drainHits}) показывается числом над роботом — жёлтое для
 * нанесённого мной (`dealt`, над жертвой), красное для полученного (`taken`,
 * над своим роботом). Число взлетает и тает за {@link POPUP_TTL_MS}.
 *
 * Императивный пул troika `Text` (без setState и аллокаций в кадре, инвариант
 * hot-path): фиксированные слоты переиспользуются по кругу, текст/цвет меняются
 * только при активации (редкие события — кулдауны урона ≥200 мс), per-frame
 * обновляются лишь позиция, билборд-кватернион и прозрачность материала.
 * Мутации пула живут в module-функциях (как `dealMeleeDamage` с переданными
 * Map) — компонент только владеет ref'ами.
 */

const POPUP_POOL = 8;
const POPUP_TTL_MS = 900;
/** Подъём числа за время жизни, м. */
const POPUP_RISE_M = 1.0;
/** Высота появления над центром робота, м. */
const POPUP_BASE_Y_M = 1.05;
/** Доля TTL, после которой начинается затухание. */
const POPUP_FADE_FROM = 0.55;
const POPUP_FONT_SIZE = 0.36;
/** Боковой разброс точек появления, м — серийные тики не сливаются в одно число. */
const POPUP_JITTER_M = 0.55;

interface PopupSlot {
  mesh: Text;
  bornAt: number;
  x: number;
  baseY: number;
  z: number;
  active: boolean;
}

function makePopupText(): Text {
  const mesh = new Text();
  mesh.font = ARENA_TEXT_FONT_URL;
  mesh.fontSize = POPUP_FONT_SIZE;
  mesh.anchorX = 'center';
  mesh.anchorY = 'middle';
  mesh.outlineWidth = 0.03;
  mesh.outlineColor = SIM_COLORS.deepBackground;
  mesh.visible = false;
  // Число обязано читаться поверх корпусов/стен (как HUD), иначе попадание
  // по сопернику прячется за своим же роботом при камере «со спины».
  mesh.renderOrder = 10;
  if (!Array.isArray(mesh.material)) {
    mesh.material.depthTest = false;
    mesh.material.transparent = true;
  }
  return mesh;
}

/** Создаёт пул слотов и подвешивает мэши в группу сцены. */
function createPopupPool(group: Group): PopupSlot[] {
  const slots: PopupSlot[] = [];
  for (let i = 0; i < POPUP_POOL; i += 1) {
    const slot: PopupSlot = {
      mesh: makePopupText(),
      bornAt: 0,
      x: 0,
      baseY: 0,
      z: 0,
      active: false,
    };
    group.add(slot.mesh);
    slots.push(slot);
  }
  return slots;
}

function disposePopupPool(group: Group, slots: PopupSlot[]): void {
  for (const slot of slots) {
    group.remove(slot.mesh);
    slot.mesh.dispose();
  }
}

/** Активирует по слоту на каждое событие урона (round-robin по пулу). */
function spawnPopups(
  slots: PopupSlot[],
  hits: readonly HitEvent[],
  cursor: { current: number },
  now: number,
): void {
  for (const hit of hits) {
    const pose = battlePoses.get(hit.uid);
    if (!pose) continue;
    const slot = slots[cursor.current % POPUP_POOL]!;
    cursor.current += 1;
    slot.mesh.text = `−${Math.max(1, Math.round(hit.amount))}`;
    slot.mesh.color =
      hit.kind === 'taken' ? DAMAGE_EFFECT_COLORS.scorch : DAMAGE_EFFECT_COLORS.sparkWarm;
    slot.x = pose.x + (Math.random() - 0.5) * POPUP_JITTER_M;
    slot.z = pose.z + (Math.random() - 0.5) * POPUP_JITTER_M;
    slot.baseY = pose.y + POPUP_BASE_Y_M;
    slot.bornAt = now;
    slot.active = true;
    slot.mesh.visible = true;
    slot.mesh.sync();
  }
}

/** Подъём, билборд к камере и затухание активных чисел; истёкшие гаснут. */
function animatePopups(slots: PopupSlot[], now: number, cameraQuaternion: Quaternion): void {
  for (const slot of slots) {
    if (!slot.active) continue;
    const t = (now - slot.bornAt) / POPUP_TTL_MS;
    if (t >= 1) {
      slot.active = false;
      slot.mesh.visible = false;
      continue;
    }
    const rise = POPUP_RISE_M * (1 - (1 - t) * (1 - t)); // ease-out
    slot.mesh.position.set(slot.x, slot.baseY + rise, slot.z);
    slot.mesh.quaternion.copy(cameraQuaternion); // билборд к камере
    setPopupOpacity(
      slot.mesh,
      t < POPUP_FADE_FROM ? 1 : 1 - (t - POPUP_FADE_FROM) / (1 - POPUP_FADE_FROM),
    );
  }
}

function setPopupOpacity(mesh: Text, value: number): void {
  if (!Array.isArray(mesh.material)) mesh.material.opacity = value;
}

export function DamagePopups() {
  const groupRef = useRef<Group>(null);
  // Пул живёт вне React-дерева (мэши добавляются в group императивно) — его
  // можно мутировать из useFrame без setState (инвариант hot-path).
  const slotsRef = useRef<PopupSlot[]>([]);
  const cursor = useRef(0);
  const scratch = useRef<HitEvent[]>([]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const slots = createPopupPool(group);
    slotsRef.current = slots;
    return () => {
      slotsRef.current = [];
      disposePopupPool(group, slots);
    };
  }, []);

  useFrame(({ camera }) => {
    const slots = slotsRef.current;
    if (slots.length === 0) return;
    const now = performance.now();
    drainHits(scratch.current);
    spawnPopups(slots, scratch.current, cursor, now);
    animatePopups(slots, now, camera.quaternion);
  });

  return <group ref={groupRef} />;
}
