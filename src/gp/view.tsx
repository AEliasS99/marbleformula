import { createContext, useContext } from "react";
import type { Race, View } from "./race";

// Which clock and camera a canvas uses. The full picture and the left half of a
// split use the race's own; the right half of a split brings its own (a replay
// runs in slow motion in the past). Everything that moves reads its time here.
export const ViewContext = createContext<View | null>(null);
export const useView = (race: Race): View => useContext(ViewContext) ?? race.mainView;
