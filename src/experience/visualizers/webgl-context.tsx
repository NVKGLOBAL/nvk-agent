/**
 * Local WebGL capability hook.
 *
 * The vendored ResonanceVisualizerPanel imported `useWebGL` from CODEXA's
 * context directory. This is the same check, implemented here: a real probe —
 * create a canvas and ask for a WebGL2/WebGL context. No assertion, no stub.
 */
import { useEffect, useState } from 'react';

export function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

export function useWebGL(): { isWebGLSupported: boolean } {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(isWebGLSupported());
  }, []);
  return { isWebGLSupported: supported };
}
