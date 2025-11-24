제공된 소스 코드와 요청 사항을 반영하여 작성한 `README.md`입니다.

***

# Cellular Automata DSL Sandbox

## 🚀 프로젝트 소개: 게임, 그 자체가 예술이 되다
이 프로젝트는 단순히 즐기는 게임을 넘어, 플레이어가 세계의 법칙을 직접 코딩하고 창조하는 **프로그래밍 가능한 예술(Programmable Art)** 플랫폼입니다.

기존 게임이 개발자가 만든 규칙 안에서 노는 것이라면, 이 샌드박스는 사용자가 **DSL(Domain Specific Language)**을 통해 물리 법칙과 생명 작용을 직접 설계합니다. 코드가 곧 붓이 되고, 시뮬레이션 결과가 그림이 되는 경험을 통해 게임은 소비의 대상을 넘어 사유와 창작의 도구로 진화합니다.

## ✨ 핵심 기능 및 위대함

### 1. 창조를 위한 독자적 언어 (Custom DSL)
* [cite_start]직관적인 문법으로 입자의 성질과 행동 양식을 정의할 수 있습니다[cite: 17, 20].
* [cite_start]단 몇 줄의 코드로 중력(`fallable`), 연소(`flameable`), 생명(`life`)과 같은 복잡한 개념을 구현합니다[cite: 8, 9, 13].
    * [cite_start]예: `sand is fallable { color = "#e0c097" }` [cite: 9]

### 2. 실시간 반응형 세계 (Live Execution)
* 코드를 수정하는 즉시 파싱되어 시뮬레이션에 반영됩니다. [cite_start]멈추지 않는 세계 속에서 실시간으로 법칙을 실험할 수 있습니다[cite: 80, 84].
* [cite_start]전역(Global) 설정뿐만 아니라, 특정 세포(Cell) 하나에만 적용되는 고유 유전자(Local Script)를 심을 수 있습니다[cite: 106, 109].

### 3. 심도 있는 상호작용 엔진
* [cite_start]**Conway's Game of Life** 로직 완벽 구현: 주변 세포의 상태를 감지(`nearby`)하고 자신의 상태를 변화(`become`)시킵니다[cite: 7, 48].
* [cite_start]**물리 시뮬레이션**: 입자 간의 충돌, 미끄러짐, 확산 등의 움직임(`move`)을 확률적으로 제어합니다[cite: 8, 58].

## 🛠 기술적 구현
* **Core**: React, TypeScript 
* **Algorithm**: 최적화된 셀룰러 오토마타 엔진 및 커스텀 파서 구현 
* **UI/UX**: Tailwind CSS 기반의 직관적인 HUD와 코드 에디터 
* **Icons**: Lucide React 

## 🤖 Development Credit
이 프로젝트의 핵심 DSL 파싱 로직과 시뮬레이션 구조는 **Gemini 3 Pro**와의 협업을 통해 설계 및 구현되었습니다.