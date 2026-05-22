import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

declare global {
  interface Window {
    __sceneRenderState?: {
      frame: number;
      meshCount: number;
      renderCalls: number;
      triangles: number;
    };
  }
}

export function SceneProbe() {
  const frame = useRef(0);

  useFrame(({ gl, scene }) => {
    frame.current += 1;
    if (frame.current % 30 !== 0) return;

    let meshCount = 0;
    scene.traverse((object) => {
      if (object.visible && object.type === 'Mesh') meshCount += 1;
    });

    window.__sceneRenderState = {
      frame: frame.current,
      meshCount,
      renderCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    };
  });

  return null;
}
