import { KNOWN_POSES, type KnownPose } from "@/generated/poses.js";

/**
 * Returns a uniformly random pose name from {@link KNOWN_POSES}.
 *
 * Handy for demos and randomised avatars: `api.render({ pose: randomPose(),
 * source })`. Draws only from the poses bundled with this SDK version.
 */
export function randomPose(): KnownPose {
  const index = Math.floor(Math.random() * KNOWN_POSES.length);
  return KNOWN_POSES[index] ?? KNOWN_POSES[0];
}
