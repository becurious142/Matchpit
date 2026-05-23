import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    sse_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 500 }, // Simulate 500 concurrent connections
        { duration: '1m', target: 500 },
        { duration: '30s', target: 0 },
      ],
    },
  },
};

export default function () {
  const url = 'http://localhost:8080/api/v1/realtime/discovery?lat=12.9716&lng=77.5946&sport=football';

  const params = {
    headers: {
      'Accept': 'text/event-stream',
      'Authorization': 'Bearer test-token',
    },
    timeout: '120s',
  };

  const res = http.get(url, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'content type is event-stream': (r) => r.headers['Content-Type'] === 'text/event-stream',
  });

  sleep(1);
}
