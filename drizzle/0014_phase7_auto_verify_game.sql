-- Phase 7: extend side-quest auto_verify_type for cockpit-derived checks
-- (wallet_holdings, wallet_events, trade_board_listing collections).

ALTER TYPE "auto_verify_type" ADD VALUE IF NOT EXISTS 'holds_positive_balance';
ALTER TYPE "auto_verify_type" ADD VALUE IF NOT EXISTS 'holds_art_nft';
ALTER TYPE "auto_verify_type" ADD VALUE IF NOT EXISTS 'has_mint_event';
ALTER TYPE "auto_verify_type" ADD VALUE IF NOT EXISTS 'listed_on_trade_board';
