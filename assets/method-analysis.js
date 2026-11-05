const METHOD_ANALYSES=__METHOD_ANALYSES__;
let activeAnalysis=null,selectedAnalysisPaper=null,lineageFocus=null,lineageMode="experiments";
const analysisRoute=id=>"#/analysis/"+encodeURIComponent(id);
function analysisLink(url,label){return safeLink(url,label);}
function analysisSVG(tag,attributes={},text){
  const node=document.createElementNS("http://www.w3.org/2000/svg",tag);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
  if(text!==undefined)node.textContent=text;return node;
}
function analysisEvidence(box,refs=[]){
  const row=el("span","analysisEvidence");
  refs.forEach((r,i)=>{if(i)row.append(" · ");row.append(analysisLink(r.url,r.locator));});
  box.append(row);
}
function analysisNodes(a){return [...a.papers,...(a.lineage?.external_nodes||[])];}
function selectAnalysisPaper(id){
  const a=METHOD_ANALYSES[activeAnalysis];if(!a)return;
  selectedAnalysisPaper=id;
  if(a.papers.some(p=>p.id===id))lineageFocus=id;
  renderAnalysisGraph(a);
}
function renderAnalysisGraph(a){
  const sv=analysisSVG,nodes=analysisNodes(a),get=id=>nodes.find(p=>p.id===id),all=a.lineage.edges;
  if(!a.papers.some(p=>p.id===lineageFocus))lineageFocus=a.papers[0].id;
  const allowed=all.filter(e=>lineageMode==="all"||e.kind!=="citation");
  const relations=allowed.filter(e=>e.from===lineageFocus||e.to===lineageFocus);
  const left=[...new Set(relations.filter(e=>e.from===lineageFocus).map(e=>e.to))],right=[...new Set(relations.filter(e=>e.to===lineageFocus).map(e=>e.from))];
  const visible=new Set([lineageFocus,...left,...right]);if(!visible.has(selectedAnalysisPaper))selectedAnalysisPaper=lineageFocus;
  const control=document.getElementById("lineageFocus");control.replaceChildren();
  for(const p of a.papers){const option=el("option",null,p.short);option.value=p.id;control.append(option);}control.value=lineageFocus;
  control.onchange=()=>{lineageFocus=control.value;selectedAnalysisPaper=lineageFocus;renderAnalysisGraph(a);};
  const mode=document.getElementById("lineageMode");mode.value=lineageMode;mode.onchange=()=>{lineageMode=mode.value;renderAnalysisGraph(a);};
  document.getElementById("lineageControlsNote").textContent="原始／简单对照："+(a.lineage.controls[lineageFocus]||"");
  document.getElementById("lineageCoverage").textContent=a.lineage.coverage_note;
  const H=Math.max(250,110+95*Math.max(left.length,right.length)),mid=H/2+20;
  const box=document.getElementById("analysisGraph");box.replaceChildren();
  const svg=sv("svg",{viewBox:`0 0 900 ${H}`,role:"group","aria-label":"选中论文的一跳实验与引用关系，可点击节点查看依据"});
  const defs=sv("defs"),marker=sv("marker",{id:"analysisArrow",viewBox:"0 0 10 10",refX:9,refY:5,markerWidth:7,markerHeight:7,orient:"auto-start-reverse"});
  marker.append(sv("path",{d:"M 0 0 L 10 5 L 0 10 z",fill:"context-stroke"}));defs.append(marker);svg.append(defs);
  const title=sv("text",{x:140,y:28,class:"columnTitle"},lineageMode==="all"?"它比较／组合／引用的工作":"它比较／组合的工作");svg.append(title);
  svg.append(sv("text",{x:450,y:28,class:"columnTitle"},"选中论文"),sv("text",{x:760,y:28,class:"columnTitle"},lineageMode==="all"?"比较／组合／引用它的工作":"拿它做对照／组合的工作"));
  const y=(i,n)=>mid+(i-(n-1)/2)*95;
  const positions=[{id:lineageFocus,x:450,y:mid,side:"focus"},...left.map((id,i)=>({id,x:140,y:y(i,left.length),side:"left"})),...right.map((id,i)=>({id,x:760,y:y(i,right.length),side:"right"}))];
  if(!left.length)svg.append(sv("text",{x:140,y:mid,class:"emptyColumn"},"未核实到论文对照，见下方原始对照"));
  if(!right.length)svg.append(sv("text",{x:760,y:mid,class:"emptyColumn"},"本轮未找到后续实验对照"));
  const grouped=new Map();for(const e of relations){const key=e.from+"/"+e.to;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(e);}
  for(const edges of grouped.values()){
    const e=edges.find(e=>e.kind==="baseline")||edges.find(e=>e.kind==="combination")||edges[0];
    const origin=e.from===lineageFocus?positions[0]:positions.find(p=>p.side==="right"&&p.id===e.from),target=e.to===lineageFocus?positions[0]:positions.find(p=>p.side==="left"&&p.id===e.to);
    const line=sv("path",{d:`M ${origin.x-85} ${origin.y} L ${target.x+85} ${target.y}`,class:"citationEdge kind-"+e.kind+(e.from===selectedAnalysisPaper||e.to===selectedAnalysisPaper?" isRelated":""),"marker-end":"url(#analysisArrow)"});
    line.append(sv("title",{},get(e.from).short+" → "+get(e.to).short+"："+edges.map(e=>e.locator).join("；")));svg.append(line);
  }
  for(const position of positions){
    const p=get(position.id),id="analysis-node-"+position.side+"-"+p.id;
    const g=sv("g",{id,class:"graphNode",transform:`translate(${position.x-85} ${position.y-35})`,role:"button",tabindex:0,"aria-label":p.short+"，查看作者及引用关系","aria-pressed":String(p.id===selectedAnalysisPaper)});
    g.append(sv("rect",{width:170,height:70,rx:10}),sv("text",{x:85,y:28},p.short),sv("text",{x:85,y:49,class:"version"},p.graph_label));
    g.onclick=()=>selectAnalysisPaper(p.id);g.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectAnalysisPaper(p.id);document.getElementById(id)?.focus();}};svg.append(g);
  }
  box.append(svg);
  const p=get(selectedAnalysisPaper),panel=document.getElementById("analysisNode");panel.replaceChildren();
  panel.append(el("h4",null,p.short),el("p",null,p.authors.join(" · ")),el("p","paperMeta",p.affiliations));
  const source=el("p","analysisLinks");source.append(analysisLink(p.external||!p.pdf_url?p.source_url:p.pdf_url+"#page=1",p.external?"论文来源":!p.pdf_url?"官方会议资料":"论文署名页"));if(p.team_url)source.append(analysisLink(p.team_url,"项目来源"));if(p.code)source.append(analysisLink(p.code.url,"官方代码 · "+p.code.status));panel.append(source);
  const edges=relations.filter(e=>e.from===p.id||e.to===p.id),list=el("div","analysisResults"),table=el("table"),body=el("tbody");
  head(table,[["关系"],["性质与上下文"],["版本／依据"]]);
  const kindLabel={baseline:"实际实验对照",citation:"仅引用",combination:"组合实验"};
  for(const e of edges){const row=el("tr");cells(row,[[get(e.from).short+" → "+get(e.to).short],[kindLabel[e.kind]+"："+e.context],[analysisLink(e.url,e.version+" · "+e.locator)]]);body.append(row);}
  if(!edges.length)list.append(el("p","caption","当前关系筛选下尚未找到；不等于没有相关工作。"));
  table.append(body);if(edges.length)list.append(table);panel.append(list);
}
function analysisDataTable(table,columns,rows){
  table.replaceChildren();head(table,columns.map(label=>[label]));const body=el("tbody");
  for(const values of rows){const row=el("tr");cells(row,values.map(value=>[value]));body.append(row);}table.append(body);return body;
}
function renderMethodDepth(a){
  const depth=a.depth;
  document.getElementById("disagreementSummary").textContent="结论分歧与成立条件 · "+depth.disagreements.length+"组";
  const comparisons=analysisDataTable(document.getElementById("analysisDisagreements"),["比较问题","原文观察","条件差异","阅读判断","尚缺的匹配证据"],depth.disagreements.map(d=>[d.topic,d.observations,d.conditions,d.judgment,d.missing]));
  depth.disagreements.forEach((d,i)=>analysisEvidence(comparisons.children[i].children[0],d.refs));
  renderMethodOverview(a);
}
function openAnalysisReading(id){
  const card=document.getElementById("reading-"+id);if(card){card.open=true;card.scrollIntoView({block:"start"});}
}
function renderMethodOverview(a){
  const routeExample=Array.isArray(a.depth.example.input);
  document.getElementById("methodOverviewTitle").textContent=routeExample?"同一输入，不同方法":"同一任务，不同干预";
  document.getElementById("methodCommonInput").innerHTML=methodCommonInputSVG(a);
  document.getElementById("methodOverviewScope").textContent=a.depth.example.note;
  const grid=document.getElementById("methodOverviewCards");grid.replaceChildren();
  for(const p of a.papers){
    const spec=a.figures.methods[p.id],example=a.depth.example.cases[p.id],mechanism=a.depth.mechanisms.find(m=>m.paper===p.id);
    const card=el("article","methodOverviewCard"+(p.role==="background"?" isBackground":""));card.id="overview-"+p.id;
    const heading=el("div","methodOverviewHeading"),button=el("button",null,p.short);button.type="button";button.onclick=()=>openAnalysisReading(p.id);
    heading.append(button,el("span",null,p.labels));card.append(heading);
    const figure=el("figure","comparisonFigure"),diagram=el("div","teachingDiagram");
    diagram.innerHTML=methodResultSVG(a,p);figure.append(diagram);
    // Only method-specific conditions remain as prose; the processing and weights are in the graph.
    figure.append(el("figcaption",null,example.setting));card.append(figure);
    const detail=el("details","overviewNotes");detail.append(el("summary",null,"条件、开销与推导"));
    const boundary=el("dl","overviewConditions");
    for(const [label,text] of [["权重与边界",mechanism.replacement],["额外开销",mechanism.overhead]])boundary.append(el("dt",null,label),el("dd",null,text));
    detail.append(boundary);
    const steps=el("ol");for(const text of example.steps)steps.append(el("li",null,text));detail.append(steps);
    const outputs=el("dl","overviewConditions");for(const row of example.output)outputs.append(el("dt",null,row[0]),el("dd",null,row[1]+"；"+row[2]));detail.append(outputs,el("p",null,example.takeaway));
    analysisEvidence(detail,[...spec.refs,...mechanism.refs,...example.refs].filter((r,i,all)=>all.findIndex(v=>v.url===r.url&&v.locator===r.locator)===i));card.append(detail);grid.append(card);
  }
}
function renderPaperDepth(content,a,p){
  const depth=a.depth.papers[p.id];
  const logic=el("details","analysisSupplement");logic.append(el("summary",null,"逻辑链 · 从已有不足到方法模块"));
  const chain=el("dl","analysisLogic");for(const item of depth.logic)chain.append(el("dt",null,item.label),el("dd",null,item.text));logic.append(chain);analysisEvidence(logic,depth.logic_refs);content.append(logic);
  const claims=el("details","analysisSupplement");claims.append(el("summary",null,"主张—证据对应 · "+depth.claims.length+"项"));
  const box=el("div","analysisResults analysisClaimTable"),table=el("table");
  const body=analysisDataTable(table,["作者主张","原文实验／证明","证据支持范围","阅读判断：尚未证明"],depth.claims.map(c=>[c.claim,c.evidence,c.supported,c.remaining]));
  depth.claims.forEach((c,i)=>analysisEvidence(body.children[i].children[1],c.refs));box.append(table);claims.append(box);content.append(claims);
}
function renderMethodAnalysis(id){
  const a=METHOD_ANALYSES[id];activeAnalysis=id;
  if(!a.papers.some(p=>p.id===selectedAnalysisPaper))selectedAnalysisPaper=a.papers[0].id;
  document.getElementById("analysisTitle").textContent=a.title;
  const levels=[["full_paper","篇全文"],["abstract_only","篇仅摘要"],["partial","篇部分阅读"],["synthetic","项合成示意（非文献阅读）"]];
  document.getElementById("analysisCount").textContent=levels.map(([key,label])=>{const count=a.papers.filter(p=>p.reading_level===key).length;return count?count+" "+label:null;}).filter(Boolean).join(" · ");
  document.getElementById("analysisScope").textContent=a.scope_note;
  for(const [button,target] of [["analysisJumpAxes","analysisAxes"],["analysisJumpReadings","analysisReadings"],["analysisJumpLineage","analysisLineage"]])document.getElementById(button).onclick=()=>document.getElementById(target).scrollIntoView({block:"start"});
  document.getElementById("problemDiagram").innerHTML=problemChangeSVG(a.figures.problem);
  document.getElementById("problemDiagramCaption").textContent=a.figures.problem.note;
  const problemEvidence=document.getElementById("problemDiagramEvidence");problemEvidence.replaceChildren();analysisEvidence(problemEvidence,a.figures.problem.refs);
  const table=document.getElementById("analysisAxesTable");table.replaceChildren();head(table,[["论文"],["贡献组合"],["问题变化"],["认知变化"],["方法变化"]]);
  const body=el("tbody"),cards=document.getElementById("analysisPaperCards");cards.replaceChildren();
  for(const p of a.papers){
    const tr=el("tr"),name=el("td"),button=el("button",null,p.short);button.type="button";
    button.onclick=()=>openAnalysisReading(p.id);name.append(button,el("small",null,p.version));tr.append(name);
    const combination=a.figures.contributions[p.id],contribution=el("td");contribution.append(el("strong",null,combination.label),el("small",null,combination.relative));analysisEvidence(contribution,combination.refs);tr.append(contribution);
    for(const key of ["problem","cognition","method"]){const cell=el("td");cell.append(el("strong",null,p.axes[key].label),p.axes[key].text);analysisEvidence(cell,p.axes[key].refs);tr.append(cell);}body.append(tr);
    const card=el("details","analysisPaper");card.id="reading-"+p.id;
    const summary=el("summary");summary.append(el("span",null,p.short),el("span",null,p.labels));card.append(summary);
    const content=el("div","readingBody");content.append(el("p",null,p.title),el("p","paperMeta",p.version+" · "+p.publication));
    const links=el("p","analysisLinks");links.append(analysisLink(p.source_url,"来源"));if(p.pdf_url)links.append(analysisLink(p.pdf_url,"全文 PDF"));if(p.local_pdf)links.append(analysisLink(p.local_pdf,"本地 PDF"));if(p.venue_url)links.append(analysisLink(p.venue_url,"会议官方目录"));if(p.code)links.append(analysisLink(p.code.url,"官方代码 · "+p.code.status));content.append(links);
    const conditions=el("dl","analysisConditions");
    for(const c of p.conditions){const d=el("div");d.append(el("dt",null,c.label),el("dd",null,c.text));conditions.append(d);}content.append(conditions);
    const overviewLink=el("button","overviewReturn","在总图中对比方法");overviewLink.type="button";overviewLink.onclick=()=>document.getElementById("overview-"+p.id)?.scrollIntoView({block:"center"});content.append(overviewLink);
    renderPaperDepth(content,a,p);
    for(const section of p.reading){content.append(el("h4",null,section.heading));for(const paragraph of section.paragraphs){const copy=el("p",null,paragraph.text);analysisEvidence(copy,paragraph.refs);content.append(copy);}}
    content.append(el("h4",null,"论文报告的结果 · 条件一并阅读"));
    const resultsBox=el("div","analysisResults"),results=el("table");head(results,[["条件"],["结果"],["解释边界"]]);const rb=el("tbody");
    for(const r of p.results){const row=el("tr");cells(row,[[r.condition],[r.value],[r.caveat]]);analysisEvidence(row.children[2],r.refs);rb.append(row);}results.append(rb);resultsBox.append(results);content.append(resultsBox);
    content.append(el("h4",null,"阅读判断与未解决的条件"));
    for(const l of p.limits){const copy=el("p",null,l.text);analysisEvidence(copy,l.refs);content.append(copy);}
    card.append(content);cards.append(card);
  }
  table.append(body);renderMethodDepth(a);
  document.getElementById("analysisGraphNote").textContent=a.lineage.graph_note;renderAnalysisGraph(a);
  const sources=document.getElementById("analysisSources");sources.replaceChildren();
  sources.append(el("p",null,a.lineage.coverage_note));
  for(const text of a.notes)sources.append(el("p",null,text));
  for(const p of a.papers){const row=el("p");row.append(el("strong",null,p.short+" · "),p.reading_scope+" ",analysisLink(p.pdf_url||p.source_url,p.version));sources.append(row);}
}
