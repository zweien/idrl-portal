-- Soft-ban support: a non-null disabledAt means the user is banned and cannot
-- log in or call protected APIs (enforced in the auth callbacks + requireUser).
ALTER TABLE "User" ADD COLUMN "disabledAt" DATETIME;
