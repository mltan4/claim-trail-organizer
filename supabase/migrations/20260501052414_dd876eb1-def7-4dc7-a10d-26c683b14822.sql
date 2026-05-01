
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  state TEXT NOT NULL DEFAULT 'Washington',
  weekly_goal INT NOT NULL DEFAULT 3,
  week_start_day INT NOT NULL DEFAULT 0, -- 0=Sunday
  reminder_day INT NOT NULL DEFAULT 6,    -- 6=Saturday
  reminder_time TEXT NOT NULL DEFAULT '18:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generic updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- CLAIM WEEKS
CREATE TABLE public.claim_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  required_activity_count INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, start_date)
);
ALTER TABLE public.claim_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own weeks all" ON public.claim_weeks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX claim_weeks_user_idx ON public.claim_weeks(user_id, start_date);

-- ACTIVITIES
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_week_id UUID REFERENCES public.claim_weeks(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  activity_type TEXT NOT NULL,
  company_name TEXT,
  job_title TEXT,
  job_url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  method TEXT,
  status TEXT,
  notes TEXT,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activities all" ON public.activities FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX activities_user_date_idx ON public.activities(user_id, date DESC);
CREATE INDEX activities_week_idx ON public.activities(claim_week_id);
CREATE TRIGGER activities_touch BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- EVIDENCE FILES
CREATE TABLE public.evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.evidence_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own evidence all" ON public.evidence_files FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX evidence_activity_idx ON public.evidence_files(activity_id);

-- EXPORTS
CREATE TABLE public.exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_week_id UUID REFERENCES public.claim_weeks(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own exports all" ON public.exports FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- STORAGE BUCKET for evidence (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "evidence read own" ON storage.objects FOR SELECT
  USING (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "evidence insert own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "evidence update own" ON storage.objects FOR UPDATE
  USING (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "evidence delete own" ON storage.objects FOR DELETE
  USING (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
