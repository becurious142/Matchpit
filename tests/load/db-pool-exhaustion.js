import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Targets: Simulate high volume of expensive transactions that saturate the PgBouncer pool
export const options = {
  scenarios: {
    pool_saturation: {
      executor: 'constant-arrival-rate',
      rate: 150, // 150 transactions per second (which take 100-200ms each)
      timeUnit: '1s',
      duration: '45s',
      preAllocatedVUs: 200,
      maxVUs: 500,
    },
  },
  thresholds: {
    // We actually expect HTTP 503s or timeouts when the pool is exhausted.
    // The test validates that the server DOES NOT crash, but gracefully returns 503 or 504.
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

export default function () {
  const matchId = `expensive_match_${Math.floor(Math.random() * 5)}`; 
  const userId = `user_${randomString(10)}`;
  
  const payload = JSON.stringify({
    matchId,
    userId,
    idempotencyKey: randomString(20),
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer test_token`,
      'X-Test-Force-Slow-Tx': 'true', // Optional hook to make the server sleep inside the transaction
    },
    timeout: '5s', // Short timeout to trigger 504s quickly when pool blocks
  };

  const res = http.post(`${BASE_URL}/matches/join`, payload, params);

  // We are looking to see if the process stays alive and properly handles the pool exhaustion
  // 503 or 504 are acceptable during extreme pool saturation.
  check(res, {
    'process survived (returned a response)': (r) => r.status > 0,
    'graceful degradation (409/503/504)': (r) => [200, 409, 503, 504].includes(r.status),
  });
}
