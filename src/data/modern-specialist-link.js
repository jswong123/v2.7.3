// Fictional training-game equipment and tactical data-link model; no real-world performance claims.
const dist=(a,b)=>Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));
export function attachSpecialistInventory(unit){
 if(!unit)return unit;
 if(unit.type==="recon" && Array.isArray(unit.equipment) && unit.equipment.some(e=>e.type==="UAV_RECON")){
  const count=Math.max(0,Number(unit.equipment.find(e=>e.type==="UAV_RECON")?.operational||0));
  unit.droneInventory=[{model:"UAV_RECON",name:"战术侦察无人机",initial:count,operational:count,damaged:0,destroyed:0}];
  unit.specialistEquipment=[{model:"UAV_CONTROL",name:"无人机地面控制终端",initial:2,operational:2},{model:"FIELD_RADIO",name:"数字通信终端",initial:4,operational:4}];
  unit.droneMissionResources={battery:100,maxBattery:100,sorties:count,maxSorties:count};
  unit.infantryWeapons=[{model:"QBZ192",count:Math.min(12,Math.ceil(Number(unit.manpower||20)/5)),operational:Math.min(12,Math.ceil(Number(unit.manpower||20)/5))}];
  unit.ammunitionInventory={"5.8mm_rifle":Math.min(12,Math.ceil(Number(unit.manpower||20)/5))*120};
  unit.ammunitionInventoryMax={...unit.ammunitionInventory};
 }
 if(unit.type==="special_forces"){
  unit.specialistEquipment=[{model:"NIGHT_OPTIC",name:"夜视观察设备",initial:6,operational:6},{model:"FIELD_RADIO",name:"数字通信终端",initial:4,operational:4},{model:"MICRO_UAV",name:"微型侦察无人机",initial:2,operational:2}];
  unit.droneInventory=[{model:"MICRO_UAV",name:"微型侦察无人机",initial:2,operational:2,damaged:0,destroyed:0}];
  unit.droneMissionResources={battery:100,maxBattery:100,sorties:2,maxSorties:2};
 }
 return unit;
}
export function compute100Link(unit,units){
 if(!unit?.nextGenEquipment || !["ZTZ100","TYPE100_SUPPORT"].includes(unit.nextGenEquipment.model))return null;
 const support=unit.nextGenEquipment.model==="TYPE100_SUPPORT";
 const peers=(units||[]).filter(other=>other!==unit && other.faction===unit.faction && other.nextGenEquipment?.model===(support?"ZTZ100":"TYPE100_SUPPORT") && Number(other.strength??1)>0 && Number(other.modern?.c2??100)>20 && Number(other.equipment?.[0]?.operational??0)>0);
 const nearest=peers.map(other=>({other,distance:dist(unit,other)})).sort((a,b)=>a.distance-b.distance)[0];
 const status=Number(unit.modern?.c2??100)<=20?"中断":!nearest||nearest.distance>7?"中断":Number(unit.modern?.c2??100)<60||Number(nearest.other.modern?.c2??100)<60?"受扰":"正常";
 return {status,peer:status==="中断"?null:nearest.other.id,distance:nearest?.distance??null,sharedIntel:status==="正常"?2:status==="受扰"?1:0};
}
