"use client";

type Props = {
  title: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

export default function IntegrationModuleToggle({
  title,
  description,
  enabled,
  onChange,
}: Props) {
  return (
    <label
      className={`flex items-center justify-between gap-4 rounded-xl border-2 px-4 py-4 cursor-pointer transition-colors ${
        enabled
          ? "border-emerald-300 bg-emerald-50/80"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
        <p
          className={`text-xs font-bold uppercase tracking-wide mt-2 ${
            enabled ? "text-emerald-700" : "text-slate-400"
          }`}
        >
          {enabled ? "Modül açık" : "Modül kapalı"}
        </p>
      </div>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-6 h-6 shrink-0 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
      />
    </label>
  );
}
