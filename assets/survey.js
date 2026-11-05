const filters={impl:'all',training:'all',pool:'all'},palette=['#2a78d6','#df7448','#17885b','#aa8200','#8755b9','#b84b70','#128c9a','#73674a','#5a6da0'];
let query='',page=0,selectedPath=[],lastBrowsePath=[],mode='start';
const $=id=>document.getElementById(id),groupLink=path=>'#/group/'+path.map(encodeURIComponent).join('/'),paperLink=path=>'#/papers/'+path.map(encodeURIComponent).join('/');
const passing=p=>Object.entries(filters).every(([k,v])=>v==='all'||p[k]===v);
const textMatches=p=>!query||[p.title,p.abstract,p.id,...Object.values(p.identifiers||{})].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase());
function rowsTable(table,columns,rows){table.replaceChildren();head(table,columns.map(v=>[v]));const body=el('tbody');for(const values of rows){const row=el('tr');cells(row,values.map(v=>[v]));body.append(row);}table.append(body);}
function route(){
  const parts=(location.hash||'#/start').replace(/^#\//,'').split('/');
  try{return {mode:parts[0],path:parts.slice(1).filter(Boolean).map(decodeURIComponent)};}catch{return {mode:'start',path:[]};}
}
function link(url,text){const a=el('a','go',text);a.href=url;return a;}
function setNavigation(name){for(const [id,m] of [['navStart','start'],['navScenes','scenes'],['navObjects','objects'],['navMethods','methods']])$(id).setAttribute('aria-current',name===m?'page':'false');}
function startPage(){
  $('scopeTitle').textContent=CONFIG.scope;$('observation').textContent=`${CONFIG.start_year}—${CONFIG.cutoff.slice(0,4)} · 截至 ${CONFIG.cutoff}`;
  const box=$('sourceList');box.replaceChildren();
  for(const source of CONFIG.sources){const card=el('article','source');card.append(safeLink(source.url,source.label),el('p',null,source.tracks),el('p',null,source.reason));box.append(card);}
  if(!CONFIG.sources.length)box.append(el('p','empty','目标来源尚未选择。'));
}
function svgNode(tag,attrs={},text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
function counts(path,pool,year){return PAPERS.filter(p=>passing(p)&&startsPath(p.path,path)&&(!pool||p.pool===pool)&&(!year||chartYear(p)===year)).length;}
function stock(groups){
  const box=$('stockChart');box.replaceChildren();const max=Math.max(1,...groups.map(g=>counts(g.path))),height=50+groups.length*49,svg=svgNode('svg',{viewBox:`0 0 900 ${height}`,role:'img','aria-label':'各分类目标来源与前沿预印本的存量，同图共用刻度'});
  const rows=[];
  groups.forEach((g,i)=>{
    const core=counts(g.path,'core'),preprint=counts(g.path,'preprint'),y=28+i*49,total=core+preprint;
    const node=svgNode('a',{href:groupLink(g.path)});node.append(svgNode('text',{x:8,y:y+14},g.label));svg.append(node);
    svg.append(svgNode('rect',{x:235,y,width:core/max*560,height:20,rx:2,fill:'var(--c1)'}),svgNode('rect',{x:235+core/max*560,y,width:preprint/max*560,height:20,rx:2,fill:'var(--c2)'}),svgNode('text',{x:810,y:y+15},String(total)));
    rows.push([link(groupLink(g.path),g.label),core,preprint,total]);
  });
  box.append(svg);const legend=el('div','legend');for(const [label,color] of [['目标来源','var(--c1)'],['前沿预印本','var(--c2)']]){const item=el('span',null,label);item.style.setProperty('--legend',color);legend.append(item);}box.append(legend);
  rowsTable($('stockData'),['分类','目标来源','前沿预印本','合计'],rows);
}
function growth(groups){
  const box=$('growthCharts');box.replaceChildren();
  const cutoffYear=Number(CONFIG.cutoff.slice(0,4)),years=Array.from({length:cutoffYear-CONFIG.start_year+1},(_,i)=>CONFIG.start_year+i),complete=CONFIG.cutoff.endsWith('-12-31');
  for(const [pool,label,clock] of [['core','目标来源',CONFIG.core_clock_label||'发表年'],['preprint','前沿预印本','首版公开年']]){
    if(filters.pool!=='all'&&filters.pool!==pool)continue;
    const panel=el('section'),max=Math.max(4,Math.ceil(Math.max(1,...groups.flatMap(g=>years.map(y=>counts(g.path,pool,y))))/4)*4),svg=svgNode('svg',{viewBox:'0 0 900 300',role:'img','aria-label':label+'年度数量，共用纵轴'});
    panel.append(el('h4',null,label+' · '+clock));
    for(let k=0;k<5;k++){const y=240-k*48;svg.append(svgNode('line',{x1:45,y1:y,x2:855,y2:y,stroke:'var(--line)'}),svgNode('text',{x:5,y:y+4},String(Math.round(max*k/4))));}
    const x=i=>years.length===1?450:65+i*770/(years.length-1);
    years.forEach((year,i)=>svg.append(svgNode('text',{x:x(i),y:274,'text-anchor':'middle'},year+(year===cutoffYear&&!complete?'*':''))));
    const legend=el('div','legend'),rows=[];
    groups.forEach((g,i)=>{
      const color=palette[i%palette.length],values=years.map(y=>counts(g.path,pool,y));
      for(let j=1;j<values.length;j++)svg.append(svgNode('line',{x1:x(j-1),y1:240-values[j-1]/max*192,x2:x(j),y2:240-values[j]/max*192,stroke:color,'stroke-width':2,'stroke-dasharray':years[j]===cutoffYear&&!complete?'5 4':''}));
      values.forEach((v,j)=>{const point=svgNode('circle',{cx:x(j),cy:240-v/max*192,r:4,fill:years[j]===cutoffYear&&!complete?'var(--s1)':color,stroke:color,'stroke-width':2});point.append(svgNode('title',{},g.label+' '+years[j]+': '+v));svg.append(point);});
      const item=el('span',null,g.label);item.style.setProperty('--legend',color);legend.append(item);
      const comparable=years.filter(y=>y<cutoffYear||complete),last=comparable.slice(-2),older=last.length===2?counts(g.path,pool,last[0]):null,newer=last.length===2?counts(g.path,pool,last[1]):null;
      rows.push([link(groupLink(g.path),g.label),...values,last.length===2?newer-older:'—',older!==null&&older>=10?((newer-older)/older*100).toFixed(1)+'%':'—']);
    });
    const chart=el('div','chart');chart.append(svg);panel.append(chart,legend);
    const path=selectedPath,undated=PAPERS.filter(p=>passing(p)&&p.pool===pool&&startsPath(p.path,path)&&!chartYear(p)).length;
    panel.append(el('p','caption',(complete?'':'* '+cutoffYear+' 年截至 '+CONFIG.cutoff.slice(5)+'，虚线／空心点；不计算全年增幅。')+(undated?' 时间未知 '+undated+' 篇，计入存量，未入年度图。':'')));
    const details=el('details'),table=el('table'),scroll=el('div','analysisResults');details.append(el('summary',null,'数据'));rowsTable(table,['分类',...years,'最近两完整年增量','增幅（前期≥10）'],rows);scroll.append(table);details.append(scroll);panel.append(details);box.append(panel);
  }
}
function explore(path){
  const nodes=pathNodes(path),node=nodes.at(-1),children=node?node.children||[]:CONFIG.taxonomy;
  if(path.length&&!nodes.length){$('exploreTitle').textContent='分类不存在';$('stockChart').replaceChildren();$('growthCharts').replaceChildren();$('stockData').replaceChildren();return;}
  if(!children.length){renderPapers(path,false);$('pageExplore').hidden=true;$('pagePapers').hidden=false;return;}
  $('exploreTitle').textContent=node?node.label:'场景';$('viewAllPapers').href=paperLink(path);
  const crumbs=$('crumbs');crumbs.replaceChildren(link('#/scenes','场景'));nodes.forEach((n,i)=>crumbs.append(' / ',link(groupLink(path.slice(0,i+1)),n.label)));
  const groups=children.map(n=>({label:n.label,path:[...path,n.id]}));stock(groups);growth(groups);
}
function facets(path,objectsOnly){
  const box=$('paperFacets');box.replaceChildren();box.hidden=false;let children=CONFIG.taxonomy;
  for(let depth=0;children.length&&(objectsOnly?depth<2:true);depth++){
    const label=el('label',null,CONFIG.level_labels?.[depth]||'细分'),select=el('select'),any=el('option',null,'全部');any.value='';select.append(any);
    for(const node of children){const o=el('option',null,node.label);o.value=node.id;select.append(o);}select.value=path[depth]||'';
    select.onchange=()=>{const next=path.slice(0,depth);if(select.value)next.push(select.value);location.hash='#/'+(objectsOnly?'objects':'methods')+'/'+next.map(encodeURIComponent).join('/');};label.append(select);box.append(label);
    const node=children.find(n=>n.id===path[depth]);if(!node)break;children=node.children||[];
  }
}
function renderPapers(path,showFacets=true,objectsOnly=false){
  $('papersTitle').textContent=query?'搜索结果':objectsOnly?'对象':mode==='methods'?'方法':labelsFor(path)||'论文';
  $('paperFacets').hidden=!showFacets||!!query;if(showFacets&&!query)facets(path,objectsOnly);
  const selected=PAPERS.filter(p=>passing(p)&&textMatches(p)&&(query||startsPath(p.path,path))),pages=Math.max(1,Math.ceil(selected.length/25));page=Math.min(page,pages-1);
  $('paperCount').textContent=selected.length.toLocaleString()+' 篇';const list=$('paperList');list.replaceChildren();
  for(const p of selected.slice(page*25,(page+1)*25)){
    const item=el('article','paper'),title=el('h3');title.append(safeLink(p.url,p.title));
    const impl={software:'软件侧',hardware:'含硬件设计'},train={none:'无新增训练',aux:'仅辅助组件',target:'目标模型'};
    item.append(title,el('p','paperMeta',[p.pool==='core'?'目标来源':'前沿预印本',p.pool==='core'?p.publication_date:p.first_public_date,impl[p.impl],train[p.training]].filter(Boolean).join(' · ')),link(groupLink(p.path),labelsFor(p.path)));
    if(p.abstract)item.append(el('p',null,p.abstract));const more=el('details');more.append(el('summary',null,'分类依据与时间来源'),el('p',null,p.classification_basis),el('p',null,p.date_source||p.window_evidence||'时间未知'));item.append(more);list.append(item);
  }
  if(!selected.length)list.append(el('p','empty','当前筛选下没有匹配论文。'));
  $('paperPage').textContent=(page+1)+' / '+pages;$('previousPage').disabled=page===0;$('nextPage').disabled=page===pages-1;
  $('previousPage').onclick=()=>{page--;renderAll();};$('nextPage').onclick=()=>{page++;renderAll();};
  const analysis=Object.values(METHOD_ANALYSES).find(a=>equalPath(a.path,path));$('analysisEntry').hidden=!analysis||!!query;
  if(analysis){$('analysisEntryLabel').textContent=analysis.entry_label||'当前方法组';$('analysisOpen').href=analysisRoute(analysis.id);$('analysisOpen').textContent=analysis.entry_title||'文献拆解';}
}
function renderAll(){
  const r=route();mode=r.mode;selectedPath=r.path;activeAnalysis=null;
  for(const id of ['pageStart','pageExplore','pagePapers','pageMethodAnalysis'])$(id).hidden=true;
  const isAnalysis=mode==='analysis'&&METHOD_ANALYSES[r.path[0]];
  $('exploreControls').hidden=mode==='start'||!!isAnalysis;$('clearSearch').hidden=!query;
  if(isAnalysis){lastBrowsePath=METHOD_ANALYSES[r.path[0]].path;$('pageMethodAnalysis').hidden=false;setNavigation('methods');renderMethodAnalysis(r.path[0]);return;}
  if(mode==='start'){setNavigation('start');$('pageStart').hidden=false;startPage();return;}
  if(mode==='objects'||mode==='methods'){lastBrowsePath=selectedPath;setNavigation(mode);}else setNavigation(mode==='scenes'||!selectedPath.length?'scenes':selectedPath.length===1?'objects':'methods');
  if(['group','papers','scenes'].includes(mode))lastBrowsePath=selectedPath;
  if(query||mode==='objects'||mode==='methods'||mode==='papers'){$('pagePapers').hidden=false;renderPapers(selectedPath,true,mode==='objects');}
  else{$('pageExplore').hidden=false;explore(selectedPath);}
}
$('navObjects').onclick=()=>{$('navObjects').href='#/objects/'+lastBrowsePath.slice(0,2).map(encodeURIComponent).join('/');};
$('navMethods').onclick=()=>{$('navMethods').href='#/methods/'+lastBrowsePath.map(encodeURIComponent).join('/');};
for(const [id,key] of [['filterImpl','impl'],['filterTrain','training'],['filterPool','pool']])$(id).onchange=()=>{filters[key]=$(id).value;page=0;renderAll();};
const enabledFields=CONFIG.filter_fields??['impl','training'];
for(const [id,key] of [['filterImplField','impl'],['filterTrainField','training']]){$(id).hidden=!enabledFields.includes(key);if($(id).hidden)filters[key]='all';}
$('search').oninput=()=>{query=$('search').value.trim();page=0;renderAll();};$('clearSearch').onclick=()=>{query='';$('search').value='';page=0;renderAll();};
$('scopeLimitations').textContent=(CONFIG.limitations||[]).join(' ');
try{const theme=localStorage.getItem('survey-theme');document.documentElement.setAttribute('data-theme',theme||((typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'));}catch{}
$('themeBtn').onclick=()=>{const next=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',next);try{localStorage.setItem('survey-theme',next);}catch{}renderAll();};
window.addEventListener('hashchange',()=>{page=0;renderAll();});renderAll();
