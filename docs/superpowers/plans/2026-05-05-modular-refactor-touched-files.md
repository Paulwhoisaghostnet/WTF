# Modular Refactor Touched Files Ledger

Generated during the `codex/modular-architecture-refactor` pass so later audit agents can inspect by domain instead of rediscovering the whole working tree.

## Desktop OS Shell

- `client/src/App.tsx`
- `client/src/components/layout/Desktop.tsx`
- `client/src/routes/page-defs.ts`
- `client/src/features/desktop/CustomCursor.tsx`
- `client/src/features/desktop/DesktopIcons.tsx`
- `client/src/features/desktop/SundayGrass.tsx`
- `client/src/features/desktop/geometry.ts`
- `client/src/features/desktop/useDesktopPhysics.ts`

## Desktop Pet Core

- `client/src/features/desktop/DesktopPet.tsx`
- `client/src/features/desktop/DesktopPetActors.tsx`
- `client/src/features/desktop/DesktopPetCareTray.tsx`
- `client/src/features/desktop/DesktopPetModel.ts`
- `client/src/features/desktop/DesktopPetScene.tsx`
- `client/src/features/desktop/DesktopPetSimulation.ts`
- `client/src/features/desktop/DesktopPetTypes.ts`
- `client/src/features/desktop/DesktopPetWorldActors.tsx`
- `client/src/features/desktop/useDesktopPetMarket.ts`
- `client/src/features/desktop/DesktopPetStorage.ts` (deleted/replaced by `persistence/*`)
- `client/src/features/desktop/pet/index.ts`
- `client/src/features/desktop/pet/useDesktopPetCleanupTick.ts`
- `client/src/features/desktop/pet/useDesktopPetLocomotion.ts`
- `client/src/features/desktop/pet/useDesktopPetToolCursor.ts`
- `client/src/features/desktop/persistence/index.ts`
- `client/src/features/desktop/persistence/storage.ts`
- `client/src/features/desktop/persistence/useDesktopPetPersistence.ts`

## Desktop Drop Domain

- `client/src/features/desktop/drops/index.ts`
- `client/src/features/desktop/drops/model.ts`
- `client/src/features/desktop/drops/storage.ts`
- `client/src/features/desktop/drops/useDesktopDropActions.ts`

## Desktop World Domain

- `client/src/features/desktop/world/index.ts`
- `client/src/features/desktop/world/simulation.ts`
- `client/src/features/desktop/world/useDesktopWorldGateway.ts`
- `client/src/features/desktop/world/useVisitingPetSimulation.ts`

## Desktop Ant Domain

- `client/src/features/desktop/ants/AntActors.tsx`
- `client/src/features/desktop/ants/index.ts`
- `client/src/features/desktop/ants/model.ts`
- `client/src/features/desktop/ants/simulation.ts`
- `client/src/features/desktop/ants/useDesktopAntSimulation.ts`

## Desktop Toy Domain

- `client/src/features/desktop/toys/ToyActors.tsx`
- `client/src/features/desktop/toys/index.ts`
- `client/src/features/desktop/toys/model.ts`
- `client/src/features/desktop/toys/simulation.ts`
- `client/src/features/desktop/toys/storage.ts`
- `client/src/features/desktop/toys/useDesktopToyActions.ts`
- `client/src/features/desktop/toys/useDesktopToySimulation.ts`

## W Server Domain

- `server/routes/w.ts`
- `server/features/w/action-routes.ts`
- `server/features/w/link-preview.ts`
- `server/features/w/link-preview-routes.ts`
- `server/features/w/message-routes.ts`
- `server/features/w/social-routes.ts`
- `server/features/w/timeline.ts`
- `server/features/w/timeline-routes.ts`
- `server/features/w/timeline-types.ts`
- `server/lib/timeline-db.ts`

## W Client Domain

- `client/src/pages/W.tsx`
- `client/src/features/w/types.ts`
- `client/src/features/w/useWDataQueries.ts`
- `client/src/features/w/useWMutations.ts`
- `client/src/features/w/timeline/WTimelinePanel.tsx`
- `client/src/features/w/messages/WMessagesPanel.tsx`
- `client/src/features/w/social/WSocialPanel.tsx`
- `client/src/features/w/WShell.tsx`

## Admin Server Domain

- `server/routes/admin.ts`
- `server/features/admin/media-storage-routes.ts`
- `server/features/admin/permissions-routes.ts`
- `server/features/admin/reward-routes.ts`
- `server/features/admin/stats-routes.ts`
- `server/features/admin/user-routes.ts`
- `server/features/admin/wtf-tv-routes.ts`
- `server/features/admin/users/index.ts`
- `server/features/admin/users/identity-profile-routes.ts`
- `server/features/admin/users/xp-routes.ts`
- `server/features/admin/users/deletion-routes.ts`
- `server/features/admin/users/temp-password-routes.ts`
- `server/features/admin/users/dossier-routes.ts`
- `server/features/admin/users/resync-routes.ts`

## Admin Client Domain

- `client/src/pages/Admin.tsx`
- `client/src/features/admin/types.ts`
- `client/src/features/admin/useAdminDataQueries.ts`
- `client/src/features/admin/useAdminMutations.ts`
- `client/src/features/admin/tabs/SeasonsAdminTab.tsx`
- `client/src/features/admin/tabs/UsersAdminTab.tsx`
- `client/src/features/admin/tabs/RoundsAdminTab.tsx`
- `client/src/features/admin/tabs/ChallengesAdminTab.tsx`
- `client/src/features/admin/tabs/SideQuestsAdminTab.tsx`
- `client/src/features/admin/tabs/BoardAdminTab.tsx`
- `client/src/features/admin/tabs/ContentAdminTab.tsx`
- `client/src/features/admin/tabs/XpLogAdminTab.tsx`
- `client/src/features/admin/tabs/RewardsAdminTab.tsx`
- `client/src/features/admin/tabs/DesktopAppsAdminTab.tsx`
- `client/src/features/admin/tabs/ContractLedgerAdminTab.tsx`
- `client/src/features/admin/tabs/RolesAdminTab.tsx`
- `client/src/features/admin/tabs/WtfTvAdminTab.tsx`
- `client/src/features/admin/tabs/StudioAdminTab.tsx`
- `client/src/features/admin/tabs/WtfTezAdminTab.tsx`

## TV Client Domain

- `client/src/pages/TV.tsx`
- `client/src/features/tv/TVChrome.ts`
- `client/src/features/tv/TVMenuScreens.tsx`
- `client/src/features/tv/TVPlaybackSurface.tsx`
- `client/src/features/tv/TVShellLayout.tsx`
- `client/src/features/tv/menu/AddTokensScreen.tsx`
- `client/src/features/tv/menu/BumpersScreen.tsx`
- `client/src/features/tv/menu/ChannelEditScreen.tsx`
- `client/src/features/tv/menu/ChannelVideosScreen.tsx`
- `client/src/features/tv/menu/ChannelsScreen.tsx`
- `client/src/features/tv/menu/CreatorToolsScreen.tsx`
- `client/src/features/tv/menu/MediaFormScreen.tsx`
- `client/src/features/tv/menu/MenuRootScreen.tsx`
- `client/src/features/tv/menu/MyMediaScreen.tsx`
- `client/src/features/tv/menu/PlaylistOrderScreen.tsx`
- `client/src/features/tv/menu/PlaylistsScreen.tsx`
- `client/src/features/tv/menu/ScheduleScreen.tsx`
- `client/src/features/tv/menu/SettingsScreen.tsx`
- `client/src/features/tv/TVStatic.tsx`
- `client/src/features/tv/index.ts`
- `client/src/features/tv/telemetry.ts`
- `client/src/features/tv/types.ts`
- `client/src/features/tv/useTVChannelSelection.ts`
- `client/src/features/tv/useTVBroadcastPlaybackState.ts`
- `client/src/features/tv/useTVBufferGate.ts`
- `client/src/features/tv/useTVBumperDeck.ts`
- `client/src/features/tv/useTVCurrentItemLifecycle.ts`
- `client/src/features/tv/useTVMediaEventHandlers.ts`
- `client/src/features/tv/useTVMtvOverlayVisibility.ts`
- `client/src/features/tv/useTVPlaybackTimers.ts`
- `client/src/features/tv/useTVPlaylistDraftSync.ts`
- `client/src/features/tv/useTVPowerSignalReset.ts`
- `client/src/features/tv/useTVPreloadTracker.ts`
- `client/src/features/tv/useTVPlaybackViewModel.ts`
- `client/src/features/tv/useTVQueueAdvanceController.ts`
- `client/src/features/tv/useTVQueueCursorSync.ts`
- `client/src/features/tv/useTVRemoteControls.ts`
- `client/src/features/tv/useTVSessionTelemetry.ts`
- `client/src/features/tv/useTVSkipNotice.ts`
- `client/src/features/tv/useTVStallIndicator.ts`
- `client/src/features/tv/useTVStreamPrefetch.ts`
- `client/src/features/tv/useTVDataQueries.ts`
- `client/src/features/tv/useTVMutations.ts`
- `client/src/features/tv/useTVCreatorDerivedData.ts`
- `client/src/features/tv/utils.ts`

## Marketplace Client Domain

- `client/src/pages/Marketplace.tsx`
- `client/src/features/marketplace/CreateMarketEntryPanel.tsx`
- `client/src/features/marketplace/MarketplaceActivityTab.tsx`
- `client/src/features/marketplace/MarketplaceAuctionsTab.tsx`
- `client/src/features/marketplace/MarketplaceChrome.ts`
- `client/src/features/marketplace/MarketplaceListingsTab.tsx`
- `client/src/features/marketplace/MarketplaceTradeBoardsTab.tsx`
- `client/src/features/marketplace/OfferAcceptanceDialog.tsx`
- `client/src/features/marketplace/index.ts`
- `client/src/features/marketplace/types.ts`
- `client/src/features/marketplace/useMarketplaceActions.ts`
- `client/src/features/marketplace/useMarketplaceData.ts`
- `client/src/features/marketplace/utils.ts`

## Studio Client Domain

- `client/src/pages/StudioProject.tsx`
- `client/src/features/studio/AnnotationDetailPanel.tsx`
- `client/src/features/studio/MemberInvitePicker.tsx`
- `client/src/features/studio/StudioChrome.ts`
- `client/src/features/studio/StudioCollaborationColumn.tsx`
- `client/src/features/studio/StudioFileTreePanel.tsx`
- `client/src/features/studio/StudioLeftColumn.tsx`
- `client/src/features/studio/StudioPreviewSurface.tsx`
- `client/src/features/studio/StudioWorkspaceHeader.tsx`
- `client/src/features/studio/types.ts`
- `client/src/features/studio/useStudioProjectData.ts`
- `client/src/features/studio/useStudioProjectMutations.ts`
- `client/src/features/studio/useStudioSocketEffects.ts`
- `client/src/features/studio/utils.ts`

## MessageBoard Client Domain

- `client/src/pages/MessageBoard.tsx`
- `client/src/features/board/BoardChannelSettings.tsx`
- `client/src/features/board/BoardChrome.ts`
- `client/src/features/board/BoardComposer.tsx`
- `client/src/features/board/BoardManagementDialogs.tsx`
- `client/src/features/board/BoardMessageList.tsx`
- `client/src/features/board/BoardSidebar.tsx`
- `client/src/features/board/types.ts`
- `client/src/features/board/useBoardData.ts`
- `client/src/features/board/useBoardMutations.ts`
- `client/src/features/board/utils.ts`

## TV Server Domain

- `server/routes/tv.ts`
- `server/features/tv/bumper-routes.ts`
- `server/features/tv/bumper-upload.ts`
- `server/features/tv/cache-files.ts`
- `server/features/tv/cache-routes.ts`
- `server/features/tv/cache-runtime.ts`
- `server/features/tv/cache-storage.ts`
- `server/features/tv/channel-routes.ts`
- `server/features/tv/channel-service.ts`
- `server/features/tv/daypart.ts`
- `server/features/tv/live-routes.ts`
- `server/features/tv/media-metadata.ts`
- `server/features/tv/media-urls.ts`
- `server/features/tv/pagination.ts`
- `server/features/tv/playlist-routes.ts`
- `server/features/tv/playback-routes.ts`
- `server/features/tv/stream-snapshot.ts`
- `server/features/tv/telemetry.ts`
- `server/features/tv/telemetry-routes.ts`
- `server/features/tv/transcode.ts`
- `server/features/tv/wtf-refresh.ts`
- `server/index.ts`
- `server/routes.ts`
- `server/routes/admin.ts`
- `server/lib/background-jobs.ts`
- `scripts/cache-evict.ts`
- `scripts/tv-cache-evict.ts`

## In-App Market / Tezos Dirtied In Same Working Tree

These files are dirty in the same branch and should be audited with the market/verifier pass, not the desktop split:

- `.env.example`
- `client/src/lib/tezos/in-app-market.ts`
- `docs/wtf-in-app-market/README.md`
- `server/lib/in-app-market-policy.ts`
- `server/lib/in-app-market-policy.test.ts`
- `server/lib/in-app-market-sync.ts`
- `server/lib/tzkt-ops.ts`
- `server/lib/tzkt-ops.test.ts`
- `shared/types.ts`

## Planning / Audit Tracking

- `BUG_BOUNTY_BOARD.md`
- `LESSONS_LEARNED.md`
- `docs/superpowers/plans/2026-05-05-wtf-domain-modular-architecture.md`
- `docs/superpowers/plans/2026-05-05-modular-refactor-touched-files.md`
- `docs/superpowers/plans/2026-05-05-modular-junk-drawer-integration.md`

## Shared Schema Domain

- `shared/schema.ts`
- `shared/schema-core.ts`
- `shared/schema-social.ts`
- `shared/schema-ops.ts`
- `shared/schema-admin.ts`
- `shared/schema-analytics.ts`
- `shared/schema-dm.ts`
- `shared/schema-gameshow.ts`
- `shared/schema-liveops.ts`
- `shared/schema-board.ts`
- `shared/schema-recapture.ts`
- `shared/schema-session.ts`
- `shared/schema-studio.ts`
- `shared/schema-desktop.ts`
- `shared/schema-discord.ts`
- `shared/schema-market.ts`
- `shared/schema-tv.ts`
- `shared/schema-wallet.ts`

## Generated Test Artifacts To Clean Before Merge

- `test-results/.last-run.json`
- `test-results/desktop-desktop-icon-launc-987a9-et-render-from-the-OS-shell-chromium/`
