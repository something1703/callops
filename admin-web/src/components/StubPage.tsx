interface StubPageProps {
  title: string;
  description: string;
  phase: string;
  icon: React.ReactNode;
  features: string[];
}

/**
 * StubPage — used for Phase 2–4 features that are planned but not yet built.
 * Shows what will live here so the nav structure is meaningful now.
 */
export default function StubPage({
  title,
  description,
  phase,
  icon,
  features,
}: StubPageProps) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center py-16 px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mx-auto mb-6 text-indigo-400">
          {icon}
        </div>

        {/* Phase badge */}
        <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-indigo-600/20 text-indigo-400 mb-4">
          Coming in {phase}
        </span>

        <h1 className="text-2xl font-bold text-white mb-3">{title}</h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-8">{description}</p>

        {/* Feature list */}
        <div className="glass rounded-2xl p-5 text-left space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            What&apos;s planned
          </p>
          {features.map((feature, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
              <p className="text-sm text-gray-400">{feature}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
