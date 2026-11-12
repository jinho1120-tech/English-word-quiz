import { useState, useEffect, useRef, useCallback } from "react";
import { HapticButton } from "@/components/haptic-button";

const COLS = 15;
const ROWS = 15;
const CELL_SIZE = 18;

// 기본 이동 속도 (초당 타일 수)
const BASE_PACMAN_SPEED = 4.6;
const BASE_GHOST_SPEED = 3.8;
const GHOST_FRIGHTENED_SPEED = 2.4;

// 1: 벽, 2: 일반 점, 3: 파워 펠릿, 0: 빈 통로
const INITIAL_MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 3, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 3, 1],
  [1, 2, 1, 1, 2, 2, 2, 1, 2, 2, 2, 1, 1, 2, 1],
  [1, 2, 1, 1, 2, 1, 2, 1, 2, 1, 2, 1, 1, 2, 1],
  [1, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 1],
  [1, 1, 2, 1, 2, 1, 1, 0, 1, 1, 2, 1, 2, 1, 1], // (7, 5): 소굴 문 밖 출구
  [0, 0, 2, 1, 2, 1, 0, 0, 0, 1, 2, 1, 2, 0, 0], // (6..8, 6): 소굴 안
  [1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1],
  [1, 2, 2, 2, 2, 2, 2, 0, 2, 2, 2, 2, 2, 2, 1], // (7, 8): 🍒 보너스 체리 스폰 위치
  [1, 2, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 2, 1],
  [1, 2, 2, 1, 2, 2, 2, 0, 2, 2, 2, 1, 2, 2, 1], // (7, 10): 보카맨 스폰 지점
  [1, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 1],
  [1, 3, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 3, 1],
  [1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const STAGE_WALL_ADDITIONS: Array<Array<[number, number]>> = [
  // Stage 2: 중앙 통로 일부를 막아 우회 경로를 사용하게 한다.
  [[4, 7], [9, 8], [4, 6], [8, 4], [10, 6]],
  // Stage 3: 좌우 통로의 연결 지점을 바꾼다.
  [[10, 7], [2, 7], [4, 5], [8, 3], [8, 11]],
  // Stage 4: 위쪽과 아래쪽의 길을 더 복잡하게 만든다.
  [[10, 8], [3, 8], [10, 5], [4, 4], [7, 13], [8, 2]],
  // Stage 5: 여러 갈림길을 막아 가장 복잡한 미로를 만든다.
  [[10, 9], [2, 8], [10, 4], [3, 4], [4, 3], [9, 2]],
];

const STAGE_THEMES = [
  { name: "클래식 미로", background: "#020617", wall: "#1e3a8a", stroke: "#3b82f6", dot: "#fef08a", power: "#facc15" },
  { name: "바다 미로", background: "#031b2f", wall: "#0e7490", stroke: "#22d3ee", dot: "#a5f3fc", power: "#67e8f9" },
  { name: "수정 동굴", background: "#160b2e", wall: "#6d28d9", stroke: "#c4b5fd", dot: "#ddd6fe", power: "#a78bfa" },
  { name: "화산 미로", background: "#2a1008", wall: "#9a3412", stroke: "#fb923c", dot: "#fed7aa", power: "#f97316" },
  { name: "우주 미로", background: "#07152d", wall: "#047857", stroke: "#34d399", dot: "#bbf7d0", power: "#a3e635" },
];

function createStageMap(stage: number): number[][] {
  const layoutStage = ((stage - 1) % STAGE_THEMES.length) + 1;
  const map = INITIAL_MAP.map((row) => [...row]);
  for (let index = 0; index < layoutStage - 1; index++) {
    for (const [x, y] of STAGE_WALL_ADDITIONS[index]) {
      map[y][x] = 1;
    }
  }
  return map;
}

function countDotsInMap(map: number[][]): number {
  return map.reduce((total, row) => total + row.filter((cell) => cell === 2 || cell === 3).length, 0);
}

interface Ghost {
  id: string;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  color: string;
  isFrightened: boolean;
  releaseDelayMs: number;
  isInHouse: boolean;
  lastDecisionTile: string;
  word: PacmanDefenseWord | null;
}

type PacmanDefenseWord = { id: number; word: string; meaning: string };

interface PacmanGameProps {
  words?: PacmanDefenseWord[];
  extraPlaysLeft: number;
  dailyPlayLimit: number;
  unlimitedPlays: boolean;
  onGameOver: () => void;
  onReplay: () => Promise<boolean>;
  replayError?: string;
  onClose: () => void;
}

export function PacmanGame({ words = [], extraPlaysLeft, dailyPlayLimit, unlimitedPlays, onGameOver, onReplay, replayError, onClose }: PacmanGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [score, setScore] = useState(0);
  const [stage, setStage] = useState(1); // 💡 스테이지 레벨
  const stageRef = useRef(1);
  stageRef.current = stage;
  const stageTheme = STAGE_THEMES[(stage - 1) % STAGE_THEMES.length];
  const [lives, setLives] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [dotsLeft, setDotsLeft] = useState(0);
  const [isReady, setIsReady] = useState(true);
  const [isStageClear, setIsStageClear] = useState(false); // 💡 스테이지 클리어 축하 배너
  const [isInvulnerable, setIsInvulnerable] = useState(false);
  const [replayPending, setReplayPending] = useState(false);
  const [controlMode, setControlMode] = useState<"buttons" | "tilt">("buttons");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [defenseEncounter, setDefenseEncounter] = useState<{ ghostId: string; ghostColor: string; word: PacmanDefenseWord; durationMs: number } | null>(null);
  const [defenseTyped, setDefenseTyped] = useState("");
  const [defenseRemainingMs, setDefenseRemainingMs] = useState(0);
  const [doctorChallenge, setDoctorChallenge] = useState<{ words: PacmanDefenseWord[]; index: number } | null>(null);
  const [doctorModeUntil, setDoctorModeUntil] = useState(0);
  const doctorModeActiveRef = useRef(false);
  const doctorChallengeActiveRef = useRef(false);
  const defenseActiveRef = useRef(false);
  const defenseInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);
  const [tiltStatus, setTiltStatus] = useState("센서 조작을 사용하려면 센서를 켜 주세요.");
  const [tiltDiagnostics, setTiltDiagnostics] = useState("센서 대기 중");
  const [tiltSensitivity, setTiltSensitivity] = useState(14);
  const [isTiltSettingsOpen, setIsTiltSettingsOpen] = useState(false);
  const [encounterViewport, setEncounterViewport] = useState({ height: 0, top: 0, keyboardOpen: false });

  useEffect(() => {
    const saved = window.localStorage.getItem("vocaman-tilt-sensitivity");
    const parsed = saved ? Number(saved) : NaN;
    if (Number.isFinite(parsed) && parsed >= 6 && parsed <= 28) setTiltSensitivity(parsed);
  }, []);

  useEffect(() => {
    if (!defenseEncounter) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const viewport = window.visualViewport;
    const updateViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      setEncounterViewport({ height, top, keyboardOpen: height < window.innerHeight - 100 });
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.body.style.overflow = previousOverflow;
    };
  }, [defenseEncounter]);
  const orientationRef = useRef<{ beta: number; gamma: number } | null>(null);
  const neutralOrientationRef = useRef<{ beta: number; gamma: number } | null>(null);
  const tiltPermissionRef = useRef(false);
  const lastTiltUiUpdateRef = useRef(0);

  // 💡 체리 보너스 과일 상태
  const [cherryVisible, setCherryVisible] = useState(false);
  const [cherryPopup, setCherryPopup] = useState<string | null>(null);
  const cherrySpawnedRef = useRef(false);
  const cherryTimerRef = useRef<NodeJS.Timeout | null>(null);

  const pacmanRef = useRef({
    x: 7.0,
    y: 10.0,
    dirX: 0,
    dirY: 0,
    nextDirX: 0,
    nextDirY: 0,
    mouthAngle: 0.2,
    mouthDir: 1,
  });

  const ghostAscensionsRef = useRef<Array<{ x: number; y: number; word: string; startedAt: number }>>([]);

  const ghostsRef = useRef<Ghost[]>([
    { id: "red", x: 7.0, y: 5.0, dirX: 1, dirY: 0, color: "#ef4444", isFrightened: false, releaseDelayMs: 0, isInHouse: false, lastDecisionTile: "", word: words[0] ?? null },
    { id: "pink", x: 7.0, y: 6.0, dirX: 0, dirY: -1, color: "#f472b6", isFrightened: false, releaseDelayMs: 2500, isInHouse: true, lastDecisionTile: "", word: words[1 % Math.max(1, words.length)] ?? null },
    { id: "blue", x: 6.0, y: 6.0, dirX: 0, dirY: -1, color: "#38bdf8", isFrightened: false, releaseDelayMs: 5000, isInHouse: true, lastDecisionTile: "", word: words[2 % Math.max(1, words.length)] ?? null },
    { id: "orange", x: 8.0, y: 6.0, dirX: 0, dirY: -1, color: "#fb923c", isFrightened: false, releaseDelayMs: 7500, isInHouse: true, lastDecisionTile: "", word: words[3 % Math.max(1, words.length)] ?? null },
  ]);

  const mapRef = useRef<number[][]>(INITIAL_MAP.map((r) => [...r]));
  const frightenedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const gameStartTimeRef = useRef<number>(Date.now());
  const lastTimeRef = useRef<number>(performance.now());
  const totalDotsCountRef = useRef(0);
  const stageClearTriggeredRef = useRef(false);

  // 라운드 내 위치 초기화 (피격 시)
  const resetPositions = useCallback((targetStage: number = stageRef.current) => {
    const releaseScale = Math.max(0.35, Math.pow(0.86, Math.max(0, targetStage - 1)));
    const releaseDelays = [0, 2500, 5000, 7500].map((delay) => Math.round(delay * releaseScale));
    pacmanRef.current = {
      x: 7.0,
      y: 10.0,
      dirX: 0,
      dirY: 0,
      nextDirX: 0,
      nextDirY: 0,
      mouthAngle: 0.2,
      mouthDir: 1,
    };
    ghostsRef.current = [
      { id: "red", x: 7.0, y: 5.0, dirX: 1, dirY: 0, color: "#ef4444", isFrightened: false, releaseDelayMs: 0, isInHouse: false, lastDecisionTile: "", word: words[0] ?? null },
      { id: "pink", x: 7.0, y: 6.0, dirX: 0, dirY: -1, color: "#f472b6", isFrightened: false, releaseDelayMs: releaseDelays[1], isInHouse: true, lastDecisionTile: "", word: words[1 % Math.max(1, words.length)] ?? null },
      { id: "blue", x: 6.0, y: 6.0, dirX: 0, dirY: -1, color: "#38bdf8", isFrightened: false, releaseDelayMs: releaseDelays[2], isInHouse: true, lastDecisionTile: "", word: words[2 % Math.max(1, words.length)] ?? null },
      { id: "orange", x: 8.0, y: 6.0, dirX: 0, dirY: -1, color: "#fb923c", isFrightened: false, releaseDelayMs: releaseDelays[3], isInHouse: true, lastDecisionTile: "", word: words[3 % Math.max(1, words.length)] ?? null },
    ];
    gameStartTimeRef.current = Date.now();
    lastTimeRef.current = performance.now();

    setIsReady(true);
    setIsInvulnerable(true);

    setTimeout(() => {
      setIsReady(false);
      lastTimeRef.current = performance.now();
    }, 1500);
    setTimeout(() => setIsInvulnerable(false), 3000);
  }, []);

  // 💡 다음 스테이지 시작 (도트 리필 & 보너스 점수)
  const advanceToNextStage = useCallback(() => {
    if (stageClearTriggeredRef.current) return;
    stageClearTriggeredRef.current = true;
    const nextStage = stageRef.current + 1;
    setIsStageClear(true);
    setScore((prev) => prev + 1000); // 스테이지 완주 보너스 1,000점

    if (cherryTimerRef.current) clearTimeout(cherryTimerRef.current);
    setCherryVisible(false);
    cherrySpawnedRef.current = false;

    setTimeout(() => {
      const nextMap = createStageMap(nextStage);
      mapRef.current = nextMap;
      const nextDotCount = countDotsInMap(nextMap);
      totalDotsCountRef.current = nextDotCount;
      setDotsLeft(nextDotCount);
      stageClearTriggeredRef.current = false;
      stageRef.current = nextStage;
      setStage(nextStage);
      setIsStageClear(false);
      resetPositions(nextStage);
    }, 1800);
  }, [resetPositions]);

  // 전체 게임 새판 시작
  const startNewGame = useCallback(() => {
    const initialMap = createStageMap(1);
    mapRef.current = initialMap;
    const count = countDotsInMap(initialMap);
    totalDotsCountRef.current = count;
    setDotsLeft(count);
    setScore(0);
    stageRef.current = 1;
    setStage(1);
    setLives(3);
    setGameOver(false);
    setIsStageClear(false);
    stageClearTriggeredRef.current = false;
    doctorModeActiveRef.current = false;
    doctorChallengeActiveRef.current = false;
    setDoctorChallenge(null);
    setDoctorModeUntil(0);
    setCherryVisible(false);
    setCherryPopup(null);
    cherrySpawnedRef.current = false;
    resetPositions(1);
  }, [resetPositions]);

  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  const setDirection = useCallback((dx: number, dy: number) => {
    const pac = pacmanRef.current;
    pac.nextDirX = dx;
    pac.nextDirY = dy;

    // 즉시 유턴
    if (dx === -pac.dirX && dy === -pac.dirY && (dx !== 0 || dy !== 0)) {
      pac.dirX = dx;
      pac.dirY = dy;
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
      if (defenseActiveRef.current) return;
      if (e.key === "ArrowUp") setDirection(0, -1);
      if (e.key === "ArrowDown") setDirection(0, 1);
      if (e.key === "ArrowLeft") setDirection(-1, 0);
      if (e.key === "ArrowRight") setDirection(1, 0);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setDirection]);

  const enableTiltControls = useCallback(async () => {
    const OrientationEventConstructor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    if (!OrientationEventConstructor) {
      setTiltStatus("이 기기나 브라우저에서 방향 센서를 지원하지 않아요.");
      setTiltDiagnostics("DeviceOrientation API 미지원");
      return;
    }

    try {
      // iOS는 반드시 사용자의 버튼 클릭 안에서 센서 권한을 요청해야 합니다.
      if (typeof OrientationEventConstructor.requestPermission === "function") {
        const permission = await OrientationEventConstructor.requestPermission();
        if (permission !== "granted") {
          setTiltStatus("센서 권한이 거부되었어요. 브라우저의 모션 및 방향 접근 설정을 확인해 주세요.");
          setTiltDiagnostics("센서 권한 거부");
          return;
        }
      }

      tiltPermissionRef.current = true;
      orientationRef.current = null;
      neutralOrientationRef.current = null;
      lastTiltUiUpdateRef.current = 0;
      setTiltDiagnostics("권한 허용됨 · 센서 이벤트 대기 중");
      setTiltStatus("센서 신호를 확인하고 있어요. 휴대폰을 잠시 안정적으로 잡아 주세요.");
      setControlMode("tilt");
    } catch (error) {
      setTiltStatus("센서 권한을 요청하지 못했어요. 브라우저 설정에서 모션 및 방향 접근을 확인해 주세요.");
      setTiltDiagnostics(error instanceof Error ? error.message : "센서 권한 요청 실패");
    }
  }, []);

  const calibrateTilt = useCallback(() => {
    if (!orientationRef.current) {
      setTiltStatus("센서 값을 아직 받지 못했어요. 휴대폰을 움직여 주세요.");
      return;
    }
    neutralOrientationRef.current = { ...orientationRef.current };
    setTiltStatus("중립 위치를 다시 맞췄어요. 휴대폰을 기울여 이동해 보세요.");
  }, []);

  useEffect(() => {
    if (controlMode !== "tilt" || !tiltPermissionRef.current) return;

    let receivedFirstEvent = false;
    const noSignalTimer = window.setTimeout(() => {
      if (!receivedFirstEvent) {
        setTiltStatus("권한은 허용됐지만 센서 데이터가 들어오지 않아요. 기기와 브라우저의 모션 센서 설정을 확인해 주세요.");
        setTiltDiagnostics("센서 이벤트 0회 · 브라우저 또는 기기에서 이벤트 차단 가능");
      }
    }, 3000);

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) {
        setTiltDiagnostics("센서 이벤트는 수신했지만 beta/gamma 값이 비어 있어요.");
        return;
      }

      receivedFirstEvent = true;
      window.clearTimeout(noSignalTimer);
      const current = { beta: event.beta, gamma: event.gamma };
      orientationRef.current = current;

      if (!neutralOrientationRef.current) {
        neutralOrientationRef.current = current;
        setTiltStatus("센서 연결 완료! 휴대폰을 기울여 이동해 보세요.");
        setTiltDiagnostics("센서 수신 정상 · 중립 위치 자동 보정 완료");
        return;
      }

      const betaDelta = current.beta - neutralOrientationRef.current.beta;
      const gammaDelta = current.gamma - neutralOrientationRef.current.gamma;
      const screenAngle = ((window.screen.orientation?.angle ?? 0) % 360 + 360) % 360;
      let horizontalTilt = gammaDelta;
      let verticalTilt = betaDelta;
      if (screenAngle === 90) {
        horizontalTilt = betaDelta;
        verticalTilt = -gammaDelta;
      } else if (screenAngle === 180) {
        horizontalTilt = -gammaDelta;
        verticalTilt = -betaDelta;
      } else if (screenAngle === 270) {
        horizontalTilt = -betaDelta;
        verticalTilt = gammaDelta;
      }

      let directionLabel = "중립";
      if (Math.max(Math.abs(horizontalTilt), Math.abs(verticalTilt)) >= tiltSensitivity) {
        if (Math.abs(horizontalTilt) >= Math.abs(verticalTilt)) {
          const dx = horizontalTilt > 0 ? 1 : -1;
          setDirection(dx, 0);
          directionLabel = dx > 0 ? "오른쪽 입력" : "왼쪽 입력";
        } else {
          const dy = verticalTilt > 0 ? 1 : -1;
          setDirection(0, dy);
          directionLabel = dy > 0 ? "아래쪽 입력" : "위쪽 입력";
        }
      }

      const now = Date.now();
      if (now - lastTiltUiUpdateRef.current >= 200) {
        lastTiltUiUpdateRef.current = now;
        setTiltDiagnostics(`센서 정상 · 좌우 ${horizontalTilt.toFixed(0)}° · 상하 ${verticalTilt.toFixed(0)}° · ${directionLabel}`);
      }
    };

    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => {
      window.clearTimeout(noSignalTimer);
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [controlMode, setDirection, tiltSensitivity]);

  useEffect(() => () => {
    tiltPermissionRef.current = false;
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const diffX = t.clientX - touchStartRef.current.x;
    const diffY = t.clientY - touchStartRef.current.y;
    if (Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX > 20) setDirection(1, 0);
      else if (diffX < -20) setDirection(-1, 0);
    } else {
      if (diffY > 20) setDirection(0, 1);
      else if (diffY < -20) setDirection(0, -1);
    }
    touchStartRef.current = null;
  };

  useEffect(() => {
    if (!defenseEncounter) return;
    const deadline = Date.now() + defenseEncounter.durationMs;
    setDefenseRemainingMs(defenseEncounter.durationMs);
    requestAnimationFrame(() => defenseInputRef.current?.focus());
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now());
      setDefenseRemainingMs(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
        defenseActiveRef.current = false;
        setDefenseEncounter(null);
        setDefenseTyped("");
        if (lives <= 1) {
          setLives(0);
          setGameOver(true);
          onGameOver();
        } else {
          setLives(lives - 1);
          resetPositions();
        }
      }
    }, 40);
    return () => window.clearInterval(timer);
  }, [defenseEncounter, lives, onGameOver, resetPositions]);

  useEffect(() => {
    if (defenseEncounter) requestAnimationFrame(() => defenseInputRef.current?.focus());
  }, [defenseEncounter]);

  const handleDoctorTyping = (value: string) => {
    if (!doctorChallenge || !doctorChallengeActiveRef.current) return;
    const expected = doctorChallenge.words[doctorChallenge.index]?.word ?? "";
    const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, "");
    const target = expected.toLocaleLowerCase().replace(/\s+/g, "");
    if (!target.startsWith(normalized)) {
      doctorChallengeActiveRef.current = false;
      setDoctorChallenge(null);
      setDefenseTyped("");
      return;
    }
    if (normalized === target) {
      if (doctorChallenge.index === 2) {
        doctorChallengeActiveRef.current = false;
        setDefenseTyped("");
        setDoctorChallenge({ ...doctorChallenge, index: 3 });
        setScore((current) => current + 300);
        window.setTimeout(() => {
          doctorModeActiveRef.current = true;
          setDoctorModeUntil(Date.now() + Math.max(3500, 7000 - stage * 400));
          setDoctorChallenge(null);
        }, 1000);
      } else {
        setDoctorChallenge({ ...doctorChallenge, index: doctorChallenge.index + 1 });
        setDefenseTyped("");
      }
    }
  };

  const handleDefenseTyping = (value: string) => {
    if (!defenseEncounter || !defenseActiveRef.current) return;
    setDefenseTyped(value);
    const normalize = (text: string) => text.trim().toLocaleLowerCase().replace(/\s+/g, "");
    if (normalize(value) === normalize(defenseEncounter.word.word)) {
      defenseActiveRef.current = false;
      const defeatedGhost = ghostsRef.current.find((ghost) => ghost.id === defenseEncounter.ghostId);
      if (defeatedGhost) {
        ghostAscensionsRef.current.push({ x: defeatedGhost.x, y: defeatedGhost.y, word: defenseEncounter.word.word.toUpperCase(), startedAt: Date.now() });
        defeatedGhost.x = 7.0;
        defeatedGhost.y = 6.0;
        defeatedGhost.dirX = 0;
        defeatedGhost.dirY = 0;
        defeatedGhost.isInHouse = true;
        defeatedGhost.isFrightened = false;
        defeatedGhost.releaseDelayMs = Date.now() - gameStartTimeRef.current + 2200;
        defeatedGhost.lastDecisionTile = "7,6";
        defeatedGhost.word = null;
      }
      setDefenseEncounter(null);
      setDefenseTyped("");
      setDefenseRemainingMs(0);
      setScore((current) => current + 100);
    }
  };

  // 메인 애니메이션 & 물리 루프
  useEffect(() => {
    if (gameOver) return;

    let animId: number;

    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = currentTime;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const pac = pacmanRef.current;
      const currentMap = mapRef.current;
      const nowMs = Date.now();
      const currentTheme = STAGE_THEMES[(stage - 1) % STAGE_THEMES.length];

      // 스테이지 클리어 대기 중이거나 READY 상태면 물리 연산 정지
      if (!isReady && !isStageClear && !defenseEncounter && !doctorChallenge) {
        // ==========================================
        // 1. 보카맨 부드러운 코너링 및 전진
        // ==========================================
        const curTileX = Math.round(pac.x);
        const curTileY = Math.round(pac.y);
        const distToCenter = Math.hypot(pac.x - curTileX, pac.y - curTileY);

        if ((pac.nextDirX !== pac.dirX || pac.nextDirY !== pac.dirY) && distToCenter < 0.28) {
          const targetTurnX = (curTileX + pac.nextDirX + COLS) % COLS;
          const targetTurnY = (curTileY + pac.nextDirY + ROWS) % ROWS;

          if (currentMap[targetTurnY][targetTurnX] !== 1) {
            pac.x = curTileX;
            pac.y = curTileY;
            pac.dirX = pac.nextDirX;
            pac.dirY = pac.nextDirY;
          }
        }

        const aheadTileX = (curTileX + pac.dirX + COLS) % COLS;
        const aheadTileY = (curTileY + pac.dirY + ROWS) % ROWS;
        let isBlocked = false;

        if (currentMap[aheadTileY][aheadTileX] === 1) {
          if (pac.dirX > 0 && pac.x >= curTileX) { pac.x = curTileX; isBlocked = true; }
          if (pac.dirX < 0 && pac.x <= curTileX) { pac.x = curTileX; isBlocked = true; }
          if (pac.dirY > 0 && pac.y >= curTileY) { pac.y = curTileY; isBlocked = true; }
          if (pac.dirY < 0 && pac.y <= curTileY) { pac.y = curTileY; isBlocked = true; }
        }

        if (!isBlocked) {
          pac.x += pac.dirX * BASE_PACMAN_SPEED * dt;
          pac.y += pac.dirY * BASE_PACMAN_SPEED * dt;

          if (pac.x < -0.4) pac.x += COLS;
          if (pac.x >= COLS - 0.4) pac.x -= COLS;
        }

        // 점 / 파워 펠릿 먹기 판정
        const eatTileX = Math.round(pac.x);
        const eatTileY = Math.round(pac.y);
        if (Math.hypot(pac.x - eatTileX, pac.y - eatTileY) < 0.3) {
          const cell = currentMap[eatTileY]?.[eatTileX];
          if (cell === 2 || cell === 3) {
            currentMap[eatTileY][eatTileX] = 0;
            const earned = cell === 2 ? 10 : 50;
            setScore((s) => s + earned);

            setDotsLeft((d) => {
              const next = d - 1;

              // 🍒 도트를 절반 먹었을 때 체리 출현 (스테이지당 1회)
              if (!cherrySpawnedRef.current && next <= totalDotsCountRef.current * 0.55) {
                cherrySpawnedRef.current = true;
                setCherryVisible(true);
                cherryTimerRef.current = setTimeout(() => {
                  setCherryVisible(false);
                }, 9000); // 9초 뒤 사라짐
              }

              // 🌟 모든 도트 소진 ➔ 스테이지 클리어!
              if (next <= 0) {
                advanceToNextStage();
              }
              return next;
            });

            if (cell === 3 && words.length > 0 && !doctorModeActiveRef.current && !doctorChallengeActiveRef.current) {
              const shuffled = [...words].sort(() => Math.random() - 0.5);
              const challengeWords = Array.from({ length: 3 }, (_, index) => shuffled[index % shuffled.length]);
              doctorChallengeActiveRef.current = true;
              setDoctorChallenge({ words: challengeWords, index: 0 });
            } else if (cell === 3) {
              // 박사 도전 중이거나 단어 데이터가 없으면 기존 파워 펠릿 효과를 유지한다.
              ghostsRef.current.forEach((g) => (g.isFrightened = true));
              if (frightenedTimerRef.current) clearTimeout(frightenedTimerRef.current);
              frightenedTimerRef.current = setTimeout(() => {
                ghostsRef.current.forEach((g) => (g.isFrightened = false));
              }, Math.max(3500, 7000 - stage * 400));
            }
          }
        }

        // 🍒 체리 획득 판정 (7, 8 위치)
        if (cherryVisible && Math.hypot(pac.x - 7, pac.y - 8) < 0.6) {
          setCherryVisible(false);
          setScore((s) => s + 100);
          setCherryPopup("+100");
          setTimeout(() => setCherryPopup(null), 1000);
          if (cherryTimerRef.current) clearTimeout(cherryTimerRef.current);
        }

        // ==========================================
        // 2. 유령 이동 및 지능 (스테이지별 속도 상승)
        // ==========================================
        const elapsed = nowMs - gameStartTimeRef.current;
        const stageSpeedBonus = Math.min(0.8, (stage - 1) * 0.15);
        const ghostSpeed = BASE_GHOST_SPEED + stageSpeedBonus;

        ghostsRef.current.forEach((g) => {
          if (g.isInHouse) {
            if (elapsed >= g.releaseDelayMs) {
              g.x = 7.0;
              g.y = 5.0;
              g.isInHouse = false;
              g.word = words.length ? words[Math.floor(Math.random() * words.length)] : null;
              g.dirX = 1;
              g.dirY = 0;
              g.lastDecisionTile = "7,5";
            }
            return;
          }

          const currentGhostSpeed = doctorModeActiveRef.current || g.isFrightened ? GHOST_FRIGHTENED_SPEED : ghostSpeed;
          const gTileX = Math.round(g.x);
          const gTileY = Math.round(g.y);
          const gDistToCenter = Math.hypot(g.x - gTileX, g.y - gTileY);
          const tileKey = `${gTileX},${gTileY}`;

          if (gDistToCenter < 0.15 && g.lastDecisionTile !== tileKey) {
            g.lastDecisionTile = tileKey;
            g.x = gTileX;
            g.y = gTileY;

            const allDirections = [
              { x: 0, y: -1 },
              { x: 0, y: 1 },
              { x: -1, y: 0 },
              { x: 1, y: 0 },
            ];

            const candidateDirs = allDirections.filter(
              (d) => !(d.x === -g.dirX && d.y === -g.dirY)
            );
            let validDirs = candidateDirs.filter((d) => {
              const gx = (gTileX + d.x + COLS) % COLS;
              const gy = (gTileY + d.y + ROWS) % ROWS;
              return currentMap[gy][gx] !== 1;
            });

            if (validDirs.length === 0) {
              validDirs = allDirections.filter((d) => {
                const gx = (gTileX + d.x + COLS) % COLS;
                const gy = (gTileY + d.y + ROWS) % ROWS;
                return currentMap[gy][gx] !== 1;
              });
            }

            if (validDirs.length > 0) {
              let chosen = validDirs[Math.floor(Math.random() * validDirs.length)];

              if (doctorModeActiveRef.current) {
                // 박사 보카맨이 된 동안 유령은 보카맨에게서 가장 멀어지는 길을 선택한다.
                validDirs.sort(
                  (a, b) =>
                    Math.hypot(gTileX + b.x - pac.x, gTileY + b.y - pac.y) -
                    Math.hypot(gTileX + a.x - pac.x, gTileY + a.y - pac.y)
                );
                chosen = validDirs[0];
              } else if (!g.isFrightened && Math.random() < 0.45) {
                validDirs.sort(
                  (a, b) =>
                    Math.hypot(gTileX + a.x - pac.x, gTileY + a.y - pac.y) -
                    Math.hypot(gTileX + b.x - pac.x, gTileY + b.y - pac.y)
                );
                chosen = validDirs[0];
              }

              g.dirX = chosen.x;
              g.dirY = chosen.y;
            }
          }

          g.x += g.dirX * currentGhostSpeed * dt;
          g.y += g.dirY * currentGhostSpeed * dt;

          if (g.x < -0.4) g.x += COLS;
          if (g.x >= COLS - 0.4) g.x -= COLS;
        });

        // ==========================================
        // 3. 충돌 검사
        // ==========================================
        if (!isInvulnerable) {
          ghostsRef.current.forEach((g) => {
            const distance = Math.hypot(pac.x - g.x, pac.y - g.y);
            if (distance < 0.72) {
              if (doctorModeActiveRef.current) {
                g.x = 7.0; g.y = 6.0; g.dirX = 0; g.dirY = 0;
                g.isInHouse = true; g.isFrightened = false;
                g.releaseDelayMs = Date.now() - gameStartTimeRef.current + 2200;
                g.lastDecisionTile = "7,6";
                g.word = null;
              } else if (g.isFrightened) {
                setScore((s) => s + 200);
                g.x = 7.0;
                g.y = 6.0;
                g.isInHouse = true;
                g.isFrightened = false;
                g.releaseDelayMs = Date.now() - gameStartTimeRef.current + 3500;
              } else if (!defenseActiveRef.current) {
                if (words.length > 0) {
                const selectedWord = g.word ?? words[Math.floor(Math.random() * words.length)];
                g.word = selectedWord;
                defenseActiveRef.current = true;
                setDefenseTyped("");
                const durationMs = Math.max(3000, 5200 - (stage - 1) * 350);
                setDefenseRemainingMs(durationMs);
                setDefenseEncounter({ ghostId: g.id, ghostColor: g.color, word: selectedWord, durationMs });
              } else {
                setLives((current) => Math.max(0, current - 1));
                if (lives <= 1) {
                  setGameOver(true);
                  onGameOver();
                } else {
                  resetPositions();
                }
              }
              }
            }
          });
        }
      }

      // 보카맨 입 뻐끔 애니메이션
      const isMoving = pac.dirX !== 0 || pac.dirY !== 0;
      if (isMoving && !isReady && !isStageClear) {
        pac.mouthAngle += 2.2 * dt * pac.mouthDir;
        if (pac.mouthAngle > 0.42) {
          pac.mouthAngle = 0.42;
          pac.mouthDir = -1;
        } else if (pac.mouthAngle < 0.05) {
          pac.mouthAngle = 0.05;
          pac.mouthDir = 1;
        }
      }

      // ==========================================
      // 4. 캔버스 렌더링
      // ==========================================
      ctx.fillStyle = currentTheme.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 미로 및 도트 그리기 (스테이지 클리어 시 벽 반짝임)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const val = currentMap[r][c];
          const px = c * CELL_SIZE;
          const py = r * CELL_SIZE;

          if (val === 1) {
            ctx.fillStyle = isStageClear && Math.floor(nowMs / 150) % 2 === 0 ? "#ffffff" : currentTheme.wall;
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            ctx.strokeStyle = isStageClear ? "#fde047" : currentTheme.stroke;
            ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          } else if (val === 2) {
            ctx.fillStyle = currentTheme.dot;
            ctx.beginPath();
            ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (val === 3) {
            ctx.fillStyle = currentTheme.power;
            ctx.beginPath();
            ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, 5.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 🍒 보너스 체리 그리기 (7, 8 위치)
      if (cherryVisible) {
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🍒", 7 * CELL_SIZE + CELL_SIZE / 2, 8 * CELL_SIZE + CELL_SIZE / 2);
      }

      // 🍒 체리 획득 +100 팝업 텍스트
      if (cherryPopup) {
        ctx.fillStyle = "#f43f5e";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(cherryPopup, 7 * CELL_SIZE + CELL_SIZE / 2, 8 * CELL_SIZE);
      }

      // 박사 모드 제한 시간 종료
      if (doctorModeActiveRef.current && nowMs >= doctorModeUntil) doctorModeActiveRef.current = false;

      // 보카맨 그리기
      const shouldDrawPacman = !isInvulnerable || Math.floor(nowMs / 140) % 2 === 0;
      if (shouldDrawPacman) {
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        const centerX = pac.x * CELL_SIZE + CELL_SIZE / 2;
        const centerY = pac.y * CELL_SIZE + CELL_SIZE / 2;
        let angleOffset = 0;
        if (pac.dirX === 1) angleOffset = 0;
        else if (pac.dirX === -1) angleOffset = Math.PI;
        else if (pac.dirY === 1) angleOffset = Math.PI / 2;
        else if (pac.dirY === -1) angleOffset = (Math.PI * 3) / 2;

        ctx.arc(
          centerX,
          centerY,
          CELL_SIZE / 2 - 1,
          angleOffset + pac.mouthAngle * Math.PI,
          angleOffset + (2 - pac.mouthAngle) * Math.PI
        );
        ctx.lineTo(centerX, centerY);
        ctx.fill();
        if (doctorModeActiveRef.current) {
          // 옆모습 보카맨에 진행 방향에 맞춰 안경과 학사모를 그린다.
          ctx.save();
          const facing = pac.dirX < 0 ? -1 : pac.dirX > 0 ? 1 : pac.dirY < 0 ? 1 : -1;
          const aura = ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, 28 + Math.sin(nowMs / 90) * 3);
          aura.addColorStop(0, "rgba(250,204,21,0.62)");
          aura.addColorStop(1, "rgba(250,204,21,0)");
          ctx.fillStyle = aura;
          ctx.beginPath(); ctx.arc(centerX, centerY, 32, 0, Math.PI * 2); ctx.fill();

          // 입이 벌어지는 방향과 같은 쪽에 안경을 배치해 옆얼굴처럼 보이게 한다.
          const glassesX = centerX + facing * 5;
          const glassesY = centerY - 3;
          ctx.strokeStyle = "#172033";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.roundRect(glassesX - 3, glassesY - 3, 7, 6, 2);
          ctx.moveTo(glassesX + facing * 4, glassesY);
          ctx.lineTo(glassesX + facing * 7, glassesY);
          ctx.stroke();

          // 학사모는 머리 위에 얹고 술은 진행 방향 뒤쪽으로 늘어뜨린다.
          ctx.fillStyle = "#1e293b";
          ctx.beginPath();
          ctx.moveTo(centerX - 10, centerY - 9);
          ctx.lineTo(centerX + 10, centerY - 9);
          ctx.lineTo(centerX + 4, centerY - 14);
          ctx.lineTo(centerX - 4, centerY - 14);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#334155";
          ctx.beginPath();
          ctx.moveTo(centerX - 13, centerY - 14);
          ctx.lineTo(centerX, centerY - 20);
          ctx.lineTo(centerX + 13, centerY - 14);
          ctx.lineTo(centerX, centerY - 10);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#facc15";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(centerX - facing * 10, centerY - 14);
          ctx.lineTo(centerX - facing * 13, centerY - 7);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 유령 그리기
      ghostsRef.current.forEach((g) => {
        const gx = g.x * CELL_SIZE + CELL_SIZE / 2;
        const gy = g.y * CELL_SIZE + CELL_SIZE / 2;
        ctx.fillStyle = g.isFrightened ? "#2563eb" : g.color;
        ctx.beginPath();
        ctx.arc(gx, gy - 2, CELL_SIZE / 2 - 2, Math.PI, 0, false);
        ctx.lineTo(gx + CELL_SIZE / 2 - 2, gy + CELL_SIZE / 2 - 2);
        ctx.lineTo(gx - CELL_SIZE / 2 + 2, gy + CELL_SIZE / 2 - 2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(gx - 3, gy - 3, 2, 0, Math.PI * 2);
        ctx.arc(gx + 3, gy - 3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(gx - 3 + g.dirX, gy - 3 + g.dirY, 1, 0, Math.PI * 2);
        ctx.arc(gx + 3 + g.dirX, gy - 3 + g.dirY, 1, 0, Math.PI * 2);
        ctx.fill();

      });

      // 정답을 맞힌 유령은 단어를 남기며 위로 승천한 뒤 소굴에서 다시 등장한다.
      ghostAscensionsRef.current = ghostAscensionsRef.current.filter((effect) => nowMs - effect.startedAt < 1050);
      ghostAscensionsRef.current.forEach((effect) => {
        const progress = Math.min(1, (nowMs - effect.startedAt) / 1050);
        const rise = 54 * (1 - Math.pow(1 - progress, 2));
        const alpha = 1 - progress;
        const x = effect.x * CELL_SIZE + CELL_SIZE / 2;
        const y = effect.y * CELL_SIZE + CELL_SIZE / 2 - rise;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 11px sans-serif";
        ctx.shadowColor = "#67e8f9";
        ctx.shadowBlur = 14;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(effect.word, x, y);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#67e8f9";
        for (let particle = 0; particle < 3; particle++) {
          ctx.beginPath();
          ctx.arc(x + Math.sin(progress * 12 + particle) * 8, y + 9 + particle * 5, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // READY 문구
      if (isReady && !isStageClear) {
        ctx.fillStyle = "#facc15";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(stage === 1 ? "READY!" : "STAGE " + stage, (COLS * CELL_SIZE) / 2, (ROWS * CELL_SIZE) / 2 + 22);
        if (stage > 1) {
          ctx.font = "bold 10px sans-serif";
          ctx.fillText(currentTheme.name, (COLS * CELL_SIZE) / 2, (ROWS * CELL_SIZE) / 2 + 38);
        }
      }

      // 🌟 STAGE CLEAR 문구
      if (isStageClear) {
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 15px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("STAGE CLEAR! 🎉", (COLS * CELL_SIZE) / 2, (ROWS * CELL_SIZE) / 2 + 10);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText("+1,000 PTS", (COLS * CELL_SIZE) / 2, (ROWS * CELL_SIZE) / 2 + 28);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [gameOver, isReady, isStageClear, isInvulnerable, lives, stage, advanceToNextStage, cherryVisible, cherryPopup, onGameOver, resetPositions, defenseEncounter, doctorChallenge, doctorModeUntil, words]);

  async function handleReplay() {
    if (replayPending) return;
    setReplayPending(true);
    try {
      if (await onReplay()) startNewGame();
    } finally {
      setReplayPending(false);
    }
  }

  return (
    <div className={isFullscreen ? "fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col items-center overflow-y-auto bg-slate-950 px-2 pb-3 pt-[max(12px,env(safe-area-inset-top))] text-white" : "relative mx-auto flex w-full max-w-4xl flex-col items-center px-1 select-none sm:px-3"}>
      <div className={isFullscreen ? "mb-2 flex w-full max-w-5xl items-center justify-between" : "mb-2 flex w-full justify-end"}>
        {isFullscreen ? <span className="text-sm font-black tracking-wide text-amber-300">PAC-MAN · ST.{stage}</span> : <button type="button" onClick={() => setIsFullscreen(true)} className="rounded-full border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-bold text-primary">크게 보기 ⛶</button>}
        {isFullscreen ? <button type="button" aria-label="큰 화면 닫기" onClick={() => setIsFullscreen(false)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/10 text-2xl font-bold text-white shadow-lg">×</button> : <HapticButton type="button" onClick={onClose} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">게임 나가기 ✕</HapticButton>}
      </div>
      {/* 점수 & 스테이지 & 목숨 표시 바 */}
      <div className={isFullscreen ? "mb-2 flex w-full max-w-5xl items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-white" : "mb-2 flex w-full items-center justify-between rounded-2xl border border-border bg-secondary/30 px-3 py-1.5"}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-primary/20 text-primary">
            ST.{stage}
          </span>
          <span className="text-[10px] font-bold text-muted-foreground">{stageTheme.name}</span>
          <span className="text-base font-black text-primary">{score}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 text-sm" title={`남은 목숨: ${lives}개`}>
            {"🟡".repeat(lives)}
            {"⚪".repeat(Math.max(0, 3 - lives))}
          </div>
          <span className="text-[11px] font-bold text-muted-foreground">
            도트: <b className="text-primary">{dotsLeft}</b>
          </span>
        </div>
      </div>

      {!isFullscreen && <section className="mb-3 w-full rounded-2xl border border-border bg-card p-3 sm:p-4" aria-label="보카맨 조작 설정">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-foreground">조작 방법</p>
            <p className="text-xs text-muted-foreground">PC는 방향키, 휴대폰은 버튼 또는 기울이기로 조작해요.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setControlMode("buttons")} aria-pressed={controlMode === "buttons"} className={controlMode === "buttons" ? "rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground" : "rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground"}>버튼 / 방향키</button>
            <button type="button" onClick={enableTiltControls} aria-pressed={controlMode === "tilt"} className={controlMode === "tilt" ? "rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground" : "rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground"}>기울기 센서 켜기</button>
          </div>
        </div>
        {controlMode === "tilt" && <div className="mt-3">
          <button type="button" aria-expanded={isTiltSettingsOpen} onClick={() => setIsTiltSettingsOpen((open) => !open)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground">센서 설정 {isTiltSettingsOpen ? "접기" : "⚙️"}</button>
          {isTiltSettingsOpen && <div className="mt-2 grid gap-2 rounded-xl bg-muted/60 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p role="status" className="text-sm font-semibold text-foreground">{tiltStatus}</p>
              <p aria-live="polite" className="mt-1 text-xs text-muted-foreground">{tiltDiagnostics}</p>
              <label className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="shrink-0">민감도</span>
                <input type="range" min="6" max="28" step="1" value={tiltSensitivity} onChange={(event) => { const value = Number(event.target.value); setTiltSensitivity(value); window.localStorage.setItem("vocaman-tilt-sensitivity", String(value)); }} className="w-full accent-primary" />
                <span className="w-8 text-right tabular-nums">{tiltSensitivity}°</span>
              </label>
            </div>
            <button type="button" onClick={calibrateTilt} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground">현재 자세로 재보정</button>
          </div>}
        </div>}
        <p className="mt-2 text-[11px] text-muted-foreground">기울기 조작은 센서가 있는 휴대폰에서 사용할 수 있어요. PC에서는 키보드 방향키를 사용하세요.</p>
      </section>}

      {/* 보카맨 캔버스 미로 */}
      <div className={isFullscreen ? "relative flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 p-1.5 ring-2 ring-white/20 shadow-2xl" : "relative rounded-2xl overflow-hidden ring-2 ring-border/80 bg-slate-950 p-1.5 shadow-md"} style={{ borderColor: stageTheme.wall, boxShadow: "0 0 14px " + stageTheme.stroke + "55" }}>
        <canvas
          ref={canvasRef}
          width={COLS * CELL_SIZE}
          height={ROWS * CELL_SIZE}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="rounded-xl block touch-none cursor-pointer mx-auto" style={isFullscreen ? { width: "min(94vw, 72dvh)", height: "auto", maxHeight: "100%" } : { width: "min(88vw, 540px)", height: "auto" }}
        />

        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 rounded-2xl text-center p-3 animate-in fade-in z-40">
            <p className="text-xl font-black text-rose-500 mb-0.5">GAME OVER</p>
            <p className="text-xs font-bold text-white mb-1">최종 스테이지: ST.{stage}</p>
            <p className="text-xs font-bold text-amber-300 mb-3">최종 점수: {score}점</p>
            {replayError && <p role="alert" className="mb-2 text-[11px] font-semibold text-rose-300">{replayError}</p>}

            {unlimitedPlays || extraPlaysLeft > 0 ? (
              <HapticButton
                hapticLabel="새 게임 시작"
                onClick={handleReplay}
                disabled={replayPending}
                wrapperClassName="relative block w-full"
                className="w-full rounded-2xl bg-primary py-2.5 px-3 text-primary-foreground shadow-md active:scale-95 transition-transform flex flex-col items-center justify-center cursor-pointer touch-manipulation"
              >
                <span className="text-sm font-bold leading-tight">{replayPending ? "코인 확인 중..." : "다시 도전 🔄"}</span>
                <span className="text-[11px] font-normal opacity-85 mt-0.5">{unlimitedPlays ? "무제한 플레이" : `추가 플레이 ${extraPlaysLeft}회`}</span>
              </HapticButton>
            ) : (
              <div className="w-full flex flex-col items-center gap-2">
                <p className="text-xs text-amber-300 font-bold">오늘의 {dailyPlayLimit}판을 모두 완료했어요! 👏</p>
                <HapticButton
                  hapticLabel="게임 닫기"
                  onClick={onClose}
                  wrapperClassName="relative block w-full"
                  className="w-full rounded-2xl bg-secondary py-2.5 px-3 text-secondary-foreground hover:bg-secondary/80 active:scale-95 transition-transform flex flex-col items-center justify-center cursor-pointer touch-manipulation"
                >
                  <span className="text-sm font-bold leading-tight">오늘은 여기까지</span>
                  <span className="text-[11px] font-normal opacity-80 mt-0.5">오늘은 여기까지! 내일 다시 만나요 👋</span>
                </HapticButton>
              </div>
            )}
          </div>
        )}
      </div>

      {doctorChallenge && (
        <div className="fixed inset-0 z-[170] flex flex-col items-center justify-center overflow-y-auto bg-slate-950/95 px-5 py-6 text-center text-white">
          <div className="mb-4 text-5xl">🎓</div>
          <p className="text-xs font-black tracking-[0.22em] text-amber-300">DOCTOR VOCA-MAN CHALLENGE</p>
          <h2 className="mt-2 text-2xl font-black">박사 보카맨에 도전!</h2>
          <p className="mt-2 text-sm text-slate-300">시간제한 없이 영어 단어 3개를 연속으로 맞혀 보세요.</p>
          <div className="relative my-5 flex h-40 w-40 items-center justify-center">
            {doctorChallenge.index >= 1 && <div className="absolute inset-0 animate-pulse rounded-full bg-[radial-gradient(circle,rgba(250,204,21,0.55),transparent_70%)]" />}
            {doctorChallenge.index >= 1 && <div className="absolute inset-0 animate-pulse text-amber-200"><span className="absolute left-2 top-5">✦</span><span className="absolute right-3 top-8">✧</span><span className="absolute bottom-4 left-5">✧</span><span className="absolute bottom-3 right-4">✦</span></div>}
            {doctorChallenge.index >= 3 && <div className="absolute -top-1 z-20 text-5xl drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]">🎓</div>}
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-amber-400 shadow-[0_0_30px_rgba(250,204,21,0.45)]">
              <span className="mb-1 text-6xl leading-none">😃</span>
              {doctorChallenge.index >= 2 && <div className="absolute left-1/2 top-[42%] z-10 flex -translate-x-1/2 items-center gap-1 drop-shadow-[0_0_5px_white]"><span className="h-5 w-7 rounded-lg border-[3px] border-slate-900 bg-amber-200/30" /><span className="h-1 w-2 bg-slate-900" /><span className="h-5 w-7 rounded-lg border-[3px] border-slate-900 bg-amber-200/30" /></div>}
            </div>
          </div>
          <div className="my-1 flex gap-3">{[0,1,2].map((step) => <span key={step} className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg font-black ${step < doctorChallenge.index ? "border-amber-300 bg-amber-300 text-slate-950" : step === doctorChallenge.index ? "border-amber-300 text-amber-200" : "border-white/20 text-slate-500"}`}>{step < doctorChallenge.index ? "✓" : step + 1}</span>)}</div>
          <div className="w-full max-w-md rounded-3xl border border-amber-300/40 bg-slate-900 p-6 shadow-[0_0_50px_rgba(250,204,21,0.15)]">
            {doctorChallenge.index < 3 ? <>
              <p className="text-xs font-bold text-amber-200">다음 영어 단어의 뜻</p>
              <p className="mt-3 text-3xl font-black">{doctorChallenge.words[doctorChallenge.index]?.meaning}</p>
              <input autoFocus value={defenseTyped} onChange={(event) => { setDefenseTyped(event.target.value); handleDoctorTyping(event.target.value); }} autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label="박사 보카맨 도전 영어 단어 입력" placeholder="영어 단어 입력" className="mt-5 h-14 w-full rounded-2xl border-2 border-amber-300 bg-white px-4 text-center text-xl font-black text-slate-900 outline-none placeholder:text-slate-400" />
            </> : <><p className="text-xl font-black text-amber-200">박사 보카맨 완성!</p><p className="mt-2 text-sm text-slate-300">잠시 후 미로로 돌아갑니다.</p></>}
          </div>
          <p className="mt-4 text-xs text-slate-400">한 문제라도 틀리면 도전은 종료되고, 이 굵은 도트의 기회는 사라집니다.</p>
        </div>
      )}

      {defenseEncounter && (
        <div className="fixed inset-x-0 z-[160] flex min-h-0 flex-col items-center justify-start overflow-y-auto overscroll-contain bg-slate-950 px-4 py-2 text-center text-white" style={{ top: encounterViewport.top, height: encounterViewport.height || "100dvh" }}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(30,64,175,0.34),transparent_58%)]" />
          <div className="relative z-10 flex w-full max-w-xl flex-1 flex-col justify-between gap-2 py-1">
            <div className="shrink-0">
              <p className="text-[10px] font-black tracking-[0.2em] text-amber-300">VOCA-MAN WORD SHIELD</p>
              <h2 className="mt-1 text-xl font-black sm:text-3xl">몬스터가 다가오고 있어요!</h2>
              <p className="mt-1 text-xs text-slate-300">뜻을 보고 영어 단어를 한 번만 정확히 입력하세요.</p>
            </div>
            <div className={`relative mx-auto flex w-full shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 ${encounterViewport.keyboardOpen ? "h-36" : "h-44 sm:h-52"}`}>
              <div className="absolute inset-x-6 bottom-5 h-2 rounded-full bg-white/10">
                <div className="h-full rounded-full bg-rose-400 transition-[width] duration-75" style={{ width: (Math.max(0, defenseRemainingMs / defenseEncounter.durationMs) * 100) + "%" }} />
              </div>
              <div className="absolute top-5 rounded-2xl border border-white/20 bg-white px-5 py-3 text-xl font-black text-slate-900 shadow-xl sm:text-2xl">
                {defenseEncounter.word.meaning}
              </div>
              <div className="absolute bottom-9 transition-all duration-75" style={{ left: (12 + (1 - defenseRemainingMs / defenseEncounter.durationMs) * 68) + "%", transform: "translateX(-50%)" }}>
                <div className="relative h-24 w-20 rounded-t-[48%] rounded-b-[22%] shadow-[0_0_34px_rgba(255,255,255,0.2)]" style={{ backgroundColor: defenseEncounter.ghostColor }}>
                  <div className="absolute left-[22%] top-[32%] flex w-[56%] justify-between">
                    <span className="h-4 w-3 rounded-full bg-white"><i className="mx-auto mt-1 block h-2 w-1 rounded-full bg-slate-900" /></span>
                    <span className="h-4 w-3 rounded-full bg-white"><i className="mx-auto mt-1 block h-2 w-1 rounded-full bg-slate-900" /></span>
                  </div>
                </div>
              </div>
              <span className="absolute bottom-2 right-4 text-[10px] font-bold text-slate-400">접근 중</span>
            </div>
            <p className="shrink-0 text-sm font-semibold text-amber-200">남은 시간 {(Math.max(0, defenseRemainingMs / 1000)).toFixed(1)}초</p>
            <input
              ref={defenseInputRef}
              autoFocus
              value={defenseTyped}
              onChange={(event) => handleDefenseTyping(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape") event.preventDefault(); }}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="몬스터를 물리칠 영어 단어 입력"
              placeholder="영어 단어를 입력하세요"
              className="h-12 w-full shrink-0 rounded-2xl border-2 bg-white px-4 text-center text-xl font-black text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-300"
              style={{ borderColor: defenseEncounter.ghostColor }}
            />
            <p className="shrink-0 text-[10px] text-slate-400">정답을 한 번 입력하면 바로 보카맨으로 돌아가요. 시간이 끝나면 라이프가 하나 줄어요.</p>
          </div>
        </div>
      )}

      {/* 터치 기기용 가상 십자 방향키 */}
      <div className={isFullscreen ? "mt-2 flex w-full flex-col items-center gap-1.5 md:hidden" : "mt-3 flex w-full flex-col items-center gap-1.5 md:hidden"}>
        <HapticButton
          hapticLabel="위로 이동"
          onClick={() => setDirection(0, -1)}
          className="w-14 h-10 rounded-2xl bg-secondary border border-border text-base font-bold active:scale-90 shadow-sm"
        >
          ⬆️
        </HapticButton>
        <div className="flex gap-4">
          <HapticButton
            hapticLabel="왼쪽 이동"
            onClick={() => setDirection(-1, 0)}
            className="w-14 h-10 rounded-2xl bg-secondary border border-border text-base font-bold active:scale-90 shadow-sm"
          >
            ⬅️
          </HapticButton>
          <HapticButton
            hapticLabel="아래로 이동"
            onClick={() => setDirection(0, 1)}
            className="w-14 h-10 rounded-2xl bg-secondary border border-border text-base font-bold active:scale-90 shadow-sm"
          >
            ⬇️
          </HapticButton>
          <HapticButton
            hapticLabel="오른쪽 이동"
            onClick={() => setDirection(1, 0)}
            className="w-14 h-10 rounded-2xl bg-secondary border border-border text-base font-bold active:scale-90 shadow-sm"
          >
            ➡️
          </HapticButton>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">도트 절반을 먹으면 보너스 체리(🍒)가 나타나요!</p>
      </div>
    </div>
  );
}
