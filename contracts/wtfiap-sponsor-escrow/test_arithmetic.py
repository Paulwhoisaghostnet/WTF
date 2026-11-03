"""Independent exact-integer oracle for sponsor room entry-fee accounting."""
import itertools
import unittest
from fractions import Fraction


def allocate(entry, humans, quantum, pool_percent, weights):
    pot = entry * humans
    pool = pot * pool_percent.numerator // pool_percent.denominator
    fee = pot - pool
    weight_total = sum(weights)
    awards = [pool * weight // (weight_total * quantum) * quantum
              for weight in weights] if pool else [0] * len(weights)
    designated = fee * 95 // (100 * quantum) * quantum
    treasury = pot - sum(awards) - designated
    return awards, designated, treasury


class SponsorEntryArithmetic(unittest.TestCase):
    def test_free_rooms_have_no_entry_pool_or_fee_claim(self):
        for quantum in (10000, 1000000):
            awards, designated, treasury = allocate(0, 3, quantum, Fraction(0), [0, 0, 0])
            self.assertEqual((awards, designated, treasury), ([0, 0, 0], 0, 0))

    def test_entry_pool_fee_split_dust_and_atomic_conservation(self):
        for quantum, humans, units, share, weights in itertools.product(
            (10000, 1000000), range(2, 9), (1, 3, 11, 57),
            (Fraction(0), Fraction(1, 4), Fraction(3333, 10000), Fraction(1)),
            ((1,), (3, 2), (50, 35, 15)),
        ):
            entry = quantum * units
            awards, designated, treasury = allocate(entry, humans, quantum, share, weights)
            self.assertEqual(sum(awards) + designated + treasury, entry * humans)
            self.assertTrue(all(amount >= 0 and amount % quantum == 0 for amount in awards))
            self.assertGreaterEqual(treasury, 0)
            self.assertEqual(designated % quantum, 0)
            fee = entry * humans - entry * humans * share.numerator // share.denominator
            self.assertLessEqual(designated, fee * 95 // 100)
            self.assertLess(fee * 95 // 100 - designated, quantum)

    def test_sponsor_assets_and_house_fee_are_separate_liabilities(self):
        awards, designated, treasury = allocate(10000, 3, 10000, Fraction(1, 4), (3, 2))
        sponsor_prizes = (20000, 10000)
        house_fee = 500000
        owed = sum(sponsor_prizes) + sum(awards) + designated + treasury + house_fee
        held = sum(sponsor_prizes) + 3 * 10000 + house_fee
        self.assertEqual(owed, held)
        self.assertEqual((awards, designated, treasury), ([0, 0], 20000, 10000))


if __name__ == "__main__":
    unittest.main()
