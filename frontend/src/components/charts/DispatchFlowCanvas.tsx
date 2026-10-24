import { useEffect, useRef, useState } from "react";
import { formatNumber, mw } from "../../lib/format";
import { Icon } from "../ui";

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

  // Nodes definition matching Windwise palette
  // Teal: #0e7c6b, Ink: #0e2a2b, Coral: #d96a53, Ocean: #1e4e50, Sand: #8a6d3b
  const nodesRef = useRef<Node[]>([
    {
      id: "wind",
      label: "National Wind Fleet",
      type: "wind",
      x: 125,
      y: 95,
      radius: 28,
      color: "#0e7c6b",
      mw: currentWind,
      subtitle: "Offshore/Onshore (Elexon)",
    },
    {
      id: "peaker",
      label: "Thermal Peakers",
      type: "peaker",
      x: 125,
      y: 275,
      radius: 24,
      color: "#d96a53",
      mw: currentPeaker,
      subtitle: "CCGT/OCGT Fast Reserve",
    },
    {
      id: "substation",
      label: "Supergrid Substation",
      type: "substation",
      x: 360,
      y: 185,
      radius: 30,
      color: "#0e2a2b",
      mw: currentDelivered,
      subtitle: "400kV National Grid Hub",
    },
    {
      id: "market",
      label: "Day-Ahead Clearing",
      type: "market",
      x: 585,
      y: 105,
      radius: 26,
      color: "#1e4e50",
      mw: currentWind,
      subtitle: "N2EX 09:50 Gate Auction",
    },
    {
      id: "demand",
      label: "Consumer Demand",
      type: "demand",
      x: 595,
      y: 265,
      radius: 28,
      color: "#8a6d3b",
      mw: demandMw,
      subtitle: "Supplier Delivery Sink",
    },
  ]);

  // Edges definition
  const edges: Edge[] = [
    { from: "wind", to: "substation", mw: currentWind, capacityMw: 20000, color: "#0e7c6b" },
    { from: "peaker", to: "substation", mw: currentPeaker, capacityMw: 8000, color: "#d96a53" },
    { from: "substation", to: "market", mw: currentWind, capacityMw: 18000, color: "#1e4e50" },
    { from: "substation", to: "demand", mw: currentDelivered, capacityMw: 25000, color: "#8a6d3b" },
  ];

  // Particles animation state
  const particlesRef = useRef<Particle[]>(
    Array.from({ length: 32 }, (_, i) => ({
      edgeIdx: i % edges.length,
      progress: (i / 32) * 1.0,
      speed: 0.0035 + (i % 3) * 0.002,
    }))
  );

  const dragNodeRef = useRef<Node | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
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

      // Subtle editorial grid background
      ctx.strokeStyle = "rgba(14, 42, 43, 0.035)";
      ctx.lineWidth = 1;
      const gridSize = 28;
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

        // Base structural line
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.strokeStyle = "rgba(14, 42, 43, 0.12)";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Active flow line
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.strokeStyle = edge.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = Math.min(7, Math.max(2, (edge.mw / edge.capacityMw) * 7));
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Midpoint power readout
        const midX = (fromNode.x + toNode.x) / 2;
        const midY = (fromNode.y + toNode.y) / 2;
        ctx.fillStyle = "#2b5a5c";
        ctx.font = "10px 'IBM Plex Mono', monospace";
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
        // Outer ambient glow ring
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2);
        ctx.fillStyle = `${node.color}22`;
        ctx.fill();

        // Main node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.shadowColor = "rgba(14, 42, 43, 0.12)";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Inner core
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = "#f3f6f1";
        ctx.fill();

        // Node label
        ctx.fillStyle = "#0e2a2b";
        ctx.font = "600 11px 'Instrument Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(node.label, node.x, node.y + node.radius + 15);

        // Subtitle MW
        ctx.fillStyle = "#527576";
        ctx.font = "10px 'IBM Plex Mono', monospace";
        ctx.fillText(`${formatNumber(node.mw)} MW`, node.x, node.y + node.radius + 28);
      });

      animId = requestAnimationFrame(render);
    };

    render();

    // Mouse handlers
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
    <div className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="chip chip-teal">
              <Icon name="spark" size={12} />
              60 FPS Canvas
            </span>
            <span className="label">Grid Topology Visualizer</span>
          </div>
          <h3 className="display mt-2 text-[clamp(1.5rem,2.2vw,1.9rem)] leading-tight text-ink">
            Power Flow & Thermal Re-Dispatch
          </h3>
          <p className="mt-1 text-xs text-ink-500">
            Interactive system topology. Drag nodes to inspect transmission bottlenecks, line capacity, and real-time shortfall routing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSimulatedShortfall(!simulatedShortfall)}
            className={simulatedShortfall ? "btn-teal text-xs" : "btn-ghost text-xs"}
          >
            {simulatedShortfall ? "Reset Grid Nominal" : "Simulate 40% Wind Lull"}
          </button>
        </div>
      </div>

      {/* Real-time KPI Ribbon */}
      <div className="mt-5 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <div className="card-flat p-3.5">
          <span className="label text-teal-800">Renewable Flow</span>
          <div className="num mt-1 text-base font-semibold text-teal-900">
            {mw(currentWind)}
          </div>
        </div>
        <div className="card-flat p-3.5">
          <span className="label text-coral-600">Thermal Peaker Call</span>
          <div className="num mt-1 text-base font-semibold text-coral-700">
            {mw(currentPeaker)}
          </div>
        </div>
        <div className="card-flat p-3.5">
          <span className="label text-ink-500">Delivered to Grid</span>
          <div className="num mt-1 text-base font-semibold text-ink">
            {mw(currentDelivered)}
          </div>
        </div>
        <div className="card-flat p-3.5">
          <span className="label text-sand-700">Grid Frequency</span>
          <div className="num mt-1 text-base font-semibold text-ink-800">50.02 Hz</div>
        </div>
      </div>

      {/* Canvas rendering area */}
      <div className="relative mt-4 overflow-hidden rounded-[20px] border border-ink-100/80 bg-paper/60 backdrop-blur">
        <canvas
          ref={canvasRef}
          width={740}
          height={360}
          className="w-full max-w-full block"
        />

        {activeNode && (
          <div className="chart-tooltip bottom-3 left-3 w-auto min-w-[200px]">
            <div className="font-sans text-xs font-semibold text-paper">{activeNode.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-sm text-teal-300">{formatNumber(activeNode.mw)} MW</span>
              <span className="font-mono text-[10px] text-paper/60">{activeNode.subtitle}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
