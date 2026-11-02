// An evolution of the authored Swiss circuit, preserving its outline and set.
// Car-specific challenge islands and acceleration lanes use the same road.
export function alpsTurbo(base) {
  const gates = [
    {u:34,lat:.65,width:.8,length:2,height:.5},
    {u:55,lat:-.65,width:.8,length:2,height:.5},
    {u:136,lat:0,width:.55,length:2.2,height:.5},
    {u:314,lat:.65,width:.8,length:2,height:.5},
    {u:332,lat:0,width:.55,length:2.2,height:.5},
    {u:350,lat:-.65,width:.8,length:2,height:.5},
    {u:522,lat:0,width:.55,length:2.2,height:.5},
  ];
  const lanes = [
    {u:22,length:9,latCenter:-1.08}, {u:128,length:6,latCenter:-1.08},
    {u:218,length:9,latCenter:1.08}, {u:301,length:9,latCenter:-1.08},
    {u:360,length:10,latCenter:-1.08}, {u:360,length:10,latCenter:1.08},
    {u:451,length:10,latCenter:-1.08}, {u:512,length:7,latCenter:1.08},
  ].map(l=>({...l,width:1.35,target:28,accel:82}));
  return {...base, carChallenges:{...base.carChallenges,variant:'turbo',gates,lanes,
    racecraft:{...base.carChallenges.racecraft,topSpeed:26,acceleration:9.5,braking:10.3,cornerAcceleration:10.8,boostSpeed:6.5,boostSeconds:3.8}}};
}
