from worker.management.commands.run_worker import Command as RunWorkerCommand


class Command(RunWorkerCommand):
    help = "Alias for run_worker."
