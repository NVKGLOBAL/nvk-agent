/**
 * NVK Agent — orb node layout (v0.1.8).
 *
 * Retest #4 (2026-11-22) found only 2–3 of the 4 gateway labels visible
 * at once: the ring rotated (0.001/dtSim) and labels on the far side
 * faded out, so one node was always behind the central sphere. The fix
 * is geometry, not animation: the four nodes sit in a FIXED front arc —
 * every angle has a positive z, i.e. every node is on the camera side of
 * the core — and the ring never rotates. Drag still orbits the CAMERA
 * (OrbitControls), so the user can look around; the default view always
 * shows all four labels.
 *
 * Angles are measured from the +x axis in the x-z plane; the camera
 * sits at +z looking at the origin, so sin(angle) > 0 means "in front".
 */
export const NODE_ARC_ANGLES_DEG = [35, 70, 110, 145];

export const NODE_RING_RADIUS = 12;

export function nodePosition(index: number, radius = NODE_RING_RADIUS): {
  x: number;
  y: number;
  z: number;
} {
  const deg = NODE_ARC_ANGLES_DEG[index % NODE_ARC_ANGLES_DEG.length];
  const rad = (deg * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: 0, z: Math.sin(rad) * radius };
}
