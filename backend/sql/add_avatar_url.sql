-- Add avatar_url column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create storage bucket for avatars (run this in Supabase Dashboard > Storage > New Bucket)
-- Bucket name: avatars
-- Public: true (so images are accessible via URL)
-- File size limit: 2MB
-- Allowed mime types: image/jpeg, image/png, image/webp, image/gif

-- If using SQL to insert the bucket (Supabase internal):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policy: allow authenticated users to update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Storage policy: anyone can read avatars (public bucket)
CREATE POLICY "Public avatar read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Storage policy: service role can do anything (for admin uploads)
CREATE POLICY "Service role full access on avatars"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');
