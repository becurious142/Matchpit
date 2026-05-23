import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Targets: Stage 1 = 1k, Stage 2 = 2.5k, Stage 3 = 5k concurrent clients
export const options = {
  scenarios: {
    stage_1: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 1000 },
        { duration: '30s', target: 1000 },
      ],
      gracefulRampDown: '10s',
    },
    stage_2: {
      executor: 'ramping-vus',
      startVUs: 1000,
      startTime: '60s',
      stages: [
        { duration: '30s', target: 2500 },
        { duration: '30s', target: 2500 },
      ],
    },
    stage_3: {
      executor: 'ramping-vus',
      startVUs: 2500,
      startTime: '120s',
      stages: [
        { duration: '30s', target: 5000 },
        { duration: '1m', target: 5000 },
        { duration: '10s', target: 0 },
      ],
    },
  },
};

const BASE_WS_URL = __ENV.WS_URL || 'ws://localhost:3000/api';

export default function () {
  const matchId = `test_match_${Math.floor(Math.random() * 10)}`;
  const url = `${BASE_WS_URL}/matches/${matchId}/stream?token=test_token`;

  const res = ws.connect(url, null, function (socket) {
    socket.on('open', function () {
      // Intentionally simulate a reconnect storm by closing shortly after connecting for some clients
      if (Math.random() < 0.2) { // 20% of clients drop connection
        socket.setTimeout(function () {
          socket.close();
        }, Math.random() * 5000); 
      }
    });

    socket.on('message', function (msg) {
      // Validate we receive heartbeats or standard SSE payload
      const str = msg.toString();
      if (str.includes("data:")) {
        // successfully parsed SSE frame
      }
    });

    socket.on('close', function () {
      // Disconnected
    });

    socket.on('error', function (e) {
      if (e.error() != "websocket: close sent") {
        console.log('An unexpected error occurred: ', e.error());
      }
    });
  });

  check(res, { 'status is 101': (r) => r && r.status === 101 });
  
  sleep(1);
}
