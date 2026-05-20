import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
  className?: string;
};

export default function MobileListCard({
  title,
  subtitle,
  badge,
  meta,
  actions,
  onClick,
  className = "",
}: Props) {
  const Wrapper = onClick ? "button" : "article";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`erp-card w-full text-left p-4 space-y-3 ${onClick ? "active:scale-[0.99] transition-transform" : ""} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[var(--erp-text)] leading-snug">{title}</p>
          {subtitle ? <p className="text-sm erp-muted mt-0.5 truncate">{subtitle}</p> : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap gap-2 text-xs">{meta}</div> : null}
      {actions ? <div className="grid grid-cols-2 gap-2 pt-1">{actions}</div> : null}
    </Wrapper>
  );
}
