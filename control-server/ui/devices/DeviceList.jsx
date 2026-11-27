export function DeviceList({ devices, selected, onSelect }) {
  if (!devices.length) return <p className="muted">Chưa ghép thiết bị nào.</p>;
  return devices.map((device) => (
    <button
      key={device.id}
      className={'device' + (device.id === selected ? ' selected' : '')}
      aria-pressed={device.id === selected}
      onClick={() => onSelect(device.id)}
    >
      <strong>{device.name}</strong>
      <span className={'badge ' + (device.online ? 'online' : 'offline')}>
        {device.revoked ? 'Đã thu hồi' : device.online ? 'Online' : 'Offline'}
      </span>
    </button>
  ));
}
