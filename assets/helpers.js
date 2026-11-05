const SURVEY=__SURVEY_DATA__,CONFIG=SURVEY.config,PAPERS=SURVEY.papers;
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function safeLink(url,label){
  const relative=typeof url==='string'&&/^pdfs\/[a-zA-Z0-9_./-]+$/.test(url)&&!url.split('/').includes('..');
  if(!relative&&!/^https?:\/\//i.test(url||''))return el('span',null,label);
  const a=el('a','go',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function cells(row,values){for(const value of values){const cell=el('td');cell.append(...value);row.append(cell);}}
function head(table,columns){const section=el('thead'),row=el('tr');for(const [label] of columns)row.append(el('th',null,label));section.append(row);table.append(section);}
const equalPath=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const startsPath=(a,b)=>a.length>=b.length&&b.every((v,i)=>a[i]===v);
function pathNodes(path){let children=CONFIG.taxonomy;const out=[];for(const id of path){const node=children.find(n=>n.id===id);if(!node)return [];out.push(node);children=node.children||[];}return out;}
const labelsFor=path=>pathNodes(path).map(n=>n.label).join(' / ');
const chartYear=p=>Number((p.pool==='core'?p.publication_date:p.first_public_date)?.slice(0,4))||null;
const fullYears=()=>Array.from({length:Number(CONFIG.cutoff.slice(0,4))-CONFIG.start_year},(_,i)=>CONFIG.start_year+i);
