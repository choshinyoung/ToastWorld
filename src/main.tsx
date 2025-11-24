import React from "react";
import ReactDOM from "react-dom/client";
import CellularAutomataGame from "./index"; // 같은 src 폴더 내에 있다고 가정
import "./index.css"; // Tailwind 디렉티브가 포함된 CSS 파일 (없다면 생략 가능하나 스타일 적용을 위해 권장)

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CellularAutomataGame />
  </React.StrictMode>
);
