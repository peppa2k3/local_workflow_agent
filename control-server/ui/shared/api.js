export function createApi(getToken, onUnauthorized) {
  return async function api(route, data) {
    const response = await fetch(route, {
      method: data === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-csrf-token': getToken() || '' },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(18000),
    });
    if (response.status === 401) onUnauthorized();
    const body = await response.json();
    if (!response.ok) throw Error(body.error || 'Yêu cầu thất bại.');
    return body;
  };
}
