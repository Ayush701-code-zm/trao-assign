# Optional: local company site fixtures for evaluate against localhost
# Usage: node samples/fixture-server.js
# Then point cases at http://localhost:8099/acme/

import http from 'http';

const acme = `<!doctype html><html><head><title>Acme Corp</title></head>
<body>
  <h1>Acme builds developer tools</h1>
  <p>We make APIs faster for product teams.</p>
  <a href="/acme/about">About</a>
  <a href="/acme/careers">Careers</a>
  <a href="/acme/how-we-hire">How we hire</a>
</body></html>`;

const about = `<!doctype html><html><head><title>About Acme</title></head>
<body><h1>About</h1><p>Acme is a B2B SaaS company focused on API observability.</p></body></html>`;

const careers = `<!doctype html><html><head><title>Careers</title></head>
<body><h1>Careers at Acme</h1><p>We are hiring engineers across the stack.</p>
<a href="/acme/how-we-hire">Read how we hire</a></body></html>`;

const hire = `<!doctype html><html><head><title>How we hire</title></head>
<body>
  <h1>How we hire</h1>
  <ol>
    <li>Recruiter screen</li>
    <li>Take-home exercise (3 hours)</li>
    <li>System design interview</li>
    <li>Behavioural panel</li>
  </ol>
</body></html>`;

const routes = {
  '/acme/': acme,
  '/acme': acme,
  '/acme/about': about,
  '/acme/careers': careers,
  '/acme/how-we-hire': hire,
};

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  const body = routes[path];
  if (!body) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
});

server.listen(8099, () => {
  console.log('Fixture company site on http://localhost:8099/acme/');
});
