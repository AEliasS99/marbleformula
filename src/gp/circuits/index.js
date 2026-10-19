import monaco from "./r1-monaco.js";
import silverstone from "./r2-silverstone.js";
import spa from "./r3-spa.js";
import suzuka from "./r4-suzuka.js";
import monza from "./r5-monza.js";

// The season's circuits, in race order. Each file is a circuit's design: the
// real outline it is built from, its scale and seed, and its obstacle layout.
export const CIRCUITS = [monaco, silverstone, spa, suzuka, monza];
