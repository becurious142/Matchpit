import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 }, // ramp up
    { duration: '1m', target: 50 },  // steady state
    { duration: '30s', target: 0 },  // ramp down
  ],
};

export default function () {
  const url = 'http://localhost:8080/api/bookings';
  
  const payload = JSON.stringify({
    venueId: 'test-venue-id',
    slotIds: ['test-slot-1', 'test-slot-2'],
    sport: 'football',
    razorpayOrderId: 'order_test123',
    razorpayPaymentId: 'pay_test123',
    razorpaySignature: 'sig_test123'
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token' // Needs a valid mock token
    },
  };

  const res = http.post(url, payload, params);
  
  check(res, {
    'is status 201 or 409 (conflict)': (r) => r.status === 201 || r.status === 409,
  });

  sleep(1);
}
