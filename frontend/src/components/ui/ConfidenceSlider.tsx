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

  const handleCommit = () => {
    const next = snapToDirection(clampPercent(currentValue), lastDirection);
    setDraftValue(null);
    setLastDirection(0);
    onChange(next);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label
          className="text-sm font-medium text-white/90"
          htmlFor="confidence-slider"
        >
          Confidence
        </label>
        <span className="rounded-full border border-white/20 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-violet-200">
          {currentValue}%
        </span>
      </div>

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
        className="w-full accent-violet-300"
      />

      <div className="relative mt-3 h-6">
        {snapPoints.map((tick) => (
          <div
            key={tick}
            className="absolute top-0 h-1 w-1 -translate-x-1/2 rounded-full bg-white/40"
            style={{ left: `${tick}%` }}
          />
        ))}
        {snapPoints.map((tick) => (
          <span
            key={`label-${tick}`}
            className="absolute top-2 -translate-x-1/2 text-[10px] text-white/65"
            style={{ left: `${tick}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 text-[10px] text-white/60">
        <span>Assist (0)</span>
        <span className="text-center">Pair (50)</span>
        <span className="text-right">Autopilot (100)</span>
      </div>
    </div>
  );
}
