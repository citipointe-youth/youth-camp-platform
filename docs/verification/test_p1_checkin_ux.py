"""
P1 Check-in UX — integration validation tests.

Run against a locally seeded server:
  CAMP_URL=http://localhost:4200 ADMIN_USER=admin ADMIN_PASS=<pw> python3 docs/verification/test_p1_checkin_ux.py
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
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


def login(username, password):
    _, body = api('/auth/login', method='POST', body={'username': username, 'password': password})
    return (body or {}).get('token')


class TestCheckInUX(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.admin_token = login(ADMIN_USER, ADMIN_PASS)
        if not cls.admin_token:
            raise RuntimeError('Admin login failed')

    def test_roster_entry_has_gender_grade_medicalflag(self):
        """RosterEntry from /checkin/sessions/:id/status includes gender, grade, medicalFlag."""
        _, sessions = api('/checkin/sessions', token=self.admin_token)
        if not sessions:
            self.skipTest('No check-in sessions configured')

        session_id = sessions[0]['id']
        status, data = api(f'/checkin/sessions/{session_id}/status', token=self.admin_token)
        self.assertEqual(status, 200, f'Expected 200, got {status}')

        roster = data.get('roster', [])
        if not roster:
            self.skipTest('No roster entries (no atCamp persons)')

        entry = roster[0]
        for field in ('gender', 'grade', 'medicalFlag'):
            self.assertIn(field, entry, f'RosterEntry missing field: {field}')
        self.assertIsInstance(entry['medicalFlag'], bool)

    def test_checkin_persists_and_shows_on_reload(self):
        """A check-in write persists and is visible in the subsequent roster fetch."""
        _, sessions = api('/checkin/sessions', token=self.admin_token)
        if not sessions:
            self.skipTest('No check-in sessions configured')

        session_id = sessions[0]['id']
        _, st = api(f'/checkin/sessions/{session_id}/status', token=self.admin_token)
        roster = st.get('roster', [])
        not_checked_in = [r for r in roster if not r.get('checkedIn')]
        if not not_checked_in:
            self.skipTest('All campers already checked in for this session')

        target = not_checked_in[0]
        camper_id = target['camperId']

        # Check in
        status, _ = api('/checkin', method='POST', body={
            'camperId': camper_id,
            'sessionId': session_id,
            'type': 'in',
        }, token=self.admin_token)
        self.assertEqual(status, 200, f'Check-in failed: {status}')

        # Re-fetch roster and confirm
        _, st2 = api(f'/checkin/sessions/{session_id}/status', token=self.admin_token)
        roster2 = st2.get('roster', [])
        entry = next((r for r in roster2 if r['camperId'] == camper_id), None)
        self.assertIsNotNone(entry, 'Camper not found in roster after check-in')
        self.assertTrue(entry.get('checkedIn'), 'Camper should be checkedIn=true after check-in')

        # Cleanup — check out
        api('/checkin', method='POST', body={
            'camperId': camper_id,
            'sessionId': session_id,
            'type': 'out',
        }, token=self.admin_token)


if __name__ == '__main__':
    print(f'Testing P1 check-in UX against {BASE}')
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestCheckInUX)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
