import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  disabled?: boolean;
};

const variants = {
  primary: "erp-btn-primary",
  secondary: "erp-btn-secondary",
  danger: "erp-btn-ghost text-red-600 border-red-300/40 bg-red-500/5",
  ghost: "erp-btn-ghost",
};

export default function MobileActionButton({
  children,
  onClick,
  variant = "secondary",
  className = "",
  disabled,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`erp-btn text-sm py-3 ${variants[variant]} ${className} disabled:opacity-50`}
    >
      {children}
    </button>
  );
}
