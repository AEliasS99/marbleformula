// Motion blur renders each video frame several times at slightly different
// moments and averages them. React can't re-render between those sub-frames,
// so everything that moves registers an imperative updater here: given a
// (fractional) video frame, it sets its objects' transforms directly.
// src/gp/Effects.tsx drives it.

type Updater = (videoFrame: number) => void;
const updaters = new Set<Updater>();

export const subframe = {
  subscribe(fn: Updater) {
    updaters.add(fn);
    return () => {
      updaters.delete(fn);
    };
  },
  apply(videoFrame: number) {
    for (const fn of updaters) fn(videoFrame);
  },
};
