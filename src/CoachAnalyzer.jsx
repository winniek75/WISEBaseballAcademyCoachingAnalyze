import { useState, useRef, useEffect, useCallback } from "react";

const TOOLS = { POINTER: "pointer", ARROW: "arrow", LINE: "line", CIRCLE: "circle", RECT: "rect", ANGLE: "angle", FREEHAND: "freehand" };
const SPEEDS = [{ label: "1/10", value: 0.1 }, { label: "1/4", value: 0.25 }, { label: "1/2", value: 0.5 }, { label: "3/4", value: 0.75 }, { label: "等速", value: 1 }];
const PRESET_COLORS = ["#00e676", "#ff1744", "#ffea00", "#40c4ff", "#ff6d00", "#e040fb", "#ffffff"];

function drawArrow(ctx, x1, y1, x2, y2, color, width) {
  const headLen = Math.max(18, width * 5);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}

function calcAngle(p1, vertex, p2) {
  const a = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
  const b = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);
  let deg = Math.abs((b - a) * 180 / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return Math.round(deg);
}

function renderShape(ctx, shape) {
  ctx.save();
  ctx.strokeStyle = shape.color; ctx.lineWidth = shape.strokeWidth;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  switch (shape.type) {
    case TOOLS.LINE:
      ctx.beginPath(); ctx.moveTo(shape.x1, shape.y1); ctx.lineTo(shape.x2, shape.y2); ctx.stroke(); break;
    case TOOLS.ARROW:
      drawArrow(ctx, shape.x1, shape.y1, shape.x2, shape.y2, shape.color, shape.strokeWidth); break;
    case TOOLS.CIRCLE: {
      const cx = (shape.x1 + shape.x2) / 2, cy = (shape.y1 + shape.y2) / 2;
      const rx = Math.abs(shape.x2 - shape.x1) / 2, ry = Math.abs(shape.y2 - shape.y1) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, Math.PI * 2); ctx.stroke(); break;
    }
    case TOOLS.RECT:
      ctx.strokeRect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1); break;
    case TOOLS.FREEHAND:
      if (shape.points?.length > 1) {
        ctx.beginPath(); ctx.moveTo(shape.points[0].x, shape.points[0].y);
        shape.points.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
      } break;
    case TOOLS.ANGLE:
      if (shape.points?.length >= 2) {
        ctx.beginPath(); ctx.moveTo(shape.points[0].x, shape.points[0].y);
        shape.points.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
        if (shape.points.length === 3) {
          const deg = calcAngle(shape.points[0], shape.points[1], shape.points[2]);
          ctx.font = `bold ${Math.max(16, shape.strokeWidth * 5)}px 'Courier New', monospace`;
          ctx.fillStyle = shape.color;
          ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4;
          ctx.fillText(`${deg}°`, shape.points[1].x + 8, shape.points[1].y - 8);
        }
      } break;
    default: break;
  }
  ctx.restore();
}

export default function CoachAnalyzer() {
  const [videoSrc, setVideoSrc] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tool, setTool] = useState(TOOLS.ARROW);
  const [color, setColor] = useState("#00e676");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [annotations, setAnnotations] = useState([]);
  const [undoStack, setUndoStack] = useState([[]]);
  const [undoIndex, setUndoIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState(null);
  const [anglePoints, setAnglePoints] = useState([]);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [videoSize, setVideoSize] = useState({ w: 1280, h: 720 });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed]);

  const redraw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    annotations.forEach(s => renderShape(ctx, s));
    if (currentShape) renderShape(ctx, currentShape);
  }, [annotations, currentShape]);

  useEffect(() => { redraw(); }, [redraw]);

  const getPos = (e) => {
    const c = canvasRef.current; if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const pushUndo = (ann) => {
    const s = undoStack.slice(0, undoIndex + 1);
    s.push([...ann]);
    setUndoStack(s); setUndoIndex(s.length - 1);
  };

  const handleDown = (e) => {
    if (tool === TOOLS.POINTER) return;
    const pos = getPos(e);
    if (tool === TOOLS.ANGLE) {
      const pts = [...anglePoints, pos];
      if (pts.length === 3) {
        const shape = { type: TOOLS.ANGLE, points: pts, color, strokeWidth };
        const next = [...annotations, shape];
        setAnnotations(next); pushUndo(next);
        setAnglePoints([]); setCurrentShape(null);
      } else { setAnglePoints(pts); setCurrentShape({ type: TOOLS.ANGLE, points: pts, color, strokeWidth }); }
      return;
    }
    setIsDrawing(true);
    if (tool === TOOLS.FREEHAND) setCurrentShape({ type: TOOLS.FREEHAND, points: [pos], color, strokeWidth });
    else setCurrentShape({ type: tool, x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, color, strokeWidth });
  };

  const handleMove = (e) => {
    const pos = getPos(e);
    if (tool === TOOLS.ANGLE && anglePoints.length > 0) {
      setCurrentShape({ type: TOOLS.ANGLE, points: [...anglePoints, pos], color, strokeWidth }); return;
    }
    if (!isDrawing) return;
    if (tool === TOOLS.FREEHAND) setCurrentShape(p => ({ ...p, points: [...p.points, pos] }));
    else setCurrentShape(p => ({ ...p, x2: pos.x, y2: pos.y }));
  };

  const handleUp = () => {
    if (!isDrawing || tool === TOOLS.POINTER || tool === TOOLS.ANGLE) return;
    if (currentShape) { const next = [...annotations, currentShape]; setAnnotations(next); pushUndo(next); }
    setIsDrawing(false); setCurrentShape(null);
  };

  const undo = () => {
    if (undoIndex > 0) { const i = undoIndex - 1; setUndoIndex(i); setAnnotations([...undoStack[i]]); }
  };
  const redo = () => {
    if (undoIndex < undoStack.length - 1) { const i = undoIndex + 1; setUndoIndex(i); setAnnotations([...undoStack[i]]); }
  };
  const clearAll = () => { setAnnotations([]); setAnglePoints([]); setCurrentShape(null); pushUndo([]); };

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); } else { v.pause(); setIsPlaying(false); }
  };

  const stepFrame = (fwd) => {
    const v = videoRef.current; if (!v) return;
    v.pause(); setIsPlaying(false); v.currentTime += fwd ? 1 / 30 : -1 / 30;
  };

  const handleVideoLoad = () => {
    const v = videoRef.current, c = canvasRef.current; if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    setVideoSize({ w: v.videoWidth, h: v.videoHeight });
    setDuration(v.duration);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current; if (!v) return;
    setCurrentTime(v.currentTime); setProgress(v.currentTime / v.duration * 100);
  };

  const seek = (e) => {
    const v = videoRef.current; if (!v) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - r.left) / r.width;
    v.currentTime = pct * v.duration; setProgress(pct * 100);
  };

  const exportFrame = () => {
    const v = videoRef.current, c = canvasRef.current; if (!v || !c) return;
    const ec = document.createElement("canvas");
    ec.width = c.width; ec.height = c.height;
    const ctx = ec.getContext("2d");
    ctx.drawImage(v, 0, 0, c.width, c.height);
    annotations.forEach(s => renderShape(ctx, s));
    const a = document.createElement("a");
    a.download = `wise-coaching-${Date.now()}.png`;
    a.href = ec.toDataURL("image/png"); a.click();
  };

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setVideoSrc(URL.createObjectURL(file));
    setAnnotations([]); setUndoStack([[]]); setUndoIndex(0);
    setAnglePoints([]); setCurrentShape(null); setIsPlaying(false);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      setVideoSrc(URL.createObjectURL(file));
      setAnnotations([]); setUndoStack([[]]); setUndoIndex(0);
    }
  };

  const fmtTime = (s) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const toolDefs = [
    { id: TOOLS.POINTER, svg: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 0l16 12-7 2-4 8-5-22z"/></svg>, label: "選択" },
    { id: TOOLS.ARROW, svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="4" y1="20" x2="20" y2="4"/><polyline points="9,4 20,4 20,15"/></svg>, label: "矢印" },
    { id: TOOLS.LINE, svg: <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><line x1="4" y1="20" x2="20" y2="4"/></svg>, label: "直線" },
    { id: TOOLS.CIRCLE, svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/></svg>, label: "楕円" },
    { id: TOOLS.RECT, svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="5" width="18" height="14" rx="1"/></svg>, label: "四角" },
    { id: TOOLS.ANGLE, svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 20 L4 4 L20 20"/></svg>, label: "角度" },
    { id: TOOLS.FREEHAND, svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 17 Q6 10 10 14 Q14 18 18 8 Q20 4 21 7"/></svg>, label: "フリー" },
  ];

  const cursor = tool === TOOLS.POINTER ? "default" : tool === TOOLS.ANGLE ? "crosshair" : "crosshair";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8eaf0", fontFamily: "'Courier New', 'Consolas', monospace", display: "flex", flexDirection: "column", userSelect: "none" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)", borderBottom: "1px solid #21262d", padding: "10px 20px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #00e676, #00b248)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚾</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: "#00e676" }}>WISE BASEBALL ACADEMY</div>
            <div style={{ fontSize: 10, color: "#6e7681", letterSpacing: 1 }}>COACHING ANALYZER</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {videoSrc && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportFrame} style={{ background: "linear-gradient(135deg, #00e676, #00b248)", border: "none", borderRadius: 6, padding: "7px 14px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 12, letterSpacing: 1 }}>📸 フレーム保存</button>
            <button onClick={() => fileInputRef.current?.click()} style={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 6, padding: "7px 14px", color: "#c9d1d9", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>📂 別動画</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Tools Panel */}
        {videoSrc && (
          <div style={{ width: 60, background: "#0d1117", borderRight: "1px solid #21262d", display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0", gap: 4 }}>
            {toolDefs.map(t => (
              <button key={t.id} title={t.label} onClick={() => { setTool(t.id); setAnglePoints([]); setCurrentShape(null); }}
                style={{ width: 42, height: 42, borderRadius: 8, border: tool === t.id ? "2px solid #00e676" : "1px solid #21262d", background: tool === t.id ? "rgba(0,230,118,0.12)" : "transparent", color: tool === t.id ? "#00e676" : "#8b949e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 8, transition: "all 0.15s" }}>
                {t.svg}
              </button>
            ))}
            <div style={{ width: 32, height: 1, background: "#21262d", margin: "6px 0" }} />
            {/* Colors */}
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                style={{ width: 26, height: 26, borderRadius: "50%", border: color === c ? "2px solid #fff" : "2px solid transparent", background: c, cursor: "pointer", boxSizing: "border-box", transition: "transform 0.1s", transform: color === c ? "scale(1.15)" : "scale(1)" }} />
            ))}
            <div style={{ width: 32, height: 1, background: "#21262d", margin: "6px 0" }} />
            {/* Stroke width */}
            {[2, 4, 7].map(w => (
              <button key={w} onClick={() => setStrokeWidth(w)}
                style={{ width: 36, height: 28, borderRadius: 5, border: strokeWidth === w ? "1px solid #00e676" : "1px solid #21262d", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 20, height: w, borderRadius: w, background: strokeWidth === w ? "#00e676" : "#6e7681" }} />
              </button>
            ))}
            <div style={{ width: 32, height: 1, background: "#21262d", margin: "6px 0" }} />
            {/* Undo/Redo/Clear */}
            <button title="元に戻す" onClick={undo} disabled={undoIndex === 0}
              style={{ width: 42, height: 36, borderRadius: 7, border: "1px solid #21262d", background: "transparent", color: undoIndex === 0 ? "#3d444d" : "#8b949e", cursor: undoIndex === 0 ? "not-allowed" : "pointer", fontSize: 16 }}>↩</button>
            <button title="やり直す" onClick={redo} disabled={undoIndex === undoStack.length - 1}
              style={{ width: 42, height: 36, borderRadius: 7, border: "1px solid #21262d", background: "transparent", color: undoIndex === undoStack.length - 1 ? "#3d444d" : "#8b949e", cursor: undoIndex === undoStack.length - 1 ? "not-allowed" : "pointer", fontSize: 16 }}>↪</button>
            <button title="全削除" onClick={clearAll}
              style={{ width: 42, height: 36, borderRadius: 7, border: "1px solid #21262d", background: "transparent", color: "#ff4444", cursor: "pointer", fontSize: 14 }}>🗑</button>
          </div>
        )}

        {/* Main Video Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!videoSrc ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
              onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)}>
              <div onClick={() => fileInputRef.current?.click()}
                style={{ border: `2px dashed ${isDragging ? "#00e676" : "#30363d"}`, borderRadius: 16, padding: "60px 80px", textAlign: "center", cursor: "pointer", transition: "all 0.2s", background: isDragging ? "rgba(0,230,118,0.05)" : "transparent" }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🎬</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: isDragging ? "#00e676" : "#c9d1d9", marginBottom: 8 }}>動画をここにドロップ</div>
                <div style={{ fontSize: 13, color: "#6e7681" }}>またはクリックしてファイルを選択</div>
                <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  {["MP4", "MOV", "AVI", "M4V"].map(f => (
                    <span key={f} style={{ background: "#21262d", borderRadius: 4, padding: "3px 10px", fontSize: 11, color: "#8b949e", fontWeight: 600, letterSpacing: 1 }}>{f}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Video + Canvas */}
              <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", overflow: "hidden" }}>
                <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%" }}>
                  <video ref={videoRef} src={videoSrc} style={{ display: "block", maxWidth: "100%", maxHeight: "calc(100vh - 180px)", objectFit: "contain" }}
                    onLoadedMetadata={handleVideoLoad} onTimeUpdate={handleTimeUpdate} onEnded={() => setIsPlaying(false)} playsInline />
                  <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", cursor }} onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp} />
                  {/* Angle hint */}
                  {tool === TOOLS.ANGLE && anglePoints.length > 0 && (
                    <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.7)", borderRadius: 6, padding: "5px 12px", fontSize: 12, color: "#00e676", border: "1px solid rgba(0,230,118,0.3)" }}>
                      {anglePoints.length === 1 ? "▶ 頂点をクリック" : "▶ 2本目の辺をクリック"}
                    </div>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div style={{ background: "#0d1117", borderTop: "1px solid #21262d", padding: "10px 16px" }}>
                {/* Seekbar */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: "#8b949e", minWidth: 38, textAlign: "right" }}>{fmtTime(currentTime)}</span>
                  <div onClick={seek} style={{ flex: 1, height: 6, background: "#21262d", borderRadius: 3, cursor: "pointer", position: "relative", overflow: "hidden" }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg, #00e676, #00b248)", borderRadius: 3, transition: "width 0.1s" }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#8b949e", minWidth: 38 }}>{fmtTime(duration)}</span>
                </div>
                {/* Buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => stepFrame(false)} style={ctrlBtn}>⏮ -1f</button>
                  <button onClick={togglePlay} style={{ ...ctrlBtn, background: isPlaying ? "rgba(255,68,68,0.15)" : "rgba(0,230,118,0.15)", borderColor: isPlaying ? "#ff4444" : "#00e676", color: isPlaying ? "#ff4444" : "#00e676", minWidth: 70, fontWeight: 700 }}>
                    {isPlaying ? "⏸ 停止" : "▶ 再生"}
                  </button>
                  <button onClick={() => stepFrame(true)} style={ctrlBtn}>+1f ⏭</button>
                  <div style={{ width: 1, height: 28, background: "#21262d", margin: "0 4px" }} />
                  <span style={{ fontSize: 11, color: "#6e7681", marginRight: 2 }}>速度</span>
                  {SPEEDS.map(s => (
                    <button key={s.value} onClick={() => setSpeed(s.value)}
                      style={{ ...ctrlBtn, background: speed === s.value ? "rgba(0,230,118,0.15)" : "transparent", borderColor: speed === s.value ? "#00e676" : "#30363d", color: speed === s.value ? "#00e676" : "#8b949e", minWidth: 44 }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={handleFile} />

      {/* Status bar */}
      {videoSrc && (
        <div style={{ background: "#0d1117", borderTop: "1px solid #21262d", padding: "4px 16px", display: "flex", gap: 20, fontSize: 11, color: "#6e7681" }}>
          <span>解像度: {videoSize.w}×{videoSize.h}</span>
          <span>速度: {speed}x</span>
          <span>ツール: {toolDefs.find(t => t.id === tool)?.label}</span>
          <span>描画数: {annotations.length}</span>
          {tool === TOOLS.ANGLE && anglePoints.length > 0 && <span style={{ color: "#00e676" }}>角度計測: {anglePoints.length}/3点</span>}
        </div>
      )}
    </div>
  );
}

const ctrlBtn = {
  background: "transparent", border: "1px solid #30363d", borderRadius: 6, padding: "5px 12px",
  color: "#8b949e", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap"
};
