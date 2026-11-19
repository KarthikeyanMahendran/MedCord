-- Clean up irrelevant routine (GREEN) case escalation notifications and add index for fast retrieval.

DELETE FROM notifications
WHERE kind = 'CASE_ESCALATED'
  AND (title LIKE 'ESCALATED: GREEN%' OR case_id IN (SELECT id FROM cases WHERE urgency = 'GREEN'));

CREATE INDEX IF NOT EXISTS ix_notifications_user_created ON notifications (user_id, created_at DESC);
