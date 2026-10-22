const http = require('node:http');
const assert = require('node:assert/strict');
const { createStore } = require('../../src/remote/store');
const { createControlServer, addUser } = require('../../src/remote/server');
async function fixture(commandFactory) {
  const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port; await new Promise(r => probe.close(r));
  const origin = `http://127.0.0.1:${port}`, store = createStore(':memory:');
  const alice = await addUser(store, 'alice@example.test', 'long-password-alice');
  const bob = await addUser(store, 'bob@example.test', 'long-password-bob');
  const server = createControlServer({ store, publicUrl: origin, allowHttp: true, commandApi: commandFactory?.(store) });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  function browser() {
    let cookie = '', csrf = '';
    return async (route, data, expected = 200, options = {}) => {
      const res = await fetch(origin + route, { method: data === undefined ? 'GET' : 'POST',
        headers: { origin, 'content-type': 'application/json', cookie, 'x-csrf-token': csrf, ...options.headers }, body: data === undefined ? undefined : JSON.stringify(data) });
      if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      const result = await res.json(); assert.equal(res.status, expected, JSON.stringify(result)); if (result.csrf) csrf = result.csrf; return result;
    };
  }
  return { origin, store, alice, bob, server, browser, async close() { await new Promise(r => { server.close(r); server.closeAllConnections(); }); store.close(); } };
}
module.exports = { fixture };
