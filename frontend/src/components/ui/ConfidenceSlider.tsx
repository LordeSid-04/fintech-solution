import { useState } from "react";
import { clampPercent } from "@/lib/governance";

type ConfidenceSliderProps = {
  value: number;
  onChange: (nextValue: number) => void;
};

const snapPoints = [0, 50, 100] as const;

function snapToDirection(
  value: number,
  direction: -1 | 0 | 1
): (typeof snapPoints)[number] {
  if (direction > 0) {
    for (const point of snapPoints) {
      if (point >= value) {
        return point;
      }
    }
    return 100;
  }

  if (direction < 0) {
    for (let index = snapPoints.length - 1; index >= 0; index -= 1) {
      const point = snapPoints[index];
      if (point <= value) {
        return point;
      }
    }
    return 0;
  }

  return snapPoints.reduce<(typeof snapPoints)[number]>((closest, point) => {
    const currentDistance = Math.abs(point - value);
    const closestDistance = Math.abs(closest - value);
    return currentDistance < closestDistance ? point : closest;
  }, snapPoints[0]);
}

export function ConfidenceSlider({ value, onChange }: ConfidenceSliderProps) {
  const [draftValue, setDraftValue] = useState<number | null>(null);
  const [lastDirection, setLastDirection] = useState<-1 | 0 | 1>(0);
  const currentValue = draftValue ?? value;
  const activeSnap = snapToDirection(clampPercent(currentValue), 0);

  const handleCommit = () => {
    const next = snapToDirection(clampPercent(currentValue), lastDirection);
    setDraftValue(null);
    setLastDirection(0);
    onChange(next);
  };

  return (
    <div className="rounded-2xl border border-white/12 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-4 shadow-[0_0_22px_rgba(139,92,246,0.1)]">
      <div className="mb-3 flex items-center justify-between">
        <label
          className="text-sm font-semibold tracking-[0.08em] text-white/90"
          htmlFor="confidence-slider"
        >
          CONFIDENCE SCALE
        </label>
        <span className="rounded-full border border-violet-300/35 bg-violet-300/15 px-3 py-1 text-xs font-semibold text-violet-100">
          {currentValue}%
        </span>
      </div>

      <div className="relative px-1 py-2">
        <div className="h-3 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-300 transition-all duration-150"
            style={{ width: `${currentValue}%` }}
          />
        </div>
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border border-white/65 bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)] transition-all duration-150"
          style={{ left: `${currentValue}%` }}
        />
        <input
          id="confidence-slider"
          type="range"
          min={0}
          max={100}
          value={currentValue}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            const previousValue = draftValue ?? value;
            setLastDirection(nextValue > previousValue ? 1 : nextValue < previousValue ? -1 : 0);
            setDraftValue(nextValue);
          }}
          onMouseUp={handleCommit}
          onTouchEnd={handleCommit}
          onBlur={handleCommit}
          onKeyUp={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              handleCommit();
            }
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <div className="relative mt-3 h-6">
        {snapPoints.map((tick) => (
          <div
            key={tick}
            className={`absolute top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
              currentValue >= tick ? "bg-violet-200" : "bg-white/35"
            }`}
            style={{ left: `${tick}%` }}
          />
        ))}
        {snapPoints.map((tick) => (
          <span
            key={`label-${tick}`}
            className={`absolute top-2 -translate-x-1/2 text-[10px] ${
              activeSnap === tick ? "text-violet-100" : "text-white/65"
            }`}
            style={{ left: `${tick}%` }}
          >
            {tick}
          </span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
        <span
          className={`rounded-md border px-2 py-1 text-center ${
            activeSnap === 0
              ? "border-violet-300/35 bg-violet-300/15 text-violet-100"
              : "border-white/12 bg-black/25 text-white/65"
          }`}
        >
          Assist
        </span>
        <span
          className={`rounded-md border px-2 py-1 text-center ${
            activeSnap === 50
              ? "border-violet-300/35 bg-violet-300/15 text-violet-100"
              : "border-white/12 bg-black/25 text-white/65"
          }`}
        >
          Pair
        </span>
        <span
          className={`rounded-md border px-2 py-1 text-center ${
            activeSnap === 100
              ? "border-violet-300/35 bg-violet-300/15 text-violet-100"
              : "border-white/12 bg-black/25 text-white/65"
          }`}
        >
          Autopilot
        </span>
      </div>
    </div>
  );
}
