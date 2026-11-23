/**
 * NVK Agent — orb node layout (v0.1.8).
 *
 * Retest #4 (2026-11-22) found only 2–3 of the 4 gateway labels visible
 * at once: the ring rotated (0.001/dtSim) and labels on the far side
 * faded out, so one node was always behind the central sphere. The fix
 * is geometry, not animation: the four nodes sit in a FIXED front arc —
 * every angle has a positive z, i.e. every node is on the camera side of
 * the core — and the ring never revolves. Drag still orbits the CAMERA
 * (OrbitControls), so the user can look around; the default view always
 * shows all four labels.
 *
 * v0.1.9: the ring OSCILLATES gently inside that front arc (±20°,
 * nodeOrbitOffset) — the WebSim original's drifting ring, translated
 * honestly. Oscillation, not revolution: the arc breathes between 15°
 * and 165° and never crosses the sphere plane, so no label can hide.
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

/**
 * v0.1.9: auto-orbit — the WebSim original's drifting node ring,
 * translated honestly. The ring OSCILLATES gently inside the front
 * arc: a slow sinusoid of ±20° around the fixed base angles, so the
 * effective arc breathes between 15° and 165° and every node stays
 * on the camera side (z > 0) at all times. It NEVER revolves: the
 * original's full revolution hides panels behind the sphere and
 * washes out their text — we do not copy that part.
 *
 * The renderer applies this as an ABSOLUTE group rotation
 * (rotation.y = offset), never an increment, so the arc can never
 * wind around the sphere. Period is ~105 s (angular speed
 * 0.06 rad/s): a slow drift, not a spin.
 */
export const ORBIT_AMPLITUDE_DEG = 20;

export const ORBIT_ANGULAR_SPEED_RAD_S = 0.06;

export const ORBIT_AMPLITUDE_RAD = (ORBIT_AMPLITUDE_DEG * Math.PI) / 180;

/** Ring rotation (radians) at a scene-clock time, in [-amplitude, +amplitude]. */
export function nodeOrbitOffset(elapsedSeconds: number): number {
  return ORBIT_AMPLITUDE_RAD * Math.sin(elapsedSeconds * ORBIT_ANGULAR_SPEED_RAD_S);
}

/**
 * Effective node angle (degrees) at a scene-clock time. A group
 * rotation.y of θ maps a node angle φ to φ − θ, so the offset
 * subtracts from the base angle.
 */
export function orbitedNodeAngleDeg(index: number, elapsedSeconds: number): number {
  const base = NODE_ARC_ANGLES_DEG[index % NODE_ARC_ANGLES_DEG.length];
  return base - (nodeOrbitOffset(elapsedSeconds) * 180) / Math.PI;
}

/** Node position with the auto-orbit applied — z > 0 at all times. */
export function orbitedNodePosition(
  index: number,
  elapsedSeconds: number,
  radius = NODE_RING_RADIUS,
): { x: number; y: number; z: number } {
  const deg = orbitedNodeAngleDeg(index, elapsedSeconds);
  const rad = (deg * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: 0, z: Math.sin(rad) * radius };
}
