import { upgrade195Equipment } from "./modern-equipment-inventory.js";
// 朱日和专用第195旅数据池。游戏化编制，非真实现役部队资料。
// 本模块只负责固定身份、建制与独立数据，原有装备与战斗规则复用重型旅模板。
export const BRIGADE_195 = Object.freeze({
  id: "BLUE_195", name: "第195重型合成旅", designation: "195旅",
  faction: "BLUE", type: "heavy", fixed: true, honorEligible: false,
  battalions: [1,2,3,4], specialSupport: ["recon","special_forces","electronic_warfare","engineer","logistics"]
});
// 朱日和架空蓝军强化：只在195旅数据池出口执行一次。
// 所有增益以完成换装后的数值为基准，避免不同模块反复叠乘。
const BOOST_195 = 1.5;
function boost195(unit) {
  if (unit?.balanceProfile === "195B_ELITE_150") return unit;
  const u = unit;
  const scale = (field, fallback = null) => {
    const old = Number(u[field] ?? fallback);
    if (Number.isFinite(old) && old > 0) u[field] = Math.ceil(old * BOOST_195);
  };
  // 实际战斗及行动引擎读取的属性，而非仅仅显示面板。
  for (const field of ["attack", "defense", "range", "movement", "maxMovementPoints", "movementPoints", "actionPoints", "maxActionPoints", "logisticsRadius"]) scale(field);
  // FogOfWarSystem.sight() 实际读取 recon.sight / sight，不能只写 visionRange。
  const type = String(u.type || "").toLowerCase();
  const name = String(u.fullName || u.name || "");
  const baseSight = /recon|scout|侦察/.test(type + name) ? 6
    : /tank|armor|mechanized|坦克|装甲|机步/.test(type + name) ? 4
    : /headquarter|指挥|旅指|营指/.test(type + name) ? 4 : 3;
  const originalSight = Number(u.recon?.sight ?? u.sight ?? baseSight);
  u.sight = Math.ceil(Math.max(1, originalSight) * BOOST_195);
  if (u.recon && typeof u.recon === "object") u.recon = { ...u.recon, sight: u.sight };
  // 弹药与油料的库存上限提高；初始可用库存同步增加。
  for (const pair of [["ammo", "maxAmmo"], ["fuel", "maxFuel"]]) {
    const [current, maximum] = pair;
    scale(current); scale(maximum);
  }
  for (const field of ["repairParts", "supply", "engineerKits", "maxEngineerKits"]) scale(field);
  // 士气为百分制：不突破100，但保留独立的强化标记。
  if (Number.isFinite(Number(u.morale))) u.morale = Math.min(100, Math.ceil(Number(u.morale) * BOOST_195));
  if (u.modern && typeof u.modern === "object") {
    u.modern = { ...u.modern, c2: Math.min(100, Math.ceil(Number(u.modern.c2 ?? 100) * BOOST_195)),
      intelLevel: Math.ceil(Number(u.modern.intelLevel ?? 0) * BOOST_195),
      supply: Math.ceil(Number(u.modern.supply ?? 100) * BOOST_195),
      ammo: Math.ceil(Number(u.modern.ammo ?? 100) * BOOST_195),
      fuel: Math.ceil(Number(u.modern.fuel ?? 100) * BOOST_195) };
  }
  u.balanceProfile = "195B_ELITE_150";
  u.balanceMultiplier = BOOST_195;
  return u;
}
export function build195BrigadePool({buildHeavy}) {
  const units=buildHeavy().map(source=>{
    const u={...source, equipment:Array.isArray(source.equipment)?source.equipment.map(e=>({...e})):source.equipment};
    u.formation=BRIGADE_195.name;
    u.brigadeDesignation=BRIGADE_195.designation;
    u.brigadeId=BRIGADE_195.id;
    u.formationId=BRIGADE_195.id;
    u.honorDesignation=null;
    u.honorUnit=false;
    u.fixedBrigade=true;
    u.generatedBy="Brigade195Pool";
    // 不允许在显示名称、地图标签中残留通用抽签的旅番号。
    const original=String(u.fullName || u.name || "");
    let label=original.replace(/^蓝方重型合成旅旅指挥所$/, "195旅旅指")
      .replace(/^蓝方/, "")
      .replace(/^第\d+(?:重型)?合成旅[·•]?/, "")
      .replace(/^旅直属/, "旅直");
    if (u.id === "BLUE_BDE_HQ") {
      label = "195旅旅指";
      u.commanderName = "满广志";
      u.commanderRank = "大校";
    }
    u.fullName=label;
    const eq=Array.isArray(u.equipment)&&u.equipment[0]?.name;
    u.name=eq ? `${label}｜${eq}` : label;
    u.mapDesignation="195旅";
    u.brigadeCode="195B";
    u.gameBrigadeCode="195B";
    u.gameBrigadeDesignation="第195重型合成旅";
    u.displayFormationName=u.fullName;
    u.originalFormationName=u.fullName;
    u.participatingBrigadeId=BRIGADE_195.id;
    u.catalogFormationId=BRIGADE_195.id;
    u.catalogParentId=BRIGADE_195.id;
    u.honorName=null;
    u.honorTitle=null;
    u.gameBrigadeHonor=null;
    u.brigadeNumber="195";
    return boost195(upgrade195Equipment(u));
  });
  if(!units.length || !units.some(u=>u.id==="BLUE_BDE_HQ"))throw new Error("第195旅数据池缺少旅指挥部");
  return units;
}
