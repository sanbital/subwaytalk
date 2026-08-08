import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

/* canonical production entry — index.html / admin / advertiser 모두 이 번들을 쓴다.
   화면 선택은 runtime/route-bootstrap.js 가 경로에 따라 수행한다. */
const host = document.getElementById("root");
if (host) createRoot(host).render(React.createElement(App));
