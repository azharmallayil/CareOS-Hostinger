import React, { type ReactNode } from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "bordered" | "elevated" | "flat";
  padding?: "none" | "sm" | "md" | "lg";
}

export function Card({
  children,
  variant = "bordered",
  padding = "md",
  className = "",
  ...props
}: CardProps) {
  const variantStyles = {
    bordered: "bg-white border border-neutral-200 rounded-xl shadow-xs",
    elevated: "bg-white border border-neutral-100 rounded-xl shadow-sm",
    flat: "bg-neutral-50 rounded-xl border border-neutral-200",
  };

  const paddingStyles = {
    none: "",
    sm: "p-3",
    md: "p-5",
    lg: "p-6",
  };

  return (
    <div
      className={`${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 pb-4 border-b border-neutral-100 ${className}`}>
      <div>
        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        {description && <p className="mt-1 text-xs text-neutral-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
