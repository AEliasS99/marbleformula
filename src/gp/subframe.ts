import { createContext, useContext } from "react";

// Motion blur renders each video frame several times at slightly different
// moments and averages them. React can't re-render between those sub-frames,
// so everything that moves registers an imperative updater here: given a
// (fractional) video frame, it sets its objects' transforms directly.
// src/gp/Effects.tsx drives it.
//
// Each canvas (each <Stage>) has its own registry, so a canvas's sub-frames
// only move its own objects: with two canvases up (a split screen) the left
// one no longer moves the right one's marbles and camera, and vice versa.

type Updater = (videoFrame: number) => void;
export type Subframe = { subscribe(fn: Updater): () => void; apply(videoFrame: number): void };

export function createSubframe(): Subframe {
  const updaters = new Set<Updater>();
  return {
    subscribe(fn) {
      updaters.add(fn);
      return () => {
        updaters.delete(fn);
      };
    },
    apply(videoFrame) {
      for (const fn of updaters) fn(videoFrame);
    },
  };
}

export const SubframeContext = createContext<Subframe | null>(null);

/** The sub-frame registry of the canvas this component renders in (provided by <Stage>). */
export function useSubframe(): Subframe {
  const s = useContext(SubframeContext);
  if (!s) throw new Error("useSubframe() outside a <Stage>");
  return s;
}
