export async function api(name, data) {
  const response = await fetch('/api/scanner/' + name, { method: data ? 'POST' : 'GET',
    headers: { 'x-local-agent-session': document.querySelector('meta[name=local-agent-session]').content, 'content-type':'application/json' },
    body: data ? JSON.stringify(data) : undefined });
  const value = await response.json();
  if (!response.ok) throw Error(value.error);
  return value;
}
