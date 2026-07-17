import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Ban,
  Bot,
  Boxes,
  CircleHelp,
  ClipboardList,
  Coins,
  FileText,
  Gamepad2,
  Gift,
  HardDrive,
  LayoutDashboard,
  Layers,
  MonitorCog,
  Package,
  RadioTower,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Trophy,
  Tv,
  Users,
} from "lucide-react";
import {
  ADMIN_SECTION_CATALOG,
  type AdminSectionCatalogEntry,
} from "./admin-section-catalog";

const ICONS_BY_SLUG: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  users: Users,
  roles: ShieldCheck,
  curses: Ban,
  "os-surfaces": MonitorCog,
  "desktop-apps": Boxes,
  seasons: Trophy,
  rounds: Layers,
  challenges: ClipboardList,
  "side-quests": BadgeCheck,
  automation: Bot,
  rewards: Gift,
  "xp-log": Coins,
  "contract-ledger": ReceiptText,
  "in-app-market": ShoppingBag,
  "wtf-domains": Package,
  "wtf-tv": Tv,
  studio: HardDrive,
  arcade: Gamepad2,
  "w-digest": RadioTower,
  board: FileText,
  content: FileText,
  help: CircleHelp,
};

export type AdminSection = AdminSectionCatalogEntry & { Icon: LucideIcon };

export const ADMIN_SECTIONS: AdminSection[] = ADMIN_SECTION_CATALOG.map((section) => ({
  ...section,
  Icon: ICONS_BY_SLUG[section.slug] ?? CircleHelp,
}));
