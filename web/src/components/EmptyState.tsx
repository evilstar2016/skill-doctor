import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Variant = 'default' | 'warning' | 'danger' | 'info';

/**
 * Unified empty-state component (replaces the ad-hoc `.empty-state` /
 * `.empty-rows` markup scattered across pages). Variant only changes the
 * icon tint; text is always present so the state is never color-only.
 */
export function EmptyState({ icon: Icon, title, description, variant = 'default', actions }: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  variant?: Variant;
  actions?: ReactNode;
}) {
  return (
    <div className={`empty-state variant-${variant}`}>
      {Icon && <div className="empty-state-icon"><Icon size={26} /></div>}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {actions && <div className="empty-state-actions">{actions}</div>}
    </div>
  );
}
