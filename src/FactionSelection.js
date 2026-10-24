import { FactionSystem } from "./systems/FactionSystem.js";

export class FactionSelection {
    constructor(gameState) { this.gameState = gameState; this.overlay = null; }

    show(onStart = null, options = {}) {
        this.close();
        const scenario = options.scenario ?? {};
        const config = options.config ?? {};
        const factionIds = config.factions ?? Object.keys(this.gameState?.factions ?? {});
        const title = config.name ?? scenario.name ?? scenario.scenario ?? "选择阵营";
        const dateText = config.dateText ?? scenario.date ?? "";
        const modern = config.modernBrigadeSelection === true;
        const labels = config.liberation1949 === true ? { ...(config.factionLabels ?? {}), PLA: {name:"中国人民解放军",fullName:"中国人民解放军"}, KMT:{name:"蒋匪军",fullName:"蒋匪军"} } : (config.factionLabels ?? {});
        const liberation = config.liberation1949 === true;
        const cards = factionIds.map(id => this.createFactionCard(id, modern, labels[id])).join("");

        this.overlay = document.createElement("div");
        Object.assign(this.overlay.style,{position:"fixed",inset:"0",background:"rgba(25,29,24,.96)",zIndex:"9999",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"FangSong,仿宋,SimSun,serif"});
        const panel=document.createElement("div");
        Object.assign(panel.style,{width:"820px",maxWidth:"92vw",color:"#e8e2c8",textAlign:"center"});
        panel.innerHTML=`<div style="font-size:40px;margin-bottom:8px;">${title}</div>
        <div style="font-size:18px;opacity:.7;margin-bottom:32px;">${dateText} · 选择参战阵营</div>
        <div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;">${cards}</div>
        <div style="display:flex;gap:12px;justify-content:center;margin-top:28px;"><button id="observerButton" type="button" style="padding:10px 24px;background:transparent;color:#c9c4ae;border:1px solid #777565;cursor:pointer;font-family:inherit;font-size:15px;">观察员模式</button><button id="developerButton" type="button" style="padding:10px 24px;background:#8d7b4e;color:#fff8dc;border:1px solid #c8b98b;cursor:pointer;font-family:inherit;font-size:15px;font-weight:700;">开发者模式</button></div>`;
        this.overlay.appendChild(panel); document.body.appendChild(this.overlay);

        panel.querySelectorAll("[data-faction]").forEach(button=>button.addEventListener("click",()=>{
            const faction=button.dataset.faction;
            if (liberation && faction !== "OBSERVER") {
                this.showFormationSelection(faction, onStart, { title, dateText });
                return;
            }
            this.gameState.setPlayerFaction(faction);
            this.gameState.playerCommandGroup = null;
            this.close();
            if (typeof onStart === "function") onStart(faction);
        }));
        panel.querySelector("#observerButton")?.addEventListener("click",()=>{
            this.gameState.setObserverMode(); this.close();
            if(typeof onStart==="function") onStart("OBSERVER");
        });
        panel.querySelector("#developerButton")?.addEventListener("click",()=>{
            // 开发者模式密钥门禁。注意：这是前端访问门禁，不等同于服务器级安全认证。
            const key = window.prompt("请输入开发者模式密钥：", "");
            if (key === null) return;
            if (key !== "123456wrx") {
                window.alert("开发者密钥错误，无法进入开发者模式。");
                return;
            }
            this.gameState.setDeveloperMode(); this.close();
            if(typeof onStart==="function") onStart("DEVELOPER");
        });
    }

    showFormationSelection(faction, onStart, context = {}) {
        const side = faction === "PLA" ? "pla" : "kmt";
        const ownUnits = (this.gameState.units ?? []).filter(u => String(u.faction).toLowerCase() === side);
        const groupOf = u => String(u.commandGroup || u.operationalGroup || u.armyGroupFormation || "").trim() || null;
        const groups = [...new Set(ownUnits.map(groupOf).filter(Boolean))];
        // 未设置集团时仍允许选择全军，避免阻塞其他1949战役。
        if (!groups.length) groups.push(side === "pla" ? "中国人民解放军" : "蒋匪军");
        const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const factionName = side === "pla" ? "中国人民解放军" : "蒋匪军";
        let selected = groups.find(g => g.includes("第三野战军中集团")) ?? groups[0];
        const unitsOf = group => ownUnits.filter(u => groupOf(u) === group || (groups.length === 1 && !groupOf(u)));
        const style = document.createElement("style");
        style.textContent = `
          .fl-formation-screen{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;background:#d9d2b6;color:#252a27;font-family:FangSong,仿宋,SimSun,serif;overflow:auto}
          .fl-formation-screen *{box-sizing:border-box}
          .fl-formation-head{background:#172d39;color:#e9e0c7;padding:18px clamp(20px,4vw,70px);display:flex;justify-content:space-between;align-items:center;gap:20px}
          .fl-formation-main{padding:clamp(16px,3vw,40px);display:grid;grid-template-columns:minmax(260px,1fr) minmax(320px,1.4fr);gap:24px;flex:1;min-height:0}
          .fl-formation-list{display:grid;gap:12px;align-content:start;overflow:auto}
          .fl-formation-choice{background:#e8e1ca;border:2px solid #aaa186;text-align:left;padding:18px 20px;font:inherit;cursor:pointer;color:inherit}
          .fl-formation-choice[aria-pressed=true]{border-color:#9b3e34;background:#f2e8cf;box-shadow:inset 5px 0 #9b3e34}
          .fl-formation-detail{background:#e8e1ca;border:1px solid #a79e87;padding:clamp(18px,2vw,32px);overflow:auto}
          .fl-formation-footer{display:flex;justify-content:space-between;gap:14px;align-items:center;background:#c7bea3;padding:14px clamp(20px,4vw,70px);flex-wrap:wrap}
          .fl-formation-btn{font:inherit;font-size:17px;padding:12px 28px;border:1px solid #7d7766;background:#eee9d8;cursor:pointer}
          .fl-formation-btn.primary{background:#8e7848;color:white;border-color:#7b633b}
          .fl-formation-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:20px 0}
          .fl-formation-stat{padding:12px;background:#d7cfb7;border:1px solid #b7ac91}
          .fl-formation-corps{margin:8px 0;border:1px solid #b9af97;background:#eee8d6}
          .fl-formation-corps summary{cursor:pointer;padding:12px;display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}
          .fl-formation-corps summary span{font-size:13px;color:#695f4e}
          .fl-formation-unit{padding:10px 14px;border-top:1px solid #d2c8af}
          .fl-formation-unit small{margin-left:12px;color:#695f4e}
          .fl-formation-unit-sub{font-size:12px;color:#776b54;margin-top:5px}
          .fl-formation-unit:hover{background:#e0d7bf}
          @media(max-width:780px){.fl-formation-main{grid-template-columns:1fr;overflow:auto}.fl-formation-list{overflow:visible}.fl-formation-stats{grid-template-columns:1fr 1fr}}
        `;
        const screen = document.createElement("div");
        screen.className = "fl-formation-screen";
        screen.innerHTML = `<header class="fl-formation-head"><div><div style="font-size:13px;opacity:.8">${esc(context.title)} · ${esc(context.dateText)}</div><div style="font-size:30px;margin-top:6px">战前作战编组选择</div></div><div style="font-size:18px">${factionName}</div></header>
          <main class="fl-formation-main"><section><h2 style="font-size:23px;margin:0 0 12px">选择直接指挥的作战集团</h2><p style="line-height:1.7">玩家直接指挥所选集团，其余同阵营部队由友军 AI 协同作战。</p><div class="fl-formation-list" id="fl-formation-list"></div></section><section class="fl-formation-detail" id="fl-formation-detail" aria-live="polite"></section></main>
          <footer class="fl-formation-footer"><button class="fl-formation-btn" id="fl-formation-back">← 返回阵营选择</button><span>编组选择仅决定直接指挥权，不会删除其他友军单位。</span><button class="fl-formation-btn primary" id="fl-formation-confirm">确认编组 · 进入战役 →</button></footer>`;
        const list = screen.querySelector("#fl-formation-list");
        const detail = screen.querySelector("#fl-formation-detail");
        const render = () => {
            list.replaceChildren();
            groups.forEach(g => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "fl-formation-choice";
                button.setAttribute("aria-pressed", String(g === selected));
                const members = unitsOf(g);
                const count = members.length;
                const total = members.reduce((n,u)=>n+(Number(u.manpower ?? u.strength)||0),0);
                button.innerHTML = `<strong style="font-size:20px">${esc(g)}</strong><div style="margin-top:10px">所属单位 ${count} · ${total.toLocaleString('zh-CN')}人 · ${g===selected?'当前选中':'点击查看'}</div>`;
                button.onclick = () => {selected = g; render();};
                list.appendChild(button);
            });
            const direct = unitsOf(selected);
            const other = ownUnits.filter(u => !direct.includes(u));
            const sum = key => direct.reduce((n,u)=>n+(Number(u[key])||0),0);
            const number = n => Number(n || 0).toLocaleString('zh-CN');
            const corpsOf = u => u.corpsFormation || u.parentFormation || u.armyFormation || '直属及其他部队';
            const formations = new Map();
            for (const u of direct) {
                const key = String(corpsOf(u));
                if (!formations.has(key)) formations.set(key, []);
                formations.get(key).push(u);
            }
            const formationHtml = [...formations].map(([name, members]) => `<details class="fl-formation-corps" open><summary><strong>${esc(name)}</strong><span>${members.length}个战术单位 · ${number(members.reduce((n,u)=>n+(Number(u.manpower ?? u.strength)||0),0))}人</span></summary><div>${members.map(u=>{
                const weapons = Array.isArray(u.equipment) ? u.equipment : [];
                const equipment = weapons.slice(0,4).map(w=>typeof w==='string'?w:(w.name||w.weapon||w.model||'')).filter(Boolean).join('、');
                return `<div class="fl-formation-unit"><div><b>${esc(u.fullName||u.name||u.id)}</b><small>${esc(u.echelon||u.type||'单位')} · ${number(u.manpower ?? u.strength)}人</small></div><div class="fl-formation-unit-sub">${u.commander && u.commander !== '不详' ? '指挥官：'+esc(u.commander)+' · ' : ''}${equipment ? '装备：'+esc(equipment) : '装备型号待核实'}</div></div>`;
            }).join('')}</div></details>`).join('');
            detail.innerHTML = `<div style="font-size:14px;color:#6d604a">作战集团 · 编制与指挥权限</div><h2 style="font-size:30px;margin:12px 0">${esc(selected)}</h2>
              <p>直接指挥：${esc(selected)}所属单位。其他友军保持在地图上，由 AI 执行本方阶段行动。</p>
              <div class="fl-formation-stats"><div class="fl-formation-stat">直属单位<br><strong style="font-size:27px">${direct.length}</strong></div><div class="fl-formation-stat">直属兵力<br><strong style="font-size:27px">${sum('manpower')||sum('strength')}</strong></div><div class="fl-formation-stat">友军 AI 单位<br><strong style="font-size:27px">${other.length}</strong></div></div>
              <h3>直属部队编制 · 按上级番号展开</h3><div style="max-height:40vh;overflow:auto;border-top:1px solid #b7ac91">${direct.length ? formationHtml : '<p>当前战役未配置直属单位，请检查作战集团归属字段。</p>'}</div>
              <p style="font-size:14px;margin-top:22px">友军协同：${[...new Set(other.map(groupOf).filter(Boolean))].map(esc).join('、') || '无其他编组'}。</p>`;
        };
        render();
        this.overlay?.remove();
        this.overlay = screen;
        screen.appendChild(style);
        document.body.appendChild(screen);
        screen.querySelector("#fl-formation-back").onclick = () => this.show(onStart, {scenario:{name:context.title,date:context.dateText},config:{name:context.title,dateText:context.dateText,liberation1949:true,factions:["PLA","KMT"]}});
        screen.querySelector("#fl-formation-confirm").onclick = () => {
            this.gameState.setPlayerFaction(faction);
            this.gameState.playerCommandGroup = selected;
            this.gameState.playerCommandUnitIds = unitsOf(selected).map(u => String(u.id));
            console.info("[战前编组] 玩家直接指挥", selected, this.gameState.playerCommandUnitIds.length, "个单位");
            this.close();
            if (typeof onStart === "function") onStart(faction);
        };
    }

    createFactionCard(id, modern=false, custom=null) {
        const f=FactionSystem.getFaction(id);
        const title=custom?.name ?? (modern ? (id === "CHN" ? "红方" : id === "JPN" ? "蓝方" : (f?.name ?? id)) : (f?.name ?? id));
        const fullName=custom?.fullName ?? (modern ? (id === "CHN" ? "红方合成旅" : id === "JPN" ? "蓝方合成旅" : (f?.fullName ?? title)) : (f?.fullName ?? title));
        const accent={RED:"#b65b55",BLUE:"#667f96",GER:"#8495a5",USSR:"#b75d58",CHN:"#647a55",JPN:"#a86b55",GBR:"#8a8065",ITA:"#7d8065",USA:"#65788a",ROK_GOV:"#667f96",NEWMIL:"#b65b55"}[id] ?? "#777565";
        return `<button type="button" data-faction="${id}" style="width:300px;min-height:210px;padding:28px;background:#ded8bd;border:3px solid ${accent};cursor:pointer;color:#292b25;font-family:inherit;">
        <div style="font-size:30px;margin-bottom:20px;">${title}</div><div style="font-size:18px;margin-bottom:16px;">${fullName}</div><div style="font-size:14px;line-height:1.7;opacity:.75;">以${title}身份进入本战役</div><div style="margin-top:25px;font-size:16px;">选择阵营</div></button>`;
    }

    close(){ if(this.overlay?.parentNode) this.overlay.parentNode.removeChild(this.overlay); this.overlay=null; }
}
