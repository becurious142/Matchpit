import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// STAGE 3 Targets: 1000 concurrent bookings
export const options = {
  scenarios: {
    stage_1: {
      executor: 'constant-vus',
      vus: 100,
      duration: '30s',
      gracefulStop: '10s',
    },
    stage_2: {
      executor: 'constant-vus',
      vus: 500,
      duration: '30s',
      startTime: '40s',
      gracefulStop: '10s',
    },
    stage_3: {
      executor: 'constant-vus',
      vus: 1000,
      duration: '1m',
      startTime: '80s',
      gracefulStop: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // less than 1% errors
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

export default function () {
  // Use a pre-seeded match ID from the test database
  const matchId = "test_match_id"; 
  const userId = `load_test_user_${__VU}_${__ITER}`;
  
  const payload = JSON.stringify({
    matchId,
    userId,
    idempotencyKey: randomString(20),
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      // In a real test, we would generate a valid Clerk token or use a test auth bypass
      'Authorization': `Bearer test_token`,
    },
  };

  const res = http.post(`${BASE_URL}/matches/join`, payload, params);

  // Note: Expecting 409 Conflict for most VUs because slots will fill up.
  // The goal is to ensure NO duplicates and NO crashes.
  check(res, {
    'is status 200 or 409': (r) => r.status === 200 || r.status === 409,
    'not 500': (r) => r.status !== 500,
  });

  // Short sleep to simulate user think-time
  sleep(1);
}
