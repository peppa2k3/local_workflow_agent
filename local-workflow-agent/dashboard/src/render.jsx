import { renderToString } from "react-dom/server";
import { Navigation } from "./components.jsx";
import Scenarios from "./pages/Scenarios.jsx";
import Content from "./pages/Content.jsx";
import Remote from "./pages/Remote.jsx";
import Scanner from "./pages/Scanner.jsx";
import common from "./styles/workspace.css?raw";
import scenariosCss from "./styles/index.css?raw";
import contentCss from "./styles/content.css?raw";
import scenariosController from "./controllers/index.js?raw";
import contentController from "./controllers/content.js?raw";

const pages = [
  {
    name: "index",
    path: "/",
    title: "Kịch bản",
    Page: Scenarios,
    css: scenariosCss,
    controller: scenariosController,
    scripts: ["issues"],
  },
  {
    name: "content",
    path: "/content",
    title: "Kho nội dung",
    Page: Content,
    css: contentCss,
    controller: contentController,
    scripts: ["issues"],
  },
  {
    name: "remote",
    path: "/remote",
    title: "Điều khiển từ xa",
    Page: Remote,
    scripts: ["remote", "issues"],
  },
  {
    name: "scanner",
    path: "/scanner",
    title: "Quét YouTube",
    Page: Scanner,
    scripts: ["scanner"],
  },
];

export function renderDashboard() {
  return pages.map(({ name, path, title, Page, css, controller, scripts }) => {
    const html = renderToString(
      <html lang="vi">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta
            name="local-agent-session"
            content="__LOCAL_AGENT_DASHBOARD_TOKEN__"
          />
          <title>{title} · Workflow Studio</title>
          {css ? (
            <style>{css}</style>
          ) : (
            <link rel="stylesheet" href="/remote.css" />
          )}
          <style>{common}</style>
          {scripts.map((file) => (
            <script key={file} defer src={"/" + file + ".js"} />
          ))}
        </head>
        <body className={"workspace " + name}>
          <Navigation current={path} />
          <Page />
          {controller && (
            <script dangerouslySetInnerHTML={{ __html: controller }} />
          )}
        </body>
      </html>,
    );
    return [
      name + ".html",
      "<!doctype html>\n<!-- Generated from dashboard/src by npm run build:dashboard -->\n" +
        html +
        "\n",
    ];
  });
}
