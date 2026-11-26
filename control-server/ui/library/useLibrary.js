import { useCallback, useEffect, useRef, useState } from 'react';
import { createApi } from '../shared/api.js';

export function useLibrary() {
  const token = useRef('');
  const [api] = useState(() =>
    createApi(
      () => token.current,
      () => {
        throw Error('Mở trang Thiết bị và đăng nhập để xem kho video.');
      },
    ),
  );
  const [rule, setRule] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState({ q: '', used: '', page: 0, pageSize: 12 });
  const [data, setData] = useState({ videos: [], total: 0, devices: [], quotas: [] });
  const [selected, setSelected] = useState(new Set());
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    async function loadRule() {
      token.current = (await api('/api/me')).csrf;
      const value = await api('/api/scanner/assignment');
      if (active) setRule(value);
    }
    loadRule().catch((error) => toast.error(error.message));
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    const timer = setTimeout(
      () => setFilter((old) => (old.q === query ? old : { ...old, q: query, page: 0 })),
      200,
    );
    return () => clearTimeout(timer);
  }, [query]);
  const currentFilter = useRef(filter);
  currentFilter.current = filter;
  const refresh = useCallback(async () => {
    const filter = currentFilter.current;
    if (!rule) return;
    const request = ++generation.current;
    const [library, machines, usage] = await Promise.all([
      api('/api/scanner/videos?' + new URLSearchParams(filter)),
      api('/api/devices'),
      api('/api/scanner/quotas'),
    ]);
    if (generation.current !== request) return;
    const lastPage = Math.max(0, Math.ceil(library.total / filter.pageSize) - 1);
    if (filter.page > lastPage) {
      setFilter((old) => ({ ...old, page: lastPage }));
      return;
    }
    setData({
      ...library,
      pageIndex: filter.page,
      size: filter.pageSize,
      devices: machines.devices.filter((device) => !device.revoked),
      ...usage,
    });
    setSelected(new Set());
  }, [api, rule]);
  useEffect(() => {
    refresh().catch((error) => toast.error(error.message));
    return () => {
      generation.current++;
    };
  }, [refresh, filter]);

  return { api, rule, query, setQuery, filter, setFilter, data, refresh, selected, setSelected };
}
