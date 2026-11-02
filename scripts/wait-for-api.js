// Used by `npm run dev`: the frontend starts once the API accepts connections, so a browser
// tab that is already open doesn't call the API while it's still starting. If the API never
// comes up (its own output says why), the frontend starts anyway after the timeout.
const net = require('node:net');

const PORT = Number(process.env.API_PORT) || 5000;
const TIMEOUT_MS = 60_000;
const RETRY_MS = 250;
const started = Date.now();

function tryConnect() {
  const socket = net.connect(PORT, 'localhost');
  socket.once('connect', () => {
    socket.destroy();
    process.exit(0);
  });
  socket.once('error', () => {
    socket.destroy();
    if (Date.now() - started >= TIMEOUT_MS) {
      console.error(`API is not answering on port ${PORT}; starting the frontend anyway.`);
      process.exit(0);
    }
    setTimeout(tryConnect, RETRY_MS);
  });
}

tryConnect();
