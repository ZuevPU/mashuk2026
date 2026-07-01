import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = '📭', title, subtitle }) => (
  <div className="m-empty">
    <div className="m-empty-icon">{icon}</div>
    <div className="m-empty-title">{title}</div>
    {subtitle && <div className="m-empty-sub">{subtitle}</div>}
  </div>
);
