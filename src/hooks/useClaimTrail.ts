import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Activity, ClaimWeek, EvidenceFile, Profile, getWeekRange, isoDate, isActivityComplete } from "@/lib/claimtrail";
import { toast } from "sonner";

/* ---------- Profile ---------- */
export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export function useUpdateProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Settings saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/* ---------- Claim weeks ---------- */
export async function ensureClaimWeek(userId: string, date: Date, startDay: number, requiredCount: number): Promise<ClaimWeek> {
  const { start, end } = getWeekRange(date, startDay);
  const startISO = isoDate(start);
  const endISO = isoDate(end);
  const { data: existing } = await supabase
    .from("claim_weeks")
    .select("*")
    .eq("user_id", userId)
    .eq("start_date", startISO)
    .maybeSingle();
  if (existing) return existing as ClaimWeek;
  const { data, error } = await supabase
    .from("claim_weeks")
    .insert({ user_id: userId, start_date: startISO, end_date: endISO, required_activity_count: requiredCount })
    .select()
    .single();
  if (error) throw error;
  return data as ClaimWeek;
}

export function useClaimWeeks() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["weeks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_weeks")
        .select("*")
        .eq("user_id", user!.id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as ClaimWeek[];
    },
  });
}

/* ---------- Activities ---------- */
export function useActivities() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["activities", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("user_id", user!.id)
        .order("date", { ascending: false });
      if (error) throw error;
      return data as Activity[];
    },
  });
}

export function useSaveActivity() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Activity> & { id?: string }) => {
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase.from("profiles").select("week_start_day, weekly_goal").eq("id", user.id).single();
      const startDay = profile?.week_start_day ?? 0;
      const goal = profile?.weekly_goal ?? 3;
      const week = await ensureClaimWeek(user.id, new Date(input.date! + "T00:00:00"), startDay, goal);
      const payload = {
        user_id: user.id,
        claim_week_id: week.id,
        date: input.date!,
        activity_type: input.activity_type!,
        company_name: input.company_name ?? null,
        job_title: input.job_title ?? null,
        job_url: input.job_url ?? null,
        contact_name: input.contact_name ?? null,
        contact_email: input.contact_email ?? null,
        contact_phone: input.contact_phone ?? null,
        method: input.method ?? null,
        status: input.status ?? null,
        notes: input.notes ?? null,
        contact_type: input.contact_type ?? null,
        employer_address: input.employer_address ?? null,
        employer_city: input.employer_city ?? null,
        employer_state: input.employer_state ?? null,
        employer_website: input.employer_website ?? null,
        employer_phone: input.employer_phone ?? null,
        is_complete: isActivityComplete(input),
      };
      if (input.id) {
        const { data, error } = await supabase.from("activities").update(payload).eq("id", input.id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from("activities").insert(payload).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["weeks"] });
      toast.success("Activity saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Activity deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/* ---------- Evidence files ---------- */
export function useEvidence(activityId?: string) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["evidence", user?.id, activityId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("evidence_files").select("*").eq("user_id", user!.id).order("uploaded_at", { ascending: false });
      if (activityId) q = q.eq("activity_id", activityId);
      const { data, error } = await q;
      if (error) throw error;
      return data as EvidenceFile[];
    },
  });
}

export function useUploadEvidence() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ activityId, file }: { activityId: string; file: File }) => {
      if (!user) throw new Error("Not signed in");
      const path = `${user.id}/${activityId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("evidence").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from("evidence_files").insert({
        user_id: user.id,
        activity_id: activityId,
        file_name: file.name,
        file_type: file.type,
        storage_path: path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evidence"] });
      toast.success("Evidence uploaded");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: EvidenceFile) => {
      await supabase.storage.from("evidence").remove([file.storage_path]);
      const { error } = await supabase.from("evidence_files").delete().eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evidence"] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export async function getEvidenceSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from("evidence").createSignedUrl(path, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}
