// Fictional Wachau exhibition, authored for a single continuous marble descent.
// The long river straight opens into terrace bends, orchard esses and a wide
// town return. Regional scenery is implemented separately before registration.
// This is not a surveyed real-world course or a modification of a qualifier.
export default {
 id:'r12-wachau',gp:'Austria',title:'Wachau Valley Grand Prix',country:'Austria',
 location:'Wachau (stylised)',circuit:'Danube Terrace Descent',
 marbleSceneryProfile:'wachau-venue-v1',
 // Keep both the grid and the finish/run-off on the river straight. The
 // legacy auto selector checks only -26..14m, shorter than the finish offset.
 flag:['#c9343d','#f5f1e7','#c9343d'],seed:69,scale:.95,start:150,
 // Authored machine stations leave passing stretches between distinct events.
 // Distances below are final course units; placeLayout consumes outline units.
 // The sequence is fixed before simulation and never depends on the winner.
 exactLayout:true,
 layout:[
  ['rollers',45],['vortex',100],['splitter',165],['jump',225],
  ['hammer',285],['pegs',340],['turntable',400],['bumpers',455],
  ['splitter',515],['jump',575],['pusher',635],['fan',690],
  ['spinner',750],['rollers',805],['splitter',865],['jump',930],
  ['hammer',985],['bumps',1040],['bumpers',1095],['turntable',1150],
  ['pegs',1210],['splitter',1270],['jump',1335],['fan',1395],
  ['pusher',1450],['rollers',1510],['spinner',1565],['splitter',1625],
  ['jump',1690],['hammer',1750],['bumpers',1805],['turntable',1860],
 ].map(([type,u])=>[type,u/.95]),
 outline:[
  [-240,-160],[160,-160],[220,-145],[250,-115],[260,-70],
  [245,-30],[215,-5],[170,0],[130,-20],[95,-35],[65,-20],
  [55,15],[75,45],[110,60],[170,65],[205,90],[210,130],
  [190,160],[150,175],[100,175],[60,155],[25,130],[-10,125],
  [-40,145],[-45,180],[-30,215],[-55,250],[-100,260],
  [-145,245],[-180,210],[-200,170],[-225,140],[-250,100],
  [-255,50],[-240,10],[-210,-15],[-180,-20],[-160,-45],
  [-165,-80],[-200,-100],[-235,-110],[-255,-130],
 ],
};
