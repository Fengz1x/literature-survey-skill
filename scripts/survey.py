#!/usr/bin/env python3
"""Portable local survey project helper. Python 3.10+, standard library only."""
import argparse
from copy import deepcopy
from datetime import date
import hashlib
import html
import importlib.util
import json
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import urlparse

SKILL = Path(__file__).resolve().parents[1]

def completion_report(project, cfg=None, papers=None):
    spec = importlib.util.spec_from_file_location('survey_completion', SKILL/'scripts/completion.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.audit(project, cfg, papers)

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def embed(value):
    # Data cannot terminate an inline script or become HTML markup.
    return json.dumps(value, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')

def date_floor(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}(?:-\d{2}(?:-\d{2})?)?', value):
        raise ValueError('date must be YYYY, YYYY-MM or YYYY-MM-DD')
    parts = list(map(int, value.split('-')))
    return date(*(parts + [1] * (3 - len(parts))))

def safe_url(value):
    return isinstance(value, str) and urlparse(value).scheme in ('https', 'http') and bool(urlparse(value).netloc)

def taxonomy_paths(nodes, prefix=()):
    paths = {}
    for node in nodes:
        key = prefix + (node['id'],)
        if key in paths:
            raise ValueError('duplicate taxonomy path')
        paths[key] = node
        descendants = taxonomy_paths(node.get('children', []), key)
        if paths.keys() & descendants.keys():
            raise ValueError('duplicate taxonomy path')
        paths.update(descendants)
    return paths

def proposal_errors(project, cfg, papers):
    """Preview classifications without treating a proposal as a user decision."""
    file = project / 'taxonomy-proposal.json'
    if not file.exists():
        return []
    errors = []
    try:
        proposal = read(file)
        if proposal.get('status') != 'pending_user_confirmation':
            errors.append('taxonomy proposal must be pending; confirmed classifications belong in project/papers')
        paths = taxonomy_paths(proposal['taxonomy'])
        known = {p['id']: p for p in papers}
        assigned = {}
        for row in proposal['assignments']:
            pid, path = row['paper_id'], tuple(row['path'])
            if pid not in known or pid in assigned:
                errors.append('unknown/duplicate proposal assignment: ' + pid)
            if path not in paths or paths[path].get('children'):
                errors.append('proposal assignment must use a leaf: ' + pid)
            if pid in known and path[:1] != tuple(known[pid]['path'][:1]):
                errors.append('proposal must preserve the confirmed main scene: ' + pid)
            assigned[pid] = path
        references = proposal.get('reference_ids', [])
        if len(set(references)) != len(references) or not set(references) <= set(known):
            errors.append('unknown/duplicate proposal reference IDs')
        if set(references) & set(assigned):
            errors.append('a proposal reference cannot also be a method assignment')
        for pid in set(references) & set(known):
            if known[pid].get('study_type') != 'evaluation':
                errors.append('only evaluation/modeling papers may remain as proposal references: ' + pid)
        for p in papers:
            path = assigned.get(p['id'], tuple(p['path']))
            if path not in paths:
                errors.append('proposal loses an existing path: ' + p['id'])
            elif paths[path].get('children') and p['id'] not in references:
                errors.append('proposal leaves an unclassified method at a parent: ' + p['id'])
        if not proposal.get('label') or not proposal.get('basis'):
            errors.append('proposal needs a visible label and classification basis')
    except (KeyError, TypeError, ValueError) as exc:
        errors.append('taxonomy proposal: ' + str(exc))
    return errors

def view_data(project, cfg, papers):
    """Construct a display projection; never write over confirmed source data."""
    data = {'config': deepcopy(cfg), 'papers': deepcopy(papers)}
    proposal_file = project / 'taxonomy-proposal.json'
    if proposal_file.exists():
        proposal = read(proposal_file)
        data['proposal'] = {k: proposal[k] for k in ('status', 'label', 'basis')}
        data['config']['taxonomy'] = proposal['taxonomy']
        assignments = {a['paper_id']: a['path'] for a in proposal['assignments']}
        for p in data['papers']:
            if p['id'] in assignments:
                p['confirmed_path'] = p['path']
                p['path'] = assignments[p['id']]
    if (project / 'coverage.json').exists():
        data['coverage'] = read(project / 'coverage.json')
    candidates = [('papers.csv', '论文 CSV'), ('coverage.csv', '覆盖 CSV'), ('README.md', '范围与阅读说明'), ('taxonomy-proposal.json', '分类提案 JSON'), ('文本分组提案.md', '文本分组提案')]
    data['downloads'] = [{'path': path, 'label': label} for path, label in candidates if (project / path).is_file()]
    return data

def validate(project):
    cfg = read(project / 'project.json')
    papers = read(project / 'papers.json')
    analyses = read(project / 'analyses.json')
    errors = []
    def require(ok, message):
        if not ok:
            errors.append(message)
    try:
        cutoff = date.fromisoformat(cfg['cutoff'])
        start = int(cfg['start_year'])
        require(start <= cutoff.year, 'start_year exceeds cutoff')
        paths = taxonomy_paths(cfg['taxonomy'])
    except (KeyError, ValueError, TypeError) as exc:
        return [f'project configuration: {exc}']
    require(bool(cfg.get('scope')), 'scope is required')
    statistics = cfg.get('statistics', {})
    require(statistics.get('annual_trend', 'descriptive') in ('disabled', 'descriptive', 'comparable'), 'annual trend policy')
    if statistics.get('annual_trend') in ('disabled', 'comparable'):
        require(bool(statistics.get('reason')), 'annual trend policy needs a reason')
    sources = cfg.get('sources', [])
    source_ids = {s['id'] for s in sources}
    require(len(source_ids) == len(sources), 'duplicate source IDs')
    for source in sources:
        require(safe_url(source.get('url')), 'source URL: ' + source['id'])
        require(bool(source.get('tracks')) and bool(source.get('reason')), 'source tracks/reason: ' + source['id'])
    ids = set()
    for paper in papers:
        pid = paper.get('id', '<missing>')
        require(pid not in ids, 'duplicate paper ID: ' + pid)
        ids.add(pid)
        require(bool(paper.get('id')) and bool(paper.get('title')), 'missing identity/title: ' + pid)
        require(safe_url(paper.get('url')), 'paper source URL: ' + pid)
        require(paper.get('pool') in ('core', 'preprint'), 'pool: ' + pid)
        require(paper.get('impl') in ('software', 'hardware', None), 'implementation: ' + pid)
        require(paper.get('training') in ('none', 'aux', 'target', None), 'training: ' + pid)
        path = tuple(paper.get('path', []))
        require(path in paths and not paths[path].get('children'), 'paper must have one leaf path: ' + pid)
        require(bool(paper.get('classification_basis')), 'classification basis: ' + pid)
        if paper.get('pool') == 'core':
            require(paper.get('source_id') in source_ids, 'unconfirmed target source: ' + pid)
        elif paper.get('known_formal_publication'):
            errors.append('known formal work cannot be placed in preprints: ' + pid)
        key = 'publication_date' if paper.get('pool') == 'core' else 'first_public_date'
        value = paper.get(key)
        if value:
            try:
                d = date_floor(value)
                require(start <= d.year and d <= cutoff, 'outside observation window: ' + pid)
                require(bool(paper.get('date_source')), 'date source: ' + pid)
            except ValueError as exc:
                errors.append(f'{pid}: {exc}')
        else:
            require(bool(paper.get('window_evidence')), 'unknown date needs evidence of window membership: ' + pid)
    if all(p.get('id') and p.get('title') for p in papers):
        merged, _ = dedupe(papers)
        require(len(merged) == len(papers), 'unresolved duplicate entities: run dedupe and inspect the conflict log')
    for key, analysis in analyses.items():
        require(key == analysis.get('id'), 'analysis ID mismatch: ' + key)
        require(tuple(analysis.get('path', [])) in paths, 'analysis path: ' + key)
        ps = analysis.get('papers', [])
        local_ids = {p['id'] for p in ps}
        require(bool(ps) and len(local_ids) == len(ps), 'analysis papers empty/duplicate: ' + key)
        method_ids = {p['paper_id'] for p in ps if p.get('role') != 'background'}
        expected = {p['id'] for p in papers if p['path'][:len(analysis['path'])] == analysis['path']}
        require(method_ids == expected, 'analysis coverage differs from selected group: ' + key)
        for field in ('title', 'scope_note'):
            require(bool(analysis.get(field)), 'analysis ' + field + ': ' + key)
        require(isinstance(analysis.get('notes'), list), 'analysis notes: ' + key)
        depth = analysis.get('depth', {})
        require(set(depth.get('papers', {})) == local_ids, 'logic/claim coverage: ' + key)
        require({m.get('paper') for m in depth.get('mechanisms', [])} == local_ids, 'mechanism coverage: ' + key)
        require(set(depth.get('example', {}).get('cases', {})) == local_ids, 'teaching example coverage: ' + key)
        require(isinstance(depth.get('disagreements'), list), 'conditional comparisons: ' + key)
        require(set(analysis.get('figures', {}).get('methods', {})) == local_ids, 'figure coverage: ' + key)
        require(set(analysis.get('figures', {}).get('contributions', {})) == local_ids, 'contribution coverage: ' + key)
        if not isinstance(depth.get('example', {}).get('input'), list):
            common = analysis.get('figures', {}).get('common_input', {})
            require(bool(common.get('title')) and len(common.get('stages', [])) == 3, 'generic common input: ' + key)
        hashes = {p['id']: p.get('pdf_sha256') for p in ps}
        for field in ('depth', 'figures'):
            require(analysis.get(field, {}).get('source_pdf_sha256') == hashes, field + ' PDF binding: ' + key)
        for paper in ps:
            pid = paper['id']
            require(paper['paper_id'] in ids, 'analysis paper not in corpus: ' + pid)
            for field in ('conditions','reading','results','limits','authors'):
                require(isinstance(paper.get(field), list), 'paper list field ' + field + ': ' + pid)
            for field in ('short','title','source_url','version','publication','labels','affiliations','graph_label'):
                require(bool(paper.get(field)), 'paper metadata ' + field + ': ' + pid)

            require(paper.get('reading_level') in ('full_paper', 'abstract_only', 'partial') or (analysis.get('is_synthetic') is True and paper.get('reading_level') == 'synthetic'), 'reading level: ' + pid)
            require(bool(paper.get('reading_scope')), 'actual reading scope: ' + pid)
            if paper.get('reading_level') == 'full_paper':
                require(bool(re.fullmatch(r'[a-f0-9]{64}', paper.get('pdf_sha256') or '')), 'full read PDF hash: ' + pid)
            local = paper.get('local_pdf')
            if local:
                target = (project / local).resolve()
                require(target.is_relative_to(project.resolve()), 'PDF path leaves project: ' + pid)
                if target.is_file():
                    require(hashlib.sha256(target.read_bytes()).hexdigest() == paper.get('pdf_sha256'), 'local PDF hash mismatch: ' + pid)
                else:
                    errors.append('missing local PDF; remove local_pdf when not bundled: ' + pid)
            for axis in ('problem', 'cognition', 'method'):
                record = paper.get('axes', {}).get(axis, {})
                require(bool(record.get('text')) and bool(record.get('refs')), 'axis evidence: ' + pid + '/' + axis)
            for row in paper.get('results', []) + paper.get('limits', []):
                require(bool(row.get('refs')), 'unanchored result/limit: ' + pid)
            spec = analysis.get('figures', {}).get('methods', {}).get(pid, {})
            require(bool(spec.get('refs')), 'diagram evidence: ' + pid)
            for side in ('left', 'right'):
                panel = spec.get(side, {})
                require(len(panel.get('stages', [])) == 3, 'diagram requires three display stages: ' + pid)
                for route in panel.get('routes', []):
                    require(route.get('expert') in (panel.get('pool') or []), 'route outside displayed pool: ' + pid)
        lineage = analysis.get('lineage', {})
        external_ids = [n['id'] for n in lineage.get('external_nodes', [])]
        require(len(set(external_ids)) == len(external_ids) and not local_ids.intersection(external_ids), 'duplicate/colliding external graph IDs: ' + key)
        nodes = local_ids | set(external_ids)
        seen = set()
        for edge in lineage.get('edges', []):
            triple = (edge['from'], edge['to'], edge['kind'])
            require(edge['from'] in nodes and edge['to'] in nodes, 'graph endpoint: ' + str(triple))
            require(edge['kind'] in ('baseline', 'combination', 'citation'), 'graph kind: ' + str(triple))
            require(triple not in seen, 'duplicate graph edge: ' + str(triple))
            seen.add(triple)
            require(bool(edge.get('locator')) and safe_url(edge.get('url')), 'graph evidence: ' + str(triple))
        require(bool(lineage.get('coverage_note')), 'lineage coverage statement: ' + key)
    errors.extend(proposal_errors(project, cfg, papers))
    return errors

def initialize(path, title, scope, start_year, cutoff):
    if path.exists() and any(path.iterdir()):
        raise ValueError('refusing to initialize a nonempty project')
    path.mkdir(parents=True, exist_ok=True)
    date.fromisoformat(cutoff)
    write(path / 'project.json', {'schema_version': 1, 'title': title, 'scope': scope, 'start_year': start_year, 'cutoff': cutoff, 'sources': [], 'taxonomy': [], 'filter_fields': [], 'limitations': [], 'level_labels': ['场景', '对象', '方法', '细分'], 'collection': {'mode': 'full_scope', 'rules_version': 'v1', 'include_preprints': False, 'required_attributes': []}})
    write(path / 'papers.json', [])
    write(path / 'analyses.json', {})
    write(path / 'search-log.json', [])
    write(path / 'retrieval-plan.json', [])
    (path / 'recall.jsonl').write_text('', encoding='utf-8')
    (path / 'screening.jsonl').write_text('', encoding='utf-8')
    write(path / 'state.json', {'phase': 'scope', 'confirmed': {'scope': False, 'sources': False, 'taxonomy': False}, 'selected_path': [], 'decisions': []})

def build(project, output, completion=None):
    errors = validate(project)
    if errors:
        raise ValueError('\n'.join(errors))
    cfg, papers, analyses = read(project / 'project.json'), read(project / 'papers.json'), read(project / 'analyses.json')
    report = completion if completion is not None else completion_report(project, cfg, papers)
    write(project/'completion.json', report)
    cfg['limitations'] = [report['label'] + '；这不证明领域检索穷尽或 AI 语义判断正确。', *cfg.get('limitations', [])]
    if report.get('partial_reason'):
        cfg['limitations'].insert(1, '本次有限交付原因：' + report['partial_reason'])
    if report['status'] != 'complete':
        cfg['title'] += ' · ' + ('建库完成度未核验' if report['status'] == 'untracked' else '阶段性初筛')
    if cfg.get('renderer') == 'reference-original':
        from reference_renderer import render
        result, evidence = render(project, cfg, papers, analyses)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(result, encoding='utf-8')
        write(project/'render-provenance.json', evidence)
        print(f'Built {output} from complete reference HTML: {len(papers)} papers')
        return
    assets = SKILL / 'assets'
    template = (assets / 'survey.html').read_text()
    css = '\n'.join((assets / f).read_text() for f in ('survey.css', 'method-analysis.css'))
    base = (assets / 'helpers.js').read_text().replace('__SURVEY_DATA__', embed(view_data(project, cfg, papers)))
    method_js = (assets / 'method-analysis.js').read_text().replace('__METHOD_ANALYSES__', embed(analyses))
    js = '\n'.join([base, (assets / 'method-diagrams.js').read_text(), method_js, (assets / 'survey.js').read_text()])
    # A single substitution pass prevents placeholder-like paper text from becoming code.
    values = {'TITLE': html.escape(cfg['title']), 'CSS': css, 'READING_HTML': (assets / 'method-analysis.html').read_text(), 'JS': js}
    result = re.sub(r'@@(TITLE|CSS|READING_HTML|JS)@@', lambda m: values[m[1]], template)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(result, encoding='utf-8')
    print(f'Built {output}: {len(papers)} papers; {len(analyses)} reading groups')

def deliver(project, output, partial_reason=None):
    errors = validate(project)
    if errors:
        raise ValueError('\n'.join(errors))
    report = completion_report(project)
    if report['status'] != 'complete' and not (partial_reason or '').strip():
        write(project/'completion.json', report)
        raise ValueError('Collection is not complete: inspect completion.json, finish the queue or use --partial-reason for an explicitly limited delivery')
    if report['status'] != 'complete':
        report['partial_reason'] = partial_reason.strip()
    build(project, output, completion=report)

def dedupe(papers):
    parent = list(range(len(papers)))
    def find(i):
        while i != parent[i]:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    owners = {}
    for i, paper in enumerate(papers):
        ids = {'id:' + paper['id']}
        for field, value in paper.get('identifiers', {}).items():
            if not value:
                continue
            v = str(value).strip().casefold()
            if field == 'arxiv':
                v = re.sub(r'v\d+$', '', v.removeprefix('https://arxiv.org/abs/'))
            elif field == 'doi':
                v = v.removeprefix('https://doi.org/').removeprefix('doi:')
            ids.add(field + ':' + v)
        title = ''.join(c for c in unicodedata.normalize('NFKC', paper['title']).casefold() if c.isalnum())
        if len(title) >= 20:
            ids.add('title:' + title)
        for token in ids:
            if token in owners:
                parent[find(i)] = find(owners[token])
            owners[token] = i
    groups = {}
    for i, paper in enumerate(papers):
        groups.setdefault(find(i), []).append(paper)
    kept, log = [], []
    for group in groups.values():
        winner = deepcopy(sorted(group, key=lambda p: p['pool'] != 'core')[0])
        merged_ids = {}
        for p in group:
            merged_ids.update({k:v for k,v in p.get('identifiers', {}).items() if v})
        merged_ids.update({k:v for k,v in winner.get('identifiers', {}).items() if v})
        known_dates = [(p['first_public_date'], p.get('date_source')) for p in group if p.get('first_public_date')]
        if known_dates:
            earliest, source = min(known_dates, key=lambda item: date_floor(item[0]))
            winner['first_public_date'] = earliest
            winner['first_public_source'] = source
        winner['identifiers'] = merged_ids
        kept.append(winner)
        if len(group) > 1:
            log.append({'kept': winner['id'], 'merged': [p['id'] for p in group if p['id'] != winner['id']], 'records': group, 'conflicts': {field: [p.get(field) for p in group] for field in ('path', 'impl', 'training') if any(p.get(field) != winner.get(field) for p in group)}, 'rule': 'shared strong identifier or exact normalized full title; target version preferred; inspect conflicts before replacing canonical data'})
    return kept, log

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('init');p.add_argument('project', type=Path);p.add_argument('--title', required=True);p.add_argument('--scope', required=True);p.add_argument('--start-year', type=int, required=True);p.add_argument('--cutoff', required=True)
    for name in ('validate', 'build', 'audit', 'deliver'):
        p = sub.add_parser(name);p.add_argument('project', type=Path)
        if name in ('build', 'deliver'):p.add_argument('--output', type=Path)
        if name == 'audit':p.add_argument('--require-complete', action='store_true')
        if name == 'deliver':p.add_argument('--partial-reason')
    p = sub.add_parser('dedupe');p.add_argument('input', type=Path);p.add_argument('--output', type=Path, required=True);p.add_argument('--log', type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == 'init':
            initialize(args.project, args.title, args.scope, args.start_year, args.cutoff)
        elif args.command == 'validate':
            errors = validate(args.project)
            if errors:raise ValueError('\n'.join(errors))
            print('Structure, scope, identity, dates and evidence bindings passed. Semantic correctness is not proven.')
        elif args.command == 'build':
            build(args.project, args.output or args.project / 'survey.html')
        elif args.command == 'audit':
            report = completion_report(args.project)
            write(args.project/'completion.json', report)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            if args.require_complete and report['status'] != 'complete':
                raise ValueError('Collection completion check did not pass')
        elif args.command == 'deliver':
            deliver(args.project, args.output or args.project/'survey.html', args.partial_reason)
        else:
            if args.input.resolve() in (args.output.resolve(), args.log.resolve()) or args.output.resolve() == args.log.resolve():
                raise ValueError('dedupe input, output and log must be distinct')
            kept, log = dedupe(read(args.input));write(args.output, kept);write(args.log, log)
            print(f'{len(kept)} unique candidates; {len(log)} merge groups; inspect conflict log')
    except (ValueError, KeyError, TypeError, OSError) as exc:
        parser.exit(1, str(exc) + '\n')

if __name__ == '__main__':
    main()
