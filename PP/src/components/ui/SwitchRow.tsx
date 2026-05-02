import * as Switch from "@radix-ui/react-switch";

export function SwitchRow(props: {
  label: string;
  checked: boolean;
  onCheckedChange: (b: boolean) => void;
  tooltip?: string;
}) {
  const { label, checked, onCheckedChange, tooltip } = props;

  return (
    <div className="row" title={tooltip}>
      <div className="small">{label}</div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        style={{
          width: 42,
          height: 24,
          borderRadius: 999,
          background: checked ? "rgba(124,58,237,0.75)" : "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.18)",
          position: "relative",
          cursor: "pointer"
        }}
      >
        <Switch.Thumb
          style={{
            display: "block",
            width: 20,
            height: 20,
            borderRadius: 999,
            background: "rgba(255,255,255,0.92)",
            transform: checked ? "translateX(18px)" : "translateX(2px)",
            transition: "transform 120ms ease"
          }}
        />
      </Switch.Root>
    </div>
  );
}
