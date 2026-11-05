// The coarse-view reference defines composition; topic data stays configurable.
const filters={impl:'all',training:'all',pool:'all'},palette=['#2a78d6','#eb6834','#16865d','#ad7500','#8755b9','#be466e','#128c9a','#73674a','#5a6da0'];
let query='',localQuery='',page=0,selectedPath=[],lastBrowsePath=[],mode='start',lastRoute='';
const $=id=>document.getElementById(id),groupLink=path=>'#/group/'+path.map(encodeURIComponent).join('/'),paperLink=path=>'#/papers/'+path.map(encodeURIComponent).join('/');
const passing=p=>Object.entries(filters).every(([k,v])=>v==='all'||(v==='unknown'?p[k]==null:p[k]===v));
const textMatches=(p,q=query)=>!q||[p.title,p.abstract,p.summary,p.classification_basis,p.object_tag,p.id,...(p.tags||[]),...Object.values(p.identifiers||{})].join(' ').toLocaleLowerCase().includes(q.toLocaleLowerCase());
function rowsTable(table,columns,rows){table.replaceChildren();head(table,columns.map(v=>[v]));const body=el('tbody');for(const values of rows){const row=el('tr');cells(row,values.map(v=>[v]));body.append(row);}table.append(body);}
function route(){const parts=(location.hash||'#/start').replace(/^#\//,'').split('/');try{return{mode:parts[0]==='coarse'?'scenes':parts[0]==='browse'?'methods':parts[0],path:parts.slice(1).filter(x=>x&&x!=='all').map(decodeURIComponent)};}catch{return{mode:'start',path:[]};}}
function link(url,text){const a=el('a','go',text);a.href=url;a.onclick=()=>{query='';localQuery='';$('search').value='';};return a;}
function setNavigation(name){for(const[id,m]of[['navStart','start'],['navScenes','scenes'],['navObjects','objects'],['navMethods','methods']])$(id).setAttribute('aria-current',name===m?'page':'false');}
function startPage(){
 $('scopeTitle').textContent=CONFIG.scope;$('observation').textContent=`截至 ${CONFIG.cutoff}`;
 $('startProgress').textContent=`${PAPERS.length} 篇已收录文献 · ${SURVEY.proposal?'含待确认分类预览':'分类与阅读进度见正文记录'}`;
 $('sourceCount').textContent=CONFIG.sources.length+' 个当前来源';const box=$('sourceList');box.replaceChildren();const groups=new Map();
 for(const source of CONFIG.sources){const key=source.group||'当前来源';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(source);}
 for(const[label,sources]of groups){const row=el('article','startRow'),left=el('div','startGroup'),right=el('div','startVenues');left.append(el('h3',null,label));for(const s of sources){const a=safeLink(s.url,s.label);a.className='startVenue';a.title=s.reason;right.append(a);}row.append(left,right);box.append(row);}
 if(!CONFIG.sources.length)box.append(el('p','caption','来源尚未选择。'));
 const limits=$('startLimits');limits.replaceChildren();for(const note of CONFIG.limitations||[])limits.append(el('p',null,note));
 const table=$('coverageTable');table.replaceChildren();if(SURVEY.coverage?.sources){const t=el('table');rowsTable(t,['来源','当前收录','覆盖说明'],SURVEY.coverage.sources.map(s=>[safeLink(s.url,s.label),s.included,s.note||'检索与筛选情况见覆盖文件']));table.append(t);}
 const dl=$('downloads');dl.replaceChildren();for(const f of SURVEY.downloads||[]){const a=el('a','go',f.label);a.href=f.path;dl.append(a,'　');}
}
function svgNode(tag,attrs={},text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
function counts(path,pool,year){return PAPERS.filter(p=>passing(p)&&startsPath(p.path,path)&&(!pool||p.pool===pool)&&(!year||chartYear(p)===year)).length;}
function legendItem(label,color){const item=el('span'),sw=el('b');sw.style.background=color;item.append(sw,label);return item;}
function groupName(path){return CONFIG.level_labels?.[path.length]||'细分';}
function stock(groups){
 const box=$('stockChart'),legend=$('stockLegend');box.replaceChildren();legend.replaceChildren();const max=Math.max(1,...groups.map(g=>counts(g.path))),rows=[];
 for(const g of groups){const a=link(groupLink(g.path),g.label),row=el('div','srow'),segs=el('div','segs'),core=counts(g.path,'core'),preprint=counts(g.path,'preprint'),total=core+preprint;segs.style.width=(total/max*100)+'%';
  for(const[n,color,name]of[[core,'var(--pub)','目标会议期刊'],[preprint,'var(--arx)','前沿预印本']])if(n){const seg=el('i');seg.style.flex=n;seg.style.background=color;seg.title=g.label+' · '+name+' '+n+' 篇';segs.append(seg);}row.append(segs,el('span','tot',total));box.append(a,row);rows.push([link(groupLink(g.path),g.label),core,preprint,total]);}
 legend.append(legendItem('目标会议期刊','var(--pub)'),legendItem('前沿预印本','var(--arx)'));rowsTable($('stockData'),[groupName(selectedPath),'目标会议期刊','前沿预印本','合计'],rows);
}
function growth(groups){
 const box=$('growthCharts');box.replaceChildren();const policy=CONFIG.statistics||{},disabled=policy.annual_trend==='disabled',comparable=policy.annual_trend==='comparable';
 const cutoffYear=Number(CONFIG.cutoff.slice(0,4)),years=Array.from({length:cutoffYear-CONFIG.start_year+1},(_,i)=>CONFIG.start_year+i),complete=CONFIG.cutoff.endsWith('-12-31');
 const pools=[['core','目标会议期刊',CONFIG.core_clock_label||'发表年'],['preprint','预印本','首版公开年']].filter(([p])=>filters.pool==='all'||filters.pool===p);
 const max=Math.max(4,Math.ceil(Math.max(1,...pools.flatMap(([pool])=>groups.flatMap(g=>years.map(y=>counts(g.path,pool,y)))))/4)*4);
 box.className='annualGrowthGrid'+(pools.length===1?' singlePool':'');$('growthCaption').textContent=disabled?'年度比较暂缓':'两图同尺度';
 for(const[pool,label,clock]of pools){const panel=el('section','figure annualFigure'),heading=el('div','annualHeading'),titles=el('div');titles.append(el('h4',null,label),el('p',null,(pool==='preprint'?'当前未匹配正式版本 · ':'')+'按'+clock));const total=disabled?counts(selectedPath,pool):groups.reduce((sum,g)=>sum+years.reduce((n,y)=>n+counts(g.path,pool,y),0),0);heading.append(titles,el('strong',null,total.toLocaleString()+' 篇'));panel.append(heading);
  if(disabled){panel.append(el('p','trendUnavailable',policy.reason||'来源/年份筛选深度尚未对齐；年度图与增幅暂缓。'));box.append(panel);continue;}
  const plot=el('div','annualPlot'),svg=svgNode('svg',{viewBox:'0 0 480 240',role:'img','aria-label':label+'年度收录数量，两图同尺度'}),legend=el('div','annualLegend'),rows=[];
  for(let k=0;k<5;k++){const y=185-k*38;svg.append(svgNode('line',{x1:38,y1:y,x2:446,y2:y,stroke:'var(--line)'}),svgNode('text',{x:4,y:y+4},String(Math.round(max*k/4))));}
  const x=i=>years.length===1?240:50+i*380/(years.length-1);years.forEach((year,i)=>svg.append(svgNode('text',{x:x(i),y:220,'text-anchor':'middle'},year+(year===cutoffYear&&!complete?'*':''))));const last=years.filter(y=>y<cutoffYear||complete).slice(-2);
  groups.forEach((g,i)=>{const color=palette[i%palette.length],values=years.map(y=>counts(g.path,pool,y));for(let j=1;j<values.length;j++)svg.append(svgNode('line',{x1:x(j-1),y1:185-values[j-1]/max*152,x2:x(j),y2:185-values[j]/max*152,stroke:color,'stroke-width':2,'stroke-dasharray':years[j]===cutoffYear&&!complete?'5 4':''}));values.forEach((v,j)=>{const point=svgNode('circle',{cx:x(j),cy:185-v/max*152,r:3,fill:years[j]===cutoffYear&&!complete?'var(--s1)':color,stroke:color,'stroke-width':2});point.append(svgNode('title',{},g.label+' '+years[j]+': '+v));svg.append(point);});legend.append(legendItem(g.label,color));const prior=last.length===2?counts(g.path,pool,last[0]):null,current=last.length===2?counts(g.path,pool,last[1]):null;rows.push([link(groupLink(g.path),g.label),...values,values.reduce((a,b)=>a+b,0),...(comparable?[prior!==null&&prior>=10?((current-prior)/prior*100).toFixed(1)+'%':prior===0?'零基数':prior===null?'—':'小基数']:[])]);});
  plot.append(svg);panel.append(plot,legend);const card=el('div','card'),table=el('table');rowsTable(table,[groupName(selectedPath),...years.map(y=>String(y)+(y===cutoffYear&&!complete?'*':'')),'合计',...(comparable?[last.length===2?String(last[1]).slice(-2)+'/'+String(last[0]).slice(-2):'增幅']:[])],rows);card.append(table);panel.append(card);box.append(panel);
 }
 const undated=PAPERS.filter(p=>passing(p)&&startsPath(p.path,selectedPath)&&!chartYear(p)).length;
 $('growthNote').textContent=(disabled?'':complete?'':`* ${cutoffYear} 年截至 ${CONFIG.cutoff.slice(5)}，虚线与空心点表示未完整年度；不计算全年增幅。`)+(comparable?'':' '+(policy.reason||'仅展示库内年度收录分布，不据此判断领域增长。'))+(undated?' 时间未知 '+undated+' 篇计入存量，未入年度图。':'');
}
function renderCrumbs(path){const box=$('crumbs');box.replaceChildren(link('#/coarse','场景'));pathNodes(path).forEach((n,i)=>box.append(' / ',link(groupLink(path.slice(0,i+1)),n.label)));box.hidden=false;}
function explore(path){
 const nodes=pathNodes(path),node=nodes.at(-1),children=node?node.children||[]:CONFIG.taxonomy;
 if(path.length&&!nodes.length){$('exploreTitle').textContent='分类不存在';$('stockChart').replaceChildren();$('stockData').replaceChildren();$('growthCharts').replaceChildren();return;}
 if(!children.length){renderPapers(path,false);$('pageExplore').hidden=true;$('pagePapers').hidden=false;return;}
 $('exploreTitle').textContent=node?node.label+' · '+groupName(path):'场景';$('viewAllPapers').textContent='查看论文 · '+counts(path).toLocaleString()+' 篇';$('viewAllPapers').href=paperLink(path);renderCrumbs(path);$('stockCaption').textContent='每篇一条主路径 · 当前库内收录';const groups=children.map(n=>({label:n.label,path:[...path,n.id]}));stock(groups);growth(groups);
 const direct=PAPERS.filter(p=>passing(p)&&equalPath(p.path,path));$('referenceNote').hidden=!direct.length;$('referenceNote').replaceChildren();if(direct.length)$('referenceNote').append(el('span',null,'另有 '+direct.length+' 篇评测/建模参考，保留在父组且不计入上述方法分组。 '),link(paperLink(path),'查看本组全部论文'));
 const notes=$('currentTaxonomy');notes.replaceChildren();const table=el('table');rowsTable(table,[groupName(path),'分类边界'],children.map(n=>[n.label,n.definition||'边界见逐篇分类依据']));notes.append(table);
}
function facets(path,objectsOnly){
 const box=$('paperFacets');box.replaceChildren();box.hidden=false;let children=CONFIG.taxonomy;
 for(let depth=0;children.length&&(objectsOnly?depth<2:true);depth++){const label=el('label',null,CONFIG.level_labels?.[depth]||'细分'),select=el('select'),any=el('option',null,'全部');any.value='';select.append(any);select.setAttribute('aria-label','筛选'+(CONFIG.level_labels?.[depth]||'细分'));for(const node of children){const option=el('option',null,node.label);option.value=node.id;select.append(option);}select.value=path[depth]||'';select.onchange=()=>{const next=path.slice(0,depth);if(select.value)next.push(select.value);query='';location.hash='#/'+(objectsOnly?'objects':mode==='papers'?'papers':'methods')+'/'+next.map(encodeURIComponent).join('/');};label.append(select);box.append(label);const node=children.find(n=>n.id===path[depth]);if(!node)break;children=node.children||[];}
}
function renderPapers(path,showFacets=true,objectsOnly=false){
 const global=!!query,q=global?query:localQuery,base=PAPERS.filter(p=>passing(p)&&(global||startsPath(p.path,path))),selected=base.filter(p=>textMatches(p,q)),pages=Math.max(1,Math.ceil(selected.length/25));page=Math.min(page,pages-1);
 $('papersTitle').textContent=global?'搜索结果':objectsOnly?'对象':mode==='methods'?'方法':labelsFor(path)||'论文';$('paperFacets').hidden=!showFacets||global;if(showFacets&&!global)facets(path,objectsOnly);$('paperCount').textContent=selected.length.toLocaleString()+' 篇'+(q?' / 当前范围 '+base.length+' 篇':'');$('localPaperSearch').hidden=global;$('localSearch').value=localQuery;
 const nodes=pathNodes(path),node=nodes.at(-1);$('methodDefinition').textContent=global?'全部场景 · 沿用上方筛选':node?.definition||(!node?.children?.length&&path.length?'当前分支的已收录论文；尚未完成的细分不补造。':'');
 const list=$('paperList');list.replaceChildren();for(const p of selected.slice(page*25,(page+1)*25)){const item=el('article','paperItem'),title=el('h3');title.append(safeLink(p.url,p.title));const source=p.pool==='core'?(CONFIG.sources.find(s=>s.id===p.source_id)?.label||p.source_id):'预印本';item.append(title,el('p','paperMeta',[source,p.pool==='core'?p.publication_date:p.first_public_date].filter(Boolean).join(' · ')),link(groupLink(p.path),labelsFor(p.path)),el('p','paperMeta',[{software:'软件侧优化',hardware:'含硬件设计'}[p.impl]||'实现路径待核',{none:'无新增训练',aux:'仅辅助组件',target:'目标模型'}[p.training]||'训练要求待核',p.study_type==='evaluation'?'评测/建模参考':''].filter(Boolean).join(' · ')));
  const more=el('details');more.append(el('summary',null,'摘要与归属依据'));if(p.summary)more.append(el('p','paperAbstract',p.summary));else if(p.abstract)more.append(el('p','paperAbstract',p.abstract));more.append(el('p','evidence',p.classification_basis),el('p','evidence','阅读范围：'+(p.reading_scope||'以实际记录为准；未标为全文精读')));for(const u of [...new Set([p.url,p.date_source,...(p.evidence_urls||[])].filter(Boolean))])if(/^https?:/.test(u)){const row=el('p','evidence');row.append(safeLink(u,u));more.append(row);}item.append(more);list.append(item);}
 if(!selected.length)list.append(el('p','caption','当前筛选下没有匹配论文。'));$('paperPage').textContent=(page+1)+' / '+pages;$('previousPage').disabled=page===0;$('nextPage').disabled=page===pages-1;$('previousPage').onclick=()=>{page--;renderAll();};$('nextPage').onclick=()=>{page++;renderAll();};
 const analysis=Object.values(METHOD_ANALYSES).find(a=>equalPath(a.path,path));$('analysisEntry').hidden=!analysis||global;if(analysis){$('analysisEntryLabel').textContent=analysis.entry_label||'当前方法组';$('analysisOpen').href=analysisRoute(analysis.id);$('analysisOpen').textContent=analysis.entry_title||'全文拆解';}
}
function renderAll(){
 const r=route();mode=r.mode;selectedPath=r.path;activeAnalysis=null;if(location.hash!==lastRoute){query='';localQuery='';$('search').value='';lastRoute=location.hash;}
 for(const id of['pageStart','pageExplore','pagePapers','pageMethodAnalysis'])$(id).hidden=true;const isAnalysis=mode==='analysis'&&METHOD_ANALYSES[r.path[0]];
 $('exploreControls').hidden=mode==='start'||!!isAnalysis;$('clearSearch').hidden=!query;$('crumbs').hidden=mode==='start';$('snapshotCaption').hidden=mode==='start';$('snapshotCaption').textContent=CONFIG.start_year+'—'+CONFIG.cutoff.slice(0,4)+' · 数据截至 '+CONFIG.cutoff;
 $('viewStatus').hidden=!SURVEY.proposal||mode==='start'||!!isAnalysis;$('viewStatus').textContent=SURVEY.proposal?.label||'待确认分类预览';
 if(isAnalysis){lastBrowsePath=METHOD_ANALYSES[r.path[0]].path;$('pageMethodAnalysis').hidden=false;setNavigation('methods');renderMethodAnalysis(r.path[0]);return;}if(mode==='start'){setNavigation('start');$('pageStart').hidden=false;startPage();return;}
 if(['group','papers','scenes','objects','methods'].includes(mode))lastBrowsePath=selectedPath;setNavigation(mode==='objects'?'objects':mode==='methods'||mode==='papers'?'methods':selectedPath.length===0?'scenes':selectedPath.length===1?'objects':'methods');$('globalSearchBar').hidden=['objects','methods','papers'].includes(mode);renderCrumbs(selectedPath);
 if(query||['objects','methods','papers'].includes(mode)){$('pagePapers').hidden=false;renderPapers(selectedPath,true,mode==='objects');}else{$('pageExplore').hidden=false;explore(selectedPath);}
}
function radioFilters(target,key,options){const box=$(target);box.replaceChildren();for(const[value,label]of[['all','全部'],...options]){const chip=el('label','chip'),input=el('input');input.type='radio';input.name=key;input.value=value;input.checked=filters[key]===value;chip.setAttribute('data-selected',input.checked?'true':'false');input.setAttribute('aria-label',label);input.onchange=()=>{filters[key]=value;page=0;radioFilters(target,key,options);renderAll();};chip.append(input,label);box.append(chip);}}
radioFilters('implChips','impl',[['software','软件侧优化'],['hardware','含硬件设计']]);radioFilters('trainChips','training',[['none','无新增训练'],['aux','仅辅助组件'],['target','目标模型']]);
const enabledFields=CONFIG.filter_fields??['impl','training'];for(const[id,key]of[['filterImplField','impl'],['filterTrainField','training']])$(id).hidden=!enabledFields.includes(key);
$('filterPool').onchange=()=>{filters.pool=$('filterPool').value;page=0;renderAll();};$('navObjects').onclick=()=>{$('navObjects').href='#/objects/'+lastBrowsePath.slice(0,2).map(encodeURIComponent).join('/');};$('navMethods').onclick=()=>{$('navMethods').href='#/methods/'+lastBrowsePath.map(encodeURIComponent).join('/');};
$('search').oninput=()=>{query=$('search').value.trim();page=0;renderAll();};$('clearSearch').onclick=()=>{query='';$('search').value='';page=0;renderAll();};$('localSearch').oninput=()=>{localQuery=$('localSearch').value.trim();page=0;renderAll();};
$('scopeLimitations').textContent=(CONFIG.limitations||[]).join(' ');$('countingNote').textContent='每篇一条主统计路径，其他贡献作标签；未知属性仅随“全部”计入，不默认无新增训练。评测与建模可作为父组参考单列。';
try{const theme=localStorage.getItem('survey-theme');document.documentElement.setAttribute('data-theme',theme||((typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'));}catch{}
$('themeBtn').onclick=()=>{const next=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',next);try{localStorage.setItem('survey-theme',next);}catch{}renderAll();};window.addEventListener('hashchange',()=>{page=0;renderAll();});renderAll();
