import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
};

export default function PageHeader({ title, subtitle, action, className = "" }: Props) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="min-w-0">
        <h1 className="erp-page-title">{title}</h1>
        {subtitle ? <p className="text-sm erp-muted mt-1">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2 shrink-0">{action}</div> : null}
    </div>
  );
}
