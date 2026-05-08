import { Select } from "react95";
import type { TriggerDefinition } from "./types";

export function TriggerSelector({
  triggers,
  value,
  onChange,
}: {
  triggers: TriggerDefinition[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(event: any) => onChange(String(event.value))}
      options={triggers.map((trigger) => ({
        label: trigger.label,
        value: trigger.key,
      }))}
      width={260}
    />
  );
}
