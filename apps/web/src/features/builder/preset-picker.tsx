import { presetsForWeapon } from "@tarkov/data";
import type { WeaponPreset } from "@tarkov/data";
import { Button, Card, CardContent } from "@tarkov/ui";

export interface PresetPickerProps {
  weaponId: string;
  onApply: (attachments: Readonly<Record<string, string>>) => void;
}

export function PresetPicker({ weaponId, onApply }: PresetPickerProps) {
  const presets = presetsForWeapon(weaponId);
  if (presets.length === 0) return null;
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-2 pt-6">
        <span className="mr-2 self-center text-sm text-[var(--color-muted-foreground)]">
          Presets:
        </span>
        {presets.map((p: WeaponPreset) => (
          <Button key={p.name} size="sm" variant="outline" onClick={() => onApply(p.attachments)}>
            {p.name}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
