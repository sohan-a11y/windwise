import { useEffect, useRef, useState } from "react";
import { formatNumber } from "../../lib/format";

interface Node {
  id: string;
  label: string;
  type: "wind" | "substation" | "market" | "peaker" | "demand";
  x: number;
  y: number;
  radius: number;
  color: string;
  mw: number;
  subtitle: string;
}

interface Edge {
  from: string;
  to: string;
  mw: number;
  capacityMw: number;
  color: string;
}

interface Particle {
  edgeIdx: number;
  progress: number;
  speed: number;
}

export function DispatchFlowCanvas({
  windMw = 12313,
  peakerMw = 451,
  demandMw = 12000,
}: {
  windMw?: number;
  peakerMw?: number;
  demandMw?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [simulatedShortfall, setSimulatedShortfall] = useState(false);
  const [activeNode, setActiveNode] = useState<Node | null>(null);

  // Active power levels
  const currentWind = simulatedShortfall ? Math.round(windMw * 0.6) : windMw;
  const currentPeaker = simulatedShortfall ? Math.round(peakerMw + windMw * 0.4) : peakerMw;
  const currentDelivered = currentWind + currentPeaker;

  // Nodes definition
  const nodesRef = useRef<Node[]>([
    {
      id: "wind",
      label: "National Wind Fleet",
      type: "wind",
      x: 120,
      y: 90,
      radius: 28,
      color: "#059669",
      mw: currentWind,
      subtitle: "Offshore/Onshore (Elexon)",
    },
    {
      id: "peaker",
      label: "Thermal Peakers",
      type: "peaker",
      x: 120,
      y: 270,
      radius: 24,
      color: "#d97706",
      mw: currentPeaker,
      subtitle: "CCGT/OCGT Fast Reserve",
    },
    {
      id: "substation",
      label: "Grid Substation",
      type: "substation",
      x: 350,
      y: 180,
      radius: 30,
      color: "#2563eb",
      mw: currentDelivered,
      subtitle: "400kV Supergrid Hub",
    },
    {
      id: "market",
      label: "Day-Ahead Clearing",
      type: "market",
      x: 570,
      y: 110,
      radius: 26,
      color: "#7c3aed",
      mw: currentWind,
      subtitle: "N2EX 09:50 Auction",
    },
    {
      id: "demand",
      label: "Consumer Demand",
      type: "demand",
      x: 580,
      y: 260,
      radius: 28,
      color: "#dc2626",
      mw: demandMw,
      subtitle: "Utility Consumers Sink",
    },
  ]);

  // Edges definition
  const edges: Edge[] = [
    { from: "wind", to: "substation", mw: currentWind, capacityMw: 20000, color: "#10b981" },
    { from: "peaker", to: "substation", mw: currentPeaker, capacityMw: 8000, color: "#f59e0b" },
    { from: "substation", to: "market", mw: currentWind, capacityMw: 18000, color: "#8b5cf6" },
    { from: "substation", to: "demand", mw: currentDelivered, capacityMw: 25000, color: "#ef4444" },
  ];

  // Particles animation state
  const particlesRef = useRef<Particle[]>(
    Array.from({ length: 32 }, (_, i) => ({
      edgeIdx: i % edges.length,
      progress: (i / 32) * 1.0,
      speed: 0.004 + (i % 3) * 0.002,
    }))
  );

  // Dragging state
  const dragNodeRef = useRef<Node | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    // Update node dynamic MW
    nodesRef.current.forEach((n) => {
      if (n.id === "wind") n.mw = currentWind;
      if (n.id === "peaker") n.mw = currentPeaker;
      if (n.id === "substation") n.mw = currentDelivered;
      if (n.id === "market") n.mw = currentWind;
      if (n.id === "demand") n.mw = demandMw;
    });
  }, [currentWind, currentPeaker, currentDelivered, demandMw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Subtle background grid
      ctx.strokeStyle = "rgba(0, 0, 0, 0.04)";
      ctx.lineWidth = 1;
      const gridSize = 25;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw Edges
      edges.forEach((edge) => {
        const fromNode = nodesRef.current.find((n) => n.id === edge.from);
        const toNode = nodesRef.current.find((n) => n.id === edge.to);
        if (!fromNode || !toNode) return;

        // Line
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.strokeStyle = "rgba(203, 213, 225, 0.7)";
        ctx.lineWidth = 3;
        ctx.stroke();

        // Active power flow glow line
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.strokeStyle = edge.color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = Math.min(8, Math.max(2, (edge.mw / edge.capacityMw) * 8));
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Midpoint power label
        const midX = (fromNode.x + toNode.x) / 2;
        const midY = (fromNode.y + toNode.y) / 2;
        ctx.fillStyle = "#475569";
        ctx.font = "10px IBM Plex Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${formatNumber(edge.mw)} MW`, midX, midY - 6);
      });

      // Update & Draw Flow Particles
      particlesRef.current.forEach((p) => {
        const edge = edges[p.edgeIdx];
        const fromNode = nodesRef.current.find((n) => n.id === edge.from);
        const toNode = nodesRef.current.find((n) => n.id === edge.to);
        if (!fromNode || !toNode) return;

        p.progress += p.speed;
        if (p.progress >= 1.0) p.progress = 0;

        const px = fromNode.x + (toNode.x - fromNode.x) * p.progress;
        const py = fromNode.y + (toNode.y - fromNode.y) * p.progress;

        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = edge.color;
        ctx.shadowColor = edge.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Draw Nodes
      nodesRef.current.forEach((node) => {
        // Outer halo
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = `${node.color}18`;
        ctx.fill();

        // Main Node Body
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Inner core
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();

        // Node Labels
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 11px Instrument Sans, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(node.label, node.x, node.y + node.radius + 14);

        ctx.fillStyle = "#64748b";
        ctx.font = "10px IBM Plex Mono, monospace";
        ctx.fillText(`${formatNumber(node.mw)} MW`, node.x, node.y + node.radius + 26);
      });

      animId = requestAnimationFrame(render);
    };

    render();

    // Mouse handlers for dragging & hover
    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      for (const node of nodesRef.current) {
        const dist = Math.hypot(mouseX - node.x, mouseY - node.y);
        if (dist <= node.radius + 6) {
          dragNodeRef.current = node;
          dragOffsetRef.current = { x: mouseX - node.x, y: mouseY - node.y };
          setActiveNode(node);
          break;
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (dragNodeRef.current) {
        dragNodeRef.current.x = Math.max(30, Math.min(canvas.width - 30, mouseX - dragOffsetRef.current.x));
        dragNodeRef.current.y = Math.max(30, Math.min(canvas.height - 30, mouseY - dragOffsetRef.current.y));
      } else {
        const hovered = nodesRef.current.find(
          (n) => Math.hypot(mouseX - n.x, mouseY - n.y) <= n.radius + 6
        );
        canvas.style.cursor = hovered ? "grab" : "default";
        if (hovered) setActiveNode(hovered);
      }
    };

    const handleMouseUp = () => {
      dragNodeRef.current = null;
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [edges]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
            <h3 className="font-serif text-lg font-semibold text-slate-900">
              Interactive Grid Topology & Power Dispatch Flow
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            60 FPS HTML5 Canvas power flow simulation. Click and drag nodes to test transmission topology.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSimulatedShortfall(!simulatedShortfall)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              simulatedShortfall
                ? "bg-amber-600 text-white shadow-sm hover:bg-amber-700"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {simulatedShortfall ? "Reset Grid Nominal" : "Simulate 40% Wind Lull"}
          </button>
        </div>
      </div>

      {/* Real-time KPI Ribbon */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <div className="rounded-lg bg-emerald-50/60 p-2 border border-emerald-100">
          <span className="text-emerald-700 font-medium">Renewable Generation</span>
          <div className="font-mono text-sm font-semibold text-emerald-950">
            {formatNumber(currentWind)} MW
          </div>
        </div>
        <div className="rounded-lg bg-amber-50/60 p-2 border border-amber-100">
          <span className="text-amber-700 font-medium">Thermal Peaker Call</span>
          <div className="font-mono text-sm font-semibold text-amber-950">
            {formatNumber(currentPeaker)} MW
          </div>
        </div>
        <div className="rounded-lg bg-blue-50/60 p-2 border border-blue-100">
          <span className="text-blue-700 font-medium">Delivered to Grid</span>
          <div className="font-mono text-sm font-semibold text-blue-950">
            {formatNumber(currentDelivered)} MW
          </div>
        </div>
        <div className="rounded-lg bg-purple-50/60 p-2 border border-purple-100">
          <span className="text-purple-700 font-medium">Grid Frequency</span>
          <div className="font-mono text-sm font-semibold text-purple-950">50.02 Hz</div>
        </div>
      </div>

      {/* Canvas rendering area */}
      <div className="relative mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
        <canvas
          ref={canvasRef}
          width={720}
          height={340}
          className="w-full max-w-full block"
        />

        {activeNode && (
          <div className="absolute bottom-2 left-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 shadow-sm text-xs backdrop-blur-sm">
            <span className="font-semibold text-slate-900">{activeNode.label}</span>
            <span className="text-slate-400 mx-1.5">•</span>
            <span className="font-mono font-medium text-slate-700">{formatNumber(activeNode.mw)} MW</span>
            <span className="text-slate-400 mx-1.5">•</span>
            <span className="text-slate-500 italic">{activeNode.subtitle}</span>
          </div>
        )}
      </div>
    </div>
  );
}
