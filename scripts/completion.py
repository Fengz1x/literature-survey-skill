"""Account for a declared retrieval plan and per-record screening, not semantic truth."""
import hashlib
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path


def text_hash(value):
    return hashlib.sha256((value or '').strip().encode('utf-8')).hexdigest()


def same_identity(record, paper):
    title = lambda s: ''.join(c for c in s.casefold() if c.isalnum())
    if title(record.get('title', '')) == title(paper.get('title', '')):
        return True
    for field in ('arxiv', 'doi', 'openreview'):
        values = [str(x.get('identifiers', {}).get(field) or '').strip().casefold() for x in (record, paper)]
        if field == 'arxiv':
            values = [re.sub(r'v\d+$', '', v.removeprefix('https://arxiv.org/abs/')) for v in values]
        elif field == 'doi':
            values = [v.removeprefix('https://doi.org/').removeprefix('doi:') for v in values]
        if values[0] and values[0] == values[1]:
            return True
    return False


def _json(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def _rows(path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()] if path.exists() else []


def audit(project, cfg=None, papers=None):
    project = Path(project)
    cfg = cfg if cfg is not None else _json(project/'project.json', {})
    papers = papers if papers is not None else _json(project/'papers.json', [])
    policy = cfg.get('collection')
    if not policy:
        return {'status': 'untracked', 'scope_mode': None, 'counts': {'included': len(papers)},
                'issues': [{'code': 'untracked', 'detail': 'No collection policy/queue accounting; structure validation is not collection completion.'}],
                'label': '既有项目：建库完成度未核验', 'semantic_correctness_verified': False}
    issues = []
    def issue(code, detail):
        issues.append({'code': code, 'detail': str(detail)})
    def unique(rows, field, label):
        result = {}
        for row in rows:
            key = row.get(field)
            if not isinstance(key, str) or not key or key in result:
                issue('duplicate_or_missing_id', label + ': ' + str(key))
            else:
                result[key] = row
        return result
    mode = policy.get('mode')
    if mode not in ('full_scope', 'bounded'):
        issue('policy', 'collection.mode must be full_scope or bounded')
    if mode == 'bounded' and not policy.get('reason'):
        issue('policy', 'bounded collection needs its agreed scope/reason')
    if not policy.get('rules_version'):
        issue('policy', 'collection.rules_version is required')
    units = _json(project/'retrieval-plan.json', [])
    plan = unique(units, 'id', 'retrieval plan')
    logs = unique(_json(project/'search-log.json', []), 'unit_id', 'search log')
    recalls = unique(_rows(project/'recall.jsonl'), 'id', 'recall')
    reviews = unique(_rows(project/'screening.jsonl'), 'recall_id', 'screening')
    library = unique(papers, 'id', 'papers')
    if not units:
        issue('missing_plan', 'Define the agreed source/year/track/query units before collection')
    try:
        years = set(range(int(cfg['start_year']), date.fromisoformat(cfg['cutoff']).year+1))
    except (KeyError, ValueError, TypeError):
        years = set()
        issue('policy', 'Valid start_year and cutoff are required')
    source_rows = [s for s in cfg.get('sources', []) if s.get('pool', 'core') == 'core']
    sources = {s['id'] for s in source_rows}
    if mode == 'full_scope':
        if not sources and not policy.get('include_preprints'):
            issue('missing_sources', 'No confirmed retrieval sources')
        covered = {(u.get('source_id'), u.get('year'), u.get('track')) for u in units if u.get('pool') == 'core'}
        for source in source_rows:
            sid = source['id']
            tracks = source.get('track_ids', [])
            if not isinstance(tracks, list) or not tracks:
                issue('missing_tracks', sid + ': declare confirmed track_ids')
                tracks = []
            for year in sorted(years):
                for track in tracks:
                    if (sid, year, track) not in covered:
                        issue('missing_source_year', f'{sid}/{year}/{track}')
        if policy.get('include_preprints'):
            covered_years = {u.get('year') for u in units if u.get('pool') == 'preprint'}
            for year in sorted(years-covered_years):
                issue('missing_preprint_year', year)
    memberships = Counter()
    for rid, record in recalls.items():
        memberships_list = record.get('unit_ids', [])
        if not isinstance(memberships_list, list) or not memberships_list or len(set(memberships_list)) != len(memberships_list):
            issue('recall_units', rid)
            continue
        for uid in memberships_list:
            if uid not in plan:
                issue('recall_units', rid + ': unknown unit ' + str(uid))
            memberships[uid] += 1
    for uid in logs.keys()-plan.keys():
        issue('unplanned_log', uid)
    for uid, unit in plan.items():
        if unit.get('pool') not in ('core', 'preprint') or unit.get('year') not in years:
            issue('plan_scope', uid)
        if unit.get('pool') == 'core' and unit.get('source_id') not in sources:
            issue('plan_scope', uid + ': unconfirmed source')
        if not unit.get('track') or not unit.get('fields') or not unit.get('selection_rule'):
            issue('plan_rule', uid + ': track, fields and selection_rule are required')
        if unit.get('pool') == 'preprint' and not unit.get('query'):
            issue('plan_rule', uid + ': preprint query is required')
        log = logs.get(uid)
        if log is None:
            issue('missing_retrieval', uid)
            continue
        status = log.get('status')
        if status == 'not_applicable':
            if not log.get('reason') or not log.get('evidence_url') or memberships[uid]:
                issue('not_applicable_evidence', uid)
            continue
        if status != 'complete':
            issue('retrieval_gap', uid + ': ' + str(status))
        if not log.get('url') or not log.get('checked_at'):
            issue('retrieval_evidence', uid)
        expected, read = log.get('pages_expected'), log.get('pages_read')
        if (not isinstance(expected, int) or isinstance(expected, bool) or expected < 1
                or not isinstance(read, int) or isinstance(read, bool)
                or read != expected or log.get('pagination_checked') is not True):
            issue('pagination', uid)
        if (not isinstance(log.get('recall_count'), int) or isinstance(log.get('recall_count'), bool)
                or log.get('recall_count') != memberships[uid]):
            issue('recall_count', f'{uid}: logged={log.get("recall_count")}, saved={memberships[uid]}')
    for rid in reviews.keys()-recalls.keys():
        issue('orphan_review', rid)
    included = Counter()
    decisions = Counter()
    attrs = policy.get('required_attributes', [])
    if not isinstance(attrs, list) or any(f not in ('impl', 'training') for f in attrs):
        issue('policy', 'required_attributes supports impl and training'); attrs = []
    attrs = list(dict.fromkeys(attrs + [f for f in cfg.get('filter_fields', []) if f in ('impl', 'training')]
                               + [f for f in ('impl', 'training') if any(p.get(f) is not None for p in papers)]))
    for rid, record in recalls.items():
        review = reviews.get(rid)
        if review is None:
            issue('unscreened', rid)
            continue
        decision = review.get('decision')
        decisions[decision] += 1
        if decision not in ('include', 'exclude', 'duplicate', 'insufficient'):
            issue('decision', rid)
        if not review.get('reason') or not review.get('source_url'):
            issue('review_evidence', rid)
        if review.get('rules_version') != policy.get('rules_version'):
            issue('stale_rules', rid)
        if not record.get('title') or review.get('title_sha256') != text_hash(record.get('title')):
            issue('stale_title', rid)
        abstract, method = record.get('abstract') or '', record.get('method_text') or ''
        scope = review.get('read_scope')
        if abstract:
            if review.get('abstract_sha256') != text_hash(abstract):
                issue('stale_abstract', rid)
        if scope == 'full_abstract' and not abstract:
            issue('missing_reading', rid + ': no full abstract available')
        if scope == 'method_intro' and (not method or review.get('method_sha256') != text_hash(method) or not record.get('method_source')):
            issue('missing_reading', rid + ': unbound method introduction')
        if decision == 'insufficient':
            issue('unresolved_evidence', rid)
        if decision == 'include':
            pid = review.get('paper_id')
            included[pid] += 1
            if pid not in library:
                issue('include_not_in_library', rid)
                continue
            paper = library[pid]
            if not same_identity(record, paper):
                issue('include_identity', rid)
            if abstract and scope != 'full_abstract':
                issue('partial_reading', rid + ': complete available abstract required')
            elif not abstract:
                if not method or scope != 'method_intro' or review.get('method_sha256') != text_hash(method) or not record.get('method_source'):
                    issue('missing_reading', rid + ': missing abstract needs a sourced method introduction')
            classification = review.get('classification', {})
            texts = [' '.join(t.split()) for t in (record.get('title', ''), abstract, method)]
            for field in ['path', *attrs]:
                result = classification.get(field, {})
                if not result or result.get('value') != paper.get(field) or not result.get('reason'):
                    issue('classification', rid + '/' + field)
                    continue
                support = result.get('support')
                if support == 'unknown':
                    if field == 'path' or result.get('value') is not None:
                        issue('unknown_default', rid + '/' + field)
                elif support in ('direct', 'inferred'):
                    excerpt = ' '.join((result.get('evidence') or '').split())
                    if not excerpt or not any(excerpt in t for t in texts):
                        issue('ungrounded_label', rid + '/' + field)
                else:
                    issue('label_support', rid + '/' + field)
        elif decision == 'duplicate':
            target = library.get(review.get('paper_id'))
            if not target or not same_identity(record, target):
                issue('duplicate_target', rid)
        elif decision == 'exclude' and scope not in ('title_only', 'full_abstract', 'method_intro'):
            issue('partial_reading', rid)
        # A title-only exclusion is allowed for clear scope violations; its
        # recorded reason is inspectable, not a claim the abstract was read.
    for pid in library:
        if included[pid] != 1:
            issue('library_accounting', f'{pid}: include decisions={included[pid]}')
    complete = not issues
    return {'status': 'complete' if complete else 'partial', 'scope_mode': mode,
            'label': ('已完成约定范围处理' if mode == 'full_scope' else '已完成约定试跑（非全范围）') if complete else '阶段性初筛：约定范围尚未处理完成',
            'counts': {'retrieval_units': len(plan), 'recall': len(recalls), 'screened': len(recalls.keys() & reviews.keys()),
                       'included': len(papers), 'decisions': dict(decisions)},
            'issues': issues, 'semantic_correctness_verified': False,
            'boundary': 'Checks saved queue accounting, reading declarations and evidence bindings; does not prove exhaustive retrieval or correct AI interpretation.'}
