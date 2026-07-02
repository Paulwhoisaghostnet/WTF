import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const wimSource = readFileSync("client/src/pages/Wim.tsx", "utf8");
const inventory = readFileSync(
  ".agents/docs/live/user-interaction-inventory.md",
  "utf8"
);
const workflows = readFileSync("tests/e2e/inventory/domain-workflows.mjs", "utf8");
const behaviorAssertions = readFileSync(
  "tests/e2e/inventory/behavior-assertions.mjs",
  "utf8"
);
const adminSurfaceRegistry = readFileSync(
  "client/src/features/admin-os/admin-surface-registry.ts",
  "utf8"
);
const retiredMessengerNamePattern = new RegExp(`\\bA${"im"}\\b|\\ba${"im"}\\b|/a${"im"}`);
const retiredMessengerInventoryPattern = new RegExp(`/a${"im"}|A${"IM"}`);

test("WIM roster is user-driven and keeps Studio rooms out of buddies", () => {
  assert.match(wimSource, /api\.get<DmConversation\[\]>\("\/api\/messages\/dms"\)/);
  assert.match(wimSource, /\/api\/messages\/users\?limit=100&excludeSelf=1/);
  assert.match(wimSource, /conversation\.conversationType \?\? "direct"/);
  assert.match(wimSource, /conversation\.peers\.length === 1/);
  assert.match(wimSource, /studioConversations/);
  assert.match(wimSource, /allConversationRows/);

  for (const label of [
    "My Friends",
    "Active Now",
    "Inactive / Away",
    "Offline",
    "All WTF Users",
    "Recent Chats",
    "Direct WIM chats",
    "Studio project chats",
  ]) {
    assert.match(wimSource, new RegExp(label));
  }

  assert.match(wimSource, /onDoubleClickCapture=\{\(\) => openDirectChat\(item\)\}/);
  assert.match(wimSource, /data-wim-chat-open=\{item\.id\}/);
  assert.match(wimSource, /aria-label=\{`Open WIM chat with \$\{userLabel\(item\)\}`\}/);
  assert.match(wimSource, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(wimSource, /presenceStatus/);
  assert.match(wimSource, /presenceStatusFor/);
  assert.match(wimSource, /data-wim-window-kind=\{windowState\.kind\}/);
  assert.match(wimSource, /WIM_CONVERSATION_DRAG_TYPE/);
  assert.match(wimSource, /detachConversationToWindow/);
  assert.doesNotMatch(wimSource, /components\/layout\/AppWindow/);
  assert.doesNotMatch(wimSource, /<AppWindow\b/);
  assert.match(wimSource, /data-wim-desktop-surface="true"/);
  assert.match(wimSource, /pointer-events: none !important/);
  assert.match(wimSource, /DesktopConversationDropLayer/);
  assert.match(wimSource, /data-wim-drop-layer="conversation"/);
  assert.doesNotMatch(wimSource, /TrafficLights|TrafficLight/);
  assert.match(wimSource, /const WindowControlButton = styled\(Button\)/);
  assert.match(wimSource, /const TabCloseButton = styled\.button/);
  assert.doesNotMatch(wimSource, /const TabClose = styled\.span/);
  assert.match(wimSource, /--wtf-window-color/);
  assert.match(wimSource, /--wtf-titlebar-height/);
  assert.match(wimSource, /data-compact-control="true"/);
  assert.match(wimSource, /wm\.minimize\(routePath\)/);
  assert.match(wimSource, /windowId === "buddy-list"/);
  assert.match(wimSource, /wm\.close\(routePath\)/);
  assert.doesNotMatch(wimSource, /const Dock = styled|DockButton|WIM minimized windows/);
  assert.doesNotMatch(wimSource, retiredMessengerNamePattern);
});

test("WIM has mobile WCAG accessibility guards", () => {
  for (const expected of [
    "WIM_SURFACE_GAP",
    "WIM_MOBILE_MIN_WIDTH",
    "wimWindowMinWidth",
    "fitWimWindowToSurface",
    "window.ResizeObserver",
    "--wim-control-size",
    "--wim-window-control-size",
    "--wim-tab-close-size",
    "role=\"toolbar\"",
    "aria-pressed={messageStyle.bold}",
    "role=\"log\"",
    "aria-live=\"polite\"",
    "aria-relevant=\"additions text\"",
    "aria-expanded={sections[key]}",
    "aria-expanded={!collapsed}",
    "toLocaleTimeString(wimLocale()",
    "localeCompare(userLabel(b), locale",
  ]) {
    assert.match(wimSource, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(inventory, /WCAG 2\.2 AA target-size floor/);
  assert.match(behaviorAssertions, /320px mobile Chrome-style viewport/);
});

test("WIM friend list and unread popups are browser-local and covered by inventory", () => {
  assert.match(wimSource, /friendStorageKey/);
  assert.match(wimSource, /customListsStorageKey/);
  assert.match(wimSource, /friendsReady/);
  assert.match(wimSource, /window\.localStorage\.setItem\(key, JSON\.stringify\(friendIds\)\)/);
  assert.match(wimSource, /window\.localStorage\.setItem\(key, JSON\.stringify\(customLists\)\)/);
  assert.match(wimSource, /eventType: "wim\.friend\.added"/);
  assert.match(wimSource, /popupDismissalStorageKey/);
  assert.match(wimSource, /data-wim-offline-popup="true"/);
  assert.match(wimSource, /var\(--wim-navy, #07156f\)/);
  assert.match(wimSource, /aria-expanded=\{settingsOpen\}/);
  assert.match(wimSource, /id="wim-settings-popover"/);
  assert.match(wimSource, /event\.key !== "Escape"/);
  assert.match(wimSource, /"wim\.offline_popup\.opened"/);
  assert.match(wimSource, /"wim\.offline_popup\.dismissed"/);

  assert.match(inventory, /`wim\.friend\.added`/);
  assert.match(inventory, /active, inactive\/away, or offline/);
  assert.match(inventory, /desktop-level buddy-list widget/);
  assert.match(inventory, /without a containing WIM AppWindow/);
  assert.match(inventory, /system appearance-owned window controls/);
  assert.match(inventory, /shared OS taskbar/);
  assert.doesNotMatch(inventory, /WIM dock/);
  assert.match(inventory, /in-place popup/);
  assert.match(inventory, /visible open-chat button/);
  assert.match(inventory, /custom buddy lists/);
  assert.match(inventory, /combine multiple conversations as tabs/);
  assert.match(inventory, /dismissible WIM desktop popups/);
  assert.match(inventory, /`wim\.offline_popup\.opened`/);
  assert.match(inventory, /`wim\.offline_popup\.dismissed`/);
  assert.match(inventory, /Studio project conversations in Recent Chats/);
  assert.match(inventory, /keeping Studio rooms out of the buddy roster/);
  assert.doesNotMatch(inventory, retiredMessengerInventoryPattern);
  assert.match(workflows, /"wim\.friend\.added"/);
  assert.match(workflows, /"wim\.offline_popup\.opened"/);
  assert.match(workflows, /"wim\.offline_popup\.dismissed"/);
  assert.match(workflows, /\/api\/messages\/users\?limit=100&excludeSelf=1/);
  assert.match(behaviorAssertions, /wim\.modular-window-roster-tabs/);
  assert.match(behaviorAssertions, /does not render a containing AppWindow/);
  assert.match(behaviorAssertions, /custom lists\/popup dismissals browser-local/);
});

test("WIM interior chrome follows desktop appearance styles", () => {
  for (const style of ["wtf-xp", "wtf-aqua", "wtf-zine"]) {
    assert.match(wimSource, new RegExp(`data-wtf-appearance-style="${style}"`));
  }
});

test("WIM conversations carry classic rich composer metadata and inserts", () => {
  for (const expected of [
    "WIM_FONT_CHOICES",
    "DESKTOP_WIM_CHAT_FONT_FAMILIES",
    "WIM_FONT_SIZES",
    "DESKTOP_WIM_CHAT_FONT_SIZES",
    "DEFAULT_WIM_MESSAGE_STYLE",
    "WIM_MAX_ATTACHMENTS",
    "WimRichMetadata",
    "cssPropertiesForWimStyle",
    "normalizeWimMessageStyle",
    "wimRich",
    "metadata",
    "Bold WIM text",
    "Italic WIM text",
    "Underline WIM text",
    "Insert GIF",
    "Insert wtfOS media",
    "Insert owned token link",
    "WIM message formatting toolbar",
    "WIM GIF picker",
    "WIM media picker",
    "WIM token picker",
    "FormatToolbarRow",
    "GIPHY",
    "Tenor",
    "giphy.com/search",
    "tenor.com/search",
    "/api/media/mine",
    "/api/profile/tokens?limit=36&sortBy=lastSeenAt&sortDir=desc",
    "/token/",
    "resolveTokenThumbnail",
  ]) {
    assert.match(wimSource, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(inventory, /font family, font size, text color, bold, italic, and underline/);
  assert.match(inventory, /GIPHY\/Tenor GIF/);
  assert.match(inventory, /wtfOS My Media/);
  assert.match(inventory, /owned\/created token links/);
  assert.match(adminSurfaceRegistry, /shared OS taskbar minimize\/restore/);
  assert.match(adminSurfaceRegistry, /classic IM-style rich text composer/);
  assert.match(adminSurfaceRegistry, /GIPHY\/Tenor GIF insert handoff/);
  assert.match(behaviorAssertions, /rich WIM composer/);
  assert.match(wimSource, /aria-label=\{`Remove \$\{attachment\.kind\} attachment \$\{attachment\.title\}`\}/);
  assert.match(wimSource, /aria-label=\{`Open \$\{attachment\.kind\} attachment \$\{attachment\.title\}`\}/);
});
