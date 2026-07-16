-- Data migration: AttendanceStatus enum rename
-- online → present, busy → absent, offline → absent, leave → leave (unchanged)
-- This is idempotent: only rewrites the old values; new values are untouched.
UPDATE "Person" SET status = 'present' WHERE status = 'online';
UPDATE "Person" SET status = 'absent'  WHERE status IN ('busy', 'offline');
