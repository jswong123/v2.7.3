// 渡江战役完整编制浏览系统：只读编制库，不干预战斗单位、指挥权限、地图选择或后勤对象。
import { YANGTZE_OOB } from '../data/yangtze-oob-1949.js';
const LEVEL={root:'战役阵营',field_army:'野战军',theater:'战区指挥部',army_group:'兵团',army:'军',division:'师',regiment:'团',battalion:'营',company:'连',headquarters:'指挥部',sector:'江防区'};
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined&&text!==null)x.textContent=String(text);if(cls)x.className=cls;return x};
const nodes=YANGTZE_OOB.nodes;
const byId=new Map(nodes.map(n=>[n.id,n]));
const children=new Map();for(const n of nodes){if(!children.has(n.parentId))children.set(n.parentId,[]);children.get(n.parentId).push(n)}
function ancestry(n){const arr=[],seen=new Set();while(n&&!seen.has(n.id)){seen.add(n.id);arr.unshift(n);n=byId.get(n.parentId)}return arr}
export function initializeYangtzeOOB(){
 if(document.getElementById('yangtzeOOBOpen'))return;
 const anchor=document.getElementById('formationCatalogModal');if(!anchor)return;
 const open=el('button','渡江战役双方编制','');open.id='yangtzeOOBOpen';open.type='button';open.style.cssText='margin:8px;padding:9px 15px;cursor:pointer;background:#927b47;color:#fff;border:1px solid #c3b58b;';
 const title=anchor.querySelector('h2,h3')||anchor.firstElementChild;
 if(title)title.insertAdjacentElement('afterend',open);else anchor.prepend(open);
 const overlay=el('div');overlay.id='yangtzeOOBOverlay';overlay.hidden=true;overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:#091a22ed;color:#eee9d6;overflow:auto;padding:20px;box-sizing:border-box;font-family:inherit';
 const head=el('div');head.style.cssText='display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:16px';head.append(el('h2','渡江战役 · 双方完整编制序列'));
 const close=el('button','返回编制库');close.type='button';close.onclick=()=>{overlay.hidden=true};head.append(close);
 const side=el('select');for(const [id,label] of [['pla','红方 · 中国人民解放军'],['kmt','蓝方 · 蒋匪军']]){const op=el('option',label);op.value=id;side.append(op)}head.append(side);
 const search=el('input');search.placeholder='搜索番号、装备、指挥官、单位ID';search.style.cssText='padding:8px;min-width:240px';head.append(search);
 const summary=el('div');head.append(summary);overlay.append(head);
 const layout=el('div');layout.style.cssText='display:grid;grid-template-columns:minmax(270px,37%) minmax(340px,1fr);gap:18px;max-width:1600px;margin:auto';
 const tree=el('div');tree.style.cssText='border:1px solid #657078;padding:12px;max-height:75vh;overflow:auto';
 const detail=el('div');detail.style.cssText='border:1px solid #657078;padding:20px;max-height:75vh;overflow:auto';layout.append(tree,detail);overlay.append(layout);document.body.append(overlay);
 let selected='pla-root';const expanded=new Set(['pla-root','pla-3fa','kmt-root','kmt-command']);
 function renderDetail(n){detail.replaceChildren();if(!n)return;detail.append(el('h2',n.name));const lineage=el('p',ancestry(n).map(a=>a.name).join(' → '));detail.append(lineage);
  const dl=el('dl');for(const [label,v] of [['层级',LEVEL[n.level]||n.level],['阵营',n.side==='pla'?'中国人民解放军':'蒋匪军'],['指挥官',n.commander],['战场单位ID',n.unitId],['现有兵力',n.strength],['兵种',n.type],['地图坐标',n.coordinate&&`${n.coordinate.q}, ${n.coordinate.r}`],['完整编制',n.formationPath?.join(' → ')],['资料状态',n.sourceStatus],['说明',n.note]]){if(v===undefined||v===null||v==='')continue;dl.append(el('dt',label),el('dd',v))}detail.append(dl);
  if(n.equipment?.length){detail.append(el('h3','装备展示'));const table=el('table');table.style.width='100%';for(const e of n.equipment){const tr=el('tr');tr.append(el('td',e.name),el('td',e.verified&&e.quantity!=null?String(e.quantity):'数量未核实'));table.append(tr)}detail.append(table)}
  const kids=children.get(n.id)||[];if(kids.length){detail.append(el('h3',`下属单位（${kids.length}）`));for(const c of kids){const b=el('button',c.name);b.type='button';b.style.cssText='display:block;margin:5px 0;padding:7px;background:#274557;color:#fff';b.onclick=()=>{selected=c.id;for(const a of ancestry(c))expanded.add(a.id);render()};detail.append(b)}}
 }
 function render(){const s=side.value,q=search.value.trim().toLowerCase();tree.replaceChildren();const root=byId.get(s+'-root');summary.textContent=`当前阵营 ${nodes.filter(n=>n.side===s).length} 条编制记录`;
  const matches=n=>!q||[n.name,n.id,n.unitId,n.commander,...(n.equipment||[]).map(e=>e.name)].some(v=>String(v||'').toLowerCase().includes(q));
  const descendantMatches=n=>matches(n)||(children.get(n.id)||[]).some(descendantMatches);
  function walk(n,depth){if(q&&!descendantMatches(n))return;const line=el('div');line.style.cssText=`margin-left:${depth*15}px;display:flex;align-items:center;gap:5px;padding:3px 0`;
   const kids=children.get(n.id)||[];const toggle=el('button',kids.length?(expanded.has(n.id)||q?'▾':'▸'):'·');toggle.type='button';toggle.style.cssText='min-width:25px';toggle.onclick=()=>{expanded.has(n.id)?expanded.delete(n.id):expanded.add(n.id);render()};line.append(toggle);
   const b=el('button',n.name);b.type='button';b.style.cssText=`text-align:left;flex:1;padding:6px;background:${selected===n.id?'#9c8150':'#193746'};color:#fff;border:1px solid #51636a`;b.onclick=()=>{selected=n.id;render()};line.append(b);tree.append(line);
   if(expanded.has(n.id)||q)for(const c of kids)walk(c,depth+1)
  }walk(root,0);renderDetail(byId.get(selected)||root)
 }
 side.onchange=()=>{selected=side.value+'-root';render()};search.oninput=render;open.onclick=()=>{overlay.hidden=false;render()};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden){overlay.hidden=true;e.stopPropagation()}});render();
}
