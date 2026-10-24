// src/scenarios/ScenarioManager.js

import { findScenarioById } from "../../data/campaigns.js?v=2.3.2";

import { FactionSystem } from "../systems/FactionSystem.js";
import { ModernBrigadeSystem } from "../systems/ModernBrigadeSystem.js";
import { GroupArmySystem } from "../systems/GroupArmySystem.js";
import { assignModernInfantryInventory } from "../data/modern-equipment-inventory.js";

 

export class ScenarioManager {

    constructor({ world, gameState }) {

        this.world = world;

        this.gameState = gameState;

        this.current = null;

    }

 

    getScenarioConfig(id) {

        return findScenarioById(id);

    }

 

    async load(id) {

        const found = this.getScenarioConfig(id);

        if (!found) throw new Error(`未知战役：${id}`);

 

        const { theater, phase, scenario: config } = found;

        if (config.status === "locked") throw new Error(`${config.name} 尚未开放`);

 

        const isGroupArmy = GroupArmySystem.isGroupArmy(config);
        const isModern = ModernBrigadeSystem.isModern(config) || isGroupArmy;
        const scenarioResponse = await fetch(config.scenarioPath, { cache: "no-store" });
        const plaDeck = config?.plaCombinedBrigadeSelection === true;
        const unitsResponse = (isModern && !plaDeck) ? null : await fetch(config.unitsPath, { cache: "no-store" });

 

        if (!scenarioResponse.ok) {

            throw new Error(`${config.name} 地图加载失败：HTTP ${scenarioResponse.status}`);

        }

        if ((!isModern || plaDeck) && !unitsResponse.ok) {
            throw new Error(`${config.name} 单位加载失败：HTTP ${unitsResponse.status}`);
        }

 

        const scenarioData = await scenarioResponse.json();

        let units;
        if (plaDeck) {
            const rawUnits = await unitsResponse.json();
            const preset = Array.isArray(rawUnits) ? rawUnits : (rawUnits.units ?? []);
            const defenders = preset.filter(u=>String(u.faction??u.side).toLowerCase()==='tw_proxy');
            const type = sessionStorage.getItem('plaCombinedBrigadeSelection') || 'heavy';
            sessionStorage.setItem('modernBrigadeSelection', JSON.stringify({red:type,blue:'medium'}));
            const W=Number(scenarioData?.map?.width??60), H=Number(scenarioData?.map?.height??40);
            const generated = ModernBrigadeSystem.generate({...config,modernBrigadeSelection:true,plaCombinedBrigadeDeck:true,trainingMap:{width:W,height:H}}).filter(u=>u.faction==='RED');
            for (const u of generated) {
                u.faction='pla'; u.side='pla';
                u.id='PLA_'+String(u.id).replace(/^RED_?/,'');
                if(u.parentHQ)u.parentHQ='PLA_'+String(u.parentHQ).replace(/^RED_?/,'');
                u.name=String(u.name).replace(/红方/g,'解放军');
                u.fullName=String(u.fullName??'').replace(/红方/g,'解放军');
                u.formation=String(u.formation??'').replace(/红方/g,'解放军');
                // 解放军合成旅步兵类单位具备基础野战构筑能力。
                // 仅允许修筑散兵坑/战壕；碉堡、桥梁、墙体、雷区等高级工程仍由工兵承担。
                if (['infantry','mechanized_infantry','wheeled_infantry','motorized_infantry','special_forces'].includes(String(u.type??'').toLowerCase())) {
                    u.engineering = { ...(u.engineering ?? {}), canEntrench: true, fortificationPower: Math.max(25, Number(u.engineering?.fortificationPower ?? 0)) };
                }
            }
            units=[...generated,...defenders];
        } else if (isModern) {
            units = isGroupArmy ? GroupArmySystem.generate(config) : ModernBrigadeSystem.generate(config);
        } else {
            const rawUnits = await unitsResponse.json();
            units = Array.isArray(rawUnits) ? rawUnits : (rawUnits.units ?? []);
        }

 

        // 2026大型训练场：目标驻守单位独立生成，不占用建筑格，避免空防目标。
        if (config?.id === 'zhurihe_training_base_2026') {
            const objectives = scenarioData?.exerciseRules?.garrisonObjectives ?? [];
            const blue = units.filter(u => String(u.faction).toUpperCase() === 'BLUE');
            const infantryTemplate = blue.find(u => u.type === 'mechanized_infantry');
            const tankTemplate = blue.find(u => u.type === 'tank');
            if (!infantryTemplate || !tankTemplate) throw new Error('朱日和2026缺少蓝方装步或坦克单位模板');
            // 六个虚构防御营的23个连级单位，按目标独立编号。
            const garrisonPlans = {
                hq: { bn:1, title:'警戒', infantry:4, armor:2 },
                town: { bn:2, title:'城防', infantry:3, armor:1 },
                north: { bn:3, title:'高防', infantry:2, armor:1 },
                south: { bn:4, title:'机防', infantry:2, armor:1 },
                logistics: { bn:5, title:'保防', infantry:3, armor:1 },
                uav: { bn:6, title:'信防', infantry:2, armor:1 }
            };
            const occupied = new Set(units.map(u => `${u.q},${u.r}`));
            const W = Number(scenarioData.map.width ?? 84), H = Number(scenarioData.map.height ?? 60);
            const terrainMap = new Map((scenarioData.map.terrain ?? []).map(t => [`${t.q},${t.r}`, t.type]));
            const hexDist = (aq,ar,bq,br) => Math.max(Math.abs(aq-bq),Math.abs(ar-br),Math.abs(aq-bq+ar-br));
            for (const o of objectives) {
                const count = Math.max(2,Number(o.minGarrisonUnits ?? 3));
                const radius = Math.max(2,Number(o.garrisonRadius ?? 2));
                const positions=[];
                for (let r=0;r<=radius;r++) for(let dq=-r;dq<=r;dq++) for(let dr=-r;dr<=r;dr++) {
                    if(hexDist(0,0,dq,dr)!==r)continue;
                    const q=Number(o.q)+dq, rr=Number(o.r)+dr, key=`${q},${rr}`;
                    if(q<0||rr<0||q>=W||rr>=H||occupied.has(key))continue;
                    const terrain=terrainMap.get(key);
                    if(!terrain || ['water','river','lake','sea'].includes(String(terrain).toLowerCase()))continue;
                    positions.push({q,r:rr});
                }
                if(positions.length<count)throw new Error(`演习目标 ${o.name} 缺少${count}个合法驻守格`);
                const plan = garrisonPlans[o.id];
                if (!plan || plan.infantry + plan.armor !== count) throw new Error(`演习目标 ${o.name} 防御营编制与驻守数量不一致`);
                for(let i=0;i<count;i++) {
                    const pos=positions[i];
                    const infantry=i<plan.infantry;
                    const companyNo=infantry ? i+1 : i-plan.infantry+1;
                    const role=infantry?'装甲步兵':'坦克';
                    const model=infantry?'ZBD04A':(plan.bn<=3?'ZTZ99B':'ZTZ100');
                    const modelName=infantry?'ZBD-04A步兵战车':(plan.bn<=3?'99B主战坦克':'100式主战坦克');
                    const guard=structuredClone(infantry?infantryTemplate:tankTemplate);
                    const shortName=`${plan.title}${plan.bn}营${infantry?'装步':'坦'}${companyNo}连`;
                    const fullName=`第195重型合成旅·${plan.title}第${plan.bn}营${role}${companyNo}连`;
                    Object.assign(guard,{
                        id:`BLUE_195_GARRISON_${o.id}_${infantry?'M':'T'}${companyNo}`,
                        name:fullName,fullName,displayFormationName:shortName,mapLabel:shortName,
                        q:pos.q,r:pos.r,type:infantry?'mechanized_infantry':'tank',echelon:'company',
                        parentHQ:'BLUE_BDE_HQ',brigadeCode:'195B',gameBrigadeCode:'195B',brigadeId:'BLUE_195',
                        formation:'第195重型合成旅',garrisonBattalion:plan.bn,
                        garrisonObjectiveId:o.id,exerciseGarrison:true,
                        movementClass:'tracked',
                        equipment:[{type:model,name:modelName,initial:14,operational:14,damaged:0,destroyed:0}],
                        equipmentSummary:`${modelName} 14/14辆`,
                        nextGenEquipment:infantry?undefined:(model==='ZTZ100'?{model:'ZTZ100',name:modelName}:undefined)
                    });
                    if(infantry) assignModernInfantryInventory(guard, true);
                    else { delete guard.infantryWeapons; delete guard.ammunitionInventory; }
                    units.push(guard);occupied.add(`${pos.q},${pos.r}`);
                }
            }
            for (const o of objectives) {
                const stationed=units.filter(u=>u.garrisonObjectiveId===o.id&&String(u.faction).toUpperCase()==='BLUE'&&
                    hexDist(Number(u.q),Number(u.r),Number(o.q),Number(o.r))<=Number(o.garrisonRadius??2));
                if(stationed.length<Number(o.minGarrisonUnits??3))throw new Error(`演习目标 ${o.name} 驻守人数不足`);
            }
        }

        if (config?.id === 'zhurihe_195_exercise' || config?.key === 'zhurihe_195_exercise' || config?.id === 'zhurihe_training_base_2026') {
            const blueUnits=units.filter(u=>String(u.faction).toUpperCase()==='BLUE');
            // 火箭军支援旅属于独立配属编制，不参与固定第195旅身份校验。
            // 仍严格验证所有非支援蓝方单位，防止随机荣誉旅替换第195旅。
            const blueMainUnits = blueUnits.filter(u => u.rocketSupportBrigade !== true);
            const blueRocketSupport = blueUnits.filter(u => u.rocketSupportBrigade === true);
            const invalidMain = blueMainUnits.find(u => u.brigadeCode !== '195B' || u.brigadeId !== 'BLUE_195');
            const invalidSupport = blueRocketSupport.find(u =>
                !String(u.id || '').startsWith('BLUE_RF_') ||
                u.reserveZone !== 'BLUE_ROCKET_RESERVE'
            );
            if (!blueMainUnits.length || invalidMain || invalidSupport) {
                const badId = invalidMain?.id || invalidSupport?.id || 'BLUE_195_MISSING';
                throw new Error(`朱日和战役蓝方编制身份校验失败：${badId}`);
            }
        }

        scenarioData.key = scenarioData.key ?? config.id;

        scenarioData.name = scenarioData.name ?? config.name;

 

        this.applyScenarioToWorld(scenarioData);

        FactionSystem.configureGameState(this.gameState, config.factions);

 

        this.current = {

            theater,

            phase,

            config,

            scenario: scenarioData,

            units

        };

 

        return this.current;

    }

 

    applyScenarioToWorld(data) {

        if (!data || !this.world) return;

 

        if (typeof this.world.loadScenario === "function") {

            this.world.loadScenario(data);

            return;

        }

        if (typeof this.world.applyScenario === "function") {

            this.world.applyScenario(data);

            return;

        }

        if (typeof this.world.loadMap === "function" && data.map) {

            this.world.loadMap(data.map);

            return;

        }

 

        const map = data.map ?? data.world ?? data;

        if (Number.isFinite(Number(map.width))) this.world.width = Number(map.width);

        if (Number.isFinite(Number(map.height))) this.world.height = Number(map.height);

 

        if (Array.isArray(map.terrain)) this.world.terrain = map.terrain;

 

        for (const key of [

            "roads", "railways", "rails", "rivers",

            "settlements", "cities", "towns", "fortifications"

        ]) {

            if (Array.isArray(map[key])) this.world[key] = map[key];

        }

 

        this.world.config = map;

        this.world.mapConfig = map;

    }

}
