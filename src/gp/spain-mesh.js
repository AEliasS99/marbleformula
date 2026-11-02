import {buildSceneryMeshes} from './scenery-mesh.js';
import {spanishScenery,SPAIN_MATERIALS} from './spain-scenery.js';
export const buildSpainMeshes=samples=>buildSceneryMeshes(spanishScenery(samples).parts,SPAIN_MATERIALS);
