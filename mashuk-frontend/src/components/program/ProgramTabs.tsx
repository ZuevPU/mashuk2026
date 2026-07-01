import React from 'react';
import '../../style.css';

interface ProgramTabsProps {
  activeTab: 'sched' | 'kb';
  onTabChange: (tab: 'sched' | 'kb') => void;
}

export const ProgramTabs: React.FC<ProgramTabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="m-prog-subtabs">
      <button 
        className={`m-pst ${activeTab === 'sched' ? 'on' : ''}`} 
        onClick={() => onTabChange('sched')}
      >📋 Расписание</button>
      <button 
        className={`m-pst ${activeTab === 'kb' ? 'on' : ''}`} 
        onClick={() => onTabChange('kb')}
      >📚 База знаний</button>
    </div>
  );
};
