import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DashboardCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  className?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export function DashboardCard({
  title,
  value,
  description,
  icon,
  className,
  trend,
  trendValue,
  variant = 'default'
}: DashboardCardProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case 'success':
        return 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200';
      case 'warning':
        return 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200';
      case 'danger':
        return 'bg-gradient-to-br from-red-50 to-rose-50 border-red-200';
      default:
        return 'bg-gradient-card border-border';
    }
  };

  const getTrendClasses = () => {
    switch (trend) {
      case 'up':
        return 'text-success';
      case 'down':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border shadow-card hover:shadow-card-hover transition-all duration-300 p-6 animate-scale-in',
        getVariantClasses(),
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline space-x-2">
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {trendValue && (
              <span className={cn('text-sm font-medium', getTrendClasses())}>
                {trend === 'up' && '+'}
                {trendValue}
              </span>
            )}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {icon && (
          <div className={cn(
            'w-12 h-12 rounded-lg flex items-center justify-center',
            variant === 'success' && 'bg-success/10 text-success',
            variant === 'warning' && 'bg-warning/10 text-warning',
            variant === 'danger' && 'bg-destructive/10 text-destructive',
            variant === 'default' && 'bg-primary/10 text-primary'
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}