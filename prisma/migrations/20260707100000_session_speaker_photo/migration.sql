-- 세션 연사 사진 URL (추가형·멱등)
ALTER TABLE "WebinarSession" ADD COLUMN IF NOT EXISTS "speakerPhotoUrl" TEXT;
