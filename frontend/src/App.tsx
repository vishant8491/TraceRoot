import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from './store';
import { Header } from './components/Header';
import { InvestigationSidebar } from './components/InvestigationSidebar';
import { InvestigationWorkspace } from './components/InvestigationWorkspace';
import { AiAssistantPanel } from './components/AiAssistantPanel';
import { EvidenceExcerptModal } from './components/EvidenceExcerptModal';
import { ConflictRecoveryModal } from './components/ConflictRecoveryModal';
import { useThemeSync } from './hooks/useThemeSync';

export const App: React.FC = () => {
  // Activate global theme synchronization (OS listener, storage event, DOM attributes)
  useThemeSync();

  const { isDirty } = useSelector((state: RootState) => state.investigation);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileAssistantOpen, setIsMobileAssistantOpen] = useState(false);

  // Warn before leaving unsaved changes in browser tab
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes in your RCA draft. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  return (
    <div className="app-shell">
      {/* Top Application Header */}
      <Header
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        onToggleMobileAssistant={() => setIsMobileAssistantOpen((prev) => !prev)}
        isMobileAssistantOpen={isMobileAssistantOpen}
      />

      {/* 3-Column Professional Investigation Workspace Layout */}
      <div className="workspace-layout-3col">
        {/* Left Column: Compact Investigation Navigation Sidebar */}
        <InvestigationSidebar />

        {/* Center Column: RCA Investigation Workspace */}
        <InvestigationWorkspace />

        {/* Right Column: AI Evidence Assistant (Desktop Sticky) */}
        <AiAssistantPanel />
      </div>

      {/* Mobile / Tablet Left Navigation Drawer */}
      {isMobileSidebarOpen && (
        <div
          className="drawer-overlay"
          style={{ justifyContent: 'flex-start' }}
          onClick={() => setIsMobileSidebarOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Investigations navigation drawer"
        >
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <InvestigationSidebar
              isMobileDrawer
              onCloseMobileDrawer={() => setIsMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Mobile / Tablet Right AI Assistant Drawer */}
      {isMobileAssistantOpen && (
        <div
          className="drawer-overlay"
          style={{ justifyContent: 'flex-end' }}
          onClick={() => setIsMobileAssistantOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="AI Evidence Assistant drawer"
        >
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <AiAssistantPanel
              isMobileDrawer
              onCloseMobileDrawer={() => setIsMobileAssistantOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Deterministic Evidence Excerpt Inspector Modal */}
      <EvidenceExcerptModal />

      {/* 409 Concurrency Save Conflict Recovery Modal */}
      <ConflictRecoveryModal />

    </div>
  );
};

export default App;
