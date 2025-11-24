import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 중요: '/리포지토리-이름/' 형식으로 설정해야 합니다.
  // 예: 리포지토리 이름이 'cellular-automata'라면 base: '/cellular-automata/'
  base: "/",
});
