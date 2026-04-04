import { LoaderCircle } from "lucide-react";

export function LoadingState({ title = "Loading operational data", description = "Pulling the latest fleet feed..." }) {
  return (
    <div className="panel flex min-h-[260px] flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-aqua/15 text-ink-900">
        <LoaderCircle className="h-6 w-6 animate-spin" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
        <p className="mt-2 max-w-lg text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}
