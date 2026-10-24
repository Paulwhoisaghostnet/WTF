"""Independent Fraction oracle for approved per-recipient 0.01-unit payouts."""
import itertools
import unittest
from fractions import Fraction


def ranks_for_partition(breaks):
    ranks = [1, 2]
    for next_place, boundary in enumerate(breaks, start=3):
        ranks.append(next_place if boundary else ranks[-1])
    return ranks


def allocate(entry, quantum, ranks, mode="tournament", group_sizes=None):
    if entry <= 0 or entry % quantum:
        raise ValueError("entry must be a positive quantum multiple")
    if (mode == "duel" and (len(ranks) != 2 or ranks.count(1) < 1)) or (mode == "tournament" and not 2 <= len(ranks) <= 8):
        raise ValueError("mode and entrant count must agree")
    pot = entry * len(ranks)
    weights = (100,) if mode == "duel" else (50, 35, 15)
    ideals = [Fraction(pot * n, 100) for n in weights]
    result = []
    sizes = group_sizes or {rank: ranks.count(rank) for rank in ranks}
    for rank in ranks:
        count = sizes[rank]
        if not 1 <= rank <= (2 if mode == "duel" else 8) or count < ranks.count(rank) or rank + count > (3 if mode == "duel" else 9):
            raise ValueError("invalid rank group")
        if any(other != rank and not (other + sizes[other] <= rank or rank + count <= other) for other in ranks):
            raise ValueError("overlapping rank groups")
        if mode == "duel" and (count != ranks.count(rank) or rank != 1 + sum(other < rank for other in ranks)):
            raise ValueError("invalid duel rank")
        combined = sum(ideals[place - 1] for place in range(rank, rank + count) if place <= len(weights))
        result.append(int(combined / count / quantum) * quantum)
    return result, pot - sum(result)


class PayoutProof(unittest.TestCase):
    def test_every_tie_partition_both_assets_and_unbounded_nat(self):
        for breaks in itertools.product((False, True), repeat=6):
            ranks = ranks_for_partition(breaks)
            for quantum in (10000, 1000000):
                # 35% and 15% of eight entries have denominator5. Seven possible
                # tied group sizes give divisors1..7; LCM(5,1..7)=420 entry units
                # exhausts every rounding residue for every valid rank grouping.
                for units in list(range(1, 421)) + [2**53 + 1]:
                    entry = quantum * units
                    amounts, remainder = allocate(entry, quantum, ranks)
                    self.assertEqual(sum(amounts) + remainder, entry * 8)
                    self.assertTrue(all(a >= 0 and a % quantum == 0 for a in amounts))
                    self.assertGreaterEqual(remainder, 0)
                    self.assertEqual(allocate(entry, quantum, list(reversed(ranks))), (list(reversed(amounts)), remainder))
                    for rank in set(ranks):
                        self.assertEqual(len({a for r, a in zip(ranks, amounts) if r == rank}), 1)
                    # Separate integer implementation used by the contract.
                    for rank, amount in zip(ranks, amounts):
                        count = ranks.count(rank)
                        percent = sum(weight for place, weight in enumerate((50, 35, 15), 1) if rank <= place < rank + count)
                        self.assertEqual(amount, entry * 8 * percent // (100 * count * quantum) * quantum)

    def test_round_tied_share_after_combining_places(self):
        self.assertEqual(allocate(10000, 10000, [1, 2, 3, 4, 5, 6, 7, 8]), ([40000, 20000, 10000, 0, 0, 0, 0, 0], 10000))
        self.assertEqual(allocate(10000, 10000, [1, 2, 2, 4, 5, 6, 7, 8]), ([40000, 20000, 20000, 0, 0, 0, 0, 0], 0))
        self.assertEqual(allocate(1000000, 1000000, [1, 2, 3, 3, 5, 6, 7, 8]), ([4000000, 2000000, 0, 0, 0, 0, 0, 0], 2000000))
        self.assertEqual(allocate(10000, 10000, [1, 1, 3, 4, 5, 6, 7, 8]), ([30000, 30000, 10000, 0, 0, 0, 0, 0], 10000))

    def test_duel_winner_and_exact_tie_for_both_assets(self):
        for quantum in (10000, 1000000):
            for units in (1, 2, 9, 2**53 + 1):
                entry = quantum * units
                self.assertEqual(allocate(entry, quantum, [1, 2], "duel"), ([entry * 2, 0], 0))
                self.assertEqual(allocate(entry, quantum, [1, 1], "duel"), ([entry, entry], 0))

    def test_ai_places_and_mixed_ties_return_unclaimed_shares_to_treasury(self):
        for quantum in (10000, 1000000):
            for humans in range(2, 9):
                pot = 10 * quantum * humans
                ranks = list(range(9 - humans, 9))
                amounts, treasury = allocate(10 * quantum, quantum, ranks)
                self.assertEqual(sum(amounts) + treasury, pot)
                self.assertEqual(amounts, [pot * (50, 35, 15)[rank - 1] // 100 // quantum * quantum if rank <= 3 else 0 for rank in ranks])
            self.assertEqual(allocate(10 * quantum, quantum, [2, 5], group_sizes={2: 2, 5: 1}), ([5 * quantum, 0], 15 * quantum))

    def test_entry_quantum_and_invalid_competition_ranks(self):
        for quantum in (10000, 1000000):
            for entry in (0, quantum - 1, quantum + 1):
                with self.assertRaises(ValueError):
                    allocate(entry, quantum, list(range(1, 9)))
            for ranks in ([1, 2, 2, 3, 5, 6, 7, 8], [1, 1, 2, 4, 5, 6, 7, 8], [1]):
                with self.assertRaises(ValueError):
                    allocate(quantum, quantum, ranks)


if __name__ == "__main__":
    unittest.main()
