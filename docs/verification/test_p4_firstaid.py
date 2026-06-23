"""
P4 First-aid Role — integration validation tests.

Run against a locally seeded server:
  CAMP_URL=http://localhost:4200 ADMIN_USER=admin ADMIN_PASS=<pw> python3 docs/verification/test_p4_firstaid.py
"""

import os
import sys
import json
import unittest
import urllib.request
import urllib.error

BASE = os.environ.get('CAMP_URL', 'http://localhost:4200')
ADMIN_USER = os.environ.get('ADMIN_USER', 'admin')
ADMIN_PASS = os.environ.get('ADMIN_PASS', 'admin1234')


def api(path, *, method='GET', body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


def login(username, password):
    _, body = api('/auth/login', method='POST', body={'username': username, 'password': password})
    return (body or {}).get('token')


class TestFirstAidRole(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.admin_token = login(ADMIN_USER, ADMIN_PASS)
        if not cls.admin_token:
            raise RuntimeError('Admin login failed')

        # Create firstAid test account
        status, _ = api('/accounts/users', method='POST', body={
            'username': 'test_firstaid',
            'password': 'demo1234',
            'role': 'firstAid',
            'firstName': 'Test',
            'lastName': 'FirstAid',
        }, token=cls.admin_token)
        cls.fa_token = login('test_firstaid', 'demo1234')

        # Create a church account for permission boundary tests
        api('/accounts/users', method='POST', body={
            'username': 'test_church_fa',
            'password': 'demo1234',
            'role': 'church',
            'firstName': 'Test',
            'lastName': 'Church',
        }, token=cls.admin_token)
        cls.church_token = login('test_church_fa', 'demo1234')

    @classmethod
    def tearDownClass(cls):
        _, users = api('/accounts/users', token=cls.admin_token)
        for u in (users if isinstance(users, list) else []):
            if u.get('username') in ('test_firstaid', 'test_church_fa'):
                api(f'/accounts/users/{u["id"]}', method='DELETE', token=cls.admin_token)

    def test_firstaid_can_see_all_churches(self):
        """firstAid can list all churches (camp-wide read)."""
        if not self.fa_token:
            self.skipTest('firstAid login failed')
        status, churches = api('/accounts/churches', token=self.fa_token)
        self.assertEqual(status, 200, f'Expected 200, got {status}')
        self.assertIsInstance(churches, list)

    def test_firstaid_cannot_post_notes(self):
        """firstAid cannot write notes (no note:write permission)."""
        if not self.fa_token:
            self.skipTest('firstAid login failed')
        status, _ = api('/notes', method='POST', body={
            'camperId': 'any-id', 'body': 'test', 'category': 'note',
        }, token=self.fa_token)
        self.assertIn(status, (403, 404), f'Expected 403/404, got {status}')

    def test_firstaid_cannot_get_accounts_users(self):
        """firstAid cannot list user accounts (no admin:manage permission)."""
        if not self.fa_token:
            self.skipTest('firstAid login failed')
        status, _ = api('/accounts/users', token=self.fa_token)
        self.assertEqual(status, 403, f'Expected 403, got {status}')

    def test_firstaid_camper_dto_includes_medical_fields(self):
        """CamperDto returned to firstAid includes otherMedications, medicareNumber, consentMedical."""
        if not self.fa_token:
            self.skipTest('firstAid login failed')
        status, campers = api('/campers', token=self.fa_token)
        if status != 200 or not campers:
            self.skipTest('No campers available or camper list failed')
        c = campers[0]
        for field in ('otherMedications', 'medicareNumber', 'consentMedical', 'gender'):
            self.assertIn(field, c, f'CamperDto missing field: {field}')

    def test_medical_watch_returns_only_atcamp_flagged(self):
        """GET /campers/medical returns only atCamp=true persons with medical conditions."""
        if not self.fa_token:
            self.skipTest('firstAid login failed')
        status, watch = api('/campers/medical', token=self.fa_token)
        self.assertEqual(status, 200, f'Expected 200, got {status}')
        for c in (watch if isinstance(watch, list) else []):
            self.assertTrue(c.get('atCamp'), f'Medical watch contains non-atCamp person: {c.get("id")}')
            has_med = (c.get('medicalConditions') or []) or c.get('otherMedications')
            self.assertTrue(has_med, f'Medical watch contains person with no medical flags: {c.get("id")}')

    def test_church_role_cannot_access_medical_watch(self):
        """Church role cannot access GET /campers/medical (no camper:read:sensitive)."""
        if not self.church_token:
            self.skipTest('church login failed')
        status, _ = api('/campers/medical', token=self.church_token)
        self.assertEqual(status, 403, f'Expected 403 for church role on /campers/medical, got {status}')

    def test_firstaid_can_attendance_sign_out(self):
        """firstAid can sign a camper out via attendance (checkin:write permission)."""
        if not self.fa_token:
            self.skipTest('firstAid login failed')
        _, campers = api('/campers', token=self.fa_token)
        at_camp = [c for c in (campers if isinstance(campers, list) else []) if c.get('atCamp')]
        if not at_camp:
            self.skipTest('No atCamp campers available')
        target = at_camp[0]
        status, _ = api('/attendance/sign-out', method='POST', body={
            'camperId': target['id'],
            'reason': 'first-aid test',
        }, token=self.fa_token)
        # sign-out should succeed (200) or not-found (404 if already signed out)
        self.assertIn(status, (200, 404), f'Unexpected status {status} for attendance sign-out')
        # Restore
        if status == 200:
            api('/attendance/sign-in', method='POST', body={'camperId': target['id']}, token=self.fa_token)


if __name__ == '__main__':
    print(f'Testing P4 firstAid role against {BASE}')
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestFirstAidRole)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
