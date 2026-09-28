import React, { useState } from 'react';

export interface SectionDetail {
  targetWords: number;
  guidelines: string;
}

export interface SectionBreakdown {
  isCustomized: boolean;
  intro: SectionDetail;
  body: SectionDetail;
  conclusion: SectionDetail;
}

interface TargetWordCountInputProps {
  value: number;
  sections?: SectionBreakdown;
  onChange: (wordCount: number, sections: SectionBreakdown) => void;
}

export const TargetWordCountInput: React.FC<TargetWordCountInputProps> = ({
  value = 2000,
  sections,
  onChange,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Proportional default calculation (10% Intro / 75% Body / 15% Conclusion)
  const computeDefaults = (total: number): SectionBreakdown => {
    const intro = Math.round(total * 0.10);
    const conclusion = Math.round(total * 0.15);
    const body = Math.max(0, total - intro - conclusion);

    return {
      isCustomized: false,
      intro: { targetWords: intro, guidelines: '' },
      body: { targetWords: body, guidelines: '' },
      conclusion: { targetWords: conclusion, guidelines: '' },
    };
  };

  const currentSections = sections || computeDefaults(value);
  const allocatedWords =
    currentSections.intro.targetWords +
    currentSections.body.targetWords +
    currentSections.conclusion.targetWords;
  const isBalanced = allocatedWords === value;

  const handleTotalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTotal = Math.max(0, parseInt(e.target.value, 10) || 0);
    if (nextTotal === value) return;
    if (!currentSections.isCustomized) {
      onChange(nextTotal, computeDefaults(nextTotal));
    } else {
      onChange(nextTotal, currentSections);
    }
  };

  const handleSectionWordChange = (
    key: 'intro' | 'body' | 'conclusion',
    words: number
  ) => {
    const nextWords = Math.max(0, words);
    if (currentSections[key].targetWords === nextWords) return;
    onChange(value, {
      ...currentSections,
      isCustomized: true,
      [key]: {
        ...currentSections[key],
        targetWords: nextWords,
      },
    });
  };

  const handleSectionGuidelineChange = (
    key: 'intro' | 'body' | 'conclusion',
    guidelines: string
  ) => {
    if (currentSections[key].guidelines === guidelines) return;
    onChange(value, {
      ...currentSections,
      isCustomized: true,
      [key]: {
        ...currentSections[key],
        guidelines,
      },
    });
  };

  const handleReset = () => {
    onChange(value, computeDefaults(value));
  };

  const sectionRows: Array<{
    key: 'intro' | 'body' | 'conclusion';
    label: string;
    placeholder: string;
  }> = [
    {
      key: 'intro',
      label: 'Introduction',
      placeholder: 'Hook, thesis statement, key objectives, or background context...',
    },
    {
      key: 'body',
      label: 'Body Paragraphs',
      placeholder: 'Core arguments, comparative analysis, methodology, or required case studies...',
    },
    {
      key: 'conclusion',
      label: 'Conclusion',
      placeholder: 'Main takeaways, strategic implications, limitations, or future scope...',
    },
  ];

  return (
    <div className="w-full max-w-xl space-y-3 font-sans">
      {/* Label */}
      <label className="block text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        Target Word Count <span className="text-red-500">*</span>
      </label>

      {/* Main Total Word Count Input */}
      <div className="relative flex items-center">
        <input
          type="number"
          min={100}
          step={50}
          value={value || ''}
          onChange={handleTotalChange}
          placeholder="2000"
          className="w-full rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-xl font-semibold tracking-tight text-neutral-900 shadow-sm transition placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
        />
        <span className="pointer-events-none absolute right-5 text-sm font-medium text-neutral-400 dark:text-neutral-500">
          words
        </span>
      </div>

      {/* Toggle Row */}
      <div className="flex items-center justify-between px-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span>
          Intro ~{currentSections.intro.targetWords}w · Body ~{currentSections.body.targetWords}w · Concl ~{currentSections.conclusion.targetWords}w
        </span>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="font-medium text-neutral-900 underline underline-offset-4 transition hover:text-neutral-600 dark:text-neutral-200 dark:hover:text-neutral-400"
        >
          {isExpanded ? 'Close section customization' : 'Customize sections'}
        </button>
      </div>

      {/* Inline Section Guidance & Allocation Panel */}
      {isExpanded && (
        <div className="mt-3 space-y-4 rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-5 transition-all dark:border-neutral-800 dark:bg-neutral-900/40">
          {/* Header & Status */}
          <div className="flex items-center justify-between border-b border-neutral-200/60 pb-3 dark:border-neutral-800">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Section Allocations & Instructions
              </h4>
              <p className="mt-0.5 text-xs text-neutral-500">
                Allocated:{' '}
                <span className={isBalanced ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'font-semibold text-amber-600 dark:text-amber-400'}>
                  {allocatedWords}
                </span>{' '}
                / {value} words
              </p>
            </div>
            {currentSections.isCustomized && (
              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-medium text-neutral-500 underline underline-offset-2 transition hover:text-neutral-900 dark:hover:text-neutral-200"
              >
                Reset to default split
              </button>
            )}
          </div>

          {/* Section Rows */}
          <div className="space-y-4">
            {sectionRows.map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                    {label}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <span>Target:</span>
                    <input
                      type="number"
                      min={0}
                      step={25}
                      value={currentSections[key].targetWords}
                      onChange={(e) =>
                        handleSectionWordChange(key, parseInt(e.target.value, 10) || 0)
                      }
                      className="w-20 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-right text-xs font-medium text-neutral-900 shadow-sm focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <span>w</span>
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={currentSections[key].guidelines}
                  onChange={(e) => handleSectionGuidelineChange(key, e.target.value)}
                  placeholder={placeholder}
                  className="w-full resize-none rounded-xl border border-neutral-200 bg-white p-3 text-xs leading-relaxed text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TargetWordCountInput;
