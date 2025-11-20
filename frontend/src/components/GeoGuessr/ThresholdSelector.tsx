import React, { useEffect, useState } from 'react';
import { Badge } from '../Shared/Badge';
import './ThresholdSelector.css';

interface ThresholdSelectorProps {
  thresholds: number[];
  selected: number;
  onSelect: (threshold: number) => void;
  isLoading?: boolean;
}

export default function ThresholdSelector({
  thresholds,
  selected,
  onSelect,
  isLoading,
}: ThresholdSelectorProps) {
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    // Auto-scroll to selected threshold
    if (scrollContainer && thresholds.includes(selected)) {
      const index = thresholds.indexOf(selected);
      const itemWidth = 80;
      const scrollLeft = Math.max(0, index * itemWidth - 200);
      scrollContainer.scrollLeft = scrollLeft;
    }
  }, [selected, thresholds, scrollContainer]);

  return (
    <div className="threshold-selector">
      <div className="threshold-label">Select Threshold</div>
      <div className="threshold-scroll" ref={setScrollContainer}>
        <div className="threshold-items">
          {thresholds.map((threshold) => (
            <button
              key={threshold}
              className={`threshold-item ${selected === threshold ? 'active' : ''}`}
              onClick={() => onSelect(threshold)}
              disabled={isLoading}
            >
              {threshold}
            </button>
          ))}
        </div>
      </div>
      <div className="threshold-info">
        <Badge variant="primary" size="md">
          {thresholds.length} thresholds
        </Badge>
        <span className="threshold-current">Currently: {selected}</span>
      </div>
    </div>
  );
}
