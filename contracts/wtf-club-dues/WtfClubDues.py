# WtfClubDues - SmartPy v0.24.1
#
# Tiered club/subscription dues router for WTF. The contract keeps access
# state and collectible monthly membership receipts in one template:
# - action 0 renews the current active token/access without minting new art.
# - action 1 replaces the active token with the current drop token.
# - action 2 charges the preserve fee, keeps the old token as a collectible,
#   and mints a new current-drop access token.

import smartpy as sp


@sp.module
def wtf_club_dues_main():
    PayDuesInputType: type = sp.record(
        payment_ref=sp.string,
        months=sp.nat,
    )

    PayMembershipInputType: type = sp.record(
        payment_ref=sp.string,
        periods=sp.nat,
        tier_id=sp.nat,
        action=sp.nat,
    )

    TierType: type = sp.record(
        name=sp.string,
        price=sp.mutez,
        period_seconds=sp.nat,
        utility_units_per_period=sp.nat,
        metadata_uri=sp.string,
        active=sp.bool,
    )

    DropType: type = sp.record(
        metadata_uri=sp.string,
        art_hash=sp.string,
        terms_uri=sp.string,
        edition_count=sp.nat,
        active=sp.bool,
    )

    MemberType: type = sp.record(
        active_token_id=sp.nat,
        paid_through=sp.timestamp,
        utility_units=sp.nat,
        payment_count=sp.nat,
        preserved_count=sp.nat,
        replaced_count=sp.nat,
        last_payment_ref=sp.string,
        last_payment_at=sp.timestamp,
        last_action=sp.nat,
    )

    TokenReceiptType: type = sp.record(
        owner=sp.address,
        tier_id=sp.nat,
        drop_id=sp.nat,
        edition=sp.nat,
        minted_at=sp.timestamp,
        paid_through=sp.timestamp,
        metadata_uri=sp.string,
        art_hash=sp.string,
        terms_uri=sp.string,
        utility_units=sp.nat,
        payment_ref=sp.string,
        status=sp.nat,
    )

    class WtfClubDues(sp.Contract):
        def __init__(
            self,
            admin,
            treasury,
            club_name,
            membership_symbol,
            metadata_uri,
            monthly_due,
            month_seconds,
            utility_units_per_month,
            grace_period_seconds,
        ):
            self.data.admin = admin
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
            self.data.version = "wtf-club-dues-v2"
            self.data.treasury = treasury
            self.data.club_name = club_name
            self.data.membership_symbol = membership_symbol
            self.data.metadata_uri = metadata_uri
            self.data.monthly_due = monthly_due
            self.data.month_seconds = month_seconds
            self.data.utility_units_per_month = utility_units_per_month
            self.data.grace_period_seconds = grace_period_seconds
            self.data.preserve_fee = sp.tez(1)
            self.data.current_drop_id = sp.nat(0)
            self.data.next_membership_token_id = sp.nat(0)

            self.data.tiers = sp.cast(
                sp.big_map(
                    {
                        0: sp.record(
                            name=club_name,
                            price=monthly_due,
                            period_seconds=month_seconds,
                            utility_units_per_period=utility_units_per_month,
                            metadata_uri=metadata_uri,
                            active=True,
                        )
                    }
                ),
                sp.big_map[sp.nat, TierType],
            )
            self.data.drops = sp.cast(
                sp.big_map(
                    {
                        0: sp.record(
                            metadata_uri=metadata_uri,
                            art_hash="",
                            terms_uri=metadata_uri,
                            edition_count=sp.nat(0),
                            active=True,
                        )
                    }
                ),
                sp.big_map[sp.nat, DropType],
            )

            self.data.members = sp.cast(
                sp.big_map(),
                sp.big_map[tuple[sp.address, sp.nat], MemberType],
            )
            self.data.membership_token_owners = sp.cast(
                sp.big_map(),
                sp.big_map[sp.nat, sp.address],
            )
            self.data.token_receipts = sp.cast(
                sp.big_map(),
                sp.big_map[sp.nat, TokenReceiptType],
            )
            self.data.ledger = sp.cast(
                sp.big_map(),
                sp.big_map[tuple[sp.address, sp.nat], sp.nat],
            )
            self.data.utility_balances = sp.cast(
                sp.big_map(),
                sp.big_map[sp.address, sp.nat],
            )
            self.data.tier_utility_balances = sp.cast(
                sp.big_map(),
                sp.big_map[tuple[sp.address, sp.nat], sp.nat],
            )
            self.data.naughty_list = sp.cast(
                sp.big_map(),
                sp.big_map[tuple[sp.address, sp.nat], sp.timestamp],
            )

        @sp.entrypoint
        def default(self):
            assert False, "DEFAULT_DISABLED"

        @sp.entrypoint
        def transfer(self, batch):
            sp.cast(batch, sp.list[sp.record(from_=sp.address, txs=sp.list[sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)])])
            assert False, "SOULBOUND"

        @sp.entrypoint
        def propose_admin(self, new_admin):
            sp.cast(new_admin, sp.address)
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert sp.sender == self.data.admin, "ADMIN_ONLY"
            assert new_admin != self.data.admin, "SAME_ADMIN"
            self.data.pending_admin = sp.Some(new_admin)

        @sp.entrypoint
        def accept_admin(self):
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert self.data.pending_admin.is_some(), "NO_PENDING_ADMIN"
            new_admin = self.data.pending_admin.unwrap_some()
            assert sp.sender == new_admin, "NOT_PENDING_ADMIN"
            self.data.admin = new_admin
            self.data.pending_admin = None

        @sp.entrypoint
        def register_member(self, member):
            sp.cast(member, sp.address)
            assert sp.sender == self.data.admin, "ADMIN_ONLY"
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert 0 in self.data.tiers, "NO_TIER"
            key = (member, sp.nat(0))
            assert not key in self.data.members, "ALREADY_REGISTERED"
            tier = self.data.tiers[0]
            token_id = self.data.next_membership_token_id
            self.data.next_membership_token_id += 1
            drop = self.data.drops[self.data.current_drop_id]
            edition = drop.edition_count + 1
            self.data.drops[self.data.current_drop_id] = sp.record(
                metadata_uri=drop.metadata_uri,
                art_hash=drop.art_hash,
                terms_uri=drop.terms_uri,
                edition_count=edition,
                active=drop.active,
            )
            self.data.membership_token_owners[token_id] = member
            self.data.ledger[(member, token_id)] = 1
            self.data.token_receipts[token_id] = sp.record(
                owner=member,
                tier_id=sp.nat(0),
                drop_id=self.data.current_drop_id,
                edition=edition,
                minted_at=sp.now,
                paid_through=sp.now,
                metadata_uri=drop.metadata_uri,
                art_hash=drop.art_hash,
                terms_uri=drop.terms_uri,
                utility_units=sp.nat(0),
                payment_ref="manual-registration",
                status=sp.nat(0),
            )
            self.data.members[key] = sp.record(
                active_token_id=token_id,
                paid_through=sp.now,
                utility_units=sp.nat(0),
                payment_count=sp.nat(0),
                preserved_count=sp.nat(0),
                replaced_count=sp.nat(0),
                last_payment_ref="manual-registration",
                last_payment_at=sp.now,
                last_action=sp.nat(0),
            )
            self.data.tier_utility_balances[key] = sp.nat(0)
            if member in self.data.utility_balances:
                pass
            else:
                self.data.utility_balances[member] = sp.nat(0)
            sp.emit(
                sp.record(
                    member=member,
                    tier_id=sp.nat(0),
                    token_id=token_id,
                    drop_id=self.data.current_drop_id,
                    edition=edition,
                    registered_at=sp.now,
                    metadata_uri=drop.metadata_uri,
                ),
                tag="member_registered",
            )

        @sp.entrypoint
        def pay_dues(self, params):
            sp.cast(params, PayDuesInputType)
            assert params.months > 0, "ZERO_MONTHS"
            assert params.months <= 60, "TOO_MANY_MONTHS"
            assert sp.len(params.payment_ref) > 0, "PAYMENT_REF_REQUIRED"
            assert sp.len(params.payment_ref) <= 128, "PAYMENT_REF_TOO_LONG"
            assert 0 in self.data.tiers, "NO_TIER"
            tier = self.data.tiers[0]
            assert tier.active, "TIER_INACTIVE"
            expected = sp.split_tokens(tier.price, params.months, 1)
            assert sp.amount == expected, "BAD_DUES_AMOUNT"

            key = (sp.sender, sp.nat(0))
            paid_start = sp.now
            previous_utility = sp.nat(0)
            previous_count = sp.nat(0)
            preserved_count = sp.nat(0)
            replaced_count = sp.nat(0)
            token_id = self.data.next_membership_token_id
            minted_new = True

            if key in self.data.members:
                current = self.data.members[key]
                token_id = current.active_token_id
                previous_utility = current.utility_units
                previous_count = current.payment_count
                preserved_count = current.preserved_count
                replaced_count = current.replaced_count
                minted_new = False
                if current.paid_through > sp.now:
                    paid_start = current.paid_through
            else:
                self.data.next_membership_token_id += 1
                drop = self.data.drops[self.data.current_drop_id]
                edition = drop.edition_count + 1
                self.data.drops[self.data.current_drop_id] = sp.record(
                    metadata_uri=drop.metadata_uri,
                    art_hash=drop.art_hash,
                    terms_uri=drop.terms_uri,
                    edition_count=edition,
                    active=drop.active,
                )
                self.data.membership_token_owners[token_id] = sp.sender
                self.data.ledger[(sp.sender, token_id)] = 1
                self.data.token_receipts[token_id] = sp.record(
                    owner=sp.sender,
                    tier_id=sp.nat(0),
                    drop_id=self.data.current_drop_id,
                    edition=edition,
                    minted_at=sp.now,
                    paid_through=sp.now,
                    metadata_uri=drop.metadata_uri,
                    art_hash=drop.art_hash,
                    terms_uri=drop.terms_uri,
                    utility_units=sp.nat(0),
                    payment_ref=params.payment_ref,
                    status=sp.nat(0),
                )
                sp.emit(
                    sp.record(
                        member=sp.sender,
                        tier_id=sp.nat(0),
                        token_id=token_id,
                        drop_id=self.data.current_drop_id,
                        edition=edition,
                        registered_at=sp.now,
                        metadata_uri=drop.metadata_uri,
                    ),
                    tag="member_registered",
                )

            extra_seconds = sp.to_int(params.months * tier.period_seconds)
            paid_through = sp.add_seconds(paid_start, extra_seconds)
            utility_units = previous_utility + (params.months * tier.utility_units_per_period)
            self.data.members[key] = sp.record(
                active_token_id=token_id,
                paid_through=paid_through,
                utility_units=utility_units,
                payment_count=previous_count + 1,
                preserved_count=preserved_count,
                replaced_count=replaced_count,
                last_payment_ref=params.payment_ref,
                last_payment_at=sp.now,
                last_action=sp.nat(0),
            )
            self.data.utility_balances[sp.sender] = self.data.utility_balances.get(sp.sender, default=sp.nat(0)) + (params.months * tier.utility_units_per_period)
            self.data.tier_utility_balances[key] = utility_units
            if key in self.data.naughty_list:
                del self.data.naughty_list[key]
            receipt = self.data.token_receipts[token_id]
            self.data.token_receipts[token_id] = sp.record(
                owner=receipt.owner,
                tier_id=receipt.tier_id,
                drop_id=receipt.drop_id,
                edition=receipt.edition,
                minted_at=receipt.minted_at,
                paid_through=paid_through,
                metadata_uri=receipt.metadata_uri,
                art_hash=receipt.art_hash,
                terms_uri=receipt.terms_uri,
                utility_units=utility_units,
                payment_ref=params.payment_ref,
                status=sp.nat(0),
            )
            sp.send(self.data.treasury, sp.amount)
            sp.emit(
                sp.record(
                    member=sp.sender,
                    tier_id=sp.nat(0),
                    payment_ref=params.payment_ref,
                    periods=params.months,
                    amount=sp.amount,
                    action=sp.nat(0),
                    token_id=token_id,
                    minted_new=minted_new,
                    paid_through=paid_through,
                    utility_units=utility_units,
                ),
                tag="dues_paid",
            )

        @sp.entrypoint
        def pay_membership(self, params):
            sp.cast(params, PayMembershipInputType)
            assert params.periods > 0, "ZERO_PERIODS"
            assert params.periods <= 60, "TOO_MANY_PERIODS"
            assert params.action <= 2, "BAD_ACTION"
            assert sp.len(params.payment_ref) > 0, "PAYMENT_REF_REQUIRED"
            assert sp.len(params.payment_ref) <= 128, "PAYMENT_REF_TOO_LONG"
            assert params.tier_id in self.data.tiers, "NO_TIER"
            assert self.data.current_drop_id in self.data.drops, "NO_DROP"
            tier = self.data.tiers[params.tier_id]
            drop = self.data.drops[self.data.current_drop_id]
            assert tier.active, "TIER_INACTIVE"
            assert drop.active, "DROP_INACTIVE"

            expected = sp.split_tokens(tier.price, params.periods, 1)
            if params.action == 2:
                expected += self.data.preserve_fee
            assert sp.amount == expected, "BAD_DUES_AMOUNT"

            key = (sp.sender, params.tier_id)
            paid_start = sp.now
            previous_utility = sp.nat(0)
            previous_count = sp.nat(0)
            preserved_count = sp.nat(0)
            replaced_count = sp.nat(0)
            old_token_id = sp.nat(0)
            has_previous = False
            should_mint = True
            minted_new = True
            token_id = self.data.next_membership_token_id

            if key in self.data.members:
                current = self.data.members[key]
                old_token_id = current.active_token_id
                token_id = current.active_token_id
                previous_utility = current.utility_units
                previous_count = current.payment_count
                preserved_count = current.preserved_count
                replaced_count = current.replaced_count
                has_previous = True
                if current.paid_through > sp.now:
                    paid_start = current.paid_through
                if params.action == 0:
                    should_mint = False
                    minted_new = False
                else:
                    if params.action == 2:
                        old_receipt = self.data.token_receipts[old_token_id]
                        self.data.token_receipts[old_token_id] = sp.record(
                            owner=old_receipt.owner,
                            tier_id=old_receipt.tier_id,
                            drop_id=old_receipt.drop_id,
                            edition=old_receipt.edition,
                            minted_at=old_receipt.minted_at,
                            paid_through=current.paid_through,
                            metadata_uri=old_receipt.metadata_uri,
                            art_hash=old_receipt.art_hash,
                            terms_uri=old_receipt.terms_uri,
                            utility_units=old_receipt.utility_units,
                            payment_ref=old_receipt.payment_ref,
                            status=sp.nat(1),
                        )
                        preserved_count += 1
                    else:
                        old_receipt = self.data.token_receipts[old_token_id]
                        self.data.token_receipts[old_token_id] = sp.record(
                            owner=old_receipt.owner,
                            tier_id=old_receipt.tier_id,
                            drop_id=old_receipt.drop_id,
                            edition=old_receipt.edition,
                            minted_at=old_receipt.minted_at,
                            paid_through=current.paid_through,
                            metadata_uri=old_receipt.metadata_uri,
                            art_hash=old_receipt.art_hash,
                            terms_uri=old_receipt.terms_uri,
                            utility_units=old_receipt.utility_units,
                            payment_ref=old_receipt.payment_ref,
                            status=sp.nat(2),
                        )
                        self.data.ledger[(sp.sender, old_token_id)] = 0
                        replaced_count += 1
                    token_id = self.data.next_membership_token_id
            else:
                assert params.action != 2, "NO_TOKEN_TO_PRESERVE"

            extra_seconds = sp.to_int(params.periods * tier.period_seconds)
            paid_through = sp.add_seconds(paid_start, extra_seconds)
            utility_units = previous_utility + (params.periods * tier.utility_units_per_period)

            if should_mint:
                edition = drop.edition_count + 1
                self.data.next_membership_token_id += 1
                self.data.drops[self.data.current_drop_id] = sp.record(
                    metadata_uri=drop.metadata_uri,
                    art_hash=drop.art_hash,
                    terms_uri=drop.terms_uri,
                    edition_count=edition,
                    active=drop.active,
                )
                self.data.membership_token_owners[token_id] = sp.sender
                self.data.ledger[(sp.sender, token_id)] = 1
                self.data.token_receipts[token_id] = sp.record(
                    owner=sp.sender,
                    tier_id=params.tier_id,
                    drop_id=self.data.current_drop_id,
                    edition=edition,
                    minted_at=sp.now,
                    paid_through=paid_through,
                    metadata_uri=drop.metadata_uri,
                    art_hash=drop.art_hash,
                    terms_uri=drop.terms_uri,
                    utility_units=utility_units,
                    payment_ref=params.payment_ref,
                    status=sp.nat(0),
                )
                sp.emit(
                    sp.record(
                        member=sp.sender,
                        tier_id=params.tier_id,
                        token_id=token_id,
                        drop_id=self.data.current_drop_id,
                        edition=edition,
                        minted_at=sp.now,
                        metadata_uri=drop.metadata_uri,
                    ),
                    tag="membership_token_minted",
                )
            else:
                receipt = self.data.token_receipts[token_id]
                self.data.token_receipts[token_id] = sp.record(
                    owner=receipt.owner,
                    tier_id=receipt.tier_id,
                    drop_id=receipt.drop_id,
                    edition=receipt.edition,
                    minted_at=receipt.minted_at,
                    paid_through=paid_through,
                    metadata_uri=receipt.metadata_uri,
                    art_hash=receipt.art_hash,
                    terms_uri=receipt.terms_uri,
                    utility_units=utility_units,
                    payment_ref=params.payment_ref,
                    status=sp.nat(0),
                )

            self.data.members[key] = sp.record(
                active_token_id=token_id,
                paid_through=paid_through,
                utility_units=utility_units,
                payment_count=previous_count + 1,
                preserved_count=preserved_count,
                replaced_count=replaced_count,
                last_payment_ref=params.payment_ref,
                last_payment_at=sp.now,
                last_action=params.action,
            )
            self.data.utility_balances[sp.sender] = self.data.utility_balances.get(sp.sender, default=sp.nat(0)) + (params.periods * tier.utility_units_per_period)
            self.data.tier_utility_balances[key] = utility_units
            if key in self.data.naughty_list:
                del self.data.naughty_list[key]

            sp.send(self.data.treasury, sp.amount)
            sp.emit(
                sp.record(
                    member=sp.sender,
                    tier_id=params.tier_id,
                    payment_ref=params.payment_ref,
                    periods=params.periods,
                    amount=sp.amount,
                    action=params.action,
                    token_id=token_id,
                    old_token_id=old_token_id,
                    has_previous=has_previous,
                    minted_new=minted_new,
                    paid_through=paid_through,
                    utility_units=utility_units,
                    drop_id=self.data.current_drop_id,
                ),
                tag="dues_paid",
            )

        @sp.entrypoint
        def mark_arrears(self, member):
            sp.cast(member, sp.address)
            assert sp.sender == self.data.admin, "ADMIN_ONLY"
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            key = (member, sp.nat(0))
            assert key in self.data.members, "NO_MEMBER"
            current = self.data.members[key]
            assert sp.add_seconds(current.paid_through, sp.to_int(self.data.grace_period_seconds)) < sp.now, "NOT_IN_ARREARS"
            self.data.naughty_list[key] = sp.now
            sp.emit(
                sp.record(
                    member=member,
                    tier_id=sp.nat(0),
                    paid_through=current.paid_through,
                    marked_at=sp.now,
                ),
                tag="member_arrears_marked",
            )

        @sp.entrypoint
        def mark_tier_arrears(self, params):
            sp.cast(params, sp.record(member=sp.address, tier_id=sp.nat))
            assert sp.sender == self.data.admin, "ADMIN_ONLY"
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            key = (params.member, params.tier_id)
            assert key in self.data.members, "NO_MEMBER"
            current = self.data.members[key]
            assert sp.add_seconds(current.paid_through, sp.to_int(self.data.grace_period_seconds)) < sp.now, "NOT_IN_ARREARS"
            self.data.naughty_list[key] = sp.now
            sp.emit(
                sp.record(
                    member=params.member,
                    tier_id=params.tier_id,
                    paid_through=current.paid_through,
                    marked_at=sp.now,
                ),
                tag="member_arrears_marked",
            )

        @sp.entrypoint
        def clear_arrears(self, member):
            sp.cast(member, sp.address)
            assert sp.sender == self.data.admin, "ADMIN_ONLY"
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            key = (member, sp.nat(0))
            if key in self.data.naughty_list:
                del self.data.naughty_list[key]
            sp.emit(sp.record(member=member, tier_id=sp.nat(0), cleared_at=sp.now), tag="member_arrears_cleared")

        @sp.entrypoint
        def clear_tier_arrears(self, params):
            sp.cast(params, sp.record(member=sp.address, tier_id=sp.nat))
            assert sp.sender == self.data.admin, "ADMIN_ONLY"
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            key = (params.member, params.tier_id)
            if key in self.data.naughty_list:
                del self.data.naughty_list[key]
            sp.emit(sp.record(member=params.member, tier_id=params.tier_id, cleared_at=sp.now), tag="member_arrears_cleared")

        @sp.entrypoint
        def set_tier(self, params):
            sp.cast(
                params,
                sp.record(
                    tier_id=sp.nat,
                    name=sp.string,
                    price=sp.mutez,
                    period_seconds=sp.nat,
                    utility_units_per_period=sp.nat,
                    metadata_uri=sp.string,
                    active=sp.bool,
                ),
            )
            assert sp.sender == self.data.admin, "ADMIN_ONLY"
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert params.period_seconds > 0, "BAD_PERIOD"
            assert params.utility_units_per_period > 0, "ZERO_UTILITY"
            self.data.tiers[params.tier_id] = sp.record(
                name=params.name,
                price=params.price,
                period_seconds=params.period_seconds,
                utility_units_per_period=params.utility_units_per_period,
                metadata_uri=params.metadata_uri,
                active=params.active,
            )
            sp.emit(
                sp.record(
                    tier_id=params.tier_id,
                    price=params.price,
                    period_seconds=params.period_seconds,
                    utility_units_per_period=params.utility_units_per_period,
                    active=params.active,
                ),
                tag="dues_tier_updated",
            )

        @sp.entrypoint
        def set_current_drop(self, params):
            sp.cast(
                params,
                sp.record(
                    drop_id=sp.nat,
                    metadata_uri=sp.string,
                    art_hash=sp.string,
                    terms_uri=sp.string,
                    active=sp.bool,
                ),
            )
            assert sp.sender == self.data.admin, "ADMIN_ONLY"
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            edition_count = sp.nat(0)
            if params.drop_id in self.data.drops:
                edition_count = self.data.drops[params.drop_id].edition_count
            self.data.drops[params.drop_id] = sp.record(
                metadata_uri=params.metadata_uri,
                art_hash=params.art_hash,
                terms_uri=params.terms_uri,
                edition_count=edition_count,
                active=params.active,
            )
            self.data.current_drop_id = params.drop_id
            self.data.metadata_uri = params.metadata_uri
            sp.emit(
                sp.record(
                    drop_id=params.drop_id,
                    metadata_uri=params.metadata_uri,
                    art_hash=params.art_hash,
                    terms_uri=params.terms_uri,
                    edition_count=edition_count,
                    active=params.active,
                ),
                tag="dues_drop_updated",
            )

        @sp.entrypoint
        def set_preserve_fee(self, preserve_fee):
            sp.cast(preserve_fee, sp.mutez)
            assert sp.sender == self.data.admin, "ADMIN_ONLY"
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            self.data.preserve_fee = preserve_fee
            sp.emit(sp.record(preserve_fee=preserve_fee), tag="dues_preserve_fee_updated")

        @sp.entrypoint
        def update_terms(self, params):
            sp.cast(
                params,
                sp.record(
                    treasury=sp.address,
                    monthly_due=sp.mutez,
                    month_seconds=sp.nat,
                    utility_units_per_month=sp.nat,
                    grace_period_seconds=sp.nat,
                    metadata_uri=sp.string,
                ),
            )
            assert sp.sender == self.data.admin, "ADMIN_ONLY"
            assert sp.amount == sp.mutez(0), "NO_TEZ"
            assert params.month_seconds >= 3_600, "BAD_MONTH_SECONDS"
            assert params.utility_units_per_month > 0, "ZERO_UTILITY"
            self.data.treasury = params.treasury
            self.data.monthly_due = params.monthly_due
            self.data.month_seconds = params.month_seconds
            self.data.utility_units_per_month = params.utility_units_per_month
            self.data.grace_period_seconds = params.grace_period_seconds
            self.data.metadata_uri = params.metadata_uri
            self.data.tiers[0] = sp.record(
                name=self.data.club_name,
                price=params.monthly_due,
                period_seconds=params.month_seconds,
                utility_units_per_period=params.utility_units_per_month,
                metadata_uri=params.metadata_uri,
                active=True,
            )
            sp.emit(
                sp.record(
                    monthly_due=params.monthly_due,
                    month_seconds=params.month_seconds,
                    utility_units_per_month=params.utility_units_per_month,
                    grace_period_seconds=params.grace_period_seconds,
                ),
                tag="dues_terms_updated",
            )


main = wtf_club_dues_main


@sp.add_test()
def deploy_wtf_club_dues_template():
    import os

    scenario = sp.test_scenario("deploy_wtf_club_dues_template", main)
    admin = sp.address(
        os.environ.get("WTF_CLUB_DUES_ADMIN", "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt")
    )
    treasury = sp.address(
        os.environ.get("WTF_CLUB_DUES_TREASURY", "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt")
    )
    dues = main.WtfClubDues(
        admin=admin,
        treasury=treasury,
        club_name=os.environ.get("WTF_CLUB_DUES_NAME", "WTF Club"),
        membership_symbol=os.environ.get("WTF_CLUB_DUES_SYMBOL", "DUES"),
        metadata_uri=os.environ.get("WTF_CLUB_DUES_METADATA_URI", ""),
        monthly_due=sp.mutez(int(os.environ.get("WTF_CLUB_DUES_MONTHLY_MUTEZ", "1000000"))),
        month_seconds=sp.nat(int(os.environ.get("WTF_CLUB_DUES_MONTH_SECONDS", "2592000"))),
        utility_units_per_month=sp.nat(int(os.environ.get("WTF_CLUB_DUES_UTILITY_UNITS", "1"))),
        grace_period_seconds=sp.nat(int(os.environ.get("WTF_CLUB_DUES_GRACE_SECONDS", "604800"))),
    )
    scenario += dues
