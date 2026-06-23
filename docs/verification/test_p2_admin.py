"""
P2 Admin Laptop — integration validation tests.

Run against a locally seeded server:
  CAMP_URL=http://localhost:4200 ADMIN_USER=admin ADMIN_PASS=<pw> python3 docs/verification/test_p2_admin.py
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

SAMPLE_CHURCH_CSV = """Church Name,Zone,Code,Username,Password,Youth Pastor
Test Church Alpha,Yellow,TCA,test_church_alpha,demo1234,Ps Alpha
Test Church Beta,Blue,TCB,test_church_beta,demo1234,Ps Beta
"""

SAMPLE_STUDENT_CSV = """First Name,Last Name,Gender,School Grade,Attendee's Church
Dry,Run,male,10,Victory Church
"""


def api(path, *, method='GET', body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


def login(username, password):
    _, body = api('/auth/login', method='POST', body={'username': username, 'password': password})
    return (body or {}).get('token')


class TestAdminLaptop(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.admin_token = login(ADMIN_USER, ADMIN_PASS)
        if not cls.admin_token:
            raise RuntimeError('Admin login failed')

    def test_dry_run_does_not_persist_students(self):
        """POST /import/csv with dryRun:true must not create any person records."""
        _, before = api('/registrants', token=self.admin_token)
        before_count = len(before) if isinstance(before, list) else 0

        status, result = api('/import/csv', method='POST', body={
            'csvData': SAMPLE_STUDENT_CSV,
            'updateExisting': True,
            'dryRun': True,
        }, token=self.admin_token)

        self.assertEqual(status, 200, f'Expected 200, got {status}')
        self.assertTrue(result.get('dryRun'), 'Result should have dryRun:true')

        _, after = api('/registrants', token=self.admin_token)
        after_count = len(after) if isinstance(after, list) else 0
        self.assertEqual(before_count, after_count, 'Dry-run should not create any registrants')

    def test_bulk_church_import_is_idempotent(self):
        """POST /import/churches run twice should create churches once, then skip on re-run."""
        # First run
        status, result1 = api('/import/churches', method='POST', body={
            'csvData': SAMPLE_CHURCH_CSV,
            'dryRun': False,
        }, token=self.admin_token)
        self.assertEqual(status, 200, f'First import failed: {status}')

        first_created = result1.get('created', 0)

        # Second run — must skip (idempotent)
        _, result2 = api('/import/churches', method='POST', body={
            'csvData': SAMPLE_CHURCH_CSV,
            'dryRun': False,
        }, token=self.admin_token)
        self.assertEqual(result2.get('created', 0), 0, 'Second run should create 0 (all skipped)')
        self.assertGreater(result2.get('skipped', 0), 0, 'Second run should skip all rows')

        # Cleanup
        _, churches = api('/accounts/churches', token=self.admin_token)
        for c in (churches if isinstance(churches, list) else []):
            if c.get('code') in ('TCA', 'TCB'):
                api(f'/accounts/churches/{c["id"]}', method='DELETE', token=self.admin_token)

    def test_settings_date_range_accepted(self):
        """PATCH /settings with a valid date range must return 200."""
        _, current = api('/settings', token=self.admin_token)
        if not current:
            self.skipTest('Settings not available')
        status, result = api('/settings', method='PATCH', body={
            'campName': current.get('campName', 'Test Camp'),
            'year': current.get('year', 2026),
            'startDate': current.get('startDate', '2026-07-01'),
            'endDate': current.get('endDate', '2026-07-04'),
            'timezone': current.get('timezone', 'Australia/Brisbane'),
            'checkInLocation': current.get('checkInLocation', 'Main Hall'),
            'checkInFrom': current.get('checkInFrom', '08:00'),
            'registerBaseUrl': current.get('registerBaseUrl', 'http://localhost:4200/register'),
            'checkInDays': current.get('checkInDays', []),
        }, token=self.admin_token)
        self.assertEqual(status, 200, f'Settings PATCH failed: {status}: {result}')

    def test_new_year_returns_temp_passwords(self):
        """POST /admin/new-year must return tempPasswords array in the response."""
        # Save defaults first
        api('/admin/defaults', method='POST', token=self.admin_token)
        _, current = api('/settings', token=self.admin_token)
        year = (current.get('year') or 2026) + 1

        status, result = api('/admin/new-year', method='POST', body={'year': year}, token=self.admin_token)
        self.assertEqual(status, 200, f'New year failed: {status}: {result}')
        self.assertIn('tempPasswords', result, 'Response must include tempPasswords')
        self.assertIsInstance(result['tempPasswords'], list)


if __name__ == '__main__':
    print(f'Testing P2 admin laptop against {BASE}')
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestAdminLaptop)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
