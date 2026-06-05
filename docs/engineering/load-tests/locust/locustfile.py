"""
Scenario 2.8 — "Realistic rep day" behavioural mix for Orbit.

Models the actual cadence the mobile app produces (see use-active-tracking.ts /
HomeScreen.tsx): a rep starts a session, pings location, polls sessions every
~30s (the whole-org poll, audit C6), reloads "today" every ~60s, occasionally
checks in/out and creates an order. A smaller pool of managers watches the
dashboard.

Run:  cd docs/engineering/load-tests/locust && locust
Then open http://localhost:8089 and set users/spawn rate.

Env:
  BASE_URL, ORG_ID, PASSWORD, REP_EMAIL, MANAGER_EMAIL
  REP_EMAILS  optional JSON list to spread logins across many seeded reps
"""
import json
import os
import random
import time

from locust import HttpUser, task, between, events

BASE_URL = os.getenv("BASE_URL", "http://localhost:9000")
ORG_ID = os.getenv("ORG_ID", "mithtech")
PASSWORD = os.getenv("PASSWORD", "admin123")
REP_EMAIL = os.getenv("REP_EMAIL", "rep1@acme-fieldsales.test")
MANAGER_EMAIL = os.getenv("MANAGER_EMAIL", "manager@acme-fieldsales.test")
REP_EMAILS = json.loads(os.getenv("REP_EMAILS", "[]")) or [REP_EMAIL]


def _login(client, email):
    r = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD, "organisationId": ORG_ID},
        name="login",
    )
    if r.status_code != 200:
        return None
    return r.json().get("token")


class FieldRep(HttpUser):
    """Most of your load. One Locust user == one rep's phone."""
    host = BASE_URL
    wait_time = between(1, 3)

    def on_start(self):
        self.email = random.choice(REP_EMAILS)
        self.token = _login(self.client, self.email)
        self.h = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        # consent + session so pings are accepted
        self.client.post("/api/v1/tracking", json={"action": "record_consent", "granted": True}, headers=self.h, name="consent")
        self.client.post("/api/v1/tracking", json={"action": "start_session", "latitude": 13.0, "longitude": 77.55}, headers=self.h, name="start_session")
        self._last_session_poll = 0
        self._last_today = 0

    @task(20)
    def ping(self):
        body = {
            "action": "record_pings",
            "pings": [{
                "id": f"ping_{self.email}_{int(time.time()*1000)}",
                "latitude": 13.0 + random.random() * 0.05,
                "longitude": 77.55 + random.random() * 0.05,
                "accuracyMeters": 5,
                "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }],
        }
        self.client.post("/api/v1/tracking", json=body, headers=self.h, name="record_pings")

    @task(6)
    def session_poll(self):
        # The expensive whole-org poll the app does every 30s (audit C6).
        self.client.get("/api/v1/tracking", headers=self.h, name="list_sessions")

    @task(4)
    def today(self):
        self.client.get("/api/v1/me/today", headers=self.h, name="me/today")

    @task(2)
    def my_orders(self):
        self.client.get("/api/v1/field-orders", headers=self.h, name="field-orders(rep)")

    @task(1)
    def create_order(self):
        outlets = self.client.get("/api/v1/outlets", headers=self.h, name="outlets").json()
        products = self.client.get("/api/v1/products", headers=self.h, name="products").json()
        if not outlets.get("items") or not products.get("items"):
            return
        body = {
            "outletId": outlets["items"][0]["id"],
            "source": "online",
            "lines": [{"productId": products["items"][0]["id"], "quantity": 1}],
        }
        self.client.post("/api/v1/field-orders", json=body, headers=self.h, name="create_order")


class Manager(HttpUser):
    """~1 per 20 reps. Dashboard reads + live map seed."""
    host = BASE_URL
    wait_time = between(3, 8)
    weight = 1  # set FieldRep weight higher when launching, or use --class-picker

    def on_start(self):
        self.token = _login(self.client, MANAGER_EMAIL)
        self.h = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    @task(3)
    def summary(self):
        self.client.get("/api/v1/reports/summary", headers=self.h, name="reports/summary")

    @task(3)
    def rep_activity(self):
        self.client.get("/api/v1/reports/rep-activity", headers=self.h, name="reports/rep-activity")

    @task(4)
    def live_map_seed(self):
        self.client.get("/api/v1/tracking/latest", headers=self.h, name="tracking/latest")

    @task(2)
    def all_orders(self):
        self.client.get("/api/v1/field-orders", headers=self.h, name="field-orders(mgr)")


@events.quitting.add_listener
def _(environment, **_kw):
    # Fail CI if p95 of the rep day blows past target (matches load plan §4).
    if environment.stats.total.get_response_time_percentile(0.95) > 800:
        environment.process_exit_code = 1
