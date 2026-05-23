import http from 'k6/http';
import { check, sleep } from 'k6';

// Targets: Simulate 50 concurrent duplicate webhooks hitting the server at the exact same time
export const options = {
  scenarios: {
    replay_attack: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 10,
      maxDuration: '30s',
    },
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

export default function () {
  const paymentId = `pay_${Math.floor(Math.random() * 100)}`; // High collision rate intentionally
  
  const payload = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: paymentId,
          amount: 100000,
          currency: "INR",
          status: "captured",
          notes: {
            matchId: "test_match_123",
            userId: "test_user_456"
          }
        }
      }
    }
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Razorpay-Signature': 'mock_signature_to_bypass_validation', // Assumes a test bypass is enabled
      // The idempotency middleware relies on request body hash, so exact same body = same hash
    },
  };

  const res = http.post(`${BASE_URL}/payments/webhook`, payload, params);

  // Status can be 200 (processed/replayed) or 409 (concurrent request)
  check(res, {
    'handled gracefully (no 500)': (r) => r.status !== 500,
  });

  // Short sleep to allow the queue to drain
  sleep(1);
}
