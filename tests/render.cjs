// Render/event checks with a small DOM, not browser visual QA. No npm dependencies.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'survey-render-'));
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.hidden=false;this.style={setProperty:()=>{}};this.classList={toggle:()=>{}};this.value='';}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}
 set innerHTML(v){this.markup=v;this.children=[];}get innerHTML(){return this.markup||'';}
 set textContent(v){this.children=[String(v)];}get textContent(){return this.children.map(c=>c instanceof Element?c.textContent:c).join('');}
 setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
 scrollIntoView(){}focus(){}
}
function runExample(name){
 const output=path.join(dir,name+'.html');cp.execFileSync('python3',[path.join(root,'scripts/survey.py'),'build',path.join(root,'examples',name),'--output',output]);
 const html=fs.readFileSync(output,'utf8'),markup=html.split('<script>')[0],script=html.split('<script>')[1].split('</script>')[0];
 const nodes=new Map([...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element('div')]));
 const document={documentElement:new Element('html'),getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
 const location={hash:'#/start'},ctx=vm.createContext({console,document,location,Node:Element,window:{addEventListener:()=>{}},localStorage:{getItem:()=>null,setItem:()=>{}},matchMedia:()=>({matches:false})});
 vm.runInContext(script,ctx);
 const run=code=>vm.runInContext(code,ctx),go=hash=>{location.hash=hash;run('page=0;renderAll()');};
 assert.equal(nodes.get('pageStart').hidden,false);go('#/scenes');assert.equal(nodes.get('pageExplore').hidden,false);
 assert.ok(nodes.get('stockData').children[1].children.length>=2);
 const svgs=node=>[node.innerHTML,...node.children.filter(c=>c instanceof Element).flatMap(svgs)].filter(s=>s.startsWith('<svg'));
 if(name==='synthetic-thermal'){
  go('#/methods');assert.equal(nodes.get('paperCount').textContent,'4 篇');
  go('#/group/stationary/cooling-plate/channels');assert.equal(nodes.get('paperCount').textContent,'2 篇');
  nodes.get('navObjects').onclick();assert.equal(nodes.get('navObjects').href,'#/objects/stationary/cooling-plate');
  nodes.get('localSearch').value='synthetic:2';nodes.get('localSearch').oninput();assert.match(nodes.get('paperCount').textContent,/^0 篇/,'local search stays inside the selected branch');
  nodes.get('localSearch').value='';nodes.get('localSearch').oninput();
  nodes.get('search').value='synthetic:2';nodes.get('search').oninput();assert.match(nodes.get('paperCount').textContent,/^1 篇/,'global search crosses selected branch');
  nodes.get('clearSearch').onclick();assert.equal(nodes.get('paperCount').textContent,'2 篇');
  assert.equal(nodes.get('filterImplField').hidden,true);assert.equal(nodes.get('filterTrainField').hidden,true,'irrelevant model filters are hidden for this domain');
  assert.equal(run('chartYear(PAPERS[0])'),2024);assert.equal(run('chartYear(PAPERS[1])'),2025);
  go('#/analysis/SYNTHETIC-CHANNELS');assert.equal(nodes.get('methodOverviewCards').children.length,2);
  assert.match(nodes.get('analysisCount').textContent,/合成示意/);assert.match(nodes.get('methodCommonInput').innerHTML,/冷却板布局/);
  assert.doesNotMatch(nodes.get('methodCommonInput').innerHTML,/MoE|LLM|VLM/);
 }else{
  assert.equal(nodes.get('filterImplField').hidden,false);assert.equal(nodes.get('filterTrainField').hidden,false);
  go('#/group/text-llm/experts/skip/EX-BATCH');assert.equal(nodes.get('paperCount').textContent,'5 篇');
  assert.equal(nodes.get('analysisOpen').href,'#/analysis/EX-BATCH');go(nodes.get('analysisOpen').href);
  assert.equal(nodes.get('methodOverviewCards').children.length,5);assert.equal(svgs(nodes.get('methodOverviewCards')).length,5);
  assert.match(nodes.get('methodCommonInput').innerHTML,/0.60.*0.10.*0.25/);
  assert.ok(svgs(nodes.get('methodOverviewCards')).some(svg=>svg.includes('0.1176')));
  assert.equal(nodes.has('examplePaper'),false);
  go('#/group/image-vlm/experts/skip/MX');assert.equal(nodes.get('paperCount').textContent,'5 篇');
  go(nodes.get('analysisOpen').href);assert.equal(nodes.get('methodOverviewCards').children.length,6);
  assert.match(nodes.get('analysisCount').textContent,/5 篇全文.*1 篇仅摘要/);
  assert.match(nodes.get('methodCommonInput').innerHTML,/共同任务.*图像/);
  assert.equal(svgs(nodes.get('methodOverviewCards')).length,6);
  nodes.get('lineageFocus').value='fastmmoe';nodes.get('lineageFocus').onchange();
  assert.match(nodes.get('analysisNode').textContent,/DecoMoE → FastMMoE/);
  nodes.get('navObjects').onclick();assert.equal(nodes.get('navObjects').href,'#/objects/image-vlm/experts');
 }
 nodes.get('themeBtn').onclick();assert.equal(document.documentElement.getAttribute('data-theme'),'dark');
}
try{runExample('synthetic-thermal');runExample('inference');console.log('Generic and inference rendering, filters, navigation, search, dates, reading levels and graph events passed.');}
finally{fs.rmSync(dir,{recursive:true,force:true});}
