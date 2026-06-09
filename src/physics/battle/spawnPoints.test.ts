import { describe, expect, it } from 'vitest';
import { cornerSpawn } from './spawnPoints.ts';

describe('cornerSpawn', () => {
  it('размещает 4 угла внутри арены с отступом от стен', () => {
    const arena = 36;
    const reach = arena / 2 - 3.5; // 14.5
    expect(cornerSpawn(0, arena)).toMatchObject({ x: -reach, z: -reach });
    expect(cornerSpawn(1, arena)).toMatchObject({ x: reach, z: -reach });
    expect(cornerSpawn(2, arena)).toMatchObject({ x: -reach, z: reach });
    expect(cornerSpawn(3, arena)).toMatchObject({ x: reach, z: reach });
  });

  it('нос робота смотрит в центр арены', () => {
    const spawn = cornerSpawn(0, 36); // СЗ угол (-,-)
    // forward к центру: (cos yaw, sin yaw) должен быть направлен в (+,+)
    expect(Math.cos(spawn.yaw)).toBeGreaterThan(0);
    expect(Math.sin(spawn.yaw)).toBeGreaterThan(0);
  });

  it('отступ масштабируется с размером арены', () => {
    expect(cornerSpawn(3, 18)).toMatchObject({ x: 5.5, z: 5.5 });
  });
});
