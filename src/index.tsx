import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import {
  Play,
  Pause,
  RefreshCw,
  AlertCircle,
  Check,
  MousePointer2,
  Plus,
  Trash2,
  Settings,
  Code,
  X,
  Zap,
} from "lucide-react";

// --- Constants ---

const WORLD_W = 80;
const WORLD_H = 80;
const CELL_SIZE_PX = 15;

// --- Types ---

type CellType = string;

interface CellState {
  type: CellType;
  uniqueId?: string;
  props: Record<string, any>;
}

interface TypeDefinition {
  name: string;
  parent: string;
  props: Record<string, any>;
  events: {
    withUpdate?: string;
    withPush?: string;
  };
}

interface GlobalTypeSource {
  id: string;
  name: string;
  code: string;
}

// --- Initial Data ---

const INITIAL_GLOBAL_TYPES: GlobalTypeSource[] = [
  // [System Types]
  {
    id: "g_air",
    name: "air",
    code: `air is {}
withUpdate {
  // Game of Life: 빈 칸 주변에 life가 3개면 life 탄생
  var n = nearby("life");
  if (n === 3) become("life");
}`,
  },
  // [Base Traits]
  {
    id: "g_fallable",
    name: "fallable",
    code: `fallable is { color = "#aaaaaa" } 
withUpdate {
  // 중력: 아래로 이동 시도, 안되면 대각선
  if (move(0, 1)) {
  } else if (move(Math.random() > 0.5 ? 1 : -1, 1)) {
  }
}`,
  },
  {
    id: "g_riseable",
    name: "riseable",
    code: `riseable is { color = "#dddddd" }
withUpdate {
  // 부력: 위로 이동 시도
  if (move(0, -1)) {
  } else if (move(Math.random() > 0.5 ? 1 : -1, -1)) {
  }
}`,
  },
  {
    id: "g_flameable",
    name: "flameable",
    code: `flameable is {}
withUpdate {
  if (touching("fire")) {
    if (Math.random() < 0.1) become("fire");
  }
}`,
  },

  // [Materials]
  {
    id: "g_sand",
    name: "sand",
    code: `sand is fallable { color = "#e0c097" }`,
  },
  {
    id: "g_water",
    name: "water",
    code: `water is fallable { color = "#4fa4f4" }
withUpdate {
  // 물의 흐름 로직 (중력은 fallable에서 상속됨)
  // 이미 fallable 로직이 실행되어 아래로 떨어졌다면 move는 실패함(hasMoved 체크)
  if (move(Math.random() > 0.5 ? 1 : -1, 0)) {
      // 옆으로 흐름
  }
  
  // 불 끄기 (물은 증발하고 연기가 됨)
  if (touching("fire")) {
     if (Math.random() < 0.1) become("smoke");
  }
}`,
  },
  {
    id: "g_wood",
    name: "wood",
    code: `wood is flameable { color = "#8b4513" }`,
  },
  {
    id: "g_stone",
    name: "stone",
    code: `stone is { color = "#888888" }`,
  },
  {
    id: "g_smoke",
    name: "smoke",
    code: `smoke is riseable { color = "#555555", alpha = 0.5 }
withUpdate {
    // 연기는 금방 사라짐
    if (Math.random() < 0.05) become("air");
}`,
  },
  {
    id: "g_fire",
    name: "fire",
    code: `fire is { color = "#ef4444", life = 10 }
withUpdate {
  if (Math.random() < 0.4) move(0, -1);
  
  // 물에 닿으면 연기로 변함
  if (touching("water")) {
      become("smoke");
      return;
  }

  life = life - 1;
  if (life <= 0) become("smoke");
}`,
  },
  {
    id: "g_player",
    name: "player",
    code: `player is { color = "#ffffff" }
withUpdate {
    move(inputX(), inputY());
}`,
  },
  // [Life]
  {
    id: "g_life",
    name: "life",
    code: `life is { color = "#4ade80" }
withUpdate {
   var n = nearby("life");
   if (n < 2 || n > 3) become("air");
}`,
  },
];

const BASE_DEFINITIONS: Record<string, TypeDefinition> = {
  Root: { name: "Root", parent: "", props: { color: "#ffffff" }, events: {} },
  air: { name: "air", parent: "Root", props: { color: "#111111" }, events: {} },
};

// --- Helpers ---

const parsePropsString = (block: string, target: Record<string, any>) => {
  block.split(",").forEach((chunk) => {
    const parts = chunk.split("=");
    if (parts.length >= 2) {
      const k = parts[0].trim();
      const v = parts.slice(1).join("=").trim();
      if (k && v) {
        let val: any = v;
        if (v === "true") val = true;
        else if (v === "false") val = false;
        else if (!isNaN(Number(v))) val = Number(v);
        else if (v.startsWith('"') || v.startsWith("'")) val = v.slice(1, -1);
        target[k] = val;
      }
    }
  });
};

const findBlockEnd = (str: string, start: number): number => {
  let count = 1;
  let i = start + 1;
  while (i < str.length && count > 0) {
    if (str[i] === "{") count++;
    else if (str[i] === "}") count--;
    i++;
  }
  return i;
};

// Robust Parser
const parseDSL = (
  code: string,
  baseDefs: Record<string, TypeDefinition> = BASE_DEFINITIONS
) => {
  const definitions: Record<string, TypeDefinition> = { ...baseDefs };
  let error: string | null = null;

  const cleanCode = code.replace(/\/\/.*$/gm, "");
  let cursor = 0;

  while (cursor < cleanCode.length) {
    // Whitespace
    while (cursor < cleanCode.length && /\s/.test(cleanCode[cursor])) cursor++;
    if (cursor >= cleanCode.length) break;

    // "Type is"
    const headerRegex = /([a-zA-Z0-9_]+)\s+is/y;
    headerRegex.lastIndex = cursor;
    const match = headerRegex.exec(cleanCode);

    if (!match) {
      if (cleanCode.substring(cursor).startsWith("withUpdate")) {
        return {
          definitions,
          error: `이벤트(withUpdate 등)는 타입 정의 내부에 있어야 합니다 (index: ${cursor})`,
        };
      }
      return {
        definitions,
        error: `문법 오류 (index: ${cursor}): Expected 'Name is ...'`,
      };
    }

    const typeName = match[1];
    cursor = headerRegex.lastIndex;

    const newType: TypeDefinition = {
      name: typeName,
      parent: "Root",
      props: {},
      events: {},
    };

    // Mixin / Props / Event Loop
    while (cursor < cleanCode.length) {
      while (cursor < cleanCode.length && /\s/.test(cleanCode[cursor]))
        cursor++;
      if (cursor >= cleanCode.length) break;

      // Stop conditions
      if (/^[a-zA-Z0-9_]+\s+is\s/.test(cleanCode.slice(cursor))) break;

      // 1. Event Keywords
      if (
        cleanCode.startsWith("withUpdate", cursor) ||
        cleanCode.startsWith("withPush", cursor)
      ) {
        let eventName = "";
        if (cleanCode.startsWith("withUpdate", cursor))
          eventName = "withUpdate";
        else if (cleanCode.startsWith("withPush", cursor))
          eventName = "withPush";

        cursor += eventName.length;
        while (cursor < cleanCode.length && /\s/.test(cleanCode[cursor]))
          cursor++;

        if (cleanCode[cursor] === "{") {
          const end = findBlockEnd(cleanCode, cursor);
          const codeBlock = cleanCode.slice(cursor + 1, end - 1).trim();
          cursor = end;

          // Event Merging: Append
          // @ts-ignore
          const existing = newType.events[eventName] || "";
          // @ts-ignore
          newType.events[eventName] = existing
            ? existing + "\n" + codeBlock
            : codeBlock;
        } else {
          return {
            definitions,
            error: `${typeName}: ${eventName} 뒤에 '{' 가 필요합니다.`,
          };
        }
        continue;
      }

      // 2. Sugar Keywords
      if (cleanCode.startsWith("and", cursor)) {
        if (/\s/.test(cleanCode[cursor + 3])) {
          cursor += 3;
          continue;
        }
      }
      if (cleanCode.startsWith("with", cursor)) {
        if (/\s|\{/.test(cleanCode[cursor + 4])) {
          cursor += 4;
          continue;
        }
      }

      // 3. Props Block "{ ... }"
      if (cleanCode[cursor] === "{") {
        if (cleanCode[cursor + 1] === "}") {
          cursor += 2;
          continue;
        }
        const end = findBlockEnd(cleanCode, cursor);
        const block = cleanCode.slice(cursor + 1, end - 1);
        cursor = end;
        parsePropsString(block, newType.props);
        continue;
      }

      // 4. Parent/Mixin Identifier
      const idRegex = /([a-zA-Z0-9_]+)/y;
      idRegex.lastIndex = cursor;
      const idMatch = idRegex.exec(cleanCode);

      if (idMatch) {
        const parentName = idMatch[1];
        cursor = idRegex.lastIndex;

        if (definitions[parentName]) {
          const p = definitions[parentName];
          newType.props = { ...p.props, ...newType.props };

          // Event Merging logic for Inheritance
          Object.keys(p.events).forEach((k) => {
            const key = k as keyof typeof p.events;
            if (p.events[key]) {
              const existing = newType.events[key] || "";
              // Parent code comes first
              newType.events[key] = existing
                ? p.events[key] + "\n" + existing
                : p.events[key];
            }
          });
        }
        continue;
      }

      // Unknown token
      return {
        definitions,
        error: `알 수 없는 토큰 (index: ${cursor}) in ${typeName}`,
      };
    }

    definitions[typeName] = newType;
  }

  return { definitions, error };
};

const executeEvent = (
  typeDef: TypeDefinition,
  eventName: "withUpdate" | "withPush",
  x: number,
  y: number,
  currentGrid: CellState[][],
  nextGrid: CellState[][],
  definitions: Record<string, TypeDefinition>,
  inputState: { x: number; y: number }
) => {
  const code = typeDef.events[eventName];
  if (!code) return;

  const me = currentGrid[y][x];

  // State to prevent multiple actions in one tick
  // DSL context must trap `move` and `become`
  let hasMoved = false;

  const context = {
    props: me.props,
    ...me.props,
    nearby: (target: string) => {
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < WORLD_H && nx >= 0 && nx < WORLD_W) {
            if (currentGrid[ny][nx].type === target) count++;
          }
        }
      }
      return count;
    },
    touching: (target: string) => {
      const dirs = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ];
      for (const [dx, dy] of dirs) {
        const ny = y + dy,
          nx = x + dx;
        if (ny >= 0 && ny < WORLD_H && nx >= 0 && nx < WORLD_W) {
          if (currentGrid[ny][nx].type === target) return true;
        }
      }
      return false;
    },
    become: (target: string) => {
      if (hasMoved) return; // Already moved, cannot change state at old position
      if (definitions[target]) {
        nextGrid[y][x] = {
          type: target,
          props: { ...definitions[target].props },
          uniqueId: undefined,
        };
        hasMoved = true; // Treated as an action
      }
    },
    move: (dx: number, dy: number): boolean => {
      if (hasMoved) return false; // Already moved/acted in this tick

      const ny = y + dy;
      const nx = x + dx;
      if (ny < 0 || ny >= WORLD_H || nx < 0 || nx >= WORLD_W) return false;

      // Check if destination is valid in BOTH grids
      // 1. Current grid must be 'air' (passable)
      // 2. Next grid must also be 'air' (not taken by another mover in this tick)
      if (
        currentGrid[ny][nx].type === "air" &&
        nextGrid[ny][nx].type === "air"
      ) {
        nextGrid[ny][nx] = { ...me }; // Move self to new pos
        nextGrid[y][x] = { type: "air", props: definitions["air"].props }; // Clear old pos
        hasMoved = true;
        return true;
      }
      return false;
    },
    inputX: () => inputState.x,
    inputY: () => inputState.y,
    Math,
    console,
    life: me.props.life,
  };

  try {
    const func = new Function(...Object.keys(context), code);
    func(...Object.values(context));

    // Sync back primitive props changes ONLY if cell hasn't moved/transformed
    if (
      !hasMoved &&
      context.life !== undefined &&
      context.life !== me.props.life
    ) {
      // Double check we are still there (redundant if hasMoved works, but safe)
      if (nextGrid[y][x].type === me.type) {
        nextGrid[y][x].props.life = context.life;
      }
    }
  } catch (e) {}
};

const AutoResizingTextarea = ({
  value,
  onChange,
  className,
  placeholder,
}: any) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      textareaRef.current.style.height = `${Math.max(
        textareaRef.current.scrollHeight,
        128
      )}px`;
    }
  }, [value]);
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      className={className}
      placeholder={placeholder}
      spellCheck={false}
    />
  );
};

// --- React Component ---

export default function CellularAutomataGame() {
  const [grid, setGrid] = useState<CellState[][]>([]);
  const [globalTypes, setGlobalTypes] =
    useState<GlobalTypeSource[]>(INITIAL_GLOBAL_TYPES);
  const [cellSources, setCellSources] = useState<Record<string, string>>({});

  const [sharedDefs, setSharedDefs] = useState<Record<string, TypeDefinition>>(
    {}
  );
  const [customDefs, setCustomDefs] = useState<Record<string, TypeDefinition>>(
    {}
  );
  const [sharedError, setSharedError] = useState<string | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [tickRate, setTickRate] = useState(50);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [selectedType, setSelectedType] = useState<string>("sand");

  const [hoverCell, setHoverCell] = useState<{
    x: number;
    y: number;
    type: string;
  } | null>(null);
  const [selectedCellPos, setSelectedCellPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [isPainting, setIsPainting] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const viewStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const [showGlobalSettings, setShowGlobalSettings] = useState(true);
  const [editCode, setEditCode] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Input State
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const inputState = useRef({ x: 0, y: 0 });

  // --- Initialization ---

  useEffect(() => {
    const g = Array(WORLD_H)
      .fill(null)
      .map(() =>
        Array(WORLD_W)
          .fill(null)
          .map(() => ({
            type: "air",
            props: { ...BASE_DEFINITIONS["air"].props },
          }))
      );
    setGrid(g);

    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key] = true;
      updateInputState();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key] = false;
      updateInputState();
    };
    const updateInputState = () => {
      let x = 0,
        y = 0;
      if (keysPressed.current["ArrowLeft"]) x -= 1;
      if (keysPressed.current["ArrowRight"]) x += 1;
      if (keysPressed.current["ArrowUp"]) y -= 1;
      if (keysPressed.current["ArrowDown"]) y += 1;
      inputState.current = { x, y };
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const code = globalTypes.map((t) => t.code).join("\n\n");
    const { definitions, error } = parseDSL(code);
    setSharedDefs(definitions);
    setSharedError(error);
  }, [globalTypes]);

  useEffect(() => {
    const newCustomDefs: Record<string, TypeDefinition> = {};
    Object.entries(cellSources).forEach(([uid, fragment]) => {
      const fullCode = `Custom_${uid} is ${fragment}`;
      const { definitions } = parseDSL(fullCode, sharedDefs);
      const key = `Custom_${uid}`;
      if (definitions[key]) {
        newCustomDefs[uid] = definitions[key];
      }
    });
    setCustomDefs(newCustomDefs);
  }, [cellSources, sharedDefs]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setGrid((prev) => {
        const next = prev.map((row) =>
          row.map((c) => ({ ...c, props: { ...c.props } }))
        );
        const allDefs = { ...sharedDefs, ...customDefs };
        const inp = inputState.current;

        for (let y = 0; y < WORLD_H; y++) {
          for (let x = 0; x < WORLD_W; x++) {
            const cell = prev[y][x];

            let def = sharedDefs[cell.type];
            if (cell.uniqueId && customDefs[cell.uniqueId]) {
              def = customDefs[cell.uniqueId];
            }

            // Run events for everyone (including air for Life game)
            if (def && def.events.withUpdate) {
              executeEvent(def, "withUpdate", x, y, prev, next, allDefs, inp);
            }
          }
        }
        return next;
      });
    }, tickRate);
    return () => clearInterval(timer);
  }, [isRunning, tickRate, sharedDefs, customDefs]);

  // --- Actions ---

  const placeCell = (x: number, y: number) => {
    setGrid((prev) => {
      const next = [...prev];
      next[y] = [...prev[y]];
      // Overwrite logic
      const def = sharedDefs[selectedType] || sharedDefs["air"];
      next[y][x] = {
        type: selectedType,
        props: { ...def.props },
        uniqueId: undefined,
      };
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragStart.current = { x: e.clientX, y: e.clientY };
    viewStart.current = { ...viewOffset };
    hasMoved.current = false;

    if (e.button === 0) {
      // Left: Paint
      setIsPainting(true);
      const cx = Math.floor(
        (e.clientX - rect.left - viewOffset.x) / CELL_SIZE_PX
      );
      const cy = Math.floor(
        (e.clientY - rect.top - viewOffset.y) / CELL_SIZE_PX
      );
      if (cx >= 0 && cx < WORLD_W && cy >= 0 && cy < WORLD_H) {
        placeCell(cx, cy);
      }
    } else if (e.button === 2) {
      // Right: Pan
      setIsPanning(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = Math.floor(
      (e.clientX - rect.left - viewOffset.x) / CELL_SIZE_PX
    );
    const cy = Math.floor((e.clientY - rect.top - viewOffset.y) / CELL_SIZE_PX);

    if (cx >= 0 && cx < WORLD_W && cy >= 0 && cy < WORLD_H) {
      const cell = grid[cy]?.[cx];
      setHoverCell({ x: cx, y: cy, type: cell ? cell.type : "air" });
    } else {
      setHoverCell(null);
    }

    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved.current = true;

    if (isPainting) {
      if (cx >= 0 && cx < WORLD_W && cy >= 0 && cy < WORLD_H) {
        placeCell(cx, cy);
      }
    }

    if (isPanning) {
      setViewOffset({
        x: viewStart.current.x + dx,
        y: viewStart.current.y + dy,
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 0) setIsPainting(false);
    if (e.button === 2) {
      setIsPanning(false);
      if (!hasMoved.current && hoverCell) {
        selectCellForEditing(hoverCell.x, hoverCell.y);
      }
    }
  };

  const selectCellForEditing = (x: number, y: number) => {
    setSelectedCellPos({ x, y });
    setShowGlobalSettings(false);
    const cell = grid[y][x];
    if (cell.uniqueId && cellSources[cell.uniqueId]) {
      setEditCode(cellSources[cell.uniqueId]);
    } else {
      setEditCode(cell.type === "air" ? "{}" : cell.type);
    }
    setEditError(null);
  };

  const applyCellEdit = () => {
    if (!selectedCellPos) return;
    const { x, y } = selectedCellPos;
    const uid = grid[y][x].uniqueId || `u_${x}_${y}_${Date.now()}`;

    const full = `Custom_${uid} is ${editCode}`;
    const { error } = parseDSL(full, sharedDefs);
    if (error) {
      setEditError(error);
      return;
    }

    setCellSources((prev) => ({ ...prev, [uid]: editCode }));
    setEditError(null);

    if (sharedDefs[editCode.trim()]) {
      setGrid((prev) => {
        const next = [...prev];
        next[y][x] = {
          type: editCode.trim(),
          props: { ...sharedDefs[editCode.trim()].props },
          uniqueId: undefined,
        };
        return next;
      });
      setCellSources((prev) => {
        const n = { ...prev };
        delete n[uid];
        return n;
      });
      return;
    }

    setGrid((prev) => {
      const next = [...prev];
      next[y][x] = { ...next[y][x], uniqueId: uid };
      return next;
    });
  };

  return (
    <div className="flex h-screen bg-gray-950 text-white font-sans overflow-hidden select-none">
      <div
        className="flex-1 relative overflow-hidden cursor-default"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onMouseLeave={() => {
          setIsPainting(false);
          setIsPanning(false);
        }}
      >
        {/* HUD */}
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          <div className="bg-gray-900/90 backdrop-blur border border-gray-700 rounded-lg shadow-lg p-2 flex items-center gap-3">
            <div className="flex items-center px-2 gap-2 border-r border-gray-700 pr-3">
              <MousePointer2 size={14} className="text-blue-400" />
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-gray-900 text-white text-sm outline-none cursor-pointer font-mono px-1"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {Object.keys(sharedDefs)
                  .filter((k) => k !== "Root")
                  .map((k) => (
                    <option
                      key={k}
                      value={k}
                      className="bg-gray-900 text-gray-200"
                    >
                      {k}
                    </option>
                  ))}
              </select>
            </div>
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`p-1.5 rounded hover:bg-white/10 ${
                isRunning ? "text-yellow-400" : "text-green-400"
              }`}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {isRunning ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              onClick={() => {
                const g = Array(WORLD_H)
                  .fill(null)
                  .map(() =>
                    Array(WORLD_W)
                      .fill(null)
                      .map(() => ({
                        type: "air",
                        props: { ...BASE_DEFINITIONS["air"].props },
                      }))
                  );
                setGrid(g);
                setCellSources({});
              }}
              className="p-1.5 rounded hover:bg-white/10 text-red-400"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <RefreshCw size={18} />
            </button>
          </div>

          <div className="bg-gray-900/90 backdrop-blur border border-gray-700 rounded-lg shadow-lg p-2 flex items-center gap-2 px-3">
            <Zap size={14} className="text-yellow-400" />
            <input
              type="range"
              min="10"
              max="500"
              step="10"
              value={510 - tickRate}
              onChange={(e) => setTickRate(510 - Number(e.target.value))}
              className="w-24 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>

          <button
            onClick={() => {
              setShowGlobalSettings(true);
              setSelectedCellPos(null);
            }}
            className={`px-4 py-2 rounded-lg border text-sm font-bold shadow-lg transition-all w-fit ${
              showGlobalSettings
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-gray-800/80 border-gray-700 text-gray-400 hover:bg-gray-800"
            }`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Settings size={16} className="inline mr-2" /> 전역 설정
          </button>
        </div>

        {hoverCell && (
          <div
            className="absolute pointer-events-none z-30 px-3 py-1.5 bg-black/80 backdrop-blur border border-white/10 rounded text-xs font-mono text-gray-200 shadow-xl flex flex-col gap-0.5"
            style={{ left: 20, top: 150 }}
          >
            <span className="text-blue-300 font-bold">{hoverCell.type}</span>
            <span className="text-gray-500">
              ({hoverCell.x}, {hoverCell.y})
            </span>
          </div>
        )}

        <div
          style={{
            transform: `translate(${viewOffset.x}px, ${viewOffset.y}px)`,
            width: WORLD_W * CELL_SIZE_PX,
            height: WORLD_H * CELL_SIZE_PX,
            display: "grid",
            gridTemplateColumns: `repeat(${WORLD_W}, 1fr)`,
          }}
          className="transition-transform duration-75 ease-out origin-top-left bg-[#080808] shadow-2xl"
        >
          {grid.map((row, y) =>
            row.map((cell, x) => {
              let def = sharedDefs[cell.type];
              if (cell.uniqueId && customDefs[cell.uniqueId])
                def = customDefs[cell.uniqueId];
              const color = def?.props?.color || "#222";
              const isSelected =
                selectedCellPos?.x === x && selectedCellPos?.y === y;
              return (
                <div
                  key={`${x}-${y}`}
                  style={{
                    width: CELL_SIZE_PX,
                    height: CELL_SIZE_PX,
                    backgroundColor: color,
                    boxShadow: isSelected ? "inset 0 0 0 2px white" : undefined,
                  }}
                  className="border-[0.5px] border-white/5"
                />
              );
            })
          )}
        </div>
      </div>

      <div className="w-[400px] flex flex-col bg-gray-900 border-l border-gray-800 shadow-2xl z-40">
        <div className="h-14 flex items-center justify-between px-5 border-b border-gray-800 bg-gray-950 shrink-0">
          <h2 className="font-bold text-gray-100 flex items-center gap-2">
            {showGlobalSettings ? (
              <>
                <Settings size={18} className="text-blue-400" /> 전역 타입 정의
              </>
            ) : (
              <>
                <Code size={18} className="text-green-400" /> 세포 편집 (
                {selectedCellPos?.x}, {selectedCellPos?.y})
              </>
            )}
          </h2>
          {!showGlobalSettings && (
            <button
              onClick={() => setShowGlobalSettings(true)}
              className="text-gray-500 hover:text-white"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-[#0c0c0c] p-4 space-y-4">
          {showGlobalSettings ? (
            <>
              <div
                className={`text-xs px-3 py-2 rounded border flex items-center gap-2 ${
                  sharedError
                    ? "bg-red-900/20 border-red-800 text-red-300"
                    : "bg-green-900/10 border-green-900 text-green-400"
                }`}
              >
                {sharedError ? <AlertCircle size={14} /> : <Check size={14} />}
                {sharedError || "문법 정상"}
              </div>
              {globalTypes.map((t) => (
                <div
                  key={t.id}
                  className="group bg-gray-850 border border-gray-800 rounded-lg overflow-hidden focus-within:border-blue-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-800">
                    <span className="text-xs font-mono font-bold text-gray-400">
                      {t.name}
                    </span>
                    <button
                      onClick={() =>
                        setGlobalTypes((prev) =>
                          prev.filter((i) => i.id !== t.id)
                        )
                      }
                      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <AutoResizingTextarea
                    value={t.code}
                    onChange={(e: any) => {
                      const val = e.target.value;
                      const m = val.match(/^([a-zA-Z0-9_]+)\s+is/);
                      const name = m ? m[1] : t.name;
                      setGlobalTypes((prev) =>
                        prev.map((i) =>
                          i.id === t.id ? { ...i, code: val, name } : i
                        )
                      );
                    }}
                    className="w-full bg-transparent p-3 text-xs font-mono text-gray-300 outline-none resize-none min-h-[8rem]"
                  />
                </div>
              ))}
              <button
                onClick={() =>
                  setGlobalTypes((prev) => [
                    ...prev,
                    {
                      id: `g_${Date.now()}`,
                      name: "new",
                      code: `new is {} { color="#fff" }`,
                    },
                  ])
                }
                className="w-full py-3 border border-dashed border-gray-700 rounded-lg text-gray-500 text-sm hover:border-gray-500 hover:text-gray-300 transition-all flex justify-center items-center gap-2"
              >
                <Plus size={16} /> 타입 추가
              </button>
            </>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex-1 bg-gray-850 rounded-lg border border-gray-800 overflow-hidden relative">
                <textarea
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full h-full bg-transparent p-4 text-xs font-mono text-gray-300 outline-none resize-none leading-relaxed"
                  spellCheck={false}
                  placeholder="예: sand 또는 fallable { color='red' }"
                />
                {editError && (
                  <div className="absolute bottom-0 inset-x-0 bg-red-900/90 text-red-100 text-xs p-2 border-t border-red-700 font-mono">
                    {editError}
                  </div>
                )}
              </div>
              <div className="mt-4">
                <button
                  onClick={applyCellEdit}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg shadow-lg transition-all active:scale-95"
                >
                  적용하기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
