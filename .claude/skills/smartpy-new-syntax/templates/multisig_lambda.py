import smartpy as sp


@sp.module
def main():
    operation_lambda: type = sp.lambda_(sp.unit, sp.unit, with_operations=True)

    class MultisigLambda(sp.Contract):
        """Multiple members vote for executing lambdas.

        This contract can be originated with a list of addresses and a number of
        required votes. Any member can submit as much lambdas as he wants and vote
        for active proposals. When a lambda reaches the required votes, its code is
        called and the output operations are executed. This allows this contract to
        do anything that a contract can do: transferring tokens, managing assets,
        administrating another contract...

        When a lambda is applied, all submitted lambdas until now are inactivated.
        The members can still submit new lambdas.
        """

        def __init__(self, members: sp.set[sp.address], required_votes: sp.nat):
            """Constructor

            Args:
                members (sp.set of sp.address): people who can submit and vote
                    for lambda.
                required_votes (sp.nat): number of votes required
            """
            assert required_votes <= sp.len(
                members
            ), "required_votes must be <= len(members)"
            self.data.lambdas = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, operation_lambda]
            )
            self.data.votes = sp.cast(
                sp.big_map(), sp.big_map[sp.nat, sp.set[sp.address]]
            )
            self.data.nextId = 0
            self.data.inactiveBefore = 0
            self.data.members = members
            self.data.required_votes = required_votes

        @sp.entrypoint
        def submit_lambda(self, lambda_):
            """Submit a new lambda to the vote.

            Submitting a proposal does not imply casting a vote in favour of it.

            Args:
                lambda_(sp.lambda with operations): lambda proposed to vote.
            Raises:
                `You are not a member`
            """
            assert sp.sender in self.data.members, "You are not a member"
            self.data.lambdas[self.data.nextId] = lambda_
            self.data.votes[self.data.nextId] = set()
            self.data.nextId += 1

        @sp.entrypoint
        def vote_lambda(self, id):
            """Vote for a lambda.

            Args:
                id(sp.nat): id of the lambda to vote for.
            Raises:
                `You are not a member`, `The lambda is inactive`, `Lambda not found`

            There is no vote against or pass. If someone disagrees with a lambda
            they can avoid to vote.
            """
            assert sp.sender in self.data.members, "You are not a member"
            assert id >= self.data.inactiveBefore, "The lambda is inactive"
            assert id in self.data.lambdas, "Lambda not found"
            self.data.votes[id].add(sp.sender)
            if sp.len(self.data.votes[id]) >= self.data.required_votes:
                self.data.lambdas[id]()
                self.data.inactiveBefore = self.data.nextId

        @sp.onchain_view()
        def get_lambda(self, id):
            """Return the corresponding lambda.

            Args:
                id (sp.nat): id of the lambda to get.

            Return:
                pair of the lambda and a boolean showing if the lambda is active.
            """
            return (self.data.lambdas[id], id >= self.data.inactiveBefore)


# if "main" in __name__:


@sp.module
def test():
    class Administrated(sp.Contract):
        def __init__(self, admin):
            self.data.admin = admin
            self.data.value = sp.int(0)

        @sp.entrypoint
        def set_value(self, value):
            assert sp.sender == self.data.admin
            self.data.value = value

    @sp.effects(with_operations=True)
    def f(param: sp.pair[sp.address, sp.unit]):
        to_ = sp.fst(param)
        administrated = sp.contract(sp.int, to_, entrypoint="set_value")
        sp.transfer(sp.int(42), sp.tez(0), administrated.unwrap_some())


@sp.add_test()
def basic_scenario():
    """Use the multisigLambda as an administrator of an example contract.

    Tests:
    - Origination
    - Lambda submission
    - Lambda vote
    """
    sc = sp.test_scenario("MultisigLambda basic scenario")
    sc.h1("Basic scenario.")

    member1 = sp.test_account("member1")
    member2 = sp.test_account("member2")
    member3 = sp.test_account("member3")
    members = {member1.address, member2.address, member3.address}

    sc.h2("MultisigLambda: origination")
    c1 = main.MultisigLambda(members, 2)
    sc += c1

    sc.h2("Administrated: origination")
    c2 = test.Administrated(c1.address)
    sc += c2

    if sc.simulation_mode() is sp.SimulationMode.MOCKUP:
        sc.p("lambdas dont work in mockups")
        return

    sc.h2("MultisigLambda: submit_lambda")
    lambda_ = test.f.apply(c2.address)
    c1.submit_lambda(lambda_, _sender=member1)

    sc.h2("MultisigLambda: vote_lambda")
    c1.vote_lambda(0, _sender=member1)
    c1.vote_lambda(0, _sender=member2)

    # We can check that the administrated contract received the transfer.
    sc.verify(c2.data.value == 42)
