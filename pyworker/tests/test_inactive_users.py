from pyworker.tasks import inactive_users as task_module


def test_a_failed_deletion_is_not_counted(monkeypatch):
    users = [
        {"id": 1, "name": "gone", "scheduledDeletionAt": "2026-01-01"},
        {"id": 2, "name": "stuck", "scheduledDeletionAt": "2026-01-01"},
    ]
    monkeypatch.setattr(task_module, "run_db_query", lambda query, params: users)

    def fake_delete(user_id):
        if user_id == 2:
            raise RuntimeError("delete_user_account failed")

    monkeypatch.setattr(task_module, "delete_user_account", fake_delete)
    task = task_module.InactiveUsersTask()
    assert task._delete_scheduled_accounts() == 1
