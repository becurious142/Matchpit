import http from 'k6/http';
import { check, sleep } from 'k6';

// Targets: Stage 1 = 50 req/s, Stage 2 = 100 req/s, Stage 3 = 200 req/s
export const options = {
  scenarios: {
    stage_1: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
    stage_2: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '30s',
      startTime: '30s',
      preAllocatedVUs: 100,
      maxVUs: 200,
    },
    stage_3: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '1m',
      startTime: '60s',
      preAllocatedVUs: 200,
      maxVUs: 400,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], 
    http_req_duration: ['p(95)<200'], // Discovery should be fast (<200ms) due to caching
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

// Bounding boxes for Jaipur and Delhi NCR
const REGIONS = [
  { latMin: 26.75, latMax: 26.95, lngMin: 75.70, lngMax: 75.90 }, // Jaipur
  { latMin: 28.35, latMax: 28.50, lngMin: 76.95, lngMax: 77.10 }, // Gurgaon
];

function getRandomCoordinate(min, max) {
  return min + Math.random() * (max - min);
}

export default function () {
  // Pick a random region to simulate realistic hot-spotting
  const region = REGIONS[Math.floor(Math.random() * REGIONS.length)];
  const lat = getRandomCoordinate(region.latMin, region.latMax);
  const lng = getRandomCoordinate(region.lngMin, region.lngMax);
  const radius = 5; // 5km
  
  const endpoint = Math.random() > 0.5 ? 'venues' : 'matches';

  const res = http.get(`${BASE_URL}/discovery/nearby-${endpoint}?lat=${lat}&lng=${lng}&radius=${radius}&limit=20`);

  check(res, {
    'is status 200': (r) => r.status === 200,
  });
}
