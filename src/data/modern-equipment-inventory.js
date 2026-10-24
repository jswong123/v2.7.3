// 现代装备与步兵库存基础层：纯数据、可序列化；不覆盖历史战役。
// 数量及性能为架空游戏参数，非现实第195旅编制。
export const MODERN_WEAPONS = Object.freeze({
 QBZ191:{name:"QBZ-191自动步枪",ammoType:"5.8mm_rifle",category:"rifle"},
 QBZ192:{name:"QBZ-192短自动步枪",ammoType:"5.8mm_rifle",category:"rifle"},
 QBU191:{name:"QBU-191精确射手步枪",ammoType:"5.8mm_rifle",category:"marksman"},
 QJB201:{name:"QJB-201班用机枪",ammoType:"5.8mm_rifle",category:"lmg"},
 QJY201:{name:"QJY-201通用机枪",ammoType:"7.62mm_mg",category:"gpmg"},
 QBZ95:{name:"95式自动步枪",ammoType:"5.8mm_rifle",category:"rifle"},
 QBB95:{name:"95式班用机枪",ammoType:"5.8mm_rifle",category:"lmg"},
 QJZ89:{name:"QJZ-89重机枪",ammoType:"12.7mm_hmg",category:"hmg"},
 ROCKET_AT:{name:"便携反装甲发射器（游戏抽象）",ammoType:"portable_at",category:"antitank"}
});
export const NEW_ARMOR = Object.freeze({
 ZTZ99B:{name:"99B主战坦克",role:"tank",attack:95,defense:94,mobility:81,sensors:88},
 ZTZ100:{name:"100式主战坦克",role:"tank",attack:94,defense:92,mobility:91,sensors:98},
 TYPE100_SUPPORT:{name:"100式支援战车",role:"support",attack:68,defense:80,mobility:90,sensors:98}
});
const INFANTRY_TYPES = new Set(["infantry","mechanized_infantry","wheeled_infantry","motorized_infantry","special_forces","recon","reconnaissance","drone_recon","uav_recon"]);
const SCOUT_TYPES = new Set(['special_forces','recon','reconnaissance','drone_recon','uav_recon']);
// Separate vehicle initialization from infantry weapons: existing weapon inventories must not skip vehicles.
export function ensureScoutVehicles(unit){
 if(!unit || !SCOUT_TYPES.has(unit.type)) return unit;
 const persons=Math.max(1,Math.floor(Number(unit.manpower??unit.maxManpower??18)||18));
 if(!unit.highMobilityVehicles){
  const count=Math.max(1,Math.ceil(persons/8));
  unit.highMobilityVehicles={model:'HIGH_MOBILITY_4X4',name:'轻型高机动车（游戏抽象）',initial:count,operational:count,damaged:0,lost:0,armorClass:'light',capacityPerVehicle:8,healthPerVehicle:100,ammoVulnerability:['12.7mm_hmg','14.5mm_hmg'],movementMode:'vehicle'};
 }
 return unit;
}
export function assignModernInfantryInventory(unit, advanced=false){
 if(!unit || !INFANTRY_TYPES.has(unit.type))return unit;
 ensureScoutVehicles(unit);
 if(Array.isArray(unit.infantryWeapons))return unit;
 const persons=Math.max(1,Math.floor(Number(unit.manpower)||18));
 const squads=Math.max(1,Math.ceil(persons/9));
 const modern=advanced || unit.type==="special_forces";
 const rifle=modern?"QBZ191":"QBZ95", lmg=modern?"QJB201":"QBB95";
 const weapons=[{model:rifle,count:Math.max(0,persons-squads*2)},{model:lmg,count:squads},{model:modern?"QBU191":"QBZ95",count:squads},{model:"ROCKET_AT",count:Math.max(1,Math.ceil(squads/2))},{model:"QJY201",count:modern?Math.max(1,Math.floor(squads/3)):0}];
 unit.infantryWeapons=weapons.map(w=>({...w,operational:w.count,damaged:0,lost:0}));
 unit.ammunitionInventory={"5.8mm_rifle":persons*180,"portable_at":Math.max(1,Math.ceil(squads/2))*3};
 if(modern)unit.ammunitionInventory["7.62mm_mg"]=Math.max(1,Math.floor(squads/3))*600;
 unit.ammunitionInventoryMax={...unit.ammunitionInventory};
 unit.weaponInventoryVersion=1;
 return unit;
}
export function upgrade195Equipment(unit){
 if(!unit)return unit;
 const m=String(unit.id||"").match(/BN([1-4])_/);
 const bn=m?Number(m[1]):null;
 const isTank=unit.type==="tank";
 const isMech=unit.type==="mechanized_infantry";
 let key=null;
 if(isTank && bn)key=bn<=2?"ZTZ99B":"ZTZ100";
 if(isMech && bn>=3)key="TYPE100_SUPPORT";
 if(key && Array.isArray(unit.equipment) && unit.equipment.length){
   const old=unit.equipment[0], spec=NEW_ARMOR[key];
   unit.equipment=[{...old,type:key,name:spec.name}];
   unit.equipmentSummary=`${spec.name} ${old.operational}/${old.initial}辆`;
   unit.name=`${unit.fullName}｜${spec.name}`;
   unit.nextGenEquipment={...spec,model:key};
   unit.equipmentTechnologyLevel="next_generation";
   unit.advancedSensors=spec.sensors;
   unit.advancedProtection=spec.defense;
   // 数值只提供小幅游戏化加成，不直接用100分制覆盖战斗属性。
   unit.attack=Math.round(Number(unit.attack??0)*(key==="TYPE100_SUPPORT"?1.03:1.10));
   unit.defense=Math.round(Number(unit.defense??0)*1.08);
   // 新型支援车保留原有步兵载具机制，仅作为游戏过渡配置。
   if(key==="TYPE100_SUPPORT")unit.experimentalSupportVehicle=true;
 }
 assignModernInfantryInventory(unit,true);
 if(unit.infantryWeapons){
   // 现代步兵使用191枪族；装备库存按基层生成，不在上级重复入库。
   unit.infantryWeapons=unit.infantryWeapons.map(w=>w.model==="QBZ95"?{...w,model:"QBZ191"}:w.model==="QBB95"?{...w,model:"QJB201"}:w);
 }
 return unit;
}
// 预留弹药消耗接口：在战斗命中/攻击确认后调用，不在校验阶段扣除。
export function consumeWeaponAmmo(unit, ammoType, rounds){
 if(!unit?.ammunitionInventory || !ammoType)return {ok:false,reason:"no_inventory"};
 const available=Math.max(0,Number(unit.ammunitionInventory[ammoType]||0));
 const need=Math.max(0,Math.floor(Number(rounds)||0));
 if(available<need)return {ok:false,reason:"insufficient_ammo",available};
 unit.ammunitionInventory[ammoType]=available-need;
 return {ok:true,remaining:unit.ammunitionInventory[ammoType]};
}

// 战斗与后勤共用的步兵弹药池：按型号实际库存消耗，不允许负数。
// 每次攻击按目标挑选可用弹药。无库存的旧战役继续走原有抽象结算。
export function infantryAttackAmmoPlan(unit, defender=null){
 if(!unit?.ammunitionInventory || !Array.isArray(unit.infantryWeapons))return null;
 const inventory=unit.ammunitionInventory;
 const active=unit.infantryWeapons.filter(w=>Number(w.operational??w.count??0)>0);
 const plan={};
 const armored=defender && (['tank','amphibious_armor','armored','mechanized_infantry','wheeled_infantry'].includes(defender.type)||Array.isArray(defender.equipment)&&defender.equipment.some(e=>Number(e.operational??0)>0 && /坦克|装甲|步兵战车|ZTZ|ZBD|ZBL/i.test(String(e.name??e.type??''))));
 // 游戏抽象：对装甲目标优先消耗一枚反装甲弹；耗尽后允许其他枪械提供有限火力。
 if(armored && active.some(w=>MODERN_WEAPONS[w.model]?.ammoType==='portable_at') && Number(inventory.portable_at??0)>0){
   plan.portable_at=1;
   // 反装甲弹与枪弹分别结算，不能提前返回。
 }
 for(const [kind,rate] of [['5.8mm_rifle',2],['7.62mm_mg',3],['12.7mm_hmg',2]]){
  const count=active.filter(w=>MODERN_WEAPONS[w.model]?.ammoType===kind).reduce((n,w)=>n+Math.max(0,Number(w.operational??w.count??0)),0);
  const available=Math.max(0,Math.floor(Number(inventory[kind]??0)));
  if(count && available)plan[kind]=Math.min(available,Math.max(1,Math.ceil(count*rate)));
 }
 // 无枪弹时仍可用反装甲武器打击有效目标。
 return plan;
}
export function hasInfantryAttackAmmo(unit,defender=null){
 const plan=infantryAttackAmmoPlan(unit,defender);
 return plan===null || Object.values(plan).some(v=>v>0);
}
export function consumeInfantryAttackAmmo(unit,defender=null){
 const plan=infantryAttackAmmoPlan(unit,defender);
 if(plan===null)return null;
 if(!Object.values(plan).some(v=>v>0))return {ok:false,reason:'所有可用步兵武器弹药耗尽'};
 for(const [kind,amount] of Object.entries(plan))unit.ammunitionInventory[kind]=Math.max(0,Math.floor(Number(unit.ammunitionInventory[kind]??0))-amount);
 return {ok:true,spent:plan};
}
export function resupplyInfantryAmmo(unit, fraction){
 if(!unit?.ammunitionInventory || !unit?.ammunitionInventoryMax)return {};
 const supplied={};
 for(const [kind,max] of Object.entries(unit.ammunitionInventoryMax)){
  const before=Math.max(0,Math.floor(Number(unit.ammunitionInventory[kind]||0)));
  const ceiling=Math.max(0,Math.floor(Number(max)||0));
  const add=Math.min(Math.max(0,ceiling-before),Math.max(0,Math.floor(ceiling*Math.max(0,Number(fraction)||0))));
  unit.ammunitionInventory[kind]=before+add;
  if(add)supplied[kind]=add;
 }
 return supplied;
}

// Vehicle personnel and damage are separate: no automatic annihilation of passengers.
export function applyScoutVehicleDamage(unit,{ammoType,damage=0}={}){
 const v=unit?.highMobilityVehicles;if(!v)return {applied:false,reason:'no_scout_vehicle'};
 if(!['12.7mm_hmg','14.5mm_hmg','portable_at','autocannon_ammo'].includes(ammoType))return {applied:false,reason:'weapon_not_effective'};
 const amount=Math.max(0,Number(damage)||0);if(!amount)return {applied:false,reason:'no_damage'};
 v.damagePool=(Number(v.damagePool)||0)+amount;
 const disabled=Math.min(v.operational,Math.floor(v.damagePool/100));
 if(disabled){v.operational-=disabled;v.damaged+=disabled;v.damagePool-=disabled*100;}
 if(v.operational===0)v.movementMode='foot';
 return {applied:true,vehiclesDisabled:disabled,remaining:v.operational,personnelUnaffected:true};
}
