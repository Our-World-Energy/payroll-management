export default function AdminLoading() {
  return (
    <div className="p-4 sm:p-6 md:p-8 animate-pulse">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-3 w-32 bg-slate-200 rounded mb-3" />
        <div className="h-9 w-64 bg-slate-200 rounded" />
      </div>
      {/* Card skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 h-24" />
        ))}
      </div>
      {/* Table skeleton */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 h-12 bg-slate-50" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-100">
            <div className="h-8 w-8 rounded-full bg-slate-100 shrink-0" />
            <div className="h-3 bg-slate-100 rounded w-40" />
            <div className="h-3 bg-slate-100 rounded w-24 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
