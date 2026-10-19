import { getInputProps } from "remotion";

// The art direction, switchable per render with --props='{"look":"night"}':
//   day    outdoor circuit: sky HDRI, sun, grass, grandstands
//   night  a dark studio: black polished floor, dark brushed-metal track,
//          neon strips along the walls, studio softboxes in the reflections
export type LookName = "day" | "night";
export function lookName(): LookName {
  const p = getInputProps() as { look?: string };
  return p.look === "day" ? "day" : p.look === "night" ? "night" : DEFAULT_LOOK;
}
export const DEFAULT_LOOK: LookName = "night";
export const isNight = () => lookName() === "night";
