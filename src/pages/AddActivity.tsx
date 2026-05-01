import ActivityForm from "@/components/ActivityForm";

export default function AddActivity() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Add activity</h1>
        <p className="text-sm text-muted-foreground mt-1">Record one job search action. Save first, then attach proof.</p>
      </header>
      <div className="ct-card p-6">
        <ActivityForm />
      </div>
    </div>
  );
}
