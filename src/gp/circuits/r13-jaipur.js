// A new Indian exhibition within the existing GrandPrix production. Distances
// and route choices are authored before fixed seed70, never tuned to a winner.
export default {
 id:'r13-jaipur',gp:'India',title:'Jaipur Pink City Grand Prix',country:'India',
 location:'Jaipur inspired exhibition',circuit:'Palace Gates & Shortcut Run',
 marbleSceneryProfile:'jaipur-venue-v1',flag:['#ff9933','#ffffff','#138808'],
 seed:70,scale:1,start:155,exactLayout:true,
 layout:[
  ['roller-bank',45],['route-choice',95],['vortex',160],['single-lane',225],
  ['hammer',285],['roller-bank',352],['route-choice',410],['jump',480],
  ['single-lane',559],['pusher',610],['roller-bank',673],{type:'route-choice',u:745,intakeSide:1},
  ['turntable',800],['single-lane',855],['spinner',920],['roller-bank',978],
  {type:'route-choice',u:1053,intakeSide:-1},['jump',1120],['single-lane',1180],['hammer',1240],
  ['roller-bank',1310],{type:'route-choice',u:1365,intakeSide:-1},['pegs',1430],['single-lane',1483],
  ['pusher',1564],['roller-bank',1625],['route-choice',1690],['jump',1760],
  ['single-lane',1803],['spinner',1885],
 ],
 outline:[[-265,-170],[165,-170],[230,-145],[265,-105],[270,-55],
  [245,-10],[195,5],[145,-10],[105,-35],[65,-25],[45,15],[70,55],
  [125,75],[185,80],[225,110],[225,155],[190,190],[140,205],
  [85,190],[40,160],[-5,150],[-45,175],[-50,220],[-85,260],
  [-140,270],[-190,245],[-220,205],[-235,155],[-270,110],
  [-285,55],[-265,5],[-225,-25],[-185,-30],[-170,-65],
  [-200,-100],[-250,-115],[-285,-140]],
};
