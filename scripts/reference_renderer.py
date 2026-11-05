"""Bind project data into the complete reference HTML, retaining its renderer."""
import hashlib
import html
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]

def embed(value):
    return json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')

def bind_constant(source,name,value):
    match=re.search(r'^const '+re.escape(name)+r'\s*=\s*',source,re.M)
    if not match:raise ValueError('Reference template has no data binding: '+name)
    _,length=json.JSONDecoder().raw_decode(source[match.end():])
    return source[:match.end()]+embed(value)+source[match.end()+length:]

def start_fragment(cfg):
    esc=lambda value:html.escape(str(value),quote=True)
    groups={}
    for source in cfg['sources']:groups.setdefault(source.get('group','当前来源'),[]).append(source)
    rows=[]
    for name,sources in groups.items():
        links=''.join(f'<a class="startVenue" href="{esc(s["url"])}" title="{esc(s["reason"])}" target="_blank" rel="noopener noreferrer"><span>{esc(s["label"])}</span></a>' for s in sources)
        rows.append(f'<article class="startRow"><div class="startGroup"><h3>{esc(name)}</h3></div><div><div class="startVenues">{links}</div></div></article>')
    notes=''.join('<p>'+esc(x)+'</p>' for x in cfg.get('limitations',[]))
    return f'''<section id="pageStart"><div class="startHead"><h2>研究情况</h2><span class="startMeta">已记录 · {esc(cfg['cutoff'])}</span></div>
<div class="startFacts"><div class="startObject"><span class="startLabel">研究对象</span><strong>{esc(cfg['scope'])}</strong><p>研究取向：软件、硬件均可</p></div></div>
<section class="startSources" aria-labelledby="startVenuesTitle"><div class="startHead"><h2 id="startVenuesTitle">推荐会议与期刊</h2><span class="startMeta">本次已确认 · {len(cfg['sources'])} 个来源</span></div><div class="startLegend"><span>名称链接至官网或题录入口</span><span>来源名单不代表目录已全部筛完</span></div><div class="startRows">{''.join(rows)}</div>
<details class="startDetails"><summary>范围、覆盖与阅读说明</summary><div class="startReferences">{notes}<p><a href="reconciliation.json">两库对账</a> · <a href="screening-log.json">筛选记录</a> · <a href="papers.csv">论文CSV</a> · <a href="README.md">完整说明</a></p></div></details></section></section>
'''

def render(project,cfg,papers,analyses):
    reference=ROOT/'assets/reference/粗方向.html'
    manifest=json.loads((reference.parent/'manifest.json').read_text())
    raw=reference.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=manifest['sha256']:raise ValueError('Reference HTML differs from its recorded manifest')
    source=raw.decode('utf-8')
    records=json.loads((project/'viewer-records.json').read_text())
    hierarchy=json.loads((project/'viewer-hierarchy.json').read_text())
    if len(records)!=len(papers) or {r['paper_id'] for r in records}!={p['id'] for p in papers}:raise ValueError('Reference viewer records differ from the canonical corpus')
    for row in records:
        if not row.get('navigation_object') or not row.get('navigation_action') or not row.get('navigation_detail'):raise ValueError('Missing reference navigation: '+row['paper_id'])
    solutions={s['id']:s for s in hierarchy['solutions']}
    for row in records:
        s=solutions.get(row['navigation_detail'])
        if not s or (s['problem'],s['fine'])!=(row['navigation_object'],row['navigation_action']):raise ValueError('Invalid reference navigation: '+row['paper_id'])
    # Only project-specific bindings/text are changed. CSS and the original
    # navigation, controls, charts and paper-list implementations remain intact.
    source=re.sub(r'<title>.*?</title>','<title>'+html.escape(cfg['title'])+'</title>',source,count=1)
    source=re.sub(r'<h1>.*?</h1>','<h1>'+html.escape(cfg['title'])+'</h1>',source,count=1)
    begin=source.index('<section id="pageStart">');end=source.index('<div id="analysisControls"',begin)
    source=source[:begin]+start_fragment(cfg)+source[end:]
    source=source.replace('2024—2026',str(cfg['start_year'])+'—'+cfg['cutoff'][:4]).replace('2026.11.04',cfg['cutoff'].replace('-','.')).replace('2026 年截至 11 月 4 日','2026 年截至 11 月 5 日')
    source=source.replace('所选 20 来源','本次确认的 '+str(len(cfg['sources']))+' 来源').replace('已确认的20来源','本次确认的'+str(len(cfg['sources']))+'来源')
    source=source.replace('自回归 LLM／VLM 推理优化。','LLM与生成式VLM推理优化，包含自回归与扩散式模型。').replace('文本上下文 → 自回归文本生成','文本上下文 → 文本生成').replace('→ 自回归文本生成','→ 文本生成')
    source=source.replace('2024—2026相关arXiv',str(cfg['start_year'])+'—'+cfg['cutoff'][:4]+'相关arXiv')
    source=re.sub(r'^const ANNUAL_YEARS=.*?;', 'const ANNUAL_YEARS='+embed(list(range(cfg['start_year'],int(cfg['cutoff'][:4])+1)))+';',source,flags=re.M)
    # Generalize the reference's three-year axis without changing its visual design.
    start=source.index('function annualSVG(');stop=source.index('function renderGrowth()',start)
    annual=source[start:stop]
    annual=annual.replace('const x=i=>L+i*pw/2','const last=ANNUAL_YEARS.length-1,step=pw/Math.max(1,last);\n  const x=i=>L+i*step')
    annual=annual.replace('i<2;i++','i<last;i++').replace('i===1?', 'i===last-1?').replace('i===2?', 'i===last?').replace('row.counts[2]','row.counts[last]').replace('p.row.counts[2]','p.row.counts[last]').replace('x(2)','x(last)').replace('x:x(i)-pw/4','x:x(i)-step/2').replace('width:pw/2','width:step')
    annual=annual.replace("[['2024','n'],['2025','n'],['2026*','n']]", "ANNUAL_YEARS.map(y=>[String(y)+(y===ANNUAL_YEARS.at(-1)?'*':''),'n'])")
    annual=annual.replace("[[''+comparisonLabel()]]", "[[''+comparisonLabel()]]")
    annual=annual.replace("[[comparisonLabel()],['2024','n'],['2025','n'],['2026*','n'],['合计','n'],['25/24','n']]", "[[comparisonLabel()],...ANNUAL_YEARS.map(y=>[String(y)+(y===ANNUAL_YEARS.at(-1)?'*':''),'n']),['合计','n'],['增幅暂缓','n']]")
    annual=re.sub(r"const body=el\('tbody'\),change=counts=>\{.*?\n  \};", "const body=el('tbody'),change=counts=>'—';",annual,flags=re.S)
    source=source[:start]+annual+source[stop:]
    source=re.sub(r'function annualChange\(prev,cur\)\{[^}]*\}','function annualChange(prev,cur){return null;}',source,count=1)
    source=source.replace('25/24 为收录数量的变化','年度曲线仅描述当前库内分布；来源/年份覆盖不齐，不计算增幅。25/24 原列暂缓').replace('"25/24"','"增幅暂缓"')
    source=source.replace('topicTwoPoolFiltersV1','literatureSurveyReferenceFiltersV1')
    source=bind_constant(source,'DATA',records)
    source=bind_constant(source,'SOURCE_META',{'name':'对账后的文献库','declaredDate':cfg['cutoff'],'sha256':hashlib.sha256(embed(records).encode()).hexdigest(),'rows':len(records)})
    source=bind_constant(source,'TOPIC_START',{'date':cfg['cutoff'],'confirmed':{'research_object':cfg['scope'],'orientation':['软件','硬件']}})
    source=bind_constant(source,'HIERARCHY',hierarchy)
    scene_ids=cfg.get('reference_scene_ids',{})
    source=bind_constant(source,'COLS',[[scene_ids.get(n['id'],n['id']),n['label']] for n in cfg['taxonomy']])
    inherited=project/'inherited-analyses.json'
    source=bind_constant(source,'METHOD_ANALYSES',json.loads(inherited.read_text()) if inherited.exists() else analyses)
    # The body scopes are data explanations, not a replacement layout.
    source=source.replace('两图同尺度','两图同尺度 · 描述性收录分布')
    return source,{'renderer':'complete-reference-original','reference_sha256':manifest['sha256'],'css_sha256':hashlib.sha256(re.search(r'<style>(.*?)</style>',source,re.S).group(1).encode()).hexdigest(),'reference_css_sha256':hashlib.sha256(re.search(r'<style>(.*?)</style>',raw.decode(),re.S).group(1).encode()).hexdigest(),'papers':len(records),'adaptations':['project data bindings','project title, scope, sources and reading provenance','annual axis generalized to project years','percentage growth disabled for unequal coverage','separate local filter storage key'],'unchanged':'original CSS, navigation, controls, stock chart/table, paper list and detailed-analysis renderer'}
