import React, { useEffect, useRef } from 'react';
import { MatchEngine } from '../engine/MatchEngine';
import { LightingMood, PlayerMatchState, VisualLayers } from '../types/match';

interface MatchViewportProps {
  engineRef: React.MutableRefObject<MatchEngine>;
  visualLayers: VisualLayers;
  lightingMood: LightingMood;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string | null) => void;
  matchRevision: number;
}

// World pitch dimensions in meters (centered at 0, 0)
const PITCH_W = 105;
const PITCH_H = 68;
const HALF_W = PITCH_W / 2; // 52.5
const HALF_H = PITCH_H / 2; // 34.0
const RUNOFF_X = 6.2; // accommodates goal depth (2.4m) + ad boards
const RUNOFF_Z = 5.4; // accommodates dugouts / touchline margin
const WORLD_TOTAL_W = PITCH_W + RUNOFF_X * 2; // 117.4m
const WORLD_TOTAL_H = PITCH_H + RUNOFF_Z * 2; // 78.8m

const TRAIL_COUNT = 20;
const PARTICLE_COUNT = 42;

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return `rgba(255,255,255,${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export const MatchViewport: React.FC<MatchViewportProps> = ({
  engineRef,
  visualLayers,
  lightingMood,
  selectedPlayerId,
  onSelectPlayer,
  matchRevision,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const layersRef = useRef(visualLayers);
  const selectedIdRef = useRef(selectedPlayerId);
  const moodRef = useRef(lightingMood);
  const callbacksRef = useRef({ onSelectPlayer });

  layersRef.current = visualLayers;
  selectedIdRef.current = selectedPlayerId;
  moodRef.current = lightingMood;
  callbacksRef.current = { onSelectPlayer };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Pre-allocated trail & particle buffers (Zero GC)
    const trailX = new Float32Array(TRAIL_COUNT);
    const trailZ = new Float32Array(TRAIL_COUNT);
    const trailY = new Float32Array(TRAIL_COUNT);
    let trailLen = 0;
    let trailAccum = 0;

    const pX = new Float32Array(PARTICLE_COUNT);
    const pZ = new Float32Array(PARTICLE_COUNT);
    const pVx = new Float32Array(PARTICLE_COUNT);
    const pVz = new Float32Array(PARTICLE_COUNT);
    const pLife = new Float32Array(PARTICLE_COUNT);
    let pCursor = 0;

    let prevBallVy = 0;
    let prevShotState = false;
    let hoveredPlayerId: string | null = null;

    // Viewport transform cache
    let viewW = 1280;
    let viewH = 720;
    let dpr = 1;
    let scale = 10; // px per meter
    let originX = 640; // canvas px for world x=0
    let originY = 360; // canvas px for world z=0
    let isPortrait = false;

    const updateLayout = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw <= 0 || ch <= 0) return;

      viewW = Math.max(120, cw);
      viewH = Math.max(120, ch);
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(viewW * dpr);
      canvas.height = Math.round(viewH * dpr);
      canvas.style.width = `${viewW}px`;
      canvas.style.height = `${viewH}px`;

      isPortrait = viewH > viewW * 1.06;

      // Framed FM08 pitch padding inside the workspace canvas
      const topSafe = viewH < 420 ? 4 : 10;
      const bottomSafe = viewH < 420 ? 4 : 10;
      const sideSafe = viewW < 520 ? 4 : 12;

      const availW = Math.max(100, viewW - sideSafe * 2);
      const availH = Math.max(100, viewH - topSafe - bottomSafe);

      scale = isPortrait
        ? Math.min(availW / WORLD_TOTAL_H, availH / WORLD_TOTAL_W)
        : Math.min(availW / WORLD_TOTAL_W, availH / WORLD_TOTAL_H);

      originX = viewW * 0.5;
      originY = topSafe + availH * 0.5;
    };

    const emitBurst = (bx: number, bz: number, count: number, power = 1) => {
      for (let i = 0; i < count; i++) {
        const idx = pCursor;
        pCursor = (pCursor + 1) % PARTICLE_COUNT;
        const ang = Math.random() * Math.PI * 2;
        const spd = (1.5 + Math.random() * 2.8) * power;
        pX[idx] = bx + (Math.random() - 0.5) * 0.4;
        pZ[idx] = bz + (Math.random() - 0.5) * 0.4;
        pVx[idx] = Math.cos(ang) * spd;
        pVz[idx] = Math.sin(ang) * spd;
        pLife[idx] = 0.28 + Math.random() * 0.22;
      }
    };

    const findPlayerAtClientPos = (clientX: number, clientY: number): string | null => {
      const rect = canvas.getBoundingClientRect();
      const dx = clientX - rect.left - originX;
      const dy = clientY - rect.top - originY;
      const wx = isPortrait ? -dy / scale : dx / scale;
      const wz = isPortrait ? dx / scale : dy / scale;
      const eng = engineRef.current;

      const maxHitDist = Math.max(2.6, 22 / scale);
      let bestId: string | null = null;
      let bestDist = maxHitDist;

      const scanList = (list: PlayerMatchState[]) => {
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          if (!p.onPitch || p.redCard) continue;
          const d = Math.hypot(p.x - wx, p.z - wz);
          if (d < bestDist) {
            bestDist = d;
            bestId = p.id;
          }
        }
      };
      scanList(eng.homePlayers);
      scanList(eng.awayPlayers);
      return bestId;
    };

    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      const hit = findPlayerAtClientPos(e.clientX, e.clientY);
      if (hit !== hoveredPlayerId) {
        hoveredPlayerId = hit;
        canvas.style.cursor = hit ? 'pointer' : 'default';
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) return;
      const hit = findPlayerAtClientPos(e.clientX, e.clientY);
      callbacksRef.current.onSelectPlayer(hit);
    };

    updateLayout();
    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(container);
    window.addEventListener('resize', updateLayout);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;
    let ballSpinAngle = 0;

    const toPxX = (wx: number) => originX + wx * scale;
    const toPxY = (wz: number) => originY + wz * scale;

    function drawPitch(elapsedSec: number) {
      const eng = engineRef.current;
      const isNight = moodRef.current === 'night';

      // 1. FM08 Framed Grass Surround (covers full viewport in screen coords before any portrait rotation)
      ctx!.fillStyle = isNight ? '#1b4120' : '#4a762a';
      ctx!.fillRect(0, 0, viewW, viewH);

      if (isPortrait) {
        ctx!.save();
        ctx!.translate(originX, originY);
        ctx!.rotate(-Math.PI / 2);
        ctx!.translate(-originX, -originY);
      }

      // 2. Outer stadium turf apron
      const apronX = toPxX(-HALF_W - RUNOFF_X);
      const apronY = toPxY(-HALF_H - RUNOFF_Z);
      const apronW = WORLD_TOTAL_W * scale;
      const apronH = WORLD_TOTAL_H * scale;

      ctx!.fillStyle = isNight ? '#1f4924' : '#4f7d2e';
      ctx!.fillRect(apronX, apronY, apronW, apronH);

      // Subtle stadium perimeter border
      ctx!.strokeStyle = isNight ? 'rgba(203, 213, 225, 0.18)' : 'rgba(255, 255, 255, 0.22)';
      ctx!.lineWidth = 1;
      ctx!.strokeRect(apronX + 1, apronY + 1, apronW - 2, apronH - 2);

      // Technical areas & FM08 dugouts with bench disc markers along top touchline
      const dugoutW = 9.2 * scale;
      const dugoutH = 2.6 * scale;
      const dugoutY = toPxY(-HALF_H - 4.0);

      const drawBenchMarkers = (startX: number, color: string, secondary: string) => {
        ctx!.fillStyle = 'rgba(241, 245, 249, 0.22)';
        ctx!.fillRect(toPxX(startX), dugoutY, dugoutW, dugoutH);
        ctx!.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx!.lineWidth = 1.1;
        ctx!.strokeRect(toPxX(startX), dugoutY, dugoutW, dugoutH);

        const benchR = Math.max(3.6, Math.min(5.2, 0.54 * scale));
        for (let bIdx = 0; bIdx < 5; bIdx++) {
          const bx = toPxX(startX + 1.2 + bIdx * 1.7);
          const by = dugoutY + dugoutH * 0.56;
          ctx!.fillStyle = color;
          ctx!.beginPath();
          ctx!.arc(bx, by, benchR, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.strokeStyle = '#0f172a';
          ctx!.lineWidth = 1;
          ctx!.stroke();
          ctx!.strokeStyle = secondary;
          ctx!.lineWidth = 0.8;
          ctx!.beginPath();
          ctx!.arc(bx, by, benchR - 1, 0, Math.PI * 2);
          ctx!.stroke();
        }
      };

      drawBenchMarkers(-17.5, eng.homeClub.colors.primary, eng.homeClub.colors.secondary);
      drawBenchMarkers(8.3, eng.awayClub.colors.primary, eng.awayClub.colors.secondary);

      // 3. Alternating FM08 mowed vertical grass bands inside 105x68m pitch
      const stripes = 18;
      const stripeW = PITCH_W / stripes;
      const pitchLeftPx = toPxX(-HALF_W);
      const pitchTopPx = toPxY(-HALF_H);
      const pitchPxW = PITCH_W * scale;
      const pitchPxH = PITCH_H * scale;

      const lightBand = isNight ? '#265c2b' : '#5e9037';
      const darkBand = isNight ? '#215125' : '#52802e';

      for (let i = 0; i < stripes; i++) {
        const sx = toPxX(-HALF_W + i * stripeW);
        const sw = stripeW * scale + 0.6;
        ctx!.fillStyle = i % 2 === 0 ? lightBand : darkBand;
        ctx!.fillRect(sx, pitchTopPx, sw, pitchPxH);
      }

      // Subtle floodlight vignette only in night mode
      if (isNight) {
        const grad = ctx!.createRadialGradient(
          originX,
          originY,
          pitchPxH * 0.25,
          originX,
          originY,
          pitchPxW * 0.68
        );
        grad.addColorStop(0, 'rgba(255, 255, 240, 0.04)');
        grad.addColorStop(1, 'rgba(2, 10, 8, 0.22)');
        ctx!.fillStyle = grad;
        ctx!.fillRect(pitchLeftPx, pitchTopPx, pitchPxW, pitchPxH);
      }

      // (Match clock is drawn upright in screen space at end of renderFrame)

      // 4. Tactical Grid Overlay (under markings if active)
      if (layersRef.current.tacticalZones) {
        ctx!.save();
        ctx!.strokeStyle = 'rgba(56, 189, 248, 0.34)';
        ctx!.lineWidth = Math.max(1, 0.14 * scale);
        ctx!.setLineDash([5, 4]);
        [-17.5, 17.5].forEach((tx) => {
          const px = toPxX(tx);
          ctx!.beginPath();
          ctx!.moveTo(px, pitchTopPx);
          ctx!.lineTo(px, pitchTopPx + pitchPxH);
          ctx!.stroke();
        });
        [-18, -9, 9, 18].forEach((tz) => {
          const py = toPxY(tz);
          ctx!.beginPath();
          ctx!.moveTo(pitchLeftPx, py);
          ctx!.lineTo(pitchLeftPx + pitchPxW, py);
          ctx!.stroke();
        });
        ctx!.setLineDash([]);

        // Subtle Zone 14 highlight boxes in front of both penalty areas
        ctx!.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx!.fillRect(toPxX(17.5), toPxY(-9), 18.5 * scale, 18 * scale);
        ctx!.fillRect(toPxX(-36), toPxY(-9), 18.5 * scale, 18 * scale);
        ctx!.restore();
      }

      // 5. Crisp Chalk-White Pitch Markings
      ctx!.strokeStyle = 'rgba(248, 250, 252, 0.90)';
      ctx!.fillStyle = 'rgba(248, 250, 252, 0.92)';
      ctx!.lineWidth = Math.max(1.3, 0.14 * scale);

      // Outer perimeter
      ctx!.strokeRect(pitchLeftPx, pitchTopPx, pitchPxW, pitchPxH);

      // Halfway line
      ctx!.beginPath();
      ctx!.moveTo(toPxX(0), pitchTopPx);
      ctx!.lineTo(toPxX(0), pitchTopPx + pitchPxH);
      ctx!.stroke();

      // Center circle & spot
      ctx!.beginPath();
      ctx!.arc(originX, originY, 9.15 * scale, 0, Math.PI * 2);
      ctx!.stroke();

      ctx!.beginPath();
      ctx!.arc(originX, originY, Math.max(2, 0.25 * scale), 0, Math.PI * 2);
      ctx!.fill();

      // Left & Right Penalty Boxes + 6-yard Boxes + Penalty Spots + Arcs
      const penW = 16.5 * scale;
      const penH = 40.32 * scale;
      const goalBoxW = 5.5 * scale;
      const goalBoxH = 18.32 * scale;

      // Left penalty area
      ctx!.strokeRect(pitchLeftPx, toPxY(-20.16), penW, penH);
      ctx!.strokeRect(pitchLeftPx, toPxY(-9.16), goalBoxW, goalBoxH);
      ctx!.beginPath();
      ctx!.arc(toPxX(-41.5), originY, Math.max(1.8, 0.22 * scale), 0, Math.PI * 2);
      ctx!.fill();
      // Left penalty arc
      const arcAngle = Math.acos(5.5 / 9.15); // ~0.926 rad
      ctx!.beginPath();
      ctx!.arc(toPxX(-41.5), originY, 9.15 * scale, -arcAngle, arcAngle);
      ctx!.stroke();

      // Right penalty area
      ctx!.strokeRect(toPxX(HALF_W - 16.5), toPxY(-20.16), penW, penH);
      ctx!.strokeRect(toPxX(HALF_W - 5.5), toPxY(-9.16), goalBoxW, goalBoxH);
      ctx!.beginPath();
      ctx!.arc(toPxX(41.5), originY, Math.max(1.8, 0.22 * scale), 0, Math.PI * 2);
      ctx!.fill();
      // Right penalty arc
      ctx!.beginPath();
      ctx!.arc(toPxX(41.5), originY, 9.15 * scale, Math.PI - arcAngle, Math.PI + arcAngle);
      ctx!.stroke();

      // 4 Corner Arcs
      const cRad = 1.05 * scale;
      ctx!.beginPath();
      ctx!.arc(toPxX(-HALF_W), toPxY(-HALF_H), cRad, 0, Math.PI * 0.5);
      ctx!.stroke();
      ctx!.beginPath();
      ctx!.arc(toPxX(HALF_W), toPxY(-HALF_H), cRad, Math.PI * 0.5, Math.PI);
      ctx!.stroke();
      ctx!.beginPath();
      ctx!.arc(toPxX(HALF_W), toPxY(HALF_H), cRad, Math.PI, Math.PI * 1.5);
      ctx!.stroke();
      ctx!.beginPath();
      ctx!.arc(toPxX(-HALF_W), toPxY(HALF_H), cRad, Math.PI * 1.5, Math.PI * 2);
      ctx!.stroke();

      // 6. Corner Flags (tiny fluttering triangles)
      const drawFlag = (wx: number, wz: number, phase: number) => {
        const fx = toPxX(wx);
        const fy = toPxY(wz);
        const flutter = Math.sin(elapsedSec * 4.5 + phase) * 0.35;
        ctx!.fillStyle = '#facc15';
        ctx!.beginPath();
        ctx!.moveTo(fx, fy);
        ctx!.lineTo(fx + Math.cos(flutter - 0.3) * 0.8 * scale, fy + Math.sin(flutter - 0.3) * 0.8 * scale);
        ctx!.lineTo(fx + Math.cos(flutter + 0.35) * 0.55 * scale, fy + Math.sin(flutter + 0.35) * 0.55 * scale);
        ctx!.closePath();
        ctx!.fill();
        ctx!.fillStyle = '#ffffff';
        ctx!.beginPath();
        ctx!.arc(fx, fy, Math.max(1.5, 0.14 * scale), 0, Math.PI * 2);
        ctx!.fill();
      };
      drawFlag(-HALF_W, -HALF_H, 0);
      drawFlag(HALF_W, -HALF_H, 1.4);
      drawFlag(-HALF_W, HALF_H, 2.7);
      drawFlag(HALF_W, HALF_H, 4.1);

      // 7. 2D Goal Cages + Animated Viscoelastic Net Ripples
      const drawGoal = (isRight: boolean, ripple: number) => {
        const lineX = isRight ? HALF_W : -HALF_W;
        const backX = isRight ? HALF_W + 2.35 : -HALF_W - 2.35;
        const postTop = -3.66;
        const postBot = 3.66;
        const wave = ripple > 0.005 ? Math.sin(elapsedSec * 24) * ripple * 0.45 : 0;
        const bulge = ripple > 0.005 ? ripple * 0.65 * (isRight ? 1 : -1) : 0;

        // Net shadow / bay fill
        ctx!.fillStyle = 'rgba(15, 23, 42, 0.35)';
        ctx!.beginPath();
        ctx!.moveTo(toPxX(lineX), toPxY(postTop));
        ctx!.lineTo(toPxX(backX + bulge), toPxY(postTop + wave));
        ctx!.lineTo(toPxX(backX + bulge), toPxY(postBot - wave));
        ctx!.lineTo(toPxX(lineX), toPxY(postBot));
        ctx!.closePath();
        ctx!.fill();

        // Fine net mesh lines
        ctx!.strokeStyle = 'rgba(226, 232, 240, 0.34)';
        ctx!.lineWidth = 0.8;
        for (let i = 1; i <= 5; i++) {
          const t = i / 6;
          const z = postTop + (postBot - postTop) * t;
          const xBend = bulge * Math.sin(t * Math.PI);
          ctx!.beginPath();
          ctx!.moveTo(toPxX(lineX), toPxY(z));
          ctx!.lineTo(toPxX(backX + xBend), toPxY(z + wave * Math.sin(t * Math.PI)));
          ctx!.stroke();
        }

        // Goal frame stanchions & crossbar
        ctx!.strokeStyle = '#f8fafc';
        ctx!.lineWidth = Math.max(2, 0.22 * scale);
        ctx!.beginPath();
        ctx!.moveTo(toPxX(lineX), toPxY(postTop));
        ctx!.lineTo(toPxX(backX + bulge), toPxY(postTop + wave));
        ctx!.lineTo(toPxX(backX + bulge), toPxY(postBot - wave));
        ctx!.lineTo(toPxX(lineX), toPxY(postBot));
        ctx!.stroke();

        // Goalposts circles
        const postR = Math.max(2.2, 0.24 * scale);
        ctx!.fillStyle = '#ffffff';
        ctx!.strokeStyle = '#0f172a';
        ctx!.lineWidth = 1;
        [postTop, postBot].forEach((pz) => {
          ctx!.beginPath();
          ctx!.arc(toPxX(lineX), toPxY(pz), postR, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.stroke();
        });
      };

      drawGoal(false, eng.ball.netRippleLeft);
      drawGoal(true, eng.ball.netRippleRight);

      // 8. Offside Lines Overlay
      if (layersRef.current.offsideLine) {
        ctx!.save();
        ctx!.lineWidth = Math.max(1.5, 0.16 * scale);
        ctx!.setLineDash([6, 4]);

        ctx!.strokeStyle = hexToRgba(eng.homeClub.colors.primary, 0.85);
        ctx!.beginPath();
        ctx!.moveTo(toPxX(eng.homeOffsideLineX), pitchTopPx);
        ctx!.lineTo(toPxX(eng.homeOffsideLineX), pitchTopPx + pitchPxH);
        ctx!.stroke();

        ctx!.strokeStyle = hexToRgba(eng.awayClub.colors.primary, 0.85);
        ctx!.beginPath();
        ctx!.moveTo(toPxX(eng.awayOffsideLineX), pitchTopPx);
        ctx!.lineTo(toPxX(eng.awayOffsideLineX), pitchTopPx + pitchPxH);
        ctx!.stroke();

        ctx!.restore();
      }

      // 9. Pass Network Overlay (Home team)
      if (layersRef.current.passNetwork) {
        ctx!.save();
        eng.passMap.forEach((link) => {
          if (link.side !== 'home' || link.count < 2) return;
          const a = eng.homePlayers.find((pl) => pl.id === link.fromId && pl.onPitch);
          const b = eng.homePlayers.find((pl) => pl.id === link.toId && pl.onPitch);
          if (!a || !b) return;
          ctx!.strokeStyle = `rgba(56, 189, 248, ${Math.min(0.75, 0.18 + link.count * 0.06)})`;
          ctx!.lineWidth = Math.min(4.2, 0.9 + link.count * 0.32);
          ctx!.beginPath();
          ctx!.moveTo(toPxX(a.x), toPxY(a.z));
          ctx!.lineTo(toPxX(b.x), toPxY(b.z));
          ctx!.stroke();
        });
        ctx!.restore();
      }
    }

    function drawPlayerToken(
      p: PlayerMatchState,
      colors: typeof engineRef.current.homeClub.colors,
      isCarrier: boolean,
      isSelected: boolean,
      isHovered: boolean,
      showLabel: boolean
    ) {
      const px = toPxX(p.x);
      const py = toPxY(p.z);
      const jumpScale = 1 + Math.max(0, p.y) * 0.14;
      const baseR = Math.max(5.8, Math.min(10.8, 0.98 * scale));
      const r = baseR * jumpScale;

      const fx = Math.cos(p.facing);
      const fz = Math.sin(p.facing);
      const sx = -fz; // right-hand lateral unit vector
      const sz = fx;

      // Ground contact shadow (offsets slightly as player leaps)
      const shadowOffset = (0.25 + p.y * 0.65) * scale;
      ctx!.fillStyle = `rgba(2, 6, 12, ${Math.max(0.18, 0.44 - p.y * 0.12)})`;
      ctx!.beginPath();
      ctx!.ellipse(
        px + shadowOffset * 0.7,
        py + shadowOffset * 0.85,
        baseR * 1.05,
        baseR * 0.85,
        0,
        0,
        Math.PI * 2
      );
      ctx!.fill();

      // Sliding tackle turf skid streak & extended reach marker
      if (p.slideTimer > 0) {
        ctx!.save();
        ctx!.strokeStyle = 'rgba(132, 204, 22, 0.55)';
        ctx!.lineWidth = Math.max(3, baseR * 0.55);
        ctx!.lineCap = 'round';
        ctx!.beginPath();
        ctx!.moveTo(px - p.slideDirX * baseR * 2.2, py - p.slideDirZ * baseR * 2.2);
        ctx!.lineTo(px + p.slideDirX * baseR * 1.15, py + p.slideDirZ * baseR * 1.15);
        ctx!.stroke();
        ctx!.restore();
      }

      // Goalkeeper outstretched dive silhouette
      if (p.diveAnimTimer > 0) {
        const dProg = Math.sin((p.diveAnimTimer / 0.55) * Math.PI);
        const reach = baseR * (1.25 + dProg * 0.9);
        const dx = sx * p.diveDir * reach;
        const dy = sz * p.diveDir * reach;
        ctx!.save();
        ctx!.strokeStyle = colors.gkPrimary;
        ctx!.lineWidth = Math.max(4, baseR * 0.72);
        ctx!.lineCap = 'round';
        ctx!.beginPath();
        ctx!.moveTo(px - dx * 0.35, py - dy * 0.35);
        ctx!.lineTo(px + dx, py + dy);
        ctx!.stroke();
        // White GK gloves tip
        ctx!.fillStyle = '#f8fafc';
        ctx!.beginPath();
        ctx!.arc(px + dx, py + dy, Math.max(2.5, baseR * 0.28), 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }

      // Selection or Ball Carrier tactical halo
      if (isSelected) {
        ctx!.strokeStyle = '#facc15';
        ctx!.lineWidth = 2.4;
        ctx!.beginPath();
        ctx!.arc(px, py, r + 4.5, 0, Math.PI * 2);
        ctx!.stroke();
      } else if (isHovered) {
        ctx!.strokeStyle = 'rgba(255, 255, 255, 0.72)';
        ctx!.lineWidth = 1.6;
        ctx!.beginPath();
        ctx!.arc(px, py, r + 3.5, 0, Math.PI * 2);
        ctx!.stroke();
      }

      if (isCarrier) {
        ctx!.strokeStyle = 'rgba(56, 189, 248, 0.92)';
        ctx!.lineWidth = 2.2;
        ctx!.beginPath();
        ctx!.arc(px, py, r + 2.6, 0, Math.PI * 2);
        ctx!.stroke();
      }

      // Classic FM08 directional shoulder / facing arc
      const facingAngle = p.facing;
      const bodyColor = p.assignedRole === 'POR' ? colors.gkPrimary : colors.primary;
      const trimColor = p.assignedRole === 'POR' ? colors.accent : colors.secondary;

      // Subtle kick extension pip during shot/pass
      if (p.kickAnimTimer > 0) {
        const k = Math.sin((p.kickAnimTimer / 0.34) * Math.PI);
        const sideSign = p.lastKickFoot === 'I' ? -1 : 1;
        const kx = px + fx * (r + k * 4.5) + sx * sideSign * (r * 0.35);
        const ky = py + fz * (r + k * 4.5) + sz * sideSign * (r * 0.35);
        ctx!.fillStyle = '#111827';
        ctx!.beginPath();
        ctx!.arc(kx, ky, Math.max(2, r * 0.22), 0, Math.PI * 2);
        ctx!.fill();
      }

      // Main 2D FM08 disc body
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(px, py, r, 0, Math.PI * 2);
      ctx!.fillStyle = bodyColor;
      ctx!.fill();

      // Clip interior for secondary kit shoulder stripe / half band
      ctx!.clip();
      ctx!.fillStyle = trimColor;
      ctx!.beginPath();
      ctx!.arc(px, py, r, facingAngle - Math.PI * 0.36, facingAngle + Math.PI * 0.36);
      ctx!.lineTo(px + fx * r * 0.3, py + fz * r * 0.3);
      ctx!.closePath();
      ctx!.globalAlpha = 0.28;
      ctx!.fill();
      ctx!.globalAlpha = 1;

      // Classic FM08 top-left subtle bevel sheen
      const sheen = ctx!.createRadialGradient(
        px - r * 0.32,
        py - r * 0.32,
        r * 0.08,
        px,
        py,
        r
      );
      sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
      sheen.addColorStop(0.65, 'rgba(255,255,255,0)');
      sheen.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx!.fillStyle = sheen;
      ctx!.fillRect(px - r, py - r, r * 2, r * 2);
      ctx!.restore();

      // Crisp FM08 dual rim (outer dark border + inner clean ring)
      ctx!.strokeStyle = '#090d12';
      ctx!.lineWidth = 2.2;
      ctx!.beginPath();
      ctx!.arc(px, py, r, 0, Math.PI * 2);
      ctx!.stroke();

      ctx!.strokeStyle = trimColor;
      ctx!.lineWidth = 1.25;
      ctx!.beginPath();
      ctx!.arc(px, py, r - 1.1, 0, Math.PI * 2);
      ctx!.stroke();

      // Directional FM08 front indicator (small bright chevron/pip at facing nose)
      const noseX = px + fx * (r - 0.5);
      const noseY = py + fz * (r - 0.5);
      ctx!.fillStyle = '#f8fafc';
      ctx!.strokeStyle = '#090d12';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(noseX, noseY, Math.max(1.9, r * 0.21), 0, Math.PI * 2);
      ctx!.fill();
      ctx!.stroke();

      // Dorsal Jersey Number & Name Tag (counter-rotated on portrait mobile so text stays upright)
      ctx!.save();
      ctx!.translate(px, py);
      if (isPortrait) {
        ctx!.rotate(Math.PI / 2);
      }

      const fontSize = Math.max(7.5, Math.round(r * 0.96));
      ctx!.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.lineWidth = 2.4;
      ctx!.strokeStyle = 'rgba(8, 12, 18, 0.88)';
      ctx!.strokeText(String(p.number), 0, 0.5);
      ctx!.fillStyle = '#ffffff';
      ctx!.fillText(String(p.number), 0, 0.5);

      // Micro discipline / injury badges on rim (yellow card or knock/injury)
      if (p.yellowCards > 0) {
        ctx!.fillStyle = '#facc15';
        ctx!.strokeStyle = '#090d12';
        ctx!.lineWidth = 0.8;
        ctx!.fillRect(r * 0.55, -r * 0.95, 3.8, 5.2);
        ctx!.strokeRect(r * 0.55, -r * 0.95, 3.8, 5.2);
      }
      if (p.knockSeverity > 0) {
        ctx!.fillStyle = p.knockSeverity === 2 ? '#ef4444' : '#f59e0b';
        ctx!.strokeStyle = '#090d12';
        ctx!.lineWidth = 0.9;
        ctx!.beginPath();
        ctx!.arc(-r * 0.72, -r * 0.72, 3.0, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.stroke();
      }

      // FM08 Name Tag below token
      if (showLabel) {
        const label = p.shortName;
        const tagFontSize = Math.max(8.5, Math.min(11, Math.round(scale * 0.92)));
        ctx!.font = `600 ${tagFontSize}px system-ui, -apple-system, sans-serif`;
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'top';
        const ty = r + 2.5;
        ctx!.lineWidth = 2.4;
        ctx!.strokeStyle = 'rgba(6, 10, 14, 0.9)';
        ctx!.strokeText(label, 0, ty);
        ctx!.fillStyle = isSelected ? '#fde047' : isCarrier ? '#ffffff' : '#f1f5f9';
        ctx!.fillText(label, 0, ty);
      }
      ctx!.restore();
    }

    function drawBallAndEffects(dt: number) {
      const eng = engineRef.current;
      const b = eng.ball;

      // Trigger subtle turf burst on shot or firm ground bounce
      if (b.isShotInFlight && !prevShotState) {
        emitBurst(b.x, b.z, 7, 1.15);
      }
      prevShotState = b.isShotInFlight;

      if (prevBallVy < -3.0 && b.vy > 0.9 && b.y < 0.35) {
        emitBurst(b.x, b.z, 5, 0.75);
      }
      prevBallVy = b.vy;

      // Draw & step turf particles
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (pLife[i] <= 0) continue;
        pLife[i] -= dt;
        if (pLife[i] <= 0) continue;
        pX[i] += pVx[i] * dt;
        pZ[i] += pVz[i] * dt;
        ctx!.fillStyle = `rgba(163, 230, 53, ${Math.min(0.75, pLife[i] * 2)})`;
        ctx!.beginPath();
        ctx!.arc(toPxX(pX[i]), toPxY(pZ[i]), 1.6, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Update aerodynamic ball trail
      const bSpeed = Math.hypot(b.vx, b.vz, b.vy);
      if (b.ownerId || b.setPiece !== 'open_play' || (bSpeed < 7.2 && b.y < 0.25)) {
        trailLen = 0;
      } else {
        trailAccum += dt;
        if (trailAccum >= 0.018 || trailLen === 0) {
          trailAccum = 0;
          for (let i = Math.min(trailLen, TRAIL_COUNT - 1); i > 0; i--) {
            trailX[i] = trailX[i - 1];
            trailZ[i] = trailZ[i - 1];
            trailY[i] = trailY[i - 1];
          }
          trailX[0] = b.x;
          trailZ[0] = b.z;
          trailY[0] = b.y;
          if (trailLen < TRAIL_COUNT) trailLen++;
        }
      }

      if (trailLen > 1) {
        for (let i = 0; i < trailLen - 1; i++) {
          const t = 1 - i / trailLen;
          ctx!.strokeStyle = b.isShotInFlight
            ? `rgba(250, 204, 21, ${t * 0.55})`
            : `rgba(224, 242, 254, ${t * 0.42})`;
          ctx!.lineWidth = Math.max(1, (2.8 + Math.min(2, trailY[i] * 0.25)) * t);
          ctx!.beginPath();
          ctx!.moveTo(toPxX(trailX[i]), toPxY(trailZ[i]));
          ctx!.lineTo(toPxX(trailX[i + 1]), toPxY(trailZ[i + 1]));
          ctx!.stroke();
        }
      }

      // Ball Ground Shadow (separates with ball.y height so 3D loft/headers are crystal clear!)
      const bx = toPxX(b.x);
      const bz = toPxY(b.z);
      const baseBallR = Math.max(3.6, 0.44 * scale);
      const heightRatio = Math.min(1.8, Math.max(0, b.y) * 0.16);
      const shadowShift = Math.max(0.8, b.y * 0.55 * scale);
      const shadowR = baseBallR * Math.max(0.58, 1 - b.y * 0.07);

      ctx!.fillStyle = `rgba(2, 6, 12, ${Math.max(0.22, 0.55 - b.y * 0.07)})`;
      ctx!.beginPath();
      ctx!.ellipse(
        bx + shadowShift * 0.65,
        bz + shadowShift * 0.85,
        shadowR * 1.1,
        shadowR * 0.9,
        0,
        0,
        Math.PI * 2
      );
      ctx!.fill();

      // Ball 2D Circle (grows subtly with altitude, subtle visual lift toward screen top)
      const liftPx = Math.min(16, b.y * scale * 0.28);
      const visualX = isPortrait ? bx + liftPx : bx;
      const visualY = isPortrait ? bz : bz - liftPx;
      const ballR = baseBallR * (1 + heightRatio * 0.58);
      ballSpinAngle += (bSpeed * 0.28 + Math.abs(b.spinZ) * 0.08) * dt;

      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(visualX, visualY, ballR, 0, Math.PI * 2);
      ctx!.fillStyle = '#ffffff';
      ctx!.fill();

      // Classic black panel markings rotating smoothly
      ctx!.clip();
      ctx!.fillStyle = '#111827';
      for (let k = 0; k < 3; k++) {
        const ang = ballSpinAngle + (k * Math.PI * 2) / 3;
        ctx!.beginPath();
        ctx!.arc(
          visualX + Math.cos(ang) * ballR * 0.62,
          visualY + Math.sin(ang) * ballR * 0.62,
          ballR * 0.28,
          0,
          Math.PI * 2
        );
        ctx!.fill();
      }
      ctx!.restore();

      ctx!.strokeStyle = '#090d12';
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.arc(visualX, visualY, ballR, 0, Math.PI * 2);
      ctx!.stroke();
    }

    function renderFrame(dt: number) {
      const eng = engineRef.current;

      ctx!.save();
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawPitch(elapsed);

      // Render player tokens sorted slightly by y (airborne players render on top)
      const allActive: { p: PlayerMatchState; colors: typeof eng.homeClub.colors }[] = [];
      for (let i = 0; i < eng.homePlayers.length; i++) {
        const p = eng.homePlayers[i];
        if (p.onPitch && !p.redCard) allActive.push({ p, colors: eng.homeClub.colors });
      }
      for (let i = 0; i < eng.awayPlayers.length; i++) {
        const p = eng.awayPlayers[i];
        if (p.onPitch && !p.redCard) allActive.push({ p, colors: eng.awayClub.colors });
      }
      allActive.sort((a, b) => a.p.y - b.p.y);

      const selId = selectedIdRef.current;
      const carrierId = eng.ball.ownerId;
      const showAllNames = layersRef.current.playerNames;

      for (let i = 0; i < allActive.length; i++) {
        const { p, colors } = allActive[i];
        const isSel = selId === p.id;
        const isCar = carrierId === p.id;
        const isHov = hoveredPlayerId === p.id;
        drawPlayerToken(p, colors, isCar, isSel, isHov, showAllNames || isSel || isCar);
      }

      drawBallAndEffects(dt);

      if (isPortrait) {
        ctx!.restore(); // restore portrait world rotation before upright HUD clock
      }

      // Upright FM08 live match clock overlay in screen coordinates
      const totalMin = Math.floor(eng.clockSeconds / 60);
      const sec = Math.floor(eng.clockSeconds % 60);
      const clockText = `${String(totalMin).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      const clockLeft = isPortrait
        ? Math.max(8, originX - (WORLD_TOTAL_H * scale) * 0.5 + 8)
        : Math.max(10, toPxX(-HALF_W - RUNOFF_X) + 10);
      const clockTop = isPortrait
        ? Math.max(6, originY - (WORLD_TOTAL_W * scale) * 0.5 + 6)
        : Math.max(8, toPxY(-HALF_H - RUNOFF_Z) + 8);

      ctx!.save();
      ctx!.font = `600 ${viewW < 520 ? 11 : 13}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx!.textAlign = 'left';
      ctx!.textBaseline = 'top';
      ctx!.fillStyle = 'rgba(0,0,0,0.45)';
      ctx!.fillText(clockText, clockLeft + 1, clockTop + 1);
      ctx!.fillStyle = '#f8fafc';
      ctx!.fillText(clockText, clockLeft, clockTop);
      ctx!.restore();

      ctx!.restore();
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += rawDt;

      renderFrame(rawDt);
      frameId = requestAnimationFrame(tick);
    }

    renderFrame(0.016);
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateLayout);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }, [matchRevision]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#4a762a]"
      aria-label="Campo táctico 2D cenital estilo FM08"
    >
      <canvas ref={canvasRef} className="block w-full h-full select-none" />
    </div>
  );
};
