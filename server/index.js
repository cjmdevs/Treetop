const app = require('./app');
const PORT = process.env.PORT || 3001;
// Bind to 0.0.0.0 so the server is reachable via the machine's LAN IP,
// not just localhost — required for cross-machine LAN access.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Treetop Management API → http://0.0.0.0:${PORT}  (LAN-accessible)`);
});
