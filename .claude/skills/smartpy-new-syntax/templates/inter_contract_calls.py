import smartpy as sp


@sp.module
def main():
    # Worker contract that our Main contract is going to call entrypoints on.
    # Stores a single string ('message'), with entrypoints to allow the string
    # to be overwritten or appended to.
    class Worker(sp.Contract):
        def __init__(self):
            self.data.message = ""

        @sp.entrypoint
        def set_message(self, message):
            self.data.message = message

        @sp.entrypoint
        def append_message(self, message, separator):
            # Only use the separator if the message is currently empty ("")
            if sp.len(self.data.message) == 0:
                self.data.message = message
            else:
                self.data.message = sp.concat([self.data.message, separator, message])

    # the expected args type for the set_message entrypoint
    set_message_args_type: type = sp.string

    # the expected args type for the append_message entrypoint
    append_message_args_type: type = sp.record(message=sp.string, separator=sp.string)

    # The main contract.
    # Calls through to the Worker contract passed by address on init.
    class Main(sp.Contract):
        def __init__(self, worker_contract_address):
            self.data.worker_contract_address = worker_contract_address

        @sp.entrypoint
        def store_single_message(self, message):
            # Prepare the full entrypoint signature.
            # Note that we have to call `.unwrap_some()` in order to open the sp.option[...],
            # as the contract may not exist.
            set_message_entrypoint = sp.contract(
                set_message_args_type, self.data.worker_contract_address, "set_message"
            ).unwrap_some()

            # call the `set_message` entrypoint on the worker contract
            sp.transfer(message, sp.tez(0), set_message_entrypoint)

        @sp.entrypoint
        def append_multiple_messages(self, params):
            sp.cast(params, sp.record(messages=sp.list[sp.string], separator=sp.string))

            # Prepare the full entrypoint signature.
            # Note that, as above, we have to call `.unwrap_some()` in order to open the sp.option[...],
            # as the contract may not exist.
            append_message_entrypoint = sp.contract(
                append_message_args_type,
                self.data.worker_contract_address,
                "append_message",
            ).unwrap_some()

            # call the `append_message` entrypoint on the worker contract once for
            # each string in params.messages
            for message in params.messages:
                append_message_args = sp.record(
                    message=message, separator=params.separator
                )
                sp.transfer(append_message_args, sp.tez(0), append_message_entrypoint)


@sp.add_test()
def test():
    scenario = sp.test_scenario("InterContractCallsExample")
    scenario.h1("Inter-Contract Calls - example")

    # originate the Worker contract and directly invoke it
    scenario.h2("Worker")
    worker_contract = main.Worker()
    scenario += worker_contract
    scenario.h3("Call the Worker contract entrypoints directly")
    scenario.h4("set_message")
    worker_contract.set_message("Directly set a message")
    scenario.verify(worker_contract.data.message == "Directly set a message")
    scenario.h4("append_message")
    worker_contract.append_message(message="and append another", separator=", ")
    scenario.verify(
        worker_contract.data.message == "Directly set a message, and append another"
    )

    # originate the Main contract
    scenario.h2("Main")
    main_contract = main.Main(worker_contract.address)
    scenario += main_contract
    # the main contract calls through to the Worker contract methods
    scenario.h3(
        "Call the Main contract entrypoints, which in turn call through to the Worker contract entrypoints"
    )
    scenario.h4("store_single_message")
    main_contract.store_single_message("Indirectly set a message")
    scenario.verify(worker_contract.data.message == "Indirectly set a message")
    scenario.h4("append_multiple_messages")
    main_contract.append_multiple_messages(
        messages=["and", "append", "some", "more"], separator=", "
    )
    scenario.verify(
        worker_contract.data.message
        == "Indirectly set a message, and, append, some, more"
    )
