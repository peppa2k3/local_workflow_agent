export function AssignmentSettings({ rule, api, refresh }) {
  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api('/api/scanner/assignment', {
        enabled: form.autoEnabled.checked,
        retryHours: Number(form.retryHours.value),
      });
      toast.success('Đã lưu cài đặt giao job.');
      await refresh();
    } catch (error) {
      toast.error(error.message);
    }
  }
  return (
    <section className="panel">
      <h2>Giao việc tự động</h2>
      <form id="assignment" onSubmit={save}>
        <label>
          <input id="autoEnabled" type="checkbox" defaultChecked={rule.enabled} /> Tự tạo và giao job từ kho
          video
        </label>
        <label>
          Chờ khi hết slot (giờ)
          <input
            id="retryHours"
            type="number"
            min={1 / 60}
            max="720"
            step="any"
            defaultValue={rule.retryHours}
            required
          />
        </label>
        <button className="primary">Lưu cài đặt</button>
      </form>
    </section>
  );
}
