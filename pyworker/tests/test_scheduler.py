"""Tests for scheduler shutdown behavior."""

import unittest
from unittest.mock import MagicMock, patch

from pyworker.scheduler import TaskScheduler


class TestTaskSchedulerShutdown(unittest.TestCase):
    @patch("pyworker.scheduler.close_db_pool")
    def test_stop_closes_pool_after_signal_marks_scheduler_not_running(
        self,
        mock_close_db_pool: MagicMock,
    ):
        scheduler = TaskScheduler()
        scheduler.running = False
        scheduler.threads = [MagicMock()]

        scheduler.stop()

        mock_close_db_pool.assert_called_once_with()
        self.assertEqual(scheduler.threads, [])


if __name__ == "__main__":
    unittest.main()
