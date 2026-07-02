
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8787';

async function test() {
  // First, log in to get a token
  console.log('Logging in...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@techhub.in', password: 'admin123' }),
  });
  const loginData = await loginRes.json();
  console.log('Login response:', loginData);

  const token = loginData.token;
  console.log('Token:', token ? 'Yes' : 'No');

  // Let's get centers and components first
  console.log('\nGetting centers...');
  const centersRes = await fetch(`${BASE_URL}/api/centers`);
  const centers = await centersRes.json();
  console.log('Centers:', centers);

  console.log('\nGetting components...');
  const componentsRes = await fetch(`${BASE_URL}/api/components`);
  const components = await componentsRes.json();
  console.log('Components:', components);

  if (components.length === 0) {
    console.log('No components to test with!');
    return;
  }

  // Test POST /api/replenishment-requests
  console.log('\nTesting POST /api/replenishment-requests...');
  const payload = {
    componentId: components[0].id,
    centerId: components[0].center_id,
    requiredQuantity: 5,
    reason: 'Test replenishment'
  };
  console.log('Payload:', payload);

  const res = await fetch(`${BASE_URL}/api/replenishment-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  console.log('Response status:', res.status);
  const data = await res.text();
  console.log('Response data:', data);
}

test().catch(console.error);
