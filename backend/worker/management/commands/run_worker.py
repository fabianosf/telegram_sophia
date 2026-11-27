import asyncio

from django.core.management.base import BaseCommand

from worker.engine import WorkerEngine


class Command(BaseCommand):
    help = "Run the TelegramSophia asyncio worker loop."

    def add_arguments(self, parser):
        parser.add_argument(
            "--once",
            action="store_true",
            help="Claim and process due schedules once, then exit.",
        )
        parser.add_argument(
            "--idle-seconds",
            type=float,
            default=180,
            help="Disconnect cached Telethon clients after this idle period.",
        )

    def handle(self, *args, **options):
        engine = WorkerEngine(idle_seconds=options["idle_seconds"])
        if options["once"]:
            asyncio.run(engine.tick(wait_tasks=True, recover_stuck=True))
            self.stdout.write(self.style.SUCCESS("Worker tick finished."))
            return
        self.stdout.write(self.style.SUCCESS("Worker started."))
        try:
            asyncio.run(engine.run_forever())
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("Worker stopped."))
