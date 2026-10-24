import { ensureScoutVehicles } from "./data/modern-equipment-inventory.js";
import { compute100Link } from "./data/modern-specialist-link.js";
import { AirAssaultSystem } from "./systems/AirAssaultSystem.js";
import { initializeFormationCatalog } from "./ui/FormationCatalog.js";
import { FORMATION_DESIGNATIONS } from "./data/formation-designations.js";
import { AIRBORNE_DECK, buildAirborneUnits } from "./systems/ModernAirborneDeck.js";
// ============================================================
// main.js
// V1.4 — 玩家控制 / 阶段同步 / 目标胜利 / 存档 / 读取 / 撤销
// ============================================================
import { WorldMap } from "./WorldMap.js";
import { Camera } from "./Camera.js";
import { Renderer } from "./Renderer.js?v=1.4.2";
import { UnitSelection } from "./UnitSelection.js";
import { GameState } from "./GameState.js";
import { FactionSelection } from "./FactionSelection.js";
import { TurnSystem } from "./TurnSystem.js";
import { VictorySystem } from "./systems/VictorySystem.js";
import { MovementSystem } from "./systems/MovementSystem.js";
import { CombatSystem } from "./systems/CombatSystem.js";
import { AISystem } from "./systems/AISystem.js";
import { SaveSystem } from "./systems/SaveSystem.js";
import { UndoSystem } from "./systems/UndoSystem.js";
import { pixelToHex, hexToPixel } from "./Hex.js";
import { CampaignSelection } from "./ui/CampaignSelection.js?v=1.4.1";
import { ScenarioManager } from "./scenarios/ScenarioManager.js";
import { FactionSystem } from "./systems/FactionSystem.js?v=0.8.12";
import { ReinforcementSystem } from "./systems/ReinforcementSystem.js";
import { StrategicObjectives } from "./systems/StrategicObjectives.js";
import { EngineerSystem } from "./systems/EngineerSystem.js";
import { EquipmentDeckSystem } from "./systems/EquipmentDeckSystem.js";
import { EQUIPMENT_CARDS, EQUIPMENT_DECKS } from "../data/equipment-cards.js";
import { AIRCRAFT } from "../data/aircraft.js";
import { AIR_SUPPORT_CARDS, AIR_SUPPORT_DECKS } from "../data/air-support-cards.js";
import { AirDefenseSystem } from "./systems/AirDefenseSystem.js";
import { AirSupportSystem } from "./systems/AirSupportSystem.js";
import { FortificationDamageSystem } from "./systems/FortificationDamageSystem.js";
import { FogOfWarSystem } from "./systems/FogOfWarSystem.js";
import { ZoneControlSystem } from "./systems/ZoneControlSystem.js";
import { FieldHospitalSystem } from "./systems/FieldHospitalSystem.js";
import { AirSuperioritySystem } from "./systems/AirSuperioritySystem.js";
import { HexInfoPanel } from "./ui/HexInfoPanel.js";
import { CAMPAIGNS } from "../data/campaigns.js?v=2.3.2";
import { IntegrityMonitor } from "./systems/IntegrityMonitor.js";
import { ModernLogisticsSystem } from "./systems/ModernLogisticsSystem.js";
import { UnitTransportSystem } from "./systems/UnitTransportSystem.js?v=1.4.5b";
// ============================================================
// 多战场战役系统
// ============================================================
let currentScenarioKey = null;
let currentScenarioConfig = null;
let currentDifficulty = { name: "普通", multiplier: 1 };
const campaignSelection = new CampaignSelection();
function getScenarioConfig() {
    return currentScenarioConfig ?? {
        id: currentScenarioKey ?? "dubno",
        name: scenario?.name ?? "战役",
        factions: ["GER", "USSR"],
        start: { year:1941, month:6, day:26, hour:8, minute:0, hoursPerTurn:2, startingPhase:"german" }
    };
}
function showScenarioSelection() {
    const hasActiveBattle = !!currentScenarioKey && Array.isArray(units) && units.length > 0;
    campaignSelection.show(
        async (scenarioId, difficulty) => { currentDifficulty = difficulty ?? { name:"普通", multiplier:1 }; await loadScenario(scenarioId); },
        {
            hasActiveBattle,
            onMainMenu: () => showMainMenu(),
            onReturnToBattle: () => { hideMainMenu(); document.getElementById('pauseMenu')?.setAttribute('hidden',''); render(); }
        }
    );
}
// ============================================================
// DOM
// ============================================================
const canvas =
    document.getElementById("game-canvas");
const mapArea =
    document.getElementById("mapArea");
const unitInfo =
    document.getElementById("unitInfo");
const turnInfo =
    document.getElementById("turnInfo");
const turnNumber =
    document.getElementById("turnNumber");
const turnTime =
    document.getElementById("turnTime");
const turnPhase =
    document.getElementById("turnPhase");
const endPhaseButton =
    document.getElementById("endPhaseButton");
const reinforcementPanel = document.getElementById("reinforcementPanel");
const reinforcementNext = document.getElementById("reinforcementNext");
const reinforcementLog = document.getElementById("reinforcementLog");
const hexInfoElement = document.getElementById("hexInfoPanel");
const engineerActions = document.getElementById("engineerActions");
const buildFortButton = document.getElementById("buildFortButton");
const layMineButton = document.getElementById("layMineButton");
const clearMineButton = document.getElementById("clearMineButton");
const buildFoxholeButton=document.getElementById("buildFoxholeButton");
const buildBunkerButton=document.getElementById("buildBunkerButton");
const buildAA1Button=document.getElementById("buildAA1Button");
const buildAA2Button=document.getElementById("buildAA2Button");
const buildAA3Button=document.getElementById("buildAA3Button");
const buildBridgeButton=document.getElementById("buildBridgeButton");
const repairBridgeButton=document.getElementById("repairBridgeButton");
const demolishBridgeButton=document.getElementById("demolishBridgeButton");
const buildWallButton=document.getElementById("buildWallButton");
const demolishWallButton=document.getElementById("demolishWallButton");
if (!canvas) {
    throw new Error(
        "找不到 #game-canvas，请检查 index.html"
    );
}
// ============================================================
// 游戏核心对象
// ============================================================
const world =
    new WorldMap();
const camera =
    new Camera();
const renderer =
    new Renderer(
        canvas,
        world,
        camera
    );
const integrityMonitor = new IntegrityMonitor(world);
const casualtyState = { sides: {} };
// ============================================================
// 2.5D tabletop view (visual only; rules and hit testing remain Hex based)
// ============================================================
const view25DToggle = document.getElementById("view25d-toggle");
const controlZoneToggle = document.getElementById("control-zone-toggle");
const view25DLeft = document.getElementById("view25d-left");
const view25DRight = document.getElementById("view25d-right");
const view25DDirection = document.getElementById("view25d-direction");
const sandtablePitch = document.getElementById("sandtable-pitch");
const sandtableReset = document.getElementById("sandtable-reset");
const fullscreenToggle = document.getElementById("fullscreen-toggle");
const view25DLabels = { north:"北", east:"东", south:"南", west:"西" };
let view25DEnabled = false;

// ============================================================
// v1.2.7 Fullscreen / iOS display mode
// Desktop browsers use Fullscreen API. iPhone/iPad Safari versions that do
// not expose it fall back to a fixed "maximized" web-app view.
// ============================================================
function isNativeFullscreen(){
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function isFullscreenView(){
    return isNativeFullscreen() || document.documentElement.classList.contains("ios-maximized");
}
function refreshFullscreenButton(){
    if(!fullscreenToggle) return;
    const active=isFullscreenView();
    fullscreenToggle.textContent=active ? "退出全屏" : "全屏";
    fullscreenToggle.title=active ? "退出全屏模式" : "进入全屏模式";
    fullscreenToggle.setAttribute("aria-pressed", active ? "true" : "false");
}
async function enterGameFullscreen(){
    const root=document.documentElement;
    try {
        if(root.requestFullscreen) await root.requestFullscreen({navigationUI:"hide"});
        else if(root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
        else root.classList.add("ios-maximized");
    } catch (_) {
        root.classList.add("ios-maximized");
    }
    refreshFullscreenButton();
    setTimeout(()=>window.dispatchEvent(new Event("resize")),50);
}
async function exitGameFullscreen(){
    try {
        if(document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
        else if(document.webkitFullscreenElement && document.webkitExitFullscreen) await document.webkitExitFullscreen();
    } catch (_) {}
    document.documentElement.classList.remove("ios-maximized");
    refreshFullscreenButton();
    setTimeout(()=>window.dispatchEvent(new Event("resize")),50);
}
fullscreenToggle?.addEventListener("click",()=>{
    if(isFullscreenView()) exitGameFullscreen(); else enterGameFullscreen();
});
document.addEventListener("fullscreenchange",refreshFullscreenButton);
document.addEventListener("webkitfullscreenchange",refreshFullscreenButton);
refreshFullscreenButton();

// ============================================================
// 玩家游戏设置：只绑定现有控区 / 2D-3D / 投影方向 / 俯仰 / 战争迷雾
// ============================================================
const GAME_SETTINGS_KEY = "frontline1937_game_settings_v1";
const DEFAULT_GAME_SETTINGS = Object.freeze({
    controlZone: false,
    terrainStyle: "default",
    mapMode: "2d",
    viewDirection: "south",
    pitch: 52,
    fogOfWar: true
});
function loadGameSettings(){
    try {
        const raw=JSON.parse(localStorage.getItem(GAME_SETTINGS_KEY) || "{}");
        return { ...DEFAULT_GAME_SETTINGS, ...raw };
    } catch (_) { return { ...DEFAULT_GAME_SETTINGS }; }
}
let userGameSettings = loadGameSettings();
function persistGameSettings(){
    try { localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(userGameSettings)); } catch (_) {}
}
function applyGameViewSettings({includeFog=true}={}){
    renderer.setTerrainStyle(userGameSettings.terrainStyle || "default");
    renderer.showControlZones = userGameSettings.controlZone === true;
    if(controlZoneToggle){
        controlZoneToggle.textContent = renderer.showControlZones ? "控区：开" : "控区：关";
        controlZoneToggle.setAttribute("aria-pressed", renderer.showControlZones ? "true" : "false");
    }
    view25DEnabled = userGameSettings.mapMode === "3d";
    renderer.setView25D(view25DEnabled);
    renderer.setViewDirection(userGameSettings.viewDirection || "south");
    renderer.setViewPitch(Number(userGameSettings.pitch ?? 52));
    if(sandtablePitch) sandtablePitch.value = String(userGameSettings.pitch ?? 52);
    if(includeFog && typeof fogOfWarSystem !== "undefined") fogOfWarSystem.setEnabled(userGameSettings.fogOfWar !== false);
    refreshView25DControls();
}
function refreshView25DControls() {
    if (view25DToggle) {
        view25DToggle.textContent = view25DEnabled ? "立体沙盘" : "二维地图";
        view25DToggle.classList.toggle("active", view25DEnabled);
    }
    if (view25DDirection) view25DDirection.textContent = view25DLabels[renderer.view25D.direction] ?? "南";
}
view25DToggle?.addEventListener("click", () => {
    view25DEnabled = !view25DEnabled;
    renderer.setView25D(view25DEnabled);
    refreshView25DControls();
    render();
});
view25DLeft?.addEventListener("click", () => { renderer.cycleViewDirection(-1); refreshView25DControls(); render(); });
view25DRight?.addEventListener("click", () => { renderer.cycleViewDirection(1); refreshView25DControls(); render(); });
view25DDirection?.addEventListener("click", () => { renderer.cycleViewDirection(1); refreshView25DControls(); render(); });
sandtablePitch?.addEventListener("input", () => {
    renderer.setViewPitch(Number(sandtablePitch.value));
    render();
});
sandtableReset?.addEventListener("click", () => {
    renderer.setViewDirection(userGameSettings.viewDirection || "south");
    renderer.setViewPitch(Number(userGameSettings.pitch ?? 52));
    if (sandtablePitch) sandtablePitch.value = String(userGameSettings.pitch ?? 52);
    refreshView25DControls();
    render();
});
renderer.setViewPitch(Number(userGameSettings.pitch ?? 52));
renderer.setViewDirection(userGameSettings.viewDirection || "south");
view25DEnabled = userGameSettings.mapMode === "3d";
renderer.setView25D(view25DEnabled);
renderer.showControlZones = userGameSettings.controlZone === true;
refreshView25DControls();

const gameState =
    new GameState();
const scenarioManager = new ScenarioManager({ world, gameState });
const selection =
    new UnitSelection(
        renderer,
        gameState
    );
const movementSystem =
    new MovementSystem(
        world
    );
const combatSystem =
    new CombatSystem(
        world
    );
const aiSystem =
    new AISystem(
        movementSystem,
        combatSystem
    );
const factionSelection =
    new FactionSelection(
        gameState
    );
const saveSystem = new SaveSystem({ maxSlots: 3, storagePrefix: "frontline-1937-1945-v0.3" });
saveSystem.initialize().then(()=>{updateMainMenu();updateSaveControls();}).catch(e=>console.warn("[存档] 迁移检查失败",e));
const undoSystem = new UndoSystem({ maxHistory: 30 });
// ============================================================
// 游戏状态
// 必须先声明，再初始化任何会读取 turnSystem / scenario 的系统。
// ============================================================
let scenario = null;
let units = [];
const unitTransportSystem = new UnitTransportSystem();
let turnSystem = null;
let victorySystem = null;
let lastBattleMessage = "";
let selectedUnit = null;
let gameOver = false;
let postBattleViewing = false;
let aiRunning = false;

// 现代后勤按单位能力判定，而不是只依赖“砺剑合成旅选择”场景标记。
function isVehicleInfantry(unit=null){
    if(!unit) return false;
    const type=String(unit.type??unit.unitType??'').toLowerCase();
    if(["mechanized_infantry","wheeled_infantry","motorized_infantry","armored_infantry","high_mobility_infantry"].includes(type)) return true;
    const text=[unit.name,unit.fullName,unit.equipmentName,unit.equipmentType,...(Array.isArray(unit.equipment)?unit.equipment.flatMap(e=>[e?.name,e?.type]):[])].filter(Boolean).join(' ');
    return /机械化步兵|装甲步兵|装步|高机动步兵|摩托化步兵|轮式步兵|步兵战车|装甲输送车|ZBD[- ]?0?4|ZBD[- ]?0?5|ZBL[- ]?0?8|CSK[- ]?181/i.test(text);
}
function usesModernLogistics(unit=null){
    if(unit) return !!unit.modern || isVehicleInfantry(unit) || (["pla","tw_proxy","red","blue"].includes(normalizeSide(unit.faction??unit.side)) && (unit.fuel!==undefined || unit.ammo!==undefined || unit.ammunition!==undefined));
    return currentScenarioConfig?.modernBrigadeSelection===true || currentScenarioConfig?.plaCombinedBrigadeSelection===true || units.some(u=>usesModernLogistics(u));
}

const reinforcementSystem = new ReinforcementSystem(world);
const strategicObjectives = new StrategicObjectives({
    onLocate:(q,r)=>cmdFocusHex(q,r),
    getPlayerFaction: () => getPlayerSide(),
    getTurn: () => turnSystem?.turn ?? 1,
    getUnits: () => units,
    container: document.getElementById("strategicObjectives")
});
// 此时 turnSystem 已经完成声明（初值为 null），因此首次渲染安全回退到第1回合。
strategicObjectives.init();
const engineerSystem = new EngineerSystem(world);
const equipmentDeckSystem = new EquipmentDeckSystem({cards:EQUIPMENT_CARDS,decks:EQUIPMENT_DECKS});
// 预留给开发者模式/战役脚本调用，不改变现有战斗规则。
window.frontlineEquipmentDecks = equipmentDeckSystem;
const airDefenseSystem = new AirDefenseSystem(world,()=>units);
const fortificationDamageSystem = new FortificationDamageSystem(world);
const zoneControlSystem = new ZoneControlSystem(world,()=>units);
const fogOfWarSystem = new FogOfWarSystem(world,()=>units,zoneControlSystem);
// Use the same faction normalization as selection and combat.
fogOfWarSystem.resolveSide = getUnitSide;
fogOfWarSystem.extraSight=(u,base)=>{if(ewKind(u)!=='uav'||ewMode(u)!=='recon')return base;const field=ewField(u);return field.interference>=2?Math.max(base,4):Math.max(base,8);};
const fieldHospitalSystem = new FieldHospitalSystem({world,getUnits:()=>units,getTurn:()=>turnSystem?.getTurnNumber?.()??turnSystem?.turn??1});
const airSuperioritySystem = new AirSuperioritySystem();
const modernLogisticsSystem = new ModernLogisticsSystem({getUnits:()=>units,getTurn:()=>turnSystem?.turn??1});
window.frontlineModernLogistics = modernLogisticsSystem;
const airSupportSystem = new AirSupportSystem({world,getUnits:()=>units,getTurn:()=>turnSystem?.getTurnNumber?.()??turnSystem?.turn??1,getPhase:()=>turnSystem?.phase,cards:AIR_SUPPORT_CARDS,decks:AIR_SUPPORT_DECKS,aircraft:AIRCRAFT,airDefense:airDefenseSystem,fortificationDamage:fortificationDamageSystem,airSuperiority:airSuperioritySystem,fogOfWar:fogOfWarSystem});
renderer.fogOfWar=fogOfWarSystem;
renderer.zoneControl=zoneControlSystem;
renderer.showControlZones = userGameSettings.controlZone === true;
window.frontlineFortificationDamage = fortificationDamageSystem;
window.frontlineAirSupport = airSupportSystem;
window.frontlineFogOfWar = fogOfWarSystem;
window.frontlineZoneControl = zoneControlSystem;
window.frontlineFieldHospital = fieldHospitalSystem;
window.frontlineAirSuperiority = airSuperioritySystem;
let pendingAirCard = null;
let pendingAirborneReserveId = null;
let airborneReserves = {red:[],blue:[]};
// ============================================================
// 砺剑-27：军事保障节点 / 空军基地占领系统
// ============================================================
function processCapturableFacilities(){
    const facilities=scenario?.capturableFacilities;
    if(!Array.isArray(facilities)||!facilities.length)return;
    scenario.facilityState=scenario.facilityState&&typeof scenario.facilityState==='object'?scenario.facilityState:{};
    const aliveAt=(q,r)=>units.filter(u=>u?.offMap!==true&&isUnitAlive(u)&&Number(u.q)===Number(q)&&Number(u.r)===Number(r));
    const grantSupply=(side,node,st)=>{
        const grant=Math.min(Math.max(0,Number(node.captureGrant??300)),Math.max(0,Number(st.remainingStock??node.totalStock??0)));
        if(grant<=0)return 0;
        const friend=units.filter(u=>u?.offMap!==true&&isUnitAlive(u)&&normalizeSide(u.faction??u.side)===side);
        // 保障节点库存按“补给点”抽象分配；优先补充缺口最大的单位，节点总量永久扣减。
        let budget=grant;
        const targets=[...friend].sort((a,b)=>((100-Number(b.supply??100))+(100-Number(b.ammo??100))+(100-Number(b.fuel??100)))-((100-Number(a.supply??100))+(100-Number(a.ammo??100))+(100-Number(a.fuel??100))));
        for(const u of targets){if(budget<=0)break;for(const k of ['supply','ammo','fuel']){if(budget<=0)break;const before=Math.max(0,Math.min(100,Number(u[k]??100))),need=100-before,take=Math.min(need,budget);u[k]=before+take;budget-=take;}}
        const used=grant-budget;st.remainingStock=Math.max(0,Number(st.remainingStock??node.totalStock??0)-used);return used;
    };
    for(const f of facilities){
        const st=scenario.facilityState[f.id]??={owner:f.initialOwner??null,remainingStock:Number(f.totalStock??0),durability:Number(f.initialDurability??f.maxDurability??100),disabled:false,captures:0};
        const here=aliveAt(f.q,f.r), sides=[...new Set(here.map(u=>normalizeSide(u.faction??u.side)).filter(x=>x==='red'||x==='blue'))];
        if(sides.length!==1)continue;
        const side=sides[0];if(st.owner===side)continue;
        st.owner=side;st.captures=Number(st.captures??0)+1;st.lastCaptureTurn=Number(turnSystem?.turn??1);
        if(f.type==='military_logistics'){
            const got=grantSupply(side,f,st);writeBattleMessage(`${side==='red'?'红方':'蓝方'}夺取军事保障节点「${f.name}」，获得 ${got} 点补给；节点库存剩余 ${Math.round(st.remainingStock)}。`);
        }else if(f.type==='military_airfield'){
            const threshold=Number(f.disabledBelow??50);st.disabled=Number(st.durability??100)<threshold;const added=st.disabled?0:airSupportSystem.grantCards(side,f.airSupportGrant??{modern_cap:1,modern_precision:1});
            writeBattleMessage(`${side==='red'?'红方':'蓝方'}夺取空军基地「${f.name}」；机场耐久 ${Math.round(st.durability??100)}/${f.maxDurability??100}${st.disabled?'，当前受损停用':'，航空支援增加 '+added+' 次'}。`);renderAirSupportPanel();
        }
    }
    // 机场恢复：己方工兵在2格内时，每回合恢复耐久；达到阈值后重新开放航空支援。
    for(const f of facilities.filter(x=>x.type==='military_airfield')){
      const st=scenario.facilityState[f.id]; if(!st?.owner||!st.disabled)continue;
      const eng=units.some(u=>u?.offMap!==true&&isUnitAlive(u)&&normalizeSide(u.faction??u.side)===st.owner&&String(u.type??'').includes('engineer')&&Math.max(Math.abs(Number(u.q)-f.q),Math.abs(Number(u.r)-f.r),Math.abs((Number(u.q)-f.q)+(Number(u.r)-f.r)))<=2);
      if(eng){st.durability=Math.min(Number(f.maxDurability??100),Number(st.durability??0)+Number(f.engineerRepairPerTurn??25));if(st.durability>=Number(f.disabledBelow??50)){st.disabled=false;const added=airSupportSystem.grantCards(st.owner,f.airSupportGrant??{});writeBattleMessage(`工兵完成「${f.name}」抢修，机场恢复使用；航空支援增加 ${added} 次。`);renderAirSupportPanel();}}
    }
}
const hexInfoPanel = new HexInfoPanel(hexInfoElement, world);
let selectedHex = null;
renderer.movementSystem =
    movementSystem;
// ============================================================
// 鼠标状态
// ============================================================
let isDragging = false;
let dragMoved = false;
let dragStartX = 0, dragStartY = 0;
let lastMouseX = 0;
let lastMouseY = 0;
// ============================================================
// Canvas
// ============================================================
function resizeCanvas() {
    const container = mapArea ?? canvas.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();

    // Renderer / Camera / 鼠标命中统一使用 CSS 像素。
    canvas.width = Math.max(1, Math.floor(rect.width));
    canvas.height = Math.max(1, Math.floor(rect.height));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
}
// 电子对抗 V1：抽象电磁环境，不包含现实频率、功率或压制参数。
const electronicWarfare={modes:{},lastPhase:'',events:[]};
function ewKind(u){const v=[u.nameZh,u.name,u.typeZh,u.type,u.unitType,u.role,u.subtype].filter(Boolean).join(' ').toLowerCase();if(/中继|relay|repeater|通信保障/.test(v))return 'relay';if(/电子对抗|电子战|电磁干扰|electronic warfare|\bew\b|jammer/.test(v))return 'ew';if(/无人机|无人侦察|uav|drone/.test(v))return 'uav';return null;}
function ewActive(u){return u&&!u.offMap&&isUnitAlive(u)&&Number.isFinite(Number(u.q))&&Number.isFinite(Number(u.r));}
function ewMode(u){return electronicWarfare.modes[String(u.id)]||'standby';}
function ewNodes(side,kind,mode){return units.filter(u=>ewActive(u)&&getUnitSide(u)===side&&ewKind(u)===kind&&(!mode||ewMode(u)===mode));}
function ewField(u){const side=getUnitSide(u);let interference=0,protection=0,relay=null,drone=0;for(const x of units){if(!ewActive(x))continue;const distance=cmdHexDistance(u,x),kind=ewKind(x),mode=ewMode(x),friendly=getUnitSide(x)===side;if(kind==='ew'&&distance<=5){if(friendly&&mode==='protect')protection=Math.max(protection,1);if(!friendly&&mode==='jam')interference=Math.max(interference,2);}if(kind==='relay'&&friendly&&mode==='relay'&&distance<=5)relay=x;if(kind==='uav'&&friendly&&mode==='recon'&&distance<=4)drone=1;}return {interference:Math.max(0,interference-protection),protection,relay,drone};}
function ewSave(){try{localStorage.setItem('frontline_ew_v1_'+currentScenarioKey,JSON.stringify(electronicWarfare.modes));}catch(e){console.warn('[电子对抗]保存失败',e);}}
function ewLoad(){electronicWarfare.modes={};electronicWarfare.lastPhase='';electronicWarfare.events=[];try{electronicWarfare.modes=JSON.parse(localStorage.getItem('frontline_ew_v1_'+currentScenarioKey)||'{}')||{};}catch(e){console.warn('[电子对抗]读取失败',e);}}
function ewProcess(){if(!turnSystem||!currentScenarioKey)return;const phase=String(turnSystem.turn)+':'+normalizeSide(turnSystem.phase);if(phase===electronicWarfare.lastPhase)return;electronicWarfare.lastPhase=phase;const side=normalizeSide(turnSystem.phase);for(const u of units){if(!ewActive(u)||getUnitSide(u)!==side)continue;const kind=ewKind(u),mode=ewMode(u);if(kind&&mode!=='standby'){const field=ewField(u);if(field.interference>0&&kind==='uav'&&mode==='recon')electronicWarfare.events.unshift('第'+turnSystem.turn+'回合 · '+unitName(u)+'：侦察链路受干扰，情报更新受限。');}}electronicWarfare.events.length=Math.min(40,electronicWarfare.events.length);}
function ewUpdatePanel(){const host=document.getElementById('electronicWarfarePanel');if(!host)return;const side=getPlayerSide(),list=host.querySelector('#ewUnitList');list.replaceChildren();const friendly=units.filter(u=>ewActive(u)&&getUnitSide(u)===side&&ewKind(u));for(const u of friendly){const row=document.createElement('div');row.style.cssText='border-bottom:1px solid #afa68d;padding:6px 0';const title=document.createElement('div');title.textContent=unitName(u)+' · '+({ew:'电子对抗',relay:'通信中继',uav:'无人机侦察'}[ewKind(u)]);row.appendChild(title);const sel=document.createElement('select');const options=ewKind(u)==='ew'?[['standby','待机'],['jam','干扰'],['protect','电子防护']]:ewKind(u)==='relay'?[['standby','待机'],['relay','中继开启']]:[['standby','待机'],['recon','持续侦察']];for(const [value,label] of options){const o=document.createElement('option');o.value=value;o.textContent=label;sel.appendChild(o);}sel.value=ewMode(u);sel.onchange=()=>{electronicWarfare.modes[String(u.id)]=sel.value;ewSave();ewUpdatePanel();};row.appendChild(sel);const f=ewField(u),detail=document.createElement('div');detail.style.fontSize='11px';detail.textContent='电磁干扰 '+f.interference+'级 · 防护 '+f.protection+'级 · '+(f.relay?'中继可用':'无邻近中继');row.appendChild(detail);list.appendChild(row);}if(!friendly.length)list.textContent='当前阵营没有可用的电子对抗、通信中继或无人机侦察单位。';host.querySelector('#ewLog').textContent=electronicWarfare.events.slice(0,8).join('\n')||'暂无电磁事件';}
function ewInstallPanel(){if(document.getElementById('electronicWarfarePanel'))return;const host=document.createElement('section');host.id='electronicWarfarePanel';host.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2100;width:min(365px,calc(100vw - 24px));max-height:70vh;overflow:auto;background:#e8e0c5;color:#282e2b;border:2px solid #68664e;padding:10px;font:13px sans-serif;box-shadow:0 4px 18px #0006;display:none';host.innerHTML='<div style="display:flex;justify-content:space-between"><b>电子对抗与信息保障 V1</b><button id="ewClose">关闭</button></div><p style="font-size:11px">抽象电磁状态：干扰半径5格、中继半径5格、无人机协同半径4格；仅影响指挥任务联通与情报状态报告。</p><div id="ewUnitList"></div><b>电磁事件</b><pre id="ewLog" style="white-space:pre-wrap;font:11px sans-serif"></pre>';document.body.appendChild(host);const btn=document.createElement('button');btn.id='ewToggle';btn.textContent='电子对抗';btn.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2099;background:#273a35;color:white;border:1px solid #aeb4a5;padding:9px 13px;cursor:pointer';document.body.appendChild(btn);btn.onclick=()=>{host.style.display='block';btn.style.display='none';ewUpdatePanel();};host.querySelector('#ewClose').onclick=()=>{host.style.display='none';btn.style.display='block';};}
// 旅级指挥原型：营级侦察警戒、指挥范围与任务日志（独立于战斗结算）
const brigadeCommand = {tasks:[], log:[], sequence:0, lastPhaseKey:'', selectedId:null};
function cmdHexDistance(a,b){const dq=Number(a.q)-Number(b.q),dr=Number(a.r)-Number(b.r);return Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));}
function cmdIsHQ(u){return /指挥|司令|command|headquarters|\bHQ\b/i.test([u.nameZh,u.name,u.typeZh,u.type,u.unitType,u.role].filter(Boolean).join(' '));}
function cmdRadius(u){return /旅|brigade/i.test(String(u.nameZh??u.name??''))?9:6;}
// V1.8.12: connected multi-hop command relay, abstract game ranges (hexes).
function cmdRelayNodes(side){
 return units.filter(x=>ewActive(x)&&!x.offMap&&getUnitSide(x)===side&&
  (/通信|中继|relay|repeater/i.test([x.nameZh,x.name,x.role,x.typeZh].filter(Boolean).join(' ')))&&
  (ewKind(x)!=='relay'||ewMode(x)==='relay'));
}
function cmdRelayRadius(x){return /集团军|GA_C2/i.test(String(x.nameZh||x.name||'')+' '+String(x.id||''))?8:6;}
function cmdCoverage(u){
 const side=getUnitSide(u),hqs=units.filter(x=>ewActive(x)&&!x.offMap&&getUnitSide(x)===side&&cmdIsHQ(x)&&!(/通信|中继/.test(String(x.nameZh||x.name||''))));
 const relays=cmdRelayNodes(side), reachable=[], visited=new Set();
 for(const h of hqs){reachable.push({node:h,hq:h,depth:0,radius:cmdRadius(h),path:[h]});visited.add(String(h.id));}
 // Breadth-first propagation: disconnected relays never become command sources.
 for(let i=0;i<reachable.length;i++){
  const n=reachable[i];if(n.depth>=3)continue;
  for(const relay of relays){if(visited.has(String(relay.id)))continue;
   if(cmdHexDistance(n.node,relay)>n.radius)continue;
   if(ewField(relay).interference>=2)continue;
   visited.add(String(relay.id));reachable.push({node:relay,hq:n.hq,depth:n.depth+1,radius:cmdRelayRadius(relay),path:[...n.path,relay]});
  }
 }
 let best=null;
 for(const n of reachable){const d=cmdHexDistance(u,n.node);if(d>n.radius)continue;
  if(!best||n.depth<best.depth||(n.depth===best.depth&&d<best.distance))best={hq:n.hq,distance:d,radius:n.radius,via:n.depth?'relay':'direct',relay:n.depth?n.node:null,depth:n.depth,path:n.path};
 }
 const field=ewField(u);return {...(best||{}),hq:best?.hq||null,distance:best?.distance??null,radius:best?.radius||0,via:best?.via||null,connected:!!best&&field.interference<2,interference:field.interference};
}
function cmdLog(message){brigadeCommand.log.unshift(`第${turnSystem?.turn??1}回合 · ${message}`);brigadeCommand.log.length=Math.min(60,brigadeCommand.log.length);}
function cmdSave(){try{localStorage.setItem('frontline_command_v1_'+currentScenarioKey,JSON.stringify({tasks:brigadeCommand.tasks,log:brigadeCommand.log,sequence:brigadeCommand.sequence,designations:Object.fromEntries(units.filter(u=>u.commandDesignation).map(u=>[String(u.id),u.commandDesignation]))}));}catch(e){console.warn('[旅级指挥] 保存失败',e);}}
function cmdLoad(){brigadeCommand.tasks=[];brigadeCommand.log=[];brigadeCommand.sequence=0;brigadeCommand.lastPhaseKey='';try{const raw=JSON.parse(localStorage.getItem('frontline_command_v1_'+currentScenarioKey)||'null');if(raw){brigadeCommand.tasks=Array.isArray(raw.tasks)?raw.tasks:[];brigadeCommand.log=Array.isArray(raw.log)?raw.log:[];brigadeCommand.sequence=Number(raw.sequence)||0;for(const u of units){if(raw.designations?.[String(u.id)]&&!u.autoGenerated){u.commandDesignation=raw.designations[String(u.id)];u.displayFormationName=u.commandDesignation;}}}}catch(e){console.warn('[旅级指挥] 读取失败',e);}}
// 层级优先：明确编制隶属关系；无隶属字段的单位归入“未编组”，绝不按距离臆造隶属。
function cmdEchelon(u){
 const e=String(u.echelon||u.scale||u.level||'').toLowerCase();
 // Structural fields must win over display names. A company belonging to a
 // brigade must never become a brigade because its label includes 合成旅.
 if(/group_army|grouparmy|army_group|集团军/.test(e))return 'army';
 if(/company|连|中队|platoon|排|team|小队|分队/.test(e))return 'company';
 if(/battalion|营|大队/.test(e))return 'battalion';
 if(/brigade|旅/.test(e))return 'brigade';
 const n=String(u.originalFormationName||u.nameZh||u.name||'');
 if(/集团军(指挥|指挥部|司令部)/.test(n))return 'army';
 if(/\d+连|[一二三四五六七八九十]连|通信指挥连|维修保障连|分队|小队/.test(n))return 'company';
 if(/营指挥|合成营|空降营/.test(n))return 'battalion';
 if(/合成旅|炮兵旅|防空旅|保障旅|旅指挥/.test(n))return 'brigade';
 return 'other';
}
function cmdParentId(u){
 // 现代合成旅生成器将直属上级记录在 modern.parentHQ，旧版没有读取该字段。
 return u.parentUnitId??u.parentId??u.parentHQ??u.modern?.parentHQ??u.battalionId??u.brigadeId??u.commanderId??u.parent_id??null;
}
function cmdIsArmyScale(){
 const c=currentScenarioConfig||{};
 const text=[c.commandLevel,c.commandScale,c.battleScale,c.scale,c.level,c.type,c.id,c.name,c.title,currentScenarioKey].filter(Boolean).join(' ').toLowerCase();
 return c.groupArmySelection===true||c.armyGroupSelection===true||c.groupArmyMode===true||c.armyLevel===true||/group.?army|army.?group|集团军|砺剑|lijian|sharpen/.test(text);
}
function cmdHierarchy(){
 const friendly=cmdEligibleUnits();
 const armies=friendly.filter(u=>cmdEchelon(u)==='army'),brigades=friendly.filter(u=>cmdEchelon(u)==='brigade'),battalions=friendly.filter(u=>cmdEchelon(u)==='battalion'),companies=friendly.filter(u=>cmdEchelon(u)==='company');
 const parentMatch=(u,p)=>{const id=cmdParentId(u);return id!=null&&(String(p.id)===String(id)||unitName(p)===String(id));};
 const armyCode=u=>String(u.groupArmyCode||u.gameArmyCode||'').toUpperCase();
 const brigadeCode=u=>String(u.gameBrigadeCode||u.brigadeCode||'').toUpperCase();
 const sameBrigade=(u,p)=>brigadeCode(u)&&brigadeCode(u)===brigadeCode(p)&&armyCode(u)===armyCode(p);
 const link=(children,parents,mode)=>{const result=new Map(parents.map(u=>[String(u.id),[]])),unassigned=[];
  for(const u of children){let target=parents.find(p=>parentMatch(u,p));
   if(!target&&mode==='army')target=parents.find(p=>armyCode(u)&&armyCode(u)===armyCode(p));
   if(!target&&mode==='brigade')target=parents.find(p=>sameBrigade(u,p));
   if(target)result.get(String(target.id)).push(u);else unassigned.push(u);
  }return {result,unassigned};};
 const bc=link(companies,battalions,'battalion'),bb=link(battalions,brigades,'brigade'),ab=link(brigades,armies,'army');
 return {armyScale:cmdIsArmyScale(),armies,brigades,battalions,companies,children:bc.result,unassigned:bc.unassigned,brigadeBattalions:bb.result,unassignedBattalions:bb.unassigned,armyBrigades:ab.result,unassignedBrigades:ab.unassigned};
}
const CMD_GROUP_ARMIES={东部:[71,72,73],南部:[74,75],西部:[76,77],北部:[78,79,80],中部:[81,82,83]};
// Publicly reported designations are distinguished from fictional game-only slots.
const CMD_PUBLIC_FORMATIONS = FORMATION_DESIGNATIONS.filter(x=>x.echelon==='brigade'&&x.status==='secondary');
function cmdFormationPresets(armyNumber){
 const n=Number(armyNumber)||71;
 const parent=`PLA-ARMY-${n}`;
 return FORMATION_DESIGNATIONS.filter(x=>x.echelon==='brigade'&&x.parent===parent).map(x=>({name:x.name,source:x.status==='fictional'?'游戏虚构':'二手资料·待核实',fictional:x.status==='fictional'}));
}
function cmdPopulateFormationPresets(){
 const host=document.getElementById('brigadeCommandPanel');if(!host)return;
 const army=host.querySelector('#cmdArmyPreset'),brigade=host.querySelector('#cmdBrigadePreset'),battalion=host.querySelector('#cmdBattalionPreset');
 if(!brigade||!battalion)return;
 const selectedArmy=army.value || (units.find(u=>cmdEchelon(u)==='army'&&getUnitSide(u)===getPlayerSide())?.commandDesignation??'');
 const isAirborne=selectedArmy==='PLAAF-AIRBORNE-CORPS';
 const n=Number((selectedArmy.match(/\d+/)||[])[0])||71;
 brigade.replaceChildren(new Option('选择旅级番号（公开参考／虚构）',''));
 const formations=isAirborne?FORMATION_DESIGNATIONS.filter(x=>x.parent==='PLAAF-AIRBORNE-CORPS'&&x.echelon==='brigade'):FORMATION_DESIGNATIONS.filter(x=>x.parent===`PLA-ARMY-${n}`&&x.echelon==='brigade');
 for(const f of formations)brigade.add(new Option(`${f.name} · ${f.status==='fictional'?'游戏虚构':'二手资料·待核实'}`,f.name));
 const honors=FORMATION_DESIGNATIONS.filter(x=>x.status==='honor'&&x.echelon==='brigade');
 for(const h of honors)brigade.add(new Option(`${h.name} · 历史团级荣誉（游戏旅级）`,h.name));
 battalion.replaceChildren(new Option('选择虚拟营级番号／荣誉称号',''));
 const branch=isAirborne?'空军空降兵':'陆军';
 for(const f of FORMATION_DESIGNATIONS.filter(x=>x.branch===branch&&x.echelon==='battalion'&&x.status==='fictional'))battalion.add(new Option(`${f.name}（虚构）`,f.name));
 for(const h of FORMATION_DESIGNATIONS.filter(x=>x.status==='honor'&&x.echelon==='battalion'))battalion.add(new Option(`${h.name}（历史荣誉）`,h.name));
 const company=host.querySelector('#cmdCompanyPreset');if(company){company.replaceChildren(new Option('选择连级虚拟番号／荣誉称号',''));for(const f of FORMATION_DESIGNATIONS.filter(x=>x.branch===branch&&x.echelon==='company'&&x.status==='fictional'))company.add(new Option(`${f.name}（虚构）`,f.name));for(const h of FORMATION_DESIGNATIONS.filter(x=>x.status==='honor'&&x.echelon==='company'))company.add(new Option(`${h.name}（历史荣誉）`,h.name));}
}
// V1.6.19: preserve each company's actual name, and give opposing sides distinct
// brigade references. These are scenario game designations, NOT verified real deployments.
function cmdAutoUnitLabels(){
 // Actual participants already carry catalog identities from GroupArmySystem.
 // Never fabricate a replacement brigade number from a historical/preset list.
 if(currentScenarioConfig?.groupArmySelection===true)return;
 if(!(cmdIsArmyScale()||currentScenarioConfig?.modernBrigadeSelection===true))return;
 const active=units.filter(u=>u&&!u.offMap);
 const byId=new Map(active.map(u=>[String(u.id),u]));
 const source=FORMATION_DESIGNATIONS.filter(f=>f.echelon==='brigade'&&f.status==='secondary'&&f.branch==='陆军');
 const nums=[...new Set(source.map(f=>Number(f.name.match(/第(\d+)合成旅/)?.[1])).filter(Number.isFinite))];
 let honorOptions={red:true,blue:true};
 try{honorOptions={...honorOptions,...JSON.parse(sessionStorage.getItem('modernHonorSelection')||'{}')};}catch{}
 const honorMap=new Map(source.filter(f=>f.honor).map(f=>[Number(f.name.match(/第(\d+)合成旅/)?.[1]),f.honor]));
 const honorEntries=FORMATION_DESIGNATIONS.filter(f=>f.status==='honor');
 // Snapshot ranks and parent chains BEFORE mutating any label.
 const ranks=new Map(active.map(u=>[String(u.id),cmdEchelon(u)]));
 function brigadeRoot(u){let x=u;const seen=new Set();while(x&&!seen.has(String(x.id))){seen.add(String(x.id));if(ranks.get(String(x.id))==='brigade')return x;const id=cmdParentId(x);x=id==null?null:byId.get(String(id));}return null;}
 function key(u){const r=brigadeRoot(u);if(r)return `${getUnitSide(u)}:root:${r.id}`;const ix=Number(u.brigadeIndex??u.modern?.brigadeIndex??u.formationIndex??1);return `${getUnitSide(u)}:index:${Number.isFinite(ix)&&ix>0?ix:1}`;}
 const keys=new Map(active.map(u=>[String(u.id),key(u)]));
 const groups=[...new Set(keys.values())].sort();
 const assigned=new Map(),taken=new Set();
 for(const group of groups){
  const members=active.filter(u=>keys.get(String(u.id))===group);
  const explicit=members.map(u=>String(u.brigadeDesignation||u.designation||u.originalFormationName||u.name||'').match(/第(\d+)合成旅/)).find(Boolean);
  let n=explicit?Number(explicit[1]):null;
  if(!Number.isFinite(n)||n<=0)n=null;
  if(n==null){const seed=[...group].reduce((v,c)=>(v*33+c.charCodeAt(0))>>>0,5381);for(let j=0;j<nums.length;j++){const candidate=nums[(seed+j)%nums.length];if(!taken.has(candidate)){n=candidate;break;}}n??=1000+assigned.size;}
  assigned.set(group,n);taken.add(n);
 }
 for(const u of active){
  // 朱日和第195旅是固定身份，禁止历史旅番号抽签覆盖显示名。
  if(u.fixedBrigade===true && String(u.brigadeCode||u.gameBrigadeCode)==='195B'){
    const clean=String(u.fullName||u.name||u.id).split('｜')[0]
      .replace(/^(?:蓝方|红方)/,'')
      .replace(/^第\d+(?:重型)?合成旅[·・:：\s-]*/, '')
      .replace(/^第195重型合成旅[·・:：\s-]*/, '');
    const title=u.echelon==='brigade'?'195旅旅指':`第195重型合成旅·${clean}`;
    u.fullName=u.echelon==='brigade'?'195旅旅指':clean;
    u.displayFormationName=title;
    u.originalFormationName=u.fullName;
    u.gameBrigadeDesignation='第195重型合成旅';
    u.brigadeDesignation='195旅';
    u.gameBrigadeCode='195B';u.brigadeCode='195B';
    u.honorParticipationDisabled=true;u.gameBrigadeHonor='';
    continue;
  }
  const original=String(u.originalFormationName||u.nameZh||u.name||u.id).split('｜')[0].trim();
  if(!u.originalFormationName)u.originalFormationName=original;
  const rank=ranks.get(String(u.id)),number=assigned.get(keys.get(String(u.id)));
  if(!Number.isFinite(number))continue;
  const brigade=`第${number}合成旅`;
  u.gameBrigadeDesignation=brigade;
  const allowHonor=honorOptions[getUnitSide(u)]!==false;
  u.honorParticipationDisabled=!allowHonor;
  u.gameBrigadeHonor=allowHonor?(honorMap.get(number)||''):'';
  const explicitHonor=String(u.honorTitle||u.honorName||u.honoraryName||'').trim();
  const matched=honorEntries.find(h=>h.echelon===rank&&(explicitHonor===h.name||original.includes(h.name)));
  if(allowHonor&&(matched||explicitHonor)){u.displayFormationName=matched?.name||explicitHonor;continue;}
  if(u.commandDesignation&&!u.autoGenerated){u.displayFormationName=u.commandDesignation;continue;}
  if(rank==='brigade'){u.displayFormationName=(allowHonor?honorMap.get(number):null)||brigade;continue;}
  if(rank==='army'||rank==='other'){u.displayFormationName=original;continue;}
  let detail=original.replace(/^(红方|蓝方|解放军|我方|敌方)/,'').trim();
  // Strip old brigade prefix, but keep every battalion/company-specific suffix.
  detail=detail.replace(/^第(?:undefined|\d+)(?:重型|中型|轻型|两栖|山地|城市突击)?合成旅[·・:：\s-]*/, '');
  detail=detail.replace(/第undefined合成旅/g,'');
  if(!detail)detail=String(u.id);
  u.displayFormationName=`${brigade}·${detail}`;
 }
}
function cmdDesignation(u){return String(u?.commandDesignation||u?.designation||unitName(u));}
function cmdApplyDesignation(){
 const host=document.getElementById('brigadeCommandPanel');if(!host)return;
 const selected=units.find(x=>String(x.id)===String(host.querySelector('#cmdUnit')?.value));
 const armyPreset=host.querySelector('#cmdArmyPreset')?.value||'';
 const brigadePreset=host.querySelector('#cmdBrigadePreset')?.value||'';
 const battalionPreset=host.querySelector('#cmdBattalionPreset')?.value||'';
 const companyPreset=host.querySelector('#cmdCompanyPreset')?.value||'';
 const text=host.querySelector('#cmdDesignation')?.value.trim()||'';
 if(!text||text.length>70)return;
 // The formation preset is not the selected combat unit: never turn a battalion/company into a brigade.
 const rank=selected?cmdEchelon(selected):'other';
 const isBrigade=brigadePreset&&text===brigadePreset;
 const isBattalion=battalionPreset&&text===battalionPreset;
 const isCompany=companyPreset&&text===companyPreset;
 const isArmy=armyPreset&&text===armyPreset;
 const needed=isArmy?'army':isBrigade?'brigade':isBattalion?'battalion':isCompany?'company':null;
 if(needed&&rank!==needed){
   const row=needed==='army'?'#cmdArmy':needed==='brigade'?'#cmdBrigade':needed==='company'?'#cmdCompany':'#cmdBattalion';
   const candidate=units.find(x=>String(x.id)===String(host.querySelector(row)?.value));
   if(!candidate||cmdEchelon(candidate)!==needed){
     cmdLog(`番号未应用：${text}属于${needed==='army'?'集团军':needed==='brigade'?'旅':needed==='company'?'连':'营'}级，请先选择对应层级的指挥机构；不会更改${selected?unitName(selected):'当前单位'}的名称。`);
     cmdUpdatePanel();return;
   }
   candidate.commandDesignation=text;candidate.displayFormationName=text;
   cmdLog(`${unitName(candidate)}：设置${needed==='army'?'集团军':needed==='brigade'?'旅':needed==='company'?'连':'营'}级显示番号 ${text}。`);
 }else{
   if(!selected){cmdLog('请先选择要设置番号的单位。');cmdUpdatePanel();return;}
   // A free-form designation cannot silently promote a company/battalion into a higher echelon.
   if((rank==='battalion'||rank==='company')&&(/集团军|合成旅|炮兵旅|防空旅|工兵旅|陆航旅|保障旅|临汾旅/.test(text))){
     cmdLog(`番号未应用：${text}是上级编制名称，不能覆盖${unitName(selected)}的单位番号。`);cmdUpdatePanel();return;
   }
   selected.commandDesignation=text;selected.displayFormationName=text;
   cmdLog(`${unitName(selected)}：显示番号设为 ${text}。`);
 }
 cmdSave();cmdUpdatePanel();
}
function cmdEligibleUnits(){return units.filter(u=>u&&!u.offMap&&isUnitAlive(u)&&getUnitSide(u)===getPlayerSide());}
// V1.6.11: order engine. Commands use existing movement validation and preserve unit IDs.
let cmdPickingTarget=false;
const CMD_NAMES={RECON_SECURITY:'侦察警戒',ATTACK_MOVE:'攻击前往',MOVE:'机动前往',CAPTURE:'攻占目标',DEFEND:'防守目标',REINFORCE:'增援目标'};
function cmdObjectiveOptions(){
 const own=strategicObjectives?.objectives?.()||[];
 return own.filter(o=>Number.isFinite(Number(o.q))&&Number.isFinite(Number(o.r))&&o.q!=null&&o.r!=null);
}
function cmdSubordinates(parent){
 const children=units.filter(x=>x&&!x.offMap&&isUnitAlive(x)&&getUnitSide(x)===getUnitSide(parent));
 const found=[],visited=new Set([String(parent.id)]),queue=[parent];
 while(queue.length){const p=queue.shift();for(const u of children){if(visited.has(String(u.id)))continue;const ref=cmdParentId(u);if(ref!=null&&(String(ref)===String(p.id)||String(ref)===String(unitName(p)))){visited.add(String(u.id));found.push(u);queue.push(u);}}}
 return found.length?found:[parent];
}
function cmdIssue(){
 const host=document.getElementById('brigadeCommandPanel'),sel=host?.querySelector('#cmdUnit');
 const u=units.find(x=>String(x.id)===String(sel?.value));if(!u||getUnitSide(u)!==getPlayerSide())return;
 const type=host.querySelector('#cmdOrderType').value,choice=host.querySelector('#cmdObjective').value;
 const objective=cmdObjectiveOptions().find(o=>String(o.id)===choice);
 const coords=(host.querySelector('#cmdCoords').value||'').match(/^\s*(-?\d+)\s*[,， ]\s*(-?\d+)\s*$/);
 const q=objective?Number(objective.q):coords?Number(coords[1]):NaN;
 const r=objective?Number(objective.r):coords?Number(coords[2]):NaN;
 if(type!=='RECON_SECURITY'&&(!Number.isFinite(q)||!Number.isFinite(r))){cmdLog('请选择带坐标的战略目标，或输入地图坐标。');cmdUpdatePanel();return;}
 const duration=Math.max(0,Math.min(999,Number(host.querySelector('#cmdDuration')?.value)||0));
 const members=cmdSubordinates(u).filter(x=>cmdEchelon(x)==='company'||x===u||cmdEchelon(x)==='other');
 const assignees=members.length?members:[u];
 for(const member of assignees){for(const old of brigadeCommand.tasks){if(String(old.unitId)===String(member.id)&&old.status==='ACTIVE')old.status='REPLACED';}
 const task={id:'ORDER-'+(++brigadeCommand.sequence),formationIndex:assignees.indexOf(member),type,unitId:member.id,commanderId:u.id,side:getUnitSide(member),q:type==='RECON_SECURITY'?Number(member.q):q,r:type==='RECON_SECURITY'?Number(member.r):r,radius:Math.max(1,Math.min(12,Number(host.querySelector('#cmdRadius')?.value)||4)),duration,started:Number(turnSystem?.turn)||1,lastProcessed:-1,status:'ACTIVE',observations:0,disconnectedTurns:0,objectiveId:objective?.id||null};brigadeCommand.tasks.push(task);}
 cmdLog(`${unitName(u)}下达${CMD_NAMES[type]}命令（结束本回合后执行），受令单位${assignees.length}个${type==='RECON_SECURITY'?'':`，目标(${q},${r})`}。`);cmdSave();cmdUpdatePanel();
}
function cmdAIAirborne(side){
 const reserve=airborneReserves[side];if(!Array.isArray(reserve)||!reserve.length)return;
 const objectives=(scenario?.strategicObjectives?.[side]||[]).filter(o=>o.q!=null&&o.r!=null);
 const target=objectives.find(o=>o.action==='capture')||objectives[0];
 const enemy=units.filter(u=>isUnitAlive(u)&&!u.offMap&&getUnitSide(u)!==side);
 const base=target||enemy[0];if(!base)return;
 const {width,height}=airDropMapSize();let best=null,score=Infinity;
 for(let dq=-4;dq<=4;dq++)for(let dr=-4;dr<=4;dr++){
 const q=Number(base.q)+dq,r=Number(base.r)+dr;if(q<0||r<0||q>=width||r>=height)continue;
 const terrain=String(world?.terrainAt?.(q,r)||'plain').toLowerCase();if(['water','deep_water','cliff','mountain','steepmountain','swamp','marsh','wetland'].includes(terrain))continue;
 if(units.some(u=>isUnitAlive(u)&&!u.offMap&&Number(u.q)===q&&Number(u.r)===r))continue;
 const near=enemy.reduce((n,u)=>n+(cmdHexDistance({q,r},u)<=2?1:0),0);
 const value=cmdHexDistance({q,r},base)*10+near*30;
 if(value<score){score=value;best={q,r};}}
 if(!best)return;
 const unit=reserve[0];const selection=JSON.parse(sessionStorage.getItem('modernAirborneSelection')||'null')?.[side];
 const capacity=AIRBORNE_DECK.aircraft.reduce((n,a)=>n+Math.max(0,Number(selection?.aircraft?.[a.id])||0)*a.transportPoints,0);
 if(capacity<Number(unit.airborneTransportCost||0))return;
 reserve.shift();unit.q=best.q;unit.r=best.r;unit.offMap=false;unit.airborneReserve=false;unit.airborneDeployed=true;unit.airborneDisorganized=1;unit.airDropTurn=Number(turnSystem?.turn||1);unit.movementPoints=0;unit.actionPoints=0;unit.hasActed=true;unit.hasMoved=true;unit.hasAttacked=false;units.push(unit);unit.aiAirborneTarget={q:Number(base.q),r:Number(base.r)};
 writeBattleMessage(`${FactionSystem.getSideName(side)} AI空降：${unitName(unit)}部署至(${best.q},${best.r})`);
}
function cmdOrderDestination(u,t){
 // 防守/增援任务：每个连队分配不同的相邻地块，避免堆叠与集中暴露。
 if(t.type!=='DEFEND'&&t.type!=='REINFORCE')return {q:Number(t.q),r:Number(t.r)};
 const offsets=[[0,0],[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1],[2,0],[-2,0],[0,2],[0,-2]];
 const start=(Number(t.formationIndex)||0)%offsets.length;
 for(let k=0;k<offsets.length;k++){
  const [dq,dr]=offsets[(start+k)%offsets.length],q=Number(t.q)+dq,r=Number(t.r)+dr;
  if(q<0||r<0||q>=Number(world?.width||scenario?.width||9999)||r>=Number(world?.height||scenario?.height||9999))continue;
  if(units.some(x=>x!==u&&isUnitAlive(x)&&!x.offMap&&Number(x.q)===q&&Number(x.r)===r))continue;
  return {q,r};
 }
 return {q:Number(t.q),r:Number(t.r)};
}
function cmdExecuteMovement(u,t,destination){
 const target=destination||{q:Number(t.q),r:Number(t.r)};
 if(cmdHexDistance(u,target)===0)return 'ARRIVED';
 if(Number(u.movementPoints??0)<=0||u.hasMoved===true)return 'WAIT';
 movementSystem.selectUnit(u,units);
 const reachable=movementSystem.reachable;if(!reachable?.size)return 'BLOCKED';
 let best=null,score=Infinity;
 const oldDistance=cmdHexDistance(u,target);
 const enemies=units.filter(x=>isUnitAlive(x)&&!x.offMap&&getUnitSide(x)!==getUnitSide(u));
 for(const [key,cost] of reachable){const [q,r]=key.split(',').map(Number);if(q===Number(u.q)&&r===Number(u.r))continue;
  if(units.some(x=>x!==u&&isUnitAlive(x)&&!x.offMap&&Number(x.q)===q&&Number(x.r)===r))continue;
  const dist=cmdHexDistance({q,r},target);
  const danger=enemies.reduce((n,e)=>n+(cmdHexDistance({q,r},e)<=1?1:0),0);
  const defensive=(t.type==='DEFEND'||t.type==='REINFORCE');
  const value=dist*100+danger*(t.type==='MOVE'?80:defensive?50:8)+Number(cost||0);
  if(value<score){score=value;best={q,r,dist};}
 }
 if(!best||best.dist>=oldDistance)return 'BLOCKED';
 const result=movementSystem.moveTo(best.q,best.r,units);return result?.success?'MOVED':'BLOCKED';
}
function cmdProcessOrder(u,t){
 if(t.duration&&Number(turnSystem.turn)-t.started>=t.duration){t.status='COMPLETE';cmdLog(`${unitName(u)}：任务期限结束。`);return;}
 const destination=cmdOrderDestination(u,t);
 if((t.type==='DEFEND'||t.type==='REINFORCE')&&cmdHexDistance(u,destination)===0){t.progress='HOLDING';return;}
 if(t.type==='CAPTURE'&&cmdHexDistance(u,t)===0){t.status='COMPLETE';t.progress='CAPTURED';return;}
 if(t.type==='MOVE'&&cmdHexDistance(u,t)===0){t.status='COMPLETE';t.progress='ARRIVED';return;}
 if(t.type==='ATTACK_MOVE'&&cmdHexDistance(u,t)===0){t.status='COMPLETE';t.progress='ARRIVED';return;}
 const result=cmdExecuteMovement(u,t,destination);t.progress=result;
 if(result==='ARRIVED'&&(t.type==='DEFEND'||t.type==='REINFORCE'))t.progress='HOLDING';
 if(result==='BLOCKED'){t.blockedTurns=(t.blockedTurns||0)+1;if(t.blockedTurns===1||t.blockedTurns%3===0)cmdLog(`${unitName(u)}：前往(${t.q},${t.r})受阻，等待可用通路。`);}else t.blockedTurns=0;
}
function cmdProcess(fromEndTurn=false){if(!fromEndTurn||!turnSystem||!currentScenarioKey)return;const key=`${turnSystem.turn}:${normalizeSide(turnSystem.phase)}`;if(key===brigadeCommand.lastPhaseKey)return;brigadeCommand.lastPhaseKey=key;let changed=false;for(const t of brigadeCommand.tasks){if(t.status!=='ACTIVE'||t.side!==normalizeSide(turnSystem.phase)||t.lastProcessed===Number(turnSystem.turn))continue;const u=units.find(x=>String(x.id)===String(t.unitId));t.lastProcessed=Number(turnSystem.turn);changed=true;if(!u||!isUnitAlive(u)){t.status='FAILED';cmdLog(`${t.id}：执行单位已失去作战能力。`);continue;}const c=cmdCoverage(u);t.disconnectedTurns=c.connected?0:t.disconnectedTurns+1;if(c.interference>0&&c.connected){t.delayTurns=(t.delayTurns||0)+1;if(t.delayTurns%2===1)cmdLog(`${unitName(u)}：电磁干扰导致情报报告延迟。`);}if(t.disconnectedTurns>=2){t.commandPenalty=Math.min(3,t.disconnectedTurns-1);t.delayTurns=(t.delayTurns||0)+1;}else t.commandPenalty=0;if(t.disconnectedTurns>=3){t.status='PAUSED';cmdLog(`${unitName(u)}连续3次失联，侦察警戒任务暂停。`);continue;}if(t.duration&&Number(turnSystem.turn)-t.started>=t.duration){t.status='COMPLETE';cmdLog(`${unitName(u)}侦察警戒任务到期完成。`);continue;}if(t.type&&t.type!=='RECON_SECURITY'){cmdProcessOrder(u,t);continue;}const known=infoContactsFor(t.side).filter(c=>c.lastSeenTurn===Number(turnSystem.turn)&&cmdHexDistance({q:t.q,r:t.r},c)<=t.radius); t.observations+=known.length;if(known.length)cmdLog(`${unitName(u)}警戒报告：观察范围内发现${known.length}个单位目标（未经进一步识别）。`);if(!c.connected&&t.disconnectedTurns===1)cmdLog(`${unitName(u)}超出指挥范围，通信受限。`);}if(changed)cmdSave();}
function cmdUpdatePanel(){
 const host=document.getElementById('brigadeCommandPanel');if(!host)return;
 const h=cmdHierarchy(),asel=host.querySelector('#cmdArmy'),rsel=host.querySelector('#cmdBrigade'),bsel=host.querySelector('#cmdBattalion'),csel=host.querySelector('#cmdCompany'),sel=host.querySelector('#cmdUnit');
 const title=host.querySelector('#cmdTitle'),caption=host.querySelector('#cmdCaption'),armyRow=host.querySelector('#cmdArmyRow'),brigadeRow=host.querySelector('#cmdBrigadeRow');
 title.textContent=h.armyScale?'集团军指挥 · 旅营连层级':'旅级指挥 · 营连层级';caption.textContent=h.armyScale?'GROUP ARMY COMMAND / BRIGADE CONTROL':'BRIGADE COMMAND / BATTALION CONTROL';
 armyRow.hidden=!h.armyScale;brigadeRow.hidden=!h.armyScale;
 const fill=(select,items,emptyLabel,old)=>{select.replaceChildren();for(const u of items){const o=document.createElement('option');o.value=String(u.id);o.textContent=cmdDesignation(u);select.appendChild(o);}if(emptyLabel){const o=document.createElement('option');o.value='__unassigned';o.textContent=emptyLabel;select.appendChild(o);}if([...select.options].some(o=>o.value===old))select.value=old;};
 const oldA=asel.value,oldR=rsel.value,oldB=bsel.value,oldC=csel.value;
 if(h.armyScale){fill(asel,h.armies,'集团军直属及未编组旅级单位',oldA);
 const rs=asel.value==='__unassigned'?h.unassignedBrigades:(h.armyBrigades.get(asel.value)||[]);
 // 只有明确隶属字段才建立集团军—旅关系；无集团军机构时列出全部旅，避免空白。
 fill(rsel,h.armies.length?rs:h.brigades,'未编组营级单位',oldR);
 const bs=rsel.value==='__unassigned'?h.unassignedBattalions:(h.brigadeBattalions.get(rsel.value)||[]);
 fill(bsel,h.brigades.length?bs:h.battalions,'未编组连级单位',oldB);
 }else fill(bsel,h.battalions,'未编组连级单位',oldB);
 const bn=h.battalions.find(u=>String(u.id)===bsel.value);
 const cs=bsel.value==='__unassigned'?h.unassigned:(h.children.get(bsel.value)||[]);
 fill(csel,cs,null,oldC);
 // 营部本身始终可以作为任务执行单位；直属连队按真实 parentHQ 展开。
 if(bn){const opt=document.createElement('option');opt.value=String(bn.id);opt.textContent='◆ 营部：'+unitName(bn);csel.insertBefore(opt,csel.firstChild);if(!oldC||![...csel.options].some(o=>o.value===oldC))csel.value=String(bn.id);}

 const selected=[...csel.options].some(o=>o.value===sel.value)?sel.value:null;
 sel.value=selected||(bn?String(bn.id):(cs[0]?String(cs[0].id):h.armyScale&&rsel.value!=='__unassigned'?rsel.value:''));
 const results=host.querySelector('#cmdSearchResults'),term=(host.querySelector('#cmdSearch')?.value||'').trim().toLowerCase();results.replaceChildren();
 if(term){
  // 数字番号只能与本单位所属旅的结构化编号匹配，不能在长名称中任意命中。
  const normalized=term.replace(/^第/,'').replace(/(?:合成|空中突击|重型|中型|轻型|两栖|山地)?旅$/,'').replace(/b$/,'');
  const isBrigadeNumber=/^\d{1,4}$/.test(normalized);
  const matches=cmdEligibleUnits().filter(u=>{
    const name=String(u.displayFormationName||u.fullName||u.nameZh||u.name||'');
    const shown=[u.commandDesignation,u.designation,u.fullName,u.name,cmdDesignation(u)].map(x=>String(x||''));
    const code=String(u.gameBrigadeCode||u.brigadeCode||'').replace(/B$/i,'');
    if(isBrigadeNumber){
      // The actual unit name is authoritative when it explicitly identifies a brigade.
      // Never show a 第162合成旅 merely because a stale brigadeCode says 299B.
      const explicit=name.match(/第\s*(\d{1,4})\s*(?:合成|空中突击|重型|中型|轻型|两栖|山地)?旅/);
      if(explicit)return explicit[1]===normalized;
      const designation=shown.map(x=>x.match(/第\s*(\d{1,4})\s*(?:合成|空中突击|重型|中型|轻型|两栖|山地)?旅/)).find(Boolean);
      if(designation)return designation[1]===normalized;
      return code===normalized;
    }
    const searchable=[u.id,u.gameBrigadeCode,u.brigadeCode,u.equipmentSummary,...shown].map(x=>String(x||'').toLowerCase());
    return searchable.some(x=>x.includes(term));
  }).slice(0,150);
  for(const u of matches){const btn=document.createElement('button');btn.type='button';btn.className='c4-search-result';btn.textContent=`⌖ 定位 ${cmdDesignation(u)} · ${cmdEchelon(u)||'直属/其他'} · (${u.q}, ${u.r})`;
   btn.onclick=()=>{sel.value=String(u.id);host.dataset.searchSelected=String(u.id);const kind=cmdEchelon(u),parent=cmdParentId(u);
    if(kind==='company'){const b=h.battalions.find(x=>String(x.id)===String(parent)||unitName(x)===String(parent));if(b){bsel.value=String(b.id);const r=h.brigades.find(x=>String(x.id)===String(cmdParentId(b)));if(r&&h.armyScale){rsel.value=String(r.id);const a=h.armies.find(x=>String(x.id)===String(cmdParentId(r)));if(a)asel.value=String(a.id);}}}
    else if(kind==='battalion')bsel.value=String(u.id);
    else if(kind==='brigade'&&h.armyScale)rsel.value=String(u.id);
    const targetCode=String(u.gameBrigadeCode||u.brigadeCode||'');
    const targetArmy=String(u.groupArmyCode||u.gameArmyCode||'');
    if(h.armyScale){
      const a=h.armies.find(x=>String(x.groupArmyCode||x.gameArmyCode||'')===targetArmy);
      if(a)asel.value=String(a.id);
      const r=h.brigades.find(x=>String(x.gameBrigadeCode||x.brigadeCode||'')===targetCode && String(x.groupArmyCode||x.gameArmyCode||'')===targetArmy);
      if(r)rsel.value=String(r.id);
    }
    selectUnit(u);showUnitInfo(u);cmdFocusHex(u.q,u.r);cmdShowSelected();results.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');};
   results.appendChild(btn);
  }
  if(!matches.length)results.textContent='没有找到匹配的己方已部署单位。';
  if(/^(?:直-?20|直-?8|运输|直升机|helicopter)$/i.test(term)&&!matches.length){const tip=document.createElement('div');tip.textContent='当前战场未找到已部署的对应直升机；请检查是否选择空突旅编组。';results.appendChild(tip);}
 }
 if(host.dataset.searchSelected){const selectedUnit=units.find(u=>String(u.id)===host.dataset.searchSelected);if(selectedUnit&&getUnitSide(selectedUnit)===getPlayerSide())sel.value=String(selectedUnit.id);else delete host.dataset.searchSelected;}

 const objSelect=host.querySelector('#cmdObjective');const previous=objSelect.value;objSelect.replaceChildren();const custom=document.createElement('option');custom.value='';custom.textContent='自定义坐标';objSelect.appendChild(custom);for(const obj of cmdObjectiveOptions()){const o=document.createElement('option');o.value=String(obj.id);o.textContent=`${obj.title||obj.name||obj.id} (${obj.q},${obj.r})`;objSelect.appendChild(o);}if([...objSelect.options].some(o=>o.value===previous))objSelect.value=previous;
 cmdShowSelected();const current=units.find(x=>String(x.id)===String(sel.value));if(current&&document.activeElement!==host.querySelector('#cmdDesignation'))host.querySelector('#cmdDesignation').value=current.commandDesignation||'';const list=host.querySelector('#cmdTaskList');list.replaceChildren();for(const t of brigadeCommand.tasks.slice(-8).reverse()){const target=units.find(x=>String(x.id)===String(t.unitId));const div=document.createElement('div');div.className='c4-command-task';div.textContent=`${target?unitName(target):t.unitId} · ${CMD_NAMES[t.type]||t.type} · ${t.status} · ${t.progress||((t.observations||0)+'条观察')}`;if(t.status==='ACTIVE'||t.status==='PAUSED'){const btn=document.createElement('button');btn.textContent=t.status==='ACTIVE'?'取消':'恢复';btn.onclick=()=>{t.status=t.status==='ACTIVE'?'CANCELLED':'ACTIVE';t.disconnectedTurns=0;cmdLog(`${t.id}：${t.status}`);cmdSave();cmdUpdatePanel();};div.appendChild(btn);}list.appendChild(div);}host.querySelector('#cmdLog').textContent=brigadeCommand.log.slice(0,7).join('\n')||'暂无指挥报告';
}
function cmdFocusHex(q,r){
 q=Number(q);r=Number(r);if(!Number.isFinite(q)||!Number.isFinite(r))return false;
 const pos=renderer.worldToScreen(q,r),dx=canvas.width/2-pos.x,dy=canvas.height/2-pos.y;
 if(Number.isFinite(camera.x))camera.x+=dx;
 if(Number.isFinite(camera.y))camera.y+=dy;
 if(Number.isFinite(camera.offsetX))camera.offsetX+=dx;
 if(Number.isFinite(camera.offsetY))camera.offsetY+=dy;
 render();return true;
}
function cmdShowSelected(){const host=document.getElementById('brigadeCommandPanel');if(!host)return;const u=units.find(x=>String(x.id)===String(host.querySelector('#cmdUnit').value));const info=host.querySelector('#cmdCoverageInfo');if(!u){info.textContent='当前层级没有明确编组单位，可使用单位名称搜索。';return;}const c=cmdCoverage(u);info.textContent=`${cmdEchelon(u)==='battalion'?'营级 · ':cmdEchelon(u)==='company'?'连级 · ':''}${cmdDesignation(u)} · ${c.connected?'指挥联通':'通信受限'} · ${c.hq?unitName(c.hq):'无上级指挥所'}${c.distance!=null?' · '+c.distance+'/'+c.radius+'格':''}`;}
function cmdInstallPanel(){if(document.getElementById('brigadeCommandPanel'))return;
 const host=document.createElement('section');host.id='brigadeCommandPanel';host.innerHTML=`<header class="c4-command-header"><div><small id="cmdCaption">BRIGADE COMMAND / BATTALION CONTROL</small><h2 id="cmdTitle">旅级指挥 · 营连层级</h2></div><button id="cmdClose">关闭 ✕</button></header><label class="c4-search-label">单位名称搜索<input id="cmdSearch" type="search" placeholder="输入299、299B、直-20或运输；按编制番号筛选" autocomplete="off"></label><div id="cmdSearchResults" class="c4-search-results"></div><div class="c4-command-grid"><label id="cmdArmyRow" hidden>第一层 · 集团军<select id="cmdArmy"></select></label><label id="cmdBrigadeRow" hidden>第二层 · 旅级机构<select id="cmdBrigade"></select></label><label>营级机构<select id="cmdBattalion"></select></label><label>第二层 · 营部或所属连队<select id="cmdCompany"></select></label></div><input type="hidden" id="cmdUnit"><div class="c4-command-grid"><label>集团军番号参考<select id="cmdArmyPreset"><option value="">选择公开集团军番号</option></select></label><label>旅级番号名单<select id="cmdBrigadePreset"><option value="">选择旅级番号</option></select></label><label>营级虚拟番号<select id="cmdBattalionPreset"><option value="">选择营级番号</option></select></label><label>连级番号／荣誉称号<select id="cmdCompanyPreset"></select></label><label>本场景单位显示番号<input id="cmdDesignation" placeholder="例如 第72集团军 / 第1合成旅"></label><button type="button" id="cmdSetDesignation">应用显示番号</button></div><div id="cmdCoverageInfo" class="c4-command-status"></div><div class="c4-command-grid"><label>警戒半径（格）<input id="cmdRadius" type="number" min="1" max="12" value="4"></label><label>持续回合（0为持续）<input id="cmdDuration" type="number" min="0" max="999" value="6"></label></div><div class="c4-command-grid"><label>命令类型<select id="cmdOrderType"><option value="ATTACK_MOVE">攻击前往</option><option value="MOVE">机动前往</option><option value="CAPTURE">攻占目标</option><option value="DEFEND">防守目标</option><option value="REINFORCE">增援目标</option><option value="RECON_SECURITY">侦察警戒</option></select></label><label>战役目标<select id="cmdObjective"><option value="">自定义坐标</option></select></label><label>目标坐标 q,r<input id="cmdCoords" placeholder="例如 24,18"></label><button type="button" id="cmdPickMap">在地图上选点</button><button type="button" id="cmdLocateObjective">⌖ 定位任务地块</button><button type="button" id="cmdLocateUnit">⌖ 定位选中单位</button></div><button id="cmdIssue" class="c4-command-primary">下达作战命令</button><h3>当前任务</h3><div id="cmdTaskList"></div><h3>指挥日志</h3><pre id="cmdLog"></pre><small>优先选择营级机构，展开后可选择有明确隶属关系的连队。未编组单位单独显示，不自动推断编制。</small>`;
 for(const el of host.querySelectorAll('#cmdArmyPreset,#cmdBrigadePreset,#cmdBattalionPreset,#cmdCompanyPreset,#cmdDesignation,#cmdSetDesignation')){const label=el.closest('label');if(label)label.hidden=true;else el.hidden=true;} host.querySelector('#cmdSetDesignation').hidden=true;
 document.body.appendChild(host);const trigger=document.createElement('button');trigger.id='brigadeCommandToggle';trigger.textContent='▣ 指挥系统';document.body.appendChild(trigger);
 trigger.onclick=()=>{const other=document.getElementById('c4isrDashboard');if(other)other.style.display='none';host.style.display='block';trigger.style.display='none';cmdUpdatePanel();};host.querySelector('#cmdClose').onclick=()=>{host.style.display='none';trigger.style.display='block';};host.style.display='none';trigger.style.display='block';host.querySelector('#cmdIssue').onclick=cmdIssue;
 const preset=host.querySelector('#cmdArmyPreset');for(const [theater,nums] of Object.entries(CMD_GROUP_ARMIES))for(const n of nums){const o=document.createElement('option');o.value=`第${n}集团军`;o.textContent=`${theater}战区陆军 · 第${n}集团军`;preset.appendChild(o);}preset.add(new Option('空军 · 空降兵军（独立系统）','PLAAF-AIRBORNE-CORPS'));preset.onchange=()=>{cmdPopulateFormationPresets();if(preset.value)host.querySelector('#cmdDesignation').value=preset.value==='PLAAF-AIRBORNE-CORPS'?'空军空降兵军':preset.value;};cmdPopulateFormationPresets();for(const id of ['cmdBrigadePreset','cmdBattalionPreset','cmdCompanyPreset'])host.querySelector('#'+id).onchange=()=>{const chosen=host.querySelector('#'+id).value;if(chosen)host.querySelector('#cmdDesignation').value=chosen;};host.querySelector('#cmdSetDesignation').onclick=cmdApplyDesignation;
 host.querySelector('#cmdPickMap').onclick=()=>{cmdPickingTarget=true;host.style.display='none';document.getElementById('brigadeCommandToggle').style.display='block';writeBattleMessage('指挥系统：点击地图选择命令目标，ESC取消');};
 host.querySelector('#cmdLocateUnit').onclick=()=>{const u=units.find(x=>String(x.id)===String(host.querySelector('#cmdUnit').value));if(u&&!u.offMap){cmdFocusHex(u.q,u.r);selectUnit(u);showUnitInfo(u);}else cmdLog('所选单位不在地图上。');};
 host.querySelector('#cmdLocateObjective').onclick=()=>{const obj=cmdObjectiveOptions().find(o=>String(o.id)===host.querySelector('#cmdObjective').value);const xy=host.querySelector('#cmdCoords').value.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/);if(obj)cmdFocusHex(obj.q,obj.r);else if(xy)cmdFocusHex(+xy[1],+xy[2]);else cmdLog('请先选择具有坐标的任务目标。');};
 host.querySelector('#cmdObjective').onchange=()=>{const o=cmdObjectiveOptions().find(x=>String(x.id)===host.querySelector('#cmdObjective').value);if(o)host.querySelector('#cmdCoords').value=`${o.q},${o.r}`;};
 host.querySelector('#cmdSearch').oninput=()=>{delete host.dataset.searchSelected;cmdUpdatePanel();};host.querySelector('#cmdArmy').onchange=()=>{host.querySelector('#cmdBrigade').value='';cmdUpdatePanel();};host.querySelector('#cmdBrigade').onchange=()=>{host.querySelector('#cmdBattalion').value='';cmdUpdatePanel();};host.querySelector('#cmdBattalion').onchange=()=>{delete host.dataset.searchSelected;host.querySelector('#cmdCompany').value='';cmdUpdatePanel();};host.querySelector('#cmdCompany').onchange=()=>{delete host.dataset.searchSelected;host.querySelector('#cmdUnit').value=host.querySelector('#cmdCompany').value;cmdShowSelected();};
}

// === C4ISR V2: faction-separated observations, coverage visualization and AI EW ===
const informationState={contacts:{},overlay:'off',lastTurn:'',events:[]};
function infoContactsFor(side){return Object.values(informationState.contacts[side]||{});}
function infoObserve(side){
 if(!side)return;const book=informationState.contacts[side]||(informationState.contacts[side]={});
 const friendly=units.filter(u=>ewActive(u)&&getUnitSide(u)===side);
 const enemies=units.filter(u=>ewActive(u)&&getUnitSide(u)!==side);
 for(const target of enemies){let quality=0;
   for(const observer of friendly){let range=ewKind(observer)==='uav'&&ewMode(observer)==='recon'?8:Math.max(2,Number(observer.sight)||3);
     const field=ewField(observer);if(field.interference>=2)range=Math.max(1,range-3);
     if(cmdHexDistance(observer,target)<=range)quality=Math.max(quality,field.interference>=2?0.45:ewKind(observer)==='uav'?0.9:0.7);
   }
   if(quality){const id=String(target.id);book[id]={id,q:Number(target.q),r:Number(target.r),lastSeenTurn:Number(turnSystem?.turn)||1,confidence:quality,classification:'未确认目标'};}
 }
 for(const [id,c] of Object.entries(book)){const age=Math.max(0,(Number(turnSystem?.turn)||1)-c.lastSeenTurn);c.confidence=Math.max(0,c.confidence-age*0.09);if(c.confidence<0.12)delete book[id];}
}
function infoAiEw(side){for(const u of units){if(!ewActive(u)||getUnitSide(u)!==side||!ewKind(u))continue;
 const kind=ewKind(u),key=String(u.id);if(electronicWarfare.modes[key])continue;
 electronicWarfare.modes[key]=kind==='relay'?'relay':kind==='uav'?'recon':units.some(e=>ewActive(e)&&getUnitSide(e)!==side&&cmdHexDistance(e,u)<=5)?'jam':'protect';
}}
function infoProcess(){if(!turnSystem||!currentScenarioKey)return;const side=normalizeSide(turnSystem.phase),key=`${currentScenarioKey}:${turnSystem.turn}:${side}`;if(informationState.lastTurn===key)return;informationState.lastTurn=key;
 if(side!==getPlayerSide()){infoAiEw(side);ewSave();}infoObserve(side);
 const reports=infoContactsFor(side).filter(c=>c.lastSeenTurn===Number(turnSystem.turn));if(reports.length){informationState.events.unshift(`第${turnSystem.turn}回合 · ${side==='red'?'红方':'蓝方'}情报更新：${reports.length}个观察目标`);informationState.events.length=40;}
 infoSave();}
function infoSave(){try{localStorage.setItem('frontline_c4isr_v2_'+currentScenarioKey,JSON.stringify({contacts:informationState.contacts,events:informationState.events}));}catch(e){console.warn('[信息化指挥]保存失败',e);}}
function infoLoad(){informationState.contacts={};informationState.events=[];informationState.lastTurn='';try{const saved=JSON.parse(localStorage.getItem('frontline_c4isr_v2_'+currentScenarioKey)||'null');if(saved){informationState.contacts=saved.contacts||{};informationState.events=saved.events||[];}}catch(e){console.warn('[信息化指挥]读取失败',e);}}
function cmdDrawOverlay(){if(informationState.overlay==='off'||!renderer?.ctx)return;const ctx=renderer.ctx,side=getPlayerSide();if(!side)return;const candidates=units.filter(u=>ewActive(u)&&getUnitSide(u)===side);
 ctx.save();const radius=renderer.hexSize*(camera.zoom||1);
 for(const u of candidates){let r=0,color='rgba(48,190,198,.38)';if(informationState.overlay==='command'&&cmdIsHQ(u))r=cmdRadius(u);if(informationState.overlay==='relay'&&ewKind(u)==='relay'&&ewMode(u)==='relay'){r=5;color='rgba(98,208,156,.45)';}if(informationState.overlay==='recon'&&ewKind(u)==='uav'&&ewMode(u)==='recon'){r=8;color='rgba(89,174,242,.42)';}if(!r)continue;
 const p=renderer.worldToScreen(u.q,u.r);if(p.x<-600||p.x>canvas.width+600||p.y<-600||p.y>canvas.height+600)continue;
 ctx.beginPath();ctx.arc(p.x,p.y,Math.max(4,r*radius*1.65),0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([8,5]);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color.replace(/\.\d+\)/,'.07)');ctx.fill();}
 if(informationState.overlay==='recon'){for(const c of infoContactsFor(side)){if(c.lastSeenTurn!==Number(turnSystem?.turn))continue;const p=renderer.worldToScreen(c.q,c.r);ctx.fillStyle='rgba(242,178,75,.9)';ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();}}
 ctx.restore();}
function infoInstallDashboard(){if(document.getElementById('c4isrDashboard'))return;
 const style=document.createElement('style');style.textContent=`#c4isrDashboard{position:fixed;inset:5vh 5vw;z-index:2300;background:#14232a;color:#e6f4f0;border:1px solid #577983;box-shadow:0 20px 80px #000b;border-radius:12px;display:none;overflow:auto;font:14px system-ui,sans-serif;padding:22px}#c4isrDashboard button,#c4isrDashboard select{background:#233d47;color:#e5f4f1;border:1px solid #5a7d86;border-radius:6px;padding:8px;cursor:pointer}#c4isrDashboard .c4grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}#c4isrDashboard .c4card{background:#20353c;border:1px solid #385760;border-radius:9px;padding:13px}#c4isrDashboard small{color:#9bb9bb}#c4isrToggle{position:fixed;left:118px;bottom:12px;z-index:1999;background:#163b47;color:#d7f4f1;border:1px solid #70a5a7;padding:9px 14px;cursor:pointer}@media(max-width:700px){#c4isrDashboard{inset:1vh 1vw;padding:12px}}`;document.head.appendChild(style);
 const host=document.createElement('section');host.id='c4isrDashboard';host.innerHTML=`<header style="display:flex;justify-content:space-between;align-items:center"><div><small>COMBINED ARMS / C4ISR TERMINAL</small><h2 style="margin:5px 0">合成旅信息化指挥终端</h2></div><button id="c4close">关闭 ✕</button></header><div id="c4stats" class="c4grid"></div><h3>战场信息图层</h3><div style="display:flex;gap:8px;flex-wrap:wrap" id="c4layers"></div><h3>情报与通信报告</h3><div class="c4grid"><section class="c4card"><b>己方情报记录</b><div id="c4contacts"></div></section><section class="c4card"><b>信息保障状态</b><div id="c4units"></div></section><section class="c4card"><b>事件记录</b><div id="c4events"></div></section></div><p><small>指挥范围为抽象六角格距离；敌情仅来自本阵营观察记录。地图覆盖图层为示意半径，非真实电磁传播模拟。</small></p>`;document.body.appendChild(host);
 const btn=document.createElement('button');btn.id='c4isrToggle';btn.textContent='▣ 信息化指挥';document.body.appendChild(btn);btn.onclick=()=>{const other=document.getElementById('brigadeCommandPanel');if(other)other.style.display='none';const trigger=document.getElementById('brigadeCommandToggle');if(trigger)trigger.style.display='block';host.style.display='block';infoUpdateDashboard();};host.querySelector('#c4close').onclick=()=>host.style.display='none';}
function infoUpdateDashboard(){const host=document.getElementById('c4isrDashboard');if(!host)return;const side=getPlayerSide(),friendly=units.filter(u=>ewActive(u)&&getUnitSide(u)===side),online=friendly.filter(u=>cmdCoverage(u).connected).length,contacts=infoContactsFor(side);
 const cards=[['己方在场单位',friendly.length],['指挥联通',`${online}/${friendly.length}`],['当前情报记录',contacts.length],['电磁保障单位',friendly.filter(u=>ewKind(u)).length]];
 host.querySelector('#c4stats').innerHTML=cards.map(([k,v])=>`<div class="c4card"><small>${k}</small><h2>${v}</h2></div>`).join('');
 const layers=host.querySelector('#c4layers');layers.replaceChildren();for(const [key,label] of [['off','关闭'],['command','指挥范围'],['relay','中继覆盖'],['recon','无人机侦察']]){const b=document.createElement('button');b.textContent=label;b.style.borderColor=informationState.overlay===key?'#8ae8e3':'#5a7d86';b.onclick=()=>{informationState.overlay=key;render();infoUpdateDashboard();};layers.appendChild(b);}
 host.querySelector('#c4contacts').textContent=contacts.slice(0,15).map(c=>`(${c.q},${c.r}) · ${Math.round(c.confidence*100)}% · 第${c.lastSeenTurn}回合`).join('\n')||'暂无有效情报';host.querySelector('#c4contacts').style.whiteSpace='pre-line';
 host.querySelector('#c4units').textContent=friendly.filter(u=>ewKind(u)).map(u=>`${unitName(u)}：${ewMode(u)}`).join('\n')||'未发现保障单位';host.querySelector('#c4units').style.whiteSpace='pre-line';
 host.querySelector('#c4events').textContent=informationState.events.slice(0,12).join('\n')||'暂无事件';host.querySelector('#c4events').style.whiteSpace='pre-line';}

// ============================================================
// 渲染
// ============================================================
let _lastFogRenderSignature = '';
function render() {
    infoProcess();
    ewProcess();
    // 指挥任务只在结束回合时执行，避免地图重绘提前消耗行动点。
    // 大地图性能优化：只有阵营、单位位置/生存状态或迷雾开关改变时才重算视野与控制区。
    // 纯拖拽、缩放、打开面板不再重复执行整张144×120地图的侦察计算。
    const fogSig = JSON.stringify(electronicWarfare.modes)+`|${turnSystem?.turn}|${fogOfWarSystem.side}|${fogOfWarSystem.enabled?1:0}|` + units.map(u=>`${u.id}:${u.offMap?1:0}:${u.q},${u.r}:${Math.round(Number(u.strength??0))}`).join(';');
    if (fogSig !== _lastFogRenderSignature) {
        fogOfWarSystem.recompute();
        _lastFogRenderSignature = fogSig;
    }
    const onMap=units.filter(unit => unit.offMap !== true);
    renderer.render(fogOfWarSystem.filterUnits(onMap));
    cmdDrawOverlay();
}
if (controlZoneToggle) {
    controlZoneToggle.addEventListener("click", () => {
        renderer.showControlZones = !renderer.showControlZones;
        controlZoneToggle.textContent = renderer.showControlZones ? "控区：开" : "控区：关";
        controlZoneToggle.setAttribute("aria-pressed", renderer.showControlZones ? "true" : "false");
        render();
    });
}

// ============================================================
// 阵营标准化
// ============================================================
function normalizeSide(side) {
    const faction = FactionSystem.getFaction(side);
    if (faction?.side) return faction.side;
    const value = String(side ?? "").trim().toLowerCase();
    const aliases = { red:"red", blue:"blue", pla_red:"red", pla_blue:"blue", "红方":"red", "蓝方":"blue", kmt:"kmt", "蒋匪军":"kmt", pla:"pla", "解放军":"pla", "中国人民解放军":"pla", tw_proxy:"tw_proxy", "台伪军":"tw_proxy", chinese:"chinese", china:"chinese", chn:"chinese", japanese:"japanese", japan:"japanese", jpn:"japanese" };
    return aliases[value] ?? value;
}
// ============================================================
// 获取单位阵营
// ============================================================
function getUnitSide(unit) {
    return normalizeSide(
        unit?.faction ??
        unit?.side ??
        unit?.camp
    );
}
// ============================================================
// 玩家阵营
// ============================================================
function getPlayerSide() {
    // FactionSelection / GameState 不同版本可能使用不同字段。
    // 这里统一兼容，避免“界面显示苏军，但控制逻辑仍读取德军”的问题。
    if (currentScenarioConfig?.liberation1949 && gameState.playerCommandGroup) {
        const explicit = normalizeSide(gameState.playerSide);
        if (explicit === "pla" || explicit === "kmt") return explicit;
    }
    // 1949年总战役没有集团选择：以已选阵营的 side 为准。
    if (currentScenarioConfig?.id === "yangtze_grand_1949") {
        const direct = normalizeSide(gameState.playerSide ?? gameState.selectedSide);
        if (direct === "pla" || direct === "kmt") return direct;
    }
    const candidates = [
        gameState.playerFaction,
        gameState.playerSide,
        gameState.selectedFaction,
        gameState.selectedSide,
        gameState.side,
        gameState.faction
    ];
    for (const value of candidates) {
        const side = normalizeSide(value);
        if (["red", "blue", "german", "soviet", "chinese", "japanese", "british", "italian", "american", "allied", "rok_government", "new_military", "pla", "kmt", "tw_proxy"].includes(side)) {
            return side;
        }
    }
    return "";
}
// ============================================================
// 单位是否存活
// ============================================================
function isUnitAlive(unit) {
    if (!unit) {
        return false;
    }
    if (unit.destroyed === true || unit.offMap === true) {
        return false;
    }
    const strength =
        Number(unit.strength);
    const manpower =
        Number(unit.manpower);
    // 任意一个有效兵力字段 <= 0，都视为阵亡
    if (
        Number.isFinite(strength) &&
        strength <= 0
    ) {
        return false;
    }
    if (
        Number.isFinite(manpower) &&
        manpower <= 0
    ) {
        return false;
    }
    return true;
}
// ============================================================
// 单位名称
// ============================================================
function unitName(unit) {
    return (
        String(unit?.displayFormationName ?? unit?.nameZh ?? unit?.name ?? unit?.id ?? "未命名单位")
            .replace(/（模拟）|\(模拟\)/g, "")
    );
}
// ============================================================
// 当前兵力
// ============================================================
function getUnitStrength(unit) {
    // strength 是唯一的实时生命力主字段。
    // manpower 仅作为旧数据兼容回退。
    const value =
        Number(
            unit?.strength ??
            unit?.manpower ??
            100
        );
    return Number.isFinite(value)
        ? value
        : 100;
}
// ============================================================
// 最大兵力
// ============================================================
function getUnitMaxStrength(unit) {
    // maxStrength 是最大生命力主字段。
    // maxManpower 仅作为旧数据兼容回退。
    const value =
        Number(
            unit?.maxStrength ??
            unit?.initialStrength ??
            unit?.maxManpower ??
            100
        );
    return Number.isFinite(value)
        ? value
        : 100;
}
// ============================================================
// 兵力显示
// ============================================================
function getStrengthText(unit) {
    return (
        `${Math.max(0, Math.round(getUnitStrength(unit)))} / ` +
        `${Math.max(1, Math.round(getUnitMaxStrength(unit)))}`
    );
}
// ============================================================
// units.json 单位标准化
// ============================================================
function normalizeUnit(rawUnit) {
 const strength =
    Number(
        rawUnit.strength ??
        rawUnit.manpower ??
        100
    );
const maxStrength =
    Number(
        rawUnit.maxStrength ??
        rawUnit.maxManpower ??
        rawUnit.strength ??
        rawUnit.manpower ??
        100
    );
    const movement =
        Number(
            rawUnit.movement ??
            rawUnit.maxMovementPoints ??
            rawUnit.movementPoints ??
            4
        );
    const faction =
        normalizeSide(
            rawUnit.faction ??
            rawUnit.side ??
            rawUnit.camp
        );
    return {
        ...rawUnit,
        id:
            String(
                rawUnit.id ?? ""
            ),
        name:
            String(
                rawUnit.name ??
                rawUnit.nameZh ??
                rawUnit.id ??
                "未知单位"
            ),
        faction,
        side:
            faction,
        type:
            rawUnit.type ??
            rawUnit.unitType ??
            "infantry",
        q:
            Number(
                rawUnit.q
            ),
        r:
            Number(
                rawUnit.r
            ),
        strength:
            Math.max(
                0,
                strength
            ),
        maxStrength:
            Math.max(
                1,
                maxStrength
            ),
        manpower: Math.max(0, Number(rawUnit.manpower ?? strength)),
        maxManpower: Math.max(1, Number(rawUnit.maxManpower ?? rawUnit.manpower ?? maxStrength)),
        echelon:
            rawUnit.echelon ??
            "battalion",
        minRange:
            Number(
                rawUnit.minRange ??
                (rawUnit.type === "artillery" ? 2 : 1)
            ),
        maxRange:
            Number(
                rawUnit.maxRange ??
                rawUnit.range ??
                1
            ),
        attack:
            Number(
                rawUnit.attack ?? 5
            ),
        defense:
            Number(
                rawUnit.defense ?? 5
            ),
        range:
            Number(
                rawUnit.range ?? 1
            ),
        movement,
        maxMovementPoints:
            movement,
        movementPoints:
            movement,
        destroyed:
            strength <= 0,
        hasAttacked:
            false,
        morale:
            Number(
                rawUnit.morale ?? 80
            ),
        suppression:
            Number(
                rawUnit.suppression ?? 0
            ),
        fatigue:
            Number(
                rawUnit.fatigue ?? 0
            ),
        ammunition:
            Number(
                rawUnit.ammunition ??
                rawUnit.ammo ??
                100
            ),
        ammo: Number(rawUnit.ammo ?? rawUnit.ammunition ?? 100),
        maxAmmo: Number(rawUnit.maxAmmo ?? 100),
        fuel: Number(rawUnit.fuel ?? 100),
        maxFuel: Number(rawUnit.maxFuel ?? 100),
        repairParts: Number(rawUnit.repairParts ?? 20),
        equipment: Array.isArray(rawUnit.equipment) ? rawUnit.equipment.map(e=>({...e})) : rawUnit.equipment
    };
}
// ============================================================
// 加载 units.json
// ============================================================
async function loadUnitsFromJSON(unitsPath = "./data/units.json") {
    console.log(
        `[单位系统] 正在读取 ${unitsPath}`
    );
    const response =
        await fetch(
            unitsPath,
            {
                cache: "no-store"
            }
        );
    if (!response.ok) {
        throw new Error(
            `units.json 加载失败：HTTP ${response.status}`
        );
    }
    const data =
        await response.json();
    if (
        !data ||
        !Array.isArray(
            data.units
        )
    ) {
        throw new Error(
            "units.json 格式错误：找不到 units 数组"
        );
    }
    const loadedUnits =
        data.units.map(
            normalizeUnit
        );
    console.log(
        `[单位系统] units.json 加载成功：${loadedUnits.length} 个单位`
    );
    return loadedUnits;
}
// ============================================================
// 主系统部署安全检查
// - 手工编制冲突：阻止战役启动，避免静默破坏历史部署
// - 系统自动生成单位（AUTO_RECON / AUTO_AA 等）：自动寻找最近合法空格
// ============================================================
function isSystemGeneratedUnit(unit) {
    const id = String(unit?.id ?? "").toUpperCase();
    return id.includes("_AUTO_") || id.startsWith("AUTO_") || unit?.autoGenerated === true || ["GroupArmySystem","ModernBrigadeSystem"].includes(unit?.generatedBy);
}
function deploymentTerrainAllowed(unit, q, r) {
    if (!Number.isFinite(q) || !Number.isFinite(r)) return false;
    if (q < 0 || r < 0 || q >= Number(world?.width ?? 0) || r >= Number(world?.height ?? 0)) return false;
    const terrain = world?.terrainAt?.(q, r) ?? "plain";
    const naval = unit?.domain === "naval" || unit?.unitClass === "naval";
    if (!naval && ["water", "deep_water", "sea", "lake"].includes(terrain)) return false;
    if (naval && !["water", "deep_water", "sea", "lake"].includes(terrain)) return false;
    // 动态训练单位的初始格必须符合其实际地形通行规则；避免“部署合法但一格也走不出去”。
    if (!naval && unit?.autoGenerated === true && movementSystem?.pathfinding) {
        const c = movementSystem.pathfinding.terrainCost(unit, q, r);
        if (!Number.isFinite(c)) return false;
    }
    return true;
}
function findNearestSafeDeployment(unit, occupied, maxRadius = 12) {
    const oq = Number(unit.q), or = Number(unit.r);
    for (let radius = 1; radius <= maxRadius; radius++) {
        const candidates = [];
        for (let dq = -radius; dq <= radius; dq++) {
            for (let dr = -radius; dr <= radius; dr++) {
                const ds = -dq-dr;
                if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds)) !== radius) continue;
                candidates.push([oq+dq, or+dr]);
            }
        }
        // 固定排序保证每次加载结果一致
        candidates.sort((a,b)=>a[1]-b[1] || a[0]-b[0]);
        for (const [q,r] of candidates) {
            if (occupied.has(`${q},${r}`)) continue;
            if (!deploymentTerrainAllowed(unit,q,r)) continue;
            return {q,r};
        }
    }
    // 局部部署区过密或位于海岸时，继续做全图确定性兜底搜索。
    // 集团军动态生成单位不应仅因初始锚点拥挤而让整场战役加载失败。
    for (let r = 1; r < Number(world?.height ?? 0)-1; r++) {
        for (let q = 1; q < Number(world?.width ?? 0)-1; q++) {
            if (occupied.has(`${q},${r}`)) continue;
            if (!deploymentTerrainAllowed(unit,q,r)) continue;
            return {q,r};
        }
    }
    return null;
}
function runDeploymentSafetyCheck(unitList, { autoRepair = true } = {}) {
    const occupied = new Map();
    const report = { repaired: [], conflicts: [], invalid: [] };
    for (const unit of unitList) {
        if (unit?.offMap === true || !isUnitAlive(unit)) continue;
        const q=Number(unit.q), r=Number(unit.r);
        if (!deploymentTerrainAllowed(unit,q,r)) {
            // 现代旅/系统动态生成单位允许自动迁移到最近合法空格；历史手工部署仍严格报错。
            if (autoRepair && isSystemGeneratedUnit(unit)) {
                const safe=findNearestSafeDeployment(unit,occupied,18);
                if (safe) {
                    const from={q,r}; unit.q=safe.q; unit.r=safe.r;
                    occupied.set(`${safe.q},${safe.r}`,unit);
                    report.repaired.push({id:unit.id,from,to:safe,reason:"非法坐标或地形"});
                    console.warn(`[部署安全] ${unit.id} 从非法部署 (${q}, ${r}) 自动调整到 (${safe.q}, ${safe.r})`);
                    continue;
                }
            }
            report.invalid.push({id:unit.id,q,r,reason:"非法坐标或地形"});
            continue;
        }
        const key=`${q},${r}`;
        if (!occupied.has(key)) { occupied.set(key,unit); continue; }
        const existing=occupied.get(key);
        // 优先移动系统自动生成单位；若先遇到 AUTO 而后遇到历史单位，也移动 AUTO
        let mover = null;
        if (isSystemGeneratedUnit(unit)) mover=unit;
        else if (isSystemGeneratedUnit(existing)) mover=existing;
        if (autoRepair && mover) {
            if (mover === existing) occupied.delete(key);
            const safe=findNearestSafeDeployment(mover,occupied);
            if (safe) {
                const from={q:Number(mover.q),r:Number(mover.r)};
                mover.q=safe.q; mover.r=safe.r;
                occupied.set(`${safe.q},${safe.r}`,mover);
                if (mover !== unit) occupied.set(key,unit);
                report.repaired.push({id:mover.id,from,to:safe,blockedBy:(mover===unit?existing.id:unit.id)});
                console.warn(`[部署安全] ${mover.id} 与 ${mover===unit?existing.id:unit.id} 冲突，已从 (${from.q}, ${from.r}) 自动调整到 (${safe.q}, ${safe.r})`);
                continue;
            }
        }
        report.conflicts.push({a:existing.id,b:unit.id,q,r});
    }
    if (report.repaired.length) console.info(`[部署安全] 已自动修复 ${report.repaired.length} 个系统生成单位部署冲突`);
    if (report.invalid.length) { console.error("[部署安全] 非法部署",report.invalid); report.invalid.forEach(x=>console.error(`[部署安全][非法] ${x.id} @ (${x.q}, ${x.r})：${x.reason}`)); }
    if (report.conflicts.length) console.error("[部署安全] 无法自动修复的部署冲突",report.conflicts);
    return report;
}
// ============================================================
// 单位数据检查
// ============================================================
function validateUnits(
    unitList
) {
    const ids =
        new Set();
    const positions =
        new Map();
    let errors =
        0;
    for (
        const unit
        of unitList
    ) {
        // ----------------------------------------------------
        // ID
        // ----------------------------------------------------
        if (!unit.id) {
            console.error(
                "[单位数据] 存在没有 ID 的单位",
                unit
            );
            errors++;
        }
        else if (
            ids.has(
                unit.id
            )
        ) {
            console.error(
                `[单位数据] 重复单位 ID：${unit.id}`
            );
            errors++;
        }
        else {
            ids.add(
                unit.id
            );
        }
        // ----------------------------------------------------
        // 阵营
        // ----------------------------------------------------
        if (
            !["red", "blue", "german", "soviet", "chinese", "japanese", "british", "italian", "american", "allied", "rok_government", "new_military", "pla", "kmt", "tw_proxy"].includes(getUnitSide(unit))
        ) {
            console.error(
                `[单位数据] ${unit.id} 阵营错误：${unit.faction}`
            );
            errors++;
        }
        // ----------------------------------------------------
        // 地图外增援单位不参与坐标/占格检查
        // ----------------------------------------------------
        if (unit.offMap === true) {
            continue;
        }
        // ----------------------------------------------------
        // 坐标
        // ----------------------------------------------------
        if (
            !Number.isFinite(
                unit.q
            ) ||
            !Number.isFinite(
                unit.r
            )
        ) {
            console.error(
                `[单位数据] ${unit.id} 坐标无效`
            );
            errors++;
            continue;
        }
        // ----------------------------------------------------
        // 一格一单位
        // ----------------------------------------------------
        if (
            isUnitAlive(unit)
        ) {
            const key =
                `${unit.q},${unit.r}`;
            if (
                positions.has(
                    key
                )
            ) {
                const existing =
                    positions.get(
                        key
                    );
                console.error(
                    `[部署冲突] ${existing.id} 与 ${unit.id} 同时位于 (${unit.q}, ${unit.r})`
                );
                errors++;
            }
            else {
                positions.set(
                    key,
                    unit
                );
            }
        }
    }
    if (
        errors === 0
    ) {
        console.log(
            `[单位系统] 数据检查通过：${unitList.length} 个单位`
        );
        return true;
    }
    console.error(
        `[单位系统] 数据检查失败：发现 ${errors} 个问题`
    );
    return false;
}
// ============================================================
// 初始化单位
// ============================================================
function initializeUnits() {
    for (
        const unit
        of units
    ) {
        const side =
            getUnitSide(
                unit
            );
        unit.side =
            side;
        unit.faction =
            side;
        if (
            unit.strength ==
            null
        ) {
            unit.strength =
                100;
        }
        if (
            unit.maxStrength ==
            null
        ) {
            unit.maxStrength =
                unit.strength;
        }
        if (
            unit.strength <= 0
        ) {
            unit.strength = 0;
            unit.destroyed = true;
        }
        combatSystem.resetUnit(
            unit
        );
        if (
            typeof movementSystem.initializeUnit ===
            "function"
        ) {
            movementSystem.initializeUnit(
                unit
            );
        }
        if (
            unit.morale ==
            null
        ) {
            unit.morale =
                80;
        }
        if (
            unit.suppression ==
            null
        ) {
            unit.suppression =
                0;
        }
        if (
            unit.fatigue ==
            null
        ) {
            unit.fatigue =
                0;
        }
        if (
            unit.ammunition ==
            null
        ) {
            unit.ammunition =
                unit.ammo ??
                100;
        }
        if (
            unit.ammo ==
            null
        ) {
            unit.ammo =
                unit.ammunition;
        }
    }
}
// ============================================================
// 回合系统
// ============================================================
function initializeTurnSystem() {
    const config = getScenarioConfig();

    // 阵营顺序优先服从实际单位数据。现代红蓝演习若地图/目录仍残留历史阵营配置，
    // 不允许 TurnSystem 回退成“中国军/日军”等旧阶段，否则会造成误判、错误 AI 日志和无法控制。
    const liveSides = [...new Set((units ?? []).filter(isUnitAlive).map(getUnitSide).filter(Boolean))];
    const isRedBlueExercise = liveSides.includes("red") && liveSides.includes("blue");
    const isYangtze1949 = currentScenarioConfig?.liberation1949 && liveSides.includes("pla") && liveSides.includes("kmt");
    const attacker = isYangtze1949 ? "pla" : isRedBlueExercise ? "red" : normalizeSide(
        config?.roles?.attacker ??
        FactionSystem.getFaction(config?.factions?.[0])?.side ??
        "german"
    );

    const defender = isYangtze1949 ? "kmt" : isRedBlueExercise ? "blue" : normalizeSide(
        config?.roles?.defender ??
        FactionSystem.getFaction(config?.factions?.[1])?.side ??
        "soviet"
    );

    const startingPhase = isYangtze1949 ? "pla" : normalizeSide(
        config?.start?.startingPhase ?? attacker
    );

    // 当前战役颜色规则同步给 Renderer。
    renderer.setScenarioSides?.(attacker, defender);

    // 行动顺序必须从 startingPhase 开始。
    const phaseOrder = startingPhase === defender
        ? [defender, attacker]
        : [attacker, defender];

    turnSystem = new TurnSystem({
        units,
        year: config.start.year,
        month: config.start.month,
        day: config.start.day,
        hour: config.start.hour,
        minute: config.start.minute,
        hoursPerTurn: config.start.hoursPerTurn,
        startingPhase,
        phaseOrder
    });

    turnSystem.onPhaseChanged = () => {
        clearSelection();
        updateTurnUI();
        render();
    };

    turnSystem.onTurnChanged = () => {
        fogOfWarSystem.advanceTurn();
        airSuperioritySystem.advanceTurn();
        // 空降支援生成的是永久地面单位，不得在换回合时清除。
        // 集结状态仅限制落地当回合；进入下一回合后恢复为普通作战单位。
        for (const u of units) {
            if (u?.airborneDeployed !== true || u.destroyed === true || u.offMap === true) continue;
            u.persistent = true;
            u.temporary = false;
            if (Number(turnSystem?.turn ?? 1) > Number(u.airDropTurn ?? 0)) {
                u.airborneDisorganized = 0;
                u.hasAttacked = false;
                u.hasActed = false;
            }
        }
        // 工程作业无回合冷却：不在换回合时自动推进/锁定工程。
        if (usesModernLogistics()) {
            const lr=modernLogisticsSystem.processTurn();
            if(lr.length) writeBattleMessage(`后勤阶段：${lr.length}个单位完成弹药/燃油补给或装备抢修`);
        }
        processReinforcementsForCurrentTurn();
        updateTurnUI();
        if (!gameOver) checkVictory();
        render();
    };

    turnSystem.onTimeChanged = () => {
        updateTurnUI();
    };

    updateTurnUI();
}
// ============================================================
// 增援 UI
// ============================================================
function updateReinforcementUI() {
    if (!reinforcementPanel || !turnSystem) return;
    const supportsReinforcements = reinforcementSystem.groups.length > 0;
    reinforcementPanel.hidden = !supportsReinforcements;
    if (!supportsReinforcements) return;

    const pending = reinforcementSystem.getPendingGroups(turnSystem.turn, units);
    if (reinforcementNext) {
        if (!pending.length) {
            reinforcementNext.innerHTML = `<div class="reinforcement-empty">暂无待到达增援</div>`;
        } else {
            reinforcementNext.innerHTML = pending.slice(0,4).map(g => `
                <div class="reinforcement-item">
                    <div class="reinforcement-title">第${g.turn}回合 · ${g.name}</div>
                    <div class="reinforcement-detail">${g.detail}</div>
                    <div class="reinforcement-meta">${g.unitCount}个算子 · ${g.turnsRemaining===0?'本回合到达':`还有${g.turnsRemaining}回合`}</div>
                </div>`).join("");
        }
    }
    if (reinforcementLog) {
        const log=reinforcementSystem.getArrivalLog();
        reinforcementLog.innerHTML = log.length
            ? log.slice(0,4).map(x=>`<div class="reinforcement-log-item">第${x.turn}回合：${x.name}（${x.count}个算子）</div>`).join("")
            : `<div class="reinforcement-empty">暂无增援到达</div>`;
    }
}

function processReinforcementsForCurrentTurn() {
    if (!turnSystem || reinforcementSystem.groups.length === 0) return;
    const result=reinforcementSystem.processTurn(turnSystem.turn, units);
    for (const arrival of result.reinforcements ?? []) {
        console.log(`[增援] ${arrival.message}`);
        writeBattleMessage?.(`增援到达：${arrival.message}`);
    }
    applyDifficultyToEnemyUnits();
    updateReinforcementUI();
}

// ============================================================
// 回合 UI
// ============================================================
function updateTurnUI() {
    if (!turnSystem) {
        return;
    }
    updateReinforcementUI();
    strategicObjectives.onTurnChanged();
    if (
        turnInfo &&
        typeof turnSystem.getHeaderText ===
        "function"
    ) {
        turnInfo.textContent = currentScenarioConfig?.modernBrigadeSelection
            ? `${turnSystem.getDateText()} · ${turnSystem.getTimeText()} ｜ 第${turnSystem.getTurnNumber()}回合 ｜ ${factionLabel(turnSystem.phase)}行动`
            : turnSystem.getHeaderText();
    }
    const number =
        typeof turnSystem.getTurnNumber ===
        "function"
            ? turnSystem.getTurnNumber()
            : turnSystem.turn ?? 1;
    if (turnNumber) {
        turnNumber.textContent =
            `第${number}回合`;
    }
    if (
        turnTime &&
        typeof turnSystem.getTurnTimeRange ===
        "function"
    ) {
        turnTime.textContent =
            turnSystem.getTurnTimeRange();
    }
    const phase =
        normalizeSide(
            turnSystem.phase
        );
    const phaseName = `${factionLabel(phase)}行动`;
    if (turnPhase) {
        turnPhase.textContent = currentScenarioConfig?.modernBrigadeSelection
            ? phaseName
            : (typeof turnSystem.getPhaseName === "function" ? turnSystem.getPhaseName() : phaseName);
    }
    if (endPhaseButton) {
        endPhaseButton.textContent = "结束回合";
    }
    updateReinforcementUI();
}
// ============================================================
// 当前行动阶段
// ============================================================
function isUnitActive(unit) {
    if (!unit) {
        return false;
    }
    if (!turnSystem) {
        return true;
    }
    return (
        getUnitSide(unit) ===
        normalizeSide(
            turnSystem.phase
        )
    );
}
// ============================================================
// 玩家能否控制单位
// ============================================================
// 1949年战前集团选择的唯一指挥名单：在游戏开始后按当前实际单位重建。
function synchronizeLiberationCommandRoster() {
    if (!currentScenarioConfig?.liberation1949 || !gameState.playerCommandGroup) return;
    const group = String(gameState.playerCommandGroup).trim();
    const faction = getPlayerSide();
    const selected = units.filter(u => getUnitSide(u) === faction &&
        [u.commandGroup,u.operationalGroup,u.armyGroupFormation].some(g => String(g ?? "").trim() === group));
    gameState.playerCommandUnitIds = selected.map(u => String(u.id));
    console.info("[渡江战役] 直属集团",group,"阵营",faction,"可指挥单位",selected.length);
    if (!selected.length) console.warn("[渡江战役] 选定集团没有匹配单位，请核查场景编组");
}
function playerCanControlUnit(unit) {
    if (!unit || !isUnitAlive(unit) || gameOver || aiRunning) {
        return false;
    }
    if (String(gameState.mode).toLowerCase() === "developer") {
        return true;
    }
    if (String(gameState.mode).toLowerCase() === "observer") {
        return false;
    }
    const unitSide = getUnitSide(unit);
    const playerSide = getPlayerSide();
    const phaseSide = normalizeSide(turnSystem?.phase);
    // 没有明确玩家阵营时，绝不默认允许控制，防止误控 AI 阵营。
    if (!["red", "blue", "german", "soviet", "chinese", "japanese", "british", "italian", "american", "allied", "rok_government", "new_military", "pla", "kmt", "tw_proxy"].includes(playerSide)) {
        return false;
    }
    // 只能控制玩家自己选择的阵营。
    if (unitSide !== playerSide) {
        return false;
    }
    // 1949年系列：按战前确认的作战集团控制，不按颜色或部署位置判断。
    // 编组名单与集团字段同时校验，兼容既有战役的两种归属字段。
    if (currentScenarioConfig?.liberation1949 && gameState.playerCommandGroup) {
        const group = String(gameState.playerCommandGroup).trim();
        const belongs = [unit.commandGroup, unit.operationalGroup, unit.armyGroupFormation]
            .some(value => String(value ?? "").trim() === group);
        const listed = Array.isArray(gameState.playerCommandUnitIds) &&
            gameState.playerCommandUnitIds.some(id => String(id) === String(unit.id));
        if (!belongs && !listed) return false;
    }
    // 只能在本方行动阶段操作。
    if (turnSystem && phaseSide !== playerSide) {
        return false;
    }
    return true;
}
// ============================================================
// 查看单位
// ============================================================
function playerCanViewUnit(unit) {
    return (
        unit != null &&
        isUnitAlive(unit)
    );
}
// ============================================================
// 清除移动范围
// ============================================================
function clearReachable() {
    if (
        typeof renderer.clearReachable ===
        "function"
    ) {
        renderer.clearReachable();
    }
    if (
        movementSystem.reachable instanceof
        Map
    ) {
        movementSystem.reachable.clear();
    }
}
// ============================================================
// 清除选择
// ============================================================
function clearSelection() {
    // 切换阶段/取消选择时必须释放工程目标状态，避免幽灵锁定。
    pendingEngineeringAction = null;
    pendingEngineeringUnitId = null;
    selectedUnit =
        null;
    if (
        typeof selection.clear ===
        "function"
    ) {
        selection.clear();
    }
    if (
        typeof renderer.setSelectedUnit ===
        "function"
    ) {
        renderer.setSelectedUnit(
            null
        );
    }
    if (
        typeof movementSystem.clear ===
        "function"
    ) {
        movementSystem.clear();
    }
    clearReachable();
    if (unitInfo) {
        unitInfo.innerHTML =
            '<p class="hint">点击地图上的单位查看详情</p>';
    }
}
// ============================================================
// 单位信息
// ============================================================

function hexDistanceSimple(a,b){
    const dq=Number(a.q)-Number(b.q), dr=Number(a.r)-Number(b.r);
    return Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));
}
function terrainAtTransport(q,r){return String(world?.terrainAt?.(q,r) ?? world?.getTerrain?.(q,r) ?? 'plain');}
function adjacentFriendlyCargo(carrier){
    const side=getUnitSide(carrier);
    return units.filter(u=>u!==carrier&&u.offMap!==true&&isUnitAlive(u)&&getUnitSide(u)===side&&u.domain!=='naval'&&hexDistanceSimple(carrier,u)<=1&&unitTransportSystem.canEmbark(carrier,u));
}
function adjacentUnloadHexes(carrier){
    const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]], out=[];
    for(const [dq,dr] of dirs){const q=Number(carrier.q)+dq,r=Number(carrier.r)+dr,t=terrainAtTransport(q,r);if(t==='water')continue;const occ=units.some(u=>u.offMap!==true&&isUnitAlive(u)&&Number(u.q)===q&&Number(u.r)===r);if(!occ)out.push({q,r,t});}
    return out;
}
function addTransportActions(carrier){
    if(!unitInfo||!carrier?.transport||!playerCanControlUnit(carrier))return;
    const cargo=adjacentFriendlyCargo(carrier), manifest=unitTransportSystem.manifest(carrier), rem=unitTransportSystem.remaining(carrier);
    const box=document.createElement('div');box.className='transport-action-box';box.style.cssText='margin:8px 0;padding:8px;border:1px solid #8c8568;background:rgba(235,229,201,.55)';
    box.innerHTML=`<div style="font-weight:700;margin-bottom:5px">载运操作</div><div style="font-size:12px;margin-bottom:6px">剩余：人员${rem?.personnel??0} / 车辆${rem?.vehicle??0} / 重装${rem?.heavy??0}　已载${manifest.length}个单位</div>`;
    if(cargo.length){const sel=document.createElement('select');sel.style.cssText='max-width:70%;font-family:inherit';for(const u of cargo){const o=document.createElement('option');o.value=u.id;o.textContent=`${unitName(u)}（${u.equipmentName??u.equipmentType??u.type??'部队'}）`;sel.appendChild(o);}const b=document.createElement('button');b.textContent='装载相邻部队';b.style.marginLeft='6px';b.onclick=()=>{const u=units.find(x=>String(x.id)===String(sel.value));if(!u||!unitTransportSystem.embark(carrier,u)){writeBattleMessage('装载失败：舱位不足或单位不符合条件');return;}writeBattleMessage(`${unitName(u)} 已装入 ${unitName(carrier)}`);showUnitInfo(carrier);render();};box.append(sel,b);}
    else {const h=document.createElement('div');h.style.fontSize='12px';h.textContent='相邻陆地格没有可装载的友方部队';box.appendChild(h);}
    if(manifest.length){const land=adjacentUnloadHexes(carrier);const sel=document.createElement('select');sel.style.cssText='max-width:70%;font-family:inherit;margin-top:6px';for(const u of manifest){const o=document.createElement('option');o.value=u.id;o.textContent=unitName(u);sel.appendChild(o);}const b=document.createElement('button');b.textContent=land.length?'登陆/卸载':'无可用登陆格';b.disabled=!land.length;b.style.marginLeft='6px';b.onclick=()=>{const pos=adjacentUnloadHexes(carrier)[0];if(!pos)return;const u=unitTransportSystem.disembark(carrier,sel.value,pos.q,pos.r);if(!u)return;const old=units.findIndex(x=>String(x.id)===String(u.id));if(old>=0)units[old]=u;else units.push(u);writeBattleMessage(`${unitName(u)} 从 ${unitName(carrier)} 登陆至 ${pos.q},${pos.r}`);showUnitInfo(carrier);render();};box.append(sel,b);}
    const title=unitInfo.querySelector('.unit-title'); if(title?.nextSibling)unitInfo.insertBefore(box,title.nextSibling); else unitInfo.prepend(box);
}

let pendingAirAssaultLanding=null;
let pendingAirAssaultFlight=null;
function addAirAssaultActions(unit){
 if(!unitInfo||!playerCanControlUnit(unit)||!(unit.airAssaultTransport||unit.airAssaultCapable))return;
 const box=document.createElement('div');box.className='air-assault-action-box';box.style.cssText='padding:9px;margin:8px 0;border:1px solid #7b9aa3;background:rgba(40,78,91,.13)';
 const header=document.createElement('div');header.textContent='空中突击 · 建制直升机';header.style.fontWeight='bold';box.append(header);
 const tip=document.createElement('div');tip.style.cssText='font-size:12px;margin:5px 0';tip.textContent=unit.airAssaultTransport?`剩余运力 ${unit.airAssaultLiftRemaining??0}/${unit.airAssaultLiftCapacity??0} · 燃油 ${Math.round(unit.fuel??100)} · 已载 ${(unit.airAssaultPassengers||[]).length} 支 / ${unit.airAssaultLiftCapacity??0}运力`:`机降状态：${unit.airAssaultStatus==='embarked'?'已登机':'地面待命'}`;box.append(tip);
 if(unit.airAssaultRole){const fly=document.createElement('button');fly.textContent='选择直升机飞行目的地（最多6格）';fly.disabled=Number(unit.actionPoints??0)<1;fly.onclick=()=>{pendingAirAssaultFlight={helicopterId:unit.id};pendingAirAssaultLanding=null;writeBattleMessage('直升机飞行：点击6格以内的空闲地块，飞行消耗行动点与燃油；ESC取消。');};box.append(fly);if(unit.airAssaultBase){const back=document.createElement('button');back.textContent='返航至初始集结点';back.onclick=()=>{const t=unit.airAssaultBase;const occupied=units.some(x=>x!==unit&&!x.offMap&&isUnitAlive(x)&&Number(x.q)===t.q&&Number(x.r)===t.r);if(!AirAssaultSystem.fly(unit,t,occupied)){writeBattleMessage('返航失败：航程超过6格、行动点/燃油不足或集结点被占用；请分段返航。');return;}writeBattleMessage(unitName(unit)+' 已返航');showUnitInfo(unit);render();};box.append(back);}}
 if(unit.airAssaultTransport){
  const eligible=units.filter(p=>p!==unit&&AirAssaultSystem.canBoard(unit,p));
  if(!eligible.length&&!(unit.airAssaultPassengers||[]).length){const hint=document.createElement('div');hint.textContent='周围没有可登机的空突步兵；请确认同阵营、相邻1格、运力及行动点充足。';hint.style.fontSize='12px';box.append(hint);}if(eligible.length){const select=document.createElement('select');for(const p of eligible){const o=document.createElement('option');o.value=p.id;o.textContent=unitName(p);select.append(o);}const b=document.createElement('button');b.textContent='登机';b.onclick=()=>{const p=units.find(x=>String(x.id)===String(select.value));if(!AirAssaultSystem.board(unit,p)){writeBattleMessage('登机失败：距离、运力、行动点或阵营不符合要求');return;}writeBattleMessage(`${unitName(p)} 已登上 ${unitName(unit)}`);showUnitInfo(unit);render();};box.append(select,b);}
  const manifest=(unit.airAssaultPassengers||[]).map(id=>units.find(x=>String(x.id)===String(id))).filter(Boolean);
  if(manifest.length){const select=document.createElement('select');for(const p of manifest){const o=document.createElement('option');o.value=p.id;o.textContent=unitName(p);select.append(o);}const b=document.createElement('button');b.textContent='选择机降地块';b.onclick=()=>{pendingAirAssaultLanding={helicopterId:unit.id,passengerId:select.value};writeBattleMessage('空突机降：点击直升机周围4格以内的空闲陆地地块，按 ESC 取消');};box.append(select,b);}
 }else if(unit.airAssaultCapable&&unit.airAssaultStatus==='ground'){const hint=document.createElement('div');hint.textContent='请选中同阵营、相邻的建制运输直升机（直-20或直-8B）执行登机；普通空中支援卡不能代替建制运输机。';hint.style.fontSize='12px';box.append(hint);const nearby=units.filter(h=>AirAssaultSystem.canBoard(h,unit));for(const h of nearby){const b=document.createElement('button');b.textContent='转至可登机直升机：'+unitName(h);b.onclick=()=>showUnitInfo(h);box.append(b);} }else if(unit.airAssaultStatus==='embarked'){const b=document.createElement('button');b.textContent='查看运输直升机';b.onclick=()=>{const h=units.find(x=>String(x.id)===String(unit.embarkedOn));if(h)showUnitInfo(h);};box.append(b);}
 const title=unitInfo.querySelector('.unit-title');if(title?.nextSibling)unitInfo.insertBefore(box,title.nextSibling);else unitInfo.prepend(box);
}
function showUnitInfo(unit) {
    // Backfill the vehicle field for existing modern scout units and older saves.
    // Do not assign modern equipment to historical units.
    if (unit && (unit.modern || unit.generatedBy === 'ModernBrigadeSystem')) ensureScoutVehicles(unit);
    if (
        !unitInfo ||
        !unit
    ) {
        return;
    }
    const side =
        getUnitSide(
            unit
        );
    const sideName = FactionSystem.getSideName(side) || "未知";
    const name =
        unitName(
            unit
        );
    const type =
        unit.typeZh ??
        unit.type ??
        unit.unitType ??
        "未知";
    const ap =
        unit.movementPoints ??
        unit.actionPoints ??
        unit.ap ??
        "—";
    const maxAP =
        unit.maxMovementPoints ??
        unit.maxActionPoints ??
        unit.maxAP ??
        "—";
    const attackValue =
        combatSystem.getAttack(
            unit
        );
    const defenseValue =
        combatSystem.getDefense(
            unit
        );
    const rangeValue =
        combatSystem.getRange(
            unit
        );
    const active =
        playerCanControlUnit(
            unit
        );
    // V2.7.0: shared, read-only logistics visualization for all eras.
    const resourceBar = (label, value, maximum, inverse=false) => {
        const n=Number(value), max=Number(maximum);
        if(!Number.isFinite(n)||!Number.isFinite(max)||max<=0)return '';
        const pct=Math.max(0,Math.min(100,100*n/max));
        const warning=inverse?pct>=60:pct<=35;
        const color=warning?(inverse?'#d6a060':'#d77869'):(inverse?'#82b4bb':'#7fbda6');
        const safeLabel=String(label).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<div class="resource-line"><div class="resource-line-heading"><span>${safeLabel}</span><strong>${Math.round(n)} / ${Math.round(max)}</strong></div><div class="resource-track" role="progressbar" aria-label="${safeLabel}" aria-valuenow="${Math.round(n)}" aria-valuemin="0" aria-valuemax="${Math.round(max)}"><div class="resource-fill" style="width:${pct}%;background:${color}"></div></div></div>`;
    };
    const resourcePanel = () => {
        const items=[];
        const cls=movementSystem.inferMovementClass(unit);
        if(cls!=='foot' && unit.fuel!==undefined)items.push(resourceBar('油料',unit.fuel,unit.maxFuel??100));
        if(unit.ammunitionInventory && Object.keys(unit.ammunitionInventory).length){
            const labels={'5.8mm_rifle':'步枪弹药','7.62mm_mg':'机枪弹药','portable_at':'反装甲弹药','12.7mm_hmg':'12.7毫米重机枪弹'};
            for(const [key,value] of Object.entries(unit.ammunitionInventory))items.push(resourceBar(labels[key]??key,value,unit.ammunitionInventoryMax?.[key]??value));
        }else if(unit.ammo!==undefined || unit.ammunition!==undefined){items.push(resourceBar('弹药',unit.ammo??unit.ammunition,unit.maxAmmo??100));}
        items.push(resourceBar('士气',unit.morale??80,100));
        items.push(resourceBar('疲劳',unit.fatigue??0,100,true));
        if(unit.suppression!==undefined)items.push(resourceBar('压制',unit.suppression,100,true));
        return `<section class="resource-panel"><div class="resource-panel-title">后勤与作战状态</div>${items.join('')}</section>`;
    };
    const isSpecialForcesUnit = String(unit.type ?? unit.unitType ?? "").toLowerCase() === "special_forces";
    const isNavalUnit = unit.naval === true || unit.domain === "naval" || unit.unitClass === "naval";
    if (isNavalUnit) {
        const equipmentName = unit.equipmentName ?? unit.equipmentType ?? unit.equipment?.[0]?.name ?? unit.equipment?.[0]?.type ?? name;
        const navalTypeMap = {carrier:"航空母舰",destroyer:"导弹驱逐舰",escort:"导弹护卫舰",landing:"登陆舰",transport:"勤务/保障舰",submarine:"潜艇"};
        const navalType = navalTypeMap[String(unit.type??"").toLowerCase()] ?? type;
        const transport = unit.transport;
        const sub = unit.submarine;
        unitInfo.classList.remove("special-forces-info");
        unitInfo.innerHTML = `
          <div class="unit-title">${name}</div>
          ${resourcePanel()}
          <div class="unit-row"><span>装备</span><strong>${equipmentName} × ${unit.ships ?? 1}</strong></div>
          <div class="unit-row"><span>舰种</span><strong>${navalType}</strong></div>
          <div class="unit-row"><span>阵营</span><strong>${sideName}</strong></div>
          <div class="unit-row"><span>ID</span><strong>${unit.id}</strong></div>
          <div class="unit-row"><span>行动点</span><strong>${ap} / ${maxAP}</strong></div>
          <div class="unit-row"><span>舰体</span><strong>${Math.round(unit.hull ?? unit.strength ?? 100)} / ${Math.round(unit.maxHull ?? unit.maxStrength ?? 100)}</strong></div>
          <div class="unit-row"><span>弹药 / 燃油</span><strong>${Math.round(unit.ammo ?? 100)}% / ${Math.round(unit.fuel ?? 100)}%</strong></div>
          <div class="unit-row"><span>防空 / 反舰 / 反潜</span><strong>${unit.airDefense ?? 0} / ${unit.antiShip ?? 0} / ${unit.antiSubmarine ?? 0}</strong></div>
          <div class="unit-row"><span>探测</span><strong>${unit.detection ?? 0}</strong></div>
          ${unit.helicopterCapacity ? `<div class="unit-row"><span>舰载航空位</span><strong>${unit.helicopterCapacity}</strong></div>` : ""}
          ${transport ? `<div class="unit-row"><span>运输舱位</span><strong>人员${transport.personnelSlots??0} / 车辆${transport.vehicleSlots??0} / 重装${transport.heavySlots??0} / 坞舱${transport.wellDeckSlots??0}</strong></div>` : ""}
          ${sub?.enabled ? `<div class="unit-row"><span>潜艇状态</span><strong>${sub.defaultMode === "silent" ? "静默潜航" : "潜航"} · 隐蔽 ${unit.stealth??0}</strong></div>` : ""}
          <div class="unit-row"><span>射程</span><strong>${rangeValue}</strong></div>
          <div class="unit-row"><span>位置</span><strong>${unit.q}, ${unit.r}</strong></div>
          <div class="unit-row"><span>状态</span><strong>${active ? "可行动" : "不可行动"}</strong></div>`;
    } else if (isSpecialForcesUnit) {
        // 特战单位使用紧凑信息卡；同时强制继承合成旅步兵的基础野战工程能力。
        unit.engineering = { ...(unit.engineering ?? {}), canEntrench:true, canBuildAA1:true };
        const logistics = unit.modern ? modernLogisticsSystem.summary(unit) : null;
        unitInfo.classList.add("special-forces-info");
        unitInfo.innerHTML = `
            <div class="unit-title">${name}</div>
            ${resourcePanel()}
            <div class="sof-summary-grid">
                <div><span>人员</span><strong>${unit.modern ? `${Math.round(unit.manpower??0)} / ${Math.round(unit.maxManpower??0)}` : getStrengthText(unit)}</strong></div>
                <div><span>行动点</span><strong>${unit.actionPoints ?? "—"} / ${unit.maxActionPoints ?? "—"}</strong></div>
                <div><span>士气</span><strong>${unit.morale ?? "—"}</strong></div>
                <div><span>弹药</span><strong>${Math.round(unit.ammo ?? unit.ammunition ?? 0)}%</strong></div>
                ${unit.modern ? `<div><span>燃油</span><strong>${Math.round(unit.fuel??0)}%</strong></div>` : ""}
                <div><span>状态</span><strong>${active ? "可行动" : "不可行动"}</strong></div>
            </div>
            <div class="sof-combat-line"><span>攻击 <b>${attackValue}</b></span><span>防御 <b>${defenseValue}</b></span><span>射程 <b>${rangeValue}</b></span><span>位置 <b>${unit.q}, ${unit.r}</b></span></div>
            <div class="sof-capabilities"><span>特战能力</span><strong>侦察半径 ${unit.reconRadius??5}格 · 空降作战 · 简易工事 · 一级简易防空</strong></div>
            ${logistics ? `<div class="sof-loss-line">装备 ${logistics.equipment} · 可救治 ${logistics.wounded}人 · 永久损失 ${logistics.permanent}人</div>` : ""}
        `;
    } else {
        unitInfo.classList.remove("special-forces-info");
        unitInfo.innerHTML = `
        <div class="unit-title">
            ${name}
        </div>
        ${resourcePanel()}
        <div class="unit-row">
            <span>指挥官</span>
            <strong class="unit-commander">${unit.commander ?? unit.commanderName ?? "不详"}</strong>
        </div>
        <div class="unit-row">
            <span>隶属</span>
            <strong>${unit.parentFormation ?? unit.parent ?? unit.formation ?? "—"}</strong>
        </div>
        <div class="unit-row">
            <span>ID</span>
            <strong>${unit.id}</strong>
        </div>
        <div class="unit-row">
            <span>阵营</span>
            <strong>${sideName}</strong>
        </div>
        ${unit.historicalFormationPath ? `<div class="unit-row"><span>战役编制</span><strong>${unit.historicalFormationPath}</strong></div><div class="unit-row"><span>编制精度</span><strong>${unit.formationAssignmentStatus ?? '待核实'}</strong></div>` : ''}
        ${Array.isArray(unit.historicalEquipment) && unit.historicalEquipment.length ? `<div class="unit-row"><span>装备库存（模拟）</span><strong>${unit.historicalEquipment.map(x=>`${x.name} × ${x.quantity}${x.ammunitionType ? `〔${x.ammunitionType}〕` : ''}`).join('、')}</strong></div><div class="unit-row"><span>装备说明</span><strong>${unit.equipmentEvidence ?? '游戏化装备配置'}</strong></div>` : ''}
        <div class="unit-row">
            <span>兵种</span>
            <strong>${type}</strong>
        </div>
        <div class="unit-row">
            <span>编制</span>
            <strong>${unit.echelon ?? "—"}</strong>
        </div>
        <div class="unit-row">
            <span>行动点</span>
            <strong>${ap} / ${maxAP}</strong>
        </div>
        <div class="unit-row">
            <span>${unit.modern ? "人员" : "兵力"}</span>
            <strong>${unit.modern ? `${Math.round(unit.manpower??0)} / ${Math.round(unit.maxManpower??0)}人` : getStrengthText(unit)}</strong>
        </div>
        ${usesModernLogistics(unit) ? `<div class="unit-row"><span>装备</span><strong>${Array.isArray(unit.equipment)&&unit.equipment.length ? unit.equipment.map(e=>`${e.name??e.type} ${e.operational??e.current??e.count??0}/${e.initial??e.max??e.count??0}`).join("；") : modernLogisticsSystem.summary(unit).equipment}</strong></div><div class="unit-row"><span>弹药</span><strong>${Math.round(unit.ammo ?? unit.ammunition ?? 0)} / ${Math.round(unit.maxAmmo ?? 100)}</strong></div><div class="unit-row"><span>油料</span><strong>${unit.movementClass === "foot" ? "—（徒步单位）" : `${Math.round(unit.fuel??0)} / ${Math.round(unit.maxFuel??100)}`}</strong></div><div class="unit-row"><span>伤员</span><strong>可救治 ${modernLogisticsSystem.summary(unit).wounded}人 / 永久损失 ${modernLogisticsSystem.summary(unit).permanent}人</strong></div>` : ""}
        ${Array.isArray(unit.infantryWeapons) && unit.infantryWeapons.length ? `<div class="unit-row"><span>步兵装备</span><strong>${unit.infantryWeapons.map(w=>`${({QBZ191:'QBZ-191自动步枪',QBZ192:'QBZ-192短自动步枪',QBU191:'QBU-191精确射手步枪',QJB201:'QJB-201班用机枪',QJY201:'QJY-201通用机枪',QBZ95:'95式自动步枪',QBB95:'95式班用机枪',ROCKET_AT:'便携反装甲发射器'})[w.model] ?? w.model} ${w.operational ?? w.count ?? 0}/${w.count ?? 0}`).join('；')}</strong></div>` : (unit.modern && ['infantry','mechanized_infantry','wheeled_infantry','motorized_infantry','special_forces'].includes(unit.type) ? `<div class="unit-row"><span>步兵装备</span><strong>未配置型号级库存（需重新生成该单位）</strong></div>` : '')}
        ${unit.ammunitionInventory && Object.keys(unit.ammunitionInventory).length ? `<div class="unit-row"><span>步兵弹药库存</span><strong>${Object.entries(unit.ammunitionInventory).map(([k,v])=>`${({'5.8mm_rifle':'5.8毫米枪弹','7.62mm_mg':'7.62毫米机枪弹','portable_at':'便携反装甲弹药','12.7mm_hmg':'12.7毫米重机枪弹'})[k] ?? k} ${Math.floor(Number(v)||0)}/${Math.floor(Number(unit.ammunitionInventoryMax?.[k] ?? v)||0)}`).join('；')}</strong></div>` : ''}
        ${Array.isArray(unit.droneInventory)&&unit.droneInventory.length?`<div class="unit-row"><span>无人机库存</span><strong>${unit.droneInventory.map(e=>`${e.name} ${e.operational}/${e.initial}架`).join('；')}</strong></div>`:''}
        ${Array.isArray(unit.specialistEquipment)&&unit.specialistEquipment.length?`<div class="unit-row"><span>专业装备</span><strong>${unit.specialistEquipment.map(e=>`${e.name} ${e.operational}/${e.initial}`).join('；')}</strong></div>`:''}
        ${unit.droneMissionResources?`<div class="unit-row"><span>无人机任务资源</span><strong>能源 ${unit.droneMissionResources.battery}/${unit.droneMissionResources.maxBattery} · 可用架次 ${unit.droneMissionResources.sorties}/${unit.droneMissionResources.maxSorties}</strong></div>`:''}
        ${unit.nextGenEquipment?.model==='ZTZ100'||unit.nextGenEquipment?.model==='TYPE100_SUPPORT'?(()=>{const link=compute100Link(unit,gameState.units||[]);return `<div class="unit-row"><span>100式信息链路</span><strong>${link?.status||'中断'} · ${link?.peer||'无有效节点'} · 情报等级 +${link?.sharedIntel||0}</strong></div>`;})():''}
        ${engineerSystem.isEngineer(unit) ? (()=>{const k=engineerSystem.ensureEngineerKits(unit);return `<div class="unit-row"><span>工兵套件</span><strong>${k.current} / ${k.max} 套</strong></div>`;})() : ""}
        <div class="unit-row">
            <span>攻击</span>
            <strong>${attackValue}</strong>
        </div>
        <div class="unit-row">
            <span>防御</span>
            <strong>${defenseValue}</strong>
        </div>
        <div class="unit-row">
            <span>射程</span>
            <strong>${rangeValue}</strong>
        </div>
        <div class="unit-row">
            <span>攻击状态</span>
            <strong>
                ${
                    (unit.airborneDisorganized && Number(turnSystem?.turn ?? 1) <= Number(unit.airDropTurn ?? 0))
                        ? "空降集结中（下回合恢复）"
                        : unit.hasAttacked
                        ? "本阶段已攻击"
                        : "可攻击"
                }
            </strong>
        </div>
        <div class="unit-row">
            <span>士气</span>
            <strong>${unit.morale ?? "—"}</strong>
        </div>
        <div class="unit-row">
            <span>压制</span>
            <strong>${unit.suppression ?? "—"}</strong>
        </div>
        <div class="unit-row">
            <span>疲劳</span>
            <strong>${unit.fatigue ?? "—"}</strong>
        </div>
        ${!usesModernLogistics(unit) ? `<div class="unit-row"><span>弹药</span><strong>${Math.round(unit.ammo ?? unit.ammunition ?? 0)} / ${Math.round(unit.maxAmmo ?? 100)}</strong></div>` : ""}
        ${unit.logisticsStock ? `<div class="unit-row"><span>保障库存</span><strong>弹${Math.round(unit.logisticsStock.ammo)} / 油${Math.round(unit.logisticsStock.fuel)} / 备件${Math.round(unit.logisticsStock.parts)}</strong></div>`:""}
        <div class="unit-row">
            <span>位置</span>
            <strong>${unit.q}, ${unit.r}</strong>
        </div>
        <div class="unit-row">
            <span>状态</span>
            <strong>
                ${
                    active
                        ? "可行动"
                        : "不可行动"
                }
            </strong>
        </div>
    `;
    }
    // V2.7.4: equipment detail is a separate, readable section for every unit type.
    // Display existing inventory only; never synthesize missing equipment counts.
    const equipmentEntries = [];
    const escapeEquipment = value => String(value ?? '—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    if (Array.isArray(unit.equipment)) for (const e of unit.equipment) {
        if (typeof e === 'string') equipmentEntries.push([e, '—']);
        else if (e && typeof e === 'object') {
            const current=e.operational??e.current??e.remaining??e.count??e.quantity;
            const initial=e.initial??e.max??e.total??e.count??e.quantity;
            equipmentEntries.push([e.name??e.type??e.model??'装备', current==null?'—':`${current}${initial!=null?' / '+initial:''}`]);
        }
    }
    if (Array.isArray(unit.historicalEquipment)) for (const e of unit.historicalEquipment) {
        if (e && typeof e==='object') equipmentEntries.push([e.name??e.type??'历史装备', e.quantity??e.count??'—']);
    }
    const infantryModelNames = {QBZ191:'QBZ-191自动步枪',QBZ192:'QBZ-192短自动步枪',QBU191:'QBU-191精确射手步枪',QJB201:'QJB-201班用机枪',QJY201:'QJY-201通用机枪',QBZ95:'95式自动步枪',QBB95:'95式班用机枪',ROCKET_AT:'便携反装甲发射器'};
    if (Array.isArray(unit.infantryWeapons)) for (const w of unit.infantryWeapons) {
        if (w && typeof w==='object') {
            const model = w.model ?? w.name ?? w.type ?? w.id;
            const name = infantryModelNames[model] ?? w.name ?? model ?? '未指定型号的步兵武器';
            const current = w.operational ?? w.current ?? w.count ?? w.quantity;
            const initial = w.count ?? w.initial ?? w.quantity;
            equipmentEntries.push([name, current == null ? '—' : `${current}${initial != null ? ' / '+initial : ''}`]);
        }
    }
    if (unit.highMobilityVehicles && typeof unit.highMobilityVehicles==='object') {
        const v=unit.highMobilityVehicles;
        const operational=Math.max(0,Number(v.operational??0));
        const initial=Math.max(operational,Number(v.initial??operational));
        const damaged=Math.max(0,Number(v.damaged??0));
        equipmentEntries.push([v.name||'轻型高机动车',`${operational} / ${initial}（受损 ${damaged}；${v.movementMode==='foot'?'徒步':'车载'}）`]);
    }
    if (equipmentEntries.length) {
        const details=document.createElement('details');
        details.className='unit-equipment-details';
        details.open=true;
        const summary=document.createElement('summary');
        summary.textContent=`装备与武器详情（${equipmentEntries.length}类）`;
        details.appendChild(summary);
        const grid=document.createElement('div');grid.className='unit-equipment-grid';
        for (const [name,amount] of equipmentEntries) {
            const row=document.createElement('div');row.className='unit-equipment-item';
            row.innerHTML=`<span>${escapeEquipment(name)}</span><strong>${escapeEquipment(amount)}</strong>`;
            grid.appendChild(row);
        }
        details.appendChild(grid);
        const resource=unitInfo.querySelector(':scope > .resource-panel');
        if(resource)resource.insertAdjacentElement('afterend',details);else unitInfo.appendChild(details);
    }
    // V2.7.2: resource bars are authoritative in the overview; remove only
    // duplicate plain-text resource rows, without touching actual unit data.
    const hasResourceOverview = Boolean(unitInfo.querySelector(':scope > .resource-panel'));
    if (hasResourceOverview) {
        const duplicateLabels = new Set(['油料', '弹药', '士气', '疲劳', '压制', '弹药 / 燃油']);
        for (const row of unitInfo.querySelectorAll(':scope > .unit-row')) {
            const label = row.querySelector('span')?.textContent?.trim();
            if (duplicateLabels.has(label)) row.remove();
        }
    }
    // V2.7.1: elevate the most frequently consulted fields above logistics;
    // preserve existing DOM nodes and all action handlers.
    for (const row of unitInfo.querySelectorAll(':scope > .unit-row')) {
        const key = row.querySelector('span')?.textContent?.trim() ?? '';
        if (['行动点','人员','兵力','装备','攻击','防御','射程'].includes(key)) {
            row.classList.add('unit-key-stat');
        }
    }
    // V2.5.5: 玩家可直接操作行军模式。只改变移动系数，不重置行动点。
    if (playerCanControlUnit(unit) && !unit.destroyed) {
        const marchPanel = document.createElement('div');
        marchPanel.className = 'march-mode-controls';
        marchPanel.style.cssText = 'margin:10px 0;padding:9px;border:1px solid #74818b;border-radius:6px;';
        const marchTitle = document.createElement('div');
        marchTitle.textContent = '行军模式（疲劳 '+Math.round(Number(unit.fatigue??0))+'/100）';
        marchTitle.style.cssText = 'font-weight:bold;margin-bottom:6px';
        const marchSelect = document.createElement('select');
        marchSelect.setAttribute('aria-label','行军模式');
        marchSelect.style.cssText = 'max-width:100%;width:100%;padding:5px';
        for (const [value,label] of [['normal','正常行军'],['forced','强行军（移动×1.5）'],['rapid','急行军（移动×2）'],['rest','原地休整']]) {
            const option=document.createElement('option');option.value=value;option.textContent=label;
            option.selected=(unit.marchMode??'normal')===value;
            marchSelect.appendChild(option);
        }
        const hint=document.createElement('div');
        hint.style.cssText='font-size:12px;opacity:.85;margin-top:5px';
        const fatigueNow=Math.max(0,Number(unit.fatigue??0));
        const fatigueMult=fatigueNow<20?1:fatigueNow<40?.9:fatigueNow<60?.75:fatigueNow<80?.6:fatigueNow<100?.4:.25;
        const fuelMult={normal:1,forced:1.3,rapid:1.6,rest:0}[unit.marchMode??'normal']??1;
        const preview=document.createElement('div');
        preview.className='march-stats-preview';
        const baseMove=Number(unit.movement??({infantry:4,motorized:7,armor:8,tank:8,artillery:4,reconnaissance:10}[unit.type]??4));
        preview.innerHTML=`<div><span>本回合移动点</span><b>${Math.round(unit.movementPoints??0)} / ${Math.round(unit.maxMovementPoints??0)}</b></div><div><span>疲劳惩罚</span><b>×${fatigueMult.toFixed(2)}</b></div><div><span>下回合正常机动预计</span><b>${Math.floor(baseMove*fatigueMult)} 点</b></div><div><span>当前模式油耗倍率</span><b>×${fuelMult.toFixed(1)}</b></div><div><span>当前油料</span><b>${unit.fuel==null?'不适用':Math.round(unit.fuel)+' / '+Math.round(unit.maxFuel??100)}</b></div><div><span>上次移动油耗</span><b>${unit.lastMoveFuelSpent??'—'}</b></div>`;
        hint.textContent='实际油耗按经过格数与行军模式计算，不重复计入行动点成本；疲劳影响下回合机动。切换不恢复已消耗移动点。';
        marchSelect.addEventListener('change',()=>{
            if (unit.marchModeLockedTurn === Number(turnSystem?.turn??0)) {
                writeBattleMessage('本回合已确定行军模式，不可反复切换。');
                showUnitInfo(unit);return;
            }
            if (Number(unit.fatigue??0)>=90 && ['forced','rapid'].includes(marchSelect.value)) {
                writeBattleMessage('疲劳过高，无法强行军或急行军。');showUnitInfo(unit);return;
            }
            const requestedMode=marchSelect.value;
            movementSystem.applyMarchMode(unit,requestedMode);
            unit.marchModeLockedTurn=Number(turnSystem?.turn??0);
            if (selectedUnit === unit) calculateReachable(unit);
            writeBattleMessage('已设置行军模式：'+marchSelect.selectedOptions[0].textContent+'；剩余移动点 '+unit.movementPoints+'/'+unit.maxMovementPoints+'。');
            showUnitInfo(unit);render();
        });
        marchPanel.append(marchTitle,marchSelect,preview,hint);
        unitInfo.appendChild(marchPanel);
    }
    // v1.2.1：所有特战小组都拥有彼此独立的空降资格。
    // 不再依赖某个模板是否漏写 airDroppable；一支小队完成空降不会影响其他小队。
    if (isSpecialForcesUnit) {
        unit.airDroppable = true;
        unit.airborneCapable = true;
        if (typeof unit.airDropUsed !== "boolean") unit.airDropUsed = false;
    }
    if ((unit.airDroppable || isSpecialForcesUnit) && playerCanControlUnit(unit)) {
        const used = unit.airDropUsed === true;
        const airDropAction = document.createElement("div");
        airDropAction.className = "special-airdrop-action";
        airDropAction.innerHTML = `<div class="special-airdrop-summary"><span>特战任务</span><strong>侦察半径 ${unit.reconRadius??5}格 · 多域作战</strong></div><button id="specialAirDropButton" type="button" ${used ? "disabled" : ""}>${used ? "本小组已完成空降" : "空降至指定位置"}</button>`;
        const title = unitInfo.querySelector(".unit-title");
        if (title?.nextSibling) unitInfo.insertBefore(airDropAction, title.nextSibling);
        else unitInfo.prepend(airDropAction);
        airDropAction.querySelector("#specialAirDropButton")?.addEventListener("click",()=>beginSpecialAirDrop(unit));
    }
    if (isNavalUnit && unit.transport) addTransportActions(unit);
    addAirAssaultActions(unit);
    if (lastBattleMessage) {
        unitInfo.insertAdjacentHTML(
            "beforeend",
            `<hr><div class="battle-message" role="status" aria-live="polite"></div>`
        );
        const messageBox = unitInfo.querySelector(".battle-message");
        if (messageBox) messageBox.textContent = lastBattleMessage;
    }
}
// ============================================================
// 计算移动范围
// ============================================================
function calculateReachable(unit) {
    clearReachable();
    if (
        !unit ||
        !isUnitAlive(unit)
    ) {
        return;
    }
    movementSystem.selectUnit(
        unit,
        units
    );
    if (
        typeof renderer.setReachable ===
        "function"
    ) {
        renderer.setReachable(
            movementSystem.reachable
        );
    }
}
// ============================================================
// 选择单位
// ============================================================
function selectUnit(unit) {
    if (selectedUnit && unit && selectedUnit !== unit) { pendingEngineeringAction=null; pendingEngineeringUnitId=null; }
    if (
        !unit ||
        !isUnitAlive(unit)
    ) {
        return;
    }
    selectedUnit =
        unit;
    if (
        typeof selection.select ===
        "function"
    ) {
        selection.select(
            unit
        );
    }
    if (
        typeof renderer.setSelectedUnit ===
        "function"
    ) {
        renderer.setSelectedUnit(
            unit
        );
    }
    showUnitInfo(
        unit
    );
    if (
        playerCanControlUnit(
            unit
        )
    ) {
        calculateReachable(
            unit
        );
    }
    else {
        clearReachable();
    }
    render();
}
// ============================================================
// 查找 Hex 上的存活单位
// ============================================================
function unitAtHex(
    q,
    r
) {
    return (
        units.find(
            unit =>
                isUnitAlive(unit) &&
                Number(unit.q) ===
                Number(q) &&
                Number(unit.r) ===
                Number(r)
        ) ?? null
    );
}
// ============================================================
// 屏幕 -> 世界坐标
// ============================================================
function screenToWorld(
    screenX,
    screenY
) {
    const zoom =
        camera.zoom ?? 1;
    const offsetX =
        camera.x ??
        camera.offsetX ??
        0;
    const offsetY =
        camera.y ??
        camera.offsetY ??
        0;
    return {
        x:
            (
                screenX -
                offsetX
            ) / zoom,
        y:
            (
                screenY -
                offsetY
            ) / zoom
    };
}
// ============================================================
// 鼠标 -> Hex
// ============================================================
function mouseToHex(event) {
    const rect =
        canvas.getBoundingClientRect();
    const mouseX =
        event.clientX -
        rect.left;
    const mouseY =
        event.clientY -
        rect.top;
    const worldPosition =
        screenToWorld(
            mouseX,
            mouseY
        );
    const hexSize =
        renderer.hexSize ??
        renderer.size ??
        18;
    const flatHex = pixelToHex(worldPosition.x, worldPosition.y, hexSize);

    // v0.4.0 立体沙盘点击反算：高程会改变屏幕上的顶面位置，
    // 因此在平面估算点附近搜索“视觉中心”离鼠标最近的六角格。
    if (renderer?.view25D?.enabled && flatHex) {
        let best = flatHex;
        let bestD = Infinity;
        const radius = 7;
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dq = -radius; dq <= radius; dq++) {
                const q = Number(flatHex.q) + dq, r = Number(flatHex.r) + dr;
                if (q < 0 || r < 0 || q >= world.width || r >= world.height) continue;
                const p = renderer.worldToScreen(q, r);
                const d = Math.hypot(mouseX - p.x, mouseY - p.y);
                if (d < bestD) { bestD = d; best = { q, r }; }
            }
        }
        if (bestD <= hexSize * (camera.zoom ?? 1) * 1.08) return best;
    }
    return flatHex;
}
// ============================================================
// 点击单位检测
// ============================================================
function findUnitAtMouse(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) * (canvas.width / Math.max(1,rect.width));
    const mouseY = (event.clientY - rect.top) * (canvas.height / Math.max(1,rect.height));
    const zoom = Number(camera.zoom ?? 1);

    // v0.4.3：算子选择以“实际绘制位置”为第一优先级。
    // 这与 Renderer.drawUnits() 使用同一个 worldToScreen()，因此兼容：
    // 2D/立体沙盘、高程抬升、缩放、拖动、水面浮渡、空降后的单位。
    // 不再先用平面 Hex 反算来决定单位，否则高程较大时会误选相邻格或完全点不中。
    const baseW = zoom < 0.72 ? 26 : (zoom < 1.18 ? 32 : 36);
    const baseH = zoom < 0.72 ? 18 : (zoom < 1.18 ? 22 : 25);
    // 战术符号在大倍率下宽度可超过一个六角格；命中框须与绘制尺寸一致。
    // 原判定只覆盖中心约一半面积，点击指挥所/营级算子边缘会落空。
    const halfW = Math.max(18, baseW * zoom * 0.70);
    const halfH = Math.max(15, baseH * zoom * 0.85);

    let bestUnit = null;
    let bestScore = Infinity;
    // 逆序：与后绘制算子优先命中的直觉一致。
    for (let i = units.length - 1; i >= 0; i--) {
        const candidate = units[i];
        if (!candidate || candidate.offMap === true || !isUnitAlive(candidate)) continue;
        if (candidate.q === undefined || candidate.r === undefined) continue;
        // 必须在命中测试前过滤战争迷雾中的隐藏敌军，否则隐藏单位
        // 会抢占命中结果，随后被点击处理器丢弃，导致己方单位点不中。
        if (fogOfWarSystem?.isEnabled?.() &&
            getUnitSide(candidate) !== getPlayerSide() &&
            !fogOfWarSystem.visible.has(fogOfWarSystem.key(candidate.q,candidate.r))) continue;

        const p = renderer.worldToScreen(Number(candidate.q), Number(candidate.r));
        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
            // 椭圆归一化距离；重叠时选择鼠标最接近中心的算子。
            const score = (dx * dx) / (halfW * halfW) + (dy * dy) / (halfH * halfH);
            if (score < bestScore) {
                bestScore = score;
                bestUnit = candidate;
            }
        }
    }
    if (bestUnit) return bestUnit;

    // 没点到算子时才回退到 Hex，用于移动、攻击、工程、空降等地块操作。
    const hex = mouseToHex(event);
    if (!hex) return null;
    const atHex = unitAtHex(hex.q, hex.r);
    if (atHex && fogOfWarSystem?.isEnabled?.() &&
        getUnitSide(atHex) !== getPlayerSide() &&
        !fogOfWarSystem.visible.has(fogOfWarSystem.key(atHex.q,atHex.r))) return null;
    return atHex;
}
// ============================================================
// 玩家移动
// ============================================================
function tryMoveSelectedUnit(
    q,
    r
) {
    if (
        !selectedUnit ||
        !playerCanControlUnit(
            selectedUnit
        )
    ) {
        return false;
    }
    // ========================================================
    // 一格一单位
    // ========================================================
    const occupyingUnit =
        unitAtHex(
            q,
            r
        );
    if (
        occupyingUnit &&
        occupyingUnit !==
        selectedUnit
    ) {
        console.log(
            `[移动] Hex (${q}, ${r}) 已被 ${unitName(occupyingUnit)} 占据`
        );
        return false;
    }
    if (
        !movementSystem.canMoveTo(
            q,
            r,
            units
        )
    ) {
        return false;
    }
    undoSystem.push({ units, turnSystem, gameOver }, `移动：${unitName(selectedUnit)}`);
    const moveResult =
        movementSystem.moveTo(
            q,
            r,
            units
        );
    if (
        !moveResult ||
        moveResult.success === false
    ) {
        undoSystem.discardLast();
        return false;
    }
    // 只有这里才是玩家鼠标/触控发出的移动命令。底层 MovementSystem 同时服务 AI，
    // 因此玩家日志在此按 GameState 的实际控制阵营输出。
    console.log(`[玩家][${factionLabel(getPlayerSide())}] 移动 ${selectedUnit?.id ?? unitName(selectedUnit)} → (${q}, ${r})`);
    if (usesModernLogistics(selectedUnit)) {
        const traversedHexes = Array.isArray(moveResult.path) ? Math.max(1, moveResult.path.length - (moveResult.path[0]?.q === moveResult.from?.q && moveResult.path[0]?.r === moveResult.from?.r ? 1 : 0)) : Math.max(1, Math.round(Number(moveResult.cost??1)));
        const fuelResult=modernLogisticsSystem.consumeMove(selectedUnit, traversedHexes);
        if(!fuelResult.ok){
            // Reject unaffordable movement instead of moving first and silently emptying the tank.
            selectedUnit.q=moveResult.from.q;selectedUnit.r=moveResult.from.r;
            selectedUnit.movementPoints=Math.min(Number(selectedUnit.maxMovementPoints??0),Number(selectedUnit.movementPoints??0)+Number(moveResult.cost??0));
            writeBattleMessage(`${unitName(selectedUnit)} 油料不足：需要${fuelResult.required}，剩余${fuelResult.available}`);
            undoSystem.discardLast();
            return false;
        }
        if(selectedUnit.fuel<=0) writeBattleMessage(`${unitName(selectedUnit)} 燃油耗尽，需进入保障范围补给`);
    }
    pendingEngineeringAction=null; pendingEngineeringUnitId=null;
    selectedUnit =
        moveResult.unit ??
        selectedUnit;
    if (
        typeof selection.select ===
        "function"
    ) {
        selection.select(
            selectedUnit
        );
    }
    if (
        typeof renderer.setSelectedUnit ===
        "function"
    ) {
        renderer.setSelectedUnit(
            selectedUnit
        );
    }
    if (
        typeof renderer.setReachable ===
        "function"
    ) {
        renderer.setReachable(
            movementSystem.reachable
        );
    }
    selectedHex = { q:Number(selectedUnit.q), r:Number(selectedUnit.r) };
    hexInfoPanel.show(selectedHex.q, selectedHex.r);
    refreshEngineerActions();
    showUnitInfo(
        selectedUnit
    );
    render();
    updateSaveControls();
    // 占领战略目标后立即检查胜利，不必等待结束回合。
    if (!gameOver) checkVictory();
    return true;
}
// ============================================================
// 战斗消息
// ============================================================
function writeBattleMessage(
    message
) {
    lastBattleMessage = String(message ?? "");
    console.log(
        "[战斗]",
        lastBattleMessage
    );
    if (unitInfo) {
        const existing = unitInfo.querySelector(".battle-message");
        if (existing) {
            existing.textContent = lastBattleMessage;
        } else {
            unitInfo.insertAdjacentHTML(
                "beforeend",
                `<hr><div class="battle-message" role="status" aria-live="polite"></div>`
            );
            const messageBox = unitInfo.querySelector(".battle-message");
            if (messageBox) messageBox.textContent = lastBattleMessage;
        }
    }
}
// ============================================================
// 死亡单位处理
// ============================================================
function echelonZh(unit){
    const e=String(unit?.echelon??'').toLowerCase();
    const map={team:'小队',squad:'班',platoon:'排',company:'连',battalion:'营',regiment:'团',brigade:'旅',division:'师',corps:'军',army:'集团军'};
    if(String(unit?.faction??unit?.side)==='japanese'){const j={company:'中队',battalion:'大队',regiment:'联队',brigade:'旅团',division:'师团',corps:'军',army:'方面军'};return j[e]??map[e]??(unit?.echelon??'未知');}
    return map[e]??(unit?.echelon??'未知');
}
function isCommandUnit(unit){return unit?.isCommandUnit===true||String(unit?.type??unit?.unitType??'').toLowerCase()==='hq'||/司令部|指挥部|师部|军部/.test(String(unit?.name??''));}
function commandLevelZh(unit){
    const e=String(unit?.commandLevel??unit?.echelon??'').toLowerCase();
    const map={regiment:'团指',brigade:'旅指',division:'师指',corps:'军指',army:'集团军司令部','army_group':'集团军群司令部',front:'方面军司令部'};
    return map[e]??`${echelonZh(unit)}指`;
}
function resetCasualtyState(){
    casualtyState.sides={};
    for(const u of units){
        u._casualtyLastStrength=Math.max(0,Number(u.strength??u.manpower??0));
        u._casualtyDestroyedRecorded=!!u.destroyed;
        u._casualtyCommittedRecorded=false;
        if(u.offMap!==true) ensureCommitted(u);
    }
}
function casualtySide(side){return casualtyState.sides[side]??(casualtyState.sides[side]={losses:0,committed:0,destroyed:{},commandDestroyed:{},commandNames:[]});}
function ensureCommitted(unit){if(!unit||unit.offMap===true||unit._casualtyCommittedRecorded)return;const s=casualtySide(getUnitSide(unit));s.committed+=Math.max(0,Number(unit.maxStrength??unit.maxManpower??unit.strength??unit.manpower??0));unit._casualtyCommittedRecorded=true;}
function recordCasualtyDelta(unit){
    if(!unit)return; ensureCommitted(unit); if(unit.offMap===true)return;
    const now=Math.max(0,Number(unit.strength??unit.manpower??0));
    const prev=Number.isFinite(Number(unit._casualtyLastStrength))?Number(unit._casualtyLastStrength):now;
    if(now<prev) casualtySide(getUnitSide(unit)).losses+=Math.round(prev-now);
    unit._casualtyLastStrength=now;
    if((unit.destroyed===true||now<=0)&&!unit._casualtyDestroyedRecorded){
        const s=casualtySide(getUnitSide(unit));
        // v1.1.5: 指挥机构单独分类，绝不再同时计入普通“营/连”损失。
        if(isCommandUnit(unit)){
            const cz=commandLevelZh(unit);
            s.commandDestroyed[cz]=(s.commandDestroyed[cz]??0)+1;
            s.commandNames.push(String(unit.name??unit.id??cz));
        }else{
            const z=echelonZh(unit);
            s.destroyed[z]=(s.destroyed[z]??0)+1;
        }
        unit._casualtyDestroyedRecorded=true;
    }
}
function casualtyRatioText(){
    const entries=Object.entries(casualtyState.sides);
    if(entries.length<2)return '暂无';
    const [a,b]=entries;
    const al=Math.max(0,Number(a[1].losses||0)), bl=Math.max(0,Number(b[1].losses||0));
    if(al===0&&bl===0)return '0 : 0';
    if(al===0)return `0 : ${bl}`;
    return `1 : ${(bl/al).toFixed(2)}`;
}
function renderCasualtyPanel(){
    const panel=document.getElementById('casualtyPanel');if(!panel)return;const sides=Object.entries(casualtyState.sides);
    if(!sides.length){panel.innerHTML='<h3>战损统计</h3><div class="hint">暂无战损</div>';return;}
    const ratio=sides.length>=2?`<div class="casualty-ratio"><b>战损比：</b>${factionLabel(sides[0][0])||sides[0][0]} : ${factionLabel(sides[1][0])||sides[1][0]} = ${casualtyRatioText()}</div>`:'';
    panel.innerHTML='<h3>战损统计</h3>'+ratio+sides.map(([side,s])=>{
        const rate=s.committed>0?(s.losses/s.committed*100):0;
        const current=Math.max(0,s.committed-s.losses);
        const kills=Object.entries(s.destroyed).filter(([,n])=>n>0).map(([e,n])=>`${e}×${n}`).join(' · ')||'无';
        const cmd=Object.entries(s.commandDestroyed).filter(([,n])=>n>0).map(([e,n])=>`${e}×${n}`).join(' · ')||'无';
        const names=s.commandNames.length?`<div class="casualty-command-names">${s.commandNames.map(x=>`• ${x}`).join('<br>')}</div>`:'';
        return `<div class="casualty-side"><strong>${factionLabel(side)||side}</strong><div>累计投入：${s.committed}</div><div>当前有效兵力：${current}</div><div>累计损失：${s.losses} <b>（${rate.toFixed(1)}%）</b></div><div>作战单位损失：${kills}</div><div class="casualty-command"><b>指挥机构损失：</b>${cmd}${names}</div></div>`;
    }).join('');
}
function syncCasualties(){for(const u of units)recordCasualtyDelta(u);renderCasualtyPanel();}
function removeDestroyedUnits() {
    for (const unit of units) {
        if (!unit) {
            continue;
        }
        // --------------------------------------------------------
        // 同时读取 strength / manpower
        //
        // CombatSystem 的不同版本可能修改其中任意一个字段，
        // 因此不能再只依赖 manpower ?? strength。
        // --------------------------------------------------------
        const strengthValue =
            Number(unit.strength);
        const manpowerValue =
            Number(unit.manpower);
        const strengthDead =
            Number.isFinite(strengthValue) &&
            strengthValue <= 0;
        const manpowerDead =
            Number.isFinite(manpowerValue) &&
            manpowerValue <= 0;
        // --------------------------------------------------------
        // 任意一套兵力系统确认单位死亡，就统一判定阵亡
        // --------------------------------------------------------
        const dead =
            unit.destroyed === true ||
            strengthDead ||
            manpowerDead;
        if (!dead) {
            continue;
        }
        // --------------------------------------------------------
        // 统一死亡状态
        // --------------------------------------------------------
        unit.strength = 0;
        unit.manpower = 0;
        unit.destroyed = true;
        unit.movementPoints = 0;
        unit.actionPoints = 0;
        unit.hasAttacked = true;
        console.log(
            `[单位系统] ${unit.id} 已被消灭，停止显示与行动`
        );
        // --------------------------------------------------------
        // 如果当前选中的正好是阵亡单位
        // --------------------------------------------------------
        if (
            selectedUnit === unit ||
            (
                selectedUnit?.id &&
                unit.id &&
                selectedUnit.id === unit.id
            )
        ) {
            selectedUnit = null;
        }
    }
    // ------------------------------------------------------------
    // 清除死亡单位选择状态
    // ------------------------------------------------------------
    if (
        selectedUnit &&
        !isUnitAlive(selectedUnit)
    ) {
        clearSelection();
    }
    // ------------------------------------------------------------
    // 阵亡单位继续保留在 units 中。
    // VictorySystem 的 HQ 全灭判定仍然需要这些数据。
    // ------------------------------------------------------------
    gameState.units = units;
    syncCasualties();
}
// ============================================================
// 胜负检查
// ============================================================
// ============================================================
// 战役结束弹窗
// ============================================================
function battleResultSummary(result){
    const player=normalizeSide(getPlayerSide());
    const winner=normalizeSide(result?.winner);
    const victory=winner && winner!=='draw' && winner===player;
    const defeat=winner && winner!=='draw' && winner!==player;
    const objectives=(scenario?.strategicObjectives?.[player]??[]);
    let primaryTotal=0,primaryDone=0,totalDone=0;
    for(const o of objectives){
        const done=units.some(u=>isUnitAlive(u)&&getUnitSide(u)===player&&u.offMap!==true&&Math.abs(Number(u.q)-Number(o.q))<=Number(o.controlRadius??0)&&Math.abs(Number(u.r)-Number(o.r))<=Number(o.controlRadius??0));
        if(done)totalDone++; if(String(o.priority??'secondary').toLowerCase()==='primary'){primaryTotal++;if(done)primaryDone++;}
    }
    return {player,winner,victory,defeat,primaryTotal,primaryDone,totalDone,total:objectives.length};
}
function saveCampaignProgress(result){
    try{
        const key=String(currentScenarioKey??scenario?.id??scenario?.key??'unknown');
        const summary=battleResultSummary(result); const turn=Number(turnSystem?.turn??1);
        const all=JSON.parse(localStorage.getItem('frontline_campaign_progress')||'{}');
        const prev=all[key]??{};
        all[key]={...prev,lastResult:summary.victory?'victory':summary.defeat?'defeat':'draw',completed:summary.victory||prev.completed===true,bestTurn:summary.victory?Math.min(Number(prev.bestTurn??Infinity),turn):(prev.bestTurn??null),completedObjectives:summary.totalDone,totalObjectives:summary.total,updatedAt:new Date().toISOString()};
        localStorage.setItem('frontline_campaign_progress',JSON.stringify(all));
    }catch(err){console.warn('[战役进度] 保存失败',err);}
}
function destroyBattleResultUI(){
    document.getElementById('victory-modal')?.remove();
    document.getElementById('post-battle-return')?.remove();
}
function returnToCampaignMenuAfterBattle(){
    // 无论从结算窗口还是战后观察模式退出，都彻底清除战役结束 UI。
    destroyBattleResultUI();
    postBattleViewing = false;
    campaignSelection.onMainMenu=()=>showMainMenu();
    campaignSelection.onReturnToBattle=null;
    campaignSelection.hasActiveBattle=false;
    if(campaignSelection.phase) campaignSelection.renderScenarios();
    else showScenarioSelection();
}
function enterPostBattleView(){
    // “查看战场”必须真正关闭/销毁结算窗口，而不是仅隐藏。
    document.getElementById('victory-modal')?.remove();
    postBattleViewing = true;
    document.getElementById('post-battle-return')?.remove();

    // gameOver 保持 true：允许查看单位/地图，但移动、攻击、工程、支援、结束回合均继续锁定。
    if (endPhaseButton) endPhaseButton.disabled = true;
    clearReachable();

    const btn=document.createElement('button');
    btn.id='post-battle-return';
    btn.type='button';
    btn.innerHTML='<span class="post-battle-status">战役已结束</span><span class="post-battle-exit">退出战役</span>';
    Object.assign(btn.style,{position:'fixed',right:'24px',bottom:'24px',zIndex:'99990',padding:'10px 18px',border:'1px solid #4d4b40',background:'#d6cfb2',color:'#24251f',font:'16px FangSong, STFangsong, SimSun, serif',cursor:'pointer',boxShadow:'0 4px 18px rgba(0,0,0,.3)',display:'flex',alignItems:'center',gap:'14px'});
    btn.querySelector('.post-battle-status').style.opacity='.7';
    btn.querySelector('.post-battle-exit').style.fontWeight='700';
    btn.onclick=returnToCampaignMenuAfterBattle;
    document.body.appendChild(btn);
    render();
}
function showVictoryModal(result) {
    postBattleViewing = false;
    syncCasualties(); saveCampaignProgress(result);
    if (!document.getElementById('victory-modal-style')) {const style=document.createElement('style');style.id='victory-modal-style';style.textContent=`#victory-modal{position:fixed;inset:0;z-index:100000;font-family:FangSong,STFangsong,SimSun,serif}#victory-modal .victory-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(18,20,17,.76)}#victory-modal .victory-window{width:min(620px,calc(100vw - 48px));padding:32px 38px;border:2px solid #5a5646;outline:1px solid #c6b98b;outline-offset:-8px;background:#d6cfb2;color:#24251f;text-align:center;box-shadow:0 18px 60px rgba(0,0,0,.48)}#victory-modal .victory-title{font-size:44px;font-weight:700;letter-spacing:.12em}#victory-modal .victory-reason{margin:16px 0;line-height:1.6}#victory-modal .victory-details{margin:18px auto;max-width:450px;border-top:1px solid #77715d;border-bottom:1px solid #77715d;padding:10px 0}.victory-detail-row{display:flex;justify-content:space-between;padding:5px}.victory-actions{display:flex;justify-content:center;gap:14px;flex-wrap:wrap}.victory-button{min-width:160px;padding:10px 18px;border:1px solid #4d4b40;background:#666754;color:#f0ecd9;font:inherit;cursor:pointer}`;document.head.appendChild(style);}
    document.getElementById('victory-modal')?.remove();
    const summary=battleResultSummary(result); const turn=Number(turnSystem?.turn??1);
    const title=summary.victory?'战役胜利':summary.defeat?'战役失败':'战斗结束';
    const sides=Object.entries(casualtyState.sides); const ratio=sides.length>=2?`${factionLabel(sides[0][0])||sides[0][0]} : ${factionLabel(sides[1][0])||sides[1][0]} = ${casualtyRatioText()}`:'暂无';
    const cmdLoss=sides.map(([side,x])=>`${factionLabel(side)||side}：${Object.entries(x.commandDestroyed).map(([k,n])=>`${k}×${n}`).join('、')||'无'}`).join('；');
    const modal=document.createElement('div');modal.id='victory-modal';modal.innerHTML=`<div class="victory-overlay"><div class="victory-window"><div class="victory-title">${title}</div><div class="victory-reason">${result?.reason??'战役已经结束'}</div><div class="victory-details"><div class="victory-detail-row"><span>战役回合</span><strong>第${turn}回合</strong></div><div class="victory-detail-row"><span>主要目标</span><strong>${summary.primaryDone}/${summary.primaryTotal}</strong></div><div class="victory-detail-row"><span>全部目标</span><strong>${summary.totalDone}/${summary.total}</strong></div><div class="victory-detail-row"><span>战损比</span><strong>${ratio}</strong></div><div class="victory-detail-row"><span>指挥机构损失</span><strong>${cmdLoss}</strong></div></div><div class="victory-actions"><button class="victory-button" id="victory-view">查看战场</button><button class="victory-button" id="victory-menu">返回战役菜单</button></div></div></div>`;document.body.appendChild(modal);
    modal.querySelector('#victory-view').onclick=enterPostBattleView;
    modal.querySelector('#victory-menu').onclick=returnToCampaignMenuAfterBattle;
}
function checkVictory() {
    // 综合测试场永不触发历史胜负，保证每个版本都可无限结束回合测试。
    const __cfg = getScenarioConfig?.() ?? {};
    const __sid = String(scenario?.id ?? scenario?.key ?? gameState?.scenarioKey ?? "");
    if (__sid === "system_test_range" || scenario?.specialRules?.disableVictory === true || __cfg?.specialRules?.disableVictory === true) {
        gameOver = false;
        if (endPhaseButton) endPhaseButton.disabled = false;
        return false;
    }

    if (
        gameOver ||
        !victorySystem
    ) {
        return gameOver;
    }
    // 清除兵力为 0 / 已摧毁的单位，确保地图和判定同步
  // ============================================================
// 胜负检查时必须保留阵亡单位
// HQ 全灭判定需要知道哪些指挥单位已经被摧毁
// ============================================================
gameState.units =
    units;
    const result =
        victorySystem.check(
            units,
            {
                turn: turnSystem?.turn ?? 1,
                phase: normalizeSide(turnSystem?.phase ?? getScenarioConfig().start.startingPhase),
                playerSide: getPlayerSide(),
                // 使用右侧战略目标面板已经确认的状态作为玩家侧胜利判定唯一事实源。
                // 防止 UI 已完成而 VictorySystem 的独立巩固计时尚未同步。
                objectiveStates: strategicObjectives?.getObjectiveStates?.() ?? {},
                scenario,
                year: turnSystem?.year ?? 1941,
                month: turnSystem?.month ?? 6,
                day: turnSystem?.day ?? 26,
                hour: turnSystem?.hour ?? 8,
                minute: turnSystem?.minute ?? 0
            }
        );
    if (!result.gameOver) {
        return false;
    }
    gameOver = true;
    clearSelection();
    const winnerText = result.winner ? `${FactionSystem.getSideName(result.winner)}胜利` : "战斗结束";
    if (unitInfo) {
        unitInfo.innerHTML = `
            <div class="unit-title">
                战斗结束
            </div>
            <div class="unit-row">
                <strong>
                    ${winnerText}
                </strong>
            </div>
            <div class="unit-row">
                <span>
                    ${result.reason ?? ""}
                </span>
            </div>
        `;
    }
    if (turnInfo) {
        turnInfo.textContent =
            winnerText;
    }
    if (endPhaseButton) {
        endPhaseButton.disabled =
            true;
    }
    console.log(
        "========================================"
    );
    console.log(
        `[胜负系统] ${winnerText}`
    );
    console.log(
        `[胜负系统] ${result.reason ?? ""}`
    );
    console.log(
        "========================================"
    );
    render();
    // 胜负确认后显示中央弹窗。
    // units 不删除阵亡单位，因此 HQ 全灭判定仍保留完整历史状态。
    showVictoryModal(result);
    return true;
}
function modernLossText(result) {
    const loss=result?.modernLoss;
    if(!loss) return "";
    const eq=(loss.equipmentLosses??[]).filter(e=>(e.before??0)!==(e.after??0)).map(e=>`${e.name} ${e.before}→${e.after}（轻修+${e.minor||0} / 中修+${e.medium||0} / 重修+${e.heavy||0} / 损毁+${e.destroyed||0}）`).join("；");
    return `；人员 ${loss.beforeManpower}→${loss.afterManpower}（可救治伤员+${loss.recoverable||0}，永久损失+${loss.permanent||0}）${eq?`；装备 ${eq}`:""}`;
}
// ============================================================
// 玩家攻击
// ============================================================
function performAttack(
    attacker,
    defender,
    {
        ai = false
    } = {}
) {
    if (
        gameOver ||
        !attacker ||
        !defender ||
        !isUnitAlive(attacker) ||
        !isUnitAlive(defender)
    ) {
        return false;
    }
    if (
        !combatSystem.canAttack(
            attacker,
            defender
        )
    ) {
        return false;
    }
    if (!ai) {
        undoSystem.push({ units, turnSystem, gameOver }, `攻击：${unitName(attacker)}`);
    }
    const result =
        combatSystem.attack(
            attacker,
            defender
        );
    if (
        !result?.success
    ) {
        if (!ai) undoSystem.discardLast();
        writeBattleMessage(
            result?.reason ??
            "攻击失败"
        );
        return false;
    }
    if (usesModernLogistics(attacker)) {
        // 战损已由 CombatSystem 统一结算到人员 + 实际装备；这里只消耗攻击方弹药。
        modernLogisticsSystem.consumeAttack(attacker, defender);
        result.afterStrength = defender.strength;
        result.destroyed = defender.destroyed===true || defender.strength<=0;
    } else {
        // 历史战役沿用抽象兵力。
        defender.manpower = Math.max(0, Number(defender.strength ?? result.afterStrength ?? 0));
    }
    const sideLabel = FactionSystem.getSideName(getUnitSide(attacker));
    const prefix =
        ai
            ? `${sideLabel} AI：`
            : "";
    const destroyedText =
        result.destroyed
            ? "，目标被消灭"
            : "";
    writeBattleMessage(
        `${prefix}${unitName(attacker)} 攻击 ${unitName(defender)}，` +
        `造成 ${result.damage} 点损失 ` +
        `（${result.beforeStrength}/${getUnitMaxStrength(defender)} → ` +
        `${result.afterStrength}/${getUnitMaxStrength(defender)}）` +
        modernLossText(result) +
        destroyedText
    );
    removeDestroyedUnits();
    // 攻击后立即同步当前被查看单位的数据与右侧信息栏。
    if (selectedUnit) {
        const refreshedSelected = units.find(
            (u) => u === selectedUnit || (u.id && u.id === selectedUnit.id)
        );
        if (refreshedSelected && isUnitAlive(refreshedSelected)) {
            selectedUnit = refreshedSelected;
            showUnitInfo(refreshedSelected);
        } else if (!isUnitAlive(selectedUnit)) {
            clearSelection();
        }
    }
    // 强制重绘，确保地图兵力标签立即反映战损。
    render();
    if (
        !checkVictory()
    ) {
        if (
            selectedUnit &&
            isUnitAlive(
                selectedUnit
            )
        ) {
            showUnitInfo(
                selectedUnit
            );
            calculateReachable(
                selectedUnit
            );
        }
        render();
    }
    updateSaveControls();
    return true;
}
// ============================================================
// 阵营阶段重置
// ============================================================
function resetFactionForPhase(
    faction
) {
    movementSystem.resetFaction?.(
        units,
        faction
    );
    combatSystem.resetFaction?.(
        units,
        faction
    );
    // v1.6.15: MovementSystem only resets movement points. Engineering uses
    // actionPoints, so restore these separately each faction action phase.
    // Keep the reset strictly side-scoped; dead and off-map units get nothing.
    for (const u of units) {
        if (!u || normalizeSide(u.faction ?? u.side) !== normalizeSide(faction) ||
            u.destroyed === true || u.offMap === true || !isUnitAlive(u)) continue;
        const maximum = Number(u.maxActionPoints);
        u.maxActionPoints = Number.isFinite(maximum) && maximum > 0 ? maximum : 4;
        u.actionPoints = u.maxActionPoints;
        // Legacy air-dropped units can retain an attack lock from deployment.
        // ResetCombat handles hasAttacked; ensure the landing marker itself
        // expires after the turn in which the unit arrived.
        if (u.airborneDeployed === true &&
            Number(turnSystem?.turn ?? 1) > Number(u.airDropTurn ?? 0)) {
            u.airborneDisorganized = 0;
            u.hasActed = false;
            u.hasAttacked = false;
            u.hasBombarded = false;
        }
    }
}
// ============================================================
// 延时
// ============================================================
function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}
// ============================================================
// AI 航空支援：敌方使用自己的卡组；只受剩余使用次数限制
// ============================================================
function runAIAirSupport(side) {
    const cards = airSupportSystem.available(side).filter(c=>c.availability?.ok!==false);
    if (!cards.length) return null;
    const own=units.filter(u=>isUnitAlive(u)&&getUnitSide(u)===side);
    const enemy=units.filter(u=>isUnitAlive(u)&&getUnitSide(u)!==side);
    if(!enemy.length)return null;
    const scoreTarget=(u)=>{
        const t=String(u.type??u.unitType??'').toLowerCase();
        const command=/hq|headquarters|command/.test(t)||/司令|指挥部|团部/.test(String(u.name??''));
        const dense=enemy.reduce((n,e)=>n+(combatSystem.getDistance(u,e)<=2?1:0),0);
        return (command?80:0)+dense*8+Number(u.strength??0)/20;
    };
    const target=[...enemy].sort((a,b)=>scoreTarget(b)-scoreTarget(a))[0];
    const ownTarget=[...own].sort((a,b)=>Number(a.strength??0)-Number(b.strength??0))[0];
    // 每个 AI 阶段最多执行一次航空任务，防止一回合瞬间清空整副卡组。
    const priority=[...cards].sort((a,b)=>{const w=x=>x.missionType==='cap'?60:x.missionType==='recon'?50:x.missionType==='supply'?25:70;return w(b)-w(a);});
    for(const c of priority){
        const tgt=c.missionType==='supply'?(ownTarget??target):target;
        const result=airSupportSystem.execute(side,c.id,{q:tgt.q,r:tgt.r});
        if(result?.ok){writeBattleMessage(`${FactionSystem.getSideName(side)} AI航空兵：${c.name} 已出动（剩余 ${airSupportSystem.state?.[side]?.cards?.[c.id]??0} 次）`);return result;}
    }
    return null;
}

// ============================================================
// AI 阶段
// ============================================================
async function runAIPhase() {
    if (
        aiRunning ||
        gameOver ||
        !turnSystem ||
        String(gameState.mode).toLowerCase() === "developer"
    ) {
        return;
    }
    const currentSide =
        normalizeSide(
            turnSystem.phase
        );
    const playerSide =
        getPlayerSide();
    if (
        !currentSide ||
        currentSide ===
        playerSide
    ) {
        return;
    }
    undoSystem.clear();
    aiRunning =
        true;
    if (endPhaseButton) {
        endPhaseButton.disabled =
            true;
    }
    try {
        resetFactionForPhase(
            currentSide
        );
        const aiUnits =
            units.filter(
                unit =>
                    getUnitSide(unit) ===
                        currentSide &&
                    isUnitAlive(unit)
            );
        const passiveAI = String(getScenarioConfig()?.aiMode ?? scenario?.aiMode ?? "").toLowerCase() === "passive";
        const sideLabel = `${FactionSystem.getSideName(currentSide)} AI`;
        // 综合测试场使用被动 AI：敌军保留在地图上用于射程、工事、战斗等测试，
        // 但不会自行移动或攻击；其阶段仍会自动结束，避免测试流程卡死。
        const unitsToAct = passiveAI ? [] : aiUnits;
        if (!passiveAI) { try { cmdAIAirborne(currentSide); } catch(e) { console.warn('[AI空降] 执行失败',e); } }
        if (!passiveAI) { try { runAIAirSupport(currentSide); } catch(e) { console.warn('[AI航空] 跳过本阶段航空行动',e); } }
        for (
            const unit
            of unitsToAct
        ) {
            if (gameOver) {
                break;
            }
            if (
                !isUnitAlive(
                    unit
                )
            ) {
                continue;
            }
            const result =
                aiSystem.actUnit(
                    unit,
                    units
                );
            if (
                result?.type ===
                    "attack" &&
                result.result?.success
            ) {
                const combat =
                    result.result;
                writeBattleMessage(
                    `${sideLabel}：${unitName(combat.attacker)} 攻击 ${unitName(combat.defender)}，` +
                    `造成 ${combat.damage} 点损失 ` +
                    `（${combat.beforeStrength}/${getUnitMaxStrength(combat.defender)} → ` +
                    `${combat.afterStrength}/${getUnitMaxStrength(combat.defender)}）` +
                    modernLossText(combat) +
                    `${combat.destroyed ? "，目标被消灭" : ""}`
                );
            }
            if (
                result?.type ===
                    "move-and-attack" &&
                result.combat?.success
            ) {
                const combat =
                    result.combat;
                writeBattleMessage(
                    `${sideLabel}：${unitName(combat.attacker)} 移动后攻击 ${unitName(combat.defender)}，` +
                    `造成 ${combat.damage} 点损失 ` +
                    `（${combat.beforeStrength}/${getUnitMaxStrength(combat.defender)} → ` +
                    `${combat.afterStrength}/${getUnitMaxStrength(combat.defender)}）` +
                    modernLossText(combat) +
                    `${combat.destroyed ? "，目标被消灭" : ""}`
                );
            }
            removeDestroyedUnits();
            render();
            if (
                checkVictory()
            ) {
                break;
            }
            await sleep(
                220
            );
        }
        if (
            !gameOver &&
            normalizeSide(
                turnSystem.phase
            ) ===
                currentSide
        ) {
            clearSelection();
            turnSystem.endPhase?.();
            processCapturableFacilities();
            const nextSide =
                normalizeSide(
                    turnSystem.phase
                );
            resetFactionForPhase(
                nextSide
            );
            updateTurnUI();
            render();
            if (
                !gameOver &&
                nextSide &&
                nextSide !==
                    getPlayerSide()
            ) {
                setTimeout(
                    () => {
                        runAIPhase();
                    },
                    250
                );
            }
        }
    }
    catch (error) {
        console.error(
            "AI 行动失败：",
            error
        );
        if (unitInfo) {
            unitInfo.innerHTML = `
                <div class="unit-title">
                    AI 行动失败
                </div>
                <div>
                    ${error?.message ?? error}
                </div>
            `;
        }
    }
    finally {
        aiRunning =
            false;
        if (
            endPhaseButton &&
            !gameOver
        ) {
            endPhaseButton.disabled =
                false;
        }
    }
}
// ============================================================
// 鼠标按下
// ============================================================
canvas.addEventListener(
    "mousedown",
    event => {
        if (
            event.button !==
            0
        ) {
            return;
        }
        isDragging =
            true;
        dragMoved =
            false;
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
    }
);
// ============================================================
// 拖动地图
// ============================================================
window.addEventListener(
    "mousemove",
    event => {
        if (!isDragging) {
            return;
        }
        const dx =
            event.clientX -
            lastMouseX;
        const dy =
            event.clientY -
            lastMouseY;
        if (Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) <= 7) {
            lastMouseX = event.clientX;
            lastMouseY = event.clientY;
            return;
        }
        dragMoved = true;
        if (
            typeof camera.pan ===
            "function"
        ) {
            camera.pan(
                dx,
                dy
            );
        }
        else {
            if (
                Number.isFinite(
                    camera.x
                )
            ) {
                camera.x +=
                    dx;
            }
            if (
                Number.isFinite(
                    camera.y
                )
            ) {
                camera.y +=
                    dy;
            }
            if (
                Number.isFinite(
                    camera.offsetX
                )
            ) {
                camera.offsetX +=
                    dx;
            }
            if (
                Number.isFinite(
                    camera.offsetY
                )
            ) {
                camera.offsetY +=
                    dy;
            }
        }
        lastMouseX =
            event.clientX;
        lastMouseY =
            event.clientY;
        render();
    }
);
// ============================================================
// 鼠标释放
// ============================================================
window.addEventListener(
    "mouseup",
    () => {
        isDragging =
            false;
    }
);
// ============================================================
// 地块与工程行动
// ============================================================
function refreshEngineerActions(){
    if(!engineerActions) return;
    // 主系统工兵状态看门狗：目标模式引用的单位不存在/已切换/已阵亡时立即释放锁。
    if(pendingEngineeringAction && (!selectedUnit || !isUnitAlive(selectedUnit) || (pendingEngineeringUnitId!=null && String(pendingEngineeringUnitId)!==String(selectedUnit.id??selectedUnit.name??'')))) {
        pendingEngineeringAction=null; pendingEngineeringUnitId=null;
    }
    const p=selectedUnit?engineerSystem.profile(selectedUnit):null;
    if(selectedUnit && engineerSystem.profile(selectedUnit).canEntrench && selectedUnit.actionPoints==null){selectedUnit.maxActionPoints=Math.max(1,Number(selectedUnit.maxActionPoints)||4);selectedUnit.actionPoints=selectedUnit.maxActionPoints;}
    const canWork=!!(selectedUnit&&engineerSystem.canWork(selectedUnit));
    const q=Number(selectedUnit?.q),r=Number(selectedUnit?.r);
    const mine=selectedUnit?engineerSystem.getMinefield(q,r):null;
    const canEngineer=!!(p&&(p.canEntrench||p.canLayMines||p.canClearMines||p.canBuildBridge));
    engineerActions.hidden=!canEngineer;
    if(buildFortButton)buildFortButton.disabled=!(p?.canEntrench&&canWork);
    if(layMineButton)layMineButton.disabled=!(p?.canLayMines&&canWork);
    if(clearMineButton)clearMineButton.disabled=!(p?.canClearMines&&canWork&&mine);
    // 工程按钮按“能力”而不是按单位ID/是否工兵统一锁定。
    // 这样营属/旅属工兵只要还有行动点就能持续施工；普通步兵可修简单工事和一级简易防空阵地。
    if(buildFoxholeButton) buildFoxholeButton.disabled=!(p?.canEntrench&&canWork);
    if(buildBunkerButton) buildBunkerButton.disabled=!(p?.canBuildAdvanced&&canWork);
    if(buildAA1Button) buildAA1Button.disabled=!(p?.canBuildAA1&&canWork);
    if(buildAA2Button) buildAA2Button.disabled=!(p?.canBuildAA2&&canWork);
    if(buildAA3Button) buildAA3Button.disabled=!(p?.canBuildAA3&&canWork);
    [buildBridgeButton,repairBridgeButton,demolishBridgeButton,buildWallButton,demolishWallButton].forEach(b=>{if(b)b.disabled=!(engineerSystem.isEngineer(selectedUnit)&&canWork);});
}
function selectHexAtEvent(event){const h=mouseToHex(event);if(!h)return null;selectedHex=h;hexInfoPanel.show(h.q,h.r);return h;}
let pendingSpecialAirDropUnitId = null;

function airDropMapSize(){
    return {
        width:Number(currentScenarioConfig?.trainingMap?.width ?? world?.width ?? 60),
        height:Number(currentScenarioConfig?.trainingMap?.height ?? world?.height ?? 40)
    };
}
function airDropTerrain(q,r){
    return String(world?.terrainAt?.(q,r) ?? world?.getTerrain?.(q,r) ?? "plain");
}
function validateSpecialAirDropTarget(unit,q,r){
    const {width,height}=airDropMapSize();
    q=Number(q); r=Number(r);
    if(!Number.isFinite(q)||!Number.isFinite(r)||q<0||r<0||q>=width||r>=height) return {ok:false,message:"目标超出训练场范围"};
    const terrain=airDropTerrain(q,r);
    if(["water","steepMountain","marsh","wetland"].includes(terrain)) return {ok:false,message:`${terrain} 地形不适合特战小队空降`};
    const occupied=units.some(x=>x!==unit&&x.offMap!==true&&isUnitAlive(x)&&Number(x.q)===q&&Number(x.r)===r);
    if(occupied) return {ok:false,message:"目标格已有单位，不能实施空降"};
    return {ok:true,terrain};
}
function buildSpecialAirDropHighlights(unit){
    const {width,height}=airDropMapSize();
    const targets=new Map();
    for(let q=0;q<width;q++) for(let r=0;r<height;r++){
        if(validateSpecialAirDropTarget(unit,q,r).ok) targets.set(`${q},${r}`,0);
    }
    return targets;
}
function beginSpecialAirDrop(unit){
    if(!unit||!isUnitAlive(unit)||!(unit.airDroppable||String(unit.type??unit.unitType??"").toLowerCase()==="special_forces")){writeBattleMessage("当前单位不具备空降能力");return;}
    if(unit.airDropUsed){writeBattleMessage("该特战小队本场演习已经执行过空降任务");return;}
    if(!playerCanControlUnit(unit)){writeBattleMessage("当前不能指挥该特战小队");return;}
    pendingSpecialAirDropUnitId=unit.id;
    clearReachable();
    const targets=buildSpecialAirDropHighlights(unit);
    if(typeof renderer.setReachable==="function") renderer.setReachable(targets);
    writeBattleMessage(`${unitName(unit)}：空降模式已开启，绿色区域为合法落点；点击目标格实施投送，按 ESC 取消`);
    render();
}
function cancelSpecialAirDrop(message="已取消特战小队空降目标选择"){
    pendingSpecialAirDropUnitId=null; clearReachable(); writeBattleMessage(message); render();
}

let pendingEngineeringAction = null;
let pendingEngineeringUnitId = null;
const ENGINEER_TARGET_ACTIONS = new Set(['bridge','repairBridge','demolishEngineering','wall','demolishWall']);
function engineerActionLabel(kind){ return ({bridge:'架设浮桥',repairBridge:'修复桥梁',demolishEngineering:'爆破工事',wall:'建设防御墙',demolishWall:'拆毁墙体'})[kind] ?? '工程作业'; }
function beginEngineerTargeting(kind){
    if(!selectedUnit){writeBattleMessage('请先选择工兵单位');return;}
    if(!engineerSystem.isEngineer(selectedUnit)){writeBattleMessage('当前单位不是工兵，不能执行该工程');return;}
    if(!engineerSystem.canWork(selectedUnit)){writeBattleMessage('该工兵当前没有可用行动点');refreshEngineerActions();return;}
    const check=engineerSystem.validateAction(selectedUnit,kind,null);
    if(!check.ok){writeBattleMessage(check.message);refreshEngineerActions();return;}
    pendingEngineeringAction=kind;
    pendingEngineeringUnitId=selectedUnit.id??selectedUnit.name??null;
    writeBattleMessage(`${engineerActionLabel(kind)}：请在地图上点击合法目标格；按 ESC 可取消`);
    render();
}
function doEngineerAction(kind){
    if(!selectedUnit)return;
    const own={q:Number(selectedUnit.q),r:Number(selectedUnit.r)};
    const target=(['bridge','repairBridge','demolishEngineering','wall','demolishWall'].includes(kind)&&selectedHex)?selectedHex:own;
    const validation=engineerSystem.validateAction(selectedUnit,kind,target);
    if(!validation.ok){writeBattleMessage(validation.message);refreshEngineerActions();render();return;}
    let result;
    if(kind==='fort')result=engineerSystem.entrench(selectedUnit,own.q,own.r);
    if(kind==='foxhole')result=engineerSystem.buildFortification(selectedUnit,own.q,own.r,'foxhole');
    if(kind==='bunker')result=engineerSystem.buildFortification(selectedUnit,own.q,own.r,'bunker');
    if(kind==='aa1')result=engineerSystem.buildAAPosition(selectedUnit,own.q,own.r,1);
    if(kind==='aa2')result=engineerSystem.buildAAPosition(selectedUnit,own.q,own.r,2);
    if(kind==='aa3')result=engineerSystem.buildAAPosition(selectedUnit,own.q,own.r,3);
    if(kind==='lay')result=engineerSystem.layMine(selectedUnit,own.q,own.r);
    if(kind==='clear')result=engineerSystem.clearMine(selectedUnit,own.q,own.r);
    if(kind==='bridge')result=engineerSystem.buildBridge(selectedUnit,target.q,target.r,true);
    if(kind==='repairBridge')result=engineerSystem.repairBridge(selectedUnit,target.q,target.r);
    if(kind==='demolishEngineering')result=engineerSystem.demolishEngineering(selectedUnit,target.q,target.r);
    if(kind==='wall')result=engineerSystem.buildWall(selectedUnit,target.q,target.r);
    if(kind==='demolishWall')result=engineerSystem.demolishWall(selectedUnit,target.q,target.r);
    if(result?.message)writeBattleMessage(result.message);
    hexInfoPanel.show(target.q,target.r);refreshEngineerActions();showUnitInfo(selectedUnit);render();updateSaveControls();
}
buildFortButton?.addEventListener('click',()=>doEngineerAction('fort'));
buildFoxholeButton?.addEventListener('click',()=>doEngineerAction('foxhole'));
buildBunkerButton?.addEventListener('click',()=>doEngineerAction('bunker'));
buildAA1Button?.addEventListener('click',()=>doEngineerAction('aa1'));
buildAA2Button?.addEventListener('click',()=>doEngineerAction('aa2'));
buildAA3Button?.addEventListener('click',()=>doEngineerAction('aa3'));
layMineButton?.addEventListener('click',()=>doEngineerAction('lay'));
clearMineButton?.addEventListener('click',()=>doEngineerAction('clear'));
buildBridgeButton?.addEventListener('click',()=>beginEngineerTargeting('bridge'));
repairBridgeButton?.addEventListener('click',()=>beginEngineerTargeting('repairBridge'));
demolishBridgeButton?.addEventListener('click',()=>beginEngineerTargeting('demolishEngineering'));
buildWallButton?.addEventListener('click',()=>beginEngineerTargeting('wall'));
demolishWallButton?.addEventListener('click',()=>beginEngineerTargeting('demolishWall'));

// 历史遗留的直属部队调试按钮不属于正式界面。
document.getElementById("liberation-unit-picker")?.remove();
document.getElementById("liberation-unit-picker-panel")?.remove();
// 指挥交互：用 pointerup 结束一次真实点击，避免浏览器合成 click 被拖动状态误吞。
// 仅在点击存活且可见的单位时接管；空地移动/攻击继续交由既有 click 流程。
let _pointerSelectionConsumed = false;
let _pointerDownLocation = null;
canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    _pointerDownLocation = {x:event.clientX,y:event.clientY};
}, true);
canvas.addEventListener("pointerup", event => {
    if (event.button !== 0 || !_pointerDownLocation || gameOver || aiRunning) return;
    const dist = Math.hypot(event.clientX-_pointerDownLocation.x,event.clientY-_pointerDownLocation.y);
    _pointerDownLocation = null;
    if (dist > 8) return;
    // 避免覆盖攻击、工程定点和其它特殊地图指令。
    if (pendingEngineeringAction || pendingAirCard || pendingAirAssaultFlight ||
        pendingAirAssaultLanding || pendingSpecialAirDropUnitId ||
        pendingAirborneReserveId || cmdPickingTarget) return;
    const u = findUnitAtMouse(event);
    if (!u || !playerCanViewUnit(u)) return;
    const own = getUnitSide(u) === getPlayerSide();
    // 当已有我方单位选中时，点击敌军应走原攻击处理。
    if (!own && selectedUnit && playerCanControlUnit(selectedUnit)) return;
    if (!own && fogOfWarSystem.isEnabled() &&
        !fogOfWarSystem.visible.has(fogOfWarSystem.key(u.q,u.r))) return;
    selectUnit(u);
    selectedHex = {q:Number(u.q),r:Number(u.r)};
    hexInfoPanel.show(selectedHex.q,selectedHex.r);
    refreshEngineerActions();
    _pointerSelectionConsumed = true;
    console.debug("[单位选择确认]",u.id,"side",getUnitSide(u),"player",getPlayerSide(),"control",playerCanControlUnit(u));
}, true);
// ============================================================
// 点击地图
// ============================================================
canvas.addEventListener(
    "click",
    event => {
        if (_pointerSelectionConsumed) {
            _pointerSelectionConsumed = false;
            dragMoved = false;
            return;
        }
        if (
            gameOver ||
            aiRunning
        ) {
            return;
        }
        if (dragMoved) {
            dragMoved = false;
            return;
        }
        const rawClickedUnit = findUnitAtMouse(event);
        // 迷雾必须同时约束鼠标命中，避免读取隐藏敌军详情或直接攻击。
        const clickedUnit = rawClickedUnit && (
            getUnitSide(rawClickedUnit) === getPlayerSide() ||
            !fogOfWarSystem.isEnabled() ||
            fogOfWarSystem.visible.has(fogOfWarSystem.key(rawClickedUnit.q, rawClickedUnit.r))
        ) ? rawClickedUnit : null;
        const clickedHex = selectHexAtEvent(event);
        if (currentScenarioConfig?.id === "yangtze_grand_1949") {
            console.debug("[渡江总战役/地图点击]", {hex:clickedHex, unit:clickedUnit?.id ?? null,
                unitSide:clickedUnit ? getUnitSide(clickedUnit) : null,
                playerSide:getPlayerSide(), phase:turnSystem?.phase,
                canControl:clickedUnit ? playerCanControlUnit(clickedUnit) : null,
                mode:gameState.mode});
        }
        if (currentScenarioConfig?.liberation1949 && clickedUnit) {
            console.debug("[渡江单位点击]", {id:clickedUnit.id,name:clickedUnit.name,
                group:clickedUnit.commandGroup, side:getUnitSide(clickedUnit),
                player:getPlayerSide(), phase:turnSystem?.phase,
                canControl:playerCanControlUnit(clickedUnit),ap:clickedUnit.actionPoints});
        }
        if(cmdPickingTarget&&clickedHex){cmdPickingTarget=false;const host=document.getElementById('brigadeCommandPanel');host.querySelector('#cmdCoords').value=`${clickedHex.q},${clickedHex.r}`;host.querySelector('#cmdObjective').value='';host.style.display='block';document.getElementById('brigadeCommandToggle').style.display='none';cmdUpdatePanel();return;}

        if(pendingAirAssaultFlight && clickedHex){
            const task=pendingAirAssaultFlight,h=units.find(x=>String(x.id)===String(task.helicopterId));
            if(!h){pendingAirAssaultFlight=null;writeBattleMessage('直升机飞行取消：单位不存在');return;}
            const occupied=units.some(x=>x!==h&&!x.offMap&&isUnitAlive(x)&&Number(x.q)===Number(clickedHex.q)&&Number(x.r)===Number(clickedHex.r));
            if(!AirAssaultSystem.fly(h,clickedHex,occupied)){writeBattleMessage('飞行失败：目标必须在6格以内且未被占用，需至少2行动点与足够燃油');return;}
            pendingAirAssaultFlight=null;selectedUnit=h;selectedHex={q:h.q,r:h.r};writeBattleMessage(unitName(h)+' 飞行至('+h.q+','+h.r+')');showUnitInfo(h);render();return;
        }
        if(pendingAirAssaultLanding && clickedHex){
            const task=pendingAirAssaultLanding,h=units.find(x=>String(x.id)===String(task.helicopterId)),p=units.find(x=>String(x.id)===String(task.passengerId));
            if(!h||!p){pendingAirAssaultLanding=null;writeBattleMessage('机降取消：单位不存在');return;}
            const terrain=terrainAtTransport(clickedHex.q,clickedHex.r);
            const occupied=units.some(x=>x!==p&&!x.offMap&&isUnitAlive(x)&&Number(x.q)===Number(clickedHex.q)&&Number(x.r)===Number(clickedHex.r));
            const tile={q:clickedHex.q,r:clickedHex.r,terrain};
            if(!AirAssaultSystem.land(h,p,tile,occupied)){writeBattleMessage('机降失败：必须在直升机4格以内的空闲陆地，且有足够燃油与行动点');return;}
            pendingAirAssaultLanding=null;selectedUnit=p;selectedHex={q:p.q,r:p.r};
            fogOfWarSystem?.reveal?.(p.q,p.r,3,2);
            writeBattleMessage(`${unitName(p)} 机降至 (${p.q},${p.r})，本回合进入集结状态；运输直升机已消耗燃油与行动点`);
            showUnitInfo(p);render();return;
        }
        if(pendingSpecialAirDropUnitId && clickedHex){
            const u=units.find(x=>String(x.id)===String(pendingSpecialAirDropUnitId));
            if(!u||!isUnitAlive(u)||!(u.airDroppable||String(u.type??u.unitType??"").toLowerCase()==="special_forces")||u.airDropUsed){cancelSpecialAirDrop('空降任务已失效');return;}
            const check=validateSpecialAirDropTarget(u,clickedHex.q,clickedHex.r);
            if(!check.ok){writeBattleMessage(`无法空降：${check.message}；请重新选择绿色合法落点，按 ESC 取消`);return;}
            pendingSpecialAirDropUnitId=null; clearReachable();
            u.q=Number(clickedHex.q); u.r=Number(clickedHex.r); u.airDropUsed=true; u.actionPoints=0; u.movementPoints=0; u.hasActed=true; u.hasAttacked=false;
            u.engineering={...(u.engineering??{}),canEntrench:true,canBuildAA1:true}; // 空降后仍保留简易野战工程能力
            u.morale=Math.max(45,Number(u.morale??82)-8); u.airborneDisorganized=1; u.airDropTurn=Number(turnSystem?.turn??0);
            selectedUnit=u; selectedHex={q:u.q,r:u.r};
            fogOfWarSystem?.reveal?.(u.q,u.r,Number(u.reconRadius??5),2);
            writeBattleMessage(`${unitName(u)} 已空降至 (${u.q},${u.r})，本回合进入集结状态；侦察半径 ${u.reconRadius??5} 格`);
            showUnitInfo(u); render(); return;
        }
        if(pendingAirborneReserveId && clickedHex){
            const side=getPlayerSide(), list=airborneReserves[side]||[];
            const index=list.findIndex(u=>String(u.id)===String(pendingAirborneReserveId));
            if(index<0){pendingAirborneReserveId=null;writeBattleMessage('空降预备队单位不存在');return;}
            const u=list[index],q=Number(clickedHex.q),r=Number(clickedHex.r);
            const terrain=String(world?.terrainAt?.(q,r)??'plain').toLowerCase();
            if(units.some(x=>!x.offMap&&Number(x.q)===q&&Number(x.r)===r)||['deep_water','water','cliff','mountain','swamp'].includes(terrain)){
                writeBattleMessage('空降失败：落点已被占用或地形不适合空降；请选择其他地块');return;
            }
            const selection=JSON.parse(sessionStorage.getItem('modernAirborneSelection')||'null')?.[side];
            const capacity=AIRBORNE_DECK.aircraft.reduce((n,a)=>n+Math.max(0,Number(selection?.aircraft?.[a.id])||0)*a.transportPoints,0);
            if(capacity<Number(u.airborneTransportCost||0)){writeBattleMessage('运输机运力不足，无法投送该单位');return;}
            list.splice(index,1);pendingAirborneReserveId=null;
            u.q=q;u.r=r;u.offMap=false;u.airborneReserve=false;u.airborneDeployed=true;u.airborneDisorganized=1;
            u.airDropTurn=Number(turnSystem?.turn??1);u.movementPoints=0;u.actionPoints=0;u.hasActed=true;u.hasMoved=true;u.hasAttacked=false;
            units.push(u);selectedUnit=u;selectedHex={q,r};
            fogOfWarSystem?.reveal?.(q,r,3,2);
            writeBattleMessage(`${u.name} 已空降至 (${q},${r})，本回合进行集结`);
            showUnitInfo(u);renderAirSupportPanel();render();return;
        }
        if(pendingAirCard && clickedHex){
            const card=pendingAirCard; pendingAirCard=null;
            const side=getPlayerSide(); const result=airSupportSystem.execute(side,card,clickedHex);
            if(result?.refund&&airSupportSystem.state?.[side]?.cards?.[card]!=null){airSupportSystem.state[side].cards[card]++;delete airSupportSystem.state[side].nextAvailable?.[card];}
            if(result?.message)writeBattleMessage(result.message);
            if(!result?.refund && scenario?.capturableFacilities){const f=scenario.capturableFacilities.find(x=>x.type==='military_airfield'&&Number(x.q)===Number(clickedHex.q)&&Number(x.r)===Number(clickedHex.r));if(f){const st=scenario.facilityState?.[f.id]??(scenario.facilityState[f.id]={owner:f.initialOwner??null,durability:Number(f.initialDurability??100),disabled:false,captures:0});const dmg=Number(f.airstrikeDamage??35);st.durability=Math.max(0,Number(st.durability??100)-dmg);st.disabled=st.durability<Number(f.disabledBelow??50);writeBattleMessage(`空袭波及「${f.name}」：机场耐久 -${dmg}，现为 ${Math.round(st.durability)}/${f.maxDurability??100}${st.disabled?'，机场停用，需工兵抢修':''}。`);}}
            renderAirSupportPanel(); render(); return;
        }
        if(pendingEngineeringAction && selectedUnit && clickedHex){
            const action=pendingEngineeringAction;
            const expected=pendingEngineeringUnitId;
            pendingEngineeringAction=null; pendingEngineeringUnitId=null;
            if(expected!=null && String(expected)!==String(selectedUnit.id??selectedUnit.name??'')){writeBattleMessage('工程单位已改变，已取消本次工程选择');render();return;}
            selectedHex=clickedHex;
            doEngineerAction(action);
            return;
        }
        if (String(gameState.mode).toLowerCase() === "developer" && developerEditorHandleClick(event, clickedUnit, clickedHex)) { return; }
        // ====================================================
        // 点击了单位
        // ====================================================
        if (clickedUnit) {
            // ------------------------------------------------
            // 已选择玩家单位 + 点击敌军
            // = 尝试攻击
            // ------------------------------------------------
            if (
                selectedUnit &&
                playerCanControlUnit(
                    selectedUnit
                ) &&
                getUnitSide(
                    clickedUnit
                ) !==
                getUnitSide(
                    selectedUnit
                )
            ) {
                if (
                    performAttack(
                        selectedUnit,
                        clickedUnit
                    )
                ) {
                    return;
                }
                const attackCheck = combatSystem.getAttackEligibility?.(selectedUnit, clickedUnit);
                writeBattleMessage(
                    `无法攻击 ${unitName(clickedUnit)}：` +
                    `${attackCheck?.reason ?? "攻击条件不满足"}`
                );
                render();
                return;
            }
            if (
                playerCanViewUnit(
                    clickedUnit
                )
            ) {
                selectUnit(
                    clickedUnit
                );
                selectedHex = { q:Number(clickedUnit.q), r:Number(clickedUnit.r) };
                hexInfoPanel.show(selectedHex.q, selectedHex.r);
                refreshEngineerActions();
            }
            return;
        }
        // ====================================================
        // 点击空格 = 尝试移动
        // ====================================================
        if (selectedUnit) {
            const hex =
                mouseToHex(
                    event
                );
            if (
                hex &&
                tryMoveSelectedUnit(
                    hex.q,
                    hex.r
                )
            ) {
                return;
            }
        }
        clearSelection();
        selectedUnit = null;
        refreshEngineerActions();
        render();
    }
);
// ============================================================
// iPad / 触屏：单指拖动、轻触选择、双指缩放
// ============================================================
let touchMoved = false;
let touchStartX = 0, touchStartY = 0;
let touchLastX = 0, touchLastY = 0;
let pinchStartDistance = 0, pinchStartZoom = 1;

function touchDistance(a,b){ return Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY); }
function setCameraZoomAt(clientX, clientY, newZoom){
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const oldZoom = camera.zoom ?? 1;
    const minZoom = camera.minZoom ?? 0.35, maxZoom = camera.maxZoom ?? 3;
    newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
    if (typeof camera.zoomAt === 'function') camera.zoomAt(x,y,newZoom);
    else {
        const oldX = camera.x ?? camera.offsetX ?? 0, oldY = camera.y ?? camera.offsetY ?? 0;
        const worldX=(x-oldX)/oldZoom, worldY=(y-oldY)/oldZoom;
        const nx=x-worldX*newZoom, ny=y-worldY*newZoom;
        camera.zoom=newZoom;
        if('x' in camera) camera.x=nx; if('y' in camera) camera.y=ny;
        if('offsetX' in camera) camera.offsetX=nx; if('offsetY' in camera) camera.offsetY=ny;
    }
}
canvas.addEventListener('touchstart', e=>{
    e.preventDefault();
    touchMoved=false;
    if(e.touches.length===1){
        const t=e.touches[0]; touchStartX=touchLastX=t.clientX; touchStartY=touchLastY=t.clientY;
    } else if(e.touches.length===2){
        pinchStartDistance=touchDistance(e.touches[0],e.touches[1]);
        pinchStartZoom=camera.zoom ?? 1; touchMoved=true;
    }
},{passive:false});
canvas.addEventListener('touchmove', e=>{
    e.preventDefault();
    if(e.touches.length===1){
        const t=e.touches[0], dx=t.clientX-touchLastX, dy=t.clientY-touchLastY;
        if(Math.hypot(t.clientX-touchStartX,t.clientY-touchStartY)>7) touchMoved=true;
        if(touchMoved){
            if(typeof camera.pan==='function') camera.pan(dx,dy);
            else { if(Number.isFinite(camera.x))camera.x+=dx; if(Number.isFinite(camera.y))camera.y+=dy; if(Number.isFinite(camera.offsetX))camera.offsetX+=dx; if(Number.isFinite(camera.offsetY))camera.offsetY+=dy; }
            render();
        }
        touchLastX=t.clientX; touchLastY=t.clientY;
    } else if(e.touches.length===2 && pinchStartDistance>0){
        const a=e.touches[0], b=e.touches[1], d=touchDistance(a,b);
        const cx=(a.clientX+b.clientX)/2, cy=(a.clientY+b.clientY)/2;
        setCameraZoomAt(cx,cy,pinchStartZoom*(d/pinchStartDistance)); touchMoved=true; render();
    }
},{passive:false});
canvas.addEventListener('touchend', e=>{
    e.preventDefault();
    if(e.touches.length===0){
        if(!touchMoved && e.changedTouches.length){
            const t=e.changedTouches[0];
            canvas.dispatchEvent(new MouseEvent('click',{clientX:t.clientX,clientY:t.clientY,bubbles:true}));
        }
        pinchStartDistance=0;
    } else if(e.touches.length===1){
        touchLastX=e.touches[0].clientX; touchLastY=e.touches[0].clientY;
        pinchStartDistance=0; touchMoved=true;
    }
},{passive:false});
canvas.addEventListener('touchcancel',()=>{pinchStartDistance=0;touchMoved=false;},{passive:false});

// ============================================================
// 滚轮缩放
// ============================================================
canvas.addEventListener(
    "wheel",
    event => {
        event.preventDefault();
        const rect =
            canvas.getBoundingClientRect();
        const mouseX =
            event.clientX -
            rect.left;
        const mouseY =
            event.clientY -
            rect.top;
        const oldZoom =
            camera.zoom ?? 1;
        const factor =
            event.deltaY < 0
                ? 1.1
                : 0.9;
        const minZoom =
            camera.minZoom ??
            0.35;
        const maxZoom =
            camera.maxZoom ??
            3;
        const newZoom =
            Math.max(
                minZoom,
                Math.min(
                    maxZoom,
                    oldZoom *
                    factor
                )
            );
        if (
            typeof camera.zoomAt ===
            "function"
        ) {
            camera.zoomAt(
                mouseX,
                mouseY,
                newZoom
            );
            render();
            return;
        }
        const oldX =
            camera.x ??
            camera.offsetX ??
            0;
        const oldY =
            camera.y ??
            camera.offsetY ??
            0;
        const worldX =
            (
                mouseX -
                oldX
            ) /
            oldZoom;
        const worldY =
            (
                mouseY -
                oldY
            ) /
            oldZoom;
        const newX =
            mouseX -
            worldX *
            newZoom;
        const newY =
            mouseY -
            worldY *
            newZoom;
        camera.zoom =
            newZoom;
        if (
            "x" in camera
        ) {
            camera.x =
                newX;
        }
        if (
            "y" in camera
        ) {
            camera.y =
                newY;
        }
        if (
            "offsetX" in camera
        ) {
            camera.offsetX =
                newX;
        }
        if (
            "offsetY" in camera
        ) {
            camera.offsetY =
                newY;
        }
        render();
    },
    {
        passive: false
    }
);
// ============================================================
// 结束当前阶段
// ============================================================
function endCurrentPhase() {
    // 综合测试场：敌军为静态靶标。一次“结束回合”直接跳过被动 AI 阶段，
    // 回到玩家下一回合，避免按钮被 AI 锁定或胜负系统误禁用。
    const __testId = String(scenario?.id ?? scenario?.key ?? gameState?.scenarioKey ?? "");
    if (__testId === "system_test_range" && turnSystem && !aiRunning) {
        gameOver = false;
        cmdProcess(true);
        saveSystem.autoSave({ units, turnSystem, gameState, gameOver, scenario, world, reinforcementSystem });
        undoSystem.clear(); clearSelection();
        const __player = getPlayerSide();
        let __guard = 0;
        do {
            turnSystem.endPhase?.();
            __guard++;
        } while (__guard < 8 && normalizeSide(turnSystem.phase) !== __player);
        resetFactionForPhase(normalizeSide(turnSystem.phase));
        processReinforcementsForCurrentTurn();
        if (endPhaseButton) endPhaseButton.disabled = false;
        updateTurnUI(); render();
        return;
    }
    if (
        gameOver ||
        aiRunning ||
        !turnSystem
    ) {
        return;
    }
    const currentSide =
        normalizeSide(
            turnSystem.phase
        );
    const playerSide =
        getPlayerSide();
    if (String(gameState.mode).toLowerCase() === "developer") {
        cmdProcess(true);
        saveSystem.autoSave({ units, turnSystem, gameState, gameOver, scenario, world, reinforcementSystem });
        undoSystem.clear(); clearSelection(); turnSystem.endPhase?.();
        resetFactionForPhase(normalizeSide(turnSystem.phase)); updateTurnUI(); render(); updateDeveloperPanel();
        return;
    }
    if (
        playerSide &&
        currentSide !==
            playerSide
    ) {
        runAIPhase();
        return;
    }
    // 同阵营未选集团在本方阶段结束时执行独立协同作战。
    if(currentScenarioConfig?.liberation1949 && gameState.playerCommandGroup && String(gameState.mode).toLowerCase()!=="developer") {
        const selectedGroup=String(gameState.playerCommandGroup).trim();
        const allies=units.filter(u=>isUnitAlive(u)&&!u.offMap&&getUnitSide(u)===playerSide &&
            ![u.commandGroup,u.operationalGroup,u.armyGroupFormation].some(g=>String(g??"").trim()===selectedGroup) &&
            !(Array.isArray(gameState.playerCommandUnitIds)&&gameState.playerCommandUnitIds.some(id=>String(id)===String(u.id))));
        for(const ally of allies){try{aiSystem.actUnit(ally,units);}catch(err){console.warn("友军AI行动失败",ally.id,err);}}
        if(allies.length)writeBattleMessage(`友军协同：${allies.length}个非直属单位已执行AI行动。`);
    }
    cmdProcess(true);
    saveSystem.autoSave({ units, turnSystem, gameState, gameOver, scenario, world, reinforcementSystem });
    undoSystem.clear();
    clearSelection();
    turnSystem.endPhase?.();
    processCapturableFacilities();
    const nextSide =
        normalizeSide(
            turnSystem.phase
        );
    resetFactionForPhase(
        nextSide
    );
    if (nextSide === getPlayerSide()) {
        saveSystem.autoSave({ units, turnSystem, gameState, gameOver, scenario, world, reinforcementSystem });
    }
    updateTurnUI();
    render();
    if (
        !gameOver &&
        nextSide &&
        nextSide !==
            getPlayerSide()
    ) {
        setTimeout(
            () => {
                runAIPhase();
            },
            250
        );
    }
}
// ============================================================
// 存档 / 读取 / 撤销
// ============================================================
function applySnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.units)) return false;
    units = JSON.parse(JSON.stringify(snapshot.units));
    gameState.units = units;
    gameOver = snapshot.gameOver === true;
    if (snapshot.playerFaction) {
        gameState.playerFaction = snapshot.playerFaction;
        gameState.playerSide = snapshot.playerFaction;
        gameState.selectedFaction = snapshot.playerFaction;
        gameState.selectedSide = snapshot.playerFaction;
    }
    if (snapshot.mode) gameState.mode = snapshot.mode;
    if (snapshot.world) {
        world.fortifications = JSON.parse(JSON.stringify(snapshot.world.fortifications ?? []));
        world.minefields = JSON.parse(JSON.stringify(snapshot.world.minefields ?? []));
        if (Array.isArray(snapshot.world.wallEdges)) world.wallEdges = JSON.parse(JSON.stringify(snapshot.world.wallEdges));
    }
    if (snapshot.reinforcements) {
        reinforcementSystem.arrivedGroups = new Set(snapshot.reinforcements.arrivedGroups ?? []);
        reinforcementSystem.arrivalLog = JSON.parse(JSON.stringify(snapshot.reinforcements.arrivalLog ?? []));
    }
    reinforcementSystem.initialize(units, snapshot.turn?.turn ?? 1);
    const t = snapshot.turn ?? {};
    if (turnSystem) {
        for (const key of ["turn", "phase", "year", "month", "day", "hour", "minute"]) {
            if (t[key] != null) turnSystem[key] = t[key];
        }
        if (Array.isArray(t.units)) turnSystem.units = units;
    }
    clearSelection();
    removeDestroyedUnits();
    updateTurnUI();
    render();
    return true;
}
async function saveGame(slot = 1) {
    if (aiRunning) return false;
    const saved = await saveSystem.save(slot, { units, turnSystem, gameState, gameOver, scenario, world, reinforcementSystem });
    if (!saved) { alert("存档失败，请检查浏览器存储权限或剩余空间。"); return false; }
    updateSaveControls();
    console.log(`[存档] 槽位 ${slot} 保存成功`);
    return true;
}
async function loadGame(slot = 1) {
    if (aiRunning) return false;
    const snapshot = await saveSystem.load(slot);
    if (!snapshot) return false;
    undoSystem.clear();
    applySnapshot(snapshot);
    updateSaveControls();
    console.log(`[存档] 槽位 ${slot} 读取成功`);
    return true;
}
function undoLastAction() {
    if (aiRunning || gameOver) return false;
    const entry = undoSystem.undo();
    if (!entry) return false;
    applySnapshot(entry.snapshot);
    updateSaveControls();
    console.log(`[撤销] ${entry.label}`);
    return true;
}
function ensureSaveControls() {
    const slotSelect = document.getElementById("save-slot-select");
    const saveButton = document.getElementById("save-game-button");
    const loadButton = document.getElementById("load-game-button");
    const undoButton = document.getElementById("undo-game-button");
    if (!slotSelect || !saveButton || !loadButton || !undoButton) {
        console.error("[存档系统] index.html 缺少存档/读取/撤销控件");
        return;
    }
    const selectedSlot = () => Number(slotSelect.value ?? 1);
    saveButton.addEventListener("click", () => {
        saveGame(selectedSlot());
    });
    loadButton.addEventListener("click", async () => {
        if (!await loadGame(selectedSlot())) {
            alert("该槽位没有可读取的存档。");
        }
    });
    undoButton.addEventListener("click", () => {
        undoLastAction();
    });
    slotSelect.addEventListener("change", updateSaveControls);
    updateSaveControls();
}
function updateSaveControls() {
    const slot = Number(document.getElementById("save-slot-select")?.value ?? 1);
    const loadButton = document.getElementById("load-game-button");
    const undoButton = document.getElementById("undo-game-button");
    if (loadButton) loadButton.disabled = aiRunning || !saveSystem.has(slot);
    if (undoButton) undoButton.disabled = aiRunning || gameOver || !undoSystem.canUndo();
}
// ============================================================
// 结束行动按钮
// ============================================================
endPhaseButton?.addEventListener(
    "click",
    () => {
        endCurrentPhase();
    }
);
// ============================================================
// 键盘
// ============================================================
window.addEventListener(
    "keydown",
    event => {
        if (event.ctrlKey && event.key.toLowerCase() === "s") { event.preventDefault(); saveGame(Number(document.getElementById("save-slot-select")?.value ?? 1)); return; }
        if (event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); undoLastAction(); return; }
        if (
            event.key ===
            "Escape"
        ) {
            clearSelection();
            render();
            return;
        }
        if (
            event.key.toLowerCase() ===
            "e"
        ) {
            endCurrentPhase();
        }
    }
);
// ============================================================
// 玩家选择阵营之后
// ============================================================
function applyDifficultyToEnemyUnits() {
    const playerSide = getPlayerSide();
    const factor = Number(currentDifficulty?.multiplier ?? gameState.difficultyMultiplier ?? 1);
    gameState.difficultyName = currentDifficulty?.name ?? gameState.difficultyName ?? "普通";
    gameState.difficultyMultiplier = factor;
    for (const unit of units) {
        if (!unit || unit.offMap === true || getUnitSide(unit) === playerSide || unit._difficultyApplied === factor) continue;
        // 只缩放战斗参数；不改变移动力、射程、弹药，避免改变地图节奏。
        for (const key of ["strength","maxStrength","attack","defense","morale"]) {
            if (Number.isFinite(Number(unit[key]))) unit[key] = Math.max(1, Math.round(Number(unit[key]) * factor));
        }
        unit.difficultyMultiplier = factor;
        unit._difficultyApplied = factor;
    }
}

function startGame() {
    ensureSaveControls();
    saveSystem.autoSave({ units, turnSystem, gameState, gameOver, scenario, world, reinforcementSystem });
    updateSaveControls();
    console.log(
        "玩家阵营：",
        getPlayerSide()
    );
    console.log(
        "游戏模式：",
        gameState.mode
    );
    clearSelection();
    synchronizeLiberationCommandRoster();
    // 新战役开始时，确保本方第一阶段单位没有继承加载时的耗尽行动点。
    if ((currentScenarioConfig?.liberation1949 || currentScenarioConfig?.id === "yangtze_grand_1949") && Number(turnSystem?.turn ?? 1) === 1 &&
        normalizeSide(turnSystem?.phase) === getPlayerSide() &&
        !gameState._liberationInitialPhasePrepared) {
        resetFactionForPhase(getPlayerSide());
        gameState._liberationInitialPhasePrepared = true;
    }
    fogOfWarSystem.setEnabled(scenario?.fogOfWar?.enabled === true ? true : userGameSettings.fogOfWar !== false);
    fogOfWarSystem.setSide(getPlayerSide());
    renderFogToggle();
    updateTurnUI();
    resizeCanvas();
    render();
    const currentSide =
        normalizeSide(
            turnSystem?.phase
        );
    const playerSide =
        getPlayerSide();
    // 把最终选择结果同步回所有常见字段，确保其它系统读取到同一阵营。
    if (playerSide) {
        const id = FactionSystem.normalizeFaction(playerSide);
        gameState.playerFaction = id ?? gameState.playerFaction;
        gameState.playerSide = playerSide;
        gameState.selectedFaction = id ?? gameState.selectedFaction;
        gameState.selectedSide = playerSide;
    }
    applyDifficultyToEnemyUnits();
    strategicObjectives.onFactionChanged();
    updateDeveloperPanel();
    renderAirSupportPanel();
    devSupportRender();
    console.log("[控制系统] 玩家阵营已统一为：", playerSide);
    console.log("[控制系统] 当前行动方：", currentSide);
    // ========================================================
    // 如果开局行动方不是玩家
    // AI 自动行动
    // ========================================================
    if (
        gameState.mode !==
            "observer" &&
        String(gameState.mode).toLowerCase() !== "developer" &&
        currentSide &&
        playerSide &&
        currentSide !==
            playerSide
    ) {
        setTimeout(
            () => {
                runAIPhase();
            },
            250
        );
    }
}
// ============================================================
// 战争迷雾开关（战役内）
// ============================================================
function ensureFogToggle(){
    let box=document.getElementById('fogToggleBox'); if(box)return box;
    box=document.createElement('div'); box.id='fogToggleBox'; box.style.cssText='margin:10px 0;padding:9px;border:1px solid #aaa;font-size:13px';
    const casualty=document.getElementById('casualtyPanel');
    if(casualty?.parentNode) casualty.parentNode.insertBefore(box,casualty);
    else document.getElementById('operationPanel')?.appendChild(box);
    return box;
}
function renderFogToggle(){
    const box=ensureFogToggle(); if(!box)return;
    const supported=scenario?.fogOfWar?.enabled!==false;
    if(!supported){box.hidden=true;fogOfWarSystem.setEnabled(false);return;}
    box.hidden=false; const on=fogOfWarSystem.isEnabled();
    box.innerHTML=`<strong>战争迷雾</strong><button id="fog-toggle-btn" style="float:right;font-family:inherit;padding:3px 10px">${on?'开启':'关闭'}</button><div style="clear:both;font-size:11px;margin-top:5px">可在本战役中随时切换显示。</div>`;
    box.querySelector('#fog-toggle-btn').onclick=()=>{fogOfWarSystem.setEnabled(!fogOfWarSystem.isEnabled());renderFogToggle();render();};
}

// ============================================================
// 航空支援卡组 UI
// ============================================================
function ensureAirSupportPanel(){
    let panel=document.getElementById('airSupportPanel');if(panel)return panel;
    panel=document.createElement('div');panel.id='airSupportPanel';panel.style.cssText='margin:14px 0;padding:12px 0;border-top:1px solid #aaa;border-bottom:1px solid #aaa;font-size:13px';
    const casualty=document.getElementById('casualtyPanel');
    if(casualty?.parentNode) casualty.parentNode.insertBefore(panel,casualty);
    else document.getElementById('operationPanel')?.appendChild(panel);
    return panel;
}
function renderAirSupportPanel(){
    const panel=ensureAirSupportPanel();if(!panel)return;const side=getPlayerSide();const cards=airSupportSystem.available(side);
    const hasTransport=!!(airborneReserves[side]?.length || units.some(u=>u.generatedBy==='ModernAirborneDeck'&&String(u.side)===side));if(!cards.length&&!hasTransport){panel.innerHTML='';panel.hidden=true;return;}panel.hidden=false;
    panel.innerHTML='<h3 style="margin:0 0 6px">航空与陆航支援</h3><div style="font-size:11px;margin-bottom:8px">选择支援卡后点击地图目标格；只受剩余使用次数限制</div>';
    // 运输机属于空降运力资源，不是对地攻击卡。单独显示，避免误以为没有配置。
    try {
      const saved=JSON.parse(sessionStorage.getItem('modernAirborneSelection')||'null');
      const selection=saved?.[side];
      if(selection?.enabled){
        const transport=document.createElement('section');transport.style.cssText='padding:8px;margin:8px 0;border:1px solid #aaa;background:rgba(255,255,255,.12)';
        const h=document.createElement('strong');h.textContent='空降兵运输机（运输资源）';transport.appendChild(h);
        const models=[['y20','运-20',12],['y9','运-9',6],['il76','伊尔-76',10]];
        let capacity=0;
        for(const [id,name,points] of models){const count=Math.max(0,Math.floor(Number(selection.aircraft?.[id])||0));if(!count)continue;capacity+=count*points;const line=document.createElement('div');line.textContent=`${name} × ${count}｜运输点 ${count*points}`;transport.appendChild(line);}
        const demand=Object.entries(selection.units||{}).reduce((sum,[id,count])=>{const spec=AIRBORNE_DECK.units.find(u=>u.id===id);return sum+(spec?.transportCost||0)*Math.max(0,Number(count)||0)},0);
        const summary=document.createElement('div');summary.textContent=`运输需求 ${demand} / 容量 ${capacity}；运输机不执行空袭；运力限制单次投送，空降兵不占常规卡组数量`;transport.appendChild(summary);
        const spawned=units.filter(u=>u.generatedBy==='ModernAirborneDeck' && String(u.side??u.faction).toLowerCase()===side);
        const status=document.createElement('div');status.textContent=`已投送 ${spawned.length} 个单位；待投送 ${airborneReserves[side]?.length||0} 个单位`;transport.appendChild(status);
        for(const u of (airborneReserves[side]||[])){
          const b=document.createElement('button');b.type='button';b.style.cssText='width:100%;margin:3px 0;padding:6px;text-align:left;font-family:inherit';
          b.textContent=`空降部署：${u.name}（需求 ${u.airborneTransportCost||0} 运力）`;
          b.onclick=()=>{pendingAirborneReserveId=u.id;pendingAirCard=null;writeBattleMessage(`请选择 ${u.name} 的空降落点；ESC取消`);};transport.appendChild(b);
        }
        const locate=document.createElement('button');locate.type='button';locate.textContent='查看空降兵单位名单';locate.style.cssText='width:100%;padding:5px;margin-top:5px';locate.onclick=()=>{const names=spawned.map(u=>`${u.name}（${u.q},${u.r}）`).join('\n');window.alert(names||'尚无已投送单位；请使用上方空降部署按钮。')};transport.appendChild(locate);
        panel.appendChild(transport);
      }
    }catch(error){console.warn('[空降兵] 运输机面板渲染失败',error);}
    const groups=[['空军支援',cards.filter(c=>!String(c.id).startsWith('helo_')&&!String(c.id).startsWith('missile_'))],['直升机支援',cards.filter(c=>String(c.id).startsWith('helo_'))],['导弹部队',cards.filter(c=>String(c.id).startsWith('missile_'))]];
    for(const [label,list] of groups){if(!list.length)continue;const h=document.createElement('div');h.textContent=label;h.style.cssText='font-weight:700;margin:7px 0 4px';panel.appendChild(h);for(const c of list){const b=document.createElement('button');b.type='button';b.style.cssText='width:100%;margin:2px 0;padding:6px;text-align:left;font-family:inherit';const ok=c.availability?.ok!==false;b.disabled=!ok;b.title=ok?'选择后点击地图目标格':c.availability?.reason??'';const model=AIRCRAFT[c.aircraft]?.name??c.aircraft??'未指定机型';b.textContent=`${c.name}｜机型：${model}｜剩余${c.remaining}次${ok?'':` · ${c.availability?.reason??'暂不可用'}`}`;b.onclick=()=>{pendingAirCard=c.id;writeBattleMessage(`${c.name}：请点击地图目标格；ESC取消`);};panel.appendChild(b);}}
}

// ============================================================
// 加载游戏数据
// ============================================================
function applyPreBattleSupportSelection(scenario, config){
    if(!scenario || !config) return;
    const ids=['modern_cap','modern_precision','jh7a_strike','helo_antiarmor','helo_recon','helo_supply','helo_z20_air_assault','helo_z8b_air_assault','missile_fire_support'];
    const parse=(key)=>{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}};
    scenario.airSupport = (scenario.airSupport && typeof scenario.airSupport==='object') ? scenario.airSupport : {};
    const setSide=(side,uses,deckId)=>{
        if(!uses || typeof uses!=='object') return;
        let cards=ids.filter(id=>Number(uses[id]??0)>0);
        if(scenario?.requiresAirfieldForAirSupport===true) cards=cards.filter(id=>String(id).startsWith('helo_')||String(id).startsWith('missile_'));
        scenario.airSupport[side]={...(scenario.airSupport[side]??{}),enabled:cards.length>0,deckId:deckId??'scenario_custom',cards,uses:Object.fromEntries(cards.map(id=>[id,Math.max(0,Math.floor(Number(uses[id]??0)))]))};
    };
    if(config.marineSupportSelection===true || scenario?.marineSupportSelection===true){
        const sel=parse('marineSupportSelection');
        if(sel){setSide('red',sel.red,'marine_red');setSide('blue',sel.blue,'marine_blue');}
    }
    if(config.modernBrigadeSelection===true){
        const sel=parse('modernSupportSelection');
        if(sel){setSide('red',sel.red,'modern_red');setSide('blue',sel.blue,'modern_blue');}
    }
    if(config.groupArmySelection===true){
        const sel=parse('groupArmySupportSelection');
        const base={modern_cap:1,modern_precision:2,jh7a_strike:1,helo_antiarmor:2,helo_recon:2,helo_supply:2,helo_z20_air_assault:1,helo_z8b_air_assault:1,missile_fire_support:2};
        setSide('red',sel?.red??base,'group_army_red');
        setSide('blue',sel?.blue??base,'group_army_blue');
    }
    if(config.plaCombinedBrigadeSelection===true){
        const sel=parse('plaSupportSelection');
        if(sel)setSide('pla',sel,'pla_modern_2026');
    }
}

// 真实阶段式进度：仅在已完成相应加载步骤后推进，不使用虚假的计时百分比。
function battleLoadingUpdate(percent, detail) {
    const root=document.getElementById('battleLoadingScreen'); if(!root)return;
    const value=Math.max(0,Math.min(100,Math.round(percent)));
    document.getElementById('battleLoadingPercent').textContent=`${value}%`;
    document.getElementById('battleLoadingFill').style.width=`${value}%`;
    document.getElementById('battleLoadingTrack').setAttribute('aria-valuenow',String(value));
    document.getElementById('battleLoadingDetail').textContent=detail;
}
function battleLoadingShow() {
    const root=document.getElementById('battleLoadingScreen');if(!root)return;
    battleLoadingUpdate(0,'正在读取战役配置…');root.hidden=false;
}
function battleLoadingHide(){const root=document.getElementById('battleLoadingScreen');if(root)root.hidden=true;}
async function battleLoadingPaint(){await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}

async function loadScenario(scenarioKey = "dubno", resumeSnapshot = null) {
    battleLoadingShow();
    await battleLoadingPaint();
    try {
        currentScenarioKey = scenarioKey; cmdLoad(); cmdInstallPanel(); ewLoad(); ewInstallPanel(); infoLoad(); infoInstallDashboard(); gameOver=false; aiRunning=false; clearSelection(); undoSystem.clear?.();
        const loaded = await scenarioManager.load(scenarioKey);
        currentScenarioConfig = loaded.config; scenario = loaded.scenario; units = loaded.units;
        // 不沿用上一场战役的已探索区域和临时侦察范围。
        fogOfWarSystem.visible.clear();
        fogOfWarSystem.explored.clear();
        fogOfWarSystem.tempReveal.length = 0;
        battleLoadingUpdate(25,'战役数据读取完成，正在初始化地图与任务…');
        await battleLoadingPaint();
        // 现代红蓝演习采用“夺取后巩固”判定：单个高机动单位冲入目标区不会立即获胜。
        // 场景可通过 victoryControlPolicy 覆盖这些默认值。
        const loadedSides=[...new Set((units??[]).map(u=>normalizeSide(u?.faction??u?.side??u?.camp)).filter(Boolean))];
        if (loadedSides.includes("red") && loadedSides.includes("blue")) {
            scenario.victoryControlPolicy = {
                enabled:true, holdTurns:2, primaryMinUnits:2, secondaryMinUnits:1,
                requireUncontested:true, excludeRecon:true, excludeHQ:true,
                ...(scenario.victoryControlPolicy ?? {})
            };
        }
        strategicObjectives.setScenario(scenario);
        // 战役 JSON 的时间参数优先于战役目录默认值，避免 hoursPerTurn=24 时钟永远显示同一小时。
        currentScenarioConfig.start = { ...(currentScenarioConfig.start ?? {}) };
        if (Number.isFinite(Number(scenario?.hoursPerTurn))) currentScenarioConfig.start.hoursPerTurn = Number(scenario.hoursPerTurn);
        if (typeof scenario?.startTime === "string" && /^\d{1,2}:\d{2}$/.test(scenario.startTime)) {
            const [h,m] = scenario.startTime.split(":").map(Number); currentScenarioConfig.start.hour=h; currentScenarioConfig.start.minute=m;
        }
        // 现代空降兵补充卡组：在初始化前加入，继承现有回合、补给与战损系统。
        // 以玩家实际确认的卡组为准，而不是依赖战役阶段的选择界面标记。
        // 某些演习关卡使用独立配置对象，旧判断会跳过已经保存的空降编组。
        try {
          const choice=JSON.parse(sessionStorage.getItem('modernAirborneSelection')||'null');
          for(const side of ['red','blue']) {
            if(!choice?.[side]?.enabled) continue;
            const generated=buildAirborneUnits(choice[side],side,units,scenario);
            airborneReserves[side]=generated;
            console.info(`[空降兵] ${side} 配置已读取，加入空降预备队 ${generated.length} 个单位`,generated.map(u=>u.name));
            if(!generated.length) console.warn(`[空降兵] ${side} 已启用但未生成单位；检查预算、运输容量、地图空位和指挥部。`);
          }
        }catch(err){console.warn('空降兵补充卡组加载失败',err);}
        applyPreBattleSupportSelection(scenario, currentScenarioConfig);
        airSupportSystem.configure(scenario);
        processCapturableFacilities();
        console.log(`[战役系统] ${loaded.theater.name} / ${loaded.phase.name} / ${loaded.config.name}`);
        initializeUnits();
        battleLoadingUpdate(55,'地图与参演部队已生成，正在检查部署与编制…');
        await battleLoadingPaint();
        const integrityReport = integrityMonitor.auditScenario(scenario, units);
        if (integrityReport.errors.length) throw new Error(`主系统完整性检查失败：发现 ${integrityReport.errors.length} 个严重问题，请查看控制台 [完整性监测]`);
        resetCasualtyState(); renderCasualtyPanel();
        reinforcementSystem.arrivedGroups.clear();
        reinforcementSystem.arrivalLog.length = 0;
        reinforcementSystem.initialize(units, 1);
        units = units.filter(unit => unit.offMap === true || isUnitAlive(unit));
        // 部署安全自动修复仅用于动态集团军/现代旅系统。
        // 历史战役（如墨尔本）包含合法的海军水面部署、特殊地形部署和手工编制，
        // 不得套用现代陆战动态生成器的地形过滤，否则 NAV_* 舰艇会被误判。
        const usesDynamicDeploymentSafety = loaded.config.groupArmySelection === true || loaded.config.modernBrigadeSelection === true;
        if (usesDynamicDeploymentSafety) {
            runDeploymentSafetyCheck(units, { autoRepair: true });
            // 自动修复后重新审计最终状态；初次报告中的已修复冲突不应阻止战役启动。
            const finalDeploymentReport = runDeploymentSafetyCheck(units, { autoRepair: true });
            if (finalDeploymentReport.invalid.length || finalDeploymentReport.conflicts.length) {
                throw new Error(`${loaded.config.groupArmySelection?"集团军动态编组":"现代旅动态编组"} 主系统部署安全检查失败，请查看浏览器控制台`);
            }
        }
        if(!validateUnits(units)) throw new Error(`${loaded.config.unitsPath} 单位数据检查失败，请查看浏览器控制台`);
        const counts={}; for(const unit of units){const side=getUnitSide(unit);counts[side]=(counts[side]??0)+1;}
        console.log("[单位系统] 战斗序列加载完成", counts);
        battleLoadingUpdate(80,'正在初始化补给、通信与回合系统…');
        await battleLoadingPaint();
        cmdAutoUnitLabels(); gameState.units=units; gameState.scenarioKey=loaded.config.id; gameState.scenarioName=loaded.config.name;
        gameState.setAvailableFactions?.(loaded.config.factions ?? []);
        gameState.playerCommandGroup=null;
        gameState.playerCommandUnitIds=[];
        gameState._liberationInitialPhasePrepared=false;
        initializeTurnSystem(); victorySystem=new VictorySystem({scenario});
        if(typeof camera.reset==="function") camera.reset();
        if(typeof camera.centerOnMap==="function") camera.centerOnMap(world,canvas,renderer);
        resizeCanvas(); render();
        battleLoadingUpdate(100,'战役加载完成');
        await battleLoadingPaint();
        battleLoadingHide();
        if (resumeSnapshot) {
            currentDifficulty = { name: resumeSnapshot.difficultyName ?? "普通", multiplier: Number(resumeSnapshot.difficultyMultiplier ?? 1) };
            applySnapshot(resumeSnapshot);
            document.getElementById("mainMenu")?.setAttribute("hidden", "");
            startGame();
        } else {
            factionSelection.show(startGame,{scenario,config:loaded.config});
        }
        console.log(`战役已启动：${loaded.config.name}`);
    } catch(error) {
        battleLoadingHide();
        console.error("游戏初始化失败：",error);
        if(unitInfo){unitInfo.innerHTML=`<strong>游戏数据加载失败</strong><br><br>${error.message}<br><br><button id="return-scenario-selection" type="button">返回战役选择</button>`;document.getElementById("return-scenario-selection")?.addEventListener("click",showScenarioSelection);} else showScenarioSelection();
    }
}

// ============================================================
// V0.3.1 主界面 / 存档槽 UI
// ============================================================
function factionLabel(side){ const v=normalizeSide(side); if(currentScenarioConfig?.liberation1949){if(v==="pla")return "解放军";if(v==="kmt")return "蒋匪军";} if(['red','blue'].includes(v)) return v==='red'?'红方':'蓝方'; if(currentScenarioConfig?.modernBrigadeSelection||currentScenarioConfig?.groupArmySelection)return v==='red'?'红方':v==='blue'?'蓝方':(side??''); return v==='kmt'?'蒋匪军':v==='pla'?'解放军':v==='tw_proxy'?'台伪军':v==='chinese'?'中国军':v==='japanese'?'日军':v==='german'?'德军':v==='soviet'?'苏军':v==='rok_government'?'政府军':v==='new_military'?'新军部':(side??''); }
function showMainMenu(){ document.getElementById('pauseMenu')?.setAttribute('hidden',''); document.getElementById('mainMenu')?.removeAttribute('hidden'); updateMainMenu(); }
function hideMainMenu(){ document.getElementById('mainMenu')?.setAttribute('hidden',''); }
function updateMainMenu(){ const b=document.getElementById('menuContinue'); if(b)b.disabled=!(saveSystem.hasResume()||saveSystem.hasAutoSave()); }
function openSaveModal(mode='load'){
  const modal=document.getElementById('saveLoadModal'), box=document.getElementById('saveSlotCards'), title=document.getElementById('saveModalTitle'); if(!modal||!box)return;
  title.textContent=mode==='save'?'保存游戏':'读取存档'; box.innerHTML='';
  const auto=saveSystem.getAutoSummary(); if(mode==='load') box.appendChild(makeSlotCard('自动存档',auto,'auto',mode));
  for(let i=1;i<=3;i++) box.appendChild(makeSlotCard(`存档 ${i}`,saveSystem.getSummary(i),i,mode));
  modal.dataset.mode=mode; modal.removeAttribute('hidden');
}
function makeSlotCard(label,summary,slot,mode){
  const d=document.createElement('div');d.className='save-slot-card'; const when=summary?.savedAt?new Date(summary.savedAt).toLocaleString():'空';
  d.innerHTML=`<div class="save-slot-title">${label}</div><div class="save-slot-meta">${summary?`${summary.scenarioName} · ${factionLabel(summary.playerFaction)} · 第${summary.turn}回合 · ${when}`:'空槽位'}</div><div class="save-slot-buttons"></div>`;
  const row=d.querySelector('.save-slot-buttons');
  if(mode==='save'&&slot!=='auto'){const b=document.createElement('button');b.textContent=summary?'覆盖保存':'保存';b.onclick=()=>{saveGame(slot);openSaveModal('save');};row.appendChild(b);}
  if(mode==='load'&&summary){const b=document.createElement('button');b.textContent='读取';b.onclick=async()=>{const snap=await (slot==='auto'?saveSystem.loadAutoSave():saveSystem.load(slot));document.getElementById('saveLoadModal')?.setAttribute('hidden','');await resumeFromSnapshot(snap);};row.appendChild(b);}
  if(summary&&slot!=='auto'){const ex=document.createElement('button');ex.textContent='导出';ex.onclick=()=>saveSystem.exportSlot(slot);row.appendChild(ex);const del=document.createElement('button');del.textContent='删除';del.onclick=()=>{if(confirm(`删除${label}？`)){saveSystem.remove(slot);openSaveModal(mode);updateMainMenu();}};row.appendChild(del);}
  return d;
}
async function resumeFromSnapshot(snapshot){ if(!snapshot)return false; const key=snapshot.scenarioKey ?? snapshot.scenario?.id ?? 'wanjialing'; hideMainMenu(); await loadScenario(key,snapshot); return true; }
function openGameSettings(){
  const modal=document.getElementById('settingsModal'); if(!modal)return;
  document.getElementById('settingControlZone').value=userGameSettings.controlZone!==false?'on':'off';
  document.getElementById('settingFogOfWar').value=userGameSettings.fogOfWar!==false?'on':'off';
  document.getElementById('settingTerrainStyle').value=userGameSettings.terrainStyle||'default';
  document.getElementById('settingMapMode').value=userGameSettings.mapMode==='3d'?'3d':'2d';
  document.getElementById('settingViewDirection').value=userGameSettings.viewDirection||'south';
  document.getElementById('settingPitch').value=String(userGameSettings.pitch??52);
  document.getElementById('settingPitchValue').textContent=String(userGameSettings.pitch??52);
  modal.removeAttribute('hidden');
}
function bindGameSettingsUI(){
  const modal=document.getElementById('settingsModal');
  const pitch=document.getElementById('settingPitch');
  pitch?.addEventListener('input',()=>{const o=document.getElementById('settingPitchValue');if(o)o.textContent=pitch.value;});
  document.getElementById('settingsClose')?.addEventListener('click',()=>modal?.setAttribute('hidden',''));
  document.getElementById('settingsReset')?.addEventListener('click',()=>{
    userGameSettings={...DEFAULT_GAME_SETTINGS}; persistGameSettings(); openGameSettings(); applyGameViewSettings(); renderFogToggle(); render();
  });
  document.getElementById('settingsSave')?.addEventListener('click',()=>{
    userGameSettings={
      controlZone:document.getElementById('settingControlZone')?.value!=='off',
      terrainStyle:document.getElementById('settingTerrainStyle')?.value||'default',
      fogOfWar:document.getElementById('settingFogOfWar')?.value!=='off',
      mapMode:document.getElementById('settingMapMode')?.value==='3d'?'3d':'2d',
      viewDirection:document.getElementById('settingViewDirection')?.value||'south',
      pitch:Number(document.getElementById('settingPitch')?.value||52)
    };
    persistGameSettings(); applyGameViewSettings(); renderFogToggle(); render(); modal?.setAttribute('hidden','');
  });
}

function initializeMainMenu(){
  const main=document.getElementById('mainMenu'); main?.removeAttribute('hidden'); updateMainMenu();
  document.getElementById('menuNewGame')?.addEventListener('click',()=>{hideMainMenu();showScenarioSelection();});
  document.getElementById('menuContinue')?.addEventListener('click',async()=>resumeFromSnapshot((await saveSystem.loadResume()) ?? (await saveSystem.loadAutoSave())));
  document.getElementById('menuDeveloper')?.addEventListener('click',openMainDeveloperEditor);
  document.getElementById('menuLoad')?.addEventListener('click',()=>openSaveModal('load'));
  document.getElementById('menuSettings')?.addEventListener('click',openGameSettings);
  initializeFormationCatalog();
  document.getElementById('menuAbout')?.addEventListener('click',()=>document.getElementById('aboutModal')?.removeAttribute('hidden'));
  document.getElementById('closeAboutModal')?.addEventListener('click',()=>document.getElementById('aboutModal')?.setAttribute('hidden',''));
  document.getElementById('menu-game-button')?.addEventListener('click',()=>document.getElementById('pauseMenu')?.removeAttribute('hidden'));
  document.getElementById('pauseResume')?.addEventListener('click',()=>document.getElementById('pauseMenu')?.setAttribute('hidden',''));
  document.getElementById('pauseSave')?.addEventListener('click',()=>{document.getElementById('pauseMenu')?.setAttribute('hidden','');openSaveModal('save');});
  document.getElementById('pauseLoad')?.addEventListener('click',()=>{document.getElementById('pauseMenu')?.setAttribute('hidden','');openSaveModal('load');});
  document.getElementById('pauseRestart')?.addEventListener('click',async()=>{
    if(!currentScenarioKey){ alert('当前没有正在进行的战役。'); return; }
    const ok=confirm('确定重新开始当前对局吗？\n\n当前回合、战损、移动、工事变化、弹药/燃油消耗、支援卡使用次数、控制点与战争迷雾进度都会清除。\n\n已选择的合成旅卡组将保留。');
    if(!ok)return;
    document.getElementById('pauseMenu')?.setAttribute('hidden','');
    // 清除自动恢复快照，防止刷新后又回到重新开始前的局面；手动存档不受影响。
    saveSystem.clearResume?.();
    try{ if(saveSystem.autoKey) localStorage.removeItem(saveSystem.autoKey); }catch(e){ console.warn('[重新开始] 清除自动存档失败',e); }
    pendingAirCard=null;pendingAirborneReserveId=null;airborneReserves={red:[],blue:[]}; gameOver=false; aiRunning=false; clearSelection(); undoSystem.clear?.();
    await loadScenario(currentScenarioKey, null);
  });
  document.getElementById('pauseMain')?.addEventListener('click',()=>{document.getElementById('pauseMenu')?.setAttribute('hidden','');showMainMenu();});
  document.getElementById('closeSaveModal')?.addEventListener('click',()=>document.getElementById('saveLoadModal')?.setAttribute('hidden',''));
  document.getElementById('importSaveButton')?.addEventListener('click',()=>document.getElementById('importSaveFile')?.click());
  document.getElementById('importSaveFile')?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{await saveSystem.importFile(file,1);alert('已导入到存档1。');openSaveModal('load');updateMainMenu();}catch(err){alert(`导入失败：${err.message}`);}e.target.value='';});
}

// ============================================================
// 开发者模式控制面板（与普通战役完全隔离）
// ============================================================
function updateDeveloperPanel(){
  const panel=document.getElementById('developerPanel'); if(!panel)return;
  const dev=String(gameState.mode).toLowerCase()==='developer'; panel.hidden=!dev;
  if(dev){const input=document.getElementById('devTurnInput');if(input&&turnSystem)input.value=turnSystem.turn??1;}
}
function developerAdvanceFullTurn(){
  if(String(gameState.mode).toLowerCase()!=='developer'||!turnSystem)return;
  const start=Number(turnSystem.turn??1); let guard=0;
  do{turnSystem.endPhase?.();resetFactionForPhase(normalizeSide(turnSystem.phase));guard++;}while(Number(turnSystem.turn??1)===start&&guard<10);
  clearSelection();updateTurnUI();render();updateDeveloperPanel();
}
function developerSetTurn(){
  if(String(gameState.mode).toLowerCase()!=='developer'||!turnSystem)return;
  const n=Math.max(1,Math.floor(Number(document.getElementById('devTurnInput')?.value)||1));
  turnSystem.turn=n; reinforcementSystem.processTurn?.(n,units); strategicObjectives.onTurnChanged?.(); updateTurnUI();render();updateDeveloperPanel();
}
document.getElementById('devEndPhase')?.addEventListener('click',endCurrentPhase);
document.getElementById('devNextTurn')?.addEventListener('click',developerAdvanceFullTurn);
document.getElementById('devSetTurn')?.addEventListener('click',developerSetTurn);

// ============================================================
// 窗口变化
// ============================================================
window.addEventListener(
    "resize",
    () => {
        resizeCanvas();
        render();
    }
);
window.addEventListener("orientationchange", () => {
    setTimeout(() => { resizeCanvas(); render(); }, 180);
});

// ============================================================
// v0.20 主界面开发者编辑器
// ============================================================
let mainDevSelection=null;
function mainDevKey(){return 'frontline_campaign_editor_v020';}
function mainDevClone(x){return JSON.parse(JSON.stringify(x));}
function mainDevLoadDraft(){try{const d=JSON.parse(localStorage.getItem(mainDevKey())||'null');if(Array.isArray(d)){CAMPAIGNS.splice(0,CAMPAIGNS.length,...d);}}catch(e){}}
function mainDevUIData(){return {tagline:document.getElementById('mainMenuTagline')?.textContent?.trim()??'',version:document.getElementById('mainMenuVersion')?.textContent?.trim()??'',updateTitle:document.getElementById('mainUpdateTitle')?.textContent?.trim()??'',updateDetail:document.getElementById('mainUpdateDetail')?.textContent?.trim()??'',about:(document.getElementById('aboutContent')?.innerText??'').trim()};}
function mainDevApplyUIData(d={}){const set=(id,v)=>{const e=document.getElementById(id);if(e&&v!=null)e.textContent=v};set('mainMenuTagline',d.tagline);set('mainMenuVersion',d.version);set('mainUpdateTitle',d.updateTitle);set('mainUpdateDetail',d.updateDetail);const a=document.getElementById('aboutContent');if(a&&d.about!=null)a.innerText=d.about;}
function mainDevFillContent(){const d=mainDevUIData(), map={mainDevTagline:d.tagline,mainDevVersionText:d.version,mainDevUpdateTitle:d.updateTitle,mainDevUpdateDetail:d.updateDetail,mainDevAbout:d.about};for(const [id,v] of Object.entries(map)){const e=document.getElementById(id);if(e)e.value=v;}}
function openMainDeveloperEditor(){const key=window.prompt('请输入开发者模式密钥：','');if(key!=='123456wrx'){if(key!==null)alert('开发者密钥错误。');return;}mainDevLoadDraft();try{const ui=JSON.parse(localStorage.getItem('frontline_main_ui_v021')||'null');if(ui)mainDevApplyUIData(ui);}catch(e){}document.getElementById('mainDeveloperEditor')?.removeAttribute('hidden');mainDevFillContent();renderMainDevTree();}
function renderMainDevTree(){const box=document.getElementById('mainDevTree');if(!box)return;box.innerHTML='';CAMPAIGNS.forEach((t,ti)=>{const tb=document.createElement('button');tb.style.cssText='width:100%;text-align:left;margin:2px 0;font-weight:700';tb.textContent=`▾ ${t.name}`;tb.onclick=()=>selectMainDev('theater',ti);box.appendChild(tb);(t.phases||[]).forEach((ph,pi)=>{const pb=document.createElement('button');pb.style.cssText='width:calc(100% - 14px);margin-left:14px;text-align:left;margin-top:2px';pb.textContent=`└ ${ph.name}`;pb.onclick=()=>selectMainDev('phase',ti,pi);box.appendChild(pb);(ph.scenarios||[]).forEach((sc,si)=>{const sb=document.createElement('button');sb.style.cssText='width:calc(100% - 30px);margin-left:30px;text-align:left;margin-top:2px';sb.textContent=`• ${sc.name}`;sb.onclick=()=>selectMainDev('scenario',ti,pi,si);box.appendChild(sb);});});});}
function selectMainDev(type,ti,pi=null,si=null){mainDevSelection={type,ti,pi,si};const obj=type==='theater'?CAMPAIGNS[ti]:type==='phase'?CAMPAIGNS[ti].phases[pi]:CAMPAIGNS[ti].phases[pi].scenarios[si];const props=document.getElementById('mainDevProps');const common=`<label>名称</label><input id="mdName" value="${String(obj.name??'').replaceAll('"','&quot;')}" style="width:100%"><label>副标题/说明</label><input id="mdSubtitle" value="${String(obj.subtitle??'').replaceAll('"','&quot;')}" style="width:100%"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label>模块宽度(px)<input id="mdWidth" type="number" value="${obj.ui?.width??''}" style="width:100%"></label><label>模块高度(px)<input id="mdHeight" type="number" value="${obj.ui?.height??''}" style="width:100%"></label></div>`;let extra='';if(type==='scenario')extra=`<label>日期</label><input id="mdDate" value="${obj.dateText??''}" style="width:100%"><label>地点</label><input id="mdLocation" value="${obj.location??''}" style="width:100%"><label>Scenario路径</label><input id="mdScenarioPath" value="${obj.scenarioPath??''}" style="width:100%"><label>Units路径</label><input id="mdUnitsPath" value="${obj.unitsPath??''}" style="width:100%"><label>状态</label><select id="mdStatus"><option value="available">available</option><option value="interface">interface</option><option value="locked">locked</option></select><label>移动到阶段</label><select id="mdParent"></select>`;props.innerHTML=`<h3>${type==='theater'?'战场':type==='phase'?'阶段':'战役'}属性</h3>${common}${extra}<div style="display:flex;gap:8px;margin-top:12px"><button id="mdApply">应用</button><button id="mdDelete">删除</button></div>`;if(type==='scenario'){document.getElementById('mdStatus').value=obj.status??'available';const sel=document.getElementById('mdParent');CAMPAIGNS.forEach((t,a)=>(t.phases||[]).forEach((ph,b)=>{const o=document.createElement('option');o.value=`${a}:${b}`;o.textContent=`${t.name} / ${ph.name}`;if(a===ti&&b===pi)o.selected=true;sel.appendChild(o);}));}document.getElementById('mdApply').onclick=applyMainDev;document.getElementById('mdDelete').onclick=deleteMainDev;}
function applyMainDev(){if(!mainDevSelection)return;let {type,ti,pi,si}=mainDevSelection;const obj=type==='theater'?CAMPAIGNS[ti]:type==='phase'?CAMPAIGNS[ti].phases[pi]:CAMPAIGNS[ti].phases[pi].scenarios[si];obj.name=document.getElementById('mdName').value;obj.subtitle=document.getElementById('mdSubtitle').value;obj.ui=obj.ui||{};const w=Number(document.getElementById('mdWidth').value),h=Number(document.getElementById('mdHeight').value);if(w)obj.ui.width=w;else delete obj.ui.width;if(h)obj.ui.height=h;else delete obj.ui.height;if(type==='scenario'){obj.dateText=document.getElementById('mdDate').value;obj.location=document.getElementById('mdLocation').value;obj.scenarioPath=document.getElementById('mdScenarioPath').value;obj.unitsPath=document.getElementById('mdUnitsPath').value;obj.status=document.getElementById('mdStatus').value;const [nti,npi]=document.getElementById('mdParent').value.split(':').map(Number);if(nti!==ti||npi!==pi){CAMPAIGNS[ti].phases[pi].scenarios.splice(si,1);CAMPAIGNS[nti].phases[npi].scenarios.push(obj);mainDevSelection=null;document.getElementById('mainDevProps').textContent='战役已移动。';}}renderMainDevTree();}
function deleteMainDev(){if(!mainDevSelection||!confirm('确定删除这个目录项目？'))return;const {type,ti,pi,si}=mainDevSelection;if(type==='scenario')CAMPAIGNS[ti].phases[pi].scenarios.splice(si,1);else if(type==='phase')CAMPAIGNS[ti].phases.splice(pi,1);else CAMPAIGNS.splice(ti,1);mainDevSelection=null;renderMainDevTree();document.getElementById('mainDevProps').textContent='已删除。';}
function addMainDev(kind){if(kind==='theater'){CAMPAIGNS.push({id:`theater_${Date.now()}`,name:'新战场',subtitle:'',phases:[]});}else if(kind==='phase'){const ti=mainDevSelection?.ti??0;if(!CAMPAIGNS[ti])return alert('请先选择战场。');CAMPAIGNS[ti].phases.push({id:`phase_${Date.now()}`,name:'新阶段',scenarios:[]});}else{const ti=mainDevSelection?.ti??0,pi=mainDevSelection?.pi??0;if(!CAMPAIGNS[ti]?.phases?.[pi])return alert('请先选择阶段。');CAMPAIGNS[ti].phases[pi].scenarios.push({id:`scenario_${Date.now()}`,name:'新战役',dateText:'',location:'',status:'interface',scenarioPath:'./data/scenario-new.json',unitsPath:'./data/units-new.json'});}renderMainDevTree();}
document.getElementById('mainDevClose')?.addEventListener('click',()=>document.getElementById('mainDeveloperEditor')?.setAttribute('hidden',''));document.getElementById('mainDevAddTheater')?.addEventListener('click',()=>addMainDev('theater'));document.getElementById('mainDevAddPhase')?.addEventListener('click',()=>addMainDev('phase'));document.getElementById('mainDevAddScenario')?.addEventListener('click',()=>addMainDev('scenario'));
document.getElementById('mainDevApplyContent')?.addEventListener('click',()=>{const d={tagline:document.getElementById('mainDevTagline')?.value??'',version:document.getElementById('mainDevVersionText')?.value??'',updateTitle:document.getElementById('mainDevUpdateTitle')?.value??'',updateDetail:document.getElementById('mainDevUpdateDetail')?.value??'',about:document.getElementById('mainDevAbout')?.value??''};mainDevApplyUIData(d);localStorage.setItem('frontline_main_ui_v021',JSON.stringify(d));alert('主界面内容已应用并保存为浏览器草稿。');});
document.getElementById('mainDevSave')?.addEventListener('click',()=>{localStorage.setItem(mainDevKey(),JSON.stringify(CAMPAIGNS));localStorage.setItem('frontline_main_ui_v021',JSON.stringify(mainDevUIData()));alert('主界面编辑草稿已保存。');});document.getElementById('mainDevExport')?.addEventListener('click',()=>devDownload('campaigns.json',{campaigns:CAMPAIGNS}));document.getElementById('mainDevExportUI')?.addEventListener('click',()=>devDownload('main-ui.json',mainDevUIData()));document.getElementById('mainDevReset')?.addEventListener('click',()=>{localStorage.removeItem(mainDevKey());localStorage.removeItem('frontline_main_ui_v021');location.reload();});

// ============================================================
// 启动：先选择战役，再选择阵营
// ============================================================
resizeCanvas();
render();
bindGameSettingsUI();
initializeMainMenu();

// V0.3 刷新恢复：游戏进行中每10秒保存当前快照，并在页面离开前再写一次。
setInterval(()=>{try{if(turnSystem&&Array.isArray(units)&&units.length&&currentScenarioKey)saveSystem.saveResume({units,turnSystem,gameState,gameOver,scenario,world});}catch(e){}},10000);
// IndexedDB writes are asynchronous: periodic resume snapshots persist progress; unload cannot guarantee a transaction completes.


// ============================================================
// 开发者地图编辑器 v0.15
// 正式数据通过“导出战役 JSON / 导出单位 JSON”更新，不直接写源文件。
// ============================================================
let devWallStart = null;
let devUnitToMove = null;
function devStatus(text){const e=document.getElementById('devEditorStatus');if(e)e.textContent=text;}
function devHexKey(q,r){return `${Number(q)},${Number(r)}`;}
function devAdjacent(a,b){const dq=Number(b.q)-Number(a.q),dr=Number(b.r)-Number(a.r);return [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]].some(d=>d[0]===dq&&d[1]===dr);}
function devSameEdge(e,a,b){const f=e?.from??{},t=e?.to??{};return (Number(f.q)===Number(a.q)&&Number(f.r)===Number(a.r)&&Number(t.q)===Number(b.q)&&Number(t.r)===Number(b.r))||(Number(f.q)===Number(b.q)&&Number(f.r)===Number(b.r)&&Number(t.q)===Number(a.q)&&Number(t.r)===Number(a.r));}
// ============================================================
// 开发者模式：空军 / 直升机 / 导弹支援卡组编辑器
// 写入 scenario.airSupport，导出战役 JSON 后永久保存。
// ============================================================
function devSupportGroup(id){
    id=String(id??'');
    if(id.startsWith('missile_'))return '导弹支援';
    if(id.startsWith('helo_'))return '直升机支援';
    return '空军支援';
}
function devSupportEnsureScenario(){
    scenario.airSupport=scenario.airSupport&&typeof scenario.airSupport==='object'?scenario.airSupport:{};
    return scenario.airSupport;
}
function devSupportRender(){
    const box=document.getElementById('devSupportCards');if(!box)return;
    const side=document.getElementById('devSupportSide')?.value??'red';
    const cfg=scenario?.airSupport?.[side]??{};
    const deck=AIR_SUPPORT_DECKS[cfg.deckId];
    const selected=new Set(Array.isArray(cfg.cards)?cfg.cards:(deck?.cards??[]));
    const groups=['空军支援','直升机支援','导弹支援'];
    box.innerHTML='';
    for(const group of groups){
      const ids=Object.keys(AIR_SUPPORT_CARDS).filter(id=>devSupportGroup(id)===group);
      if(!ids.length)continue;
      const title=document.createElement('div');title.textContent=group;title.style.cssText='font-weight:700;margin:5px 0';box.appendChild(title);
      for(const id of ids){
        const c=AIR_SUPPORT_CARDS[id], row=document.createElement('label');row.style.cssText='display:grid;grid-template-columns:22px 1fr 64px;gap:4px;align-items:center;margin:3px 0';
        const checked=selected.has(id)?'checked':'';const uses=Math.max(0,Number(cfg.uses?.[id]??c.uses??1));
        row.innerHTML=`<input type="checkbox" data-support-card="${id}" ${checked}><span>${c.name}</span><input type="number" min="0" max="99" value="${uses}" data-support-uses="${id}" title="可用次数">`;
        box.appendChild(row);
      }
    }
}
function devSupportSave(){
    const side=document.getElementById('devSupportSide')?.value??'red', root=devSupportEnsureScenario();
    const checks=[...document.querySelectorAll('#devSupportCards [data-support-card]')];
    const cards=checks.filter(x=>x.checked).map(x=>x.dataset.supportCard),uses={};
    for(const id of cards){const el=document.querySelector(`#devSupportCards [data-support-uses="${id}"]`);uses[id]=Math.max(0,Number(el?.value??AIR_SUPPORT_CARDS[id]?.uses??1));}
    root[side]={...(root[side]??{}),enabled:cards.length>0,deckId:'scenario_custom',cards,uses};
    airSupportSystem.configure(scenario);renderAirSupportPanel();devStatus(`已保存 ${side} 支援卡组：${cards.length} 张卡。导出战役JSON即可永久保存。`);
}
function devSupportClear(){
    const side=document.getElementById('devSupportSide')?.value??'red', root=devSupportEnsureScenario();
    root[side]={enabled:false,deckId:'scenario_custom',cards:[],uses:{}};
    airSupportSystem.configure(scenario);devSupportRender();renderAirSupportPanel();devStatus(`已清空 ${side} 支援卡组。`);
}
document.getElementById('devSupportSide')?.addEventListener('change',devSupportRender);
document.getElementById('devSupportLoad')?.addEventListener('click',devSupportRender);
document.getElementById('devSupportSave')?.addEventListener('click',devSupportSave);
document.getElementById('devSupportClear')?.addEventListener('click',devSupportClear);

function devSyncMap(){
 const map=scenario?.map ?? world?.scenario?.map; if(!map)return null;
 map.terrain=Array.from(world.specialTerrain?.entries?.()??[]).map(([k,type])=>{const [q,r]=k.split(',').map(Number);return {q,r,type};}).filter(x=>x.type!=='plain');
 map.settlements=JSON.parse(JSON.stringify(world.settlements??map.settlements??[]));
 // Developer editor persistence: export every runtime engineering layer, not only forts/walls.
 map.fortifications=JSON.parse(JSON.stringify(world.fortifications??[]));
 map.minefields=JSON.parse(JSON.stringify(world.minefields??[]));
 map.bridges=JSON.parse(JSON.stringify(world.bridges??world?.config?.bridges??map.bridges??[]));
 map.wallEdges=JSON.parse(JSON.stringify(world.wallEdges??[]));
 map.gates=JSON.parse(JSON.stringify(world.gates??[]));
 // Keep runtime references aligned with the just-synchronised scenario map so subsequent
 // add/remove operations and repeated exports always operate on the same bridge arrays.
 world.bridges=map.bridges;
 world.minefields=map.minefields;
 return map;
}
function devPrompt(label,value=''){const v=window.prompt(label,String(value??''));return v===null?null:v.trim();}
function devPickSide(current='red'){const raw=devPrompt('阵营：red / blue / chinese / japanese / soviet / german / allied / rok_government / new_military',current);return raw||null;}
function devRefreshScenarioUI(){devSyncMap();strategicObjectives.setScenario(scenario);reinforcementSystem.initialize(units,turnSystem?.turn??1);updateReinforcementUI();render();}
function devSettlementAt(hex){return (world.settlements??[]).find(x=>Number(x.q)===Number(hex.q)&&Number(x.r)===Number(hex.r));}
function devEditPlaceName(hex){
 world.settlements=Array.isArray(world.settlements)?world.settlements:[]; let x=devSettlementAt(hex);
 if(x){const name=devPrompt('地名（留空并确认可删除该地名）：',x.nameZh??x.name??'');if(name===null)return;if(!name){if(confirm('删除这个地名？'))world.settlements=world.settlements.filter(v=>v!==x);else return;}else{x.name=name;x.nameZh=name;const type=devPrompt('类型：city / town / village / hill / station / port',x.type??'town');if(type!==null&&type)x.type=type;}}
 else {const name=devPrompt(`在 (${hex.q}, ${hex.r}) 新建地名：`,'');if(!name)return;const type=devPrompt('类型：city / town / village / hill / station / port','town')||'town';world.settlements.push({id:`place_${hex.q}_${hex.r}`,name,nameZh:name,q:Number(hex.q),r:Number(hex.r),type});}
 devSyncMap();devStatus(`已更新 (${hex.q}, ${hex.r}) 地名。`);render();
}
function devEditNode(hex){
 world.settlements=Array.isArray(world.settlements)?world.settlements:[]; let x=devSettlementAt(hex);
 if(!x){const name=devPrompt(`重要节点名称 (${hex.q}, ${hex.r})：`,'重要节点');if(!name)return;x={id:`node_${hex.q}_${hex.r}`,name,nameZh:name,q:Number(hex.q),r:Number(hex.r),type:'objective'};world.settlements.push(x);}
 const action=devPrompt('重要节点：输入 on 标记，off 取消；也可直接修改名称',x.strategicObjective?'on':'on');if(action===null)return;
 if(action.toLowerCase()==='off'){x.strategicObjective=false;devStatus(`${x.nameZh??x.name} 已取消重要节点标记。`);}else{x.strategicObjective=true;if(action&&action.toLowerCase()!=='on'){x.name=action;x.nameZh=action;}devStatus(`${x.nameZh??x.name} 已设为重要节点。`);}devSyncMap();render();
}
function devEditObjective(hex){
 scenario.strategicObjectives=scenario.strategicObjectives&&typeof scenario.strategicObjectives==='object'?scenario.strategicObjectives:{};
 const side=devPickSide('chinese');if(!side)return;scenario.strategicObjectives[side]=Array.isArray(scenario.strategicObjectives[side])?scenario.strategicObjectives[side]:[];
 const arr=scenario.strategicObjectives[side];let o=arr.find(x=>Number(x.q)===Number(hex.q)&&Number(x.r)===Number(hex.r));
 if(o&&confirm(`这里已有目标“${o.title??o.name??o.id}”。确定=编辑，取消=删除/退出选择。` )===false){if(confirm('删除这个战术目标？'))arr.splice(arr.indexOf(o),1);else return;devRefreshScenarioUI();devStatus('已删除战术目标。');return;}
 const title=devPrompt('战术目标标题：',o?.title??'');if(!title)return;const description=devPrompt('目标说明：',o?.description??'')??(o?.description??'');const priority=devPrompt('优先级：primary / secondary / optional',o?.priority??'secondary')||'secondary';const action=devPrompt('行动：capture / defend / survive',o?.action??(side==='chinese'?'defend':'capture'))||'capture';const dl=devPrompt('截止回合（留空=无截止）：',o?.deadlineTurn??'');
 const data={...(o??{}),id:o?.id??`dev_obj_${side}_${Date.now()}`,title,description,priority,action,q:Number(hex.q),r:Number(hex.r)};if(dl)data.deadlineTurn=Math.max(1,Number(dl)||1);else delete data.deadlineTurn;if(o)Object.assign(o,data);else arr.push(data);devRefreshScenarioUI();devStatus(`已更新${side}战术目标：${title}`);
}
let devReinfEditingUnit=null, devReinfClickedHex=null, devUnitInitialMode=false;
const DEV_UNIT_TEMPLATES={
 infantry:{strength:500,attack:60,defense:55,movement:4,range:1,morale:70,ammo:100},guard:{strength:600,attack:72,defense:70,movement:4,range:1,morale:85,ammo:100},engineer:{strength:350,attack:52,defense:58,movement:4,range:1,morale:75,ammo:90},machinegun:{strength:220,attack:68,defense:72,movement:3,range:2,morale:72,ammo:100},artillery:{strength:300,attack:90,defense:30,movement:3,range:4,morale:70,ammo:80},antitank:{strength:220,attack:82,defense:42,movement:3,range:2,morale:72,ammo:80},anti_air:{strength:200,attack:55,defense:38,movement:3,range:3,morale:70,ammo:85},recon:{strength:180,attack:38,defense:35,movement:7,range:1,morale:75,ammo:85},cavalry:{strength:420,attack:58,defense:45,movement:7,range:1,morale:72,ammo:90},motorized:{strength:500,attack:68,defense:55,movement:7,range:1,morale:75,ammo:95},armor:{strength:300,attack:88,defense:82,movement:6,range:2,morale:80,ammo:85},tank:{strength:320,attack:96,defense:88,movement:6,range:2,morale:82,ammo:85},headquarters:{strength:180,attack:20,defense:38,movement:5,range:1,morale:85,ammo:70}
};
function devNum(id,fallback=0){const n=Number(document.getElementById(id)?.value);return Number.isFinite(n)?n:fallback;}
function devApplyUnitTemplate(){const t=DEV_UNIT_TEMPLATES[document.getElementById('devReinfType')?.value]??DEV_UNIT_TEMPLATES.infantry;for(const [id,k] of [['devReinfStrength','strength'],['devReinfMaxStrength','strength'],['devReinfAttack','attack'],['devReinfDefense','defense'],['devReinfMovement','movement'],['devReinfRange','range'],['devReinfMorale','morale'],['devReinfAmmo','ammo']]){const e=document.getElementById(id);if(e)e.value=t[k];}}
document.getElementById('devReinfType')?.addEventListener('change',devApplyUnitTemplate);document.getElementById('devReinfDefaults')?.addEventListener('click',devApplyUnitTemplate);
function devObjectiveChoices(){
 const out=[['nearest_enemy','最近敌军']]; const so=scenario?.strategicObjectives??{};
 for(const [side,arr] of Object.entries(so)) if(Array.isArray(arr)) for(const o of arr) if(o?.q!=null) out.push([`hex:${o.q},${o.r}`,`${o.title??o.name??o.id} (${o.q},${o.r})`]);
 for(const x of (world?.settlements??[])) out.push([`hex:${x.q},${x.r}`,`${x.nameZh??x.name??'地名/节点'} (${x.q},${x.r})`]);
 return out;
}
function devOpenReinforcementEditor(clickedUnit,hex,initialMode=false){
 const panel=document.getElementById('devReinforcementEditor'); if(!panel)return; devUnitInitialMode=initialMode;
 devReinfEditingUnit=clickedUnit??null; devReinfClickedHex=hex?{q:Number(hex.q),r:Number(hex.r)}:null;
 const u=clickedUnit??{}; const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??'';};
 document.getElementById('devUnitEditorTitle').textContent=initialMode?'正面战场单位编辑器':'战术增援单位编辑器';
 set('devReinfName',u.name??u.fullName??(initialMode?'新部署单位':'新增援单位'));set('devReinfType',u.type??'infantry');set('devReinfScale',u.scale??u.unitScale??'battalion');set('devReinfCommander',u.commander?.name??u.commanderName??'');set('devReinfCommanderRank',u.commander?.rank??u.commanderRank??'');set('devReinfFaction',u.faction??'chinese');
 if(clickedUnit){set('devReinfStrength',u.strength??100);set('devReinfMaxStrength',u.maxStrength??u.strength??100);set('devReinfAttack',u.attack??10);set('devReinfDefense',u.defense??10);set('devReinfMovement',u.movement??4);set('devReinfRange',u.range??1);set('devReinfMorale',u.morale??80);set('devReinfAmmo',u.ammo??100);}else devApplyUnitTemplate();
 set('devReinfTurn',initialMode?1:(u.reinforcementTurn??Math.max(2,(turnSystem?.turn??1)+1)));set('devReinfEntry',u.entryPoint?'point':(u.entryZone??'AUTO'));set('devReinfMission',u.mission??u.orderType??'attack');set('devReinfGroupName',u.reinforcementName??'战术增援');set('devReinfDetail',u.reinforcementDetail??'');
 const sel=document.getElementById('devReinfTarget');sel.innerHTML='';for(const [v,t] of devObjectiveChoices()){const o=document.createElement('option');o.value=v;o.textContent=t;sel.appendChild(o);} const target=u.missionTarget??u.attackTarget;if(target?.q!=null){const v=`hex:${target.q},${target.r}`;if(![...sel.options].some(o=>o.value===v)){const o=document.createElement('option');o.value=v;o.textContent=`指定目标 (${target.q},${target.r})`;sel.appendChild(o);}sel.value=v;}else sel.value='nearest_enemy';
 panel.hidden=false;devStatus(clickedUnit?`正在编辑单位：${unitName(clickedUnit)}`:`在 (${hex.q}, ${hex.r}) 新建${initialMode?'正面战场':'增援'}单位。`);
}
function devSaveReinforcementEditor(){
 let u=devReinfEditingUnit; if(!u){u={id:`DEV_UNIT_${Date.now()}`,q:devReinfClickedHex?.q??1,r:devReinfClickedHex?.r??1,suppression:0,fatigue:0};units.push(u);gameState.units=units;}
 const val=id=>document.getElementById(id)?.value;u.name=val('devReinfName')||'单位';u.fullName=u.name;u.type=val('devReinfType')||'infantry';u.scale=val('devReinfScale')||'battalion';u.unitScale=u.scale;u.commander={name:val('devReinfCommander')||'',rank:val('devReinfCommanderRank')||''};u.faction=val('devReinfFaction')||'chinese';u.strength=Math.max(1,devNum('devReinfStrength',100));u.maxStrength=Math.max(u.strength,devNum('devReinfMaxStrength',u.strength));u.attack=Math.max(0,devNum('devReinfAttack',10));u.defense=Math.max(0,devNum('devReinfDefense',10));u.movement=Math.max(0,devNum('devReinfMovement',4));u.movementPoints=u.movement;u.maxMovementPoints=u.movement;u.range=Math.max(1,devNum('devReinfRange',1));u.morale=Math.max(0,Math.min(100,devNum('devReinfMorale',80)));u.ammo=Math.max(0,Math.min(100,devNum('devReinfAmmo',100)));u.mission=val('devReinfMission')||'attack';
 const target=val('devReinfTarget');if(target?.startsWith('hex:')){const [q,r]=target.slice(4).split(',').map(Number);u.missionTarget={q,r};if(u.mission==='attack')u.attackTarget={q,r};else delete u.attackTarget;}else{delete u.missionTarget;delete u.attackTarget;}
 const arrival=Math.max(1,devNum('devReinfTurn',1)); if(arrival<=1){for(const k of ['reinforcementGroup','reinforcementTurn','reinforcementName','reinforcementDetail','entryZone','entryPoint','entryRadius','requiresFriendlyAt'])delete u[k];u.offMap=false;if(devReinfClickedHex){u.q=devReinfClickedHex.q;u.r=devReinfClickedHex.r;}}
 else{u.reinforcementGroup=u.reinforcementGroup||`DEV_REINF_${Date.now()}`;u.reinforcementTurn=arrival;u.reinforcementName=val('devReinfGroupName')||'战术增援';u.reinforcementDetail=val('devReinfDetail')||'';const entry=val('devReinfEntry')||'AUTO';if(entry==='point'){u.entryPoint={...(devReinfClickedHex??{q:u.q,r:u.r})};delete u.entryZone;}else{u.entryZone=entry;delete u.entryPoint;}u.offMap=Number(turnSystem?.turn??1)<arrival;}
 reinforcementSystem.initialize(units,turnSystem?.turn??1);updateReinforcementUI();document.getElementById('devReinforcementEditor').hidden=true;devStatus(`已保存：${u.name}；出现回合 ${arrival}；任务 ${u.mission}。`);render();
}
function devDeleteReinforcementEditor(){const u=devReinfEditingUnit;if(u){const i=units.indexOf(u);if(confirm(`删除单位“${unitName(u)}”？`)&&i>=0)units.splice(i,1);}document.getElementById('devReinforcementEditor').hidden=true;reinforcementSystem.initialize(units,turnSystem?.turn??1);updateReinforcementUI();render();}
document.getElementById('devReinfClose')?.addEventListener('click',()=>document.getElementById('devReinforcementEditor').hidden=true);document.getElementById('devReinfSave')?.addEventListener('click',devSaveReinforcementEditor);document.getElementById('devReinfDelete')?.addEventListener('click',devDeleteReinforcementEditor);
function devEditReinforcement(clickedUnit,hex){devOpenReinforcementEditor(clickedUnit,hex,false);}

function developerEditorHandleClick(event,clickedUnit,clickedHex){
 const tool=document.getElementById('devTool')?.value??'unit'; const hex=clickedHex??mouseToHex(event); if(!hex)return false;
 if(tool==='deployment'){devOpenReinforcementEditor(clickedUnit,hex,true);return true;} if(tool==='placename'){devEditPlaceName(hex);return true;} if(tool==='node'){devEditNode(hex);return true;} if(tool==='objective'){devEditObjective(hex);return true;} if(tool==='reinforcement'){devEditReinforcement(clickedUnit,hex);return true;}
 if(tool==='unit'){if(clickedUnit){devUnitToMove=clickedUnit;selectUnit(clickedUnit);devStatus(`已选择 ${unitName(clickedUnit)}；点击任意空格直接移动。`);render();return true;}if(devUnitToMove){const occupied=unitAtHex(hex.q,hex.r);if(occupied&&occupied!==devUnitToMove){devStatus('目标格已有单位。');return true;}devUnitToMove.q=Number(hex.q);devUnitToMove.r=Number(hex.r);selectedHex={q:Number(hex.q),r:Number(hex.r)};devStatus(`${unitName(devUnitToMove)} → (${hex.q}, ${hex.r})`);showUnitInfo(devUnitToMove);render();return true;}devStatus('先点击任意一方算子，再点击目标格。');return true;}
 if(tool==='terrain'){const type=document.getElementById('devTerrain')?.value??'plain';if(type==='plain')world.specialTerrain.delete(devHexKey(hex.q,hex.r));else world.specialTerrain.set(devHexKey(hex.q,hex.r),type);devSyncMap();devStatus(`(${hex.q}, ${hex.r}) 地形 → ${type}`);render();return true;}
 if(tool==='fort'){
  world.fortifications=Array.isArray(world.fortifications)?world.fortifications:[];
  world.minefields=Array.isArray(world.minefields)?world.minefields:[];
  const q=Number(hex.q),r=Number(hex.r),type=document.getElementById('devFortType')?.value??'foxhole';
  const fortIndex=world.fortifications.findIndex(f=>Number(f.q)===q&&Number(f.r)===r);
  const mineIndex=world.minefields.findIndex(f=>Number(f.q)===q&&Number(f.r)===r);
  if(type==='delete'){
    if(fortIndex>=0)world.fortifications.splice(fortIndex,1);
    if(mineIndex>=0)world.minefields.splice(mineIndex,1);
    const bridges=(world.bridges??world.scenario?.map?.bridges??scenario?.map?.bridges);if(Array.isArray(bridges)){for(let i=bridges.length-1;i>=0;i--)if(Number(bridges[i].q)===q&&Number(bridges[i].r)===r)bridges.splice(i,1);}
    devStatus(`已删除 (${q}, ${r}) 的工事/雷区/浮桥。`);devSyncMap();render();return true;
  }
  if(type==='minefield'){
    if(mineIndex>=0)world.minefields.splice(mineIndex,1);else world.minefields.push({q,r,owner:null,strength:100,discoveredBy:[]});
    devStatus(`${mineIndex>=0?'删除':'布设'} (${q}, ${r}) 雷区`);devSyncMap();render();return true;
  }
  if(type==='pontoon'){
    const terrain=String(world?.terrainAt?.(q,r)??'').toLowerCase();if(terrain!=='water'){devStatus('浮桥只能直接放置在 water 水域格。');return true;}
    const bridges=world.bridges??world.scenario?.map?.bridges??scenario?.map?.bridges??[];if(!world.bridges)world.bridges=bridges;
    const i=bridges.findIndex(b=>Number(b.q)===q&&Number(b.r)===r);if(i>=0){bridges.splice(i,1);devStatus(`已删除 (${q}, ${r}) 浮桥。`);}else{bridges.push({id:`dev_pontoon_${q}_${r}`,q,r,name:'开发者浮桥',bridgeClass:'pontoon',capacity:'light',orientation:'auto',crossingCells:[[q,r]],status:'intact',constructedBy:'developer'});devStatus(`已在 (${q}, ${r}) 架设浮桥。`);}devSyncMap();render();return true;
  }
  if(type==='field_wall'){
    if(!devWallStart){devWallStart={q,r};devStatus(`野战防御墙起点 (${q}, ${r})；再点一个相邻格。`);return true;}
    const a=devWallStart,b={q,r};devWallStart=null;if(!devAdjacent(a,b)){devStatus('两格不相邻，未修建防御墙。');return true;}
    world.wallEdges=Array.isArray(world.wallEdges)?world.wallEdges:[];const i=world.wallEdges.findIndex(e=>devSameEdge(e,a,b));if(i>=0){world.wallEdges.splice(i,1);devStatus('已删除野战防御墙。');}else{world.wallEdges.push({from:a,to:b,type:'field_wall',name:'野战防御墙',owner:null,hp:110,maxHp:110,integrity:100,status:'intact',breach:false,constructedBy:'developer'});devStatus('已修建野战防御墙。');}devSyncMap();render();return true;
  }
  const cfg={foxhole:{name:'散兵坑',level:1,hp:30},trench:{name:'战壕',level:2,hp:60},strongpoint:{name:'加强阵地',level:3,hp:90},bunker:{name:'碉堡',level:3,hp:150},aa_position_1:{name:'一级防空阵地',level:1,hp:50,aa:1},aa_position_2:{name:'二级防空阵地',level:2,hp:80,aa:2},aa_position_3:{name:'三级防空阵地',level:3,hp:120,aa:3}}[type]??{name:'野战工事',level:Math.max(1,Math.min(3,Number(document.getElementById('devFortLevel')?.value)||1)),hp:75};
  if(fortIndex>=0)world.fortifications.splice(fortIndex,1);
  const f={q,r,type,level:cfg.level,progress:100,owner:null,maxHp:cfg.hp,hp:cfg.hp,integrity:100,status:'intact'};
  if(cfg.aa){f.airDefensePosition=true;f.protection=[0,.10,.25,.40][cfg.aa];f.accuracyBonus=[0,.05,.10,.15][cfg.aa];}
  world.fortifications.push(f);devStatus(`已在 (${q}, ${r}) 建立${cfg.name}。`);devSyncMap();render();return true;
 }
 if(tool==='wall'||tool==='gate'){if(!devWallStart){devWallStart={q:Number(hex.q),r:Number(hex.r)};devStatus(`起点 (${hex.q}, ${hex.r})；再点一个相邻格。`);return true;}const a=devWallStart,b={q:Number(hex.q),r:Number(hex.r)};devWallStart=null;if(!devAdjacent(a,b)){devStatus('两格不相邻，未修改。');return true;}world.wallEdges=Array.isArray(world.wallEdges)?world.wallEdges:[];world.gates=Array.isArray(world.gates)?world.gates:[];if(tool==='wall'){const i=world.wallEdges.findIndex(e=>devSameEdge(e,a,b));if(i>=0){world.wallEdges.splice(i,1);world.gates=world.gates.filter(g=>!devSameEdge(g,a,b));devStatus('已删除城墙边。');}else{world.wallEdges.push({from:a,to:b});devStatus('已建立城墙边。');}}else{if(!world.wallEdges.some(e=>devSameEdge(e,a,b)))world.wallEdges.push({from:a,to:b});const i=world.gates.findIndex(g=>devSameEdge(g,a,b));if(i>=0){world.gates.splice(i,1);devStatus('城门关闭：恢复城墙。');}else{const name=devPrompt('城门名称：','城门')||'城门';world.gates.push({id:`gate_${a.q}_${a.r}_${b.q}_${b.r}`,name,nameZh:name,from:a,to:b,open:true,type:'gate'});devStatus(`城门开放：${name}`);}}devSyncMap();render();return true;}
 return false;
}
function devDownload(name,obj){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);}
function devDraftKey(){return `frontline_dev_${currentScenarioKey??scenario?.id??'scenario'}`;}
function devSnapshot(){devSyncMap();return {scenario:JSON.parse(JSON.stringify(scenario)),units:JSON.parse(JSON.stringify(units))};}
function devApplyDraft(d){if(!d?.scenario||!Array.isArray(d.units))return false;scenario=d.scenario;units=d.units;gameState.units=units;world.loadScenario?.(scenario);strategicObjectives.setScenario(scenario);reinforcementSystem.initialize(units,turnSystem?.turn??1);updateReinforcementUI();clearSelection();devUnitToMove=null;devWallStart=null;render();return true;}
document.getElementById('devTool')?.addEventListener('change',()=>{devWallStart=null;devUnitToMove=null;devStatus('工具已切换。');});
document.getElementById('devExitMode')?.addEventListener('click',()=>{document.getElementById('devReinforcementEditor')?.setAttribute('hidden','');gameState.setObserverMode();clearSelection();devUnitToMove=null;devWallStart=null;updateDeveloperPanel();render();});
document.getElementById('devSaveDraft')?.addEventListener('click',()=>{localStorage.setItem(devDraftKey(),JSON.stringify(devSnapshot()));devStatus('编辑已保存为浏览器草稿。正式更新请导出 JSON。');});
document.getElementById('devLoadDraft')?.addEventListener('click',()=>{try{const d=JSON.parse(localStorage.getItem(devDraftKey())||'null');devStatus(devApplyDraft(d)?'已读取开发者编辑。':'没有找到编辑存档。');}catch(e){devStatus('读取失败：'+e.message);}});
document.getElementById('devExportScenario')?.addEventListener('click',()=>{devSyncMap();devDownload(`scenario-${currentScenarioKey??scenario?.id??'edited'}.json`,scenario);devStatus('已导出战役 JSON（含地名、重要节点、战术目标、地形、工事、城墙/城门）。');});
document.getElementById('devExportUnits')?.addEventListener('click',()=>{devDownload(`units-${currentScenarioKey??scenario?.id??'edited'}.json`,units);devStatus('已导出单位 JSON（含单位位置与战术增援设置）。');});

window.addEventListener('keydown',e=>{if(e.key==='Escape'&&pendingEngineeringAction){pendingEngineeringAction=null;pendingEngineeringUnitId=null;writeBattleMessage('已取消工程目标选择');refreshEngineerActions();render();}});

window.addEventListener("keydown",e=>{if(e.key==="Escape"&&pendingSpecialAirDropUnitId){cancelSpecialAirDrop();}});

window.addEventListener('keydown',e=>{if(e.key==='Escape'&&pendingAirborneReserveId){pendingAirborneReserveId=null;writeBattleMessage('已取消空降落点选择');}});

window.addEventListener('keydown',e=>{if(e.key==='Escape')cmdPickingTarget=false;});

// 空突指令取消：在战场上按 ESC 清除待执行的机降/飞行目标。
document.addEventListener("keydown",e=>{if(e.key==="Escape"){pendingAirAssaultLanding=null;pendingAirAssaultFlight=null;}});
