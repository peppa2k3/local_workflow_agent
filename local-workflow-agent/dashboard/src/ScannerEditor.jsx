import { useEffect, useState } from "react";
import { Field } from "./components.jsx";
import { api } from "./scanner-api.js";

const thresholds = [
  ["minViews", "Lượt xem tối thiểu", 0, 9007199254740991],
  ["minResolution", "Cạnh ngắn tối thiểu (px)", 1, 8192],
  ["minWidth", "Rộng tối thiểu (px)", 1, 8192],
  ["minHeight", "Cao tối thiểu (px)", 1, 8192],
  ["minDurationSeconds", "Thời lượng từ (giây)", 0, 14399],
  ["maxDurationSeconds", "Thời lượng dưới (giây)", 1, 14400],
  ["minDays", "Tuổi video từ (ngày)", 0, 36500],
  ["maxDays", "Tuổi video đến (ngày)", 0, 36500],
  ["minutes", "Chu kỳ quét (phút)", 1, 1440],
  ["requestsPerDay", "Yêu cầu API mỗi ngày", 1, 100],
];
const kinds = ["subtitles", "automatic_captions"];
function SaveForm({ id, title, part, ready, read, children, button, note }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api("settings", {
        part,
        value: read(new FormData(event.currentTarget)),
      });
      setMessage("Đã lưu. Áp dụng từ lượt quét tiếp theo.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form id={id} className="panel" onSubmit={save}>
      <h2>{title}</h2>
      <fieldset className="editor-fields" disabled={!ready || saving}>
        {children}
      </fieldset>
      <button className="primary" disabled={!ready || saving}>
        {button}
      </button>
      <p role="status" id={note}>
        {message}
      </p>
    </form>
  );
}

export default function ScannerEditor() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("settings")
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, []);
  const config = settings?.config || {};
  function readConfig(form) {
    const value = { ...config };
    for (const [key] of thresholds) {
      if (key !== "minWidth" && key !== "minHeight")
        value[key] = Number(form.get(key));
    }
    const width = form.get("minWidth"),
      height = form.get("minHeight");
    if (Boolean(width) !== Boolean(height))
      throw Error("Nhập cả chiều rộng và chiều cao, hoặc để trống cả hai");
    value.resolution = width
      ? { width: Number(width), height: Number(height) }
      : null;
    value.subtitleLanguages = form
      .get("subtitleLanguages")
      .split(",")
      .map((s) => s.trim());
    value.subtitleKinds = kinds.filter((kind) => form.has(kind));
    return value;
  }
  const values = {
    ...config,
    minWidth: config.resolution?.width,
    minHeight: config.resolution?.height,
  };
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div className="scanner-editor" key={settings ? "ready" : "loading"}>
        <SaveForm
          id="config"
          title="Điều kiện lọc"
          part="config"
          ready={!!settings}
          read={readConfig}
          button="Lưu bộ lọc"
          note="configNote"
        >
          <div className="scanner-thresholds">
            {thresholds.map(([key, label, min, max]) => {
              const optional = key === "minWidth" || key === "minHeight";
              return (
                <Field key={key} label={label}>
                  <input
                    id={key}
                    name={key}
                    type="number"
                    min={min}
                    max={max}
                    required={!optional}
                    placeholder={optional ? "Tùy chọn" : undefined}
                    defaultValue={values[key] ?? ""}
                  />
                </Field>
              );
            })}
          </div>
          <Field label="Ngôn ngữ phụ đề (cách nhau bằng dấu phẩy)">
            <input
              id="subtitleLanguages"
              name="subtitleLanguages"
              required
              placeholder="vi, en"
              defaultValue={config.subtitleLanguages?.join(", ") || ""}
            />
          </Field>
          <fieldset>
            <legend>Loại phụ đề</legend>
            {kinds.map((kind, index) => (
              <label className="check" key={kind}>
                <input
                  type="checkbox"
                  name={kind}
                  id={kind}
                  defaultChecked={config.subtitleKinds?.includes(kind)}
                />
                {index ? "Tự động" : "Thủ công"}
              </label>
            ))}
          </fieldset>
        </SaveForm>
        <SaveForm
          id="keywordForm"
          title="Nhóm từ khóa"
          part="keywords"
          ready={!!settings}
          read={(form) => form.get("keywords")}
          button="Lưu từ khóa"
          note="keywordNote"
        >
          <label>
            Nội dung keywords.txt{" "}
            <small>
              Mỗi nhóm bắt đầu bằng [ma-nhom]. Nhập một cụm từ trên mỗi dòng.
            </small>
            <textarea
              id="keywords"
              name="keywords"
              rows="9"
              required
              spellCheck="false"
              defaultValue={settings?.keywords || ""}
            />
          </label>
        </SaveForm>
      </div>
    </>
  );
}
