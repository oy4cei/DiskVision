import React from 'react';
import { Search, X, List, Grid, PieChart } from '../Icons';
import { getCategoryColor, getCategoryDisplayName } from '../utils';

const Header = React.memo(function Header({
  breadcrumbs,
  enterDirectory,
  searchQuery,
  setSearchQuery,
  isScanning,
  handleCancelScan,
  currentView,
  setView,
  hasData,
  selectedCategory,
  setSelectedCategory,
}) {
  return (
    <div className="toolbar">
      <div className="breadcrumbs" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={crumb.id}>
            {idx > 0 && <span className="breadcrumb-sep">/</span>}
            <span 
              className={`breadcrumb-item ${idx === breadcrumbs.length - 1 ? 'active' : ''}`}
              onClick={() => idx < breadcrumbs.length - 1 && enterDirectory(crumb.id)}
            >
              {crumb.name}
            </span>
          </React.Fragment>
        ))}

        {selectedCategory && (
          <div className="category-filter-pill" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'linear-gradient(135deg, rgba(79, 141, 247, 0.14), rgba(124, 110, 245, 0.1))',
            border: '1px solid rgba(79, 141, 247, 0.3)',
            borderRadius: '6px',
            padding: '3px 8px 3px 6px',
            fontSize: '11.5px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginLeft: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>
            <span style={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              background: getCategoryColor(selectedCategory) 
            }} />
            <span>Filter: {getCategoryDisplayName(selectedCategory)}</span>
            <button 
              onClick={() => setSelectedCategory(null)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                padding: '1px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'var(--text-primary)',
                marginLeft: '4px',
                cursor: 'pointer',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(248, 113, 113, 0.25)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
              title="Reset filter"
            >
              <X size={10} />
            </button>
          </div>
        )}
      </div>

      <div className="toolbar-actions">
        <div className="search-container">
          <Search className="search-icon" size={13} />
          <input
            type="text"
            className="search-input"
            placeholder="Filter by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')} 
              style={{ position: 'absolute', right: '8px', color: 'var(--text-secondary)' }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {hasData && (
          <div className="view-switcher">
            <button 
              className={`view-switcher-btn ${currentView === 'table' ? 'active' : ''}`}
              onClick={() => setView('table')}
              title="Table View"
            >
              <List size={14} />
            </button>
            <button 
              className={`view-switcher-btn ${currentView === 'treemap' ? 'active' : ''}`}
              onClick={() => setView('treemap')}
              title="Bento Treemap View"
            >
              <Grid size={14} />
            </button>
            <button 
              className={`view-switcher-btn ${currentView === 'sunburst' ? 'active' : ''}`}
              onClick={() => setView('sunburst')}
              title="Sunburst Disk View"
            >
              <PieChart size={14} />
            </button>
          </div>
        )}

        {isScanning && (
          <button className="cancel-scan-btn" onClick={handleCancelScan}>
            <X size={12} />
            Cancel
          </button>
        )}
      </div>
    </div>
  );
})

export default Header;

