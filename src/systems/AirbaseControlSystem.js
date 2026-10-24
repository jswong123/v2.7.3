export class AirbaseControlSystem {
  constructor({getUnits,getTurn}={}){this.getUnits=getUnits;this.getTurn=getTurn;this.enabled=false;this.lastTurn=0;this.owner='allied';this.integrity=100;this.airport={q:65,r:43};this.initialized=false;}
  normalize(v){return String(v??'').toLowerCase();}
  configure(scenario){
    const id=String(scenario?.id??scenario?.key??scenario?.map?.id??'').toLowerCase();
    this.enabled=id.includes('werribee')||String(scenario?.nameZh??scenario?.name??'').includes('威勒比');
    const field=(scenario?.map?.settlements??[]).find(s=>s.type==='airfield'&&/库克角|point cook/i.test(String(s.nameZh??s.name??'')));
    this.airport={q:Number(field?.q??65),r:Number(field?.r??43)};
    this.owner='allied';this.integrity=100;this.lastTurn=0;this.initialized=false;
  }
  isLocal(side,id){return this.enabled&&side==='allied'&&['p40_strafe','b25_bomb'].includes(id);}
  canUse(side,id){
    if(!this.isLocal(side,id))return {ok:true};
    if(this.owner!=='allied')return {ok:false,reason:'库克角机场已失守，本地航空兵停飞'};
    const min=id==='b25_bomb'?50:25;
    if(this.integrity<min)return {ok:false,reason:`机场耐久低于${min}%，该机型停飞`};
    return {ok:true};
  }
  update(state){
    if(!this.enabled)return;
    const turn=Math.max(1,Math.floor(Number(this.getTurn?.()??1)));
    const units=(this.getUnits?.()??[]).filter(u=>u&&u.offMap!==true&&!u.destroyed&&Number(u.strength??u.manpower??1)>0);
    const on=units.filter(u=>Number(u.q)===this.airport.q&&Number(u.r)===this.airport.r);
    const sides=[...new Set(on.map(u=>this.normalize(u.faction??u.side)))];
    if(sides.length===1&&['allied','japanese'].includes(sides[0]))this.owner=sides[0];
    // 仅当澳军持续控制完好机场时，每四回合恢复一次战斗机支援（上限6）。
    if(this.initialized&&turn>this.lastTurn&&this.owner==='allied'&&this.integrity>=25){
      const periods=Math.floor((turn-1)/4)-Math.floor((this.lastTurn-1)/4);
      if(periods>0&&state?.allied?.cards){const cards=state.allied.cards;cards.p40_strafe=Math.min(6,Math.max(0,Number(cards.p40_strafe??0))+periods);}
    }
    this.lastTurn=turn;this.initialized=true;
  }
  setIntegrity(value){this.integrity=Math.max(0,Math.min(100,Number(value)||0));}
  getStatus(){return {enabled:this.enabled,owner:this.owner,integrity:this.integrity,q:this.airport.q,r:this.airport.r};}
}
