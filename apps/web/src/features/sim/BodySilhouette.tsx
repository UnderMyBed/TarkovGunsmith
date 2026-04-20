import type { Zone } from "@tarkov/ballistics";
import { ZONE_META } from "./zoneMetadata.js";

interface BodySilhouetteProps {
  /** Called when the user clicks a zone button. */
  onZoneClick: (zone: Zone) => void;
}

/**
 * A simplified body silhouette with 7 clickable zone buttons.
 * Clicking a zone appends a shot to the scenario plan.
 *
 * @example
 *   <BodySilhouette onZoneClick={(z) => append({ zone: z, distance })} />
 */
export function BodySilhouette({ onZoneClick }: BodySilhouetteProps) {
  return (
    <div className="flex flex-col items-center gap-1" aria-label="Body zone selector">
      <ZoneButton zone="head" onZoneClick={onZoneClick} className="h-16 w-16 rounded-full" />
      <ZoneButton zone="thorax" onZoneClick={onZoneClick} className="h-16 w-24 rounded" />
      <ZoneButton zone="stomach" onZoneClick={onZoneClick} className="h-10 w-24 rounded" />
      <div className="flex gap-2">
        <ZoneButton zone="leftArm" onZoneClick={onZoneClick} className="h-20 w-10 rounded" />
        <div className="w-24" />
        <ZoneButton zone="rightArm" onZoneClick={onZoneClick} className="h-20 w-10 rounded" />
      </div>
      <div className="flex gap-4">
        <ZoneButton zone="leftLeg" onZoneClick={onZoneClick} className="h-20 w-10 rounded" />
        <ZoneButton zone="rightLeg" onZoneClick={onZoneClick} className="h-20 w-10 rounded" />
      </div>
    </div>
  );
}

interface ZoneButtonProps {
  zone: Zone;
  onZoneClick: (zone: Zone) => void;
  className?: string;
}

function ZoneButton({ zone, onZoneClick, className = "" }: ZoneButtonProps) {
  const meta = ZONE_META[zone];
  return (
    <button
      type="button"
      aria-label={`Add ${meta.label} shot`}
      title={meta.label}
      onClick={() => onZoneClick(zone)}
      className={`${meta.colorClass} flex items-center justify-center text-xs font-medium text-white opacity-80 transition-opacity hover:opacity-100 ${className}`}
    >
      {meta.label}
    </button>
  );
}
