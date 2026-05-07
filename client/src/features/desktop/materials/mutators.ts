import type { DesktopMaterialProfile } from "./model";

export type DesktopMutatorKind = "scale-tool" | "paper-shredder" | "portal";

export interface MutatorCompatibility {
  compatible: boolean;
  reason: string;
  wear: number;
}

export function canMaterialUseScaleTool(material: DesktopMaterialProfile): MutatorCompatibility {
  return {
    compatible: material.scaleCompatible,
    reason: material.scaleCompatible ? "scale-compatible" : "energy-or-fixed-scale",
    wear: material.scaleCompatible ? Math.max(0.08, 1 - material.durability) : 0,
  };
}

export function canMaterialEnterPortal(material: DesktopMaterialProfile): MutatorCompatibility {
  return {
    compatible: material.portalCompatible,
    reason: material.portalCompatible ? "portal-compatible" : "portal-stable-field",
    wear: 0,
  };
}

export function canMaterialBeShredded(material: DesktopMaterialProfile): MutatorCompatibility {
  const compatible =
    material.shreddable &&
    material.tensileStrength <= 0.58 &&
    material.pierceResistance <= 0.46;
  return {
    compatible,
    reason: compatible ? "paperlike-material" : "too-durable-for-shredder",
    wear: compatible ? 0.12 + material.tensileStrength * 0.28 : 0.02,
  };
}

export function compatibilityForMutator(
  mutator: DesktopMutatorKind,
  material: DesktopMaterialProfile
): MutatorCompatibility {
  if (mutator === "scale-tool") return canMaterialUseScaleTool(material);
  if (mutator === "portal") return canMaterialEnterPortal(material);
  return canMaterialBeShredded(material);
}
