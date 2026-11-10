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
  [1, 2, 2, 1, 2, 2, 2, 0, 2, 2, 2, 1, 2, 2, 1], // (7, 10): 팩맨 스폰 지점
  [1, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 1],
  [1, 3, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 3, 1],
  [1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

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
}

interface PacmanGameProps {
  extraPlaysLeft: number;
  dailyPlayLimit: number;
  onGameOver: () => void;
  onReplay: () => Promise<boolean>;
  onClose: () => void;
}

export function PacmanGame({ extraPlaysLeft, dailyPlayLimit, onGameOver, onReplay, onClose }: PacmanGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [score, setScore] = useState(0);
  const [stage, setStage] = useState(1); // 💡 스테이지 레벨
  const [lives, setLives] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [dotsLeft, setDotsLeft] = useState(0);
  const [isReady, setIsReady] = useState(true);
  const [isStageClear, setIsStageClear] = useState(false); // 💡 스테이지 클리어 축하 배너
  const [isInvulnerable, setIsInvulnerable] = useState(false);
  const [replayPending, setReplayPending] = useState(false);

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

  const ghostsRef = useRef<Ghost[]>([
    { id: "red", x: 7.0, y: 5.0, dirX: 1, dirY: 0, color: "#ef4444", isFrightened: false, releaseDelayMs: 0, isInHouse: false, lastDecisionTile: "" },
    { id: "pink", x: 7.0, y: 6.0, dirX: 0, dirY: -1, color: "#f472b6", isFrightened: false, releaseDelayMs: 2500, isInHouse: true, lastDecisionTile: "" },
    { id: "blue", x: 6.0, y: 6.0, dirX: 0, dirY: -1, color: "#38bdf8", isFrightened: false, releaseDelayMs: 5000, isInHouse: true, lastDecisionTile: "" },
    { id: "orange", x: 8.0, y: 6.0, dirX: 0, dirY: -1, color: "#fb923c", isFrightened: false, releaseDelayMs: 7500, isInHouse: true, lastDecisionTile: "" },
  ]);

  const mapRef = useRef<number[][]>(INITIAL_MAP.map((r) => [...r]));
  const frightenedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const gameStartTimeRef = useRef<number>(Date.now());
  const lastTimeRef = useRef<number>(performance.now());
  const totalDotsCountRef = useRef(0);

  // 라운드 내 위치 초기화 (피격 시)
  const resetPositions = useCallback(() => {
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
      { id: "red", x: 7.0, y: 5.0, dirX: 1, dirY: 0, color: "#ef4444", isFrightened: false, releaseDelayMs: 0, isInHouse: false, lastDecisionTile: "" },
      { id: "pink", x: 7.0, y: 6.0, dirX: 0, dirY: -1, color: "#f472b6", isFrightened: false, releaseDelayMs: 2500, isInHouse: true, lastDecisionTile: "" },
      { id: "blue", x: 6.0, y: 6.0, dirX: 0, dirY: -1, color: "#38bdf8", isFrightened: false, releaseDelayMs: 5000, isInHouse: true, lastDecisionTile: "" },
      { id: "orange", x: 8.0, y: 6.0, dirX: 0, dirY: -1, color: "#fb923c", isFrightened: false, releaseDelayMs: 7500, isInHouse: true, lastDecisionTile: "" },
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
    setIsStageClear(true);
    setScore((prev) => prev + 1000); // 스테이지 완주 보너스 1,000점

    if (cherryTimerRef.current) clearTimeout(cherryTimerRef.current);
    setCherryVisible(false);
    cherrySpawnedRef.current = false;

    setTimeout(() => {
      mapRef.current = INITIAL_MAP.map((r) => [...r]);
      setDotsLeft(totalDotsCountRef.current);
      setStage((prev) => prev + 1);
      setIsStageClear(false);
      resetPositions();
    }, 1800);
  }, [resetPositions]);

  // 전체 게임 새판 시작
  const startNewGame = useCallback(() => {
    mapRef.current = INITIAL_MAP.map((r) => [...r]);
    let count = 0;
    INITIAL_MAP.forEach((row) =>
      row.forEach((cell) => {
        if (cell === 2 || cell === 3) count++;
      })
    );
    totalDotsCountRef.current = count;
    setDotsLeft(count);
    setScore(0);
    setStage(1);
    setLives(3);
    setGameOver(false);
    setIsStageClear(false);
    setCherryVisible(false);
    setCherryPopup(null);
    cherrySpawnedRef.current = false;
    resetPositions();
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
      if (e.key === "ArrowUp") setDirection(0, -1);
      if (e.key === "ArrowDown") setDirection(0, 1);
      if (e.key === "ArrowLeft") setDirection(-1, 0);
      if (e.key === "ArrowRight") setDirection(1, 0);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setDirection]);

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

      // 스테이지 클리어 대기 중이거나 READY 상태면 물리 연산 정지
      if (!isReady && !isStageClear) {
        // ==========================================
        // 1. 팩맨 부드러운 코너링 및 전진
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

            if (cell === 3) {
              ghostsRef.current.forEach((g) => (g.isFrightened = true));
              if (frightenedTimerRef.current) clearTimeout(frightenedTimerRef.current);
              frightenedTimerRef.current = setTimeout(() => {
                ghostsRef.current.forEach((g) => (g.isFrightened = false));
              }, Math.max(3500, 7000 - stage * 400)); // 스테이지가 오를수록 공포 시간 단축
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
              g.dirX = 1;
              g.dirY = 0;
              g.lastDecisionTile = "7,5";
            }
            return;
          }

          const currentGhostSpeed = g.isFrightened ? GHOST_FRIGHTENED_SPEED : ghostSpeed;
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

              if (!g.isFrightened && Math.random() < 0.45) {
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
              if (g.isFrightened) {
                setScore((s) => s + 200);
                g.x = 7.0;
                g.y = 6.0;
                g.isInHouse = true;
                g.isFrightened = false;
                g.releaseDelayMs = Date.now() - gameStartTimeRef.current + 3500;
              } else {
                if (lives > 1) {
                  setLives((l) => l - 1);
                  resetPositions();
                } else {
                  setLives(0);
                  setGameOver(true);
                  onGameOver();
                }
              }
            }
          });
        }
      }

      // 팩맨 입 뻐끔 애니메이션
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
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 미로 및 도트 그리기 (스테이지 클리어 시 벽 반짝임)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const val = currentMap[r][c];
          const px = c * CELL_SIZE;
          const py = r * CELL_SIZE;

          if (val === 1) {
            ctx.fillStyle = isStageClear && Math.floor(nowMs / 150) % 2 === 0 ? "#ffffff" : "#1e3a8a";
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            ctx.strokeStyle = isStageClear ? "#fde047" : "#3b82f6";
            ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          } else if (val === 2) {
            ctx.fillStyle = "#fef08a";
            ctx.beginPath();
            ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (val === 3) {
            ctx.fillStyle = "#facc15";
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

      // 팩맨 그리기
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

      // READY 문구
      if (isReady && !isStageClear) {
        ctx.fillStyle = "#facc15";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("READY!", (COLS * CELL_SIZE) / 2, (ROWS * CELL_SIZE) / 2 + 28);
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
  }, [gameOver, isReady, isStageClear, isInvulnerable, lives, stage, advanceToNextStage, cherryVisible, cherryPopup, onGameOver, resetPositions]);

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
    <div className="w-full flex flex-col items-center select-none relative">
      <div className="mb-2 flex w-full justify-end"><button type="button" onClick={onClose} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">게임 나가기 ✕</button></div>
      {/* 점수 & 스테이지 & 목숨 표시 바 */}
      <div className="w-full flex items-center justify-between px-3 py-1.5 mb-2 rounded-2xl bg-secondary/30 border border-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-primary/20 text-primary">
            ST.{stage}
          </span>
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

      {/* 팩맨 캔버스 미로 */}
      <div className="relative rounded-2xl overflow-hidden ring-2 ring-border/80 bg-slate-950 p-1.5 shadow-md">
        <canvas
          ref={canvasRef}
          width={COLS * CELL_SIZE}
          height={ROWS * CELL_SIZE}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="rounded-xl block touch-none cursor-pointer"
        />

        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 rounded-2xl text-center p-3 animate-in fade-in z-40">
            <p className="text-xl font-black text-rose-500 mb-0.5">GAME OVER</p>
            <p className="text-xs font-bold text-white mb-1">최종 스테이지: ST.{stage}</p>
            <p className="text-xs font-bold text-amber-300 mb-3">최종 점수: {score}점</p>

            {extraPlaysLeft > 0 ? (
              <HapticButton
                hapticLabel="새 게임 시작"
                onClick={handleReplay}
                disabled={replayPending}
                wrapperClassName="relative block w-full"
                className="w-full rounded-2xl bg-primary py-2.5 px-3 text-primary-foreground shadow-md active:scale-95 transition-transform flex flex-col items-center justify-center cursor-pointer touch-manipulation"
              >
                <span className="text-sm font-bold leading-tight">{replayPending ? "코인 확인 중..." : "다시 도전 🔄"}</span>
                <span className="text-[11px] font-normal opacity-85 mt-0.5">추가 플레이 {extraPlaysLeft}회</span>
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

      {/* 모바일 가상 십자 방향키 */}
      <div className="w-full mt-3 flex flex-col items-center gap-1.5">
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
