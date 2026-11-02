// Fictional exhibition road, outside the official championship. Built with the
// existing course, driver, scenery and segmented GrandPrix production pipeline.
export default {
 id:'r9-blackforest',gp:'Germany',title:'Black Forest Grand Tour',country:'Germany',
 location:'Black Forest (stylised)',circuit:'Black Forest Grand Tour',
 flag:['#151515','#d62228','#f1c545'],seed:65,scale:.50,start:'auto',
 carRoadScale:3.5,carRoadWidth:6.4,carDescentDegrees:1.35,
 carActionProfile:{minimumSectors:12,maximumSectors:18,pondFractions:[.10,.22,.34,.46,.58,.70,.82,.90]},
 // An asymmetric route: forest straight, flowing double S, hillside hairpins,
 // village loop and a separate long return. No stacked or crossing roads.
 outline:[
  [-210,-160],[170,-160],[215,-145],[245,-110],[248,-62],
  [230,-28],[190,-12],[145,-18],[110,-44],[84,-65],[55,-63],
  [38,-40],[45,-15],[78,5],[120,18],[150,45],[152,78],
  [135,103],[106,112],[72,98],[40,70],[6,65],[-20,85],
  [-24,115],[-8,143],[24,158],[65,163],[92,183],[85,211],
  [53,230],[5,233],[-40,214],[-70,179],[-92,150],
  [-125,144],[-153,161],[-163,190],[-189,206],[-220,197],
  [-242,167],[-239,126],[-218,99],[-183,83],[-151,77],
  [-127,54],[-130,27],[-151,4],[-185,-4],[-219,-24],
  [-242,-55],[-245,-99],[-235,-136],
 ],
};
