-- Add employer contact info columns to activities for the WA-style form
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS contact_type text,
  ADD COLUMN IF NOT EXISTS employer_address text,
  ADD COLUMN IF NOT EXISTS employer_city text,
  ADD COLUMN IF NOT EXISTS employer_state text,
  ADD COLUMN IF NOT EXISTS employer_website text,
  ADD COLUMN IF NOT EXISTS employer_phone text;

-- Touch updated_at trigger if missing
DROP TRIGGER IF EXISTS activities_touch_updated_at ON public.activities;
CREATE TRIGGER activities_touch_updated_at
BEFORE UPDATE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();