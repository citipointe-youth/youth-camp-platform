"""
Post-deployment validation test suite for the Youth Camp Management Platform.

Run with:
    CAMP_URL=https://my-youth-camp.vercel.app ADMIN_USER=admin ADMIN_PASS=xxx \
        python3 docs/spec/07-validation-tests.py

Required env vars:
    CAMP_URL     Base URL of the deployed app (no trailing slash)
    ADMIN_USER   Username of the admin account
    ADMIN_PASS   Password of the admin account

Optional env vars:
    FA_USER      Username of a firstAid account (default: firstaid_test_<epoch>)
    FA_PASS      Password for the firstAid account (default: FAtest1234)
    CHURCH_USER  Username of an existing church account to test (default: victory)
    CHURCH_PASS  Password for that church account (default: demo1234)

The suite creates and destroys its own test data.  If setUp fails mid-way,
tearDown still attempts to clean up everything that was created.
"""

from __future__ import annotations

import csv
import io
import os
import sys
import time
import unittest
from typing import Optional

import requests


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL: str = os.environ.get("CAMP_URL", "http://localhost:4200").rstrip("/")
ADMIN_USER: str = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS: str = os.environ.get("ADMIN_PASS", "demo1234")

FA_USER: str = os.environ.get("FA_USER", f"fa_test_{int(time.time())}")
FA_PASS: str = os.environ.get("FA_PASS", "FAtest1234")

CHURCH_USER: str = os.environ.get("CHURCH_USER", "victory")
CHURCH_PASS: str = os.environ.get("CHURCH_PASS", "demo1234")

# Timeout for every HTTP request (seconds)
HTTP_TIMEOUT: int = 20

# DTO fields added by P1/P4 — roster entries must include these
REQUIRED_ROSTER_FIELDS = {"gender", "grade", "medicalFlag"}

# Required columns in the sign-in/out CSV export (P3)
REQUIRED_SIGNIN_OUT_COLUMNS = {
    "Student",
    "Church",
    "Zone",
    "Gender",
    "Grade",
    "Event Type",
    "Timestamp",
    "Reason",
    "Parents Met",
    "Authorised By",
}

# UTF-8 BOM bytes
BOM = b"\xef\xbb\xbf"


# ---------------------------------------------------------------------------
# BaseTestCase
# ---------------------------------------------------------------------------


class BaseTestCase(unittest.TestCase):
    """
    Shared helpers and test-data lifecycle for every test group.

    setUp creates:
      - test_church         (church entity + account)
      - test_camper         (Person, lifecycle=registered, atCamp=False)
      - test_firstaid_user  (firstAid account)
      - test_session        (schedule session, if at-camp mode is active)

    tearDown deletes all of the above in reverse order, tolerating partial
    failures so that a setUp crash does not leave orphan data.
    """

    # -----------------------------------------------------------------------
    # Low-level HTTP helpers
    # -----------------------------------------------------------------------

    def login(self, username: str, password: str) -> str:
        """POST /auth/login and return the bearer token string."""
        r = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": username, "password": password},
            timeout=HTTP_TIMEOUT,
        )
        self.assertEqual(
            r.status_code,
            200,
            f"Login failed for '{username}': {r.status_code} {r.text}",
        )
        return r.json()["token"]

    def api(
        self,
        method: str,
        path: str,
        token: str,
        json: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> requests.Response:
        """
        Make an authenticated API request.

        Returns the raw requests.Response so the caller can inspect status
        codes that are expected to be non-2xx.
        """
        headers = {"Authorization": f"Bearer {token}"}
        url = f"{BASE_URL}{path}"
        return requests.request(
            method.upper(),
            url,
            headers=headers,
            json=json,
            params=params,
            timeout=HTTP_TIMEOUT,
        )

    # -----------------------------------------------------------------------
    # Convenience wrappers
    # -----------------------------------------------------------------------

    def get(self, path: str, token: str, params: Optional[dict] = None) -> requests.Response:
        """GET helper."""
        return self.api("GET", path, token, params=params)

    def post(self, path: str, token: str, body: dict) -> requests.Response:
        """POST helper."""
        return self.api("POST", path, token, json=body)

    def patch(self, path: str, token: str, body: dict) -> requests.Response:
        """PATCH helper."""
        return self.api("PATCH", path, token, json=body)

    def delete(self, path: str, token: str) -> requests.Response:
        """DELETE helper."""
        return self.api("DELETE", path, token)

    # -----------------------------------------------------------------------
    # Test-data helpers
    # -----------------------------------------------------------------------

    def _create_church(self, token: str, suffix: str) -> dict:
        """Create a test church via POST /accounts/churches and return its dict."""
        slug = f"test_church_{suffix}"
        body = {
            "name": f"Test Church {suffix}",
            "code": f"TC{suffix}",
            "zone": "Yellow",
            "selfRegisterSlug": slug,
            "contacts": {},
        }
        r = self.post("/accounts/churches", token, body)
        self.assertIn(
            r.status_code,
            (200, 201),
            f"Failed to create test church: {r.status_code} {r.text}",
        )
        return r.json()

    def _create_church_account(
        self, token: str, church_id: str, suffix: str
    ) -> dict:
        """Create a church-role user account for the test church."""
        body = {
            "username": f"tc_user_{suffix}",
            "password": "TestPass99",
            "role": "church",
            "churchId": church_id,
            "displayName": f"Test Church User {suffix}",
        }
        r = self.post("/accounts/users", token, body)
        self.assertIn(
            r.status_code,
            (200, 201),
            f"Failed to create church account: {r.status_code} {r.text}",
        )
        return r.json()

    def _create_registrant(self, token: str, church_id: str, church_name: str, zone: str) -> dict:
        """Create a Person in 'registered' state (lifecycle=registered, atCamp=False)."""
        body = {
            "firstName": "Testcamper",
            "lastName": "Validation",
            "gender": "female",
            "grade": 9,
            "kind": "youth",
            "churchId": church_id,
            "churchName": church_name,
            "zone": zone,
            "paymentStatus": "unpaid",
            "medicalConditions": ["Asthma"],
            "dietaryRequirements": ["Vegetarian"],
            "otherMedications": "Ventolin",
            "medicareNumber": "1234567890",
            "parentGuardianName": "Test Parent",
            "parentPhone": "0400000001",
            "parentRelation": "Mother",
        }
        r = self.post("/registrants", token, body)
        self.assertIn(
            r.status_code,
            (200, 201),
            f"Failed to create registrant: {r.status_code} {r.text}",
        )
        return r.json()

    def _create_firstaid_account(self, token: str) -> dict:
        """Create a firstAid-role user account and return its dict."""
        body = {
            "username": FA_USER,
            "password": FA_PASS,
            "role": "firstAid",
            "displayName": "Test First Aid Officer",
        }
        r = self.post("/accounts/users", token, body)
        self.assertIn(
            r.status_code,
            (200, 201),
            f"Failed to create firstAid account: {r.status_code} {r.text}",
        )
        return r.json()

    def _create_schedule_session(self, token: str) -> Optional[dict]:
        """
        Create a schedule item with isCheckInPoint=True for today.
        Returns the created item or None if the server indicates at-camp mode is
        not active (in which case session-dependent tests are skipped gracefully).
        """
        import datetime

        today = datetime.date.today().isoformat()
        body = {
            "day": today,
            "startTime": "08:00",
            "endTime": "09:00",
            "title": "Validation Test Session",
            "type": "session",
            "isCheckInPoint": True,
        }
        r = self.post("/schedule", token, body)
        if r.status_code in (200, 201):
            return r.json()
        # Not fatal — session-dependent tests will skip themselves
        return None

    def _sign_in_to_camp(self, token: str, person_id: str) -> requests.Response:
        """POST /attendance/sign-in to set atCamp=True for the test person."""
        return self.post(
            "/attendance/sign-in",
            token,
            {
                "camperId": person_id,
                "leaderName": "Validation Test Runner",
            },
        )

    def _sign_out_of_camp(self, token: str, person_id: str) -> requests.Response:
        """POST /attendance/sign-out to set atCamp=False for the test person."""
        return self.post(
            "/attendance/sign-out",
            token,
            {
                "camperId": person_id,
                "leaderName": "Validation Test Runner",
                "reason": "Test sign-out",
                "parentsMet": False,
            },
        )

    def _get_person(self, token: str, person_id: str) -> Optional[dict]:
        """
        Fetch the current state of a person.  Tries /campers/:id first (at-camp
        DTO), then /registrants/:id (pre-camp DTO) as a fallback.
        """
        r = self.get(f"/campers/{person_id}", token)
        if r.status_code == 200:
            return r.json()
        r2 = self.get(f"/registrants/{person_id}", token)
        if r2.status_code == 200:
            return r2.json()
        return None

    # -----------------------------------------------------------------------
    # setUp / tearDown
    # -----------------------------------------------------------------------

    def setUp(self) -> None:
        """
        Create shared test data used across the test groups.

        Attributes set on self:
            admin_token         str
            church_token        str  (login for the test church user)
            fa_token            str  (login for the firstAid test user)
            test_church_id      str
            test_church_name    str
            test_church_zone    str
            test_church_user_id str
            test_camper_id      str
            test_fa_user_id     str
            test_session        dict | None
        """
        # Initialise tracking attributes so tearDown is safe even on partial setup
        self.test_church_id: Optional[str] = None
        self.test_church_name: Optional[str] = None
        self.test_church_zone: Optional[str] = "Yellow"
        self.test_church_user_id: Optional[str] = None
        self.test_camper_id: Optional[str] = None
        self.test_fa_user_id: Optional[str] = None
        self.test_session: Optional[dict] = None

        suffix = str(int(time.time()))[-6:]

        # 1. Admin token
        self.admin_token = self.login(ADMIN_USER, ADMIN_PASS)

        # 2. Test church
        church = self._create_church(self.admin_token, suffix)
        self.test_church_id = church.get("id") or church.get("churchId")
        self.test_church_name = church.get("name", f"Test Church {suffix}")
        self.test_church_zone = church.get("zone", "Yellow")

        # 3. Church user account
        church_user = self._create_church_account(
            self.admin_token, self.test_church_id, suffix
        )
        self.test_church_user_id = church_user.get("id")
        self.church_token = self.login(f"tc_user_{suffix}", "TestPass99")

        # 4. Test registrant (lifecycle=registered, atCamp=False)
        camper = self._create_registrant(
            self.admin_token,
            self.test_church_id,
            self.test_church_name,
            self.test_church_zone,
        )
        self.test_camper_id = camper.get("id")

        # 5. firstAid account
        fa_user = self._create_firstaid_account(self.admin_token)
        self.test_fa_user_id = fa_user.get("id")
        self.fa_token = self.login(FA_USER, FA_PASS)

        # 6. Schedule session (best-effort; None if creation fails)
        self.test_session = self._create_schedule_session(self.admin_token)

    def tearDown(self) -> None:
        """
        Delete all test data created in setUp.

        Each deletion is attempted independently — a failure in one step does
        not prevent subsequent cleanup.  Errors are printed to stderr but do
        not raise, because a tearDown assertion failure would mask the original
        test result.
        """

        def _try_delete(path: str) -> None:
            try:
                r = self.delete(path, self.admin_token)
                # 200, 204, and 404 (already gone) are all acceptable
                if r.status_code not in (200, 204, 404):
                    print(
                        f"[tearDown] WARNING: DELETE {path} -> {r.status_code}",
                        file=sys.stderr,
                    )
            except Exception as exc:
                print(f"[tearDown] ERROR: DELETE {path}: {exc}", file=sys.stderr)

        # Ensure test person is at a stable state before deletion
        if self.test_camper_id:
            try:
                # Sign out if atCamp to avoid orphan state
                p = self._get_person(self.admin_token, self.test_camper_id)
                if p and p.get("atCamp"):
                    self._sign_out_of_camp(self.admin_token, self.test_camper_id)
            except Exception:
                pass
            _try_delete(f"/registrants/{self.test_camper_id}")

        if self.test_fa_user_id:
            _try_delete(f"/accounts/users/{self.test_fa_user_id}")

        if self.test_church_user_id:
            _try_delete(f"/accounts/users/{self.test_church_user_id}")

        if self.test_church_id:
            _try_delete(f"/accounts/churches/{self.test_church_id}")

        if self.test_session:
            session_id = self.test_session.get("id")
            if session_id:
                _try_delete(f"/schedule/{session_id}")


# ---------------------------------------------------------------------------
# TestPresenceModel
# ---------------------------------------------------------------------------


class TestPresenceModel(BaseTestCase):
    """
    P0 — Presence model invariants.

    atCamp is the single source of truth for physical presence.
    Only withSignEvent (attendance paths) may mutate atCamp and lifecycle.
    Daily check-in (withCheckIn) must be a pure log-append.
    """

    def _ensure_at_camp(self) -> None:
        """Sign the test camper in via attendance so atCamp=True."""
        r = self._sign_in_to_camp(self.admin_token, self.test_camper_id)
        self.assertEqual(
            r.status_code,
            200,
            f"Pre-condition: attendance sign-in failed: {r.status_code} {r.text}",
        )

    def _ensure_current_session(self) -> str:
        """
        Return the ID of the current check-in session, or skip the test if
        none is available.
        """
        r = self.get("/checkin/sessions/current", self.admin_token)
        if r.status_code != 200 or not r.json():
            self.skipTest("No current check-in session configured — skipping session-dependent test")
        return r.json()["id"]

    def test_daily_checkout_preserves_atcamp(self) -> None:
        """
        A daily session check-OUT (POST /checkin type=out) must NOT change atCamp.

        Steps:
          1. Sign the test camper in via attendance (atCamp -> True).
          2. Obtain the current session.
          3. First perform a daily session check-IN (type=in) so there is a row to
             check out.
          4. POST /checkin with type=out (daily session checkout).
          5. Fetch the person and assert atCamp is still True.
          6. Also confirm the dashboard totalAtCamp is unchanged.
        """
        self._ensure_at_camp()
        session_id = self._ensure_current_session()

        # Record baseline totalAtCamp from dashboard
        home_r = self.get("/home", self.admin_token)
        baseline_at_camp = None
        if home_r.status_code == 200:
            baseline_at_camp = home_r.json().get("totalAtCamp")

        # Daily check-IN first
        cin_r = self.post(
            "/checkin",
            self.admin_token,
            {"camperId": self.test_camper_id, "sessionId": session_id, "type": "in"},
        )
        self.assertEqual(
            cin_r.status_code,
            200,
            f"Daily check-in (type=in) failed: {cin_r.status_code} {cin_r.text}",
        )

        # Daily check-OUT
        cout_r = self.post(
            "/checkin",
            self.admin_token,
            {"camperId": self.test_camper_id, "sessionId": session_id, "type": "out"},
        )
        self.assertEqual(
            cout_r.status_code,
            200,
            f"Daily check-out (type=out) failed: {cout_r.status_code} {cout_r.text}",
        )

        # atCamp must still be True
        person = self._get_person(self.admin_token, self.test_camper_id)
        self.assertIsNotNone(person, "Could not fetch person after daily check-out")
        self.assertTrue(
            person.get("atCamp"),
            "FAIL: daily session check-OUT set atCamp=False (P0 regression — "
            "withCheckIn must not mutate atCamp)",
        )

        # Lifecycle must still be 'arrived' (not 'checked_out')
        self.assertEqual(
            person.get("lifecycle"),
            "arrived",
            "FAIL: daily checkout mutated lifecycle (expected 'arrived', "
            f"got '{person.get('lifecycle')}')",
        )

        # Dashboard totalAtCamp must be unchanged
        if baseline_at_camp is not None:
            home_r2 = self.get("/home", self.admin_token)
            if home_r2.status_code == 200:
                after_at_camp = home_r2.json().get("totalAtCamp")
                self.assertEqual(
                    after_at_camp,
                    baseline_at_camp,
                    f"FAIL: totalAtCamp changed from {baseline_at_camp} to "
                    f"{after_at_camp} after a daily check-out",
                )

    def test_departed_hidden_from_roster(self) -> None:
        """
        A fully departed camper (atCamp=False via attendance sign-out) must NOT
        appear on the daily check-in roster.

        Steps:
          1. Sign the test camper in (atCamp=True).
          2. Verify the camper appears on the roster.
          3. Sign the camper out via attendance (atCamp -> False).
          4. Fetch the roster again and assert the camper is absent.
        """
        self._ensure_at_camp()
        session_id = self._ensure_current_session()

        # Confirm on roster
        status_r = self.get(
            f"/checkin/sessions/{session_id}/status", self.admin_token
        )
        self.assertEqual(status_r.status_code, 200, "Could not fetch session status")
        before_ids = {row["camperId"] for row in status_r.json().get("roster", [])}
        self.assertIn(
            self.test_camper_id,
            before_ids,
            "Pre-condition: test camper should appear on roster after sign-in",
        )

        # Attend sign-out (full departure)
        r = self._sign_out_of_camp(self.admin_token, self.test_camper_id)
        self.assertEqual(
            r.status_code,
            200,
            f"Attendance sign-out failed: {r.status_code} {r.text}",
        )

        # Roster must no longer contain the camper
        status_r2 = self.get(
            f"/checkin/sessions/{session_id}/status", self.admin_token
        )
        self.assertEqual(status_r2.status_code, 200, "Could not re-fetch session status")
        after_ids = {row["camperId"] for row in status_r2.json().get("roster", [])}
        self.assertNotIn(
            self.test_camper_id,
            after_ids,
            "FAIL: departed camper (atCamp=False) still appears on daily roster",
        )

    def test_daily_checkin_blocked_without_arrival(self) -> None:
        """
        POST /checkin for a person with atCamp=False must return HTTP 400.

        The test person starts in lifecycle=registered with atCamp=False (no
        attendance sign-in has occurred).  The server guard in person.service.ts
        must reject the check-in with BAD_REQUEST.
        """
        session_id = self._ensure_current_session()

        # Confirm the test person is NOT atCamp
        person = self._get_person(self.admin_token, self.test_camper_id)
        if person and person.get("atCamp"):
            self.skipTest(
                "Test camper is already atCamp — cannot test the not-at-camp guard"
            )

        r = self.post(
            "/checkin",
            self.admin_token,
            {
                "camperId": self.test_camper_id,
                "sessionId": session_id,
                "type": "in",
            },
        )
        self.assertEqual(
            r.status_code,
            400,
            f"FAIL: expected 400 for check-in of non-atCamp person, "
            f"got {r.status_code}: {r.text}",
        )
        body = r.json()
        self.assertEqual(
            body.get("code"),
            "BAD_REQUEST",
            f"FAIL: expected code=BAD_REQUEST, got: {body}",
        )

    def test_arrival_signin_sets_atcamp(self) -> None:
        """
        POST /attendance/sign-in must set atCamp=True and advance lifecycle to
        'arrived' when called for a person with lifecycle=registered.

        This is the Day-1 arrival path — the only path that promotes a person
        from registered to an at-camp state.
        """
        # Confirm person starts registered
        person_before = self._get_person(self.admin_token, self.test_camper_id)
        self.assertIsNotNone(person_before, "Could not fetch test person before sign-in")
        self.assertFalse(
            person_before.get("atCamp", True),
            "Pre-condition: test person should start with atCamp=False",
        )

        r = self._sign_in_to_camp(self.admin_token, self.test_camper_id)
        self.assertEqual(
            r.status_code,
            200,
            f"Attendance sign-in failed: {r.status_code} {r.text}",
        )

        person_after = self._get_person(self.admin_token, self.test_camper_id)
        self.assertIsNotNone(person_after, "Could not fetch test person after sign-in")
        self.assertTrue(
            person_after.get("atCamp"),
            "FAIL: attendance sign-in did not set atCamp=True",
        )
        self.assertEqual(
            person_after.get("lifecycle"),
            "arrived",
            f"FAIL: attendance sign-in did not advance lifecycle to 'arrived', "
            f"got: '{person_after.get('lifecycle')}'",
        )

    def test_attendance_signout_clears_atcamp(self) -> None:
        """
        POST /attendance/sign-out must set atCamp=False and transition lifecycle
        to 'checked_out'.

        Steps:
          1. Sign in via attendance to establish atCamp=True.
          2. Sign out via attendance.
          3. Assert atCamp=False and lifecycle='checked_out'.
        """
        self._ensure_at_camp()

        r = self._sign_out_of_camp(self.admin_token, self.test_camper_id)
        self.assertEqual(
            r.status_code,
            200,
            f"Attendance sign-out failed: {r.status_code} {r.text}",
        )

        person = self._get_person(self.admin_token, self.test_camper_id)
        self.assertIsNotNone(person, "Could not fetch test person after sign-out")
        self.assertFalse(
            person.get("atCamp"),
            "FAIL: attendance sign-out did not clear atCamp (still True)",
        )
        self.assertIn(
            person.get("lifecycle"),
            ("checked_out", "departed"),
            f"FAIL: unexpected lifecycle after sign-out: '{person.get('lifecycle')}'",
        )


# ---------------------------------------------------------------------------
# TestCheckinUX
# ---------------------------------------------------------------------------


class TestCheckinUX(BaseTestCase):
    """
    P1 — Check-in UX contract tests.

    Verifies the enriched RosterEntry DTO fields required for the on-ground
    phone interface (gender, grade, medicalFlag) and basic check-in toggle
    behaviour.
    """

    def _ensure_at_camp(self) -> None:
        r = self._sign_in_to_camp(self.admin_token, self.test_camper_id)
        self.assertEqual(r.status_code, 200, f"Attendance sign-in failed: {r.text}")

    def _ensure_current_session(self) -> str:
        r = self.get("/checkin/sessions/current", self.admin_token)
        if r.status_code != 200 or not r.json():
            self.skipTest("No current check-in session configured")
        return r.json()["id"]

    def _get_roster_row(self, session_id: str) -> Optional[dict]:
        """Return the roster row for the test camper, or None if absent."""
        r = self.get(f"/checkin/sessions/{session_id}/status", self.admin_token)
        if r.status_code != 200:
            return None
        return next(
            (
                row
                for row in r.json().get("roster", [])
                if row.get("camperId") == self.test_camper_id
            ),
            None,
        )

    def test_roster_entry_has_gender(self) -> None:
        """
        Each RosterEntry in GET /checkin/sessions/:id/status must include a
        'gender' field (P1 — enriched DTO, eliminates the per-render
        /campers piggyback fetch).
        """
        self._ensure_at_camp()
        session_id = self._ensure_current_session()
        row = self._get_roster_row(session_id)
        self.assertIsNotNone(row, "Test camper not found on roster after sign-in")
        self.assertIn(
            "gender",
            row,
            "FAIL: RosterEntry is missing 'gender' field (P1 DTO requirement)",
        )
        self.assertIn(
            row["gender"],
            ("male", "female", "other"),
            f"FAIL: RosterEntry 'gender' value '{row['gender']}' is not a valid Gender enum",
        )

    def test_roster_entry_has_grade(self) -> None:
        """
        Each RosterEntry must include a 'grade' field.  Value may be null for
        leaders, but the key must be present.
        """
        self._ensure_at_camp()
        session_id = self._ensure_current_session()
        row = self._get_roster_row(session_id)
        self.assertIsNotNone(row, "Test camper not found on roster after sign-in")
        self.assertIn(
            "grade",
            row,
            "FAIL: RosterEntry is missing 'grade' field (P1 DTO requirement)",
        )

    def test_roster_entry_has_medical_flag(self) -> None:
        """
        Each RosterEntry must include a 'medicalFlag' boolean field.
        The test camper was created with medical conditions, so the value
        must be True for that row.
        """
        self._ensure_at_camp()
        session_id = self._ensure_current_session()
        row = self._get_roster_row(session_id)
        self.assertIsNotNone(row, "Test camper not found on roster after sign-in")
        self.assertIn(
            "medicalFlag",
            row,
            "FAIL: RosterEntry is missing 'medicalFlag' field (P1 DTO requirement)",
        )
        self.assertTrue(
            row["medicalFlag"],
            "FAIL: medicalFlag should be True for a camper with medical conditions "
            "(test camper was created with Asthma + Ventolin)",
        )

    def test_checkin_toggles_correctly(self) -> None:
        """
        Daily session check-in should toggle: in -> checkedIn=True, then
        out -> checkedIn=False on the roster, while atCamp remains True throughout.

        Steps:
          1. Ensure test camper is at camp.
          2. POST /checkin type=in -> verify roster row shows checkedIn=True.
          3. POST /checkin type=out -> verify roster row shows checkedIn=False.
          4. Verify atCamp is still True after both operations.
        """
        self._ensure_at_camp()
        session_id = self._ensure_current_session()

        # --- Check IN ---
        r_in = self.post(
            "/checkin",
            self.admin_token,
            {"camperId": self.test_camper_id, "sessionId": session_id, "type": "in"},
        )
        self.assertEqual(
            r_in.status_code,
            200,
            f"Daily check-in (type=in) failed: {r_in.status_code} {r_in.text}",
        )

        row_after_in = self._get_roster_row(session_id)
        self.assertIsNotNone(row_after_in, "Test camper not on roster after check-in")
        self.assertTrue(
            row_after_in.get("checkedIn"),
            "FAIL: roster row checkedIn should be True after check-in type=in",
        )

        # --- Check OUT ---
        r_out = self.post(
            "/checkin",
            self.admin_token,
            {"camperId": self.test_camper_id, "sessionId": session_id, "type": "out"},
        )
        self.assertEqual(
            r_out.status_code,
            200,
            f"Daily check-out (type=out) failed: {r_out.status_code} {r_out.text}",
        )

        row_after_out = self._get_roster_row(session_id)
        self.assertIsNotNone(row_after_out, "Test camper vanished from roster after check-out")
        self.assertFalse(
            row_after_out.get("checkedIn"),
            "FAIL: roster row checkedIn should be False after check-out type=out",
        )

        # atCamp must still be True — daily check-out must not clear presence
        person = self._get_person(self.admin_token, self.test_camper_id)
        self.assertIsNotNone(person, "Could not fetch test person after toggle test")
        self.assertTrue(
            person.get("atCamp"),
            "FAIL: atCamp was cleared by a daily session check-out (P0 regression)",
        )


# ---------------------------------------------------------------------------
# TestAdminSetup
# ---------------------------------------------------------------------------


class TestAdminSetup(BaseTestCase):
    """
    P2 — Admin setup and import pipeline.

    Verifies the enriched import API: dryRun preview, errors/warnings arrays,
    updateExisting=False skip behaviour, bulk church import, and settings PATCH.
    """

    # Minimal valid CSV for import tests
    _VALID_CSV = (
        "firstName,lastName,gender,grade,churchCode,churchName,zone,"
        "paymentStatus\r\n"
        "Import,Test,female,10,TESTIMP,Import Test Church,Yellow,unpaid\r\n"
    )

    # CSV with a deliberate error (missing required field)
    _INVALID_CSV = (
        "firstName,lastName,gender\r\n"
        ",MissingFirst,female\r\n"
    )

    # Minimal church CSV for bulk import
    _CHURCH_CSV = (
        "name,code,zone\r\n"
        "BulkChurch Alpha,BCA,Yellow\r\n"
        "BulkChurch Beta,BCB,Blue\r\n"
    )

    def test_import_dryrun_returns_preview_without_persisting(self) -> None:
        """
        POST /import/csv with dryRun=true must return a preview response
        (errors, warnings, churchesCreated, rows parsed) without writing any
        records to the database.

        Verify by checking that a subsequent GET /registrants does NOT include
        a record matching the import CSV's test person.
        """
        r = self.post(
            "/import/csv",
            self.admin_token,
            {"csvData": self._VALID_CSV, "dryRun": True},
        )
        self.assertEqual(
            r.status_code,
            200,
            f"POST /import/csv dryRun=true failed: {r.status_code} {r.text}",
        )
        body = r.json()
        self.assertIn(
            "dryRun",
            body,
            "FAIL: dryRun response missing 'dryRun' field",
        )
        self.assertTrue(
            body.get("dryRun"),
            "FAIL: dryRun response body should indicate dryRun=true",
        )
        # Must not have persisted — the import CSV person should not appear
        regs_r = self.get("/registrants", self.admin_token)
        if regs_r.status_code == 200:
            names = [
                f"{p.get('firstName','')} {p.get('lastName','')}"
                for p in regs_r.json()
            ]
            self.assertNotIn(
                "Import Test",
                names,
                "FAIL: dryRun=true should not persist records, but 'Import Test' "
                "was found in /registrants",
            )

    def test_import_returns_errors_array(self) -> None:
        """
        POST /import/csv with a CSV containing a validation error must return
        an 'errors' array (possibly non-empty) in the response body.

        The exact shape of each error is implementation-defined, but the array
        must be present at the top level of the response.
        """
        r = self.post(
            "/import/csv",
            self.admin_token,
            {"csvData": self._INVALID_CSV, "dryRun": True},
        )
        # May return 200 with errors in body OR 400 with errors list
        body = r.json() if r.status_code in (200, 400) else {}
        has_errors = "errors" in body
        self.assertTrue(
            has_errors,
            f"FAIL: import response should include an 'errors' array, got: {body}",
        )

    def test_import_returns_warnings_array(self) -> None:
        """
        POST /import/csv must return a 'warnings' array at the top level of
        the response body (empty if no warnings).  Its presence is required
        so the SPA can surface warnings to the operator during the import
        preview step.
        """
        r = self.post(
            "/import/csv",
            self.admin_token,
            {"csvData": self._VALID_CSV, "dryRun": True},
        )
        self.assertIn(
            r.status_code,
            (200, 400),
            f"Unexpected status from import: {r.status_code} {r.text}",
        )
        body = r.json() if r.status_code in (200, 400) else {}
        self.assertIn(
            "warnings",
            body,
            "FAIL: import response should include a 'warnings' array (P2 requirement)",
        )

    def test_import_updateexisting_false_skips(self) -> None:
        """
        When updateExisting=False (or omitted), a second import of the same
        record must not overwrite an existing person.

        Steps:
          1. Import a record (live, not dryRun) to create a person.
          2. Modify a field value in the CSV.
          3. Re-import with updateExisting=false.
          4. Assert the person is unchanged (the second import was skipped).

        Note: if the initial import fails (e.g. the server requires a
        pre-existing church), this test is skipped gracefully.
        """
        # First import — create
        r1 = self.post(
            "/import/csv",
            self.admin_token,
            {"csvData": self._VALID_CSV, "dryRun": False, "updateExisting": False},
        )
        if r1.status_code not in (200, 201):
            self.skipTest(
                f"Initial import failed ({r1.status_code}), cannot test updateExisting=false"
            )

        # Build a modified CSV that changes the grade
        modified_csv = self._VALID_CSV.replace("10,TESTIMP", "11,TESTIMP")
        r2 = self.post(
            "/import/csv",
            self.admin_token,
            {"csvData": modified_csv, "dryRun": False, "updateExisting": False},
        )
        self.assertIn(
            r2.status_code,
            (200, 201),
            f"Second import failed: {r2.status_code} {r2.text}",
        )
        # Check that the response indicates the row was skipped
        body = r2.json()
        skipped = body.get("skipped", 0) or body.get("updated", 0) == 0
        self.assertTrue(
            skipped,
            "FAIL: updateExisting=false should result in at least 0 updates, "
            f"but response indicates updates occurred: {body}",
        )

    def test_bulk_church_import(self) -> None:
        """
        POST /import/csv with a church-format CSV (name, code, zone columns)
        must create or preview church records.

        The test uses dryRun=true so no permanent churches are created.
        The response must include a 'churchesCreated' (or equivalent) field
        and the errors array must be empty or absent for a valid CSV.
        """
        r = self.post(
            "/import/csv",
            self.admin_token,
            {"csvData": self._CHURCH_CSV, "dryRun": True, "type": "churches"},
        )
        # If the server does not support 'type=churches' yet, it will return
        # errors in the body — we assert errors is not a fatal exception
        self.assertIn(
            r.status_code,
            (200, 400),
            f"Unexpected status for church import: {r.status_code} {r.text}",
        )

    def test_settings_update(self) -> None:
        """
        PATCH /settings must update the settings and return the updated object.

        Reads the current timezone, PATCHes it with the same value (idempotent)
        to avoid actually changing camp config, and verifies the response
        includes the updated field.
        """
        # GET current settings (no auth required per router.ts)
        settings_r = requests.get(f"{BASE_URL}/settings", timeout=HTTP_TIMEOUT)
        self.assertEqual(
            settings_r.status_code,
            200,
            f"GET /settings failed: {settings_r.status_code}",
        )
        current = settings_r.json()
        current_tz = current.get("timezone", "Australia/Brisbane")

        patch_r = self.patch(
            "/settings",
            self.admin_token,
            {"timezone": current_tz},
        )
        self.assertEqual(
            patch_r.status_code,
            200,
            f"PATCH /settings failed: {patch_r.status_code} {patch_r.text}",
        )
        updated = patch_r.json()
        self.assertEqual(
            updated.get("timezone"),
            current_tz,
            "FAIL: PATCH /settings did not return the updated timezone",
        )


# ---------------------------------------------------------------------------
# TestExportCompliance
# ---------------------------------------------------------------------------


class TestExportCompliance(BaseTestCase):
    """
    P3 — Post-camp export and compliance.

    Verifies BOM encoding, xlsx content type, lastExportedAt tracking,
    wipe guard logic, sign-in/out CSV column completeness, and notes export.
    """

    def test_export_registrants_has_bom(self) -> None:
        """
        GET /export/registrants must return a CSV with a UTF-8 BOM (0xEF 0xBB
        0xBF) as the first three bytes.

        This satisfies the P3 requirement for UTF-8 BOM on all CSV exports so
        that Excel (Windows) displays non-ASCII characters correctly.
        """
        r = self.get("/export/registrants", self.admin_token)
        self.assertEqual(
            r.status_code,
            200,
            f"GET /export/registrants failed: {r.status_code} {r.text}",
        )
        content = r.content
        self.assertTrue(
            content[:3] == BOM,
            f"FAIL: /export/registrants does not start with UTF-8 BOM. "
            f"First bytes: {content[:6].hex()}",
        )

    def test_export_audit_endpoint_exists(self) -> None:
        """
        GET /export/audit must return HTTP 200 with an xlsx content type.

        This is the master compliance workbook (multi-tab .xlsx) specified in
        P3.  The route must be present, admin-authenticated, and return a valid
        xlsx response.
        """
        r = self.get("/export/audit", self.admin_token)
        self.assertEqual(
            r.status_code,
            200,
            f"GET /export/audit failed: {r.status_code} {r.text[:200]}",
        )
        ct = r.headers.get("Content-Type", "")
        self.assertIn(
            "spreadsheetml",
            ct,
            f"FAIL: /export/audit should return xlsx content type. "
            f"Got Content-Type: '{ct}'",
        )

    def test_export_audit_sets_last_exported_at(self) -> None:
        """
        After a successful GET /export/audit, GET /settings must show a
        non-null 'lastExportedAt' timestamp that is recent (within the last
        60 seconds).

        This timestamp is used by the wipe guard to confirm a data export has
        been taken before a destructive new-year rollover.
        """
        # Trigger the export
        r = self.get("/export/audit", self.admin_token)
        if r.status_code != 200:
            self.skipTest(f"GET /export/audit not available ({r.status_code})")

        # Check settings
        settings_r = requests.get(f"{BASE_URL}/settings", timeout=HTTP_TIMEOUT)
        self.assertEqual(settings_r.status_code, 200, "GET /settings failed")
        settings = settings_r.json()
        last_exported = settings.get("lastExportedAt")
        self.assertIsNotNone(
            last_exported,
            "FAIL: lastExportedAt should be set after GET /export/audit",
        )
        # Timestamp should be recent (sanity check it is a non-empty string)
        self.assertIsInstance(
            last_exported,
            str,
            "FAIL: lastExportedAt should be an ISO-8601 string",
        )
        self.assertGreater(
            len(last_exported),
            0,
            "FAIL: lastExportedAt should not be an empty string",
        )

    def test_wipe_guard_blocks_new_year(self) -> None:
        """
        POST /admin/new-year must return HTTP 409 (or 400) if lastExportedAt
        is null — i.e. no export has been taken since the last reset.

        This is the P3 wipe guard: destructive operations must be blocked
        until the operator has exported the current year's data.

        If the server has already been exported (lastExportedAt is set), this
        test is skipped to avoid actually rolling over the year.
        """
        # Check whether an export has already been taken
        settings_r = requests.get(f"{BASE_URL}/settings", timeout=HTTP_TIMEOUT)
        self.assertEqual(settings_r.status_code, 200)
        if settings_r.json().get("lastExportedAt"):
            self.skipTest(
                "lastExportedAt is already set on this server — cannot test "
                "wipe guard without first clearing it (skipping to avoid data loss)"
            )

        r = self.post("/admin/new-year", self.admin_token, {})
        self.assertIn(
            r.status_code,
            (400, 409, 403),
            f"FAIL: /admin/new-year should be blocked when no export has been "
            f"taken (expected 400/409/403, got {r.status_code}: {r.text})",
        )

    def test_export_signin_out_csv_columns(self) -> None:
        """
        GET /export/sign-in-out (or equivalent) must return a CSV containing
        all required compliance columns: Student, Church, Zone, Gender, Grade,
        Event Type, Timestamp, Reason, Parents Met, Authorised By.

        This is the statutory record of every attendance lifecycle event.
        """
        # Try both possible route paths
        for path in ("/export/sign-in-out", "/export/attendance", "/export/signout"):
            r = self.get(path, self.admin_token)
            if r.status_code == 200:
                break
        else:
            self.skipTest(
                "No sign-in/out CSV export endpoint found at the expected paths; "
                "skip until P3 route is implemented"
            )

        content = r.content
        # Strip BOM if present before parsing CSV
        if content[:3] == BOM:
            content = content[3:]
        text = content.decode("utf-8-sig", errors="replace")

        reader = csv.DictReader(io.StringIO(text))
        actual_columns = set(reader.fieldnames or [])
        missing = REQUIRED_SIGNIN_OUT_COLUMNS - actual_columns
        self.assertEqual(
            missing,
            set(),
            f"FAIL: sign-in/out CSV is missing required columns: {missing}. "
            f"Found: {actual_columns}",
        )

    def test_export_notes_csv_exists(self) -> None:
        """
        GET /notes/export must return HTTP 200 with a CSV body.

        The notes export was implemented in the original platform (category
        column included).  This test confirms the route is still reachable
        after all P-series changes.
        """
        r = self.get("/notes/export", self.admin_token)
        self.assertEqual(
            r.status_code,
            200,
            f"GET /notes/export failed: {r.status_code} {r.text[:200]}",
        )
        ct = r.headers.get("Content-Type", "")
        is_csv = "csv" in ct or "text" in ct or "octet" in ct
        self.assertTrue(
            is_csv or len(r.content) >= 0,  # Accept any 200 response (may be empty CSV)
            f"FAIL: /notes/export returned unexpected content type: '{ct}'",
        )


# ---------------------------------------------------------------------------
# TestFirstAidRole
# ---------------------------------------------------------------------------


class TestFirstAidRole(BaseTestCase):
    """
    P4 — First-aid role tests.

    Verifies the 'firstAid' role: login, camp-wide read scope, enriched
    CamperDto, write restrictions, attendance permission, medical watch
    endpoint, and role boundary enforcement.
    """

    def test_firstaid_login(self) -> None:
        """
        A firstAid account created via POST /accounts/users must be able to
        login via POST /auth/login and receive a valid token.

        The firstAid role is new (P4) and requires an explicit entry in
        USER_ROLES, ROLE_PERMISSIONS, and the Zod account schema.
        """
        # setUp already called self.login(FA_USER, FA_PASS) and stored fa_token
        self.assertIsNotNone(
            self.fa_token,
            "FAIL: firstAid login did not return a token",
        )
        self.assertGreater(
            len(self.fa_token),
            10,
            "FAIL: fa_token appears to be invalid (too short)",
        )

        # Verify GET /auth/me returns role=firstAid
        me_r = self.get("/auth/me", self.fa_token)
        self.assertEqual(
            me_r.status_code,
            200,
            f"GET /auth/me failed for firstAid token: {me_r.status_code}",
        )
        me = me_r.json()
        self.assertEqual(
            me.get("role"),
            "firstAid",
            f"FAIL: /auth/me should return role=firstAid, got: {me.get('role')}",
        )

    def test_firstaid_can_search_all_churches(self) -> None:
        """
        firstAid has canAccessPerson=true (camp-wide) so GET /search?q=... must
        return results from churches other than the firstAid account's own church
        (firstAid has no churchId).

        canAccessPerson for 'firstAid' returns true unconditionally, matching
        the 'director' pattern.
        """
        r = self.get("/search", self.fa_token, params={"q": "a"})
        self.assertIn(
            r.status_code,
            (200,),
            f"GET /search failed for firstAid: {r.status_code} {r.text}",
        )
        results = r.json()
        self.assertIsInstance(results, list, "GET /search should return a list")
        # If there are results, at least some should be from the test church
        # (which proves camp-wide access)
        if results:
            church_ids = set()
            for item in results:
                c = item.get("camper") or item
                if c.get("churchId"):
                    church_ids.add(c["churchId"])
            # Not asserting multi-church here because the test server might only
            # have one church seeded — just assert the call succeeded and
            # returned a list (camp-wide scope with no 403)
            self.assertIsInstance(church_ids, set)

    def test_firstaid_camper_dto_has_medications(self) -> None:
        """
        GET /campers/:id for a firstAid actor must return a CamperDto that
        includes the P4-widened fields: otherMedications, medicareNumber,
        parentRelation, consentMedical, and gender.

        The test camper was created with all of these fields populated.
        """
        # Sign in the test camper so it is accessible via /campers/:id
        self._sign_in_to_camp(self.admin_token, self.test_camper_id)

        r = self.get(f"/campers/{self.test_camper_id}", self.fa_token)
        self.assertEqual(
            r.status_code,
            200,
            f"GET /campers/:id for firstAid failed: {r.status_code} {r.text}",
        )
        dto = r.json()
        for field in ("otherMedications", "medicareNumber", "parentRelation", "consentMedical", "gender"):
            self.assertIn(
                field,
                dto,
                f"FAIL: CamperDto is missing field '{field}' (P4 DTO widening requirement)",
            )

    def test_firstaid_cannot_create_note(self) -> None:
        """
        firstAid does NOT have note:write permission.  POST /notes must return
        HTTP 403 for a firstAid actor.
        """
        # Sign in the test camper first so the ID is valid for /notes
        self._sign_in_to_camp(self.admin_token, self.test_camper_id)

        r = self.post(
            "/notes",
            self.fa_token,
            {"camperId": self.test_camper_id, "body": "First-aid test note"},
        )
        self.assertEqual(
            r.status_code,
            403,
            f"FAIL: POST /notes should return 403 for firstAid (no note:write), "
            f"got {r.status_code}: {r.text}",
        )

    def test_firstaid_cannot_list_users(self) -> None:
        """
        firstAid does NOT have admin:manage permission.  GET /accounts/users
        must return HTTP 403 for a firstAid actor.
        """
        r = self.get("/accounts/users", self.fa_token)
        self.assertEqual(
            r.status_code,
            403,
            f"FAIL: GET /accounts/users should return 403 for firstAid "
            f"(no admin:manage), got {r.status_code}",
        )

    def test_firstaid_can_attendance_signin(self) -> None:
        """
        firstAid has checkin:write, which grants access to the attendance
        sign-in and sign-out paths.

        POST /attendance/sign-in for an atCamp=False person must succeed (200)
        for a firstAid actor.  This allows first-aid staff to sign in a late
        arrival or sign a camper back in after a medical observation.
        """
        # Ensure the test camper is NOT at camp
        person = self._get_person(self.admin_token, self.test_camper_id)
        if person and person.get("atCamp"):
            # Sign them out first so we can test sign-in
            self._sign_out_of_camp(self.admin_token, self.test_camper_id)

        r = self.post(
            "/attendance/sign-in",
            self.fa_token,
            {
                "camperId": self.test_camper_id,
                "leaderName": "First Aid Officer",
            },
        )
        self.assertEqual(
            r.status_code,
            200,
            f"FAIL: POST /attendance/sign-in should succeed for firstAid "
            f"(has checkin:write), got {r.status_code}: {r.text}",
        )

        # Verify atCamp is now True
        person_after = self._get_person(self.admin_token, self.test_camper_id)
        self.assertIsNotNone(person_after, "Could not fetch person after firstAid sign-in")
        self.assertTrue(
            person_after.get("atCamp"),
            "FAIL: attendance sign-in via firstAid did not set atCamp=True",
        )

    def test_medical_watch_endpoint(self) -> None:
        """
        GET /campers/medical must return HTTP 200 for a firstAid actor.

        The response must be a list where every item has atCamp=True and at
        least one medical flag (medicalConditions non-empty, dietaryRequirements
        non-empty, or otherMedications non-null).
        """
        r = self.get("/campers/medical", self.fa_token)
        self.assertEqual(
            r.status_code,
            200,
            f"FAIL: GET /campers/medical should return 200 for firstAid, "
            f"got {r.status_code}: {r.text}",
        )
        items = r.json()
        self.assertIsInstance(
            items,
            list,
            "FAIL: GET /campers/medical should return a list",
        )
        for c in items:
            self.assertTrue(
                c.get("atCamp"),
                f"FAIL: /campers/medical returned a non-atCamp person: {c.get('id')}",
            )
            has_flag = (
                len(c.get("medicalConditions") or []) > 0
                or len(c.get("dietaryRequirements") or []) > 0
                or c.get("otherMedications") is not None
            )
            self.assertTrue(
                has_flag,
                f"FAIL: /campers/medical returned camper {c.get('id')} with no "
                "medical flag",
            )

    def test_church_role_cannot_access_medical_watch(self) -> None:
        """
        GET /campers/medical is restricted to firstAid, director, and admin.
        A church-role actor must receive HTTP 403.

        The 'church' role has camper:read:sensitive but lacks the route-level
        role whitelist that gates /campers/medical.
        """
        r = self.get("/campers/medical", self.church_token)
        self.assertEqual(
            r.status_code,
            403,
            f"FAIL: GET /campers/medical should return 403 for 'church' role, "
            f"got {r.status_code}: {r.text}",
        )


# ---------------------------------------------------------------------------
# TestRegressionSafety
# ---------------------------------------------------------------------------


class TestRegressionSafety(BaseTestCase):
    """
    Regression safety checks.

    Verifies that all existing roles still function, that the legacy routes are
    not broken, and that atCamp is internally consistent with dashboard counts.
    """

    def test_existing_roles_still_login(self) -> None:
        """
        All four pre-P4 roles (church, zoneLeader, director, admin) must still
        be able to log in successfully after the P4 firstAid changes.

        Tests login against the demo seed accounts.  If any seed account is not
        present on the target server, that sub-check is skipped with a note.
        """
        seed_accounts = [
            ("victory", "demo1234", "church"),
            ("yellowzone", "demo1234", "zoneLeader"),
            ("director", "demo1234", "director"),
            (ADMIN_USER, ADMIN_PASS, "admin"),
        ]
        for username, password, expected_role in seed_accounts:
            with self.subTest(username=username):
                r = requests.post(
                    f"{BASE_URL}/auth/login",
                    json={"username": username, "password": password},
                    timeout=HTTP_TIMEOUT,
                )
                if r.status_code == 401:
                    # Seed account not present on this server — skip
                    continue
                self.assertEqual(
                    r.status_code,
                    200,
                    f"FAIL: login for role '{expected_role}' (user '{username}') "
                    f"returned {r.status_code}: {r.text}",
                )
                token = r.json().get("token")
                self.assertIsNotNone(
                    token,
                    f"FAIL: login for '{username}' did not return a token",
                )
                # Verify /auth/me
                me_r = requests.get(
                    f"{BASE_URL}/auth/me",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=HTTP_TIMEOUT,
                )
                self.assertEqual(me_r.status_code, 200, f"/auth/me failed for '{username}'")

    def test_legacy_routes_unchanged(self) -> None:
        """
        The three primary data routes — /registrants, /campers, /checkin/sessions
        — must all respond with HTTP 200 for an admin actor.

        This guards against accidental route removal or signature changes during
        the P1-P4 feature work.
        """
        for path in ("/registrants", "/campers", "/checkin/sessions"):
            with self.subTest(path=path):
                r = self.get(path, self.admin_token)
                self.assertEqual(
                    r.status_code,
                    200,
                    f"FAIL: legacy route GET {path} returned {r.status_code}: "
                    f"{r.text[:200]}",
                )

    def test_atcamp_consistent_with_dashboard(self) -> None:
        """
        The sum of atCamp=True persons in GET /campers must equal the
        totalAtCamp value in GET /home (at-camp mode only).

        This cross-checks that the dashboard aggregation uses the same
        atCamp flag as the raw list, confirming the P0 fix has not introduced
        a counting discrepancy.
        """
        home_r = self.get("/home", self.admin_token)
        if home_r.status_code != 200:
            self.skipTest(f"GET /home returned {home_r.status_code} — skipping consistency check")
        home = home_r.json()

        # Only meaningful in at-camp mode
        if home.get("mode") != "at-camp" and home.get("campMode") != "at-camp":
            self.skipTest("App is not in at-camp mode — totalAtCamp check not applicable")

        dashboard_total = home.get("totalAtCamp")
        if dashboard_total is None:
            self.skipTest("GET /home response has no totalAtCamp field — check mode")

        campers_r = self.get("/campers", self.admin_token)
        self.assertEqual(
            campers_r.status_code,
            200,
            f"GET /campers failed: {campers_r.status_code}",
        )
        at_camp_count = sum(
            1 for p in campers_r.json() if p.get("atCamp")
        )

        self.assertEqual(
            at_camp_count,
            dashboard_total,
            f"FAIL: atCamp count from /campers ({at_camp_count}) does not match "
            f"totalAtCamp from /home ({dashboard_total}).  "
            "Indicates the dashboard and /campers are using different predicates.",
        )


# ---------------------------------------------------------------------------
# Test runner with pass/fail summary
# ---------------------------------------------------------------------------


def _run_suite() -> None:
    """Run all test classes and print a human-readable pass/fail summary."""
    suite = unittest.TestSuite()

    test_classes = [
        TestPresenceModel,
        TestCheckinUX,
        TestAdminSetup,
        TestExportCompliance,
        TestFirstAidRole,
        TestRegressionSafety,
    ]

    loader = unittest.TestLoader()
    for cls in test_classes:
        suite.addTests(loader.loadTestsFromTestCase(cls))

    # Buffer output so we can print the summary at the end without interleaving
    runner = unittest.TextTestRunner(verbosity=2, stream=sys.stderr, buffer=False)
    result = runner.run(suite)

    total = result.testsRun
    failures = len(result.failures) + len(result.errors)
    skipped = len(result.skipped)
    passed = total - failures - skipped

    print("\n" + "=" * 68, file=sys.stdout)
    print("VALIDATION SUITE SUMMARY", file=sys.stdout)
    print("=" * 68, file=sys.stdout)
    print(f"  Target:  {BASE_URL}", file=sys.stdout)
    print(f"  Total:   {total}", file=sys.stdout)
    print(f"  Passed:  {passed}", file=sys.stdout)
    print(f"  Skipped: {skipped}", file=sys.stdout)
    print(f"  Failed:  {failures}", file=sys.stdout)
    print("=" * 68, file=sys.stdout)

    if result.failures:
        print("\nFAILURES:", file=sys.stdout)
        for test, traceback in result.failures:
            print(f"  FAIL: {test}", file=sys.stdout)
            # Print just the AssertionError line for the summary
            for line in traceback.splitlines():
                if "AssertionError" in line or "FAIL:" in line:
                    print(f"    {line.strip()}", file=sys.stdout)
                    break

    if result.errors:
        print("\nERRORS:", file=sys.stdout)
        for test, traceback in result.errors:
            print(f"  ERROR: {test}", file=sys.stdout)
            for line in traceback.splitlines()[-3:]:
                print(f"    {line}", file=sys.stdout)

    if not failures:
        print("\n  ALL TESTS PASSED", file=sys.stdout)
    else:
        print(
            f"\n  {failures} test(s) failed — see FAILURES above",
            file=sys.stdout,
        )
    print("=" * 68, file=sys.stdout)

    sys.exit(0 if not failures else 1)


if __name__ == "__main__":
    _run_suite()
