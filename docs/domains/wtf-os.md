# WTF OS

## Purpose

WTF OS is the desktop shell that hosts the platform. Users open app windows, arrange desktop icons, manage settings, and move between gameshow, social, market, media, and creator tools without leaving the OS frame.

## WTF OS Connection

Every major feature appears as a route and, when appropriate, as a window-capable app. Admin-only and staff-only tools should be registered through the OS admin surface registry so settings, permissions, and discoverability stay consistent.

## Main Code

- `client/src/components/layout`
- `client/src/features/desktop`
- `client/src/features/admin-os`
- `client/src/routes`
- `shared/desktop.ts`

## Notes

New apps should add their route, icon/window behavior, permission metadata, and admin surface entry in the same pass.
