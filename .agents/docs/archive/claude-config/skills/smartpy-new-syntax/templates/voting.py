# Simple Vote - Example for illustrative purposes only.

import smartpy as sp


@sp.module
def main():
    class SimpleVote(sp.Contract):
        def __init__(self):
            self.data.votes = []

        @sp.entrypoint
        def vote(self, params):
            sp.cast(params.vote, sp.string)
            self.data.votes.push(sp.record(sender=sp.sender, vote=params.vote))


@sp.add_test()
def test():
    scenario = sp.test_scenario("Voting")
    scenario.h1("Voting")
    voter1 = sp.test_account("Voter1")
    # define a contract
    c1 = main.SimpleVote()
    # show its representation
    scenario.h2("Contract")
    scenario += c1
    c1.vote(vote="aaa", _sender=voter1)
