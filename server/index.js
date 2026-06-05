const app = require('./app');
const { checkBootstrap } = require('./bootstrap');

const PORT = process.env.PORT || 3001;

// Run bootstrap check after DB init (which happens inside require('./app')).
// If no admin exists, this prints the bootstrap token to the console and writes
// it to server/BOOTSTRAP_TOKEN.txt.
checkBootstrap();

// Bind to 0.0.0.0 so the server is reachable via the machine's LAN IP,
// not just localhost — required for cross-machine LAN access.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Treetop Management API → http://0.0.0.0:${PORT}  (LAN-accessible)`);
});
