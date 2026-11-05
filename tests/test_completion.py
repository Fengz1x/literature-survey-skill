import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('survey_for_completion', ROOT/'scripts/survey.py')
survey = importlib.util.module_from_spec(spec)
spec.loader.exec_module(survey)


class Completion(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.cfg = {'schema_version': 1, 'title': 'Synthetic completion fixture', 'scope': 'Synthetic execution methods',
                    'start_year': 2024, 'cutoff': '2024-12-31',
                    'sources': [{'id': 's', 'label': 'Synthetic source', 'url': 'https://example.org',
                                 'tracks': 'main', 'track_ids': ['main'], 'reason': 'Test fixture'}],
                    'taxonomy': [{'id': 'execution', 'label': 'Execution'}], 'filter_fields': ['impl', 'training'],
                    'collection': {'mode': 'full_scope', 'rules_version': 'v1', 'include_preprints': False}}
        self.paper = {'id': 'p', 'title': 'Synthetic runtime scheduling paper', 'url': 'https://example.org/p',
                      'pool': 'core', 'source_id': 's', 'publication_date': '2024', 'date_source': 'https://example.org/p',
                      'path': ['execution'], 'impl': 'software', 'training': 'none', 'classification_basis': 'Synthetic abstract evidence'}
        self.record = {'id': 'r', 'title': self.paper['title'], 'unit_ids': ['s-2024-main'],
                       'abstract': 'We implement a runtime scheduler on existing GPUs without fitting any parameters.'}
        h = lambda s: hashlib.sha256(s.strip().encode()).hexdigest()
        self.review = {'recall_id': 'r', 'paper_id': 'p', 'decision': 'include', 'rules_version': 'v1',
                       'reason': 'Synthetic runtime optimization', 'source_url': self.paper['url'], 'read_scope': 'full_abstract',
                       'title_sha256': h(self.record['title']), 'abstract_sha256': h(self.record['abstract']),
                       'classification': {
                           'path': {'value': ['execution'], 'support': 'inferred', 'evidence': 'runtime scheduler', 'reason': 'Execution intervention'},
                           'impl': {'value': 'software', 'support': 'direct', 'evidence': 'runtime scheduler on existing GPUs', 'reason': 'Existing architecture'},
                           'training': {'value': 'none', 'support': 'direct', 'evidence': 'without fitting any parameters', 'reason': 'Explicit no fitting'}}}
        self.plan = [{'id': 's-2024-main', 'source_id': 's', 'year': 2024, 'pool': 'core', 'track': 'main',
                      'fields': ['title', 'abstract'], 'selection_rule': 'runtime OR scheduler'}]
        self.logs = [{'unit_id': 's-2024-main', 'status': 'complete', 'url': 'https://example.org/2024',
                      'checked_at': '2024-12-31', 'pages_expected': 1, 'pages_read': 1, 'pagination_checked': True, 'recall_count': 1}]
        self.save()

    def tearDown(self):
        self.tmp.cleanup()

    def save(self, records=None, reviews=None):
        for name, obj in [('project.json', self.cfg), ('papers.json', [self.paper]), ('analyses.json', {}),
                          ('retrieval-plan.json', self.plan), ('search-log.json', self.logs)]:
            survey.write(self.root/name, obj)
        for name, rows in [('recall.jsonl', records if records is not None else [self.record]),
                           ('screening.jsonl', reviews if reviews is not None else [self.review])]:
            (self.root/name).write_text(''.join(json.dumps(x)+'\n' for x in rows))

    def codes(self):
        return {e['code'] for e in survey.completion_report(self.root)['issues']}

    def test_complete_accounting_delivers_without_modifying_source_records(self):
        before={n:(self.root/n).read_bytes() for n in ['project.json', 'papers.json', 'screening.jsonl']}
        report=survey.completion_report(self.root)
        self.assertEqual(report['status'], 'complete')
        self.assertFalse(report['semantic_correctness_verified'])
        survey.deliver(self.root, self.root/'survey.html')
        self.assertNotIn('阶段性初筛', (self.root/'survey.html').read_text())
        self.assertEqual(before, {n:(self.root/n).read_bytes() for n in before})

    def test_small_selected_subset_is_not_a_complete_library(self):
        extra=dict(self.record,id='unprocessed',title='Another recalled synthetic paper')
        self.logs[0]['recall_count']=2
        self.save(records=[self.record, extra])
        self.assertIn('unscreened', self.codes())
        with self.assertRaisesRegex(ValueError, 'Collection is not complete'):
            survey.deliver(self.root, self.root/'survey.html')
        self.assertFalse((self.root/'survey.html').exists())

    def test_unsaved_hits_and_unverified_pagination_are_detected(self):
        self.logs[0].update(recall_count=1000, pagination_checked=False)
        self.save()
        self.assertTrue({'recall_count','pagination'} <= self.codes())

    def test_partial_delivery_is_visible_and_does_not_claim_completion(self):
        self.logs[0]['status']='access_gap';self.save()
        survey.deliver(self.root, self.root/'survey.html', 'Public endpoint unavailable after bounded retries')
        html=(self.root/'survey.html').read_text()
        self.assertIn('阶段性初筛', html)
        self.assertIn('Public endpoint unavailable', html)
        self.assertEqual(survey.read(self.root/'completion.json')['status'], 'partial')

    def test_legacy_projects_need_migration_before_claiming_complete(self):
        self.cfg.pop('collection');self.save()
        self.assertEqual(survey.completion_report(self.root)['status'], 'untracked')
        with self.assertRaises(ValueError):survey.deliver(self.root, self.root/'survey.html')
        survey.build(self.root, self.root/'preview.html')
        self.assertIn('建库完成度未核验', (self.root/'preview.html').read_text())

    def test_full_available_abstract_and_current_rules_are_required(self):
        self.review['read_scope']='abstract_prefix';self.review['rules_version']='old'
        self.save()
        self.assertTrue({'partial_reading','stale_rules'} <= self.codes())
        self.review['read_scope']='full_abstract';self.review['rules_version']='v1'
        self.record['abstract']+=' Changed input.';self.save()
        self.assertIn('stale_abstract',self.codes())

    def test_unsupported_defaults_and_label_projection_are_rejected(self):
        self.review['classification']['impl']['support']='unknown'
        self.review['classification']['path']['value']=['other']
        self.save()
        self.assertTrue({'unknown_default','classification'} <= self.codes())
        self.review['classification']['impl'].update(support='direct',evidence='invented RTL hardware')
        self.save();self.assertIn('ungrounded_label',self.codes())

    def test_unknown_attribute_is_allowed_with_a_reason(self):
        self.paper['training']=None
        self.review['classification']['training']={'value':None,'support':'unknown','reason':'Abstract does not resolve the learned component'}
        self.save();self.assertEqual(self.codes(),set())

    def test_all_source_years_tracks_and_preprint_years_need_accounting(self):
        self.cfg['cutoff']='2025-12-31';self.cfg['sources'][0]['track_ids'].append('short')
        self.cfg['collection']['include_preprints']=True;self.save()
        self.assertTrue({'missing_source_year','missing_preprint_year'} <= self.codes())

    def test_empty_retrieval_unit_still_needs_pagination_evidence(self):
        unit=dict(self.plan[0],id='second-query',pool='preprint',query='a second explicit query')
        self.plan.append(unit);self.save()
        self.assertIn('missing_retrieval',self.codes())

    def test_source_record_cannot_be_attached_to_an_unrelated_paper(self):
        self.record['title']='Entirely different synthetic research';self.review['title_sha256']=hashlib.sha256(self.record['title'].encode()).hexdigest()
        self.save();self.assertIn('include_identity',self.codes())

    def test_clear_title_exclusion_and_duplicate_still_get_recorded(self):
        extra={'id':'outside','title':'Unrelated classification-only synthetic task','unit_ids':['s-2024-main']}
        excluded={'recall_id':'outside','decision':'exclude','rules_version':'v1','reason':'Explicitly outside the agreed task',
                  'source_url':'https://example.org/outside','read_scope':'title_only',
                  'title_sha256':hashlib.sha256(extra['title'].encode()).hexdigest()}
        duplicate=dict(self.record,id='copy')
        dup={'recall_id':'copy','decision':'duplicate','paper_id':'p','rules_version':'v1','reason':'Same complete title',
             'source_url':'https://example.org/copy','read_scope':'title_only','title_sha256':self.review['title_sha256'],
             'abstract_sha256':self.review['abstract_sha256']}
        self.logs[0]['recall_count']=3
        self.save(records=[self.record,extra,duplicate],reviews=[self.review,excluded,dup])
        self.assertEqual(self.codes(),set())

    def test_cli_checks_completion_before_delivery_and_labels_limited_output(self):
        cmd=[sys.executable,str(ROOT/'scripts/survey.py')]
        run=lambda *args:subprocess.run(cmd+list(args),capture_output=True,text=True)
        self.assertEqual(run('audit',str(self.root),'--require-complete').returncode,0)
        self.logs[0]['pagination_checked']=False;self.save()
        self.assertNotEqual(run('audit',str(self.root),'--require-complete').returncode,0)
        self.assertNotEqual(run('deliver',str(self.root)).returncode,0)
        result=run('deliver',str(self.root),'--partial-reason','Pagination remains unresolved')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('Pagination remains unresolved',(self.root/'survey.html').read_text())


if __name__=='__main__':unittest.main()
