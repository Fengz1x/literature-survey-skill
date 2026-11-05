import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('survey', ROOT/'scripts/survey.py')
survey = importlib.util.module_from_spec(spec)
spec.loader.exec_module(survey)


class Survey(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.project = self.root/'project'
        shutil.copytree(ROOT/'examples/synthetic-thermal', self.project)

    def tearDown(self):
        self.tmp.cleanup()

    def papers(self):
        return survey.read(self.project/'papers.json')

    def test_both_examples_validate_and_build_without_original_project(self):
        for name in ['inference','synthetic-thermal']:
            project = self.root/name
            shutil.copytree(ROOT/'examples'/name, project)
            self.assertEqual(survey.validate(project), [])
            output = project/'survey.html'
            survey.build(project, output)
            text = output.read_text()
            self.assertIn('methodOverviewCards', text)
            self.assertNotIn('__METHOD_ANALYSES__', text)
            self.assertNotIn('__SURVEY_DATA__', text)
            self.assertNotIn(str(Path.home()), text)
            self.assertNotIn('<script src=', text)

    def test_date_precision_window_and_no_clamping(self):
        papers = self.papers()
        papers[0]['publication_date'] = '2026-11-06'
        survey.write(self.project/'papers.json', papers)
        self.assertTrue(any('outside observation' in s for s in survey.validate(self.project)))
        papers[0]['publication_date'] = '2023'
        survey.write(self.project/'papers.json', papers)
        self.assertTrue(any('outside observation' in s for s in survey.validate(self.project)))
        papers[0]['publication_date'] = '2026'
        survey.write(self.project/'papers.json', papers)
        self.assertEqual(survey.validate(self.project), [])
        self.assertEqual(survey.date_floor('2026-02').isoformat(),'2026-02-01')
        with self.assertRaises(ValueError):survey.date_floor('2026-02-30')

    def test_unknown_date_requires_window_membership(self):
        papers = self.papers()
        papers[0]['publication_date'] = None
        survey.write(self.project/'papers.json', papers)
        self.assertTrue(any('window membership' in s for s in survey.validate(self.project)))
        papers[0]['window_evidence'] = 'known 2024 volume; exact year metadata unavailable'
        survey.write(self.project/'papers.json', papers)
        self.assertEqual(survey.validate(self.project), [])

    def test_entity_dedupe_prefers_core_preserves_identity_and_logs_conflicts(self):
        pre = {'id':'pre','title':'A sufficiently long and specific test title','pool':'preprint','first_public_date':'2024-02-03','date_source':'first version','identifiers':{'arxiv':'1234.56789v2'},'path':['a'],'impl':None,'training':None}
        core = {'id':'core','title':'Revised full title of the same research','pool':'core','first_public_date':None,'identifiers':{'arxiv':'1234.56789','doi':'https://doi.org/10.0000/demo'},'path':['b'],'impl':'software','training':'none'}
        kept, log = survey.dedupe([pre,core])
        self.assertEqual(len(kept),1)
        self.assertEqual(kept[0]['id'],'core')
        self.assertEqual(kept[0]['first_public_date'],'2024-02-03')
        self.assertEqual(log[0]['merged'],['pre'])
        self.assertIn('path',log[0]['conflicts'])
        self.assertEqual(kept[0]['identifiers']['arxiv'],'1234.56789')

    def test_same_short_alias_does_not_merge_distinct_papers(self):
        papers=[{'id':str(i),'title':'ABC','pool':'preprint'} for i in range(2)]
        self.assertEqual(len(survey.dedupe(papers)[0]),2)

    def test_duplicate_entity_and_nonleaf_path_are_rejected(self):
        papers=self.papers()
        duplicate=dict(papers[0],id='duplicate',identifiers={'doi':'10.1234/same'})
        papers[0]['identifiers']={'doi':'https://doi.org/10.1234/same'}
        papers.append(duplicate)
        survey.write(self.project/'papers.json',papers)
        self.assertTrue(any('duplicate entities' in s for s in survey.validate(self.project)))
        papers.pop();papers[0]['path']=['stationary']
        survey.write(self.project/'papers.json',papers)
        self.assertTrue(any('leaf path' in s for s in survey.validate(self.project)))

    def test_formally_published_work_cannot_masquerade_as_preprint(self):
        papers=self.papers();papers[1]['known_formal_publication']=True
        survey.write(self.project/'papers.json',papers)
        self.assertTrue(any('cannot be placed in preprints' in s for s in survey.validate(self.project)))

    def test_script_termination_and_placeholders_in_data_remain_data(self):
        papers=self.papers();papers[0]['title']='literal @@CSS@@ </script><img src=x onerror=alert(1)>'
        survey.write(self.project/'papers.json',papers)
        output=self.project/'survey.html';survey.build(self.project,output)
        text=output.read_text()
        self.assertEqual(text.count('</script>'),1)
        self.assertNotIn('<img src=x',text)
        self.assertIn('literal @@CSS@@',text)
        self.assertIn('\\u003c/script\\u003e',text)

    def test_fresh_init_does_not_overwrite_existing_work(self):
        with self.assertRaises(ValueError):
            survey.initialize(self.project,'a','b',2024,'2026-11-05')
        fresh=self.root/'new';survey.initialize(fresh,'a','b',2024,'2026-11-05')
        self.assertFalse(survey.read(fresh/'state.json')['confirmed']['scope'])
        self.assertEqual(survey.read(fresh/'analyses.json'),{})

    def proposal(self):
        cfg=survey.read(self.project/'project.json')
        return {'status':'pending_user_confirmation','label':'Test proposal, not confirmed','basis':'Synthetic fixture for preview safety',
                'taxonomy':cfg['taxonomy'],'assignments':[], 'reference_ids':[]}

    def test_proposal_projection_preserves_confirmed_files_and_scene(self):
        cfg=survey.read(self.project/'project.json');papers=self.papers();proposal=self.proposal()
        paper=papers[0];leaf=['stationary','proposal-object','proposal-method']
        root=next(n for n in proposal['taxonomy'] if n['id']=='stationary')
        root['children'].append({'id':'proposal-object','label':'Proposal object','children':[{'id':'proposal-method','label':'Proposal method'}]})
        proposal['assignments']=[{'paper_id':paper['id'],'path':leaf}]
        survey.write(self.project/'taxonomy-proposal.json',proposal)
        before={n:(self.project/n).read_bytes() for n in ['project.json','papers.json','state.json']}
        self.assertEqual(survey.validate(self.project),[])
        survey.build(self.project,self.project/'survey.html')
        self.assertEqual(before,{n:(self.project/n).read_bytes() for n in before})
        shown=survey.view_data(self.project,cfg,papers)
        self.assertEqual(next(p['path'] for p in shown['papers'] if p['id']==paper['id']),leaf)
        self.assertEqual(next(p['confirmed_path'] for p in shown['papers'] if p['id']==paper['id']),paper['path'])
        proposal['assignments'][0]['path']=next(p['path'] for p in papers if p['path'][0] != paper['path'][0])
        survey.write(self.project/'taxonomy-proposal.json',proposal)
        self.assertTrue(any('preserve the confirmed main scene' in e for e in survey.validate(self.project)))

    def test_proposal_rejects_double_counting_and_unclassified_methods(self):
        proposal=self.proposal();paper=self.papers()[0]
        proposal['assignments']=[{'paper_id':paper['id'],'path':paper['path']}]*2
        survey.write(self.project/'taxonomy-proposal.json',proposal)
        self.assertTrue(any('duplicate proposal assignment' in e for e in survey.validate(self.project)))
        proposal['assignments']=[]
        node=next(n for n in proposal['taxonomy'] if n['id']=='stationary')['children'][0]['children'][0]
        node['children']=[{'id':'new-method','label':'Method not assigned'}]
        survey.write(self.project/'taxonomy-proposal.json',proposal)
        self.assertTrue(any('unclassified method' in e for e in survey.validate(self.project)))
        proposal['reference_ids']=[paper['id']]
        survey.write(self.project/'taxonomy-proposal.json',proposal)
        self.assertTrue(any('only evaluation/modeling' in e for e in survey.validate(self.project)))

    def test_reference_template_is_preserved_byte_for_byte(self):
        import hashlib
        root=ROOT/'assets/reference';manifest=survey.read(root/'manifest.json')
        data=(root/manifest['template']).read_bytes()
        self.assertEqual(len(data),manifest['bytes'])
        self.assertEqual(hashlib.sha256(data).hexdigest(),manifest['sha256'])

    def test_reading_scope_graph_and_pdf_bindings_are_checked(self):
        project=self.root/'reading';shutil.copytree(ROOT/'examples/inference',project)
        analyses=survey.read(project/'analyses.json')
        a=analyses['IMAGE-EX-SKIP']
        self.assertEqual(sum(p['reading_level']=='full_paper' for p in a['papers']),5)
        self.assertEqual(next(p['reading_level'] for p in a['papers'] if p['id']=='kab-moe'),'abstract_only')
        a['papers'][0]['pdf_sha256']='0'*64
        a['lineage']['edges'][0]['to']='does-not-exist'
        survey.write(project/'analyses.json',analyses)
        errors=survey.validate(project)
        self.assertTrue(any('PDF binding' in s for s in errors))
        self.assertTrue(any('graph endpoint' in s for s in errors))


if __name__=='__main__':unittest.main()
