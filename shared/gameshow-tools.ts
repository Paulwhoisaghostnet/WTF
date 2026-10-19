import type { DesktopAppKey } from "./types";

/** Curated handoffs to existing OS owners. This is not another app/access registry. */
export const GAMESHOW_TOOL_IDS = [
  "wallets", "files", "studio", "paint", "pixalerce", "domains", "pasta-protocol",
  "macaroni", "spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna",
] as const;
export type GameshowToolId = typeof GAMESHOW_TOOL_IDS[number];

export interface GameshowTool {
  id: GameshowToolId;
  label: string;
  route: string;
  description: string;
  handoff: string;
  appKey?: DesktopAppKey;
  prerequisite?: string;
}

export const GAMESHOW_TOOLS: readonly GameshowTool[] = [
  { id: "wallets", label: "Wallet connections", route: "/profile", description: "Connect and prove ownership of the wallets used in the show.", handoff: "Use Linked Wallets in your profile. Return to the round after linking." },
  { id: "files", label: "Project files", route: "/file-manager", description: "Browse and recover your files in the OS file manager.", handoff: "Save the project file as well as its finished export." },
  { id: "studio", label: "Studio projects", route: "/studio", appKey: "studio", description: "Organize project files, drafts, versions, and collaborators.", handoff: "Create or open the project for this round and keep its evidence link." },
  { id: "paint", label: "Broot canvas & paint", route: "/tools/broot", description: "Paint and compose layered artwork with undo, local drafts, and portable project files.", handoff: "Save a .broot project and export the artwork requested by the host." },
  { id: "pixalerce", label: "PixAlerce pixel studio", route: "/tools/pixalerce", description: "Create pixel art, animation, and 3D exports.", handoff: "Save your project and send its export to Media or download it." },
  { id: "domains", label: "Subdomain setup & pages", route: "/wtf-subdomains/setup", appKey: "wtf-subdomains", description: "Set up your own site and prepare project pages.", handoff: "Follow the setup wizard, choose page visibility, then review and publish." },
  { id: "pasta-protocol", label: "Pasta Protocol workspace", route: "/tools/colander", appKey: "pasta-protocol", description: "Choose and prepare a Pasta publishing project in Colander.", handoff: "Open the assigned tool and check its current network and publishing requirements." },
  { id: "macaroni", label: "Macaroni", route: "/tools/macaroni", appKey: "pasta-protocol", description: "Prepare blind-mint collections and collector pages.", handoff: "Prepare and save the project before any separately approved wallet action.", prerequisite: "Macaroni creator access is checked separately from the Pasta app pass." },
  { id: "spaghetti", label: "Spaghetti", route: "/tools/spaghetti", appKey: "pasta-protocol", description: "Prepare standard collections and fixed-edition token projects.", handoff: "Save the project and its portable collector-site package." },
  { id: "gnocchi", label: "Gnocchi", route: "/tools/gnocchi", appKey: "pasta-protocol", description: "Prepare open-edition publishing projects.", handoff: "Review the host's edition rules and save the portable project." },
  { id: "ravioli", label: "Ravioli", route: "/tools/ravioli", appKey: "pasta-protocol", description: "Prepare art packs, redeemables, and wrapped sets.", handoff: "Save the project, recovery kit, and the requested preview." },
  { id: "rotini", label: "Rotini", route: "/tools/rotini", appKey: "pasta-protocol", description: "Compose trait-based generative projects.", handoff: "Save the project and export the generated artwork or offline package." },
  { id: "penne", label: "Penne", route: "/tools/penne", appKey: "pasta-protocol", description: "Prepare distribution and claim projects.", handoff: "Prepare the recipient experience; follow the host's rule before publishing or signing." },
  { id: "lasagna", label: "Lasagna", route: "/tools/lasagna", appKey: "pasta-protocol", description: "Work with the existing Lasagna publishing tool.", handoff: "Follow the round instructions and save the project before submitting evidence." },
];

export function gameshowTool(id: string): GameshowTool | undefined {
  return GAMESHOW_TOOLS.find(tool => tool.id === id);
}
