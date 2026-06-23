"""
P0 Presence Model — integration validation tests.

Run against a locally seeded server:
  CAMP_URL=http://localhost:4200 ADMIN_USER=admin ADMIN_PASS=<pw> python3 docs/verification/test_p0_presence.py

Or against production:
  CAMP_URL=https://my-youth-camp.vercel.app ADMIN_USER=admin ADMIN_PASS=<pw> python3 docs/verification/test_p0_presence.py
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
    return body.get('token')


class TestPresenceModel(unittest.TestCase):
    """Validates that the P0 presence-model fix is live."""

    @classmethod
    def setUpClass(cls):
        cls.admin_token = login(ADMIN_USER, ADMIN_PASS)
        if not cls.admin_token:
            raise RuntimeError('Admin login failed — check ADMIN_USER/ADMIN_PASS env vars')

        # Create a test church account
        status, body = api('/accounts/users', method='POST', body={
            'username': 'p0_test_church',
            'password': 'demo1234',
            'role': 'church',
            'churchName': 'P0 Test Church',
            'zone': 'Yellow',
        }, token=cls.admin_token)
        cls.church_token = login('p0_test_church', 'demo1234')

        # Import a test camper and arrive them (attendance sign-in to set atCamp=true)
        status, campers = api('/campers', token=cls.admin_token)
        cls.camper_id = None
        for c in (campers if isinstance(campers, list) else []):
            if c.get('atCamp'):
                cls.camper_id = c['id']
                break

        # Get a check-in session
        _, sessions = api('/checkin/sessions', token=cls.admin_token)
        cls.session_id = sessions[0]['id'] if sessions else None

    @classmethod
    def tearDownClass(cls):
        # Remove test church account
        _, users = api('/accounts/users', token=cls.admin_token)
        for u in (users if isinstance(users, list) else []):
            if u.get('username') == 'p0_test_church':
                api(f'/accounts/users/{u["id"]}', method='DELETE', token=cls.admin_token)
                break

    def test_daily_checkout_does_not_remove_from_headcount(self):
        """A session check-out must not reduce totalAtCamp."""
        if not self.camper_id or not self.session_id:
            self.skipTest('No atCamp camper or no check-in session available')

        _, before = api('/home', token=self.admin_token)
        before_count = before.get('totalAtCamp', -1)

        # Check in then immediately check out in the current session
        api('/checkin', method='POST', body={
            'camperId': self.camper_id,
            'sessionId': self.session_id,
            'type': 'in',
        }, token=self.admin_token)
        api('/checkin', method='POST', body={
            'camperId': self.camper_id,
            'sessionId': self.session_id,
            'type': 'out',
        }, token=self.admin_token)

        _, after = api('/home', token=self.admin_token)
        after_count = after.get('totalAtCamp', -1)

        self.assertEqual(
            before_count, after_count,
            f'totalAtCamp changed from {before_count} to {after_count} after a session check-out'
        )

    def test_departed_camper_not_on_roster(self):
        """A person who has signed out via attendance (atCamp=false) must not appear on the session roster."""
        if not self.session_id:
            self.skipTest('No check-in session available')

        _, roster_data = api(f'/checkin/sessions/{self.session_id}/status', token=self.admin_token)
        roster = roster_data.get('roster', [])

        _, all_campers = api('/campers', token=self.admin_token)
        not_at_camp_ids = {c['id'] for c in (all_campers if isinstance(all_campers, list) else []) if not c.get('atCamp')}
        roster_ids = {r['camperId'] for r in roster}

        overlap = not_at_camp_ids & roster_ids
        self.assertEqual(
            len(overlap), 0,
            f'Roster contains {len(overlap)} person(s) with atCamp=false: {overlap}'
        )

    def test_checkin_blocked_for_non_atcamp(self):
        """POST /checkin must return 400 for a person who is not atCamp."""
        if not self.session_id:
            self.skipTest('No check-in session available')

        # Find a person who is not atCamp (registered or checked_out)
        _, all_campers = api('/campers', token=self.admin_token)
        not_at_camp = [c for c in (all_campers if isinstance(all_campers, list) else []) if not c.get('atCamp')]
        if not not_at_camp:
            self.skipTest('No non-atCamp persons available to test guard')

        target_id = not_at_camp[0]['id']
        status, body = api('/checkin', method='POST', body={
            'camperId': target_id,
            'sessionId': self.session_id,
            'type': 'in',
        }, token=self.admin_token)
        self.assertEqual(status, 400, f'Expected 400 for non-atCamp check-in, got {status}: {body}')


if __name__ == '__main__':
    print(f'Testing P0 presence model against {BASE}')
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestPresenceModel)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
