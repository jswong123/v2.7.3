import { drawForSides, drawForGroupArmySides, EXERCISE_BRIGADES } from "../data/exercise-formation-pool.js";
// src/ui/CampaignSelection.js

import { CAMPAIGNS } from "../../data/campaigns.js?v=2.3.2";

 

export class CampaignSelection {

    constructor() {

        this.overlay = null;

        this.theater = null;

        this.phase = null;

        this.onScenarioSelected = null;
        this.onMainMenu = null;
        this.onReturnToBattle = null;
        this.hasActiveBattle = false;
        this._escHandler = (event) => { if (event.key === "Escape" && this.overlay) this.returnOut(); };
        document.addEventListener("keydown", this._escHandler);
    }

    show(onScenarioSelected, options = {}) {
        this.onScenarioSelected = onScenarioSelected;
        this.onMainMenu = options.onMainMenu ?? null;
        this.onReturnToBattle = options.onReturnToBattle ?? null;
        this.hasActiveBattle = !!options.hasActiveBattle;
        this.renderTheaters();
    }

    returnOut() {
        this.close();
        if (this.hasActiveBattle && this.onReturnToBattle) this.onReturnToBattle();
        else this.onMainMenu?.();
    }

 

    close() {

        this.overlay?.remove();

        this.overlay = null;

    }

 

    ensureOverlay() {

        this.close();

        this.overlay = document.createElement("div");

        this.overlay.id = "campaign-selection";

        Object.assign(this.overlay.style, {

            position: "fixed", inset: "0", zIndex: "100000",

            background: "rgba(28,31,26,.94)",

            display: "flex", alignItems: "center", justifyContent: "center",

            fontFamily: "FangSong, STFangsong, SimSun, serif"

        });

        document.body.appendChild(this.overlay);

        return this.overlay;

    }

 

    shell(title, subtitle, body, back = "") {

        const overlay = this.ensureOverlay();

        overlay.innerHTML = `

            <div style="width:min(980px,calc(100vw - 48px));max-height:90vh;overflow:auto;

                padding:32px 38px;box-sizing:border-box;background:#d6cfb2;color:#24251f;

                border:2px solid #5a5646;outline:1px solid #c6b98b;outline-offset:-8px;">

                <h1 style="margin:0;text-align:center;font-size:34px;letter-spacing:.12em;">${title}</h1>

                <div style="margin:8px 0 28px;text-align:center;color:#666253;">${subtitle}</div>

                ${body}

                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px;">
                  ${back ? `<button id="campaign-back" style="padding:9px 18px;">← 返回上一级</button>` : ""}
                  <button id="campaign-main" style="padding:9px 18px;">返回主界面</button>
                  ${this.hasActiveBattle ? `<button id="campaign-battle" style="padding:9px 18px;">返回当前战役</button>` : ""}
                </div>
            </div>`;

        if (back) overlay.querySelector("#campaign-back").onclick = back;
        overlay.querySelector("#campaign-main").onclick = () => { this.close(); this.onMainMenu?.(); };
        overlay.querySelector("#campaign-battle")?.addEventListener("click", () => { this.close(); this.onReturnToBattle?.(); });

        return overlay;

    }

 

    renderTheaters() {

        const cards = CAMPAIGNS.filter(Boolean).map(item => `

            <button data-theater="${item.id}" style="min-height:${item.ui?.height ?? 150}px;${item.ui?.width ? `width:${item.ui.width}px;` : ''}padding:20px;

                border:1px solid #696553;background:#c8c1a4;cursor:pointer;font:inherit;text-align:left;">

                <strong style="display:block;font-size:26px;margin-bottom:10px;">${item.name}</strong>

                <span>${item.subtitle}</span>

            </button>`).join("");

 

        const overlay = this.shell(

            "选择战场",

            "1937–1945 主战役 · 特殊战役合集",

            `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;">${cards}</div>`

        );

 

        overlay.querySelectorAll("[data-theater]").forEach(button => {

            button.onclick = () => {

                this.rootTheater = null;
                this.theater = CAMPAIGNS.find(x => x?.id === button.dataset.theater);
                if (Array.isArray(this.theater?.subtheaters) && this.theater.subtheaters.length) this.renderSubtheaters();
                else this.renderPhases();

            };

        });

    }

 

    renderSubtheaters() {
        const rootTheater = this.theater;
        const cards = rootTheater.subtheaters.map(item => `
            <button data-subtheater="${item.id}" style="min-height:${item.ui?.height ?? 150}px;padding:20px;
                border:1px solid #696553;background:#c8c1a4;cursor:pointer;font:inherit;text-align:left;">
                <strong style="display:block;font-size:26px;margin-bottom:10px;">${item.name}</strong>
                <span>${item.subtitle ?? ""}</span>
            </button>`).join("");
        const overlay = this.shell(
            rootTheater.name,
            "选择欧洲战区",
            `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;">${cards}</div>`,
            () => { this.theater = rootTheater; this.renderTheaters(); }
        );
        overlay.querySelectorAll("[data-subtheater]").forEach(button => {
            button.onclick = () => {
                const sub = rootTheater.subtheaters.find(x => x.id === button.dataset.subtheater);
                this.rootTheater = rootTheater;
                this.theater = sub;
                this.renderPhases();
            };
        });
    }

    renderPhases() {

        const phases = Array.isArray(this.theater?.phases) ? this.theater.phases : [];
        const cards = phases.filter(Boolean).map(item => `

            <button data-phase="${item.id}" style="min-height:${item.ui?.height ?? 110}px;${item.ui?.width ? `width:${item.ui.width}px;` : ''}padding:18px;

                border:1px solid #696553;background:#c8c1a4;cursor:pointer;font:inherit;text-align:left;">

                <strong style="font-size:21px;">${item.name}</strong>

                <div style="margin-top:10px;color:#625e50;">

                    ${(item.scenarios ?? []).some(s => s?.status === "available") ? "可进入" : ((item.scenarios ?? []).some(s => s?.status === "interface") ? "战役接口已建立" : "尚未开放")}

                </div>

            </button>`).join("");

 

        const overlay = this.shell(

            this.theater.name,

            "选择战役阶段",

            `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;">${cards}</div>`,

            () => {
                if (this.rootTheater?.subtheaters?.includes(this.theater)) {
                    const root = this.rootTheater;
                    this.theater = root;
                    this.rootTheater = null;
                    this.renderSubtheaters();
                } else this.renderTheaters();
            }

        );

 

        overlay.querySelectorAll("[data-phase]").forEach(button => {

            button.onclick = () => {

                this.phase = (this.theater?.phases ?? []).find(x => x?.id === button.dataset.phase);

                this.renderScenarios();

            };

        });

    }

 

    renderScenarios() {

        const scenarios = Array.isArray(this.phase?.scenarios) ? this.phase.scenarios : [];
        const list = scenarios.length

            ? scenarios.filter(Boolean).map(item => {

                let progress = {};
                try { progress = JSON.parse(localStorage.getItem("frontline_campaign_progress") || "{}")[item.id] || {}; } catch {}
                const progressBadge = progress.completed === true
                    ? `<span style="display:inline-block;margin-top:8px;padding:3px 8px;border:1px solid #68705a;background:#d8ddc2;color:#35402f;font-size:13px;">★ 已完成</span>`
                    : progress.lastResult === "defeat"
                        ? `<span style="display:inline-block;margin-top:8px;padding:3px 8px;border:1px solid #8b665f;background:#decac1;color:#5b302b;font-size:13px;">× 曾失败</span>`
                        : "";
                const locked = !["available", "interface"].includes(item.status);
                const interfaceOnly = item.status === "interface" || item.interfaceOnly === true;

                return `<button data-scenario="${item.id}" ${locked ? "disabled" : ""}

                    style="min-height:${item.ui?.height ?? 130}px;${item.ui?.width ? `width:${item.ui.width}px;` : ''}padding:20px;border:1px solid #696553;

                    background:${locked ? "#aaa58f" : "#c8c1a4"};cursor:${locked ? "not-allowed" : "pointer"};

                    font:inherit;text-align:left;opacity:${locked ? ".65" : "1"};">

                    <strong style="display:block;font-size:24px;">${item.name}</strong>

                    ${Array.isArray(item.children) && item.children.length ? `<span style="display:inline-block;margin-top:8px;padding:3px 8px;border:1px solid #817a62;background:#ded7bb;color:#403d32;font-size:13px;">含 ${item.children.length} 个子战役</span>` : ""}
                    ${progressBadge}

                    <span style="display:block;margin-top:8px;">${item.dateText ?? "开发中"}</span>

                    <span style="display:block;margin-top:8px;color:#625e50;">

                        ${locked ? "尚未开放" : (interfaceOnly ? `${item.location ?? ""} · 接口已建立 / 地图与单位待制作` : (item.location ?? "可进入战役"))}

                    </span>

                </button>`;

            }).join("")

            : `<div style="padding:40px;text-align:center;">该阶段战役尚未开放。</div>`;

 

        const overlay = this.shell(

            this.phase.name,

            this.theater.name,

            `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;">${list}</div>`,

            () => this.renderPhases()

        );

 

        overlay.querySelectorAll("[data-scenario]:not([disabled])").forEach(button => {

            button.onclick = () => {
                const item = this.phase.scenarios.find(x => x.id === button.dataset.scenario);
                if (Array.isArray(item?.children) && item.children.length) this.renderScenarioGroup(item);
                else this.renderBriefing(button.dataset.scenario);
            };

        });

    }

 

    renderScenarioGroup(parent) {
        // 砺剑-27等连续演习可使用一张总态势图作为阶段选择界面。
        // 点击热区使用百分比坐标，因此桌面、iPad和不同窗口尺寸下都会随图片同比缩放。
        if (parent?.stageOverviewImage && Array.isArray(parent.children) && parent.children.length) {
            const hotspots = parent.stageOverviewHotspots ?? {};
            const buttons = parent.children.map((item, index) => {
                const h = hotspots[item.id] ?? {left:index ? 64.2 : 14.0, top:91.0, width:22.0, height:5.3};
                return `<button data-stage-child="${item.id}" aria-label="进入${item.name}" title="进入${item.name}"
                    style="position:absolute;left:${h.left}%;top:${h.top}%;width:${h.width}%;height:${h.height}%;border:0;background:rgba(255,255,255,0.001);cursor:pointer;padding:0;"></button>`;
            }).join("");
            const overlay = this.shell(parent.name, "砺剑-27演习总简报 · 请选择阶段", `
                <div style="padding:10px;background:#101820;border:1px solid #696553;">
                    <div style="position:relative;width:100%;max-width:1536px;margin:0 auto;line-height:0;">
                        <img src="${parent.stageOverviewImage}" alt="砺剑-27 A/B阶段总态势简报" draggable="false"
                            style="display:block;width:100%;height:auto;user-select:none;-webkit-user-drag:none;">
                        ${buttons}
                    </div>
                    <div style="margin-top:8px;text-align:center;color:#d7d0b7;line-height:1.5;font-size:13px;">直接点击图中的“进入砺剑27A”或“进入砺剑27B”按钮查看对应阶段简报。</div>
                </div>`, () => this.renderScenarios());
            overlay.querySelectorAll("[data-stage-child]").forEach(button => {
                button.onclick = () => {
                    const item = parent.children.find(x => x.id === button.dataset.stageChild);
                    if (item) this.renderBriefingObject(item, parent);
                };
            });
            return;
        }
        const entries = parent.id === "yangtze_campaign_series_1949" ? [...(parent.children ?? [])] : [parent, ...(parent.children ?? [])];
        const cards = entries.map((item, index) => {
            const interfaceOnly = item.status === "interface" || item.interfaceOnly === true;
            const label = parent.id === "yangtze_campaign_series_1949" ? "渡江系列子战役" : (index === 0 ? (interfaceOnly ? "会战总览接口" : "进入会战主战役") : "子战役");
            return `<button data-child="${item.id}" style="min-height:${item.ui?.height ?? 130}px;${item.ui?.width ? `width:${item.ui.width}px;` : ''}padding:20px;border:1px solid #696553;background:#c8c1a4;cursor:pointer;font:inherit;text-align:left;">
                <strong style="display:block;font-size:24px;">${item.name}</strong>
                <span style="display:block;margin-top:8px;">${item.dateText ?? ""}</span>
                <span style="display:block;margin-top:8px;color:#625e50;">${label} · ${item.location ?? ""}</span>
            </button>`;
        }).join("");
        const overlay = this.shell(parent.name, "会战主战役与所属子战役", `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;">${cards}</div>`, () => this.renderScenarios());
        overlay.querySelectorAll("[data-child]").forEach(button => {
            button.onclick = () => {
                const id = button.dataset.child;
                const item = entries.find(x => x.id === id);
                this.renderBriefingObject(item, parent);
            };
        });
    }

    difficultySelector() {
        return `<div style="margin-top:22px;padding:14px;border:1px solid #77715d;background:rgba(255,255,255,.12);">
            <div style="font-weight:700;margin-bottom:10px;">难度选择</div>
            <div class="campaign-difficulty" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
                <label><input type="radio" name="campaign-difficulty" value="0.5"> 简单 ×0.5</label>
                <label><input type="radio" name="campaign-difficulty" value="1" checked> 普通 ×1</label>
                <label><input type="radio" name="campaign-difficulty" value="2"> 困难 ×2</label>
                <label><input type="radio" name="campaign-difficulty" value="3"> 试炼 ×3</label>
            </div>
            <div style="margin-top:7px;color:#625e50;font-size:13px;">倍率作用于敌军现有战斗参数；移动力与射程保持原值。</div>
        </div>`;
    }

    selectedDifficulty(overlay) {
        const multiplier = Number(overlay.querySelector('input[name="campaign-difficulty"]:checked')?.value ?? 1);
        const names = {0.5:'简单',1:'普通',2:'困难',3:'试炼'};
        return { multiplier, name:names[multiplier] ?? '普通' };
    }

    renderScenarioPrelude(scenario, parent = null) {
        const b = scenario.preBattleBriefing ?? {};
        const phases = (b.phases ?? []).map((x,i)=>`<div class="brief-phase"><span>${i+1}</span><div><strong>${x.title}</strong><p>${x.text}</p></div></div>`).join("");
        const objectives = (b.objectives ?? []).map(x=>`<div class="brief-objective ${x.side==='red'?'red':x.side==='blue'?'blue':''}"><strong>${x.name}</strong><div>${x.text}</div></div>`).join("");
        const overlay=this.shell(scenario.name, `${scenario.dateText ?? ""} · 战役态势与演习脚本`, `
          <main class="campaign-prelude-full">
            <section class="brief-map-panel">
              <div class="brief-map-frame">${b.image ? `<img src="${b.image}" alt="砺剑-29战役态势图">` : ''}</div>
              <div class="brief-map-note">态势图为游戏演习示意。红蓝兵力、集结地域与作战方向均为《砺剑》游戏设定。</div>
            </section>
            <section class="brief-info-panel">
              <article class="brief-card brief-summary"><h2>${b.heading ?? '导演部通告'}</h2><p>${b.summary ?? scenario.description ?? ''}</p></article>
              <div class="brief-missions">
                <article class="brief-card red"><h3>红方任务</h3><p>${b.redMission ?? ''}</p></article>
                <article class="brief-card blue"><h3>蓝方任务</h3><p>${b.blueMission ?? ''}</p></article>
              </div>
              <div class="brief-lower">
                <article class="brief-card"><h3>演习阶段</h3>${phases}</article>
                <article class="brief-card"><h3>关键任务与判定</h3>${objectives}<p class="brief-victory">${b.victory ?? ''}</p></article>
              </div>
            </section>
          </main>
          <div class="brief-primary-action"><button id="prelude-confirm">进入参演编组 →</button></div>`, ()=>parent?this.renderScenarioGroup(parent):this.renderScenarios());
        overlay.classList.add('campaign-prelude-mode');
        overlay.querySelector('#prelude-confirm').onclick=()=>this.renderBriefingObject({...scenario,preBattleBriefingDone:true},parent);
    }

    renderAirborneSupplementEditor(prefix, sideLabel="本方") {
      const units=[['ab_infantry_bn','空降步兵营'],['ab_assault_co','空降突击连'],['ab_zbd03_bn','ZBD-03机械化空降营'],['ab_zbd03_co','ZBD-03机械化空降连'],['ab_at_co','山猫反坦克连'],['ab_mortar_co','山猫迫击炮连'],['ab_air_defense_co','山猫防空连'],['ab_engineer_co','山猫工兵连'],['ab_recon_pl','山猫侦察排'],['ab_command_co','山猫通信指挥连'],['ab_logistics_co','山猫后勤保障连']];
      return `<details style="margin-top:14px;padding:12px;border:1px solid #817a62"><summary style="cursor:pointer;font-weight:700">${sideLabel}现代空降兵补充卡组（展开配置）</summary><label style="display:block;margin:8px 0"><input type="checkbox" id="${prefix}-enabled"> 启用${sideLabel}空降预备队（战中选择投送位置）</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button type="button" data-airborne-fill="max">全部最大</button><button type="button" data-airborne-fill="half">半额配置</button><button type="button" data-airborne-fill="min">全部最小</button></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px">${units.map(([id,name])=>`<label>${name}<input type="number" min="0" max="${({ab_infantry_bn:3,ab_assault_co:3,ab_zbd03_bn:2,ab_zbd03_co:3,ab_at_co:3,ab_mortar_co:3,ab_air_defense_co:3,ab_engineer_co:3,ab_recon_pl:4,ab_command_co:2,ab_logistics_co:3})[id]}" value="${id==='ab_infantry_bn'||id==='ab_command_co'?1:0}" data-airborne-unit="${id}" style="width:48px;margin-left:5px"></label>`).join('')}</div><div style="margin-top:8px">运输机：${[['y20','运-20'],['y9','运-9'],['il76','伊尔-76']].map(([id,name])=>`<label style="margin-right:12px">${name}<input type="number" min="0" max="8" value="${id==='y20'?2:0}" data-airborne-aircraft="${id}" style="width:48px;margin-left:4px"></label>`).join('')}</div><small>空降兵不占用常规卡组数量或点数；运输容量限制每次投送，运输机可重复执行任务。未指定装备的单位统一配属山猫全地形车改型，具备有限涉水与复杂地形通行能力。</small></details>`;
    }
    bindAirborneBulkControls(overlay){
      overlay.querySelectorAll('[data-airborne-fill]').forEach(button=>{
        button.addEventListener('click',()=>{
          const root=button.closest('details');
          root?.querySelectorAll('[data-airborne-unit],[data-airborne-aircraft]').forEach(input=>{
            const max=Math.max(0,Number(input.max)||0);
            input.value=String(button.dataset.airborneFill==='max'?max:button.dataset.airborneFill==='half'?Math.ceil(max/2):0);
          });
        });
      });
    }
    bindAirborneInputLimits(overlay){
      overlay.querySelectorAll('[data-airborne-unit],[data-airborne-aircraft]').forEach(input=>{
        const clamp=()=>{
          const max=Math.max(0,Number(input.max)||0);
          const raw=Number(input.value);
          if(input.value.trim()==='' || !Number.isFinite(raw)){input.value='0';return;}
          input.value=String(Math.min(max,Math.max(0,Math.floor(raw))));
        };
        input.addEventListener('input',()=>{
          // Any numeric value above max is immediately replaced, not just on submit.
          const raw=Number(input.value);
          if(input.value.trim()!=='' && Number.isFinite(raw) && (raw>Number(input.max)||raw<0))clamp();
        });
        input.addEventListener('change',clamp);
        input.addEventListener('blur',clamp);
      });
    }
    readAirborneSupplementEditor(overlay,prefix){const root=overlay.querySelector(`#${prefix}-enabled`)?.closest('details');if(!root)return {enabled:false};const read=(key)=>Object.fromEntries([...root.querySelectorAll(`[data-airborne-${key}]`)].map(el=>[el.dataset[`airborne${key[0].toUpperCase()+key.slice(1)}`],Math.min(Math.max(0,Number(el.max)||0),Math.max(0,Math.floor(Number(el.value)||0)))]));root.querySelectorAll('[data-airborne-unit],[data-airborne-aircraft]').forEach(el=>{el.value=String(Math.min(Math.max(0,Number(el.max)||0),Math.max(0,Math.floor(Number(el.value)||0))))});return {enabled:!!root.querySelector(`#${prefix}-enabled`)?.checked,units:read('unit'),aircraft:read('aircraft')};}

    renderGroupArmySelection(scenario, parent = null) {
        const types=[
          ["heavy","重型合成旅","ZTZ-99A / ZBD-04A"],["medium","中型合成旅","ZTL-11 / ZBL-08"],
          ["light","轻型合成旅","高机动轻型装备"],["air_assault","空中突击合成旅","空中机动/轻型装备（模拟）"],["mountain","山地合成旅","山地/复杂地形"],["amphibious","两栖合成旅","ZTD-05 / ZBD-05"],["urban_assault","城市突击合成旅","强化工兵/装甲突击"],["recon_strike","侦察突击合成旅","高侦察/快速机动"]
        ];
        const options=types.map(x=>`<option value="${x[0]}">${x[1]}｜${x[2]}</option>`).join("");
        const armyOptions=Array.from({length:13},(_,i)=>{const n=i+71;return `<option value="${n}GA">第${n}集团军</option>`}).join('');
        const side=(id,title,defs)=>`<div style="padding:15px;border:1px solid #756f5c"><strong>${title}集团军</strong>${defs.map((v,i)=>`<label style="display:block;margin-top:9px">第${i+1}合成旅 <select id="${id}-${i}" style="width:72%;padding:6px">${options}</select></label>`).join("")}</div>`;
        const overlay=this.shell("集团军参演编组",`${scenario.name} · 集团军级综合演习`,
          `<div style="padding:20px;background:#c8c1a4;border:1px solid #696553;line-height:1.6">
           <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:14px"><label>红方集团军番号<select id="ga-code-red" style="display:block;width:100%;padding:8px">${armyOptions}</select></label><label>蓝方集团军番号<select id="ga-code-blue" style="display:block;width:100%;padding:8px">${armyOptions}</select></label></div>
           <label style="display:block;margin-bottom:12px">编组模式<select id="ga-formation-mode" style="padding:7px;margin-left:10px"><option value="catalog">按编制库编组（游戏模拟编制）</option><option value="free">自由编组</option></select></label>
           <div id="ga-mode-help" style="margin-bottom:12px;font-size:13px;color:#514b3b">按所选集团军读取六个建制旅，所有旅均隶属本集团军。</div>
           <div style="margin-bottom:12px">每方编组6个合成旅：第1—6旅均为集团军建制内参演单位，并自动配属集团军指挥、通信、侦察、炮兵、防空、陆航、特战、工程、勤务保障、装备抢修和卫勤机构；旅、营、连/小队均保留直属指挥关系。</div>
           <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${side('ga-red','红方',['heavy','heavy','medium','light','medium','mountain'])}${side('ga-blue','蓝方',['heavy','medium','medium','mountain','heavy','light'])}</div>
           <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
             <div>${this.renderSupportQuantityEditor('ga-support-red','红方空地/导弹')}<label style="display:block;margin-top:10px"><input id="ga-rocket-red" type="checkbox" checked> 配属火箭军演习任务分队</label></div>
             <div>${this.renderSupportQuantityEditor('ga-support-blue','蓝方空地/导弹')}<label style="display:block;margin-top:10px"><input id="ga-rocket-blue" type="checkbox" checked> 配属火箭军演习任务分队</label></div>
           </div>
           <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${this.renderAirborneSupplementEditor('ga-airborne-red','红方')}${this.renderAirborneSupplementEditor('ga-airborne-blue','蓝方')}</div>
           <div style="margin-top:12px;display:flex;gap:20px;flex-wrap:wrap"><label><input type="checkbox" id="ga-honor-red" checked> 红方启用荣誉番号单位</label><label><input type="checkbox" id="ga-honor-blue" checked> 蓝方启用荣誉番号单位</label></div>
           <div style="margin-top:12px;font-size:13px">固定翼、陆航和导弹支援数量可在此直接选择；机场占领会额外增加固定翼出动批次。编制和装备数量为游戏化抽象。</div>
           <button id="ga-next" style="display:block;margin:20px auto 0;padding:11px 30px;font:inherit">确认集团军编组</button></div>`,()=>parent?this.renderScenarioGroup(parent):this.renderScenarios());
        this.bindAirborneBulkControls(overlay);
        this.bindAirborneInputLimits(overlay);
        const rd=['heavy','heavy','medium','light','medium','mountain'],bd=['heavy','medium','medium','mountain','heavy','light'];
        overlay.querySelector('#ga-code-red').value='83GA';
        overlay.querySelector('#ga-code-blue').value='82GA';
        rd.forEach((v,i)=>overlay.querySelector(`#ga-red-${i}`).value=v);bd.forEach((v,i)=>overlay.querySelector(`#ga-blue-${i}`).value=v);
        const updateFormationMode=()=>{
          const catalog=overlay.querySelector('#ga-formation-mode').value==='catalog';
          for(const side of ['red','blue']){
            const number=overlay.querySelector(`#ga-code-${side}`).value.replace('GA','');
            const entries=EXERCISE_BRIGADES.filter(b=>b.parentId===`pla_ga_${number}`);
            for(let i=0;i<6;i++){
              const el=overlay.querySelector(`#ga-${side}-${i}`);
              if(catalog){
                const b=entries.find(x=>x.id===`game_ga${number}_b${i+1}`);
                if(b)el.value=b.type;
                el.disabled=true;
                el.title=b?`${b.name}（本集团军建制内）`:'编制库暂无对应单位';
              }else{el.disabled=false;el.title='自由选择旅型，番号仍隶属本集团军';}
            }
          }
          overlay.querySelector('#ga-mode-help').textContent=catalog?'按集团军独立模拟编制表自动配置全部六个建制旅。':'自由编组：可手动调整六个建制旅的旅型，所有旅仍归所选集团军。';
        };
        ['ga-code-red','ga-code-blue','ga-formation-mode'].forEach(id=>overlay.querySelector(`#${id}`).addEventListener('change',updateFormationMode));
        updateFormationMode();
        overlay.querySelector('#ga-next').onclick=()=>{
          const red=rd.map((_,i)=>overlay.querySelector(`#ga-red-${i}`).value),blue=bd.map((_,i)=>overlay.querySelector(`#ga-blue-${i}`).value);
          const redCode=overlay.querySelector('#ga-code-red').value,blueCode=overlay.querySelector('#ga-code-blue').value;
          if(redCode===blueCode){alert('红蓝双方不能选择同一集团军番号');return;}
          const source='organic';
          const mode=overlay.querySelector('#ga-formation-mode').value;
          sessionStorage.setItem('groupArmyCodes',JSON.stringify({red:redCode,blue:blueCode,source,mode}));
          sessionStorage.setItem('exerciseFormationDraw',JSON.stringify(drawForGroupArmySides({red,blue},{red:redCode,blue:blueCode},source,{red:!!overlay.querySelector('#ga-honor-red')?.checked,blue:!!overlay.querySelector('#ga-honor-blue')?.checked})));
          sessionStorage.setItem('modernAirborneSelection',JSON.stringify({red:this.readAirborneSupplementEditor(overlay,'ga-airborne-red'),blue:this.readAirborneSupplementEditor(overlay,'ga-airborne-blue')}));
          sessionStorage.setItem('modernHonorSelection',JSON.stringify({red:!!overlay.querySelector('#ga-honor-red')?.checked,blue:!!overlay.querySelector('#ga-honor-blue')?.checked}));
          sessionStorage.setItem('groupArmySelection',JSON.stringify({red,blue,mode}));
          sessionStorage.setItem('groupArmySupportSelection',JSON.stringify({
            red:this.readSupportQuantityEditor(overlay,'ga-support-red'),
            blue:this.readSupportQuantityEditor(overlay,'ga-support-blue'),
            rocketForce:{red:!!overlay.querySelector('#ga-rocket-red')?.checked,blue:!!overlay.querySelector('#ga-rocket-blue')?.checked}
          }));
          this.renderBriefingObject({...scenario,groupArmySelectionDone:true},parent);
        };
    }

    modernSupportCards() {
        return [
            ["modern_cap","歼-20制空巡逻",2],
            ["modern_precision","歼-16精确对地支援",3],
            ["jh7a_strike","JH-7A“飞豹”战术对地支援",4],
            ["helo_antiarmor","直-10反装甲支援",3],
            ["helo_recon","直-19战场侦察",3],
            ["helo_supply","直-20前送补给",2],
            ["helo_z20_air_assault","直-20空中突击分队投送",3],
            ["helo_z8b_air_assault","直-8B空降分队投送",2],
            ["missile_fire_support","导弹部队远程火力支援",2]
        ];
    }

    renderSupportQuantityEditor(prefix, title) {
        return `<div style="margin-top:16px;padding:12px;border:1px solid #817a62">
          <strong>${title}支援卡数量</strong>
          <div style="margin-top:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 14px">
          ${this.modernSupportCards().map(([id,name,n])=>`<label style="display:grid;grid-template-columns:1fr 72px;align-items:center;gap:8px"><span>${name}</span><input id="${prefix}-${id}" type="number" min="0" max="99" step="1" value="${n}" style="width:64px;padding:5px"></label>`).join("")}
          </div><div style="margin-top:7px;font-size:12px;color:#625e50">0表示本局不携带该支援卡；选择结果仅作为游戏场景资源数量。</div>
        </div>`;
    }

    readSupportQuantityEditor(overlay, prefix) {
        const uses={};
        for(const [id,,def] of this.modernSupportCards()) {
            const el=overlay.querySelector(`#${prefix}-${id}`);
            uses[id]=Math.max(0,Math.min(99,Math.floor(Number(el?.value ?? def) || 0)));
        }
        return uses;
    }

    renderModernBrigadeSelection(scenario, parent = null) {
        const types = [
            ["heavy","重型合成旅","ZTZ-99A / ZBD-04A / PLZ-05","火力、防护强；后勤压力高"],
            ["medium","中型合成旅","ZTL-11 / ZBL-08 / PCL-181","轮式高速机动；综合均衡"],
            ["light","轻型合成旅","CSK-181 / PCL-181","高机动；正面装甲对抗较弱"],
            ["mountain","山地合成旅","CSK-181 / PCL-181 / 无人侦察","复杂地形机动与步兵作战强化"],
            ["amphibious","两栖合成旅","ZTD-05 / ZBD-05 / PLZ-05","适合渡河、滨海和水网地形"],
            ["urban_assault","城市突击合成旅","ZTZ-99A / ZBD-04A / 工程保障","3支工兵；城市攻坚强化；野外机动较慢"],
            ["recon_strike","侦察突击合成旅","ZTL-11 / ZBL-08 / 无人侦察","3支特战小队；侦察与快速机动强化"],
            ["rocket_force","火箭军综合测试旅","DF系列 / CJ-10 / 指挥保障","多型号远程火力、要地防空、工程与综合保障；游戏化测试编制"]
        ];
        const opts = types.map(([id,n,e])=>`<option value="${id}">${n}｜${e}</option>`).join("");
        const trainingName = scenario.trainingMap ? `${scenario.name} · ${({small:"小型",medium:"中型",large:"大型"}[scenario.trainingMap.size]??scenario.trainingMap.size)}训练场` : (scenario.name ?? "现代合成旅红蓝对抗");
        const isZhurihe = String(scenario.fixedBlueBrigade||"")==="195" || scenario.id==="zhurihe_195_exercise";
        const brigadeCatalog = EXERCISE_BRIGADES.filter(x=>x.type!=="rocket_force");
        const catalogOptions = brigadeCatalog.map(b=>`<option value="${b.id}">${b.name}（${b.code}） · ${b.type}</option>`).join("");
        const overlay=this.shell("选择红蓝双方参演旅编制",trainingName,
          `<div style="padding:22px;background:#c8c1a4;border:1px solid #696553;line-height:1.7">
             <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
               <label><strong>红方旅型</strong><br><select id="modern-red" style="width:100%;padding:10px;margin-top:8px">${opts}</select></label>
               <label><strong>蓝方旅型</strong><br><select id="modern-blue" style="width:100%;padding:10px;margin-top:8px">${opts}</select></label>
             </div>
             ${isZhurihe ? `<div style="margin-top:14px;padding:12px;border:1px solid #817a62"><strong>红方联合参演旅编组</strong><label style="display:block;margin-top:8px">参演旅数量 <select id="modern-red-count" style="padding:7px"><option value="1">1个旅</option><option value="2" selected>2个旅（默认）</option><option value="3">3个旅</option></select></label><div id="modern-red-slots" style="display:grid;gap:10px;margin-top:12px">${[0,1,2].map(i=>`<div class="modern-red-slot" data-slot="${i}" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label>第${i+1}参演旅类型<select class="modern-red-type" data-index="${i}" style="width:100%;padding:8px">${opts}</select></label><label>第${i+1}参演旅番号<select class="modern-red-catalog" data-index="${i}" style="width:100%;padding:8px">${catalogOptions}</select></label></div>`).join("")}</div><div style="font-size:12px;margin-top:8px">每旅独立旅指、营指、装备库存及战损；参演序号不替代实际番号。</div></div>` : ""}
             <div style="margin-top:16px;padding:12px;border:1px solid #817a62">
               <strong>战役级火箭军支援旅</strong>
               <div style="margin-top:9px;display:grid;grid-template-columns:1fr 1fr;gap:12px 18px">
                 <label><input id="rocket-support-red" type="checkbox"> 红方使用火箭军支援旅</label>
                 <label><input id="rocket-support-blue" type="checkbox"> 蓝方使用火箭军支援旅</label>
               </div>
               <div style="margin-top:7px;font-size:12px;color:#625e50">勾选后，火箭军支援旅部署到本方地图后方预留地域；不勾选则该地域保持为空。火箭军支援旅与主战合成旅同时存在。</div>
             </div>
             ${this.renderAirborneSupplementEditor("modern-airborne-red","红方")}
             ${this.renderSupportQuantityEditor("support-red","红方")}
             ${this.renderAirborneSupplementEditor("modern-airborne-blue","蓝方")}
             ${this.renderSupportQuantityEditor("support-blue","蓝方")}
             <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:10px"><label><input type="checkbox" id="modern-honor-red" checked> 红方启用荣誉番号单位</label><label><input type="checkbox" id="modern-honor-blue" checked> 蓝方启用荣誉番号单位</label></div>
             <div id="modern-preview" style="margin-top:18px;padding:14px;border:1px solid #817a62"></div>
             <button id="modern-next" style="display:block;margin:22px auto 0;padding:11px 30px;font:inherit">确认编组</button>
           </div>`,()=>parent?this.renderScenarioGroup(parent):this.renderScenarios());
        this.bindAirborneBulkControls(overlay);
        this.bindAirborneInputLimits(overlay);
        const red=overlay.querySelector("#modern-red"), blue=overlay.querySelector("#modern-blue"), preview=overlay.querySelector("#modern-preview");
        const countEl=overlay.querySelector("#modern-red-count");
        const slots=[...overlay.querySelectorAll(".modern-red-slot")];
        const catalogFor=(type,excluded=new Set())=>brigadeCatalog.filter(b=>b.type===type&&!excluded.has(b.id));
        const updateSlots=()=>{
          const count=countEl?Number(countEl.value):1;
          const used=new Set();
          slots.forEach((slot,i)=>{
            slot.style.display=i<count?"grid":"none";
            if(i>=count)return;
            const typeEl=slot.querySelector(".modern-red-type"), catalogEl=slot.querySelector(".modern-red-catalog");
            const old=catalogEl.value;
            const choices=catalogFor(typeEl.value,used);
            catalogEl.innerHTML=choices.map(b=>`<option value="${b.id}">${b.name}（${b.code}）</option>`).join("");
            if(choices.some(b=>b.id===old))catalogEl.value=old;
            if(catalogEl.value)used.add(catalogEl.value);
          });
        };
        if(countEl){
          slots.forEach((slot,i)=>{
            const t=slot.querySelector(".modern-red-type");
            t.value=i===0?"heavy":i===1?"medium":"light";
            t.addEventListener("change",()=>{updateSlots();info();});
            slot.querySelector(".modern-red-catalog").addEventListener("change",()=>{updateSlots();info();});
          });
          countEl.addEventListener("change",()=>{updateSlots();info();});
          updateSlots();
          red.closest("label").style.display="none";
        }
        blue.value=scenario.fixedBlueBrigade ? "heavy" : "medium";
        if(scenario.fixedBlueBrigade){blue.disabled=true;blue.title="蓝方固定为第195重型合成旅";const honorBlue=overlay.querySelector("#modern-honor-blue");honorBlue.checked=false;honorBlue.disabled=true;honorBlue.parentElement.title="第195旅使用固定番号，不参与荣誉番号抽签";}
        const info=()=>{const get=v=>types.find(x=>x[0]===v);const a=get(red.value),b=get(blue.value);
          preview.innerHTML=`<strong>红方：</strong>${countEl ? `${countEl.value}个独立合成旅 · ${slots.slice(0,Number(countEl.value)).map(slot=>slot.querySelector(".modern-red-catalog").selectedOptions[0]?.textContent||"未选番号").join("、")}` : a[1]} · ${a[2]}<br>${a[3]}<br><br><strong>蓝方：</strong>${scenario.fixedBlueBrigade ? "第195重型合成旅（固定）" : b[1]} · ${b[2]}<br>${b[3]}<br><br><span style="font-size:13px">同一训练场可自由组合双方旅型；确认后将按所选编制动态生成全部算子。装备数量与性能数值为游戏化抽象。</span>`;};
        red.onchange=info;blue.onchange=info;info();
        overlay.querySelector("#modern-next").onclick=()=>{
          updateSlots();
          const selectedTypes=countEl?slots.slice(0,Number(countEl.value)).map(slot=>slot.querySelector(".modern-red-type").value):[red.value];
          const selectedIds=countEl?slots.slice(0,Number(countEl.value)).map(slot=>slot.querySelector(".modern-red-catalog").value):[];
          if(countEl && (selectedIds.some(x=>!x)||new Set(selectedIds).size!==selectedIds.length)){alert("请选择不同的有效红方旅番号");return;}
          const draw=drawForSides({red:selectedTypes,blue:[blue.value]},{red:!!overlay.querySelector('#modern-honor-red')?.checked,blue:scenario.fixedBlueBrigade ? false : !!overlay.querySelector('#modern-honor-blue')?.checked});
          if(countEl)draw.red=selectedIds.map(id=>brigadeCatalog.find(b=>b.id===id));
          if(scenario.fixedBlueBrigade) draw.blue=[];
          sessionStorage.setItem('exerciseFormationDraw',JSON.stringify(draw));
          sessionStorage.setItem("modernAirborneSelection",JSON.stringify({red:this.readAirborneSupplementEditor(overlay,"modern-airborne-red"),blue:this.readAirborneSupplementEditor(overlay,"modern-airborne-blue")}));
          sessionStorage.setItem('modernHonorSelection',JSON.stringify({red:!!overlay.querySelector('#modern-honor-red')?.checked,blue:scenario.fixedBlueBrigade ? false : !!overlay.querySelector('#modern-honor-blue')?.checked}));
          sessionStorage.setItem("modernBrigadeSelection",JSON.stringify({red:selectedTypes[0],redBrigadeCount:selectedTypes.length,redBrigadeTypes:selectedTypes,redBrigadeIds:selectedIds,blue:scenario.fixedBlueBrigade ? "heavy" : blue.value}));
          sessionStorage.setItem("modernRocketSupportSelection",JSON.stringify({red:!!overlay.querySelector("#rocket-support-red")?.checked,blue:!!overlay.querySelector("#rocket-support-blue")?.checked}));
          sessionStorage.setItem("modernSupportSelection",JSON.stringify({red:this.readSupportQuantityEditor(overlay,"support-red"),blue:this.readSupportQuantityEditor(overlay,"support-blue")}));
          this.renderBriefingObject({...scenario,modernSelectionDone:true},parent);
        };
    }

    renderPlaCombinedBrigadeSelection(scenario, parent = null) {
        const types = [
            ["heavy","重型合成旅","ZTZ-99A / ZBD-04A / PLZ-05"],
            ["medium","中型合成旅","ZTL-11 / ZBL-08 / PCL-181"],
            ["light","轻型合成旅","CSK-181 / PCL-181"],
            ["mountain","山地合成旅","复杂地形机动强化"],
            ["amphibious","两栖合成旅","ZTD-05 / ZBD-05 / PLZ-05"],
            ["urban_assault","城市突击合成旅","装甲突击 / 3支工兵"],
            ["recon_strike","侦察突击合成旅","快速装步 / 3支特战"]
        ];
        const opts=types.map(([id,n,e])=>`<option value="${id}">${n}｜${e}</option>`).join("");
        const overlay=this.shell("解放军合成旅卡组",scenario.name,`<div style="padding:22px;background:#c8c1a4;border:1px solid #696553;line-height:1.7">
          <div>选择本关投入的解放军合成旅模板。台伪军仍使用关卡预设守军。</div>
          <label style="display:block;margin-top:16px"><strong>解放军合成旅</strong><br><select id="pla-brigade" style="width:100%;padding:10px;margin-top:8px">${opts}</select></label>
          <div style="margin-top:12px;font-size:13px">编制与性能均为游戏化抽象；将调用现有现代合成旅生成器。</div>
          ${this.renderSupportQuantityEditor("support-pla","解放军")}
          <button id="pla-brigade-next" style="display:block;margin:22px auto 0;padding:11px 30px;font:inherit">确认卡组</button></div>`,()=>parent?this.renderScenarioGroup(parent):this.renderScenarios());
        overlay.querySelector('#pla-brigade').value='heavy';
        overlay.querySelector('#pla-brigade-next').onclick=()=>{
          sessionStorage.setItem('exerciseFormationDraw',JSON.stringify(drawForSides({red:[overlay.querySelector('#pla-brigade').value]})));
          sessionStorage.setItem('plaCombinedBrigadeSelection',overlay.querySelector('#pla-brigade').value);
          sessionStorage.setItem('plaSupportSelection',JSON.stringify(this.readSupportQuantityEditor(overlay,'support-pla')));
          this.renderBriefingObject({...scenario,plaCombinedBrigadeSelectionDone:true},parent);
        };
    }

    renderMarineSupportSelection(scenario, parent = null) {
        const overlay=this.shell("海军陆战队演习支援编组",scenario.name,`<div style="padding:22px;background:#c8c1a4;border:1px solid #696553;line-height:1.7">
          <div>双方地面、岸防、海军和特战编制使用本关固定大型编制；在进入战场前选择本局空军、陆航和远程火力支援次数。</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
            <div>${this.renderSupportQuantityEditor("marine-support-red","红方")}</div>
            <div>${this.renderSupportQuantityEditor("marine-support-blue","蓝方")}</div>
          </div>
          <div style="margin-top:12px;font-size:13px">特战编制已恢复：红方包含3个营属特战小队和2个旅特战小队；蓝方包含岸防旅及中央岛守备特战分队。特战单位保留独立空降资格。</div>
          <button id="marine-support-next" style="display:block;margin:22px auto 0;padding:11px 30px;font:inherit">确认支援编组</button>
        </div>`,()=>parent?this.renderScenarioGroup(parent):this.renderScenarios());
        overlay.querySelector('#marine-support-next').onclick=()=>{
          sessionStorage.setItem('marineSupportSelection',JSON.stringify({red:this.readSupportQuantityEditor(overlay,'marine-support-red'),blue:this.readSupportQuantityEditor(overlay,'marine-support-blue')}));
          this.renderBriefingObject({...scenario,marineSupportSelectionDone:true},parent);
        };
    }

    renderBriefingObject(scenario, parent = null) {
        if (scenario.preBattleBriefing && !scenario.preBattleBriefingDone) { this.renderScenarioPrelude(scenario, parent); return; }
        if (scenario.marineSupportSelection && !scenario.marineSupportSelectionDone) { this.renderMarineSupportSelection(scenario, parent); return; }
        if (scenario.plaCombinedBrigadeSelection && !scenario.plaCombinedBrigadeSelectionDone) { this.renderPlaCombinedBrigadeSelection(scenario, parent); return; }
        if (scenario.groupArmySelection && !scenario.groupArmySelectionDone) { this.renderGroupArmySelection(scenario, parent); return; }
        if (scenario.modernBrigadeSelection && !scenario.modernSelectionDone) { this.renderModernBrigadeSelection(scenario, parent); return; }
        const overlay = this.shell(
            scenario.name, `${scenario.dateText ?? ""} · ${scenario.location ?? ""}`,
            `<div style="padding:24px;background:#c8c1a4;border:1px solid #696553;line-height:1.8;">
                ${parent && parent.id !== scenario.id ? `<div><strong>所属会战：</strong>${parent.name}</div>` : ""}
                <div><strong>战场：</strong>${this.rootTheater ? `${this.rootTheater.name} · ${this.theater.name}` : this.theater.name}</div><div><strong>阶段：</strong>${this.phase.name}</div>
                <div><strong>战役：</strong>${scenario.name}</div><div><strong>规模：</strong>营 / 连级战术单位</div>
                ${scenario.urbanDefense ? `<div><strong>城市防御：</strong>启用分段城墙系统（独立耐久 / 0耐久形成缺口 / 完整城墙禁止绕行）</div>` : ""}
                ${scenario.interfaceOnly ? `<div style="margin-top:18px;padding:12px;border:1px dashed #696553;"><strong>开发状态：</strong>战役接口已建立；地图、单位与具体任务数据将在后续版本制作。</div>` : ""}
                ${scenario.interfaceOnly ? "" : this.difficultySelector()}
                <button id="campaign-start" ${scenario.interfaceOnly ? "disabled" : ""} style="display:block;margin:28px auto 0;padding:12px 34px;font:inherit;font-size:18px;cursor:${scenario.interfaceOnly ? "not-allowed" : "pointer"};opacity:${scenario.interfaceOnly ? ".55" : "1"};">${scenario.interfaceOnly ? "接口已建立 · 待制作" : "开始战役"}</button>
            </div>`, () => parent ? this.renderScenarioGroup(parent) : this.renderScenarios());
        if (!scenario.interfaceOnly) overlay.querySelector("#campaign-start").onclick = () => { this.close(); this.onScenarioSelected?.(scenario.id, this.selectedDifficulty(overlay)); };
    }

    renderBriefing(id) {
        const parent = this.phase.scenarios.find(x => x.id === id || x.children?.some(c => c.id === id));
        const scenario = parent?.id === id ? parent : parent?.children?.find(c => c.id === id);
        if (!scenario) return;
        // 所有战役统一经过 renderBriefingObject。旧版这里复制了一套 briefing UI，
        // 导致 modernBrigadeSelection / groupArmySelection / plaCombinedBrigadeSelection 被绕过。
        return this.renderBriefingObject(scenario, parent?.id !== id ? parent : null);
    }


}
