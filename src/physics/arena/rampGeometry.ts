import { BufferAttribute, BufferGeometry } from 'three';
import type { RampDirection, Vec3 } from './types.ts';

export const RAMP_TRIANGLE_INDICES = [
  0, 2, 3, 0, 3, 1, 2, 5, 3, 2, 4, 5, 0, 1, 5, 0, 5, 4, 0, 4, 2, 1, 3, 5,
] as const;

export function createRampVertices([length, width, height]: Vec3): Float32Array {
  const halfLength = length / 2;
  const halfWidth = width / 2;

  return new Float32Array([
    -halfLength,
    0,
    -halfWidth,
    -halfLength,
    0,
    halfWidth,
    halfLength,
    0,
    -halfWidth,
    halfLength,
    0,
    halfWidth,
    halfLength,
    height,
    -halfWidth,
    halfLength,
    height,
    halfWidth,
  ]);
}

export function createRampGeometry(size: Vec3): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(createRampVertices(size), 3));
  geometry.setIndex(new BufferAttribute(new Uint16Array(RAMP_TRIANGLE_INDICES), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function rampDirectionRotation(direction: RampDirection): Vec3 {
  switch (direction) {
    case 'negX':
      return [0, Math.PI, 0];
    case 'posZ':
      return [0, -Math.PI / 2, 0];
    case 'negZ':
      return [0, Math.PI / 2, 0];
    case 'posX':
      return [0, 0, 0];
  }
}

export function rampSlopeDeg([length, , height]: Vec3): number {
  return (Math.atan2(height, length) * 180) / Math.PI;
}
