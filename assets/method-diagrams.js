// SVG teaching diagrams; no model execution and no inferred performance data.
function diagramEscape(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function diagramText(x,y,text,cls="",anchor="start"){
  return `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${diagramEscape(text)}</text>`;
}
function diagramLines(x,y,lines,cls="",anchor="start",gap=19){return lines.map((t,i)=>diagramText(x,y+i*gap,t,cls,anchor)).join("");}
function diagramFrame(id,title,width,height,body){
  return `<svg xmlns="http://www.w3.org/2000/svg" class="methodTeachingSVG" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">${diagramEscape(title)}</title><style>
.methodTeachingSVG text{font-family:'PingFang SC','Noto Sans CJK SC',Arial,sans-serif;font-size:12px;fill:var(--t2,#52514e)}
.methodTeachingSVG .figTitle{font-size:15px;font-weight:600;fill:var(--t1,#0b0b0b)}.methodTeachingSVG .figSmall{font-size:10.5px;fill:var(--t3,#6f6d68)}.methodTeachingSVG .figMetric{font-size:12px;font-weight:550;fill:var(--t1,#0b0b0b)}
.figPanel{fill:var(--s1,#fcfcfb);stroke:var(--line,#e1e0d9);stroke-dasharray:5 4}.figBox{fill:var(--s2,#f3f2ee);stroke:var(--line,#e1e0d9)}.figExpert{fill:var(--s1,#fcfcfb);stroke:var(--t3,#6f6d68)}.figInactive{opacity:.25}.figStep{fill:var(--acc,#2a78d6);fill-opacity:.06;stroke:var(--line,#e1e0d9)}.figArrow{stroke:var(--t3,#6f6d68);fill:none;stroke-width:1.1}
.routeA{stroke:var(--c1,#2a78d6);fill:none;stroke-width:1.8}.routeB{stroke:var(--p5,#8755b9);fill:none;stroke-width:1.8}.methodTeachingSVG .weightA{fill:var(--c1,#2a78d6);font-size:11px}.methodTeachingSVG .weightB{fill:var(--p5,#8755b9);font-size:11px}.methodTeachingSVG .weightA,.methodTeachingSVG .weightB{paint-order:stroke;stroke:var(--s1,#fcfcfb);stroke-width:4;stroke-linejoin:round}
</style><defs><marker id="${id}-arrow" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="context-stroke"/></marker></defs>${body}</svg>`;
}
function diagramRoutePanel(panel,x,y,id){
  let out=`<rect class="figPanel" x="${x}" y="${y}" width="425" height="388" rx="8"/>`;
  out+=diagramText(x+20,y+28,panel.title,"figTitle");
  const stages=panel.stages;
  for(let i=0;i<3;i++){
    const sx=x+18+i*134;
    out+=`<rect class="figStep" x="${sx}" y="${y+48}" width="122" height="58" rx="6"/>`;
    // Explicit short lines keep SVG text inside fixed boxes on every theme.
    const lines=stages[i].split("\n");
    out+=diagramLines(sx+61,y+68,lines,"","middle",16);
    if(i<2)out+=`<path class="figArrow" d="M${sx+124} ${y+77} L${sx+132} ${y+77}" marker-end="url(#${id}-arrow)"/>`;
  }
  if(panel.pool===null){
    out+=`<rect class="figBox" x="${x+95}" y="${y+150}" width="235" height="126" rx="8"/>`;
    out+=diagramLines(x+212,y+178,["保留高置信映射与共享专家","由评分分布确定池 A","弱映射 → 池内专家"],"","middle",29);
    out+=diagramText(x+212,y+301,"最终池与权重依赖架构参数和实现","figSmall","middle");
  }else{
    const tokenX=x+48,expertX=x+293,tokenY=[y+174,y+274],expertY={1:y+146,2:y+193,3:y+240,4:y+287};
    for(const r of panel.routes){
      const sy=tokenY[r.token],ty=expertY[r.expert],cls=r.token===0?"routeA":"routeB";
      out+=`<path class="${cls}" d="M${tokenX+9} ${sy} C${x+135} ${sy} ${x+194} ${ty} ${expertX-3} ${ty}" marker-end="url(#${id}-arrow)"/>`;
      if(r.weight!==null&&r.weight!==undefined){const t=r.token===0?.44:.78,u=1-t,lx=u*u*u*(tokenX+9)+3*u*u*t*(x+135)+3*u*t*t*(x+194)+t*t*t*(expertX-3),ly=sy+(ty-sy)*(3*u*t*t+t*t*t)+(r.token===0?-7:13);out+=diagramText(lx,ly,"t"+(r.token+1)+" "+Number(r.weight).toFixed(4),r.token===0?"weightA":"weightB","middle");}
    }
    tokenY.forEach((ty,i)=>{out+=`<circle cx="${tokenX}" cy="${ty}" r="7" fill="${i===0?'var(--c1,#2a78d6)':'var(--p5,#8755b9)'}"/>`;out+=diagramText(tokenX,ty+25,"Token "+(i+1),"figSmall","middle");});
    for(let e=1;e<=4;e++){
      const active=panel.pool.includes(e),cls=active?"":" figInactive";
      out+=`<g class="${cls}"><rect class="figExpert" x="${expertX}" y="${expertY[e]-13}" width="75" height="26" rx="4"/>${diagramText(expertX+37.5,expertY[e]+4,"E"+e,"","middle")}</g>`;
    }
    out+=diagramText(x+212,y+329,"保留池 {"+panel.pool.map(e=>"E"+e).join(", ")+"}","figMetric","middle");
  }
  const chars=Array.from(panel.weight_note),lines=[];for(let i=0;i<chars.length;i+=38)lines.push(chars.slice(i,i+38).join(""));
  out+=diagramLines(x+212,y+354,lines,"figSmall","middle",17);return out;
}
function methodComparisonSVG(id,spec){
  const name="method-change-"+id;
  if(spec.kind==="flow")return diagramFrame(name,spec.title,900,430,diagramFlowPanel(spec.left,12,12,name)+diagramFlowPanel(spec.right,463,12,name));
  return diagramFrame(name,spec.title,900,420,diagramRoutePanel(spec.left,12,12,name)+diagramRoutePanel(spec.right,463,12,name));
}
function diagramFlowPanel(panel,x,y,id){
  let out=`<rect class="figPanel" x="${x}" y="${y}" width="425" height="400" rx="8"/>`;
  out+=diagramText(x+18,y+28,panel.title,"figTitle");
  panel.stages.forEach((stage,i)=>{
    const sx=x+18+i*134;out+=`<rect class="figStep" x="${sx}" y="${y+48}" width="122" height="70" rx="6"/>`;
    out+=diagramLines(sx+61,y+69,stage.split("\n"),"","middle",17);
    if(i<2)out+=`<path class="figArrow" d="M${sx+124} ${y+83} L${sx+132} ${y+83}" marker-end="url(#${id}-arrow)"/>`;
  });
  (panel.rows||[]).forEach((row,i)=>{
    const sy=y+165+i*87,cls=i===0?"routeA":"routeB";
    out+=`<circle cx="${x+38}" cy="${sy+18}" r="7" fill="${i===0?'var(--c1,#2a78d6)':'var(--p5,#8755b9)'}"/>`;
    out+=diagramLines(x+38,sy+43,row.token.split("\n"),"figSmall","middle",15);
    const boxes=[[x+82,row.decision],[x+262,row.result]];
    for(const [bx,text] of boxes){out+=`<rect class="figBox" x="${bx}" y="${sy-9}" width="139" height="57" rx="6"/>`;out+=diagramLines(bx+69.5,sy+12,text.split("\n"),"","middle",18);}
    out+=`<path class="${cls}" d="M${x+48} ${sy+18} L${x+78} ${sy+18}" marker-end="url(#${id}-arrow)"/><path class="${cls}" d="M${x+225} ${sy+18} L${x+257} ${sy+18}" marker-end="url(#${id}-arrow)"/>`;
  });
  out+=diagramLines(x+212,y+359,(panel.footer||"").split("\n"),"figSmall","middle",18);return out;
}
function problemChangeSVG(spec){
  if(spec.kind==="flow")return diagramFrame("problem-change",spec.title,900,430,diagramFlowPanel(spec.left,12,12,"problem-change")+diagramFlowPanel(spec.right,463,12,"problem-change"));
  const id="problem-change";let out="";
  out+=`<rect class="figPanel" x="12" y="12" width="425" height="333" rx="8"/><rect class="figPanel" x="463" y="12" width="425" height="333" rx="8"/>`;
  out+=diagramText(32,43,"原视角：每token执行几个专家？","figTitle");
  out+=diagramText(483,43,"批级视角：整个batch触及几个专家？","figTitle");
  const tx=62,ex=285;
  for(const [i,experts] of [[0,[1,3]],[1,[2,4]]]){
    const base=83+i*105,ty=base+31;
    out+=`<rect class="figBox" x="32" y="${base-3}" width="382" height="91" rx="6"/>`;
    out+=`<circle cx="${tx}" cy="${ty}" r="7" fill="${i===0?'var(--c1,#2a78d6)':'var(--p5,#8755b9)'}"/>`;
    out+=diagramText(tx+18,ty+4,"Token "+(i+1));
    experts.forEach((e,j)=>{const ey=base+15+j*43;out+=`<path class="${i===0?'routeA':'routeB'}" d="M${tx+65} ${ty} L${ex-4} ${ey}" marker-end="url(#${id}-arrow)"/><rect class="figExpert" x="${ex}" y="${ey-13}" width="76" height="26" rx="4"/>${diagramText(ex+38,ey+4,"E"+e,"","middle")}`;});
  }
  out+=diagramText(224,318,"Token 1：k=2　 /　Token 2：k=2","figMetric","middle");
  // Only the routing body is shared; the problem panel has no method pipeline.
  const tokenX=510,tokenY=[123,238],expertX=755,expertY={1:91,2:146,3:201,4:256};
  for(const r of spec.routes)out+=`<path class="${r.token===0?'routeA':'routeB'}" d="M${tokenX+9} ${tokenY[r.token]} C610 ${tokenY[r.token]} 675 ${expertY[r.expert]} ${expertX-3} ${expertY[r.expert]}" marker-end="url(#${id}-arrow)"/>`;
  tokenY.forEach((ty,i)=>{out+=`<circle cx="${tokenX}" cy="${ty}" r="7" fill="${i===0?'var(--c1,#2a78d6)':'var(--p5,#8755b9)'}"/>`;out+=diagramText(tokenX,ty+26,"Token "+(i+1),"figSmall","middle");});
  for(let e=1;e<=4;e++)out+=`<rect class="figExpert" x="${expertX}" y="${expertY[e]-13}" width="75" height="26" rx="4"/>${diagramText(expertX+37.5,expertY[e]+4,"E"+e,"","middle")}`;
  out+=diagramText(675,300,"U_dec = 4　 /　N_dec = 4","figMetric","middle");
  out+=diagramText(675,322,"单token稀疏，并不保证batch专家并集小","figSmall","middle");
  return diagramFrame(id,spec.title,900,360,out);
}
// A common origin followed by all result panels; never infer unreported routes.
function methodCommonInputSVG(a){
  const id="common-input-"+a.id,example=a.depth.example;
  if(Array.isArray(example.input)){
    let body=`<rect class="figPanel" x="12" y="12" width="425" height="220" rx="8"/><rect class="figPanel" x="463" y="12" width="425" height="220" rx="8"/>`;
    body+=diagramText(32,43,"共同输入 · 4 个非共享专家","figTitle");
    ["E1","E2","E3","E4"].forEach((label,j)=>{body+=diagramText(133+j*80,79,label,"figSmall","middle");});
    example.input.forEach((scores,i)=>{
      const cy=113+i*53,color=i===0?"var(--c1,#2a78d6)":"var(--p5,#8755b9)";
      body+=`<circle cx="38" cy="${cy-4}" r="6" fill="${color}"/>`+diagramText(54,cy,"t"+(i+1));
      scores.forEach((v,j)=>{body+=diagramText(133+j*80,cy,v.toFixed(2),"figMetric","middle");});
    });
    body+=diagramText(32,210,"两条请求各生成一个 token；原生 k=2。","figSmall");
    body+=diagramText(483,43,"原始路由 · 归一化后权重","figTitle");
    example.original.forEach((row,i)=>{
      const y=93+i*55,color=i===0?"var(--c1,#2a78d6)":"var(--p5,#8755b9)",names=row[1].split(" + "),weights=row[2].split(" / ").map(Number);
      body+=`<circle cx="490" cy="${y+11}" r="6" fill="${color}"/>`+diagramText(490,y+36,row[0],"figSmall","middle");
      body+=`<path class="figArrow" d="M505 ${y+11} L549 ${y+11}" marker-end="url(#${id}-arrow)"/>`;
      let x=560;
      weights.forEach((w,j)=>{const width=w*300;body+=`<rect x="${x}" y="${y-2}" width="${width}" height="28" fill="${color}" fill-opacity="${j===0?.16:.07}" stroke="var(--line,#e1e0d9)"/>`+diagramText(x+width/2,y+16,names[j]+" "+w.toFixed(4),"figSmall","middle");x+=width;});
    });
    body+=diagramText(483,210,"U_dec=4（不同专家） · N_dec=4（调用次数）","figSmall");
    return diagramFrame(id,"共同输入和原始路由",900,244,body);
  }
  const input=a.figures.common_input||{title:"共同任务与处理流程",stages:["研究输入","原始处理","比较不同干预"]};
  let body=`<rect class="figPanel" x="12" y="12" width="876" height="190" rx="8"/>`;
  body+=diagramText(32,43,input.title,"figTitle");
  input.stages.forEach((stage,i)=>{
    const x=32+i*285;body+=`<rect class="figBox" x="${x}" y="68" width="266" height="94" rx="8"/>`;
    body+=diagramLines(x+133,102,stage.split("\n"),"","middle",24);
    if(i<2)body+=`<path class="figArrow" d="M${x+269} 115 L${x+280} 115" marker-end="url(#${id}-arrow)"/>`;
  });
  return diagramFrame(id,input.title,900,214,body);
}
function methodResultSVG(a,p){
  const spec=a.figures.methods[p.id],panel=spec.right,id="overview-result-"+a.id+"-"+p.id;
  return diagramFrame(id,p.short+"的处理机制",445,420,spec.kind==="flow"?diagramFlowPanel(panel,10,10,id):diagramRoutePanel(panel,10,10,id));
}
if(typeof module!=="undefined")module.exports={methodComparisonSVG,problemChangeSVG,methodCommonInputSVG,methodResultSVG};
