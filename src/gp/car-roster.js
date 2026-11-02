// Select established cars, including their flags, models and performance stats.
// Custom exhibition grids never silently replace unknown or repeated countries.
// Exhibition entrants are opt-in; official heats and qualifiers keep their grid.
export const EXHIBITION_CARS=[
 {abbr:'COL',name:'Colombia',flag:'COL',color:'#fcd116',stats:{cls:'GT',teamName:'Cafetero GT',vel:3,est:4,int:3,strength:'BALANCED GT · Stable cornering and measured overtakes'}},
 {abbr:'CHE',name:'Switzerland',flag:'CHE',color:'#e30613',stats:{cls:'GT',teamName:'Alpine Precision GT',vel:3,est:5,int:2,strength:'ALPINE GRIP · Stable braking and corner exits'}},
 {abbr:'EGY',name:'Egypt',flag:'EGY',color:'#ce1126',stats:{cls:'JET',teamName:'Nile Falcon',vel:5,est:2,int:3,strength:'DESERT SPEED · Fast straights and powered lanes'}},
 {abbr:'AUS',name:'Australia',flag:'AUS',color:'#012169',stats:{cls:'BGY',teamName:'Southern Cross Raid',vel:3,est:4,int:3,strength:'ALL-ROUND RAID · Balanced grip and traffic choices'}},
];
export function selectCarCountries(all, countries) {
  const codes = countries.split(',').map(code => code.trim().toUpperCase());
  if (![6,10,12].includes(codes.length) || new Set(codes).size !== codes.length)
    throw Error('A custom car grid requires 6, 10 or 12 distinct country codes');
  return codes.map(code => {
    const car = all.find(car => car.abbr === code)??EXHIBITION_CARS.find(car=>car.abbr===code);
    if (!car) throw Error(`Unknown car country: ${code}`);
    return car;
  });
}

export function carCheckpointSurvivors(count){
 if(count===6)return [5,4,3];
 if(count===10)return [8,6,4];
 if(count===12)return [10,8,6];
 return [19,18,17]; // Established twenty-marble championship.
}

export function carStartingGrid(count){
 // Six- and ten-car productions retain their established grids. Twelve cars
 // need two rows: twelve abreast would overlap the actual chassis at lights-out.
 return count>10?{lanes:6,rows:Math.ceil(count/6),rowGap:2.2}:{lanes:count,rows:1,rowGap:1.4};
}
