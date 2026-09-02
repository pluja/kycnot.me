"""
Tests for task modules.
"""

import unittest

from pyworker.cli import (
    group_task_schedules,
    is_disabled_schedule,
    should_use_scheduler_task_instance,
)


class TestWorkerSchedules(unittest.TestCase):
    def test_detects_disabled_cron_values(self):
        for value in ("", "disabled", "DISABLED", " off ", "false", "none"):
            self.assertTrue(is_disabled_schedule(value))

    def test_keeps_regular_cron_values_enabled(self):
        self.assertFalse(is_disabled_schedule("0 0 * * *"))

    def test_skips_scheduler_instances_for_function_backed_tasks(self):
        self.assertFalse(should_use_scheduler_task_instance("deep_scan"))
        self.assertFalse(should_use_scheduler_task_instance("service_score_recalc_all"))
        self.assertTrue(should_use_scheduler_task_instance("user_sentiment"))

    def test_missing_cron_values_are_not_scheduled(self):
        enabled_schedules, disabled_task_names = group_task_schedules(
            {
                "deep_scan": "* * * * *",
                "user_sentiment": "off",
            }
        )

        self.assertEqual(enabled_schedules, {"deep_scan": "* * * * *"})
        self.assertEqual(disabled_task_names, ["user_sentiment"])
